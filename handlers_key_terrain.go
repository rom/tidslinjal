package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ── Key Terrain access control ─────────────────────────────────────────────
// Default: OpL, staff_officer, staff_officers_assistance have write access.
// Everyone else has read access.

// canWriteKeyTerrain checks if user has key_terrain_write capability.
// Defaults to true for OpLead+, staff roles; checks role config for custom roles.
func (app *App) canWriteKeyTerrain(user *User) bool {
	if user.Role == RoleAdmin {
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
	if user.Role == RoleAdmin {
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
	// overlay the capability's current name, zone, status, and responsibility.
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
				if cap.Status != "" {
					entries[i].Status = cap.Status
				}
				if cap.Responsibility != "" {
					entries[i].ResponsibleName = cap.Responsibility
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
		Priority      int    `json:"priority"`
		Zone          string `json:"zone"`
		CapabilityID  int64  `json:"capability_id"`
		ResponsibleID int64  `json:"responsible_id"`
		Responsible   string `json:"responsible"`
		Actions       string `json:"actions"`
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

	entry := KeyTerrainEntry{
		SeqNum:       seqNum,
		CapabilityID: req.CapabilityID,
		Zone:         req.Zone,
		Function: req.Function,
		Status:   req.Status,
		Trend:    req.Trend,
		Threat:   req.Threat,
		External: req.External,
		Priority: req.Priority,
		Actions:  req.Actions,
		History: []KeyTerrainHist{
			{Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName, Field: "created", NewValue: req.Function},
		},
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

	created, err := app.store.CreateKeyTerrainEntry(entry)
	if err != nil {
		jsonError(w, "failed to create entry", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "create", "key_terrain", created.ID, fmt.Sprintf("Created key terrain entry %q", created.Function))
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
		Priority      *int    `json:"priority"`
		Zone          *string `json:"zone"`
		ResponsibleID *int64  `json:"responsible_id"`
		Responsible   *string `json:"responsible"`
		Actions       *string `json:"actions"`
		Rounds        *int    `json:"rounds"`
		Ghosted       *bool   `json:"ghosted"`
		Archived      *bool   `json:"archived"`
		Finished      *bool   `json:"finished"`
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
	app.audit(user.ID, user.Username, "update", "key_terrain", entry.ID, fmt.Sprintf("Updated key terrain entry %q", entry.Function))
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
	app.audit(user.ID, user.Username, "delete", "key_terrain", id, fmt.Sprintf("Deleted key terrain entry %q", entry.Function))
	app.broadcastKeyTerrainChange("entry_deleted")
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Key Terrain Settings ──────────────────────────────────────────────────

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
