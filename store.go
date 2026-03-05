package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Store is a thread-safe in-memory store backed by JSON files
type Store struct {
	mu      sync.RWMutex
	dataDir string

	eventTypes  []EventTypeDef
	users       []User
	preferences []UserPreferences
	groups      []Group
	memberships []GroupMembership
	layers      []Layer
	events      []Event
	attachments []Attachment
	alarms      []Alarm
	locks       []LockedSlot
	sessions    []Session
	audit       []AuditEntry
	exercise    ExerciseSettings

	nextEventTypeID int64
	nextUserID      int64
	nextGroupID     int64
	nextLayerID     int64
	nextEventID     int64
	nextAttachID    int64
	nextAlarmID     int64
	nextLockID      int64
	nextAuditID     int64
}

func NewStore(dataDir string) (*Store, error) {
	s := &Store{dataDir: dataDir}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "attachments"), 0755); err != nil {
		return nil, fmt.Errorf("create attachments dir: %w", err)
	}
	if err := s.load(); err != nil {
		return nil, fmt.Errorf("load data: %w", err)
	}
	return s, nil
}

func (s *Store) load() error {
	s.loadFile("event_types.json", &s.eventTypes)
	s.loadFile("users.json", &s.users)
	s.loadFile("preferences.json", &s.preferences)
	s.loadFile("groups.json", &s.groups)
	s.loadFile("memberships.json", &s.memberships)
	s.loadFile("layers.json", &s.layers)
	s.loadFile("events.json", &s.events)
	s.loadFile("attachments.json", &s.attachments)
	s.loadFile("alarms.json", &s.alarms)
	s.loadFile("locks.json", &s.locks)
	s.loadFile("sessions.json", &s.sessions)
	s.loadFile("audit.json", &s.audit)
	s.loadFile("exercise.json", &s.exercise)

	for _, x := range s.eventTypes {
		if x.ID > s.nextEventTypeID {
			s.nextEventTypeID = x.ID
		}
	}
	for _, x := range s.users {
		if x.ID > s.nextUserID {
			s.nextUserID = x.ID
		}
	}
	for _, x := range s.groups {
		if x.ID > s.nextGroupID {
			s.nextGroupID = x.ID
		}
	}
	for _, x := range s.layers {
		if x.ID > s.nextLayerID {
			s.nextLayerID = x.ID
		}
	}
	for _, x := range s.events {
		if x.ID > s.nextEventID {
			s.nextEventID = x.ID
		}
	}
	for _, x := range s.attachments {
		if x.ID > s.nextAttachID {
			s.nextAttachID = x.ID
		}
	}
	for _, x := range s.alarms {
		if x.ID > s.nextAlarmID {
			s.nextAlarmID = x.ID
		}
	}
	for _, x := range s.locks {
		if x.ID > s.nextLockID {
			s.nextLockID = x.ID
		}
	}
	for _, x := range s.audit {
		if x.ID > s.nextAuditID {
			s.nextAuditID = x.ID
		}
	}
	return nil
}

// ── Audit log ──────────────────────────────────────────────────────────────────

func (s *Store) LogAudit(entry AuditEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextAuditID++
	entry.ID = s.nextAuditID
	entry.Timestamp = time.Now()
	s.audit = append(s.audit, entry)
	// Cap at 10 000 entries (oldest first → drop from front)
	if len(s.audit) > 10000 {
		s.audit = s.audit[len(s.audit)-10000:]
	}
	return s.saveFile("audit.json", s.audit)
}

func (s *Store) GetAudit(limit int) []AuditEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := len(s.audit)
	if limit <= 0 || limit > n {
		limit = n
	}
	result := make([]AuditEntry, limit)
	copy(result, s.audit[n-limit:])
	// Reverse so newest first
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result
}

// ── Exercise settings ──────────────────────────────────────────────────────────

func (s *Store) GetExerciseSettings() ExerciseSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.exercise
}

func (s *Store) SaveExerciseSettings(es ExerciseSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.exercise = es
	return s.saveFile("exercise.json", es)
}

func (s *Store) loadFile(filename string, v interface{}) {
	f, err := os.Open(filepath.Join(s.dataDir, filename))
	if err != nil {
		return
	}
	defer f.Close()
	json.NewDecoder(f).Decode(v) //nolint
}

func (s *Store) saveFile(filename string, v interface{}) error {
	path := filepath.Join(s.dataDir, filename)
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	f.Close()
	return os.Rename(tmp, path)
}

// ── Event Types ───────────────────────────────────────────────────────────────

func (s *Store) GetEventTypes() []EventTypeDef {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]EventTypeDef, len(s.eventTypes))
	copy(result, s.eventTypes)
	return result
}

