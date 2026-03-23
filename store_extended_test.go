package main

import (
	"fmt"
	"net/http"
	"testing"
	"time"
)

// ══════════════════════════════════════════════════════════════════════════════
// Store-level unit tests for previously untested functions
// ══════════════════════════════════════════════════════════════════════════════

func newTestStore2(t *testing.T) *Store {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if err := store.SeedEventTypes(); err != nil {
		t.Fatalf("SeedEventTypes: %v", err)
	}
	return store
}

// ── Board Store ──────────────────────────────────────────────────────────────

func TestStore_Board_CRUD(t *testing.T) {
	s := newTestStore2(t)

	// Create
	b, err := s.CreateBoard(Board{Name: "Test Board", Visibility: "global", Columns: []BoardCol{{ID: "1", Name: "Open"}}})
	if err != nil {
		t.Fatalf("CreateBoard: %v", err)
	}
	if b.ID == 0 {
		t.Error("expected non-zero board ID")
	}
	if b.Name != "Test Board" {
		t.Errorf("expected name 'Test Board', got %q", b.Name)
	}

	// GetByID
	got := s.GetBoardByID(b.ID)
	if got == nil {
		t.Fatal("GetBoardByID returned nil")
	}
	if got.Name != "Test Board" {
		t.Errorf("expected name 'Test Board', got %q", got.Name)
	}

	// Update
	got.Name = "Updated Board"
	if err := s.UpdateBoard(*got); err != nil {
		t.Fatalf("UpdateBoard: %v", err)
	}
	got2 := s.GetBoardByID(b.ID)
	if got2.Name != "Updated Board" {
		t.Errorf("expected name 'Updated Board', got %q", got2.Name)
	}

	// Delete
	if err := s.DeleteBoard(b.ID); err != nil {
		t.Fatalf("DeleteBoard: %v", err)
	}
	if s.GetBoardByID(b.ID) != nil {
		t.Error("expected nil after delete")
	}
}

func TestStore_Board_GetBoards_Empty(t *testing.T) {
	s := newTestStore2(t)
	boards := s.GetBoards()
	if len(boards) != 0 {
		t.Errorf("expected 0 boards, got %d", len(boards))
	}
}

func TestStore_Board_GetBoards_Multiple(t *testing.T) {
	s := newTestStore2(t)
	s.CreateBoard(Board{Name: "Board A", Visibility: "global"})
	s.CreateBoard(Board{Name: "Board B", Visibility: "private"})
	boards := s.GetBoards()
	if len(boards) != 2 {
		t.Errorf("expected 2 boards, got %d", len(boards))
	}
}

func TestStore_Board_UpdateNotFound(t *testing.T) {
	s := newTestStore2(t)
	err := s.UpdateBoard(Board{ID: 999, Name: "Ghost"})
	if err == nil {
		t.Error("expected error for nonexistent board")
	}
}

func TestStore_Board_DeleteNotFound(t *testing.T) {
	s := newTestStore2(t)
	err := s.DeleteBoard(999)
	if err == nil {
		t.Error("expected error for nonexistent board")
	}
}

func TestStore_Board_Delete_CascadesItems(t *testing.T) {
	s := newTestStore2(t)
	b, _ := s.CreateBoard(Board{Name: "Cascade", Visibility: "global", Columns: []BoardCol{{ID: "1", Name: "Col"}}})
	for i := 0; i < 5; i++ {
		s.CreateBoardItem(BoardItem{BoardID: b.ID, ColumnID: "1", Subject: "Item"})
	}
	if len(s.GetBoardItems(b.ID)) != 5 {
		t.Fatal("expected 5 items before delete")
	}
	s.DeleteBoard(b.ID)
	if len(s.GetBoardItems(b.ID)) != 0 {
		t.Error("expected 0 items after board delete")
	}
}

