package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
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
		Comments: req.Comments,
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

// ── Key Terrain Attachments ───────────────────────────────────────────────
// Meeting protocols (and other files) captured during battle-rhythm cycles
// are attached to individual Key Terrain entries. Each attachment carries a
// free-form comment that the UI pre-fills with the current cycle number so
// operators can trace a protocol back to the cycle where the meeting ran.

// handleKeyTerrainAttachmentUpload: POST /api/key-terrain/{id}/attachment
// Expects multipart/form-data with a "file" field and optional "comment"
// and "cycle" fields.
func (app *App) handleKeyTerrainAttachmentUpload(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetKeyTerrainEntryByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB
		jsonError(w, "file too large (max 10 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field missing", http.StatusBadRequest)
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
	storedName := fmt.Sprintf("kt_%d_%d_%s", id, time.Now().UnixNano(), safeFilename)
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
	comment := strings.TrimSpace(r.FormValue("comment"))
	cycle := 0
	if cv := strings.TrimSpace(r.FormValue("cycle")); cv != "" {
		if n, err := strconv.Atoi(cv); err == nil && n >= 0 {
			cycle = n
		}
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
	if err := app.store.AddKeyTerrainAttachment(id, att); err != nil {
		os.Remove(destPath)
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.Username, "attach", "key_terrain", id,
		fmt.Sprintf("Uploaded attachment %q (cycle %d) to entry %q", safeFilename, cycle, entry.Function))
	app.broadcastKeyTerrainChange("attachment_added")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(att)
}

// handleKeyTerrainAttachmentDownload: GET /api/key-terrain/{id}/attachment/{filename}
func (app *App) handleKeyTerrainAttachmentDownload(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canReadKeyTerrain(user) {
		http.NotFound(w, r)
		return
	}
	entryID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	storedName := filepath.Base(r.PathValue("filename"))
	entry := app.store.GetKeyTerrainEntryByID(entryID)
	if entry == nil {
		http.NotFound(w, r)
		return
	}
	found := false
	var att KeyTerrainAttachment
	for _, a := range entry.Attachments {
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

// handleKeyTerrainAttachmentDelete: DELETE /api/key-terrain/{id}/attachment/{filename}
func (app *App) handleKeyTerrainAttachmentDelete(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	entryID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	storedName := filepath.Base(r.PathValue("filename"))
	removed, err := app.store.DeleteKeyTerrainAttachment(entryID, storedName)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	_ = os.Remove(filepath.Join(app.store.AttachmentDir(), storedName))
	app.audit(user.ID, user.Username, "detach", "key_terrain", entryID,
		fmt.Sprintf("Deleted attachment %q", removed.Filename))
	app.broadcastKeyTerrainChange("attachment_removed")
	jsonOK(w, map[string]string{"status": "ok"})
}
