package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Key Terrain access control ─────────────────────────────────────────────
// Default: OpL, staff_officer, staff_officers_assistance have write access.
// Everyone else has read access.

// canWriteKeyTerrain checks if user has key_terrain_write capability.
// Defaults to true for OpLead+, staff roles; checks role config for custom roles.
func (app *App) canWriteKeyTerrain(user *User) bool {
	if app.effectiveHasRole(user, RoleAdmin) {
		return true
	}
	for _, rc := range app.store.GetRoleConfigs() {
		if rc.Key == string(user.Role) {
			if v, ok := rc.Capabilities["key_terrain_write"]; ok {
				return v
			}
			break
		}
	}
	switch user.Role {
	case RoleOpLead, RoleDeputyOpLead, RoleStaffOfficer, RoleStaffAssistant, RoleStaffOfficerFull, RoleTeamLead, "deputy_teamlead":
		return true
	}
	return false
}

// canReadKeyTerrain checks if user has key_terrain_read capability.
// Defaults to true for everyone (all roles).
func (app *App) canReadKeyTerrain(user *User) bool {
	if app.effectiveHasRole(user, RoleAdmin) {
		return true
	}
	for _, rc := range app.store.GetRoleConfigs() {
		if rc.Key == string(user.Role) {
			if v, ok := rc.Capabilities["key_terrain_read"]; ok {
				return v
			}
			return true
		}
	}
	return true
}

// broadcastKeyTerrainChange notifies all connected clients that the KT board changed.
func (app *App) broadcastKeyTerrainChange(action string) {
	data := fmt.Sprintf(`{"action":"%s"}`, action)
	app.broker.BroadcastAll(SSEMessage{Event: "key_terrain_change", Data: data})
}

// ── Handlers ───────────────────────────────────────────────────────────────

func (app *App) handleGetKeyTerrainEntries(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canReadKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	entries := app.store.GetKeyTerrainEntries()
	if entries == nil {
		entries = []KeyTerrainEntry{}
	}
	// Sync linked capability data: if a KT entry references a capability,
	// overlay the capability's identity fields (name, zone, owner) so
	// the entry's display tracks renames / moves of the capability.
	//
	// Operational state (Status, ResponsibleName) used to be overlaid
	// too, which broke manual status updates — the operator changed
	// status to "down" in the edit form, the PUT saved it, but the
	// next GET overlaid the capability's status back on top. Status,
	// Trend, Threat, and ResponsibleName are now OWNED by the KT entry
	// itself so operators can set them per exercise without the
	// Resources tool fighting them.
	rooms := app.store.GetRooms()
	capMap := make(map[int64]Room)
	for _, r := range rooms {
		if r.Type == "capability" {
			capMap[r.ID] = r
		}
	}
	for i := range entries {
		if entries[i].CapabilityID != 0 {
			if cap, ok := capMap[entries[i].CapabilityID]; ok {
				entries[i].Function = cap.Name
				if cap.Zone != "" {
					entries[i].Zone = cap.Zone
				}
				entries[i].OwnerName = cap.Owner
			}
		}
	}
	jsonOK(w, entries)
}

