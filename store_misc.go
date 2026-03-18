package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// ── Decision Log ────────────────────────────────────────────────────────────

func (s *Store) GetDecisionLog() []DecisionLogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]DecisionLogEntry, len(s.decisionLog))
	copy(out, s.decisionLog)
	return out
}

func (s *Store) AddDecisionLogEntry(entry DecisionLogEntry) (DecisionLogEntry, error) {
	s.mu.Lock()
	s.nextDecisionLogID++
	entry.ID = s.nextDecisionLogID
	s.decisionLog = append(s.decisionLog, entry)
	snap := append([]DecisionLogEntry(nil), s.decisionLog...)
	s.mu.Unlock()
	return entry, s.persist("decision_log.json", snap)
}

func (s *Store) DeleteDecisionLogEntry(id int64) error {
	s.mu.Lock()
	for i, e := range s.decisionLog {
		if e.ID == id {
			s.decisionLog = append(s.decisionLog[:i], s.decisionLog[i+1:]...)
			snap := append([]DecisionLogEntry(nil), s.decisionLog...)
			s.mu.Unlock()
			return s.persist("decision_log.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("decision log entry %d not found", id)
}

func (s *Store) UpdateDecisionLogEntry(entry DecisionLogEntry) error {
	s.mu.Lock()
	for i, e := range s.decisionLog {
		if e.ID == entry.ID {
			s.decisionLog[i] = entry
			snap := append([]DecisionLogEntry(nil), s.decisionLog...)
			s.mu.Unlock()
			return s.persist("decision_log.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("decision log entry %d not found", entry.ID)
}

func (s *Store) AddDecisionLogAttachment(entryID int64, att DecisionAttachment) error {
	s.mu.Lock()
	found := false
	for i := range s.decisionLog {
		if s.decisionLog[i].ID == entryID {
			s.decisionLog[i].Attachments = append(s.decisionLog[i].Attachments, att)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("decision log entry %d not found", entryID)
	}
	snap := append([]DecisionLogEntry(nil), s.decisionLog...)
	s.mu.Unlock()
	return s.persist("decision_log.json", snap)
}

// ── Person Ready Checks ─────────────────────────────────────────────────────

func (s *Store) GetPersonReadyChecks() []PersonReadyCheck {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]PersonReadyCheck, len(s.personReadyChecks))
	copy(out, s.personReadyChecks)
	return out
}

func (s *Store) AddPersonReadyCheck(check PersonReadyCheck) (PersonReadyCheck, error) {
	s.mu.Lock()
	s.nextPersonReadyCheckID++
	check.ID = s.nextPersonReadyCheckID
	s.personReadyChecks = append(s.personReadyChecks, check)
	snap := append([]PersonReadyCheck(nil), s.personReadyChecks...)
	s.mu.Unlock()
	return check, s.persist("person_ready_checks.json", snap)
}

func (s *Store) UpdatePersonReadyCheck(check PersonReadyCheck) error {
	s.mu.Lock()
	for i, c := range s.personReadyChecks {
		if c.ID == check.ID {
			s.personReadyChecks[i] = check
			snap := append([]PersonReadyCheck(nil), s.personReadyChecks...)
			s.mu.Unlock()
			return s.persist("person_ready_checks.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("person ready check %d not found", check.ID)
}

// ── Polls ───────────────────────────────────────────────────────────────────

func (s *Store) GetPolls() []Poll {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Poll, len(s.polls))
	copy(out, s.polls)
	return out
}

func (s *Store) GetPollByID(id int64) (*Poll, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.polls {
		if s.polls[i].ID == id {
			p := s.polls[i]
			return &p, true
		}
	}
	return nil, false
}

func (s *Store) AddPoll(poll Poll) (Poll, error) {
	s.mu.Lock()
	s.nextPollID++
	poll.ID = s.nextPollID
	s.polls = append(s.polls, poll)
	snap := append([]Poll(nil), s.polls...)
	s.mu.Unlock()
	return poll, s.persist("polls.json", snap)
}

func (s *Store) UpdatePoll(poll Poll) error {
	s.mu.Lock()
	for i, p := range s.polls {
		if p.ID == poll.ID {
			s.polls[i] = poll
			snap := append([]Poll(nil), s.polls...)
			s.mu.Unlock()
			return s.persist("polls.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("poll %d not found", poll.ID)
}

// ── Poll Questionnaires ─────────────────────────────────────────────────────

func (s *Store) GetQuestionnaires() []PollQuestionnaire {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]PollQuestionnaire, len(s.questionnaires))
	copy(out, s.questionnaires)
	return out
}

func (s *Store) AddQuestionnaire(q PollQuestionnaire) (PollQuestionnaire, error) {
	s.mu.Lock()
	s.nextQuestionnaireID++
	q.ID = s.nextQuestionnaireID
	s.questionnaires = append(s.questionnaires, q)
	snap := append([]PollQuestionnaire(nil), s.questionnaires...)
	s.mu.Unlock()
	return q, s.persist("questionnaires.json", snap)
}

func (s *Store) UpdateQuestionnaire(q PollQuestionnaire) error {
	s.mu.Lock()
	for i, x := range s.questionnaires {
		if x.ID == q.ID {
			s.questionnaires[i] = q
			snap := append([]PollQuestionnaire(nil), s.questionnaires...)
			s.mu.Unlock()
			return s.persist("questionnaires.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("questionnaire %d not found", q.ID)
}

func (s *Store) DeleteQuestionnaire(id int64) error {
	s.mu.Lock()
	for i, x := range s.questionnaires {
		if x.ID == id {
			s.questionnaires = append(s.questionnaires[:i], s.questionnaires[i+1:]...)
			snap := append([]PollQuestionnaire(nil), s.questionnaires...)
			s.mu.Unlock()
			return s.persist("questionnaires.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("questionnaire %d not found", id)
}

// ── Checklist Templates ─────────────────────────────────────────────────────

func (s *Store) GetChecklistTemplates() []ChecklistTemplate {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ChecklistTemplate, len(s.checklistTemplates))
	copy(out, s.checklistTemplates)
	return out
}

func (s *Store) AddChecklistTemplate(t ChecklistTemplate) (ChecklistTemplate, error) {
	s.mu.Lock()
	s.nextChecklistTemplateID++
	t.ID = s.nextChecklistTemplateID
	s.checklistTemplates = append(s.checklistTemplates, t)
	snap := append([]ChecklistTemplate(nil), s.checklistTemplates...)
	s.mu.Unlock()
	return t, s.persist("checklist_templates.json", snap)
}

func (s *Store) UpdateChecklistTemplate(t ChecklistTemplate) error {
	s.mu.Lock()
	for i, x := range s.checklistTemplates {
		if x.ID == t.ID {
			s.checklistTemplates[i] = t
			snap := append([]ChecklistTemplate(nil), s.checklistTemplates...)
			s.mu.Unlock()
			return s.persist("checklist_templates.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("checklist template %d not found", t.ID)
}

func (s *Store) DeleteChecklistTemplate(id int64) error {
	s.mu.Lock()
	for i, x := range s.checklistTemplates {
		if x.ID == id {
			s.checklistTemplates = append(s.checklistTemplates[:i], s.checklistTemplates[i+1:]...)
			snap := append([]ChecklistTemplate(nil), s.checklistTemplates...)
			s.mu.Unlock()
			return s.persist("checklist_templates.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("checklist template %d not found", id)
}

// ── Checklist Instances ─────────────────────────────────────────────────────

func (s *Store) GetChecklistInstances() []ChecklistInstance {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ChecklistInstance, len(s.checklistInstances))
	copy(out, s.checklistInstances)
	return out
}

func (s *Store) AddChecklistInstance(ci ChecklistInstance) (ChecklistInstance, error) {
	s.mu.Lock()
	s.nextChecklistInstanceID++
	ci.ID = s.nextChecklistInstanceID
	s.checklistInstances = append(s.checklistInstances, ci)
	snap := append([]ChecklistInstance(nil), s.checklistInstances...)
	s.mu.Unlock()
	return ci, s.persist("checklist_instances.json", snap)
}

func (s *Store) UpdateChecklistInstance(ci ChecklistInstance) error {
	s.mu.Lock()
	for i, x := range s.checklistInstances {
		if x.ID == ci.ID {
			s.checklistInstances[i] = ci
			snap := append([]ChecklistInstance(nil), s.checklistInstances...)
			s.mu.Unlock()
			return s.persist("checklist_instances.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("checklist instance %d not found", ci.ID)
}

func (s *Store) DeleteChecklistInstance(id int64) error {
	s.mu.Lock()
	for i, x := range s.checklistInstances {
		if x.ID == id {
			s.checklistInstances = append(s.checklistInstances[:i], s.checklistInstances[i+1:]...)
			snap := append([]ChecklistInstance(nil), s.checklistInstances...)
			s.mu.Unlock()
			return s.persist("checklist_instances.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("checklist instance %d not found", id)
}

// ── Event Log ───────────────────────────────────────────────────────────────

func (s *Store) GetEventLog() []EventLogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]EventLogEntry, len(s.eventLog))
	copy(out, s.eventLog)
	return out
}

func (s *Store) AddEventLogEntry(entry EventLogEntry) (EventLogEntry, error) {
	s.mu.Lock()
	s.nextEventLogID++
	entry.ID = s.nextEventLogID
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}
	s.eventLog = append(s.eventLog, entry)
	snap := append([]EventLogEntry(nil), s.eventLog...)
	s.mu.Unlock()
	return entry, s.persist("event_log.json", snap)
}

// ── Log Book ────────────────────────────────────────────────────────────────

func (s *Store) GetLogBook() []LogBookEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]LogBookEntry, len(s.logBook))
	copy(out, s.logBook)
	return out
}

func (s *Store) AddLogBookEntry(entry LogBookEntry) (LogBookEntry, error) {
	s.mu.Lock()
	s.nextLogBookID++
	entry.ID = s.nextLogBookID
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}
	s.logBook = append(s.logBook, entry)
	snap := append([]LogBookEntry(nil), s.logBook...)
	s.mu.Unlock()
	return entry, s.persist("log_book.json", snap)
}

func (s *Store) AddLogBookAttachment(entryID int64, att LogBookAttachment) error {
	s.mu.Lock()
	for i := range s.logBook {
		if s.logBook[i].ID == entryID {
			s.logBook[i].Attachments = append(s.logBook[i].Attachments, att)
			snap := append([]LogBookEntry(nil), s.logBook...)
			s.mu.Unlock()
			return s.persist("log_book.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("log book entry %d not found", entryID)
}

func (s *Store) DeleteLogBookEntry(id int64) error {
	s.mu.Lock()
	for i := range s.logBook {
		if s.logBook[i].ID == id {
			s.logBook = append(s.logBook[:i], s.logBook[i+1:]...)
			snap := append([]LogBookEntry(nil), s.logBook...)
			s.mu.Unlock()
			return s.persist("log_book.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("log book entry %d not found", id)
}

// ── Map Locations ───────────────────────────────────────────────────────────

func (s *Store) GetMapLocations() []MapLocation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]MapLocation, len(s.mapLocations))
	copy(out, s.mapLocations)
	return out
}

func (s *Store) AddMapLocation(loc MapLocation) (MapLocation, error) {
	s.mu.Lock()
	s.nextMapLocationID++
	loc.ID = s.nextMapLocationID
	s.mapLocations = append(s.mapLocations, loc)
	snap := append([]MapLocation(nil), s.mapLocations...)
	s.mu.Unlock()
	return loc, s.persist("map_locations.json", snap)
}

func (s *Store) UpdateMapLocation(loc MapLocation) error {
	s.mu.Lock()
	for i, l := range s.mapLocations {
		if l.ID == loc.ID {
			s.mapLocations[i] = loc
			snap := append([]MapLocation(nil), s.mapLocations...)
			s.mu.Unlock()
			return s.persist("map_locations.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("map location %d not found", loc.ID)
}

func (s *Store) DeleteMapLocation(id int64) error {
	s.mu.Lock()
	for i, l := range s.mapLocations {
		if l.ID == id {
			s.mapLocations = append(s.mapLocations[:i], s.mapLocations[i+1:]...)
			snap := append([]MapLocation(nil), s.mapLocations...)
			s.mu.Unlock()
			return s.persist("map_locations.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("map location %d not found", id)
}

// ── Notifications ──────────────────────────────────────────────────────────

func (s *Store) AddNotification(n Notification) (Notification, error) {
	s.mu.Lock()
	s.nextNotificationID++
	n.ID = s.nextNotificationID
	n.CreatedAt = time.Now()
	s.notifications = append(s.notifications, n)
	// Cap at 5000 entries — drop oldest first
	if len(s.notifications) > 5000 {
		s.notifications = s.notifications[len(s.notifications)-5000:]
	}
	snap := append([]Notification(nil), s.notifications...)
	s.mu.Unlock()
	return n, s.persist("notifications.json", snap)
}

func (s *Store) GetNotificationsForUser(userID int64, limit int) []Notification {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Collect user's notifications, unacknowledged first, newest first
	var unacked, acked []Notification
	for i := len(s.notifications) - 1; i >= 0; i-- {
		n := s.notifications[i]
		if n.UserID != userID {
			continue
		}
		if !n.Acknowledged {
			unacked = append(unacked, n)
		} else {
			acked = append(acked, n)
		}
	}
	result := append(unacked, acked...)
	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}
	return result
}

func (s *Store) GetNotification(id int64) (*Notification, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, n := range s.notifications {
		if n.ID == id {
			copy := n
			return &copy, nil
		}
	}
	return nil, fmt.Errorf("notification %d not found", id)
}

func (s *Store) AcknowledgeNotification(id int64) error {
	s.mu.Lock()
	for i, n := range s.notifications {
		if n.ID == id {
			s.notifications[i].Acknowledged = true
			s.notifications[i].Read = true
			snap := append([]Notification(nil), s.notifications...)
			s.mu.Unlock()
			return s.persist("notifications.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("notification %d not found", id)
}

func (s *Store) MarkNotificationRead(id int64) error {
	s.mu.Lock()
	for i, n := range s.notifications {
		if n.ID == id {
			s.notifications[i].Read = true
			snap := append([]Notification(nil), s.notifications...)
			s.mu.Unlock()
			return s.persist("notifications.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("notification %d not found", id)
}

func (s *Store) CountUnreadNotifications(userID int64) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, n := range s.notifications {
		if n.UserID == userID && !n.Read {
			count++
		}
	}
	return count
}

// ── Map Resources ──────────────────────────────────────────────────────────────

func (s *Store) GetMapResources() []MapResource {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]MapResource, len(s.mapResources))
	copy(out, s.mapResources)
	return out
}

func (s *Store) GetMapResource(id int64) (MapResource, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, mr := range s.mapResources {
		if mr.ID == id {
			return mr, true
		}
	}
	return MapResource{}, false
}

func (s *Store) AddMapResource(mr MapResource) (MapResource, error) {
	s.mu.Lock()
	s.nextMapResourceID++
	mr.ID = s.nextMapResourceID
	s.mapResources = append(s.mapResources, mr)
	snap := append([]MapResource(nil), s.mapResources...)
	s.mu.Unlock()
	return mr, s.persist("map_resources.json", snap)
}

func (s *Store) UpdateMapResource(mr MapResource) error {
	s.mu.Lock()
	for i, m := range s.mapResources {
		if m.ID == mr.ID {
			s.mapResources[i] = mr
			snap := append([]MapResource(nil), s.mapResources...)
			s.mu.Unlock()
			return s.persist("map_resources.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("map resource %d not found", mr.ID)
}

func (s *Store) DeleteMapResource(id int64) error {
	s.mu.Lock()
	for i, m := range s.mapResources {
		if m.ID == id {
			s.mapResources = append(s.mapResources[:i], s.mapResources[i+1:]...)
			snap := append([]MapResource(nil), s.mapResources...)
			s.mu.Unlock()
			return s.persist("map_resources.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("map resource %d not found", id)
}

// MapResourceDir returns the path to the map resources file directory.
func (s *Store) MapResourceDir() string {
	return filepath.Join(s.dataDir, "map_resources")
}

// ReferenceDir returns the path to the reference documents file directory.
func (s *Store) ReferenceDir() string {
	return filepath.Join(s.dataDir, "references")
}

// ── Reference Documents ────────────────────────────────────────────────────

func (s *Store) GetReferenceDocs() []ReferenceDoc {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ReferenceDoc, len(s.referenceDocs))
	copy(out, s.referenceDocs)
	return out
}

func (s *Store) GetReferenceDoc(id int64) (ReferenceDoc, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, rd := range s.referenceDocs {
		if rd.ID == id {
			return rd, true
		}
	}
	return ReferenceDoc{}, false
}

func (s *Store) AddReferenceDoc(rd ReferenceDoc) (ReferenceDoc, error) {
	s.mu.Lock()
	s.nextReferenceDocID++
	rd.ID = s.nextReferenceDocID
	s.referenceDocs = append(s.referenceDocs, rd)
	snap := append([]ReferenceDoc(nil), s.referenceDocs...)
	s.mu.Unlock()
	return rd, s.persist("references.json", snap)
}

func (s *Store) UpdateReferenceDoc(rd ReferenceDoc) error {
	s.mu.Lock()
	for i, d := range s.referenceDocs {
		if d.ID == rd.ID {
			s.referenceDocs[i] = rd
			snap := append([]ReferenceDoc(nil), s.referenceDocs...)
			s.mu.Unlock()
			return s.persist("references.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("reference doc %d not found", rd.ID)
}

func (s *Store) DeleteReferenceDoc(id int64) error {
	s.mu.Lock()
	for i, d := range s.referenceDocs {
		if d.ID == id {
			s.referenceDocs = append(s.referenceDocs[:i], s.referenceDocs[i+1:]...)
			snap := append([]ReferenceDoc(nil), s.referenceDocs...)
			s.mu.Unlock()
			return s.persist("references.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("reference doc %d not found", id)
}

// ── Reference Link (URL / local) ──────────────────────────────────────────────

func (s *Store) CreateReferenceLink(title, description, category, tags, refType, url, content string, userID int64, userName string) ReferenceDoc {
	s.mu.Lock()
	s.nextReferenceDocID++
	var tagList []string
	if tags != "" {
		for _, t := range strings.Split(tags, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tagList = append(tagList, t)
			}
		}
	}
	contentType := "text/html"
	filename := url
	if refType == "local" {
		contentType = "text/plain"
		filename = content
	}
	rd := ReferenceDoc{
		ID:             s.nextReferenceDocID,
		Title:          title,
		Description:    description,
		Category:       category,
		Filename:       filename,
		OriginalName:   title,
		ContentType:    contentType,
		Size:           int64(len(content)),
		UploadedBy:     userID,
		UploadedByName: userName,
		UploadedAt:     time.Now(),
		Tags:           tagList,
		RefType:        refType,
		URL:            url,
		Content:        content,
	}
	s.referenceDocs = append(s.referenceDocs, rd)
	snap := append([]ReferenceDoc(nil), s.referenceDocs...)
	s.mu.Unlock()
	_ = s.persist("references.json", snap)
	return rd
}

// ── Day Labels ────────────────────────────────────────────────────────────

func (s *Store) GetDayLabels() []DayLabel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]DayLabel, len(s.dayLabels))
	copy(out, s.dayLabels)
	return out
}

func (s *Store) AddDayLabel(dl DayLabel) (DayLabel, error) {
	s.mu.Lock()
	s.nextDayLabelID++
	dl.ID = s.nextDayLabelID
	s.dayLabels = append(s.dayLabels, dl)
	snap := append([]DayLabel(nil), s.dayLabels...)
	s.mu.Unlock()
	return dl, s.persist("day_labels.json", snap)
}

func (s *Store) UpdateDayLabel(dl DayLabel) error {
	s.mu.Lock()
	found := false
	for i := range s.dayLabels {
		if s.dayLabels[i].ID == dl.ID {
			s.dayLabels[i] = dl
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("day label not found")
	}
	snap := append([]DayLabel(nil), s.dayLabels...)
	s.mu.Unlock()
	return s.persist("day_labels.json", snap)
}

func (s *Store) DeleteDayLabel(id int64) error {
	s.mu.Lock()
	idx := -1
	for i := range s.dayLabels {
		if s.dayLabels[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		s.mu.Unlock()
		return fmt.Errorf("day label not found")
	}
	s.dayLabels = append(s.dayLabels[:idx], s.dayLabels[idx+1:]...)
	snap := append([]DayLabel(nil), s.dayLabels...)
	s.mu.Unlock()
	return s.persist("day_labels.json", snap)
}

// ── Tags ───────────────────────────────────────────────────────────────────────

func (s *Store) GetTags() []Tag {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Tag, len(s.tags))
	copy(out, s.tags)
	return out
}

func (s *Store) AddTag(tag Tag) (Tag, error) {
	s.mu.Lock()
	s.nextTagID++
	tag.ID = s.nextTagID
	s.tags = append(s.tags, tag)
	snap := append([]Tag(nil), s.tags...)
	s.mu.Unlock()
	return tag, s.persist("tags.json", snap)
}

func (s *Store) DeleteTag(id int64) error {
	s.mu.Lock()
	idx := -1
	for i, t := range s.tags {
		if t.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		s.mu.Unlock()
		return fmt.Errorf("tag not found")
	}
	s.tags = append(s.tags[:idx], s.tags[idx+1:]...)
	snap := append([]Tag(nil), s.tags...)
	s.mu.Unlock()
	return s.persist("tags.json", snap)
}

// GetTagCloud returns all tags with usage counts computed from polls and ready checks.
func (s *Store) GetTagCloud() []Tag {
	s.mu.RLock()
	defer s.mu.RUnlock()
	counts := make(map[string]int)
	for _, p := range s.polls {
		for _, t := range p.Tags {
			counts[t]++
		}
	}
	for _, rc := range s.personReadyChecks {
		for _, t := range rc.Tags {
			counts[t]++
		}
	}
	out := make([]Tag, len(s.tags))
	copy(out, s.tags)
	for i := range out {
		out[i].UsageCount = counts[out[i].Name]
	}
	return out
}

// ── Filter Presets ────────────────────────────────────────────────────────────

func (s *Store) GetFilterPresets(userID int64) []FilterPreset {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []FilterPreset
	for _, p := range s.filterPresets {
		if p.UserID == userID {
			out = append(out, p)
		}
	}
	return out
}

func (s *Store) CreateFilterPreset(p FilterPreset) (FilterPreset, error) {
	s.mu.Lock()
	s.nextFilterPresetID++
	p.ID = s.nextFilterPresetID
	p.CreatedAt = time.Now()
	s.filterPresets = append(s.filterPresets, p)
	snap := append([]FilterPreset(nil), s.filterPresets...)
	s.mu.Unlock()
	return p, s.persist("filter_presets.json", snap)
}

func (s *Store) DeleteFilterPreset(id, userID int64) error {
	s.mu.Lock()
	for i, p := range s.filterPresets {
		if p.ID == id && p.UserID == userID {
			s.filterPresets = append(s.filterPresets[:i], s.filterPresets[i+1:]...)
			snap := append([]FilterPreset(nil), s.filterPresets...)
			s.mu.Unlock()
			return s.persist("filter_presets.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("preset not found")
}