func TestStore_BoardItem_CRUD(t *testing.T) {
	s := newTestStore2(t)
	b, _ := s.CreateBoard(Board{Name: "B", Visibility: "global", Columns: []BoardCol{{ID: "1", Name: "Col"}}})

	// Create
	item, err := s.CreateBoardItem(BoardItem{BoardID: b.ID, ColumnID: "1", Subject: "Task 1"})
	if err != nil {
		t.Fatalf("CreateBoardItem: %v", err)
	}
	if item.ID == 0 {
		t.Error("expected non-zero item ID")
	}
	if item.Subject != "Task 1" {
		t.Errorf("expected subject 'Task 1', got %q", item.Subject)
	}

	// GetByID
	got := s.GetBoardItemByID(item.ID)
	if got == nil {
		t.Fatal("GetBoardItemByID returned nil")
	}

	// Update
	got.Subject = "Updated Task"
	got.Note = "A note"
	if err := s.UpdateBoardItem(*got); err != nil {
		t.Fatalf("UpdateBoardItem: %v", err)
	}
	got2 := s.GetBoardItemByID(item.ID)
	if got2.Subject != "Updated Task" {
		t.Errorf("expected 'Updated Task', got %q", got2.Subject)
	}
	if got2.Note != "A note" {
		t.Errorf("expected note 'A note', got %q", got2.Note)
	}

	// Delete
	if err := s.DeleteBoardItem(item.ID); err != nil {
		t.Fatalf("DeleteBoardItem: %v", err)
	}
	if s.GetBoardItemByID(item.ID) != nil {
		t.Error("expected nil after delete")
	}
}

func TestStore_BoardItem_GetItems_FiltersByBoard(t *testing.T) {
	s := newTestStore2(t)
	b1, _ := s.CreateBoard(Board{Name: "B1", Visibility: "global"})
	b2, _ := s.CreateBoard(Board{Name: "B2", Visibility: "global"})
	s.CreateBoardItem(BoardItem{BoardID: b1.ID, ColumnID: "1", Subject: "B1 Item"})
	s.CreateBoardItem(BoardItem{BoardID: b2.ID, ColumnID: "1", Subject: "B2 Item"})
	s.CreateBoardItem(BoardItem{BoardID: b1.ID, ColumnID: "1", Subject: "B1 Item 2"})

	items1 := s.GetBoardItems(b1.ID)
	items2 := s.GetBoardItems(b2.ID)
	if len(items1) != 2 {
		t.Errorf("expected 2 items for B1, got %d", len(items1))
	}
	if len(items2) != 1 {
		t.Errorf("expected 1 item for B2, got %d", len(items2))
	}
}

func TestStore_BoardItem_GetByID_NotFound(t *testing.T) {
	s := newTestStore2(t)
	if s.GetBoardItemByID(999) != nil {
		t.Error("expected nil for nonexistent item")
	}
}

func TestStore_BoardItem_UpdateNotFound(t *testing.T) {
	s := newTestStore2(t)
	err := s.UpdateBoardItem(BoardItem{ID: 999, Subject: "Ghost"})
	if err == nil {
		t.Error("expected error for nonexistent item")
	}
}

func TestStore_BoardItem_DeleteNotFound(t *testing.T) {
	s := newTestStore2(t)
	err := s.DeleteBoardItem(999)
	if err == nil {
		t.Error("expected error for nonexistent item")
	}
}

func TestStore_BoardItem_Move(t *testing.T) {
	s := newTestStore2(t)
	b, _ := s.CreateBoard(Board{Name: "B", Columns: []BoardCol{{ID: "1", Name: "Open"}, {ID: "2", Name: "Done"}}})
	item, _ := s.CreateBoardItem(BoardItem{BoardID: b.ID, ColumnID: "1", Subject: "Movable", SortOrder: 0})

	if err := s.MoveBoardItem(item.ID, "2", 0); err != nil {
		t.Fatalf("MoveBoardItem: %v", err)
	}
	got := s.GetBoardItemByID(item.ID)
	if got.ColumnID != "2" {
		t.Errorf("expected column '2', got %q", got.ColumnID)
	}
}

