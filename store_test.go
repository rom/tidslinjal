package main

import (
	"fmt"
	"os"
	"testing"
	"time"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	s, err := NewStore(dir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return s
}

// ── Store initialisation ───────────────────────────────────────────────────────

func TestNewStore_EmptyDir(t *testing.T) {
	s := newTestStore(t)
	if s == nil {
		t.Fatal("expected non-nil store")
	}
	if len(s.GetUsers()) != 0 {
		t.Errorf("expected 0 users, got %d", len(s.GetUsers()))
	}
}

func TestNewStore_BadDir(t *testing.T) {
	f, err := os.CreateTemp("", "tidslinjal-test-*")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	defer os.Remove(f.Name())

	_, err = NewStore(f.Name() + "/subdir")
	if err == nil {
		t.Error("expected error for bad data dir path")
	}
}

// ── Event types ────────────────────────────────────────────────────────────────

func TestSeedEventTypes(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedEventTypes(); err != nil {
		t.Fatalf("SeedEventTypes: %v", err)
	}
	types := s.GetEventTypes()
	if len(types) < len(SystemEventTypes) {
		t.Errorf("expected at least %d event types, got %d", len(SystemEventTypes), len(types))
	}
	keySet := map[string]bool{}
	for _, et := range types {
		keySet[et.Key] = true
	}
	for _, sys := range SystemEventTypes {
		if !keySet[sys.Key] {
			t.Errorf("system event type %q not seeded", sys.Key)
		}
	}
}

func TestSeedEventTypes_Idempotent(t *testing.T) {
	s := newTestStore(t)
	s.SeedEventTypes() //nolint
	count1 := len(s.GetEventTypes())
	s.SeedEventTypes() //nolint
	count2 := len(s.GetEventTypes())
	if count1 != count2 {
		t.Errorf("SeedEventTypes not idempotent: %d vs %d", count1, count2)
	}
}

func TestEventTypeCRUD(t *testing.T) {
	s := newTestStore(t)

	// Create
	et, err := s.CreateEventType(EventTypeDef{
		Key:   "custom_type",
		Label: "Custom Type",
		Color: "#FF0000",
	})
	if err != nil {
		t.Fatalf("CreateEventType: %v", err)
	}
	if et.ID == 0 {
		t.Error("expected non-zero ID after create")
	}
	if et.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}

	// Get by key
	found, ok := s.GetEventTypeByKey("custom_type")
	if !ok {
		t.Fatal("GetEventTypeByKey: not found")
	}
	if found.Label != "Custom Type" {
		t.Errorf("label mismatch: %q", found.Label)
	}

	// Get by ID
	byID, ok := s.GetEventTypeByID(et.ID)
	if !ok {
		t.Fatal("GetEventTypeByID: not found")
	}
	if byID.Key != "custom_type" {
		t.Errorf("key mismatch: %q", byID.Key)
	}

	// Update
	et.Label = "Updated Custom"
	if err := s.UpdateEventType(et); err != nil {
		t.Fatalf("UpdateEventType: %v", err)
	}
	updated, _ := s.GetEventTypeByID(et.ID)
	if updated.Label != "Updated Custom" {
		t.Errorf("update did not persist: %q", updated.Label)
	}

	// Delete
	if err := s.DeleteEventType(et.ID); err != nil {
		t.Fatalf("DeleteEventType: %v", err)
	}
	_, ok = s.GetEventTypeByKey("custom_type")
	if ok {
		t.Error("expected event type to be deleted")
	}
}

func TestDeleteSystemEventType_Rejected(t *testing.T) {
	s := newTestStore(t)
	s.SeedEventTypes() //nolint
	var sysID int64
	for _, et := range s.GetEventTypes() {
		if et.IsSystem {
			sysID = et.ID
			break
		}
	}
	if sysID == 0 {
		t.Fatal("no system event type found")
	}
	if err := s.DeleteEventType(sysID); err == nil {
		t.Error("expected error when deleting system event type")
	}
}

