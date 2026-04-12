package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
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
	meetingConfig        MeetingConfig
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
	diary                []DiaryEntry
	decisionLog          []DecisionLogEntry
	eventLog             []EventLogEntry
	logBook              []LogBookEntry
	mapLocations         []MapLocation
	federatedIdPs        []FederatedIdP
	trustRealms          []TrustRealm
	rooms                []Room
	customResourceTypes  []CustomResourceType
	personReadyChecks    []PersonReadyCheck
	polls                []Poll
	notifications        []Notification
	mapResources         []MapResource
	referenceDocs        []ReferenceDoc
	dayLabels            []DayLabel
	rateLimitSettings    RateLimitSettings
	geoblockingSettings  GeoblockingSettings
	encryptionSettings   EncryptionSettings
	ipBlacklist          IPBlacklistSettings
	resourceNotes        []ResourceNote
	resourceStars        []ResourceStar
	questionnaires       []PollQuestionnaire
	checklistTemplates   []ChecklistTemplate
	checklistInstances   []ChecklistInstance
	tags                 []Tag
	boards               []Board
	boardItems           []BoardItem
	keyTerrainEntries    []KeyTerrainEntry
	keyTerrainSettings   KeyTerrainSettings
	keyTerrainSnapshots  []KeyTerrainSnapshot
	reportArchive        []ReportArchiveEntry
	reportIngestConfig   ReportIngestConfig
	startupText          string
	geoItems             []map[string]any
	staffDuties          []StaffDuty
	staffMembers         []StaffMember
	areasOfResp          []AreaOfResponsibility
	resourceIncidents    []ResourceIncident
	messageArchive       []MessageArchiveEntry
	spreadsheets         []Spreadsheet

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
	nextDiaryID              int64
	nextDecisionLogID        int64
	nextMapLocationID        int64
	nextRoomID               int64
	nextEventLogID           int64
	nextLogBookID            int64
	nextCustomResTypeID      int64
	nextPersonReadyCheckID   int64
	nextPollID               int64
	nextNotificationID       int64
	nextMapResourceID        int64
	nextReferenceDocID       int64
	nextDayLabelID           int64
	nextResourceNoteID       int64
	nextResourceStarID       int64
	nextQuestionnaireID      int64
	nextChecklistTemplateID  int64
	nextChecklistInstanceID  int64
	nextTagID                int64
	nextBoardID              int64
	nextBoardItemID          int64
	nextKeyTerrainID         int64
	nextKTSnapshotID         int64
	nextReportArchiveID      int64
	nextStaffDutyID          int64
	nextStaffMemberID        int64
	nextAreaID               int64
	nextResourceIncidentID   int64
	nextMessageArchiveID     int64
	nextMessageSeqNum        int
	nextSpreadsheetID        int64

	// O(1) lookup indexes — kept in sync with the underlying slices.
	userByID    map[int64]User
	sessionByID map[string]Session
	eventByID   map[int64]int // maps event ID → index in s.events slice

	// Cached test stats
	cachedTestStats   TestStats
	cachedTestStatsAt time.Time

	// Cached DB stats (filesystem walk is expensive)
	cachedDBStats     map[string]any
	cachedDBStatsAt   time.Time

	// writeMu serialises JSON file writes so they never race each other.
	// It is acquired AFTER s.mu has been released, keeping s.mu hold-time minimal.
	writeMu sync.Mutex
}