func TestStore_BoardItem_MoveNotFound(t *testing.T) {
	s := newTestStore2(t)
	err := s.MoveBoardItem(999, "1", 0)
	if err == nil {
		t.Error("expected error for nonexistent item")
	}
}

func TestStore_BoardItem_MoveToBoard(t *testing.T) {
	s := newTestStore2(t)
	b1, _ := s.CreateBoard(Board{Name: "B1", Columns: []BoardCol{{ID: "1", Name: "Col"}}})
	b2, _ := s.CreateBoard(Board{Name: "B2", Columns: []BoardCol{{ID: "a", Name: "Col A"}}})
	item, _ := s.CreateBoardItem(BoardItem{BoardID: b1.ID, ColumnID: "1", Subject: "Cross-board"})

	if err := s.MoveBoardItemToBoard(item.ID, b2.ID, "a"); err != nil {
		t.Fatalf("MoveBoardItemToBoard: %v", err)
	}
	got := s.GetBoardItemByID(item.ID)
	if got.BoardID != b2.ID {
		t.Errorf("expected boardID %d, got %d", b2.ID, got.BoardID)
	}
	if got.ColumnID != "a" {
		t.Errorf("expected column 'a', got %q", got.ColumnID)
	}
}

func TestStore_BoardItem_History(t *testing.T) {
	s := newTestStore2(t)
	b, _ := s.CreateBoard(Board{Name: "B", Columns: []BoardCol{{ID: "1", Name: "Col"}}})
	item, _ := s.CreateBoardItem(BoardItem{BoardID: b.ID, ColumnID: "1", Subject: "Historic"})

	err := s.AddBoardItemHistory(item.ID, BoardHistory{Action: "created", UserName: "admin"})
	if err != nil {
		t.Fatalf("AddBoardItemHistory: %v", err)
	}
	err = s.AddBoardItemHistory(item.ID, BoardHistory{Action: "moved", UserName: "admin"})
	if err != nil {
		t.Fatalf("AddBoardItemHistory: %v", err)
	}

	got := s.GetBoardItemByID(item.ID)
	if len(got.History) != 2 {
		t.Errorf("expected 2 history entries, got %d", len(got.History))
	}
}

func TestStore_BoardItem_HistoryNotFound(t *testing.T) {
	s := newTestStore2(t)
	err := s.AddBoardItemHistory(999, BoardHistory{Action: "test"})
	if err == nil {
		t.Error("expected error for nonexistent item")
	}
}

func TestStore_BoardItem_Attachment(t *testing.T) {
	s := newTestStore2(t)
	b, _ := s.CreateBoard(Board{Name: "B", Columns: []BoardCol{{ID: "1", Name: "Col"}}})
	item, _ := s.CreateBoardItem(BoardItem{BoardID: b.ID, ColumnID: "1", Subject: "Attached"})

	err := s.AddBoardItemAttachment(item.ID, BoardAttachment{Filename: "test.pdf", Size: 1024})
	if err != nil {
		t.Fatalf("AddBoardItemAttachment: %v", err)
	}
	got := s.GetBoardItemByID(item.ID)
	if len(got.Attachments) != 1 {
		t.Errorf("expected 1 attachment, got %d", len(got.Attachments))
	}
	if got.Attachments[0].Filename != "test.pdf" {
		t.Errorf("expected filename 'test.pdf', got %q", got.Attachments[0].Filename)
	}
}

// ── Session Store ────────────────────────────────────────────────────────────

func TestStore_DeleteSessionsForUser(t *testing.T) {
	s := newTestStore2(t)
	s.CreateSession(Session{ID: "s1", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)})
	s.CreateSession(Session{ID: "s2", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)})
	s.CreateSession(Session{ID: "s3", UserID: 2, ExpiresAt: time.Now().Add(time.Hour)})

	s.DeleteSessionsForUser(1)

	// User 1 sessions gone
	if _, ok := s.GetSession("s1"); ok {
		t.Error("expected session s1 deleted")
	}
	if _, ok := s.GetSession("s2"); ok {
		t.Error("expected session s2 deleted")
	}
	// User 2 session remains
	if _, ok := s.GetSession("s3"); !ok {
		t.Error("expected session s3 to remain")
	}
}