// ── Users ──────────────────────────────────────────────────────────────────────

func TestUserCRUD(t *testing.T) {
	s := newTestStore(t)

	u, err := s.CreateUser(User{
		Username:     "alice",
		PasswordHash: "hash",
		DisplayName:  "Alice",
		Role:         RoleReadWrite,
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if u.ID == 0 {
		t.Error("expected non-zero ID")
	}
	if u.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}

	byID, ok := s.GetUserByID(u.ID)
	if !ok {
		t.Fatal("GetUserByID: not found")
	}
	if byID.Username != "alice" {
		t.Errorf("username mismatch: %q", byID.Username)
	}

	byName, ok := s.GetUserByUsername("alice")
	if !ok {
		t.Fatal("GetUserByUsername: not found")
	}
	if byName.ID != u.ID {
		t.Errorf("ID mismatch: %d vs %d", byName.ID, u.ID)
	}

	if len(s.GetUsers()) != 1 {
		t.Errorf("expected 1 user, got %d", len(s.GetUsers()))
	}

	u.DisplayName = "Alice Updated"
	if err := s.UpdateUser(u); err != nil {
		t.Fatalf("UpdateUser: %v", err)
	}
	up, _ := s.GetUserByID(u.ID)
	if up.DisplayName != "Alice Updated" {
		t.Errorf("update not persisted: %q", up.DisplayName)
	}

	if err := s.DeleteUser(u.ID); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}
	if len(s.GetUsers()) != 0 {
		t.Error("expected 0 users after delete")
	}
}

func TestUserGetByUsername_NotFound(t *testing.T) {
	s := newTestStore(t)
	_, ok := s.GetUserByUsername("nobody")
	if ok {
		t.Error("expected not found")
	}
}

func TestUser_AutoIncrementIDs(t *testing.T) {
	s := newTestStore(t)
	u1, _ := s.CreateUser(User{Username: "u1", Role: RoleRead})
	u2, _ := s.CreateUser(User{Username: "u2", Role: RoleRead})
	if u1.ID >= u2.ID {
		t.Errorf("expected auto-incrementing IDs: %d >= %d", u1.ID, u2.ID)
	}
}

func TestUser_Public(t *testing.T) {
	u := User{
		ID:           42,
		Username:     "bob",
		PasswordHash: "secret",
		DisplayName:  "Bob",
		Role:         RoleAdmin,
		CanLock:      true,
	}
	pub := u.Public()
	if pub.ID != 42 || pub.Username != "bob" {
		t.Errorf("Public() ID or Username wrong: %+v", pub)
	}
	// PasswordHash must NOT be in public view (no field for it in UserPublic)
	_ = pub // struct doesn't have PasswordHash field by design
}

// ── Preferences ────────────────────────────────────────────────────────────────

func TestPreferences_DefaultsForUnknownUser(t *testing.T) {
	s := newTestStore(t)
	p := s.GetPreferences(9999)
	if p.Theme != "light" {
		t.Errorf("expected default theme 'light', got %q", p.Theme)
	}
	if p.Language != "en" {
		t.Errorf("expected default language 'en', got %q", p.Language)
	}
	if p.DayEndHour != 24 {
		t.Errorf("expected default DayEndHour 24, got %d", p.DayEndHour)
	}
}

func TestPreferences_SaveAndRetrieve(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "bob", Role: RoleRead})
	prefs := UserPreferences{UserID: u.ID, Theme: "light", Language: "sv", Size: "large"}
	if err := s.SavePreferences(prefs); err != nil {
		t.Fatalf("SavePreferences: %v", err)
	}
	got := s.GetPreferences(u.ID)
	if got.Theme != "light" || got.Language != "sv" {
		t.Errorf("preferences not saved: theme=%q lang=%q", got.Theme, got.Language)
	}
}