func (s *Store) GetEventTypeByKey(key string) (*EventTypeDef, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.eventTypes {
		if s.eventTypes[i].Key == key {
			t := s.eventTypes[i]
			return &t, true
		}
	}
	return nil, false
}

func (s *Store) GetEventTypeByID(id int64) (*EventTypeDef, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.eventTypes {
		if s.eventTypes[i].ID == id {
			t := s.eventTypes[i]
			return &t, true
		}
	}
	return nil, false
}

func (s *Store) CreateEventType(et EventTypeDef) (EventTypeDef, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextEventTypeID++
	et.ID = s.nextEventTypeID
	et.CreatedAt = time.Now()
	s.eventTypes = append(s.eventTypes, et)
	return et, s.saveFile("event_types.json", s.eventTypes)
}

func (s *Store) UpdateEventType(et EventTypeDef) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.eventTypes {
		if s.eventTypes[i].ID == et.ID {
			s.eventTypes[i] = et
			return s.saveFile("event_types.json", s.eventTypes)
		}
	}
	return fmt.Errorf("event type not found")
}

func (s *Store) DeleteEventType(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, et := range s.eventTypes {
		if et.ID == id {
			if et.IsSystem {
				return fmt.Errorf("cannot delete system event type")
			}
			s.eventTypes = append(s.eventTypes[:i], s.eventTypes[i+1:]...)
			return s.saveFile("event_types.json", s.eventTypes)
		}
	}
	return fmt.Errorf("event type not found")
}

// SeedEventTypes inserts the default system types if they don't exist yet
func (s *Store) SeedEventTypes() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for _, def := range SystemEventTypes {
		found := false
		for _, existing := range s.eventTypes {
			if existing.Key == def.Key {
				found = true
				break
			}
		}
		if !found {
			s.nextEventTypeID++
			def.ID = s.nextEventTypeID
			def.CreatedAt = time.Now()
			s.eventTypes = append(s.eventTypes, def)
			changed = true
		}
	}
	if changed {
		return s.saveFile("event_types.json", s.eventTypes)
	}
	return nil
}

// ── Users ─────────────────────────────────────────────────────────────────────

func (s *Store) GetUsers() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]User, len(s.users))
	copy(result, s.users)
	return result
}

func (s *Store) GetUserByID(id int64) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].ID == id {
			u := s.users[i]
			return &u, true
		}
	}
	return nil, false
}

func (s *Store) GetUserByUsername(username string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].Username == username {
			u := s.users[i]
			return &u, true
		}
	}
	return nil, false
}

func (s *Store) CreateUser(u User) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextUserID++
	u.ID = s.nextUserID
	u.CreatedAt = time.Now()
	s.users = append(s.users, u)
	return u, s.saveFile("users.json", s.users)
}

func (s *Store) UpdateUser(u User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.users {
		if s.users[i].ID == u.ID {
			s.users[i] = u
			return s.saveFile("users.json", s.users)
		}
	}
	return fmt.Errorf("user not found")
}

func (s *Store) DeleteUser(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, u := range s.users {
		if u.ID == id {
			s.users = append(s.users[:i], s.users[i+1:]...)
			return s.saveFile("users.json", s.users)
		}
	}
	return fmt.Errorf("user not found")
}

// ── Preferences ───────────────────────────────────────────────────────────────

func (s *Store) GetPreferences(userID int64) UserPreferences {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.preferences {
		if p.UserID == userID {
			return p
		}
	}
	return UserPreferences{
		UserID:       userID,
		Theme:        "dark",
		Size:         "small",
		Language:     "en",
		DayStartHour: 0,
		DayEndHour:   24,
		HiddenTypes:  []string{},
		ActiveLayers: []int64{},
	}
}

func (s *Store) SavePreferences(p UserPreferences) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.preferences {
		if s.preferences[i].UserID == p.UserID {
			s.preferences[i] = p
			return s.saveFile("preferences.json", s.preferences)
		}
	}
	s.preferences = append(s.preferences, p)
	return s.saveFile("preferences.json", s.preferences)
}

// ── Groups ────────────────────────────────────────────────────────────────────

func (s *Store) GetGroups() []Group {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Group, len(s.groups))
	copy(result, s.groups)
	return result
}

func (s *Store) GetGroupByID(id int64) (*Group, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.groups {
		if s.groups[i].ID == id {
			g := s.groups[i]
			return &g, true
		}
	}
	return nil, false
}

func (s *Store) CreateGroup(g Group) (Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextGroupID++
	g.ID = s.nextGroupID
	g.CreatedAt = time.Now()
	s.groups = append(s.groups, g)
	return g, s.saveFile("groups.json", s.groups)
}

