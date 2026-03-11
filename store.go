package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Store is a thread-safe in-memory store backed by JSON files.
//
// Performance notes (v4.0):
//   - s.mu (RWMutex) protects only in-memory data; disk I/O happens outside it.
//   - s.writeMu (Mutex) serialises file writes so snapshots are never interleaved.
//   - userByID / sessionByID are O(1) lookup indexes maintained in parallel with slices.
type Store struct {
	mu      sync.RWMutex
	dataDir string

	eventTypes           []EventTypeDef
	users                []User
	preferences          []UserPreferences
	groups               []Group
	memberships          []GroupMembership
	layers               []Layer
	events               []Event
	attachments          []Attachment
	alarms               []Alarm
	locks                []LockedSlot
	sessions             []Session
	audit                []AuditEntry
	exercise             ExerciseSettings
	comments             []EventComment
	phases               []ExercisePhase
	templates            []Template
	roleConfigs          []RoleConfig
	registrationSettings RegistrationSettings
	invitations          []PersonalInvitation
	oidcSettings         OIDCPersistentConfig
	mailConfig           MailConfig
	syslogConfig         SyslogConfig
	securitySettings     SecuritySettings
	tlsConfig            TLSConfig
	apiKeys              []APIKey
	filterPresets        []FilterPreset
	eventVersions        []EventVersion
	autoReportSchedules  []AutoReportSchedule
	editingLocks         []EditingLock // in-memory only; not persisted
	routingRules         []RoutingRule
	connectorConfigs     []ConnectorConfig
	decisionLog          []DecisionLogEntry
	mapLocations         []MapLocation

	nextEventTypeID  int64
	nextUserID       int64
	nextGroupID      int64
	nextLayerID      int64
	nextEventID      int64
	nextAttachID     int64
	nextAlarmID      int64
	nextLockID       int64
	nextAuditID      int64
	nextCommentID    int64
	nextPhaseID      int64
	nextTemplateID   int64
	nextInvitationID    int64
	nextAPIKeyID        int64
	nextFilterPresetID  int64
	nextEventVersionID      int64
	nextAutoReportScheduleID int64
	nextRoutingRuleID        int64
	nextDecisionLogID        int64
	nextMapLocationID        int64

	// O(1) lookup indexes — kept in sync with the underlying slices.
	userByID    map[int64]User
	sessionByID map[string]Session

	// writeMu serialises JSON file writes so they never race each other.
	// It is acquired AFTER s.mu has been released, keeping s.mu hold-time minimal.
	writeMu sync.Mutex
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
	s.loadFile("comments.json", &s.comments)
	s.loadFile("phases.json", &s.phases)
	s.loadFile("templates.json", &s.templates)
	s.loadFile("roles.json", &s.roleConfigs)
	s.loadFile("registration.json", &s.registrationSettings)
	s.loadFile("invitations.json", &s.invitations)
	s.loadFile("oidc.json", &s.oidcSettings)
	s.loadFile("mail.json", &s.mailConfig)
	s.loadFile("syslog.json", &s.syslogConfig)
	s.loadFile("security.json", &s.securitySettings)
	s.loadFile("tls.json", &s.tlsConfig)
	s.loadFile("apikeys.json", &s.apiKeys)
	s.loadFile("filter_presets.json", &s.filterPresets)
	s.loadFile("event_versions.json", &s.eventVersions)
	s.loadFile("auto_report_schedules.json", &s.autoReportSchedules)
	s.loadFile("routing_rules.json", &s.routingRules)
	s.loadFile("connectors.json", &s.connectorConfigs)
	s.loadFile("decision_log.json", &s.decisionLog)
	s.loadFile("map_locations.json", &s.mapLocations)

	for _, x := range s.eventTypes {
		if x.ID > s.nextEventTypeID {
			s.nextEventTypeID = x.ID
		}
	}
	// Migration: rename legacy "readwrite" role to "teammember"
	for i, u := range s.users {
		if u.Role == "readwrite" {
			s.users[i].Role = RoleReadWrite // "teammember"
		}
		if x := s.users[i]; x.ID > s.nextUserID {
			s.nextUserID = x.ID
		}
	}
	// Migration: OIDC default_role "readwrite" → "teammember"
	if s.oidcSettings.DefaultRole == "readwrite" {
		s.oidcSettings.DefaultRole = string(RoleReadWrite)
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
	for _, x := range s.comments {
		if x.ID > s.nextCommentID {
			s.nextCommentID = x.ID
		}
	}
	for _, x := range s.phases {
		if x.ID > s.nextPhaseID {
			s.nextPhaseID = x.ID
		}
	}
	for _, x := range s.templates {
		if x.ID > s.nextTemplateID {
			s.nextTemplateID = x.ID
		}
	}
	for _, x := range s.invitations {
		if x.ID > s.nextInvitationID {
			s.nextInvitationID = x.ID
		}
	}
	for _, x := range s.apiKeys {
		if x.ID > s.nextAPIKeyID {
			s.nextAPIKeyID = x.ID
		}
	}
	for _, x := range s.filterPresets {
		if x.ID > s.nextFilterPresetID {
			s.nextFilterPresetID = x.ID
		}
	}
	for _, x := range s.eventVersions {
		if x.ID > s.nextEventVersionID {
			s.nextEventVersionID = x.ID
		}
	}
	for _, x := range s.autoReportSchedules {
		if x.ID > s.nextAutoReportScheduleID {
			s.nextAutoReportScheduleID = x.ID
		}
	}
	for _, x := range s.routingRules {
		if x.ID > s.nextRoutingRuleID {
			s.nextRoutingRuleID = x.ID
		}
	}
	for _, x := range s.decisionLog {
		if x.ID > s.nextDecisionLogID {
			s.nextDecisionLogID = x.ID
		}
	}
	for _, x := range s.mapLocations {
		if x.ID > s.nextMapLocationID {
			s.nextMapLocationID = x.ID
		}
	}
	// Build O(1) lookup indexes.
	s.rebuildUserIdx()
	s.rebuildSessionIdx()
	return nil
}

// ── Index helpers ──────────────────────────────────────────────────────────────

// rebuildUserIdx rebuilds the O(1) user lookup maps from the users slice.
// Caller must hold s.mu (at least write lock, or be in single-threaded load).
func (s *Store) rebuildUserIdx() {
	s.userByID = make(map[int64]User, len(s.users))
	for _, u := range s.users {
		s.userByID[u.ID] = u
	}
}

// rebuildSessionIdx rebuilds the O(1) session lookup map from the sessions slice.
func (s *Store) rebuildSessionIdx() {
	s.sessionByID = make(map[string]Session, len(s.sessions))
	for _, sess := range s.sessions {
		s.sessionByID[sess.ID] = sess
	}
}

// persist serialises v to filename. It uses a dedicated write mutex so that
// the main RWMutex need not be held during disk I/O.
// Callers must release s.mu BEFORE calling persist.
func (s *Store) persist(filename string, v interface{}) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.saveFile(filename, v)
}

// ── Audit log ──────────────────────────────────────────────────────────────────

func (s *Store) LogAudit(entry AuditEntry) error {
	s.mu.Lock()
	s.nextAuditID++
	entry.ID = s.nextAuditID
	entry.Timestamp = time.Now()
	s.audit = append(s.audit, entry)
	// Cap at 10 000 entries (oldest first → drop from front)
	if len(s.audit) > 10000 {
		s.audit = s.audit[len(s.audit)-10000:]
	}
	snap := append([]AuditEntry(nil), s.audit...)
	s.mu.Unlock()
	return s.persist("audit.json", snap)
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
	s.exercise = es
	s.mu.Unlock()
	return s.persist("exercise.json", es)
}