func TestPreferences_Update(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "carol", Role: RoleRead})
	s.SavePreferences(UserPreferences{UserID: u.ID, Theme: "dark"})  //nolint
	s.SavePreferences(UserPreferences{UserID: u.ID, Theme: "light"}) //nolint
	if got := s.GetPreferences(u.ID); got.Theme != "light" {
		t.Errorf("expected updated theme 'light', got %q", got.Theme)
	}
}

// ── Groups ─────────────────────────────────────────────────────────────────────

func TestGroupCRUD(t *testing.T) {
	s := newTestStore(t)

	g, err := s.CreateGroup(Group{Name: "Alpha Team", Description: "Ops group"})
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	if g.ID == 0 {
		t.Error("expected non-zero ID")
	}

	byID, ok := s.GetGroupByID(g.ID)
	if !ok || byID.Name != "Alpha Team" {
		t.Errorf("GetGroupByID failed: ok=%v", ok)
	}
	if len(s.GetGroups()) != 1 {
		t.Errorf("expected 1 group, got %d", len(s.GetGroups()))
	}

	g.Name = "Alpha Team Updated"
	if err := s.UpdateGroup(g); err != nil {
		t.Fatalf("UpdateGroup: %v", err)
	}
	up, _ := s.GetGroupByID(g.ID)
	if up.Name != "Alpha Team Updated" {
		t.Errorf("update not persisted: %q", up.Name)
	}

	if err := s.DeleteGroup(g.ID); err != nil {
		t.Fatalf("DeleteGroup: %v", err)
	}
	if len(s.GetGroups()) != 0 {
		t.Error("expected 0 groups after delete")
	}
}

func TestGroupMembership(t *testing.T) {
	s := newTestStore(t)
	g, _ := s.CreateGroup(Group{Name: "Beta"})
	u1, _ := s.CreateUser(User{Username: "u1", Role: RoleRead})
	u2, _ := s.CreateUser(User{Username: "u2", Role: RoleRead})

	s.AddGroupMember(GroupMembership{GroupID: g.ID, UserID: u1.ID, Role: "member"}) //nolint
	s.AddGroupMember(GroupMembership{GroupID: g.ID, UserID: u2.ID, Role: "admin"})  //nolint

	if len(s.GetGroupMembers(g.ID)) != 2 {
		t.Errorf("expected 2 members, got %d", len(s.GetGroupMembers(g.ID)))
	}

	userGroups := s.GetUserGroups(u1.ID)
	if len(userGroups) != 1 || userGroups[0].GroupID != g.ID {
		t.Errorf("GetUserGroups: unexpected %v", userGroups)
	}

	s.RemoveGroupMember(g.ID, u1.ID) //nolint
	if len(s.GetGroupMembers(g.ID)) != 1 {
		t.Error("expected 1 member after removal")
	}
}

func TestGroupMembership_NoDuplicates(t *testing.T) {
	s := newTestStore(t)
	g, _ := s.CreateGroup(Group{Name: "Gamma"})
	u, _ := s.CreateUser(User{Username: "dup", Role: RoleRead})

	s.AddGroupMember(GroupMembership{GroupID: g.ID, UserID: u.ID, Role: "member"}) //nolint
	s.AddGroupMember(GroupMembership{GroupID: g.ID, UserID: u.ID, Role: "member"}) //nolint
	if len(s.GetGroupMembers(g.ID)) != 1 {
		t.Errorf("expected 1 member (no duplicates), got %d", len(s.GetGroupMembers(g.ID)))
	}
}

// ── Layers ─────────────────────────────────────────────────────────────────────

func TestLayerCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "owner", Role: RoleReadWrite})

	l, err := s.CreateLayer(Layer{
		Name:       "Intel Layer",
		OwnerID:    u.ID,
		OwnerName:  "owner",
		Visibility: "private",
		Color:      "#00FF00",
	})
	if err != nil {
		t.Fatalf("CreateLayer: %v", err)
	}
	if l.ID == 0 {
		t.Error("expected non-zero ID")
	}

	all := s.GetAllLayers()
	if len(all) != 1 {
		t.Errorf("expected 1 layer, got %d", len(all))
	}

	byID, ok := s.GetLayerByID(l.ID)
	if !ok || byID.Name != "Intel Layer" {
		t.Errorf("GetLayerByID: ok=%v name=%q", ok, byID.Name)
	}

	l.Name = "Intel Layer v2"
	if err := s.UpdateLayer(l); err != nil {
		t.Fatalf("UpdateLayer: %v", err)
	}
	up, _ := s.GetLayerByID(l.ID)
	if up.Name != "Intel Layer v2" {
		t.Errorf("update not persisted: %q", up.Name)
	}

	if err := s.DeleteLayer(l.ID); err != nil {
		t.Fatalf("DeleteLayer: %v", err)
	}
	if len(s.GetAllLayers()) != 0 {
		t.Error("expected 0 layers after delete")
	}
}

func TestLayerVisibility(t *testing.T) {
	s := newTestStore(t)
	owner, _ := s.CreateUser(User{Username: "owner", Role: RoleReadWrite})
	other, _ := s.CreateUser(User{Username: "other", Role: RoleRead})
	g, _ := s.CreateGroup(Group{Name: "G1"})
	s.AddGroupMember(GroupMembership{GroupID: g.ID, UserID: other.ID, Role: "member"}) //nolint

	// Private layer (only visible to owner)
	priv, _ := s.CreateLayer(Layer{Name: "Private", OwnerID: owner.ID, Visibility: "private"})
	// Public layer (visible to all)
	pub, _ := s.CreateLayer(Layer{Name: "Public", OwnerID: owner.ID, Visibility: "public"})
	// Group layer (visible to group members)
	grpLayer, _ := s.CreateLayer(Layer{Name: "Group", OwnerID: owner.ID, Visibility: "groups", GroupIDs: []int64{g.ID}})

	ownerLayers := s.GetLayersVisibleTo(owner.ID, []int64{})
	// Owner sees their own private + public + group layers
	seen := map[int64]bool{}
	for _, l := range ownerLayers {
		seen[l.ID] = true
	}
	if !seen[priv.ID] || !seen[pub.ID] {
		t.Error("owner should see private and public layers")
	}

	// Other user with group membership sees public + group
	otherLayers := s.GetLayersVisibleTo(other.ID, []int64{g.ID})
	seen2 := map[int64]bool{}
	for _, l := range otherLayers {
		seen2[l.ID] = true
	}
	if seen2[priv.ID] {
		t.Error("other user should NOT see owner's private layer")
	}
	if !seen2[pub.ID] || !seen2[grpLayer.ID] {
		t.Error("other user should see public and group layers")
	}
}

// ── Events ─────────────────────────────────────────────────────────────────────

func TestEventCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "planner", Role: RoleReadWrite})

	now := time.Now().Truncate(time.Second)
	end := now.Add(time.Hour)

	ev, err := s.CreateEvent(Event{
		Title:         "Team Briefing",
		EventType:     "mote",
		Status:        StatusPlanned,
		StartTime:     now,
		EndTime:       &end,
		CreatedBy:     u.ID,
		CreatedByName: "planner",
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if ev.ID == 0 {
		t.Error("expected non-zero ID")
	}

	events := s.GetEvents(now.Add(-time.Minute), now.Add(2*time.Hour), nil)
	if len(events) != 1 {
		t.Errorf("expected 1 event in range, got %d", len(events))
	}

	noEvents := s.GetEvents(now.Add(5*time.Hour), now.Add(6*time.Hour), nil)
	if len(noEvents) != 0 {
		t.Errorf("expected 0 events outside range, got %d", len(noEvents))
	}

	byID, ok := s.GetEventByID(ev.ID)
	if !ok || byID.Title != "Team Briefing" {
		t.Errorf("GetEventByID: ok=%v title=%q", ok, byID.Title)
	}

	ev.Title = "Updated Briefing"
	if err := s.UpdateEvent(ev); err != nil {
		t.Fatalf("UpdateEvent: %v", err)
	}
	up, _ := s.GetEventByID(ev.ID)
	if up.Title != "Updated Briefing" {
		t.Errorf("update not persisted: %q", up.Title)
	}

	if err := s.DeleteEvent(ev.ID); err != nil {
		t.Fatalf("DeleteEvent: %v", err)
	}
	_, ok = s.GetEventByID(ev.ID)
	if ok {
		t.Error("expected event to be deleted")
	}
}

func TestEventGetEvents_MultipleEvents(t *testing.T) {
	s := newTestStore(t)
	base := time.Now().Truncate(time.Hour)

	for i := range 5 {
		start := base.Add(time.Duration(i) * time.Hour)
		end := start.Add(30 * time.Minute)
		s.CreateEvent(Event{ //nolint
			Title:     fmt.Sprintf("Event %d", i),
			EventType: "event",
			Status:    StatusPlanned,
			StartTime: start,
			EndTime:   &end,
		})
	}

	all := s.GetEvents(base.Add(-time.Minute), base.Add(6*time.Hour), nil)
	if len(all) != 5 {
		t.Errorf("expected 5 events, got %d", len(all))
	}

	// Range ends before the 3rd event starts (base+2h): should only get events 0 and 1
	// Event 0: [base, base+30min], Event 1: [base+1h, base+1.5h]
	// Use base+1h45min as upper bound — strictly before event 2 at base+2h
	first2 := s.GetEvents(base.Add(-time.Minute), base.Add(105*time.Minute), nil)
	if len(first2) != 2 {
		t.Errorf("expected 2 events in partial range, got %d", len(first2))
	}
}

func TestEventStatus_Constants(t *testing.T) {
	statuses := []EventStatus{
		StatusPlanned, StatusActive, StatusRespondedTo,
		StatusCompleted, StatusSubmitted, StatusVerified,
		StatusRejected, StatusCancelled,
	}
	seen := map[EventStatus]bool{}
	for _, s := range statuses {
		if seen[s] {
			t.Errorf("duplicate status value: %q", s)
		}
		if string(s) == "" {
			t.Error("empty status value")
		}
		seen[s] = true
	}
}

// ── Audit log ──────────────────────────────────────────────────────────────────

func TestAuditLog_LogAndRetrieve(t *testing.T) {
	s := newTestStore(t)
	for i := range 5 {
		s.LogAudit(AuditEntry{ //nolint
			UserID:     1,
			UserName:   "admin",
			Action:     "created",
			EntityType: "event",
			EntityID:   int64(i + 1),
			Summary:    fmt.Sprintf("Created event %d", i+1),
		})
	}

	entries := s.GetAudit(0)
	if len(entries) != 5 {
		t.Errorf("expected 5 audit entries, got %d", len(entries))
	}
	// Newest first
	if len(entries) > 1 && entries[0].EntityID < entries[len(entries)-1].EntityID {
		t.Error("expected newest-first ordering")
	}
}

func TestAuditLog_LimitParam(t *testing.T) {
	s := newTestStore(t)
	for i := range 10 {
		s.LogAudit(AuditEntry{UserName: "admin", Summary: fmt.Sprintf("entry %d", i)}) //nolint
	}
	entries := s.GetAudit(3)
	if len(entries) != 3 {
		t.Errorf("expected 3 with limit=3, got %d", len(entries))
	}
}

func TestAuditLog_Cap(t *testing.T) {
	// This test writes 10001 entries (each with a disk write) — skip in short mode.
	if testing.Short() {
		t.Skip("slow: requires 10001 disk writes — run with -run TestAuditLog_Cap -timeout 300s")
	}
	s := newTestStore(t)
	for i := range 10005 {
		s.LogAudit(AuditEntry{UserName: "admin", Summary: fmt.Sprintf("entry %d", i)}) //nolint
	}
	all := s.GetAudit(0)
	if len(all) > 10000 {
		t.Errorf("audit log should be capped at 10000, got %d", len(all))
	}
}

// ── Exercise settings ──────────────────────────────────────────────────────────

func TestExerciseSettings(t *testing.T) {
	s := newTestStore(t)

	es := s.GetExerciseSettings()
	if es.Enabled {
		t.Error("expected exercise disabled by default")
	}

	now := time.Now().Format(time.RFC3339)
	if err := s.SaveExerciseSettings(ExerciseSettings{
		Enabled: true,
		Epoch:   now,
		Label:   "Exercise Alpha",
	}); err != nil {
		t.Fatalf("SaveExerciseSettings: %v", err)
	}

	got := s.GetExerciseSettings()
	if !got.Enabled {
		t.Error("expected exercise enabled after save")
	}
	if got.Label != "Exercise Alpha" {
		t.Errorf("label mismatch: %q", got.Label)
	}
}

// ── Alarms ─────────────────────────────────────────────────────────────────────

func TestAlarmCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "watcher", Role: RoleRead})

	al, err := s.CreateAlarm(Alarm{
		UserID:     u.ID,
		EventID:    1,
		EventTitle: "Important Meeting",
		EventTime:  time.Now().Add(time.Hour),
		LeadTime:   15,
	})
	if err != nil {
		t.Fatalf("CreateAlarm: %v", err)
	}
	if al.ID == 0 {
		t.Error("expected non-zero alarm ID")
	}
	if !al.IsActive {
		t.Error("new alarm should be active")
	}
	if al.Fired {
		t.Error("new alarm should not be fired")
	}

	alarms := s.GetAlarmsByUser(u.ID)
	if len(alarms) != 1 {
		t.Errorf("expected 1 alarm, got %d", len(alarms))
	}

	// Mark fired
	if err := s.MarkAlarmFired(al.ID); err != nil {
		t.Fatalf("MarkAlarmFired: %v", err)
	}

	// Delete
	if err := s.DeleteAlarm(al.ID, u.ID); err != nil {
		t.Fatalf("DeleteAlarm: %v", err)
	}
	if len(s.GetAlarmsByUser(u.ID)) != 0 {
		t.Error("expected 0 alarms after delete")
	}
}