func (s *Store) UpdateGroup(g Group) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.groups {
		if s.groups[i].ID == g.ID {
			s.groups[i] = g
			return s.saveFile("groups.json", s.groups)
		}
	}
	return fmt.Errorf("group not found")
}

func (s *Store) DeleteGroup(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, g := range s.groups {
		if g.ID == id {
			s.groups = append(s.groups[:i], s.groups[i+1:]...)
			// Also remove memberships
			var ms []GroupMembership
			for _, m := range s.memberships {
				if m.GroupID != id {
					ms = append(ms, m)
				}
			}
			s.memberships = ms
			s.saveFile("memberships.json", s.memberships) //nolint
			return s.saveFile("groups.json", s.groups)
		}
	}
	return fmt.Errorf("group not found")
}

func (s *Store) GetGroupMembers(groupID int64) []GroupMembership {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []GroupMembership
	for _, m := range s.memberships {
		if m.GroupID == groupID {
			result = append(result, m)
		}
	}
	return result
}

func (s *Store) GetUserGroups(userID int64) []GroupMembership {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []GroupMembership
	for _, m := range s.memberships {
		if m.UserID == userID {
			result = append(result, m)
		}
	}
	return result
}

func (s *Store) AddGroupMember(m GroupMembership) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.memberships {
		if existing.GroupID == m.GroupID && existing.UserID == m.UserID {
			return nil // already member
		}
	}
	s.memberships = append(s.memberships, m)
	return s.saveFile("memberships.json", s.memberships)
}

func (s *Store) RemoveGroupMember(groupID, userID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, m := range s.memberships {
		if m.GroupID == groupID && m.UserID == userID {
			s.memberships = append(s.memberships[:i], s.memberships[i+1:]...)
			return s.saveFile("memberships.json", s.memberships)
		}
	}
	return nil
}

// ── Layers ────────────────────────────────────────────────────────────────────

func (s *Store) GetLayersVisibleTo(userID int64, userGroups []int64) []Layer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Layer
	groupSet := make(map[int64]bool)
	for _, gid := range userGroups {
		groupSet[gid] = true
	}
	for _, l := range s.layers {
		if l.OwnerID == userID {
			result = append(result, l)
			continue
		}
		if l.Visibility == "public" {
			result = append(result, l)
			continue
		}
		if l.Visibility == "groups" {
			for _, gid := range l.GroupIDs {
				if groupSet[gid] {
					result = append(result, l)
					break
				}
			}
		}
	}
	return result
}

func (s *Store) GetAllLayers() []Layer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Layer, len(s.layers))
	copy(result, s.layers)
	return result
}

func (s *Store) GetLayerByID(id int64) (*Layer, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.layers {
		if s.layers[i].ID == id {
			l := s.layers[i]
			return &l, true
		}
	}
	return nil, false
}

func (s *Store) CreateLayer(l Layer) (Layer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextLayerID++
	l.ID = s.nextLayerID
	l.CreatedAt = time.Now()
	if l.GroupIDs == nil {
		l.GroupIDs = []int64{}
	}
	s.layers = append(s.layers, l)
	return l, s.saveFile("layers.json", s.layers)
}

func (s *Store) UpdateLayer(l Layer) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.layers {
		if s.layers[i].ID == l.ID {
			s.layers[i] = l
			return s.saveFile("layers.json", s.layers)
		}
	}
	return fmt.Errorf("layer not found")
}

func (s *Store) DeleteLayer(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, l := range s.layers {
		if l.ID == id {
			s.layers = append(s.layers[:i], s.layers[i+1:]...)
			return s.saveFile("layers.json", s.layers)
		}
	}
	return fmt.Errorf("layer not found")
}

// ── Events ────────────────────────────────────────────────────────────────────

