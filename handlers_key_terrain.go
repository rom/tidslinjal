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

func canWriteKeyTerrain(user *User) bool {
	if user.Role == RoleAdmin {
		return true
	}
	switch user.Role {
	case RoleOpLead, RoleDeputyOpLead, RoleStaffOfficer, RoleStaffAssistant, RoleStaffOfficerFull:
		return true
	}
	return false
}

// ── Handlers ───────────────────────────────────────────────────────────────

func (app *App) handleGetKeyTerrainEntries(w http.ResponseWriter, r *http.Request, user *User) {
	entries := app.store.GetKeyTerrainEntries()
	if entries == nil {
		entries = []KeyTerrainEntry{}
	}
	jsonOK(w, entries)
}

func (app *App) handleCreateKeyTerrainEntry(w http.ResponseWriter, r *http.Request, user *User) {
	if !canWriteKeyTerrain(user) {
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

	entry := KeyTerrainEntry{
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
		// Try to resolve @name
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
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdateKeyTerrainEntry(w http.ResponseWriter, r *http.Request, user *User) {
	if !canWriteKeyTerrain(user) {
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
		ResponsibleID *int64  `json:"responsible_id"`
		Responsible   *string `json:"responsible"`
		Actions       *string `json:"actions"`
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
	if req.Actions != nil && *req.Actions != entry.Actions {
		addHist("actions", entry.Actions, *req.Actions)
		entry.Actions = *req.Actions
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
	jsonOK(w, entry)
}

func (app *App) handleDeleteKeyTerrainEntry(w http.ResponseWriter, r *http.Request, user *User) {
	if !canWriteKeyTerrain(user) {
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
	jsonOK(w, map[string]string{"status": "ok"})
}

// resolveResponsibleName tries to find a user by @name pattern from the user list
func (app *App) resolveResponsibleName(name string) *User {
	clean := strings.TrimPrefix(strings.TrimSpace(name), "@")
	if clean == "" {
		return nil
	}
	lower := strings.ToLower(clean)
	users := app.store.GetUsers()
	// Exact display name match
	for _, u := range users {
		if strings.ToLower(u.DisplayName) == lower || strings.ToLower(u.Username) == lower {
			return &u
		}
	}
	// Prefix match
	for _, u := range users {
		if strings.HasPrefix(strings.ToLower(u.DisplayName), lower) || strings.HasPrefix(strings.ToLower(u.Username), lower) {
			return &u
		}
	}
	return nil
}

// handleSearchUsers returns matching users for autocomplete
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

// handleGetKeyTerrainAccess returns the current user's access level
func (app *App) handleGetKeyTerrainAccess(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, map[string]any{
		"can_write": canWriteKeyTerrain(user),
	})
}