// DataDir returns the path to the data directory.
func (s *Store) DataDir() string {
	return s.dataDir
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

// ── Reset ──────────────────────────────────────────────────────────────────────

// ResetToEmpty clears all data except the admin account (and its preferences/session).
// If keepTemplates is true, public templates are preserved.
func (s *Store) ResetToEmpty(adminUser User, keepTemplates bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Keep only the admin user
	s.users = []User{adminUser}
	s.nextUserID = adminUser.ID

	// Keep admin preferences if present, clear others; clear extra_clocks
	var adminPrefs []UserPreferences
	for _, p := range s.preferences {
		if p.UserID == adminUser.ID {
			p.ExtraClocks = nil
			adminPrefs = append(adminPrefs, p)
			break
		}
	}
	s.preferences = adminPrefs

	// Optionally preserve templates
	var savedTemplates []Template
	if keepTemplates {
		savedTemplates = append([]Template{}, s.templates...)
	}

	// Clear everything else
	s.groups = nil
	s.memberships = nil
	s.layers = nil
	s.events = nil
	s.attachments = nil
	s.alarms = nil
	s.locks = nil
	s.sessions = nil
	s.audit = nil
	s.comments = nil
	s.phases = nil
	s.roleConfigs = nil
	s.exercise = ExerciseSettings{}
	s.nextGroupID = 0
	s.nextLayerID = 0
	s.nextEventID = 0
	s.nextAttachID = 0
	s.nextAlarmID = 0
	s.nextLockID = 0
	s.nextAuditID = 0
	s.nextCommentID = 0
	s.nextPhaseID = 0

	if keepTemplates {
		s.templates = savedTemplates
	} else {
		s.templates = nil
		s.nextTemplateID = 0
	}

	// Persist all cleared files
	for _, file := range []struct {
		name string
		val  interface{}
	}{
		{"users.json", s.users},
		{"preferences.json", s.preferences},
		{"groups.json", []Group{}},
		{"memberships.json", []GroupMembership{}},
		{"layers.json", []Layer{}},
		{"events.json", []Event{}},
		{"attachments.json", []Attachment{}},
		{"alarms.json", []Alarm{}},
		{"locks.json", []LockedSlot{}},
		{"sessions.json", []Session{}},
		{"audit.json", []AuditEntry{}},
		{"comments.json", []EventComment{}},
		{"phases.json", []ExercisePhase{}},
		{"templates.json", s.templates},
		{"exercise.json", ExerciseSettings{}},
		{"roles.json", []RoleConfig{}},
	} {
		if err := s.saveFile(file.name, file.val); err != nil {
			return err
		}
	}
	return nil
}

// ── Registration Settings ──────────────────────────────────────────────────────

func (s *Store) GetRegistrationSettings() RegistrationSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.registrationSettings
}

func (s *Store) SaveRegistrationSettings(rs RegistrationSettings) error {
	s.mu.Lock()
	s.registrationSettings = rs
	s.mu.Unlock()
	return s.persist("registration.json", rs)
}

// ── OIDC Settings ─────────────────────────────────────────────────────────────

func (s *Store) GetOIDCSettings() OIDCPersistentConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.oidcSettings
}

func (s *Store) SaveOIDCSettings(cfg OIDCPersistentConfig) error {
	s.mu.Lock()
	s.oidcSettings = cfg
	s.mu.Unlock()
	return s.persist("oidc.json", cfg)
}

// ── Personal Invitations ───────────────────────────────────────────────────────

func (s *Store) GetInvitations() []PersonalInvitation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]PersonalInvitation, len(s.invitations))
	copy(result, s.invitations)
	return result
}

func (s *Store) CreateInvitation(inv PersonalInvitation) (PersonalInvitation, error) {
	s.mu.Lock()
	s.nextInvitationID++
	inv.ID = s.nextInvitationID
	inv.CreatedAt = time.Now()
	s.invitations = append(s.invitations, inv)
	snap := append([]PersonalInvitation(nil), s.invitations...)
	s.mu.Unlock()
	return inv, s.persist("invitations.json", snap)
}

func (s *Store) GetInvitationByCode(code string) (*PersonalInvitation, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.invitations {
		if s.invitations[i].Code == code {
			inv := s.invitations[i]
			return &inv, true
		}
	}
	return nil, false
}