func (app *App) handleCreateKeyTerrainEntry(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Function      string `json:"function"`
		Status        string `json:"status"`
		Trend         string `json:"trend"`
		Threat        string `json:"threat"`
		External      string `json:"external"`
		Comments      string `json:"comments"`
		Priority      int    `json:"priority"`
		Zone          string `json:"zone"`
		CapabilityID  int64  `json:"capability_id"`
		ResponsibleID int64  `json:"responsible_id"`
		Responsible   string `json:"responsible"`
		Actions       string `json:"actions"`
		ParentID      int64  `json:"parent_id"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Function == "" {
		jsonError(w, "function is required", http.StatusBadRequest)
		return
	}

	// Auto-assign seq_num
	seqNum := 1
	for _, e := range app.store.GetKeyTerrainEntries() {
		if e.SeqNum >= seqNum {
			seqNum = e.SeqNum + 1
		}
	}

	// Validate ParentID on create. An entry-in-the-making has no ID
	// yet, so we can't self-reference; just check existence when set.
	if req.ParentID != 0 {
		if app.store.GetKeyTerrainEntryByID(req.ParentID) == nil {
			jsonError(w, "parent entry not found", http.StatusBadRequest)
			return
		}
	}

	now := time.Now()
	entry := KeyTerrainEntry{
		SeqNum:       seqNum,
		CapabilityID: req.CapabilityID,
		Zone:         req.Zone,
		Function: req.Function,
		Status:   req.Status,
		Trend:    req.Trend,
		Threat:   req.Threat,
		External: req.External,
		Comments: req.Comments,
		Priority: req.Priority,
		Actions:  req.Actions,
		ParentID: req.ParentID,
	}

	// Resolve responsible: try @name autocomplete
	if req.ResponsibleID != 0 {
		entry.ResponsibleID = req.ResponsibleID
		if u, ok := app.store.GetUserByID(req.ResponsibleID); ok {
			entry.ResponsibleName = u.DisplayName
		}
	} else if req.Responsible != "" {
		entry.ResponsibleName = req.Responsible
		resolved := app.resolveResponsibleName(req.Responsible)
		if resolved != nil {
			entry.ResponsibleID = resolved.ID
			entry.ResponsibleName = resolved.DisplayName
		}
	}

	// Build the initial history as the full captured state. One
	// "created" row plus one row per non-empty initial field, so the
	// per-entry history popup (and the global audit log below) show
	// every value the operator originally entered — not just the
	// function name.
	initialFields := []struct {
		field string
		value string
	}{
		{"function", entry.Function},
		{"status", entry.Status},
		{"trend", entry.Trend},
		{"threat", entry.Threat},
		{"external", entry.External},
		{"comments", entry.Comments},
		{"zone", entry.Zone},
		{"actions", entry.Actions},
		{"responsible", entry.ResponsibleName},
	}
	entry.History = []KeyTerrainHist{{Timestamp: now, UserID: user.ID, UserName: user.DisplayName, Field: "created", NewValue: entry.Function}}
	if entry.Priority > 0 {
		entry.History = append(entry.History, KeyTerrainHist{Timestamp: now, UserID: user.ID, UserName: user.DisplayName, Field: "priority", NewValue: fmt.Sprintf("%d", entry.Priority)})
	}
	if entry.ParentID > 0 {
		entry.History = append(entry.History, KeyTerrainHist{Timestamp: now, UserID: user.ID, UserName: user.DisplayName, Field: "parent_id", NewValue: fmt.Sprintf("%d", entry.ParentID)})
	}
	for _, f := range initialFields {
		if f.value == "" {
			continue
		}
		entry.History = append(entry.History, KeyTerrainHist{Timestamp: now, UserID: user.ID, UserName: user.DisplayName, Field: f.field, NewValue: f.value})
	}

	created, err := app.store.CreateKeyTerrainEntry(entry)
	if err != nil {
		jsonError(w, "failed to create entry", http.StatusInternalServerError)
		return
	}
	// Summary audit line, plus one line per initial field set — mirrors
	// the per-entry history so the global audit log tells the same story.
	app.audit(user.ID, user.Username, "create", "key_terrain", created.ID, fmt.Sprintf("Created key terrain entry #%d %q", created.SeqNum, created.Function))
	if created.Priority > 0 {
		app.audit(user.ID, user.Username, "set_field", "key_terrain", created.ID,
			fmt.Sprintf("KT #%d %q · priority = %d", created.SeqNum, created.Function, created.Priority))
	}
	if created.ParentID > 0 {
		app.audit(user.ID, user.Username, "set_field", "key_terrain", created.ID,
			fmt.Sprintf("KT #%d %q · parent_id = %d", created.SeqNum, created.Function, created.ParentID))
	}
	for _, f := range initialFields {
		if f.value == "" || f.field == "function" {
			continue // function is already in the Created summary
		}
		app.audit(user.ID, user.Username, "set_field", "key_terrain", created.ID,
			fmt.Sprintf("KT #%d %q · %s = %q", created.SeqNum, created.Function, f.field, f.value))
	}
	app.broadcastKeyTerrainChange("entry_created")
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdateKeyTerrainEntry(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetKeyTerrainEntryByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	var req struct {
		Function      *string `json:"function"`
		Status        *string `json:"status"`
		Trend         *string `json:"trend"`
		Threat        *string `json:"threat"`
		External      *string `json:"external"`
		Comments      *string `json:"comments"`
		Priority      *int    `json:"priority"`
		Zone          *string `json:"zone"`
		ResponsibleID *int64  `json:"responsible_id"`
		Responsible   *string `json:"responsible"`
		Actions       *string `json:"actions"`
		Rounds        *int    `json:"rounds"`
		Ghosted       *bool   `json:"ghosted"`
		Archived      *bool   `json:"archived"`
		Finished      *bool   `json:"finished"`
		ParentID      *int64  `json:"parent_id"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	now := time.Now()
	addHist := func(field, oldVal, newVal string) {
		entry.History = append(entry.History, KeyTerrainHist{
			Timestamp: now, UserID: user.ID, UserName: user.DisplayName,
			Field: field, OldValue: oldVal, NewValue: newVal,
		})
		// Mirror every change into the global audit log so admins can
		// reconstruct who changed what and when without having to open
		// each entry's history popup. Format matches the create-time
		// set_field lines so the audit log tells one consistent story.
		var detail string
		if oldVal == "" {
			detail = fmt.Sprintf("KT #%d %q · %s = %q", entry.SeqNum, entry.Function, field, newVal)
		} else if newVal == "" {
			detail = fmt.Sprintf("KT #%d %q · %s cleared (was %q)", entry.SeqNum, entry.Function, field, oldVal)
		} else {
			detail = fmt.Sprintf("KT #%d %q · %s: %q → %q", entry.SeqNum, entry.Function, field, oldVal, newVal)
		}
		app.audit(user.ID, user.Username, "set_field", "key_terrain", entry.ID, detail)
	}

	if req.Function != nil && *req.Function != entry.Function {
		addHist("function", entry.Function, *req.Function)
		entry.Function = *req.Function
	}
	if req.Status != nil && *req.Status != entry.Status {
		addHist("status", entry.Status, *req.Status)
		entry.Status = *req.Status
	}
	if req.Trend != nil && *req.Trend != entry.Trend {
		addHist("trend", entry.Trend, *req.Trend)
		entry.Trend = *req.Trend
	}
	if req.Threat != nil && *req.Threat != entry.Threat {
		addHist("threat", entry.Threat, *req.Threat)
		entry.Threat = *req.Threat
	}
	if req.External != nil && *req.External != entry.External {
		addHist("external", entry.External, *req.External)
		entry.External = *req.External
	}
	if req.Comments != nil && *req.Comments != entry.Comments {
		addHist("comments", entry.Comments, *req.Comments)
		entry.Comments = *req.Comments
	}
	if req.Priority != nil && *req.Priority != entry.Priority {
		addHist("priority", fmt.Sprintf("%d", entry.Priority), fmt.Sprintf("%d", *req.Priority))
		entry.Priority = *req.Priority
	}
	if req.Zone != nil && *req.Zone != entry.Zone {
		addHist("zone", entry.Zone, *req.Zone)
		entry.Zone = *req.Zone
	}
	if req.Actions != nil && *req.Actions != entry.Actions {
		addHist("actions", entry.Actions, *req.Actions)
		entry.Actions = *req.Actions
	}
	if req.Rounds != nil && *req.Rounds != entry.Rounds {
		addHist("rounds", fmt.Sprintf("%d", entry.Rounds), fmt.Sprintf("%d", *req.Rounds))
		entry.Rounds = *req.Rounds
	}
	// Handle parent_id ("root cause" link). Validate: must not point
	// at the entry itself, must reference an existing (non-archived)
	// entry if non-zero, and must not introduce a cycle by walking
	// the parent chain. 0 means "no parent / this is a root cause
	// itself or standalone".
	if req.ParentID != nil && *req.ParentID != entry.ParentID {
		newParent := *req.ParentID
		if newParent != 0 {
			if newParent == entry.ID {
				jsonError(w, "an entry cannot be its own root cause", http.StatusBadRequest)
				return
			}
			parent := app.store.GetKeyTerrainEntryByID(newParent)
			if parent == nil {
				jsonError(w, "parent entry not found", http.StatusBadRequest)
				return
			}
			// Walk the parent chain up to 32 hops to detect cycles.
			seen := map[int64]bool{entry.ID: true}
			cur := parent
			for i := 0; i < 32 && cur != nil && cur.ParentID != 0; i++ {
				if seen[cur.ParentID] {
					jsonError(w, "setting this parent would create a cycle", http.StatusBadRequest)
					return
				}
				seen[cur.ID] = true
				cur = app.store.GetKeyTerrainEntryByID(cur.ParentID)
			}
		}
		addHist("parent_id", fmt.Sprintf("%d", entry.ParentID), fmt.Sprintf("%d", newParent))
		entry.ParentID = newParent
	}

	// Handle ghost/archive/finish
	if req.Ghosted != nil && *req.Ghosted != entry.Ghosted {
		if *req.Ghosted {
			addHist("ghosted", "false", "true")
		} else {
			addHist("ghosted", "true", "false")
		}
		entry.Ghosted = *req.Ghosted
	}
	if req.Archived != nil && *req.Archived != entry.Archived {
		if *req.Archived {
			addHist("archived", "false", "true")
		} else {
			addHist("archived", "true", "false")
		}
		entry.Archived = *req.Archived
	}
	if req.Finished != nil {
		if *req.Finished && entry.FinishedAt == nil {
			entry.FinishedAt = &now
			addHist("finished", "", now.Format(time.RFC3339))
		} else if !*req.Finished && entry.FinishedAt != nil {
			addHist("finished", entry.FinishedAt.Format(time.RFC3339), "")
			entry.FinishedAt = nil
		}
	}

	// Handle responsible assignment
	if req.ResponsibleID != nil {
		if *req.ResponsibleID != entry.ResponsibleID {
			addHist("responsible", entry.ResponsibleName, "")
			entry.ResponsibleID = *req.ResponsibleID
			if u, ok := app.store.GetUserByID(*req.ResponsibleID); ok {
				entry.ResponsibleName = u.DisplayName
			}
			if len(entry.History) > 0 {
				entry.History[len(entry.History)-1].NewValue = entry.ResponsibleName
			}
		}
	} else if req.Responsible != nil && *req.Responsible != entry.ResponsibleName {
		addHist("responsible", entry.ResponsibleName, *req.Responsible)
		entry.ResponsibleName = *req.Responsible
		resolved := app.resolveResponsibleName(*req.Responsible)
		if resolved != nil {
			entry.ResponsibleID = resolved.ID
			entry.ResponsibleName = resolved.DisplayName
		}
		if len(entry.History) > 0 {
			entry.History[len(entry.History)-1].NewValue = entry.ResponsibleName
		}
	}

	if err := app.store.UpdateKeyTerrainEntry(*entry); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "update", "key_terrain", entry.ID, fmt.Sprintf("Updated key terrain entry #%d %q", entry.SeqNum, entry.Function))
	app.broadcastKeyTerrainChange("entry_updated")
	jsonOK(w, entry)
}

