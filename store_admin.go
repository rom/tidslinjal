package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

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

// GetDBStats returns database statistics for the legend panel.
// Filesystem walk is cached for 60 seconds to avoid expensive I/O on every call.
func (s *Store) GetDBStats() map[string]any {
	// Filesystem walk outside the lock to avoid holding it during I/O
	var totalSize int64
	var createdAt time.Time

	s.mu.RLock()
	hasCached := s.cachedDBStats != nil && time.Since(s.cachedDBStatsAt) < 60*time.Second
	if hasCached {
		if v, ok := s.cachedDBStats["size_bytes"].(int64); ok {
			totalSize = v
		}
		if v, ok := s.cachedDBStats["created_at"].(string); ok {
			if t2, err := time.Parse(time.RFC3339, v); err == nil {
				createdAt = t2
			}
		}
	}
	s.mu.RUnlock()

	if !hasCached {
		filepath.Walk(s.dataDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if !info.IsDir() {
				totalSize += info.Size()
				if createdAt.IsZero() || info.ModTime().Before(createdAt) {
					createdAt = info.ModTime()
				}
			}
			return nil
		})
	}

	// H-08 fix: use full Lock (not RLock) since we write to cachedDBStats/cachedDBStatsAt
	s.mu.Lock()
	defer s.mu.Unlock()
	result := map[string]any{
		"created_at":      createdAt.Format(time.RFC3339),
		"size_bytes":      totalSize,
		"events":          len(s.events),
		"users":           len(s.users),
		"groups":          len(s.groups),
		"layers":          len(s.layers),
		"alarms":          len(s.alarms),
		"phases":          len(s.phases),
		"audit_entries":   len(s.audit),
		"attachments":     len(s.attachments),
		"comments":        len(s.comments),
		"templates":       len(s.templates),
		"polls":           len(s.polls),
		"log_book":        len(s.logBook),
		"decision_log":    len(s.decisionLog),
		"map_locations":   len(s.mapLocations),
		"rooms":           len(s.rooms),
		"notifications":   len(s.notifications),
		"reference_docs":  len(s.referenceDocs),
	}
	// Cache for next call (avoid filesystem walk)
	s.cachedDBStats = result
	s.cachedDBStatsAt = time.Now()
	return result
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

// ── Test Stats ────────────────────────────────────────────────────────────────

func (s *Store) GetTestStats() TestStats {
	s.mu.RLock()
	cached := s.cachedTestStats
	cacheTime := s.cachedTestStatsAt
	s.mu.RUnlock()

	// Return cached results if less than 5 minutes old
	if !cacheTime.IsZero() && time.Since(cacheTime) < 5*time.Minute {
		return cached
	}

	stats := runGoTests()

	s.mu.Lock()
	s.cachedTestStats = stats
	s.cachedTestStatsAt = time.Now()
	s.mu.Unlock()

	return stats
}

func runGoTests() TestStats {
	// V-19 fix: only allow test execution when GO_TEST_ENABLED env var is set
	if os.Getenv("GO_TEST_ENABLED") != "1" {
		return TestStats{} // test execution disabled in production
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "go", "test", "-count=1", "-v", "-cover", "./...")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.Run() // ignore error — tests may fail

	output := stdout.String() + stderr.String()
	var passed, failed, skipped, total int
	var coverage float64

	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--- PASS:") {
			passed++
			total++
		} else if strings.HasPrefix(trimmed, "--- FAIL:") {
			failed++
			total++
		} else if strings.HasPrefix(trimmed, "--- SKIP:") {
			skipped++
			total++
		}
		// Parse coverage: "coverage: 42.3% of statements"
		if idx := strings.Index(trimmed, "coverage:"); idx >= 0 {
			rest := trimmed[idx+len("coverage:"):]
			rest = strings.TrimSpace(rest)
			if pctIdx := strings.Index(rest, "%"); pctIdx > 0 {
				if v, err := strconv.ParseFloat(rest[:pctIdx], 64); err == nil {
					coverage = v
				}
			}
		}
	}

	return TestStats{
		TestCases: total,
		UnitTests: total,
		Passed:    passed,
		Failed:    failed,
		Skipped:   skipped,
		Coverage:  coverage,
	}
}
