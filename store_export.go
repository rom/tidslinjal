package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ── Full export ────────────────────────────────────────────────────────────

type ExportData struct {
	Version      string             `json:"version"`
	ExportAt     time.Time          `json:"export_at"`
	Events       []Event            `json:"events"`
	Users        []UserPublic       `json:"users"`
	Groups       []Group            `json:"groups"`
	Layers       []Layer            `json:"layers"`
	Alarms       []Alarm            `json:"alarms"`
	Exercise     ExerciseSettings   `json:"exercise"`
	Phases       []ExercisePhase    `json:"phases"`
	EventTypes   []EventTypeDef     `json:"event_types,omitempty"`
	DecisionLog  []DecisionLogEntry `json:"decision_log,omitempty"`
	Comments     []EventComment     `json:"comments,omitempty"`
	RoleConfigs  []RoleConfig       `json:"role_configs,omitempty"`
	MapResources        []MapResource      `json:"map_resources,omitempty"`
	References          []ReferenceDoc     `json:"references,omitempty"`
	Rooms               []Room             `json:"rooms,omitempty"`
	CustomResourceTypes []CustomResourceType `json:"custom_resource_types,omitempty"`
	ClockSettings       []ExtraClock       `json:"clock_settings,omitempty"`
	DayLabels           []DayLabel         `json:"day_labels,omitempty"`
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
	eventTypes := make([]EventTypeDef, len(s.eventTypes))
	copy(eventTypes, s.eventTypes)
	decisionLog := make([]DecisionLogEntry, len(s.decisionLog))
	copy(decisionLog, s.decisionLog)
	comments := make([]EventComment, len(s.comments))
	copy(comments, s.comments)
	roleConfigs := make([]RoleConfig, len(s.roleConfigs))
	copy(roleConfigs, s.roleConfigs)
	mapResources := make([]MapResource, len(s.mapResources))
	copy(mapResources, s.mapResources)
	referenceDocs := make([]ReferenceDoc, len(s.referenceDocs))
	copy(referenceDocs, s.referenceDocs)
	rooms := make([]Room, len(s.rooms))
	copy(rooms, s.rooms)
	customResTypes := make([]CustomResourceType, len(s.customResourceTypes))
	copy(customResTypes, s.customResourceTypes)
	dayLabels := make([]DayLabel, len(s.dayLabels))
	copy(dayLabels, s.dayLabels)
	return ExportData{
		Version:             AppVersion,
		ExportAt:            time.Now(),
		Events:              events,
		Users:               users,
		Groups:              groups,
		Layers:              layers,
		Alarms:              alarms,
		Exercise:            s.exercise,
		Phases:              phases,
		EventTypes:          eventTypes,
		DecisionLog:         decisionLog,
		Comments:            comments,
		RoleConfigs:         roleConfigs,
		MapResources:        mapResources,
		References:          referenceDocs,
		Rooms:               rooms,
		CustomResourceTypes: customResTypes,
		DayLabels:           dayLabels,
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
	// Always include event types (needed for proper recovery)
	if include["event_types"] || include["events"] {
		out.EventTypes = make([]EventTypeDef, len(s.eventTypes))
		copy(out.EventTypes, s.eventTypes)
	}
	if include["decision_log"] && isPrivileged {
		out.DecisionLog = make([]DecisionLogEntry, len(s.decisionLog))
		copy(out.DecisionLog, s.decisionLog)
	}
	if include["comments"] {
		out.Comments = make([]EventComment, len(s.comments))
		copy(out.Comments, s.comments)
	}
	if include["role_configs"] && isPrivileged {
		out.RoleConfigs = make([]RoleConfig, len(s.roleConfigs))
		copy(out.RoleConfigs, s.roleConfigs)
	}
	if include["map_resources"] || include["maps"] {
		out.MapResources = make([]MapResource, len(s.mapResources))
		copy(out.MapResources, s.mapResources)
	}
	if include["references"] {
		out.References = make([]ReferenceDoc, len(s.referenceDocs))
		copy(out.References, s.referenceDocs)
	}
	if include["rooms"] {
		out.Rooms = make([]Room, len(s.rooms))
		copy(out.Rooms, s.rooms)
	}
	if include["resources"] || include["custom_resource_types"] {
		out.CustomResourceTypes = make([]CustomResourceType, len(s.customResourceTypes))
		copy(out.CustomResourceTypes, s.customResourceTypes)
		out.MapResources = make([]MapResource, len(s.mapResources))
		copy(out.MapResources, s.mapResources)
		out.Rooms = make([]Room, len(s.rooms))
		copy(out.Rooms, s.rooms)
	}
	if include["clock_settings"] {
		// Export clock settings from the requesting user's preferences
		prefs := s.getPreferencesLocked(userID)
		if len(prefs.ExtraClocks) > 0 {
			out.ClockSettings = make([]ExtraClock, len(prefs.ExtraClocks))
			copy(out.ClockSettings, prefs.ExtraClocks)
		}
	}
	if include["day_labels"] {
		out.DayLabels = make([]DayLabel, len(s.dayLabels))
		copy(out.DayLabels, s.dayLabels)
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
				Blocked:      true, // blocked until admin sets a password
				CreatedAt:    time.Now(),
			}
			if _, err := s.CreateUser(nu); err == nil {
				res.Users++
			}
		}
	}

	if include["event_types"] {
		for _, et := range data.EventTypes {
			et.ID = 0
			if _, err := s.CreateEventType(et); err == nil {
				res.Events++ // reuse counter
			}
		}
	}

	if include["decision_log"] && isPrivileged {
		for _, dl := range data.DecisionLog {
			dl.ID = 0
			dl.UserID = ownerID(dl.UserID)
			dl.UserName = ownerName(dl.UserName)
			if _, err := s.AddDecisionLogEntry(dl); err == nil {
				res.Events++ // reuse counter
			}
		}
	}

	if include["comments"] {
		for _, c := range data.Comments {
			c.ID = 0
			c.AuthorID = ownerID(c.AuthorID)
			c.AuthorName = ownerName(c.AuthorName)
			if _, err := s.CreateComment(c); err == nil {
				res.Events++ // reuse counter
			}
		}
	}

	if include["role_configs"] && isPrivileged {
		if len(data.RoleConfigs) > 0 {
			_ = s.SaveRoleConfigs(data.RoleConfigs)
		}
	}

	if include["day_labels"] {
		for _, dl := range data.DayLabels {
			dl.ID = 0
			dl.CreatedBy = ownerID(dl.CreatedBy)
			if _, err := s.AddDayLabel(dl); err == nil {
				res.Events++ // reuse counter
			}
		}
	}

	return res
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
	s.exercise = ExerciseSettings{IncludeWeekends: true}
	s.dayLabels = nil
	s.nextDayLabelID = 0
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
		{"exercise.json", ExerciseSettings{IncludeWeekends: true}},
		{"roles.json", []RoleConfig{}},
		{"day_labels.json", []DayLabel{}},
	} {
		if err := s.saveFile(file.name, file.val); err != nil {
			return err
		}
	}
	return nil
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
	s.exercise = ExerciseSettings{IncludeWeekends: true}
	s.decisionLog = nil
	s.nextDecisionLogID = 0
	s.eventLog = nil
	s.nextEventLogID = 0
	s.logBook = nil
	s.nextLogBookID = 0
	s.personReadyChecks = nil
	s.nextPersonReadyCheckID = 0
	s.polls = nil
	s.nextPollID = 0
	s.notifications = nil
	s.nextNotificationID = 0
	s.mapResources = nil
	s.nextMapResourceID = 0
	s.mapLocations = nil
	s.nextMapLocationID = 0
	s.referenceDocs = nil
	s.nextReferenceDocID = 0
	s.rooms = nil
	s.nextRoomID = 0
	s.customResourceTypes = nil
	s.nextCustomResTypeID = 0
	s.routingRules = nil
	s.nextRoutingRuleID = 0
	s.connectorConfigs = nil
	s.filterPresets = nil
	s.nextFilterPresetID = 0
	s.eventVersions = nil
	s.nextEventVersionID = 0
	s.autoReportSchedules = nil
	s.nextAutoReportScheduleID = 0
	s.dayLabels = nil
	s.nextDayLabelID = 0
	s.questionnaires = nil
	s.nextQuestionnaireID = 0
	s.checklistTemplates = nil
	s.nextChecklistTemplateID = 0
	s.checklistInstances = nil
	s.nextChecklistInstanceID = 0
	s.tags = nil
	s.nextTagID = 0

	// Save all cleared files
	files := map[string]interface{}{
		"event_types.json":            s.eventTypes,
		"preferences.json":            s.preferences,
		"groups.json":                 s.groups,
		"memberships.json":            s.memberships,
		"layers.json":                 s.layers,
		"events.json":                 s.events,
		"attachments.json":            s.attachments,
		"alarms.json":                 s.alarms,
		"locks.json":                  s.locks,
		"comments.json":               s.comments,
		"phases.json":                 s.phases,
		"templates.json":              s.templates,
		"exercise.json":               s.exercise,
		"decision_log.json":           s.decisionLog,
		"event_log.json":              s.eventLog,
		"log_book.json":               s.logBook,
		"person_ready_checks.json":    s.personReadyChecks,
		"polls.json":                  s.polls,
		"notifications.json":          s.notifications,
		"map_resources.json":          s.mapResources,
		"map_locations.json":          s.mapLocations,
		"references.json":             s.referenceDocs,
		"rooms.json":                  s.rooms,
		"custom_resource_types.json":  s.customResourceTypes,
		"routing_rules.json":          s.routingRules,
		"connectors.json":             s.connectorConfigs,
		"filter_presets.json":         s.filterPresets,
		"event_versions.json":         s.eventVersions,
		"auto_report_schedules.json":  s.autoReportSchedules,
		"day_labels.json":             s.dayLabels,
		"questionnaires.json":         s.questionnaires,
		"checklist_templates.json":    s.checklistTemplates,
		"checklist_instances.json":    s.checklistInstances,
		"tags.json":                   s.tags,
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

	// Clear reference document files
	refDir := filepath.Join(s.dataDir, "references")
	refEntries, _ := os.ReadDir(refDir)
	for _, e := range refEntries {
		os.Remove(filepath.Join(refDir, e.Name()))
	}

	return nil
}