func (app *App) handleDeleteKeyTerrainEntry(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetKeyTerrainEntryByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if err := app.store.DeleteKeyTerrainEntry(id); err != nil {
		jsonError(w, "delete failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "delete", "key_terrain", id, fmt.Sprintf("Deleted key terrain entry #%d %q", entry.SeqNum, entry.Function))
	app.broadcastKeyTerrainChange("entry_deleted")
	jsonOK(w, map[string]string{"status": "ok"})
}

// handleResetKeyTerrainCycles zeroes out the Rounds counter on every
// non-archived Key Terrain entry. Teamlead+ only — the per-cycle auto-
// increment (runDueBattleRhythmCycles) will start counting from zero
// again. Useful when an operator wants a clean slate after an exercise
// setup period without tearing down and rebuilding the board.
func (app *App) handleResetKeyTerrainCycles(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	entries := app.store.GetKeyTerrainEntries()
	updated := 0
	for _, e := range entries {
		if e.Archived || e.Rounds == 0 {
			continue
		}
		old := e.Rounds
		e.Rounds = 0
		e.History = append(e.History, KeyTerrainHist{
			Timestamp: time.Now(),
			UserID:    user.ID,
			UserName:  user.DisplayName,
			Field:     "rounds",
			OldValue:  fmt.Sprintf("%d", old),
			NewValue:  "0",
		})
		if err := app.store.UpdateKeyTerrainEntry(e); err == nil {
			updated++
		}
	}
	// Also reset the battle-rhythm cycle rollover bookkeeping so the
	// next cycle boundary triggers a fresh increment to 1 rather than
	// noticing nothing changed. LastCycleIdx is set to the CURRENT
	// cycle index (if the clock is running) so the rollover scheduler
	// sees the next boundary as "+1 from here" rather than re-running
	// all the skipped increments.
	settings := app.store.GetKeyTerrainSettings()
	if settings.BattleRhythm.StartedAt != nil && settings.BattleRhythm.CycleMinutes > 0 {
		elapsed := time.Since(*settings.BattleRhythm.StartedAt)
		cycleIdx := int(elapsed / (time.Duration(settings.BattleRhythm.CycleMinutes) * time.Minute))
		if cycleIdx < 0 {
			cycleIdx = 0
		}
		settings.BattleRhythm.LastCycleIdx = cycleIdx
		_ = app.store.SaveKeyTerrainSettings(settings)
	}
	app.audit(user.ID, user.Username, "reset_cycles", "key_terrain", 0,
		fmt.Sprintf("Reset # Cycles counter on %d entries", updated))
	app.broadcastKeyTerrainChange("cycles_reset")
	jsonOK(w, map[string]any{"updated": updated})
}

// ── Key Terrain Settings ──────────────────────────────────────────────

func (app *App) handleGetKeyTerrainSettings(w http.ResponseWriter, r *http.Request, user *User) {
	settings := app.store.GetKeyTerrainSettings()
	jsonOK(w, settings)
}

func (app *App) handleSaveKeyTerrainSettings(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var settings KeyTerrainSettings
	if err := decode(r, &settings); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Preserve server-side runtime fields that the frontend doesn't (and
	// shouldn't) round-trip. LastCycleIdx in particular: the rollover
	// scheduler bumps it as the clock crosses each cycle boundary; if a
	// settings save (e.g. the operator toggling "show clock") clobbers it
	// back to 0, the next tick sees `currentIdx - 0 = N` cycles to apply
	// and double-counts the Rounds column on every active entry.
	existing := app.store.GetKeyTerrainSettings()
	settings.BattleRhythm.LastCycleIdx = existing.BattleRhythm.LastCycleIdx
	if err := app.store.SaveKeyTerrainSettings(settings); err != nil {
		jsonError(w, "save failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "update", "key_terrain_settings", 0, "Updated key terrain settings")
	app.broadcastKeyTerrainChange("settings_updated")
	jsonOK(w, settings)
}

// ── Key Terrain Snapshots (version control) ───────────────────────────────

func (app *App) handleGetKeyTerrainSnapshots(w http.ResponseWriter, r *http.Request, user *User) {
	snapshots := app.store.GetKeyTerrainSnapshots()
	// Return summary without full entries to keep response light
	type snapshotSummary struct {
		ID         int64     `json:"id"`
		Timestamp  time.Time `json:"timestamp"`
		UserName   string    `json:"user_name"`
		Label      string    `json:"label,omitempty"`
		EntryCount int       `json:"entry_count"`
	}
	summaries := make([]snapshotSummary, len(snapshots))
	for i, s := range snapshots {
		summaries[i] = snapshotSummary{
			ID:         s.ID,
			Timestamp:  s.Timestamp,
			UserName:   s.UserName,
			Label:      s.Label,
			EntryCount: len(s.Entries),
		}
	}
	jsonOK(w, summaries)
}

func (app *App) handleGetKeyTerrainSnapshot(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	snap := app.store.GetKeyTerrainSnapshotByID(id)
	if snap == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, snap)
}

func (app *App) handleCreateKeyTerrainSnapshot(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Label string `json:"label"`
	}
	_ = decode(r, &req)

	snap := KeyTerrainSnapshot{
		UserID:   user.ID,
		UserName: user.DisplayName,
		Label:    req.Label,
	}
	created, err := app.store.CreateKeyTerrainSnapshot(snap)
	if err != nil {
		jsonError(w, "failed to create snapshot", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "create", "key_terrain_snapshot", created.ID, fmt.Sprintf("Created key terrain snapshot %q", created.Label))
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

// ── User helpers ──────────────────────────────────────────────────────────

// resolveResponsibleName tries to find a user by @name pattern from the user list
func (app *App) resolveResponsibleName(name string) *User {
	clean := strings.TrimPrefix(strings.TrimSpace(name), "@")
	if clean == "" {
		return nil
	}
	lower := strings.ToLower(clean)
	users := app.store.GetUsers()
	for _, u := range users {
		if strings.ToLower(u.DisplayName) == lower || strings.ToLower(u.Username) == lower {
			return &u
		}
	}
	for _, u := range users {
		if strings.HasPrefix(strings.ToLower(u.DisplayName), lower) || strings.HasPrefix(strings.ToLower(u.Username), lower) {
			return &u
		}
	}
	return nil
}

func (app *App) handleSearchUsersForKeyTerrain(w http.ResponseWriter, r *http.Request, user *User) {
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	q = strings.TrimPrefix(q, "@")
	if q == "" {
		jsonOK(w, []map[string]any{})
		return
	}
	users := app.store.GetUsers()
	var results []map[string]any
	for _, u := range users {
		if strings.Contains(strings.ToLower(u.DisplayName), q) || strings.Contains(strings.ToLower(u.Username), q) {
			results = append(results, map[string]any{
				"id":           u.ID,
				"display_name": u.DisplayName,
				"username":     u.Username,
				"role":         u.Role,
			})
			if len(results) >= 10 {
				break
			}
		}
	}
	if results == nil {
		results = []map[string]any{}
	}
	jsonOK(w, results)
}

func (app *App) handleGetKeyTerrainAccess(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, map[string]any{
		"can_read":  app.canReadKeyTerrain(user),
		"can_write": app.canWriteKeyTerrain(user),
	})
}

// ── Key Terrain Board Attachments ─────────────────────────────────────────
// Meeting protocols (and other files) captured during battle-rhythm cycles
// attach to the board itself — not to any single entry — so operators can
// keep a running log of protocols across cycles. Each attachment carries a
// free-form comment that the UI pre-fills with the current cycle number so
// operators can trace a protocol back to the cycle where the meeting ran.

// handleKeyTerrainListAttachments: GET /api/key-terrain-attachments
func (app *App) handleKeyTerrainListAttachments(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canReadKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	jsonOK(w, app.store.GetKeyTerrainBoardAttachments())
}

// handleKeyTerrainAttachmentUpload: POST /api/key-terrain-attachments
// Accepts either a file upload (multipart/form-data with "file") or a
// URL-only record (JSON body or form field "url"). Common optional
// fields: "comment" (free-form note), "cycle" (battle-cycle number).
// For URL-only records, "filename" can be supplied to give the link a
// display label; otherwise the URL's last path segment is used.
func (app *App) handleKeyTerrainAttachmentUpload(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	ct := strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0]))
	// JSON path: URL-only record, no multipart parsing needed.
	if ct == "application/json" {
		var req struct {
			URL      string `json:"url"`
			Filename string `json:"filename"`
			Comment  string `json:"comment"`
			Cycle    int    `json:"cycle"`
		}
		if err := decode(r, &req); err != nil {
			jsonError(w, "invalid request", http.StatusBadRequest)
			return
		}
		att, err := app.makeKeyTerrainURLAttachment(req.URL, req.Filename, req.Comment, req.Cycle, user)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := app.store.AddKeyTerrainBoardAttachment(att); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		app.audit(user.ID, user.Username, "attach", "key_terrain_board", 0,
			fmt.Sprintf("Linked URL %q (cycle %d) to the board", att.URL, att.Cycle))
		app.broadcastKeyTerrainChange("attachment_added")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(att)
		return
	}
	// Multipart path: file upload OR url-only via "url" form field.
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB
		jsonError(w, "file too large (max 10 MB)", http.StatusBadRequest)
		return
	}
	comment := strings.TrimSpace(r.FormValue("comment"))
	cycle := 0
	if cv := strings.TrimSpace(r.FormValue("cycle")); cv != "" {
		if n, err := strconv.Atoi(cv); err == nil && n >= 0 {
			cycle = n
		}
	}
	if urlVal := strings.TrimSpace(r.FormValue("url")); urlVal != "" {
		att, err := app.makeKeyTerrainURLAttachment(urlVal, strings.TrimSpace(r.FormValue("filename")), comment, cycle, user)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := app.store.AddKeyTerrainBoardAttachment(att); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		app.audit(user.ID, user.Username, "attach", "key_terrain_board", 0,
			fmt.Sprintf("Linked URL %q (cycle %d) to the board", att.URL, att.Cycle))
		app.broadcastKeyTerrainChange("attachment_added")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(att)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "provide either a file or a url", http.StatusBadRequest)
		return
	}
	defer file.Close()
	safeFilename := filepath.Base(header.Filename)
	if safeFilename == "." || safeFilename == "/" {
		safeFilename = "upload"
	}
	if isDangerousFilename(safeFilename) {
		jsonError(w, "file type not allowed", http.StatusBadRequest)
		return
	}
	storedName := fmt.Sprintf("ktb_%d_%s", time.Now().UnixNano(), safeFilename)
	destPath := filepath.Join(app.store.AttachmentDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	written, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(destPath)
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	att := KeyTerrainAttachment{
		Filename:     safeFilename,
		StoredName:   storedName,
		Size:         written,
		MimeType:     header.Header.Get("Content-Type"),
		Comment:      comment,
		Cycle:        cycle,
		UploadedBy:   user.ID,
		UploaderName: user.DisplayName,
		CreatedAt:    time.Now(),
	}
	if err := app.store.AddKeyTerrainBoardAttachment(att); err != nil {
		os.Remove(destPath)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "attach", "key_terrain_board", 0,
		fmt.Sprintf("Uploaded attachment %q (cycle %d) to the board", safeFilename, cycle))
	app.broadcastKeyTerrainChange("attachment_added")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(att)
}