func TestAlarm_GetActive(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "watcher2", Role: RoleRead})

	// Active unfired alarm
	s.CreateAlarm(Alarm{ //nolint
		UserID: u.ID, EventID: 1, EventTitle: "E1",
		EventTime: time.Now().Add(time.Hour), LeadTime: 15,
	})
	// Alarm that gets fired
	al2, _ := s.CreateAlarm(Alarm{
		UserID: u.ID, EventID: 2, EventTitle: "E2",
		EventTime: time.Now().Add(time.Hour), LeadTime: 5,
	})
	s.MarkAlarmFired(al2.ID) //nolint

	active := s.GetActiveAlarms()
	if len(active) != 1 {
		t.Errorf("expected 1 active alarm, got %d", len(active))
	}
	if active[0].EventTitle != "E1" {
		t.Errorf("wrong active alarm: %q", active[0].EventTitle)
	}
}

// ── Phases ──────────────────────────────────────────────────────────────────────

func TestPhaseCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "lead", Role: RoleTeamLead})
	now := time.Now()

	ph, err := s.CreatePhase(ExercisePhase{
		Name:      "Phase Alpha",
		Color:     "#FF0000",
		StartTime: now,
		EndTime:   now.Add(4 * time.Hour),
		Order:     0,
		CreatedBy: u.ID,
	})
	if err != nil {
		t.Fatalf("CreatePhase: %v", err)
	}
	if ph.ID == 0 {
		t.Error("expected non-zero phase ID")
	}

	if len(s.GetPhases()) != 1 {
		t.Errorf("expected 1 phase, got %d", len(s.GetPhases()))
	}

	ph.Name = "Phase Alpha (updated)"
	if err := s.UpdatePhase(ph); err != nil {
		t.Fatalf("UpdatePhase: %v", err)
	}
	up, ok := s.GetPhaseByID(ph.ID)
	if !ok || up.Name != "Phase Alpha (updated)" {
		t.Errorf("phase update not persisted: ok=%v name=%q", ok, up.Name)
	}

	if err := s.DeletePhase(ph.ID); err != nil {
		t.Fatalf("DeletePhase: %v", err)
	}
	if len(s.GetPhases()) != 0 {
		t.Error("expected 0 phases after delete")
	}
}

