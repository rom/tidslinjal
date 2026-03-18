package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ── Free/Busy lookup handler ───────────────────────────────────────────────────

func (app *App) handleFreeBusy(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	resourceType := q.Get("type")   // "user" or "room"
	idStr := q.Get("id")
	fromStr := q.Get("from")
	toStr := q.Get("to")

	if fromStr == "" || toStr == "" {
		jsonError(w, "from and to parameters required (ISO8601)", http.StatusBadRequest)
		return
	}
	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		jsonError(w, "invalid from date", http.StatusBadRequest)
		return
	}
	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		jsonError(w, "invalid to date", http.StatusBadRequest)
		return
	}

	id, _ := strconv.ParseInt(idStr, 10, 64)

	type busySlot struct {
		Title     string    `json:"title"`
		StartTime time.Time `json:"start_time"`
		EndTime   *time.Time `json:"end_time,omitempty"`
	}

	var slots []busySlot
	if resourceType == "room" && id > 0 {
		events := app.store.GetRoomFreeBusy(id, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	} else if id > 0 {
		events := app.store.GetFreeBusy(id, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	} else {
		// Return availability for requesting user
		events := app.store.GetFreeBusy(user.ID, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	}
	if slots == nil {
		slots = []busySlot{}
	}
	jsonOK(w, slots)
}

// ── Meeting config handlers ────────────────────────────────────────────────────

func (app *App) handleGetMeetingConfig(w http.ResponseWriter, r *http.Request, user *User) {
	// Return meeting config (without secrets)
	jsonOK(w, map[string]interface{}{
		"teams_enabled": false,
		"zoom_enabled":  false,
	})
}

func (app *App) handleSaveMeetingConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg MeetingConfig
	if err := decode(r, &cfg); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Store meeting config (future: persist and use for auto-creation)
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "meeting_config", EntityID: 0,
		Summary: "Updated meeting integration config",
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Filter Presets ────────────────────────────────────────────────────────────

func (app *App) handleListFilterPresets(w http.ResponseWriter, r *http.Request, user *User) {
	presets := app.store.GetFilterPresets(user.ID)
	if presets == nil {
		presets = []FilterPreset{}
	}
	jsonOK(w, presets)
}

func (app *App) handleCreateFilterPreset(w http.ResponseWriter, r *http.Request, user *User) {
	var p FilterPreset
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&p); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if p.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	p.UserID = user.ID
	created, err := app.store.CreateFilterPreset(p)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, created)
}

func (app *App) handleDeleteFilterPreset(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/filter-presets/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteFilterPreset(id, user.ID); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Event History ──────────────────────────────────────────────────────────────

func (app *App) handleGetEventHistory(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		// Try parsing from /api/events/:id/history
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			id, err = strconv.ParseInt(parts[2], 10, 64)
		}
		if err != nil {
			jsonError(w, "invalid id", http.StatusBadRequest)
			return
		}
	}
	if _, ok := app.store.GetEventByID(id); !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	versions := app.store.GetEventVersions(id)
	jsonOK(w, versions)
}

// ── Editing Locks ──────────────────────────────────────────────────────────────

func (app *App) handleAcquireEditingLock(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	lock, ok := app.store.AcquireEditingLock(id, user.ID, user.DisplayName)
	if !ok {
		jsonError(w, fmt.Sprintf("Event is being edited by %s", lock.UserName), http.StatusConflict)
		return
	}
	// Broadcast editing lock acquisition to all users
	lockData, _ := json.Marshal(map[string]interface{}{
		"type":       "editing_lock",
		"event_id":   id,
		"user_id":    user.ID,
		"user_name":  user.DisplayName,
		"expires_at": lock.ExpiresAt,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "editing_lock", Data: string(lockData)})
	jsonOK(w, lock)
}

func (app *App) handleReleaseEditingLock(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	app.store.ReleaseEditingLock(id, user.ID)
	unlockData, _ := json.Marshal(map[string]interface{}{
		"type":     "editing_unlock",
		"event_id": id,
		"user_id":  user.ID,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "editing_lock", Data: string(unlockData)})
	jsonOK(w, map[string]string{"status": "released"})
}

func (app *App) handleGetEditingLocks(w http.ResponseWriter, r *http.Request, user *User) {
	locks := app.store.GetAllEditingLocks()
	jsonOK(w, locks)
}