// makeKeyTerrainURLAttachment validates a URL-only protocol record
// (Nextcloud / Google Drive / SharePoint / etc. link) and produces a
// KeyTerrainAttachment with the right bookkeeping fields. Only http(s)
// URLs are allowed so we cannot turn into an open redirect or file://
// leak.
func (app *App) makeKeyTerrainURLAttachment(rawURL, rawFilename, comment string, cycle int, user *User) (KeyTerrainAttachment, error) {
	u := strings.TrimSpace(rawURL)
	if u == "" {
		return KeyTerrainAttachment{}, fmt.Errorf("url is required")
	}
	if len(u) > 2048 {
		return KeyTerrainAttachment{}, fmt.Errorf("url too long (max 2048 chars)")
	}
	parsed, err := url.Parse(u)
	if err != nil || parsed.Host == "" {
		return KeyTerrainAttachment{}, fmt.Errorf("invalid url")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return KeyTerrainAttachment{}, fmt.Errorf("url scheme must be http or https")
	}
	label := strings.TrimSpace(rawFilename)
	if label == "" {
		// Derive a reasonable display label from the URL path; fall back
		// to the hostname so the list row is never blank.
		base := filepath.Base(parsed.Path)
		if base == "" || base == "." || base == "/" {
			base = parsed.Host
		}
		label = base
	}
	return KeyTerrainAttachment{
		Filename: label,
		URL:      u,
		// Synthetic stored-name so the delete path, which identifies
		// attachments by stored-name, works uniformly for URL-only
		// records. Never points at a real file on disk.
		StoredName:   fmt.Sprintf("ktburl_%d", time.Now().UnixNano()),
		Comment:      strings.TrimSpace(comment),
		Cycle:        cycle,
		UploadedBy:   user.ID,
		UploaderName: user.DisplayName,
		CreatedAt:    time.Now(),
	}, nil
}