func TestStore_DeleteSessionsForUserExcept(t *testing.T) {
	s := newTestStore2(t)
	s.CreateSession(Session{ID: "keep", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)})
	s.CreateSession(Session{ID: "drop1", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)})
	s.CreateSession(Session{ID: "drop2", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)})

	s.DeleteSessionsForUserExcept(1, "keep")

	if _, ok := s.GetSession("keep"); !ok {
		t.Error("expected 'keep' session to remain")
	}
	if _, ok := s.GetSession("drop1"); ok {
		t.Error("expected 'drop1' deleted")
	}
	if _, ok := s.GetSession("drop2"); ok {
		t.Error("expected 'drop2' deleted")
	}
}

func TestStore_DeleteAllSessions(t *testing.T) {
	s := newTestStore2(t)
	s.CreateSession(Session{ID: "a", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)})
	s.CreateSession(Session{ID: "b", UserID: 2, ExpiresAt: time.Now().Add(time.Hour)})
	s.DeleteAllSessions()
	if _, ok := s.GetSession("a"); ok {
		t.Error("expected all sessions deleted")
	}
	if _, ok := s.GetSession("b"); ok {
		t.Error("expected all sessions deleted")
	}
}

// ── Editing Locks ────────────────────────────────────────────────────────────

func TestStore_EditingLock_Acquire(t *testing.T) {
	s := newTestStore2(t)
	lock, ok := s.AcquireEditingLock(1, 100, "Alice")
	if !ok {
		t.Fatal("expected lock acquisition to succeed")
	}
	if lock.EventID != 1 || lock.UserID != 100 {
		t.Errorf("unexpected lock: %+v", lock)
	}
}

func TestStore_EditingLock_Conflict(t *testing.T) {
	s := newTestStore2(t)
	s.AcquireEditingLock(1, 100, "Alice")
	_, ok := s.AcquireEditingLock(1, 200, "Bob")
	if ok {
		t.Error("expected conflict — another user holds the lock")
	}
}

func TestStore_EditingLock_SameUserRefresh(t *testing.T) {
	s := newTestStore2(t)
	s.AcquireEditingLock(1, 100, "Alice")
	lock, ok := s.AcquireEditingLock(1, 100, "Alice")
	if !ok {
		t.Error("expected same user to refresh lock")
	}
	if lock.UserID != 100 {
		t.Error("expected same user ID in refreshed lock")
	}
}

func TestStore_EditingLock_Release(t *testing.T) {
	s := newTestStore2(t)
	s.AcquireEditingLock(1, 100, "Alice")
	s.ReleaseEditingLock(1, 100)
	_, ok := s.GetEditingLock(1)
	if ok {
		t.Error("expected lock to be released")
	}
}

func TestStore_EditingLock_GetAll(t *testing.T) {
	s := newTestStore2(t)
	s.AcquireEditingLock(1, 100, "Alice")
	s.AcquireEditingLock(2, 200, "Bob")
	locks := s.GetAllEditingLocks()
	if len(locks) != 2 {
		t.Errorf("expected 2 active locks, got %d", len(locks))
	}
}

func TestStore_EditingLock_ExpiredIgnored(t *testing.T) {
	s := newTestStore2(t)
	// Manually add an expired lock
	s.editingLocks = append(s.editingLocks, EditingLock{
		EventID: 1, UserID: 100, UserName: "Alice",
		LockedAt: time.Now().Add(-5 * time.Minute), ExpiresAt: time.Now().Add(-1 * time.Minute),
	})
	locks := s.GetAllEditingLocks()
	if len(locks) != 0 {
		t.Errorf("expected 0 active locks (expired), got %d", len(locks))
	}
	// New user can acquire after expiry
	_, ok := s.AcquireEditingLock(1, 200, "Bob")
	if !ok {
		t.Error("expected acquisition after expiry")
	}
}

