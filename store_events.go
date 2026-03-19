package main

import (
	"fmt"
	"path/filepath"
	"time"
)

// ── Events ────────────────────────────────────────────────────────────────────

func (s *Store) GetEvents(from, to time.Time, layerIDs []int64) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// If no specific layers requested, return all (master + all layers).
	// Layer visibility filtering is done client-side.
	filterLayers := len(layerIDs) > 0
	layerSet := make(map[int64]bool)
	for _, id := range layerIDs {
		layerSet[id] = true
	}

	// Pre-allocate with reasonable estimate to reduce GC pressure at scale
	result := make([]Event, 0, min(len(s.events), 512))
	for _, e := range s.events {
		// Layer filter: only restrict when caller explicitly asks for specific layers
		if filterLayers && e.LayerID != nil {
			if !layerSet[*e.LayerID] {
				continue
			}
		}
		end := e.StartTime
		if e.EndTime != nil {
			end = *e.EndTime
		}
		if !e.StartTime.After(to) && !end.Before(from) {
			result = append(result, e)
		}
	}
	return result
}

// GetEventsInRange returns all events within the given time range (no layer filtering)
func (s *Store) GetEventsInRange(from, to time.Time) []Event {
	return s.GetEvents(from, to, nil)
}

func (s *Store) GetEventByID(id int64) (*Event, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if idx, ok := s.eventByID[id]; ok && idx < len(s.events) && s.events[idx].ID == id {
		e := s.events[idx]
		return &e, true
	}
	// Fallback to linear scan (defensive, in case index is stale)
	for i := range s.events {
		if s.events[i].ID == id {
			e := s.events[i]
			return &e, true
		}
	}
	return nil, false
}

func (s *Store) CreateEvent(e Event) (Event, error) {
	s.mu.Lock()
	s.nextEventID++
	e.ID = s.nextEventID
	now := time.Now()
	e.CreatedAt = now
	e.UpdatedAt = now
	s.events = append(s.events, e)
	s.eventByID[e.ID] = len(s.events) - 1
	snap := append([]Event(nil), s.events...)
	s.mu.Unlock()
	return e, s.persist("events.json", snap)
}

func (s *Store) UpdateEvent(e Event) error {
	s.mu.Lock()
	found := false
	if idx, ok := s.eventByID[e.ID]; ok && idx < len(s.events) && s.events[idx].ID == e.ID {
		e.UpdatedAt = time.Now()
		s.events[idx] = e
		found = true
	} else {
		for i := range s.events {
			if s.events[i].ID == e.ID {
				e.UpdatedAt = time.Now()
				s.events[i] = e
				s.eventByID[e.ID] = i
				found = true
				break
			}
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("event not found")
	}
	snap := append([]Event(nil), s.events...)
	s.mu.Unlock()
	return s.persist("events.json", snap)
}

func (s *Store) DeleteEvent(id int64) error {
	s.mu.Lock()
	found := false
	if idx, ok := s.eventByID[id]; ok && idx < len(s.events) && s.events[idx].ID == id {
		s.events = append(s.events[:idx], s.events[idx+1:]...)
		found = true
	} else {
		for i, e := range s.events {
			if e.ID == id {
				s.events = append(s.events[:i], s.events[i+1:]...)
				found = true
				break
			}
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("event not found")
	}
	// Rebuild index after deletion — splice shifts all subsequent indices
	s.rebuildEventIndex()
	snap := append([]Event(nil), s.events...)
	s.mu.Unlock()
	return s.persist("events.json", snap)
}

// rebuildEventIndex rebuilds the eventByID map from the current slice.
// Caller must hold s.mu (write lock).
func (s *Store) rebuildEventIndex() {
	s.eventByID = make(map[int64]int, len(s.events))
	for i, e := range s.events {
		s.eventByID[e.ID] = i
	}
}

// ── Attachments ───────────────────────────────────────────────────────────────

func (s *Store) GetAttachmentsByEvent(eventID int64) []Attachment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Attachment
	for _, a := range s.attachments {
		if a.EventID == eventID {
			result = append(result, a)
		}
	}
	return result
}

// attachmentCountsLocked returns a map[eventID]count. Caller must hold at least RLock.
func (s *Store) attachmentCounts() map[int64]int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m := make(map[int64]int)
	for _, a := range s.attachments {
		m[a.EventID]++
	}
	return m
}

func (s *Store) GetAttachmentByID(id int64) (*Attachment, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.attachments {
		if s.attachments[i].ID == id {
			a := s.attachments[i]
			return &a, true
		}
	}
	return nil, false
}

func (s *Store) CreateAttachment(a Attachment) (Attachment, error) {
	s.mu.Lock()
	s.nextAttachID++
	a.ID = s.nextAttachID
	a.CreatedAt = time.Now()
	s.attachments = append(s.attachments, a)
	snap := append([]Attachment(nil), s.attachments...)
	s.mu.Unlock()
	return a, s.persist("attachments.json", snap)
}