func NewStore(dataDir string) (*Store, error) {
	s := &Store{dataDir: dataDir}
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "attachments"), 0700); err != nil {
		return nil, fmt.Errorf("create attachments dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "map_resources"), 0700); err != nil {
		return nil, fmt.Errorf("create map_resources dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "references"), 0700); err != nil {
		return nil, fmt.Errorf("create references dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "board_attachments"), 0700); err != nil {
		return nil, fmt.Errorf("create board_attachments dir: %w", err)
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
	s.exercise = ExerciseSettings{IncludeWeekends: true} // default to including weekends
	s.loadFile("exercise.json", &s.exercise)
	s.loadFile("comments.json", &s.comments)
	s.loadFile("phases.json", &s.phases)
	s.loadFile("templates.json", &s.templates)
	s.loadFile("roles.json", &s.roleConfigs)
	s.loadFile("registration.json", &s.registrationSettings)
	s.loadFile("invitations.json", &s.invitations)
	s.loadFile("oidc.json", &s.oidcSettings)
	s.loadFile("mail.json", &s.mailConfig)
	s.loadFile("meeting.json", &s.meetingConfig)
	s.loadFile("syslog.json", &s.syslogConfig)
	// Set session management defaults before loading (they're overridden if present in JSON)
	s.securitySettings = SecuritySettings{
		SessionTimeHours:          100,
		IdleTimeoutHours:          100,
		LogoffOnPasswordChange:    true,
		RotateSessionOnRoleChange: true,
		// Session hijack protection: bind to IP (subnet) and user-agent by default
		SessionBindIP:     true,
		SessionBindIPMode: "subnet",
		SessionBindUA:     true,
	}
	s.loadFile("security.json", &s.securitySettings)
	// Apply defaults for session management if JSON had zero values
	if s.securitySettings.SessionTimeHours == 0 {
		s.securitySettings.SessionTimeHours = 100
	}
	if s.securitySettings.IdleTimeoutHours == 0 {
		s.securitySettings.IdleTimeoutHours = 100
	}
	if s.securitySettings.SessionBindIPMode == "" {
		s.securitySettings.SessionBindIPMode = "subnet"
	}
	s.loadFile("tls.json", &s.tlsConfig)
	s.loadFile("apikeys.json", &s.apiKeys)
	s.loadFile("filter_presets.json", &s.filterPresets)
	s.loadFile("event_versions.json", &s.eventVersions)
	s.loadFile("auto_report_schedules.json", &s.autoReportSchedules)
	s.loadFile("routing_rules.json", &s.routingRules)
	s.loadFile("connectors.json", &s.connectorConfigs)
	s.loadFile("diary.json", &s.diary)
	s.loadFile("decision_log.json", &s.decisionLog)
	s.loadFile("map_locations.json", &s.mapLocations)
	s.loadFile("federated_idps.json", &s.federatedIdPs)
	s.loadFile("trust_realms.json", &s.trustRealms)
	s.loadFile("rooms.json", &s.rooms)
	s.loadFile("custom_resource_types.json", &s.customResourceTypes)
	s.loadFile("event_log.json", &s.eventLog)
	s.loadFile("log_book.json", &s.logBook)
	s.loadFile("person_ready_checks.json", &s.personReadyChecks)
	s.loadFile("polls.json", &s.polls)
	s.loadFile("notifications.json", &s.notifications)
	s.loadFile("map_resources.json", &s.mapResources)
	s.loadFile("references.json", &s.referenceDocs)
	s.loadFile("day_labels.json", &s.dayLabels)
	s.rateLimitSettings = RateLimitSettings{LoginLimit: 10, RegistrationLimit: 5, PasswordResetLimit: 5}
	s.loadFile("rate_limits.json", &s.rateLimitSettings)
	s.loadFile("geoblocking.json", &s.geoblockingSettings)
	s.loadFile("encryption.json", &s.encryptionSettings)
	s.loadFile("ip_blacklist.json", &s.ipBlacklist)
	s.loadFile("questionnaires.json", &s.questionnaires)
	s.loadFile("checklist_templates.json", &s.checklistTemplates)
	s.loadFile("checklist_instances.json", &s.checklistInstances)
	s.loadFile("tags.json", &s.tags)
	s.loadFile("boards.json", &s.boards)
	s.loadFile("board_items.json", &s.boardItems)
	s.loadFile("key_terrain.json", &s.keyTerrainEntries)
	s.loadFile("key_terrain_settings.json", &s.keyTerrainSettings)
	s.loadFile("key_terrain_snapshots.json", &s.keyTerrainSnapshots)
	s.loadFile("report_archive.json", &s.reportArchive)
	s.loadFile("report_ingest_config.json", &s.reportIngestConfig)
	s.loadFile("message_archive.json", &s.messageArchive)
	s.loadFile("spreadsheets.json", &s.spreadsheets)

	// Load startup text (persisted as {"text":"..."})
	var startupTextData map[string]string
	s.loadFile("startup_text.json", &startupTextData)
	if v, ok := startupTextData["text"]; ok {
		s.startupText = v
	}

	// Staff toolbox data
	s.loadFile("staff_duties.json", &s.staffDuties)
	s.loadFile("staff_members.json", &s.staffMembers)
	s.loadFile("areas_of_responsibility.json", &s.areasOfResp)

	// Load geo items (items placed on the geographical/OSM map)
	s.loadFile("geo_items.json", &s.geoItems)

	for _, x := range s.eventTypes {
		if x.ID > s.nextEventTypeID {
			s.nextEventTypeID = x.ID
		}
	}
	// Ensure "pause" event type exists
	hasPause := false
	for _, et := range s.eventTypes {
		if et.Key == "pause" {
			hasPause = true
			break
		}
	}
	if !hasPause {
		s.nextEventTypeID++
		s.eventTypes = append(s.eventTypes, EventTypeDef{
			ID:      s.nextEventTypeID,
			Key:     "pause",
			Label:   "Pause",
			LabelSV: "Paus",
			LabelFR: "Pause",
			Color:   "#95A5A6",
			Icon:    "⏸",
		})
		_ = s.persist("event_types.json", s.eventTypes)
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
	for _, x := range s.diary {
		if x.ID > s.nextDiaryID {
			s.nextDiaryID = x.ID
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
	for _, x := range s.rooms {
		if x.ID > s.nextRoomID {
			s.nextRoomID = x.ID
		}
	}
	for _, x := range s.customResourceTypes {
		if x.ID > s.nextCustomResTypeID {
			s.nextCustomResTypeID = x.ID
		}
	}
	for _, x := range s.eventLog {
		if x.ID > s.nextEventLogID {
			s.nextEventLogID = x.ID
		}
	}
	for _, x := range s.logBook {
		if x.ID > s.nextLogBookID {
			s.nextLogBookID = x.ID
		}
	}
	for _, x := range s.personReadyChecks {
		if x.ID > s.nextPersonReadyCheckID {
			s.nextPersonReadyCheckID = x.ID
		}
	}
	for _, x := range s.polls {
		if x.ID > s.nextPollID {
			s.nextPollID = x.ID
		}
	}
	for _, x := range s.notifications {
		if x.ID > s.nextNotificationID {
			s.nextNotificationID = x.ID
		}
	}
	for _, x := range s.mapResources {
		if x.ID > s.nextMapResourceID {
			s.nextMapResourceID = x.ID
		}
	}
	for _, x := range s.referenceDocs {
		if x.ID > s.nextReferenceDocID {
			s.nextReferenceDocID = x.ID
		}
	}
	for _, x := range s.dayLabels {
		if x.ID > s.nextDayLabelID {
			s.nextDayLabelID = x.ID
		}
	}
	for _, x := range s.questionnaires {
		if x.ID > s.nextQuestionnaireID {
			s.nextQuestionnaireID = x.ID
		}
	}
	for _, x := range s.checklistTemplates {
		if x.ID > s.nextChecklistTemplateID {
			s.nextChecklistTemplateID = x.ID
		}
	}
	for _, x := range s.checklistInstances {
		if x.ID > s.nextChecklistInstanceID {
			s.nextChecklistInstanceID = x.ID
		}
	}
	for _, x := range s.tags {
		if x.ID > s.nextTagID {
			s.nextTagID = x.ID
		}
	}
	for _, x := range s.boards {
		if x.ID > s.nextBoardID {
			s.nextBoardID = x.ID
		}
	}
	for _, x := range s.boardItems {
		if x.ID > s.nextBoardItemID {
			s.nextBoardItemID = x.ID
		}
	}
	for _, x := range s.keyTerrainEntries {
		if x.ID > s.nextKeyTerrainID {
			s.nextKeyTerrainID = x.ID
		}
	}
	for _, x := range s.keyTerrainSnapshots {
		if x.ID > s.nextKTSnapshotID {
			s.nextKTSnapshotID = x.ID
		}
	}
	for _, x := range s.reportArchive {
		if x.ID > s.nextReportArchiveID {
			s.nextReportArchiveID = x.ID
		}
	}
	for _, x := range s.messageArchive {
		if x.ID > s.nextMessageArchiveID {
			s.nextMessageArchiveID = x.ID
		}
		if x.SeqNum > s.nextMessageSeqNum {
			s.nextMessageSeqNum = x.SeqNum
		}
	}
	for _, x := range s.spreadsheets {
		if x.ID > s.nextSpreadsheetID {
			s.nextSpreadsheetID = x.ID
		}
	}
	for _, x := range s.staffDuties {
		if x.ID > s.nextStaffDutyID {
			s.nextStaffDutyID = x.ID
		}
	}
	for _, x := range s.staffMembers {
		if x.ID > s.nextStaffMemberID {
			s.nextStaffMemberID = x.ID
		}
	}
	for _, x := range s.areasOfResp {
		if x.ID > s.nextAreaID {
			s.nextAreaID = x.ID
		}
	}
	// Build O(1) lookup indexes.
	s.rebuildUserIdx()
	s.rebuildSessionIdx()
	s.rebuildEventIdx()
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

// rebuildEventIdx rebuilds the O(1) event lookup map from the events slice.
func (s *Store) rebuildEventIdx() {
	s.eventByID = make(map[int64]int, len(s.events))
	for i, e := range s.events {
		s.eventByID[e.ID] = i
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

// FlushAll persists all critical in-memory data to disk.
// Called during graceful shutdown to ensure no data loss.
func (s *Store) FlushAll() error {
	s.mu.RLock()
	snapUsers := append([]User(nil), s.users...)
	snapEvents := append([]Event(nil), s.events...)
	snapSessions := append([]Session(nil), s.sessions...)
	s.mu.RUnlock()

	var firstErr error
	for _, item := range []struct {
		name string
		data interface{}
	}{
		{"users.json", snapUsers},
		{"events.json", snapEvents},
		{"sessions.json", snapSessions},
	} {
		if err := s.persist(item.name, item.data); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("flush %s: %w", item.name, err)
		}
	}
	return firstErr
}

// DataDir returns the path to the data directory.
func (s *Store) DataDir() string {
	return s.dataDir
}

func (s *Store) loadFile(filename string, v interface{}) {
	f, err := os.Open(filepath.Join(s.dataDir, filename))
	if err != nil {
		return // file doesn't exist yet — that's fine on first run
	}
	defer f.Close()
	if err := json.NewDecoder(f).Decode(v); err != nil {
		log.Printf("[WARN] failed to decode %s: %v (data may be empty or corrupt)", filename, err)
	}
}

func (s *Store) saveFile(filename string, v interface{}) error {
	path := filepath.Join(s.dataDir, filename)
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
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
	// M-13 fix: fsync before rename to prevent data loss on power failure
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	f.Close()
	return os.Rename(tmp, path)
}