// ── Event Versions ───────────────────────────────────────────────────────────

func TestStore_EventVersion_CRUD(t *testing.T) {
	s := newTestStore2(t)
	ev, _ := s.CreateEvent(Event{Title: "Versioned", StartTime: time.Now()})

	v1, err := s.CreateEventVersion(EventVersion{EventID: ev.ID, ChangeNote: "V1", ChangedBy: 1})
	if err != nil {
		t.Fatalf("CreateEventVersion: %v", err)
	}
	if v1.Version != 1 {
		t.Errorf("expected version 1, got %d", v1.Version)
	}

	v2, _ := s.CreateEventVersion(EventVersion{EventID: ev.ID, ChangeNote: "V2", ChangedBy: 1})
	if v2.Version != 2 {
		t.Errorf("expected version 2, got %d", v2.Version)
	}

	versions := s.GetEventVersions(ev.ID)
	if len(versions) != 2 {
		t.Fatalf("expected 2 versions, got %d", len(versions))
	}
	// Newest first
	if versions[0].Version != 2 {
		t.Error("expected newest version first")
	}
}

func TestStore_GetEventsInRange(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	s.CreateEvent(Event{Title: "E1", StartTime: now, EventType: "event"})
	events := s.GetEventsInRange(now.Add(-time.Hour), now.Add(time.Hour))
	if len(events) < 1 {
		t.Error("expected at least 1 event from GetEventsInRange")
	}
}

// ── Overlap Detection ────────────────────────────────────────────────────────

func TestStore_CheckOverlaps_NoOverlap(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	end := now.Add(time.Hour)
	respID := int64(1)
	s.CreateEvent(Event{Title: "Early", StartTime: now.Add(-3 * time.Hour), EventType: "event", ResponsibleID: &respID})

	warnings := s.CheckOverlaps(now, &end, &respID, nil, 0)
	if len(warnings) != 0 {
		t.Errorf("expected no overlaps, got %d", len(warnings))
	}
}

func TestStore_CheckOverlaps_Overlap(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	end := now.Add(2 * time.Hour)
	respID := int64(1)
	// Create overlapping event
	evEnd := now.Add(90 * time.Minute)
	s.CreateEvent(Event{Title: "Overlapper", StartTime: now.Add(30 * time.Minute), EndTime: &evEnd, EventType: "event", ResponsibleID: &respID})

	warnings := s.CheckOverlaps(now, &end, &respID, nil, 0)
	if len(warnings) == 0 {
		t.Error("expected overlap warning")
	}
}

func TestStore_CheckOverlaps_ExcludesSelf(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	end := now.Add(time.Hour)
	respID := int64(1)
	ev, _ := s.CreateEvent(Event{Title: "Self", StartTime: now, EndTime: &end, EventType: "event", ResponsibleID: &respID})

	warnings := s.CheckOverlaps(now, &end, &respID, nil, ev.ID)
	if len(warnings) != 0 {
		t.Errorf("expected self-excluded, got %d warnings", len(warnings))
	}
}

func TestStore_CheckOverlaps_NoUsers(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	end := now.Add(time.Hour)
	warnings := s.CheckOverlaps(now, &end, nil, nil, 0)
	if warnings != nil {
		t.Error("expected nil when no users to check")
	}
}

// ── Store Admin ──────────────────────────────────────────────────────────────

func TestStore_GetDBStats(t *testing.T) {
	s := newTestStore2(t)
	stats := s.GetDBStats()
	// Should contain expected keys
	for _, key := range []string{"events", "users", "layers", "groups"} {
		if _, ok := stats[key]; !ok {
			t.Errorf("GetDBStats missing key: %s", key)
		}
	}
}