// ── Templates ──────────────────────────────────────────────────────────────────

func TestTemplateCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "planner", Role: RoleOpLead})

	tmpl, err := s.CreateTemplate(Template{
		Name:          "Daily Ops",
		Scope:         "private",
		CreatedBy:     u.ID,
		CreatedByName: "planner",
		Items: []TemplateItem{
			{Title: "Morning Brief", EventType: "mote", StartOffsetMin: 0, DurationMin: 30},
			{Title: "Sitrep", EventType: "reporting", StartOffsetMin: 240, DurationMin: 60},
		},
	})
	if err != nil {
		t.Fatalf("CreateTemplate: %v", err)
	}
	if tmpl.ID == 0 {
		t.Error("expected non-zero template ID")
	}

	all := s.GetTemplates(u.ID)
	if len(all) != 1 {
		t.Errorf("expected 1 template, got %d", len(all))
	}

	byID, ok := s.GetTemplate(tmpl.ID)
	if !ok || len(byID.Items) != 2 {
		t.Errorf("GetTemplate: ok=%v items=%d", ok, len(byID.Items))
	}

	if err := s.DeleteTemplate(tmpl.ID, u.ID, false); err != nil {
		t.Fatalf("DeleteTemplate: %v", err)
	}
	if len(s.GetTemplates(u.ID)) != 0 {
		t.Error("expected 0 templates after delete")
	}
}

// ── Sessions ───────────────────────────────────────────────────────────────────

func TestSessionCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "user1", Role: RoleRead})

	sess := Session{
		ID:        "abc123",
		UserID:    u.ID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	if err := s.CreateSession(sess); err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	got, ok := s.GetSession("abc123")
	if !ok {
		t.Fatal("GetSession: not found")
	}
	if got.UserID != u.ID {
		t.Errorf("session UserID mismatch: %d", got.UserID)
	}

	if err := s.DeleteSession("abc123"); err != nil {
		t.Fatalf("DeleteSession: %v", err)
	}
	_, ok = s.GetSession("abc123")
	if ok {
		t.Error("expected session to be deleted")
	}
}

func TestSession_Expired(t *testing.T) {
	s := newTestStore(t)
	s.CreateSession(Session{ //nolint
		ID:        "expired-sess",
		UserID:    1,
		ExpiresAt: time.Now().Add(-time.Hour),
	})
	_, ok := s.GetSession("expired-sess")
	if ok {
		t.Error("expired session should not be returned")
	}
}

func TestSession_CleanExpired(t *testing.T) {
	s := newTestStore(t)
	s.CreateSession(Session{ID: "active", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)})   //nolint
	s.CreateSession(Session{ID: "expired", UserID: 2, ExpiresAt: time.Now().Add(-time.Hour)}) //nolint
	s.CleanExpiredSessions()
	_, ok := s.GetSession("active")
	if !ok {
		t.Error("active session should still be valid")
	}
}

// ── Locks ──────────────────────────────────────────────────────────────────────

func TestLockCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "lockadmin", Role: RoleAdmin, CanLock: true})
	now := time.Now()

	lk, err := s.CreateLock(LockedSlot{
		StartTime:    now,
		EndTime:      now.Add(2 * time.Hour),
		Reason:       "Maintenance window",
		Scope:        "all",
		LockedBy:     u.ID,
		LockedByName: u.Username,
	})
	if err != nil {
		t.Fatalf("CreateLock: %v", err)
	}
	if lk.ID == 0 {
		t.Error("expected non-zero lock ID")
	}

	if len(s.GetLocks()) != 1 {
		t.Errorf("expected 1 lock, got %d", len(s.GetLocks()))
	}

	if err := s.DeleteLock(lk.ID); err != nil {
		t.Fatalf("DeleteLock: %v", err)
	}
	if len(s.GetLocks()) != 0 {
		t.Error("expected 0 locks after delete")
	}
}