func (s *Store) MarkInvitationUsed(id int64, usedBy string) error {
	s.mu.Lock()
	now := time.Now()
	found := false
	for i := range s.invitations {
		if s.invitations[i].ID == id {
			s.invitations[i].Used = true
			s.invitations[i].UsedBy = usedBy
			s.invitations[i].UsedAt = &now
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("invitation not found")
	}
	snap := append([]PersonalInvitation(nil), s.invitations...)
	s.mu.Unlock()
	return s.persist("invitations.json", snap)
}

func (s *Store) DeleteInvitation(id int64) error {
	s.mu.Lock()
	found := false
	for i, inv := range s.invitations {
		if inv.ID == id {
			s.invitations = append(s.invitations[:i], s.invitations[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("invitation not found")
	}
	snap := append([]PersonalInvitation(nil), s.invitations...)
	s.mu.Unlock()
	return s.persist("invitations.json", snap)
}

// ── Password Reset ─────────────────────────────────────────────────────────────

func (s *Store) SetPasswordResetToken(userID int64, token string, expiry time.Time) error {
	s.mu.Lock()
	found := false
	for i := range s.users {
		if s.users[i].ID == userID {
			s.users[i].PasswordResetToken = token
			s.users[i].PasswordResetExpiry = &expiry
			s.userByID[userID] = s.users[i]
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
}

func (s *Store) GetUserByResetToken(token string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	for i := range s.users {
		u := &s.users[i]
		if u.PasswordResetToken == token && u.PasswordResetExpiry != nil && u.PasswordResetExpiry.After(now) {
			cp := *u
			return &cp, true
		}
	}
	return nil, false
}

// VetUser approves a pending (unvetted) user registration
func (s *Store) VetUser(userID int64) error {
	s.mu.Lock()
	found := false
	for i := range s.users {
		if s.users[i].ID == userID {
			s.users[i].Vetted = true
			s.userByID[userID] = s.users[i]
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
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
	s.nextEventTypeID++
	et.ID = s.nextEventTypeID
	et.CreatedAt = time.Now()
	s.eventTypes = append(s.eventTypes, et)
	snap := append([]EventTypeDef(nil), s.eventTypes...)
	s.mu.Unlock()
	return et, s.persist("event_types.json", snap)
}

func (s *Store) UpdateEventType(et EventTypeDef) error {
	s.mu.Lock()
	found := false
	for i := range s.eventTypes {
		if s.eventTypes[i].ID == et.ID {
			s.eventTypes[i] = et
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("event type not found")
	}
	snap := append([]EventTypeDef(nil), s.eventTypes...)
	s.mu.Unlock()
	return s.persist("event_types.json", snap)
}

func (s *Store) DeleteEventType(id int64) error {
	s.mu.Lock()
	for i, et := range s.eventTypes {
		if et.ID == id {
			if et.IsSystem {
				s.mu.Unlock()
				return fmt.Errorf("cannot delete system event type")
			}
			s.eventTypes = append(s.eventTypes[:i], s.eventTypes[i+1:]...)
			snap := append([]EventTypeDef(nil), s.eventTypes...)
			s.mu.Unlock()
			return s.persist("event_types.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("event type not found")
}

// SeedEventTypes inserts the default system types if they don't exist yet
func (s *Store) SeedEventTypes() error {
	s.mu.Lock()
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
	if !changed {
		s.mu.Unlock()
		return nil
	}
	snap := append([]EventTypeDef(nil), s.eventTypes...)
	s.mu.Unlock()
	return s.persist("event_types.json", snap)
}

// ── Users ─────────────────────────────────────────────────────────────────────

func (s *Store) GetUsers() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]User, len(s.users))
	copy(result, s.users)
	return result
}

// GetUserByID is O(1) via index map.
func (s *Store) GetUserByID(id int64) (*User, bool) {
	s.mu.RLock()
	u, ok := s.userByID[id]
	s.mu.RUnlock()
	if !ok {
		return nil, false
	}
	return &u, true
}

// GetAdminPasswordHash returns the bcrypt hash of the "admin" account, used as
// key material when encrypting/decrypting backup archives.
func (s *Store) GetAdminPasswordHash() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].Username == "admin" {
			return []byte(s.users[i].PasswordHash)
		}
	}
	return nil
}

// GetUserByUsername is O(n) but username lookups are rare (login only).
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
	s.nextUserID++
	u.ID = s.nextUserID
	u.CreatedAt = time.Now()
	s.users = append(s.users, u)
	s.userByID[u.ID] = u
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return u, s.persist("users.json", snap)
}

func (s *Store) UpdateUser(u User) error {
	s.mu.Lock()
	found := false
	for i := range s.users {
		if s.users[i].ID == u.ID {
			s.users[i] = u
			s.userByID[u.ID] = u
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
}

func (s *Store) DeleteUser(id int64) error {
	s.mu.Lock()
	found := false
	for i, u := range s.users {
		if u.ID == id {
			s.users = append(s.users[:i], s.users[i+1:]...)
			delete(s.userByID, id)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
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
		Theme:        "light",
		Size:         "small",
		Language:     "en",
		DayStartHour: 0,
		DayEndHour:   24,
		HiddenTypes:  []string{},
		ActiveLayers: []int64{},
	}
}

func (s *Store) GetAllPreferences() []UserPreferences {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]UserPreferences, len(s.preferences))
	copy(result, s.preferences)
	return result
}

func (s *Store) SavePreferences(p UserPreferences) error {
	s.mu.Lock()
	found := false
	for i := range s.preferences {
		if s.preferences[i].UserID == p.UserID {
			s.preferences[i] = p
			found = true
			break
		}
	}
	if !found {
		s.preferences = append(s.preferences, p)
	}
	snap := append([]UserPreferences(nil), s.preferences...)
	s.mu.Unlock()
	return s.persist("preferences.json", snap)
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
	s.nextGroupID++
	g.ID = s.nextGroupID
	g.CreatedAt = time.Now()
	s.groups = append(s.groups, g)
	snap := append([]Group(nil), s.groups...)
	s.mu.Unlock()
	return g, s.persist("groups.json", snap)
}

func (s *Store) UpdateGroup(g Group) error {
	s.mu.Lock()
	found := false
	for i := range s.groups {
		if s.groups[i].ID == g.ID {
			s.groups[i] = g
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("group not found")
	}
	snap := append([]Group(nil), s.groups...)
	s.mu.Unlock()
	return s.persist("groups.json", snap)
}

func (s *Store) DeleteGroup(id int64) error {
	s.mu.Lock()
	found := false
	for i, g := range s.groups {
		if g.ID == id {
			s.groups = append(s.groups[:i], s.groups[i+1:]...)
			var ms []GroupMembership
			for _, m := range s.memberships {
				if m.GroupID != id {
					ms = append(ms, m)
				}
			}
			s.memberships = ms
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("group not found")
	}
	groupSnap := append([]Group(nil), s.groups...)
	memberSnap := append([]GroupMembership(nil), s.memberships...)
	s.mu.Unlock()
	s.persist("memberships.json", memberSnap) //nolint
	return s.persist("groups.json", groupSnap)
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
	for _, existing := range s.memberships {
		if existing.GroupID == m.GroupID && existing.UserID == m.UserID {
			s.mu.Unlock()
			return nil // already member
		}
	}
	s.memberships = append(s.memberships, m)
	snap := append([]GroupMembership(nil), s.memberships...)
	s.mu.Unlock()
	return s.persist("memberships.json", snap)
}

func (s *Store) RemoveGroupMember(groupID, userID int64) error {
	s.mu.Lock()
	for i, m := range s.memberships {
		if m.GroupID == groupID && m.UserID == userID {
			s.memberships = append(s.memberships[:i], s.memberships[i+1:]...)
			snap := append([]GroupMembership(nil), s.memberships...)
			s.mu.Unlock()
			return s.persist("memberships.json", snap)
		}
	}
	s.mu.Unlock()
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
	s.nextLayerID++
	l.ID = s.nextLayerID
	l.CreatedAt = time.Now()
	if l.GroupIDs == nil {
		l.GroupIDs = []int64{}
	}
	s.layers = append(s.layers, l)
	snap := append([]Layer(nil), s.layers...)
	s.mu.Unlock()
	return l, s.persist("layers.json", snap)
}

func (s *Store) UpdateLayer(l Layer) error {
	s.mu.Lock()
	found := false
	for i := range s.layers {
		if s.layers[i].ID == l.ID {
			s.layers[i] = l
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("layer not found")
	}
	snap := append([]Layer(nil), s.layers...)
	s.mu.Unlock()
	return s.persist("layers.json", snap)
}

func (s *Store) DeleteLayer(id int64) error {
	s.mu.Lock()
	found := false
	for i, l := range s.layers {
		if l.ID == id {
			s.layers = append(s.layers[:i], s.layers[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("layer not found")
	}
	snap := append([]Layer(nil), s.layers...)
	s.mu.Unlock()
	return s.persist("layers.json", snap)
}

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

	var result []Event
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
	snap := append([]Event(nil), s.events...)
	s.mu.Unlock()
	return e, s.persist("events.json", snap)
}

func (s *Store) UpdateEvent(e Event) error {
	s.mu.Lock()
	found := false
	for i := range s.events {
		if s.events[i].ID == e.ID {
			e.UpdatedAt = time.Now()
			s.events[i] = e
			found = true
			break
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
	for i, e := range s.events {
		if e.ID == id {
			s.events = append(s.events[:i], s.events[i+1:]...)
			found = true
			break
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
	s.nextAlarmID++
	a.ID = s.nextAlarmID
	a.CreatedAt = time.Now()
	a.IsActive = true
	a.Fired = false
	s.alarms = append(s.alarms, a)
	snap := append([]Alarm(nil), s.alarms...)
	s.mu.Unlock()
	return a, s.persist("alarms.json", snap)
}

func (s *Store) MarkAlarmFired(id int64) error {
	s.mu.Lock()
	for i := range s.alarms {
		if s.alarms[i].ID == id {
			s.alarms[i].Fired = true
			snap := append([]Alarm(nil), s.alarms...)
			s.mu.Unlock()
			return s.persist("alarms.json", snap)
		}
	}
	s.mu.Unlock()
	return nil
}

func (s *Store) GetAlarmByID(id int64) (Alarm, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, a := range s.alarms {
		if a.ID == id {
			return a, true
		}
	}
	return Alarm{}, false
}

func (s *Store) AckAlarm(id, userID int64) error {
	s.mu.Lock()
	found := false
	for i := range s.alarms {
		if s.alarms[i].ID == id && s.alarms[i].UserID == userID {
			now := time.Now()
			s.alarms[i].AcknowledgedAt = &now
			s.alarms[i].IsActive = false
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("alarm not found")
	}
	snap := append([]Alarm(nil), s.alarms...)
	s.mu.Unlock()
	return s.persist("alarms.json", snap)
}

func (s *Store) DeleteAlarm(id, userID int64) error {
	s.mu.Lock()
	found := false
	for i, a := range s.alarms {
		if a.ID == id && a.UserID == userID {
			s.alarms = append(s.alarms[:i], s.alarms[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("alarm not found")
	}
	snap := append([]Alarm(nil), s.alarms...)
	s.mu.Unlock()
	return s.persist("alarms.json", snap)
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
	s.nextLockID++
	l.ID = s.nextLockID
	l.CreatedAt = time.Now()
	s.locks = append(s.locks, l)
	snap := append([]LockedSlot(nil), s.locks...)
	s.mu.Unlock()
	return l, s.persist("locks.json", snap)
}

func (s *Store) DeleteLock(id int64) error {
	s.mu.Lock()
	found := false
	for i, l := range s.locks {
		if l.ID == id {
			s.locks = append(s.locks[:i], s.locks[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("lock not found")
	}
	snap := append([]LockedSlot(nil), s.locks...)
	s.mu.Unlock()
	return s.persist("locks.json", snap)
}

// DeleteLockAuthorized deletes a lock if the user is authorized (admin or creator).
func (s *Store) DeleteLockAuthorized(id, userID int64, isAdmin bool) error {
	s.mu.Lock()
	for i, l := range s.locks {
		if l.ID == id {
			if !isAdmin && l.LockedBy != userID {
				s.mu.Unlock()
				return fmt.Errorf("not authorized to delete this lock")
			}
			s.locks = append(s.locks[:i], s.locks[i+1:]...)
			snap := append([]LockedSlot(nil), s.locks...)
			s.mu.Unlock()
			return s.persist("locks.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("lock not found")
}

// ── Sessions ──────────────────────────────────────────────────────────────────

// GetSession is O(1) via index map. Also validates expiry.
func (s *Store) GetSession(id string) (*Session, bool) {
	s.mu.RLock()
	sess, ok := s.sessionByID[id]
	s.mu.RUnlock()
	if !ok || !sess.ExpiresAt.After(time.Now()) {
		return nil, false
	}
	return &sess, true
}

func (s *Store) CreateSession(sess Session) error {
	s.mu.Lock()
	s.sessions = append(s.sessions, sess)
	s.sessionByID[sess.ID] = sess
	snap := append([]Session(nil), s.sessions...)
	s.mu.Unlock()
	return s.persist("sessions.json", snap)
}

func (s *Store) DeleteSession(id string) error {
	s.mu.Lock()
	for i, sess := range s.sessions {
		if sess.ID == id {
			s.sessions = append(s.sessions[:i], s.sessions[i+1:]...)
			delete(s.sessionByID, id)
			snap := append([]Session(nil), s.sessions...)
			s.mu.Unlock()
			return s.persist("sessions.json", snap)
		}
	}
	s.mu.Unlock()
	return nil
}

func (s *Store) CleanExpiredSessions() {
	s.mu.Lock()
	now := time.Now()
	var active []Session
	for _, sess := range s.sessions {
		if sess.ExpiresAt.After(now) {
			active = append(active, sess)
		}
	}
	changed := len(active) != len(s.sessions)
	if changed {
		s.sessions = active
		s.rebuildSessionIdx()
	}
	s.mu.Unlock()
	if changed {
		snap := append([]Session(nil), active...)
		s.persist("sessions.json", snap) //nolint
	}
}

// ── Event Comments ─────────────────────────────────────────────────────────

func (s *Store) GetCommentsByEvent(eventID int64) []EventComment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []EventComment
	for _, c := range s.comments {
		if c.EventID == eventID {
			result = append(result, c)
		}
	}
	return result
}

func (s *Store) CreateComment(c EventComment) (EventComment, error) {
	s.mu.Lock()
	s.nextCommentID++
	c.ID = s.nextCommentID
	c.CreatedAt = time.Now()
	s.comments = append(s.comments, c)
	snap := append([]EventComment(nil), s.comments...)
	s.mu.Unlock()
	return c, s.persist("comments.json", snap)
}

func (s *Store) DeleteComment(id, userID int64, isAdmin bool) error {
	s.mu.Lock()
	for i, c := range s.comments {
		if c.ID == id {
			if !isAdmin && c.AuthorID != userID {
				s.mu.Unlock()
				return fmt.Errorf("forbidden")
			}
			s.comments = append(s.comments[:i], s.comments[i+1:]...)
			snap := append([]EventComment(nil), s.comments...)
			s.mu.Unlock()
			return s.persist("comments.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("comment not found")
}

func (s *Store) ApproveComment(id, approverID int64) error {
	s.mu.Lock()
	found := false
	for i := range s.comments {
		if s.comments[i].ID == id {
			now := time.Now()
			s.comments[i].PendingApproval = false
			s.comments[i].ApprovedBy = approverID
			s.comments[i].ApprovedAt = &now
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("comment not found")
	}
	snap := append([]EventComment(nil), s.comments...)
	s.mu.Unlock()
	return s.persist("comments.json", snap)
}

// commentCounts returns map[eventID]count. Caller must not hold lock.
func (s *Store) commentCounts() map[int64]int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m := make(map[int64]int)
	for _, c := range s.comments {
		m[c.EventID]++
	}
	return m
}

// ── Exercise Phases ────────────────────────────────────────────────────────

func (s *Store) GetPhases() []ExercisePhase {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ExercisePhase, len(s.phases))
	copy(result, s.phases)
	return result
}

func (s *Store) GetPhaseByID(id int64) (*ExercisePhase, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.phases {
		if s.phases[i].ID == id {
			p := s.phases[i]
			return &p, true
		}
	}
	return nil, false
}

func (s *Store) CreatePhase(p ExercisePhase) (ExercisePhase, error) {
	s.mu.Lock()
	s.nextPhaseID++
	p.ID = s.nextPhaseID
	p.CreatedAt = time.Now()
	s.phases = append(s.phases, p)
	snap := append([]ExercisePhase(nil), s.phases...)
	s.mu.Unlock()
	return p, s.persist("phases.json", snap)
}

func (s *Store) UpdatePhase(p ExercisePhase) error {
	s.mu.Lock()
	found := false
	for i := range s.phases {
		if s.phases[i].ID == p.ID {
			s.phases[i] = p
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("phase not found")
	}
	snap := append([]ExercisePhase(nil), s.phases...)
	s.mu.Unlock()
	return s.persist("phases.json", snap)
}

func (s *Store) DeletePhase(id int64) error {
	s.mu.Lock()
	found := false
	for i, p := range s.phases {
		if p.ID == id {
			s.phases = append(s.phases[:i], s.phases[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("phase not found")
	}
	snap := append([]ExercisePhase(nil), s.phases...)
	s.mu.Unlock()
	return s.persist("phases.json", snap)
}

// ── Full export ────────────────────────────────────────────────────────────

type ExportData struct {
	Version  string           `json:"version"`
	ExportAt time.Time        `json:"export_at"`
	Events   []Event          `json:"events"`
	Users    []UserPublic     `json:"users"`
	Groups   []Group          `json:"groups"`
	Layers   []Layer          `json:"layers"`
	Alarms   []Alarm          `json:"alarms"`
	Exercise ExerciseSettings `json:"exercise"`
	Phases   []ExercisePhase  `json:"phases"`
}

func (s *Store) GetExportData() ExportData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	users := make([]UserPublic, len(s.users))
	for i, u := range s.users {
		users[i] = u.Public()
	}
	events := make([]Event, len(s.events))
	copy(events, s.events)
	groups := make([]Group, len(s.groups))
	copy(groups, s.groups)
	layers := make([]Layer, len(s.layers))
	copy(layers, s.layers)
	alarms := make([]Alarm, len(s.alarms))
	copy(alarms, s.alarms)
	phases := make([]ExercisePhase, len(s.phases))
	copy(phases, s.phases)
	return ExportData{
		Version:  AppVersion,
		ExportAt: time.Now(),
		Events:   events,
		Users:    users,
		Groups:   groups,
		Layers:   layers,
		Alarms:   alarms,
		Exercise: s.exercise,
		Phases:   phases,
	}
}

// GetExportDataFiltered returns export data filtered by include set and role.
// isPrivileged = admin or oplead. include keys: "users","groups","layers","alarms","events","phases"
func (s *Store) GetExportDataFiltered(userID int64, isPrivileged bool, include map[string]bool) ExportData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := ExportData{Version: AppVersion, ExportAt: time.Now(), Exercise: s.exercise}

	if include["events"] {
		for _, e := range s.events {
			if isPrivileged || e.CreatedBy == userID {
				out.Events = append(out.Events, e)
			}
		}
	}
	if include["users"] && isPrivileged {
		for _, u := range s.users {
			out.Users = append(out.Users, u.Public())
		}
	}
	if include["groups"] {
		for _, g := range s.groups {
			if isPrivileged || g.CreatedBy == userID {
				out.Groups = append(out.Groups, g)
			}
		}
	}
	if include["layers"] {
		for _, l := range s.layers {
			if isPrivileged || l.OwnerID == userID {
				out.Layers = append(out.Layers, l)
			}
		}
	}
	if include["alarms"] {
		for _, a := range s.alarms {
			if isPrivileged || a.UserID == userID {
				out.Alarms = append(out.Alarms, a)
			}
		}
	}
	if include["phases"] && isPrivileged {
		out.Phases = make([]ExercisePhase, len(s.phases))
		copy(out.Phases, s.phases)
	}
	return out
}

// ImportResult describes what was imported.
type ImportResult struct {
	Groups  int `json:"groups"`
	Layers  int `json:"layers"`
	Alarms  int `json:"alarms"`
	Events  int `json:"events"`
	Users   int `json:"users"`
	Skipped int `json:"skipped"`
}

// ImportData imports objects from an export. isPrivileged = admin/oplead.
// reassign=true assigns all objects to currentUserID. include filters what to import.
func (s *Store) ImportData(data ExportData, currentUserID int64, currentUserName string, isPrivileged bool, reassign bool, include map[string]bool) ImportResult {
	var res ImportResult

	ownerID := func(original int64) int64 {
		if reassign || !isPrivileged {
			return currentUserID
		}
		return original
	}
	ownerName := func(original string) string {
		if reassign || !isPrivileged {
			return currentUserName
		}
		return original
	}

	if include["groups"] {
		for _, g := range data.Groups {
			if !isPrivileged && g.CreatedBy != currentUserID {
				res.Skipped++
				continue
			}
			ng := Group{
				Name:        g.Name,
				Description: g.Description,
				CreatedBy:   ownerID(g.CreatedBy),
				CreatedAt:   time.Now(),
			}
			if _, err := s.CreateGroup(ng); err == nil {
				res.Groups++
			}
		}
	}

	if include["layers"] {
		for _, l := range data.Layers {
			if !isPrivileged && l.OwnerID != currentUserID {
				res.Skipped++
				continue
			}
			nl := Layer{
				Name:        l.Name,
				Description: l.Description,
				Color:       l.Color,
				OwnerID:     ownerID(l.OwnerID),
				OwnerName:   ownerName(l.OwnerName),
				Visibility:  l.Visibility,
				Permission:  l.Permission,
				GroupIDs:    []int64{},
			}
			if _, err := s.CreateLayer(nl); err == nil {
				res.Layers++
			}
		}
	}

	if include["events"] {
		for _, e := range data.Events {
			if !isPrivileged && e.CreatedBy != currentUserID {
				res.Skipped++
				continue
			}
			ne := e
			ne.ID = 0 // will be assigned by store
			ne.CreatedBy = ownerID(e.CreatedBy)
			ne.CreatedByName = ownerName(e.CreatedByName)
			ne.LayerID = nil // reset layer — cross-system refs not preserved
			ne.CreatedAt = time.Now()
			ne.UpdatedAt = time.Now()
			if _, err := s.CreateEvent(ne); err == nil {
				res.Events++
			}
		}
	}

	if include["alarms"] {
		for _, a := range data.Alarms {
			if !isPrivileged && a.UserID != currentUserID {
				res.Skipped++
				continue
			}
			na := Alarm{
				UserID:     ownerID(a.UserID),
				EventID:    a.EventID,
				EventTitle: a.EventTitle,
				EventTime:  a.EventTime,
				LeadTime:   a.LeadTime,
			}
			if _, err := s.CreateAlarm(na); err == nil {
				res.Alarms++
			}
		}
	}

	if include["users"] && isPrivileged {
		for _, u := range data.Users {
			// Skip if username already exists
			if _, exists := s.GetUserByUsername(u.Username); exists {
				res.Skipped++
				continue
			}
			nu := User{
				Username:     u.Username,
				DisplayName:  u.DisplayName,
				Role:         u.Role,
				CanLock:      u.CanLock,
				PasswordHash: "", // no password; admin must set one
				CreatedAt:    time.Now(),
			}
			if _, err := s.CreateUser(nu); err == nil {
				res.Users++
			}
		}
	}

	return res
}

// ── Templates ──────────────────────────────────────────────────────────────

func (s *Store) GetTemplates(userID int64) []Template {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Template
	for _, tmpl := range s.templates {
		if tmpl.Scope == "public" || tmpl.CreatedBy == userID {
			t2 := tmpl
			t2.ItemCount = len(tmpl.Items)
			t2.Items = nil // don't send items in list view
			out = append(out, t2)
		}
	}
	return out
}

func (s *Store) GetTemplate(id int64) (Template, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, tmpl := range s.templates {
		if tmpl.ID == id {
			return tmpl, true
		}
	}
	return Template{}, false
}

func (s *Store) CreateTemplate(tmpl Template) (Template, error) {
	s.mu.Lock()
	s.nextTemplateID++
	tmpl.ID = s.nextTemplateID
	tmpl.CreatedAt = time.Now()
	tmpl.ItemCount = len(tmpl.Items)
	s.templates = append(s.templates, tmpl)
	snap := append([]Template(nil), s.templates...)
	s.mu.Unlock()
	return tmpl, s.persist("templates.json", snap)
}

func (s *Store) DeleteTemplate(id, userID int64, isAdmin bool) error {
	s.mu.Lock()
	for i, tmpl := range s.templates {
		if tmpl.ID == id {
			if tmpl.CreatedBy != userID && !isAdmin {
				s.mu.Unlock()
				return fmt.Errorf("not authorized")
			}
			s.templates = append(s.templates[:i], s.templates[i+1:]...)
			snap := append([]Template(nil), s.templates...)
			s.mu.Unlock()
			return s.persist("templates.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("template not found")
}

// ── Role Configurations ────────────────────────────────────────────────────────

func (s *Store) GetRoleConfigs() []RoleConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]RoleConfig, len(s.roleConfigs))
	copy(out, s.roleConfigs)
	return out
}

func (s *Store) SaveRoleConfigs(configs []RoleConfig) error {
	s.mu.Lock()
	s.roleConfigs = configs
	snap := append([]RoleConfig(nil), configs...)
	s.mu.Unlock()
	return s.persist("roles.json", snap)
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

// ApplyTemplate creates events from a template offset by baseTime; returns count created.
// It also copies any template attachments to the newly created events.
func (s *Store) ApplyTemplate(id int64, baseTime time.Time, layerID *int64, createdBy int64, createdByName string) (int, error) {
	tmpl, ok := s.GetTemplate(id)
	if !ok {
		return 0, fmt.Errorf("template not found")
	}
	logDebug("[template] ApplyTemplate: name=%q items=%d phases=%d locks=%d base=%s",
		tmpl.Name, len(tmpl.Items), len(tmpl.Phases), len(tmpl.Locks), baseTime.Format(time.RFC3339))
	count := 0
	for _, item := range tmpl.Items {
		start := baseTime.Add(time.Duration(item.StartOffsetMin) * time.Minute)
		var end *time.Time
		if item.DurationMin > 0 {
			e := start.Add(time.Duration(item.DurationMin) * time.Minute)
			end = &e
		}
		ev := Event{
			Title:             item.Title,
			EventType:         item.EventType,
			Color:             item.Color,
			Description:       item.Description,
			StartTime:         start,
			EndTime:           end,
			AllDay:            item.AllDay,
			IsRecurring:       item.IsRecurring,
			RecurrencePattern: item.RecurrencePattern,
			Participant:       item.Participant,
			Status:            StatusPlanned,
			LayerID:           layerID,
			CreatedBy:         createdBy,
			CreatedByName:     createdByName,
		}
		created, err := s.CreateEvent(ev)
		logDebug("[template] item %q -> event start=%s err=%v", item.Title, start.Format(time.RFC3339), err)
		if err == nil {
			count++
			// Copy template attachments to the new event
			for _, ta := range item.Attachments {
				srcPath := filepath.Join(s.AttachmentDir(), ta.StoredName)
				if _, err := os.Stat(srcPath); err != nil {
					continue // source file missing, skip
				}
				newStoredName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), ta.Filename)
				dstPath := filepath.Join(s.AttachmentDir(), newStoredName)
				srcData, err := os.ReadFile(srcPath)
				if err != nil {
					continue
				}
				if err := os.WriteFile(dstPath, srcData, 0644); err != nil {
					continue
				}
				att := Attachment{
					EventID:      created.ID,
					Filename:     ta.Filename,
					StoredName:   newStoredName,
					Size:         ta.Size,
					MimeType:     ta.MimeType,
					UploadedBy:   createdBy,
					UploaderName: createdByName,
				}
				s.CreateAttachment(att) //nolint
			}
		}
	}
	// Create phases from template
	for _, tp := range tmpl.Phases {
		start := baseTime.Add(time.Duration(tp.StartOffsetMin) * time.Minute)
		end := baseTime.Add(time.Duration(tp.EndOffsetMin) * time.Minute)
		ph := ExercisePhase{
			Name:      tp.Name,
			Color:     tp.Color,
			StartTime: start,
			EndTime:   end,
			Order:     tp.Order,
			CreatedBy: createdBy,
		}
		s.CreatePhase(ph) //nolint
	}
	// Create locks from template
	for _, tl := range tmpl.Locks {
		start := baseTime.Add(time.Duration(tl.StartOffsetMin) * time.Minute)
		end := baseTime.Add(time.Duration(tl.EndOffsetMin) * time.Minute)
		scope := tl.Scope
		if scope == "" {
			scope = "all"
		}
		lk := LockedSlot{
			StartTime:    start,
			EndTime:      end,
			Reason:       tl.Reason,
			Scope:        scope,
			LockedBy:     createdBy,
			LockedByName: createdByName,
		}
		s.CreateLock(lk) //nolint
	}
	// Create groups from template
	groupIDMap := make(map[int]int64) // template group index -> real group ID
	for idx, tg := range tmpl.Groups {
		grp := Group{
			Name:        tg.Name,
			Description: tg.Description,
			CreatedBy:   createdBy,
		}
		created, err := s.CreateGroup(grp)
		if err == nil {
			groupIDMap[idx] = created.ID
			// Add members by username (best-effort)
			if len(tg.Members) > 0 {
				s.mu.RLock()
				usernameMap := make(map[string]int64, len(s.users))
				for _, u := range s.users {
					usernameMap[u.Username] = u.ID
				}
				s.mu.RUnlock()
				for _, uname := range tg.Members {
					if uid, ok := usernameMap[uname]; ok {
						s.AddGroupMember(GroupMembership{GroupID: created.ID, UserID: uid, Role: "member"}) //nolint
					}
				}
			}
		}
	}
	// Create layers from template
	for _, tl := range tmpl.Layers {
		vis := tl.Visibility
		if vis == "" {
			vis = "private"
		}
		perm := tl.Permission
		if perm == "" {
			perm = "read"
		}
		color := tl.Color
		if color == "" {
			color = "#4A90D9"
		}
		// Resolve group IDs from template group indices
		var gids []int64
		for _, gi := range tl.GroupIndex {
			if realID, ok := groupIDMap[gi]; ok {
				gids = append(gids, realID)
			}
		}
		layer := Layer{
			Name:        tl.Name,
			Description: tl.Description,
			Color:       color,
			OwnerID:     createdBy,
			OwnerName:   createdByName,
			Visibility:  vis,
			Permission:  perm,
			GroupIDs:    gids,
		}
		s.CreateLayer(layer) //nolint
	}
	return count, nil
}

// ResetDatabase clears all data except the audit trail.
func (s *Store) ResetDatabase() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.eventTypes = nil
	s.nextEventTypeID = 0
	s.preferences = nil
	s.groups = nil
	s.nextGroupID = 0
	s.memberships = nil
	s.layers = nil
	s.nextLayerID = 0
	s.events = nil
	s.nextEventID = 0
	s.attachments = nil
	s.nextAttachID = 0
	s.alarms = nil
	s.nextAlarmID = 0
	s.locks = nil
	s.nextLockID = 0
	s.comments = nil
	s.nextCommentID = 0
	s.phases = nil
	s.nextPhaseID = 0
	s.templates = nil
	s.nextTemplateID = 0
	s.exercise = ExerciseSettings{}

	// Save all cleared files
	files := map[string]interface{}{
		"event_types.json":  s.eventTypes,
		"preferences.json":  s.preferences,
		"groups.json":       s.groups,
		"memberships.json":  s.memberships,
		"layers.json":       s.layers,
		"events.json":       s.events,
		"attachments.json":  s.attachments,
		"alarms.json":       s.alarms,
		"locks.json":        s.locks,
		"comments.json":     s.comments,
		"phases.json":       s.phases,
		"templates.json":    s.templates,
		"exercise.json":     s.exercise,
	}
	for fname, data := range files {
		if err := s.saveFile(fname, data); err != nil {
			return fmt.Errorf("reset %s: %w", fname, err)
		}
	}

	// Clear attachment files
	attDir := filepath.Join(s.dataDir, "attachments")
	entries, _ := os.ReadDir(attDir)
	for _, e := range entries {
		os.Remove(filepath.Join(attDir, e.Name()))
	}

	return nil
}

// ── Mail Config ────────────────────────────────────────────────────────────────

func (s *Store) GetMailConfig() MailConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mailConfig
}

func (s *Store) SaveMailConfig(cfg MailConfig) error {
	s.mu.Lock()
	s.mailConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("mail.json", snap)
}

// ── Syslog Config ──────────────────────────────────────────────────────────────

func (s *Store) GetSyslogConfig() SyslogConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.syslogConfig
}

func (s *Store) SaveSyslogConfig(cfg SyslogConfig) error {
	s.mu.Lock()
	s.syslogConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("syslog.json", snap)
}

// ── Security Settings ─────────────────────────────────────────────────────────

func (s *Store) GetSecuritySettings() SecuritySettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.securitySettings
}

func (s *Store) SaveSecuritySettings(ss SecuritySettings) error {
	s.mu.Lock()
	s.securitySettings = ss
	snap := ss
	s.mu.Unlock()
	return s.persist("security.json", snap)
}

// ── TLS Config ────────────────────────────────────────────────────────────────

func (s *Store) GetTLSConfig() TLSConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tlsConfig
}

func (s *Store) SaveTLSConfig(cfg TLSConfig) error {
	s.mu.Lock()
	s.tlsConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("tls.json", snap)
}

// ── API Keys ──────────────────────────────────────────────────────────────────

func (s *Store) GetAPIKeys() []APIKey {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]APIKey, len(s.apiKeys))
	for i, k := range s.apiKeys {
		cp := k
		cp.KeyHash = "" // never expose hash
		cp.Key = ""
		out[i] = cp
	}
	return out
}

func (s *Store) CreateAPIKey(k APIKey) (APIKey, error) {
	s.mu.Lock()
	s.nextAPIKeyID++
	k.ID = s.nextAPIKeyID
	k.CreatedAt = time.Now()
	s.apiKeys = append(s.apiKeys, k)
	snap := append([]APIKey(nil), s.apiKeys...)
	s.mu.Unlock()
	return k, s.persist("apikeys.json", snap)
}

func (s *Store) DeleteAPIKey(id int64) error {
	s.mu.Lock()
	for i, k := range s.apiKeys {
		if k.ID == id {
			s.apiKeys = append(s.apiKeys[:i], s.apiKeys[i+1:]...)
			snap := append([]APIKey(nil), s.apiKeys...)
			s.mu.Unlock()
			return s.persist("apikeys.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("api key not found")
}

// ValidateAPIKey checks a raw key string against stored hashes; returns the key record or nil.
func (s *Store) ValidateAPIKey(raw string) *APIKey {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, k := range s.apiKeys {
		if bcrypt.CompareHashAndPassword([]byte(k.KeyHash), []byte(raw)) == nil {
			// Update last used
			now := time.Now()
			s.apiKeys[i].LastUsedAt = &now
			cp := s.apiKeys[i]
			snap := append([]APIKey(nil), s.apiKeys...)
			go s.persist("apikeys.json", snap)
			cp.KeyHash = ""
			cp.Key = ""
			return &cp
		}
	}
	return nil
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

// ── Editing Locks (collaborative editing) ────────────────────────────────────

// AcquireEditingLock tries to lock an event for editing by userID.
// Returns true if the lock was acquired; false if another user holds it.
func (s *Store) AcquireEditingLock(eventID, userID int64, userName string) (EditingLock, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	// Remove any expired locks first
	active := s.editingLocks[:0]
	for _, l := range s.editingLocks {
		if l.ExpiresAt.After(now) {
			active = append(active, l)
		}
	}
	s.editingLocks = active
	// Check if another user holds the lock
	for i, l := range s.editingLocks {
		if l.EventID == eventID {
			if l.UserID == userID {
				// Refresh own lock
				s.editingLocks[i].ExpiresAt = now.Add(2 * time.Minute)
				return s.editingLocks[i], true
			}
			// Another user holds it
			return l, false
		}
	}
	lock := EditingLock{
		EventID:   eventID,
		UserID:    userID,
		UserName:  userName,
		LockedAt:  now,
		ExpiresAt: now.Add(2 * time.Minute),
	}
	s.editingLocks = append(s.editingLocks, lock)
	return lock, true
}

// ReleaseEditingLock releases the editing lock for an event.
func (s *Store) ReleaseEditingLock(eventID, userID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, l := range s.editingLocks {
		if l.EventID == eventID && l.UserID == userID {
			s.editingLocks = append(s.editingLocks[:i], s.editingLocks[i+1:]...)
			return
		}
	}
}

// GetEditingLock returns the current editing lock for an event (if any).
func (s *Store) GetEditingLock(eventID int64) (*EditingLock, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	for i, l := range s.editingLocks {
		if l.EventID == eventID && l.ExpiresAt.After(now) {
			_ = i
			cp := l
			return &cp, true
		}
	}
	return nil, false
}

// GetAllEditingLocks returns all active editing locks.
func (s *Store) GetAllEditingLocks() []EditingLock {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	var out []EditingLock
	for _, l := range s.editingLocks {
		if l.ExpiresAt.After(now) {
			out = append(out, l)
		}
	}
	return out
}

// ── Session management (admin) ────────────────────────────────────────────────

// SessionInfo is Session enriched with display name for admin UI
type SessionInfo struct {
	Session
	DisplayName string `json:"display_name"`
	Username    string `json:"username"`
}

// GetAllSessions returns all non-expired sessions with user info attached.
func (s *Store) GetAllSessions() []SessionInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	out := make([]SessionInfo, 0)
	for _, sess := range s.sessions {
		if !sess.ExpiresAt.After(now) {
			continue
		}
		si := SessionInfo{Session: sess}
		for _, u := range s.users {
			if u.ID == sess.UserID {
				si.DisplayName = u.DisplayName
				si.Username = u.Username
				break
			}
		}
		out = append(out, si)
	}
	return out
}

// ── Bulk admin actions ────────────────────────────────────────────────────────

// BulkFilter holds criteria for bulk event operations.
type BulkFilter struct {
	Filter   string     // type | user | group | role | status | layer | all
	Value    string     // filter value (event type key, user id/name, group name/id, role, status, layer id)
	TimeFrom *time.Time // optional: only affect events starting at or after this time
	TimeTo   *time.Time // optional: only affect events starting before or at this time
}

// matchesBulkFilter reports whether ev matches the given BulkFilter.
// groupMemberIDs must be pre-computed when Filter=="group".
func matchesBulkFilter(ev Event, f BulkFilter, groupMemberIDs map[int64]bool, users []User) bool {
	filterMatch := false
	switch f.Filter {
	case "all":
		filterMatch = true
	case "type":
		filterMatch = ev.EventType == f.Value
	case "user":
		// match by username or numeric id
		uid, err := strconv.ParseInt(f.Value, 10, 64)
		if err == nil {
			filterMatch = ev.CreatedBy == uid || (ev.ResponsibleID != nil && *ev.ResponsibleID == uid)
		} else {
			// match by username
			for _, u := range users {
				if strings.EqualFold(u.Username, f.Value) || strings.EqualFold(u.DisplayName, f.Value) {
					if ev.CreatedBy == u.ID || (ev.ResponsibleID != nil && *ev.ResponsibleID == u.ID) {
						filterMatch = true
						break
					}
				}
			}
		}
	case "group":
		filterMatch = groupMemberIDs[ev.CreatedBy]
	case "role":
		for _, u := range users {
			if u.ID == ev.CreatedBy && (string(u.Role) == f.Value || (f.Value == "readwrite" && u.Role == RoleReadWrite)) {
				filterMatch = true
				break
			}
		}
	case "status":
		filterMatch = string(ev.Status) == f.Value
	case "layer":
		lid, err := strconv.ParseInt(f.Value, 10, 64)
		if err == nil {
			filterMatch = ev.LayerID != nil && *ev.LayerID == lid
		}
	}
	if !filterMatch {
		return false
	}
	// Time range filter
	if f.TimeFrom != nil && ev.StartTime.Before(*f.TimeFrom) {
		return false
	}
	if f.TimeTo != nil && ev.StartTime.After(*f.TimeTo) {
		return false
	}
	return true
}

// BulkSetEventStatus sets the status on all events matching the filter.
// Returns the count of events updated.
func (s *Store) BulkSetEventStatus(f BulkFilter, newStatus EventStatus) (int, error) {
	s.mu.Lock()

	var groupMemberIDs map[int64]bool
	if f.Filter == "group" {
		groupMemberIDs = make(map[int64]bool)
		for _, m := range s.memberships {
			for _, g := range s.groups {
				if fmt.Sprintf("%d", g.ID) == f.Value || g.Name == f.Value {
					if m.GroupID == g.ID {
						groupMemberIDs[m.UserID] = true
					}
				}
			}
		}
	}

	count := 0
	for i, ev := range s.events {
		if matchesBulkFilter(ev, f, groupMemberIDs, s.users) {
			s.events[i].Status = newStatus
			s.events[i].UpdatedAt = time.Now()
			count++
		}
	}
	snap := append([]Event(nil), s.events...)
	s.mu.Unlock()
	if count > 0 {
		if err := s.persist("events.json", snap); err != nil {
			return count, err
		}
	}
	return count, nil
}

// BulkSetEventType sets the event type on all events matching the filter.
// Returns the count of events updated.
func (s *Store) BulkSetEventType(f BulkFilter, newType string) (int, error) {
	s.mu.Lock()

	var groupMemberIDs map[int64]bool
	if f.Filter == "group" {
		groupMemberIDs = make(map[int64]bool)
		for _, m := range s.memberships {
			for _, g := range s.groups {
				if fmt.Sprintf("%d", g.ID) == f.Value || g.Name == f.Value {
					if m.GroupID == g.ID {
						groupMemberIDs[m.UserID] = true
					}
				}
			}
		}
	}

	count := 0
	for i, ev := range s.events {
		if matchesBulkFilter(ev, f, groupMemberIDs, s.users) {
			s.events[i].EventType = newType
			s.events[i].UpdatedAt = time.Now()
			count++
		}
	}
	snap := append([]Event(nil), s.events...)
	s.mu.Unlock()
	if count > 0 {
		if err := s.persist("events.json", snap); err != nil {
			return count, err
		}
	}
	return count, nil
}

// ── Gradual Backup ─────────────────────────────────────────────────────────────

const gradualBackupDefaultInterval = 15
const gradualBackupDefaultMax      = 48
const gradualBackupDir             = "snapshots"

// GetGradualBackupSettings reads the gradual backup configuration from disk.
// Returns sensible defaults if the file does not exist yet.
func (s *Store) GetGradualBackupSettings() GradualBackupSettings {
	raw, err := os.ReadFile(filepath.Join(s.dataDir, "gradual_backup.json"))
	var cfg GradualBackupSettings
	if err != nil || len(raw) < 2 {
		// File not saved yet → all defaults, enabled by default
		cfg.Enabled = true
		cfg.IntervalMinutes = gradualBackupDefaultInterval
		cfg.MaxSnapshots = gradualBackupDefaultMax
		return cfg
	}
	_ = json.Unmarshal(raw, &cfg)
	if cfg.IntervalMinutes <= 0 {
		cfg.IntervalMinutes = gradualBackupDefaultInterval
	}
	if cfg.MaxSnapshots <= 0 {
		cfg.MaxSnapshots = gradualBackupDefaultMax
	}
	return cfg
}

// SaveGradualBackupSettings writes gradual backup settings to disk.
func (s *Store) SaveGradualBackupSettings(cfg GradualBackupSettings) error {
	if cfg.IntervalMinutes <= 0 {
		cfg.IntervalMinutes = gradualBackupDefaultInterval
	}
	if cfg.MaxSnapshots <= 0 {
		cfg.MaxSnapshots = gradualBackupDefaultMax
	}
	data, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.dataDir, "gradual_backup.json"), data, 0644)
}

// snapshotDir returns the path to the snapshots subdirectory, creating it if needed.
func (s *Store) snapshotDir() string {
	d := filepath.Join(s.dataDir, gradualBackupDir)
	_ = os.MkdirAll(d, 0755)
	return d
}

// CreateGradualBackupSnapshot takes an in-memory ZIP of all data JSON files,
// encrypts it with AES-256-GCM using the admin password hash as key material,
// and saves it to the snapshots directory. Returns the filename of the snapshot.
func (s *Store) CreateGradualBackupSnapshot() (string, error) {
	snapDir := s.snapshotDir()
	filename := fmt.Sprintf("snapshot-%s.zip.enc", time.Now().UTC().Format("2006-01-02T150405"))
	dstPath := filepath.Join(snapDir, filename)

	// Build zip in memory
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	files := []string{
		"event_types.json", "preferences.json", "groups.json",
		"memberships.json", "layers.json", "events.json", "attachments.json",
		"alarms.json", "locks.json", "audit.json", "exercise.json",
		"comments.json", "phases.json", "templates.json", "roles.json",
		"registration.json", "invitations.json", "filter_presets.json",
		"event_versions.json", "auto_report_schedules.json",
	}
	for _, fn := range files {
		data, err := os.ReadFile(filepath.Join(s.dataDir, fn))
		if err != nil {
			continue // skip missing
		}
		fw, err := zw.Create(fn)
		if err != nil {
			continue
		}
		_, _ = fw.Write(data)
	}
	if err := zw.Close(); err != nil {
		return "", err
	}

	// Encrypt with admin password hash
	keyMaterial := s.GetAdminPasswordHash()
	encrypted, err := encryptBackupData(buf.Bytes(), keyMaterial)
	if err != nil {
		return "", fmt.Errorf("encrypt snapshot: %w", err)
	}
	if err := os.WriteFile(dstPath, encrypted, 0600); err != nil {
		return "", fmt.Errorf("write snapshot file: %w", err)
	}
	return filename, nil
}

// ListGradualBackupSnapshots returns metadata for all snapshot files, newest first.
func (s *Store) ListGradualBackupSnapshots() ([]GradualBackupSnapshot, error) {
	snapDir := s.snapshotDir()
	entries, err := os.ReadDir(snapDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []GradualBackupSnapshot{}, nil
		}
		return nil, err
	}
	var out []GradualBackupSnapshot
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || (!strings.HasSuffix(name, ".zip") && !strings.HasSuffix(name, ".zip.enc")) {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, GradualBackupSnapshot{
			Filename:  name,
			CreatedAt: fi.ModTime().UTC(),
			SizeBytes: fi.Size(),
		})
	}
	// Sort newest first
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// RestoreGradualBackupSnapshot restores data files from a named snapshot ZIP.
// Returns the count of files restored.
func (s *Store) RestoreGradualBackupSnapshot(filename string) (int, error) {
	// Sanitise: filename must be a plain name with no path separators
	if strings.ContainsAny(filename, "/\\") {
		return 0, fmt.Errorf("invalid snapshot filename")
	}
	snapPath := filepath.Join(s.snapshotDir(), filename)
	raw, err := os.ReadFile(snapPath)
	if err != nil {
		return 0, fmt.Errorf("snapshot not found: %w", err)
	}

	// Decrypt if not a plain zip (magic bytes "PK" = unencrypted; anything else = encrypted)
	if len(raw) < 2 || raw[0] != 0x50 || raw[1] != 0x4B {
		keyMaterial := s.GetAdminPasswordHash()
		decrypted, err := decryptBackupData(raw, keyMaterial)
		if err != nil {
			return 0, fmt.Errorf("decrypt snapshot: %w", err)
		}
		raw = decrypted
	}

	zr, err := zip.NewReader(&bytesReaderAt{raw}, int64(len(raw)))
	if err != nil {
		return 0, fmt.Errorf("invalid zip: %w", err)
	}
	allowed := map[string]bool{
		"event_types.json": true, "preferences.json": true, "groups.json": true,
		"memberships.json": true, "layers.json": true, "events.json": true,
		"attachments.json": true, "alarms.json": true, "locks.json": true,
		"exercise.json": true, "comments.json": true, "phases.json": true,
		"templates.json": true, "roles.json": true, "registration.json": true,
		"invitations.json": true, "filter_presets.json": true, "event_versions.json": true,
		"auto_report_schedules.json": true,
	}
	restored := 0
	for _, f := range zr.File {
		if !allowed[f.Name] {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		fdata, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			continue
		}
		if err := os.WriteFile(filepath.Join(s.dataDir, f.Name), fdata, 0644); err != nil {
			continue
		}
		restored++
	}
	return restored, nil
}

// bytesReaderAt wraps a byte slice to satisfy zip.NewReader's io.ReaderAt interface.
type bytesReaderAt struct{ d []byte }
func (b *bytesReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= int64(len(b.d)) { return 0, io.EOF }
	n := copy(p, b.d[off:])
	return n, nil
}
func (b *bytesReaderAt) Len() int64 { return int64(len(b.d)) }

// PruneGradualBackupSnapshots removes the oldest snapshots keeping at most max.
func (s *Store) PruneGradualBackupSnapshots(max int) error {
	if max <= 0 {
		max = gradualBackupDefaultMax
	}
	snapshots, err := s.ListGradualBackupSnapshots()
	if err != nil {
		return err
	}
	// snapshots is newest-first; delete beyond max
	for i := max; i < len(snapshots); i++ {
		_ = os.Remove(filepath.Join(s.snapshotDir(), snapshots[i].Filename))
	}
	return nil
}

// ── BulkDeleteEvents (existing, moved label) ───────────────────────────────

// BulkDeleteEvents deletes all events matching the filter.
// Returns the count of events deleted.
func (s *Store) BulkDeleteEvents(f BulkFilter) (int, error) {
	s.mu.Lock()

	var groupMemberIDs map[int64]bool
	if f.Filter == "group" {
		groupMemberIDs = make(map[int64]bool)
		for _, m := range s.memberships {
			for _, g := range s.groups {
				if fmt.Sprintf("%d", g.ID) == f.Value || g.Name == f.Value {
					if m.GroupID == g.ID {
						groupMemberIDs[m.UserID] = true
					}
				}
			}
		}
	}

	var kept []Event
	count := 0
	for _, ev := range s.events {
		if matchesBulkFilter(ev, f, groupMemberIDs, s.users) {
			count++
		} else {
			kept = append(kept, ev)
		}
	}
	if kept == nil {
		kept = []Event{}
	}
	s.events = kept
	snap := append([]Event(nil), s.events...)
	s.mu.Unlock()
	if count > 0 {
		if err := s.persist("events.json", snap); err != nil {
			return count, err
		}
	}
	return count, nil
}

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