func TestStore_BulkSetEventStatus(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	s.CreateEvent(Event{Title: "E1", StartTime: now, EventType: "event", Status: StatusPlanned})
	s.CreateEvent(Event{Title: "E2", StartTime: now, EventType: "event", Status: StatusPlanned})
	s.CreateEvent(Event{Title: "E3", StartTime: now, EventType: "mote", Status: StatusPlanned})

	count, err := s.BulkSetEventStatus(BulkFilter{Filter: "type", Value: "event"}, StatusActive)
	if err != nil {
		t.Fatalf("BulkSetEventStatus: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 events updated, got %d", count)
	}

	events := s.GetEventsInRange(now.Add(-time.Hour), now.Add(time.Hour))
	for _, e := range events {
		if e.EventType == "event" && e.Status != StatusActive {
			t.Errorf("expected event %q to be active, got %s", e.Title, e.Status)
		}
		if e.EventType == "mote" && e.Status != StatusPlanned {
			t.Errorf("expected mote to remain planned, got %s", e.Status)
		}
	}
}

func TestStore_BulkSetEventStatus_All(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	s.CreateEvent(Event{Title: "A", StartTime: now, EventType: "event", Status: StatusPlanned})
	s.CreateEvent(Event{Title: "B", StartTime: now, EventType: "mote", Status: StatusPlanned})

	count, _ := s.BulkSetEventStatus(BulkFilter{Filter: "all"}, StatusCompleted)
	if count != 2 {
		t.Errorf("expected 2, got %d", count)
	}
}

func TestStore_BulkDeleteEvents(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	s.CreateEvent(Event{Title: "Keep", StartTime: now, EventType: "mote", Status: StatusPlanned})
	s.CreateEvent(Event{Title: "Del1", StartTime: now, EventType: "event", Status: StatusPlanned})
	s.CreateEvent(Event{Title: "Del2", StartTime: now, EventType: "event", Status: StatusPlanned})

	count, err := s.BulkDeleteEvents(BulkFilter{Filter: "type", Value: "event"})
	if err != nil {
		t.Fatalf("BulkDeleteEvents: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 deleted, got %d", count)
	}

	remaining := s.GetEventsInRange(now.Add(-time.Hour), now.Add(time.Hour))
	if len(remaining) != 1 {
		t.Errorf("expected 1 remaining, got %d", len(remaining))
	}
	if remaining[0].Title != "Keep" {
		t.Errorf("expected 'Keep' to remain, got %q", remaining[0].Title)
	}
}

// ── Store Export/Reset ───────────────────────────────────────────────────────

func TestStore_ResetToEmpty(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	// Create admin user first (store alone doesn't seed users)
	admin, err := s.CreateUser(User{Username: "admin", DisplayName: "Admin", Role: RoleAdmin, PasswordHash: "x", Vetted: true})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	s.CreateEvent(Event{Title: "E1", StartTime: now, EventType: "event"})
	s.CreateEvent(Event{Title: "E2", StartTime: now, EventType: "event"})

	err = s.ResetToEmpty(admin, false)
	if err != nil {
		t.Fatalf("ResetToEmpty: %v", err)
	}

	events := s.GetEventsInRange(now.Add(-time.Hour), now.Add(time.Hour))
	if len(events) != 0 {
		t.Errorf("expected 0 events after reset, got %d", len(events))
	}

	users := s.GetUsers()
	if len(users) != 1 {
		t.Errorf("expected 1 user (admin) after reset, got %d", len(users))
	}
}

func TestStore_GetExportDataFiltered(t *testing.T) {
	s := newTestStore2(t)
	now := time.Now()
	admin, _ := s.CreateUser(User{Username: "exporter", Role: RoleAdmin, PasswordHash: "x", Vetted: true})
	s.CreateEvent(Event{Title: "Export Me", StartTime: now, EventType: "event", CreatedBy: admin.ID})

	data := s.GetExportDataFiltered(admin.ID, true, nil)
	if data.Version == "" {
		t.Error("expected version in export data")
	}
	// Verify export ran without panic and returned non-empty version
	if data.Version != AppVersion {
		t.Errorf("expected version %q, got %q", AppVersion, data.Version)
	}
}

// ── Middleware Pure Functions ─────────────────────────────────────────────────