func (s *Store) DeleteAttachment(id int64) error {
	s.mu.Lock()
	found := false
	for i, a := range s.attachments {
		if a.ID == id {
			s.attachments = append(s.attachments[:i], s.attachments[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("attachment not found")
	}
	snap := append([]Attachment(nil), s.attachments...)
	s.mu.Unlock()
	return s.persist("attachments.json", snap)
}

func (s *Store) AttachmentDir() string {
	return filepath.Join(s.dataDir, "attachments")
}

// ── Event Versioning ──────────────────────────────────────────────────────────

// CreateEventVersion saves a snapshot of the event before a change.
func (s *Store) CreateEventVersion(v EventVersion) (EventVersion, error) {
	s.mu.Lock()
	s.nextEventVersionID++
	v.ID = s.nextEventVersionID
	v.ChangedAt = time.Now()
	// Compute version number for this event
	vNum := 1
	for _, ev := range s.eventVersions {
		if ev.EventID == v.EventID && ev.Version >= vNum {
			vNum = ev.Version + 1
		}
	}
	v.Version = vNum
	s.eventVersions = append(s.eventVersions, v)
	// Cap at 5000 versions total (prune oldest)
	if len(s.eventVersions) > 5000 {
		s.eventVersions = s.eventVersions[len(s.eventVersions)-5000:]
	}
	snap := append([]EventVersion(nil), s.eventVersions...)
	s.mu.Unlock()
	return v, s.persist("event_versions.json", snap)
}

// GetEventVersions returns all versions for a given event ID, newest first.
func (s *Store) GetEventVersions(eventID int64) []EventVersion {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []EventVersion
	for _, v := range s.eventVersions {
		if v.EventID == eventID {
			out = append(out, v)
		}
	}
	// Reverse so newest first
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

// ── Overlap detection ──────────────────────────────────────────────────────────

// OverlapWarning describes a scheduling conflict for a specific user
type OverlapWarning struct {
	UserID    int64  `json:"user_id"`
	UserName  string `json:"user_name"`
	EventID   int64  `json:"event_id"`
	EventTitle string `json:"event_title"`
}

// CheckOverlaps returns warnings for any of the given users (responsible + invited)
// who are already scheduled in events overlapping the given time range.
// excludeEventID is used when editing an event (to exclude itself from the check).
func (s *Store) CheckOverlaps(start time.Time, end *time.Time, responsibleID *int64, invitedUserIDs []int64, excludeEventID int64) []OverlapWarning {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Collect user IDs to check
	checkUsers := map[int64]bool{}
	if responsibleID != nil && *responsibleID > 0 {
		checkUsers[*responsibleID] = true
	}
	for _, uid := range invitedUserIDs {
		if uid > 0 {
			checkUsers[uid] = true
		}
	}
	if len(checkUsers) == 0 {
		return nil
	}

	// Determine event end time (default: start + 1 hour)
	evEnd := start.Add(time.Hour)
	if end != nil && end.After(start) {
		evEnd = *end
	}

	var warnings []OverlapWarning
	seen := map[string]bool{}

	for _, ev := range s.events {
		if ev.ID == excludeEventID {
			continue
		}
		// Compute existing event's end
		existEnd := ev.StartTime.Add(time.Hour)
		if ev.EndTime != nil && ev.EndTime.After(ev.StartTime) {
			existEnd = *ev.EndTime
		}

		// Check time overlap: events overlap if start < other.end && end > other.start
		if !start.Before(existEnd) || !evEnd.After(ev.StartTime) {
			continue
		}

		// Check if any watched user is involved in this overlapping event
		if ev.ResponsibleID != nil && checkUsers[*ev.ResponsibleID] {
			key := fmt.Sprintf("%d-%d", *ev.ResponsibleID, ev.ID)
			if !seen[key] {
				seen[key] = true
				warnings = append(warnings, OverlapWarning{
					UserID:     *ev.ResponsibleID,
					UserName:   ev.ResponsibleName,
					EventID:    ev.ID,
					EventTitle: ev.Title,
				})
			}
		}
		for _, uid := range ev.InvitedUserIDs {
			if checkUsers[uid] {
				key := fmt.Sprintf("%d-%d", uid, ev.ID)
				if !seen[key] {
					seen[key] = true
					// Find user name via O(1) index
					userName := fmt.Sprintf("user#%d", uid)
					if u, ok := s.userByID[uid]; ok {
						userName = u.DisplayName
						if userName == "" {
							userName = u.Username
						}
					}
					warnings = append(warnings, OverlapWarning{
						UserID:     uid,
						UserName:   userName,
						EventID:    ev.ID,
						EventTitle: ev.Title,
					})
				}
			}
		}
	}
	return warnings
}

// ── Auto-Report Schedules ─────────────────────────────────────────────────────

func (s *Store) GetAutoReportSchedules() []AutoReportSchedule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AutoReportSchedule, len(s.autoReportSchedules))
	copy(out, s.autoReportSchedules)
	return out
}

func (s *Store) CreateAutoReportSchedule(sched AutoReportSchedule) (AutoReportSchedule, error) {
	s.mu.Lock()
	s.nextAutoReportScheduleID++
	sched.ID = s.nextAutoReportScheduleID
	sched.CreatedAt = time.Now()
	sched.Enabled = true
	s.autoReportSchedules = append(s.autoReportSchedules, sched)
	snap := append([]AutoReportSchedule(nil), s.autoReportSchedules...)
	s.mu.Unlock()
	return sched, s.persist("auto_report_schedules.json", snap)
}

func (s *Store) UpdateAutoReportSchedule(sched AutoReportSchedule) error {
	s.mu.Lock()
	for i, rs := range s.autoReportSchedules {
		if rs.ID == sched.ID {
			s.autoReportSchedules[i] = sched
			snap := append([]AutoReportSchedule(nil), s.autoReportSchedules...)
			s.mu.Unlock()
			return s.persist("auto_report_schedules.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("schedule not found")
}

func (s *Store) DeleteAutoReportSchedule(id int64) error {
	s.mu.Lock()
	for i, rs := range s.autoReportSchedules {
		if rs.ID == id {
			s.autoReportSchedules = append(s.autoReportSchedules[:i], s.autoReportSchedules[i+1:]...)
			snap := append([]AutoReportSchedule(nil), s.autoReportSchedules...)
			s.mu.Unlock()
			return s.persist("auto_report_schedules.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("schedule not found")
}