// handleKeyTerrainAttachmentDownload: GET /api/key-terrain-attachments/{filename}
func (app *App) handleKeyTerrainAttachmentDownload(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canReadKeyTerrain(user) {
		http.NotFound(w, r)
		return
	}
	storedName := filepath.Base(r.PathValue("filename"))
	found := false
	var att KeyTerrainAttachment
	for _, a := range app.store.GetKeyTerrainBoardAttachments() {
		if a.StoredName == storedName {
			att = a
			found = true
			break
		}
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	filePath := filepath.Join(app.store.AttachmentDir(), storedName)
	if _, err := os.Stat(filePath); err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	mimeType := mime.TypeByExtension(filepath.Ext(storedName))
	if mimeType == "" {
		mimeType = att.MimeType
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mimeType)
	safeDisp := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, att.Filename)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeDisp))
	http.ServeFile(w, r, filePath)
}

// handleKeyTerrainAttachmentDelete: DELETE /api/key-terrain-attachments/{filename}
func (app *App) handleKeyTerrainAttachmentDelete(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	storedName := filepath.Base(r.PathValue("filename"))
	removed, err := app.store.DeleteKeyTerrainBoardAttachment(storedName)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	// URL-only records have a synthetic stored-name and no on-disk
	// file; skip the unlink for them. File-backed records keep the
	// existing best-effort Remove.
	if removed.URL == "" {
		_ = os.Remove(filepath.Join(app.store.AttachmentDir(), storedName))
	}
	app.audit(user.ID, user.Username, "detach", "key_terrain_board", 0,
		fmt.Sprintf("Deleted attachment %q", removed.Filename))
	app.broadcastKeyTerrainChange("attachment_removed")
	jsonOK(w, map[string]string{"status": "ok"})
}