func TestHasRole_AllRoles(t *testing.T) {
	tests := []struct {
		user, required Role
		want           bool
	}{
		{RoleAdmin, RoleAdmin, true},
		{RoleAdmin, RoleRead, true},
		{RoleAdmin, RoleOpLead, true},
		{RoleRead, RoleAdmin, false},
		{RoleRead, RoleRead, true},
		{RoleReporter, RoleRead, true},
		{RoleReporter, RoleReadWrite, false},
		{RoleReadWrite, RoleReporter, true},
		{RoleReadWrite, RoleTeamLead, false},
		{RoleTeamLead, RoleReadWrite, true},
		{RoleTeamLead, RoleTeamLead, true},
		{RoleDeputyTeamLead, RoleTeamLead, true},
		{RoleDeputyTeamLead, RoleOpLead, false},
		{RoleOpLead, RoleTeamLead, true},
		{RoleOpLead, RoleAdmin, false},
		{RoleDeputyOpLead, RoleOpLead, true},
		{RoleStaffOfficer, RoleOpLead, true},
		{RoleStaffAssistant, RoleOpLead, true},
		{RoleStaffOfficerFull, RoleOpLead, true},
		{RoleStaffOfficer, RoleAdmin, false},
		{RoleObserver, RoleRead, true},
		{RoleObserver, RoleReporter, false},
	}
	for _, tc := range tests {
		got := hasRole(tc.user, tc.required)
		if got != tc.want {
			t.Errorf("hasRole(%q, %q) = %v, want %v", tc.user, tc.required, got, tc.want)
		}
	}
}

func TestCanEditMasterTimeline(t *testing.T) {
	tests := []struct {
		role Role
		want bool
	}{
		{RoleAdmin, true},
		{RoleOpLead, true},
		{RoleDeputyOpLead, true},
		{RoleStaffOfficer, true},
		{RoleTeamLead, false},
		{RoleReadWrite, false},
		{RoleRead, false},
		{RoleObserver, false},
	}
	for _, tc := range tests {
		got := canEditMasterTimeline(tc.role)
		if got != tc.want {
			t.Errorf("canEditMasterTimeline(%q) = %v, want %v", tc.role, got, tc.want)
		}
	}
}

func TestClientIP_Direct(t *testing.T) {
	r := &http.Request{RemoteAddr: "203.0.113.1:12345", Header: http.Header{}}
	ip := clientIP(r)
	if ip != "203.0.113.1" {
		t.Errorf("expected 203.0.113.1, got %s", ip)
	}
}

func TestClientIP_WithProxy_Loopback(t *testing.T) {
	r := &http.Request{RemoteAddr: "127.0.0.1:12345", Header: http.Header{}}
	r.Header.Set("X-Forwarded-For", "198.51.100.5, 10.0.0.1")
	ip := clientIP(r)
	if ip != "198.51.100.5" {
		t.Errorf("expected 198.51.100.5, got %s", ip)
	}
}

func TestClientIP_WithProxy_Private(t *testing.T) {
	r := &http.Request{RemoteAddr: "10.0.0.1:12345", Header: http.Header{}}
	r.Header.Set("X-Real-IP", "198.51.100.99")
	ip := clientIP(r)
	if ip != "198.51.100.99" {
		t.Errorf("expected 198.51.100.99, got %s", ip)
	}
}

func TestClientIP_IgnoresProxy_FromPublic(t *testing.T) {
	r := &http.Request{RemoteAddr: "203.0.113.50:12345", Header: http.Header{}}
	r.Header.Set("X-Forwarded-For", "198.51.100.5")
	ip := clientIP(r)
	// Should ignore X-Forwarded-For since peer is public
	if ip != "203.0.113.50" {
		t.Errorf("expected 203.0.113.50, got %s", ip)
	}
}

func TestClientIP_NoPort(t *testing.T) {
	r := &http.Request{RemoteAddr: "203.0.113.1", Header: http.Header{}}
	ip := clientIP(r)
	if ip != "203.0.113.1" {
		t.Errorf("expected 203.0.113.1, got %s", ip)
	}
}