func TestLockAuthorized_NonOwnerRejected(t *testing.T) {
	s := newTestStore(t)
	owner, _ := s.CreateUser(User{Username: "owner", Role: RoleAdmin, CanLock: true})
	other, _ := s.CreateUser(User{Username: "other", Role: RoleReadWrite})
	now := time.Now()

	lk, _ := s.CreateLock(LockedSlot{
		StartTime: now, EndTime: now.Add(time.Hour),
		Scope: "all", LockedBy: owner.ID,
	})
	if err := s.DeleteLockAuthorized(lk.ID, other.ID, false); err == nil {
		t.Error("expected error when non-owner deletes lock")
	}
}

// ── Comments ───────────────────────────────────────────────────────────────────

func TestCommentCRUD(t *testing.T) {
	s := newTestStore(t)
	u, _ := s.CreateUser(User{Username: "commenter", Role: RoleRead})
	now := time.Now()
	end := now.Add(time.Hour)
	ev, _ := s.CreateEvent(Event{
		Title:     "Commented Event",
		EventType: "event",
		Status:    StatusPlanned,
		StartTime: now, EndTime: &end,
		CreatedBy: u.ID,
	})

	cmt, err := s.CreateComment(EventComment{
		EventID:    ev.ID,
		AuthorID:   u.ID,
		AuthorName: "commenter",
		Content:    "First comment",
	})
	if err != nil {
		t.Fatalf("CreateComment: %v", err)
	}
	if cmt.ID == 0 {
		t.Error("expected non-zero comment ID")
	}

	comments := s.GetCommentsByEvent(ev.ID)
	if len(comments) != 1 || comments[0].Content != "First comment" {
		t.Errorf("expected 1 comment 'First comment', got %d: %v", len(comments), comments)
	}
}

// ── Role ordering ─────────────────────────────────────────────────────────────

func TestHasRole(t *testing.T) {
	cases := []struct {
		user     Role
		required Role
		want     bool
	}{
		{RoleAdmin, RoleRead, true},
		{RoleAdmin, RoleAdmin, true},
		{RoleRead, RoleAdmin, false},
		{RoleReadWrite, RoleTeamLead, false},
		{RoleTeamLead, RoleReadWrite, true},
		{RoleOpLead, RoleTeamLead, true},
		{RoleAdmin, RoleOpLead, true},
	}
	for _, c := range cases {
		got := hasRole(c.user, c.required)
		if got != c.want {
			t.Errorf("hasRole(%q, %q) = %v, want %v", c.user, c.required, got, c.want)
		}
	}
}

// ── Concurrency safety ─────────────────────────────────────────────────────────

func TestStore_ConcurrentReads(t *testing.T) {
	s := newTestStore(t)
	for i := range 5 {
		s.CreateUser(User{Username: fmt.Sprintf("u%d", i), Role: RoleRead}) //nolint
	}
	done := make(chan struct{}, 20)
	for range 20 {
		go func() {
			_ = s.GetUsers()
			done <- struct{}{}
		}()
	}
	for range 20 {
		<-done
	}
}

func TestStore_ConcurrentWrites(t *testing.T) {
	s := newTestStore(t)
	errs := make(chan error, 10)
	for i := range 10 {
		i := i
		go func() {
			_, err := s.CreateUser(User{Username: fmt.Sprintf("concurrent-%d", i), Role: RoleRead})
			errs <- err
		}()
	}
	for range 10 {
		if err := <-errs; err != nil {
			t.Errorf("concurrent write failed: %v", err)
		}
	}
	if len(s.GetUsers()) != 10 {
		t.Errorf("expected 10 users after concurrent writes, got %d", len(s.GetUsers()))
	}
}