func (s *Store) GetEvents(from, to time.Time, layerIDs []int64) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()

	layerSet := make(map[int64]bool)
	for _, id := range layerIDs {
		layerSet[id] = true
	}

	var result []Event
	for _, e := range s.events {
		// Layer filter: include master (no layer) + requested layers
		if e.LayerID != nil {
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

func (s *Store) GetEventByID(id int64) (*Event, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
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
	defer s.mu.Unlock()
	s.nextEventID++
	e.ID = s.nextEventID
	now := time.Now()
	e.CreatedAt = now
	e.UpdatedAt = now
	s.events = append(s.events, e)
	return e, s.saveFile("events.json", s.events)
}

func (s *Store) UpdateEvent(e Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.events {
		if s.events[i].ID == e.ID {
			e.UpdatedAt = time.Now()
			s.events[i] = e
			return s.saveFile("events.json", s.events)
		}
	}
	return fmt.Errorf("event not found")
}

func (s *Store) DeleteEvent(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, e := range s.events {
		if e.ID == id {
			s.events = append(s.events[:i], s.events[i+1:]...)
			return s.saveFile("events.json", s.events)
		}
	}
	return fmt.Errorf("event not found")
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
	defer s.mu.Unlock()
	s.nextAttachID++
	a.ID = s.nextAttachID
	a.CreatedAt = time.Now()
	s.attachments = append(s.attachments, a)
	return a, s.saveFile("attachments.json", s.attachments)
}

func (s *Store) DeleteAttachment(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, a := range s.attachments {
		if a.ID == id {
			s.attachments = append(s.attachments[:i], s.attachments[i+1:]...)
			return s.saveFile("attachments.json", s.attachments)
		}
	}
	return fmt.Errorf("attachment not found")
}

func (s *Store) AttachmentDir() string {
	return filepath.Join(s.dataDir, "attachments")
}

// ── Alarms ────────────────────────────────────────────────────────────────────

func (s *Store) GetAlarmsByUser(userID int64) []Alarm {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Alarm
	for _, a := range s.alarms {
		if a.UserID == userID {
			result = append(result, a)
		}
	}
	return result
}

func (s *Store) GetActiveAlarms() []Alarm {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Alarm
	for _, a := range s.alarms {
		if a.IsActive && !a.Fired {
			result = append(result, a)
		}
	}
	return result
}

func (s *Store) CreateAlarm(a Alarm) (Alarm, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextAlarmID++
	a.ID = s.nextAlarmID
	a.CreatedAt = time.Now()
	a.IsActive = true
	a.Fired = false
	s.alarms = append(s.alarms, a)
	return a, s.saveFile("alarms.json", s.alarms)
}

func (s *Store) MarkAlarmFired(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.alarms {
		if s.alarms[i].ID == id {
			s.alarms[i].Fired = true
			return s.saveFile("alarms.json", s.alarms)
		}
	}
	return nil
}

func (s *Store) AckAlarm(id, userID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.alarms {
		if s.alarms[i].ID == id && s.alarms[i].UserID == userID {
			now := time.Now()
			s.alarms[i].AcknowledgedAt = &now
			s.alarms[i].IsActive = false
			return s.saveFile("alarms.json", s.alarms)
		}
	}
	return fmt.Errorf("alarm not found")
}

func (s *Store) DeleteAlarm(id, userID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, a := range s.alarms {
		if a.ID == id && a.UserID == userID {
			s.alarms = append(s.alarms[:i], s.alarms[i+1:]...)
			return s.saveFile("alarms.json", s.alarms)
		}
	}
	return fmt.Errorf("alarm not found")
}

// ── Locks ─────────────────────────────────────────────────────────────────────

func (s *Store) GetLocks() []LockedSlot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]LockedSlot, len(s.locks))
	copy(result, s.locks)
	return result
}

func (s *Store) CreateLock(l LockedSlot) (LockedSlot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextLockID++
	l.ID = s.nextLockID
	l.CreatedAt = time.Now()
	s.locks = append(s.locks, l)
	return l, s.saveFile("locks.json", s.locks)
}

func (s *Store) DeleteLock(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, l := range s.locks {
		if l.ID == id {
			s.locks = append(s.locks[:i], s.locks[i+1:]...)
			return s.saveFile("locks.json", s.locks)
		}
	}
	return fmt.Errorf("lock not found")
}

// ── Sessions ──────────────────────────────────────────────────────────────────

func (s *Store) GetSession(id string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.sessions {
		if s.sessions[i].ID == id && s.sessions[i].ExpiresAt.After(time.Now()) {
			sess := s.sessions[i]
			return &sess, true
		}
	}
	return nil, false
}

func (s *Store) CreateSession(sess Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions = append(s.sessions, sess)
	return s.saveFile("sessions.json", s.sessions)
}

func (s *Store) DeleteSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, sess := range s.sessions {
		if sess.ID == id {
			s.sessions = append(s.sessions[:i], s.sessions[i+1:]...)
			return s.saveFile("sessions.json", s.sessions)
		}
	}
	return nil
}

func (s *Store) CleanExpiredSessions() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	var active []Session
	for _, sess := range s.sessions {
		if sess.ExpiresAt.After(now) {
			active = append(active, sess)
		}
	}
	if len(active) != len(s.sessions) {
		s.sessions = active
		s.saveFile("sessions.json", s.sessions) //nolint
	}
}