func TestValidateCSRF_Matching(t *testing.T) {
	r := &http.Request{Header: http.Header{}}
	r.AddCookie(&http.Cookie{Name: "csrf_token", Value: "tok123"})
	r.Header.Set("X-CSRF-Token", "tok123")
	if !validateCSRF(r) {
		t.Error("expected valid CSRF with matching tokens")
	}
}

func TestValidateCSRF_Mismatch(t *testing.T) {
	r := &http.Request{Header: http.Header{}}
	r.AddCookie(&http.Cookie{Name: "csrf_token", Value: "tok123"})
	r.Header.Set("X-CSRF-Token", "wrong")
	if validateCSRF(r) {
		t.Error("expected invalid CSRF with mismatched tokens")
	}
}

func TestValidateCSRF_MissingHeader(t *testing.T) {
	r := &http.Request{Header: http.Header{}}
	r.AddCookie(&http.Cookie{Name: "csrf_token", Value: "tok123"})
	if validateCSRF(r) {
		t.Error("expected invalid CSRF with missing header")
	}
}

func TestValidateCSRF_FallbackXRequestedWith(t *testing.T) {
	r := &http.Request{Header: http.Header{}}
	// No csrf_token cookie, but X-Requested-With present
	r.Header.Set("X-Requested-With", "XMLHttpRequest")
	if !validateCSRF(r) {
		t.Error("expected valid CSRF via X-Requested-With fallback")
	}
}

func TestValidateCSRF_NothingProvided(t *testing.T) {
	r := &http.Request{Header: http.Header{}}
	if validateCSRF(r) {
		t.Error("expected invalid CSRF when nothing provided")
	}
}

func TestPathSegment(t *testing.T) {
	tests := []struct {
		path string
		n    int
		want string
	}{
		{"/api/events/42", 2, "42"},
		{"/api/events/42/comments", 3, "comments"},
		{"/api/boards", 1, "boards"},
		{"/api", 1, ""},
		{"/", 0, ""},
	}
	for _, tc := range tests {
		r, _ := http.NewRequest("GET", tc.path, nil)
		got := pathSegment(r, tc.n)
		if got != tc.want {
			t.Errorf("pathSegment(%q, %d) = %q, want %q", tc.path, tc.n, got, tc.want)
		}
	}
}

// ── Concurrent Store Access ──────────────────────────────────────────────────

func TestStore_ConcurrentBoardOps(t *testing.T) {
	s := newTestStore2(t)
	b, _ := s.CreateBoard(Board{Name: "Concurrent", Visibility: "global", Columns: []BoardCol{{ID: "1", Name: "Col"}}})

	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func(i int) {
			s.CreateBoardItem(BoardItem{BoardID: b.ID, ColumnID: "1", Subject: "Item"})
			done <- true
		}(i)
	}
	for i := 0; i < 10; i++ {
		<-done
	}
	items := s.GetBoardItems(b.ID)
	if len(items) != 10 {
		t.Errorf("expected 10 items after concurrent creates, got %d", len(items))
	}
}

func TestStore_ConcurrentSessionOps(t *testing.T) {
	s := newTestStore2(t)
	done := make(chan bool, 20)
	for i := 0; i < 20; i++ {
		go func(i int) {
			sessID := fmt.Sprintf("csess_%d", i)
			s.CreateSession(Session{ID: sessID, UserID: int64(i), ExpiresAt: time.Now().Add(time.Hour)})
			done <- true
		}(i)
	}
	for i := 0; i < 20; i++ {
		<-done
	}
}

func TestStore_ConcurrentEditingLocks(t *testing.T) {
	s := newTestStore2(t)
	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func(i int) {
			s.AcquireEditingLock(int64(i), int64(i+100), "User")
			done <- true
		}(i)
	}
	for i := 0; i < 10; i++ {
		<-done
	}
	locks := s.GetAllEditingLocks()
	if len(locks) != 10 {
		t.Errorf("expected 10 locks, got %d", len(locks))
	}
}

