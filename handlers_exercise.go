package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// ── Exercise settings handlers ─────────────────────────────────────────────────

func (app *App) handleGetExercise(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetExerciseSettings())
}

func (app *App) handleSaveExercise(w http.ResponseWriter, r *http.Request, user *User) {
	var es ExerciseSettings
	if err := decode(r, &es); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Auto-record wall-clock time when artificial time is set/changed
	if es.ArtificialTimeEnabled && es.ArtificialTime != "" {
		old := app.store.GetExerciseSettings()
		if es.ArtificialTime != old.ArtificialTime || !old.ArtificialTimeEnabled {
			es.ArtificialTimeSetAt = time.Now().UTC().Format(time.RFC3339)
		} else if old.ArtificialTimeSetAt != "" {
			es.ArtificialTimeSetAt = old.ArtificialTimeSetAt
		}
	}
	if err := app.store.SaveExerciseSettings(es); err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "exercise", 0,
		fmt.Sprintf("Exercise settings updated: enabled=%v epoch=%q label=%q", es.Enabled, es.Epoch, es.Label))
	jsonOK(w, es)
}

// ── Version ────────────────────────────────────────────────────────────────────

// serverStartTime records when the server process started
var serverStartTime = time.Now()

// getSystemBootTime returns the OS boot time by reading /proc/uptime on Linux.
func getSystemBootTime() time.Time {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return time.Time{}
	}
	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return time.Time{}
	}
	var uptimeSec float64
	if _, err := fmt.Sscanf(fields[0], "%f", &uptimeSec); err != nil {
		return time.Time{}
	}
	return time.Now().Add(-time.Duration(uptimeSec * float64(time.Second)))
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	uptime := time.Since(serverStartTime).Truncate(time.Second).String()
	resp := map[string]any{
		"version":    AppVersion,
		"commit":     BuildCommit,
		"build_time": BuildTime,
		"go_version": runtime.Version(),
		"github":     AppGitHub,
		"uptime":     uptime,
		"started_at": serverStartTime.Format(time.RFC3339),
	}
	// Add OS boot time if available (Linux)
	if bootTime := getSystemBootTime(); !bootTime.IsZero() {
		resp["server_booted_at"] = bootTime.Format(time.RFC3339)
	}
	jsonOK(w, resp)
}

func (app *App) handleDBStats(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetDBStats())
}

// ── Day Labels ────────────────────────────────────────────────────────────────

func (app *App) handleGetDayLabels(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetDayLabels())
}

func (app *App) handleCreateDayLabel(w http.ResponseWriter, r *http.Request, user *User) {
	var dl DayLabel
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&dl); err != nil {
		jsonError(w, "invalid json", http.StatusBadRequest)
		return
	}
	if dl.Date == "" || dl.Label == "" {
		jsonError(w, "date and label required", http.StatusBadRequest)
		return
	}
	// Sanitize label to prevent stored XSS
	dl.Label = stripHTMLTags(dl.Label)
	dl.CreatedBy = user.ID
	created, err := app.store.AddDayLabel(dl)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.broker.BroadcastAll(SSEMessage{Event: "day_labels_change", Data: "{}"})
	app.audit(user.ID, user.DisplayName, "created", "day_label", created.ID, fmt.Sprintf("Day label %q on %s", dl.Label, dl.Date))
	jsonOK(w, created)
}

func (app *App) handleUpdateDayLabel(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dl DayLabel
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&dl); err != nil {
		jsonError(w, "invalid json", http.StatusBadRequest)
		return
	}
	dl.ID = id
	dl.CreatedBy = user.ID
	if err := app.store.UpdateDayLabel(dl); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.broker.BroadcastAll(SSEMessage{Event: "day_labels_change", Data: "{}"})
	app.audit(user.ID, user.DisplayName, "updated", "day_label", id, fmt.Sprintf("Day label %q on %s", dl.Label, dl.Date))
	jsonOK(w, dl)
}

func (app *App) handleDeleteDayLabel(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteDayLabel(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.broker.BroadcastAll(SSEMessage{Event: "day_labels_change", Data: "{}"})
	app.audit(user.ID, user.DisplayName, "deleted", "day_label", id, "")
	jsonOK(w, map[string]string{"status": "deleted"})
}
