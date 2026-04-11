package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

func (app *App) handleExport(w http.ResponseWriter, r *http.Request, user *User) {
	isPrivileged := app.effectiveHasRole(user, RoleOpLead)
	include := r.URL.Query().Get("include")
	if include == "" {
		include = "events,groups,layers,alarms,phases,event_types,comments,day_labels"
		if isPrivileged {
			include += ",users,decision_log,role_configs"
		}
	}
	data := app.store.GetExportDataFiltered(user.ID, isPrivileged, parseCommaSet(include))
	app.audit(user.ID, user.DisplayName, "exported", "data", 0,
		fmt.Sprintf("Exported JSON data (include=%s)", include))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-export-%s.json"`,
		time.Now().Format("2006-01-02T150405")))
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(data) //nolint
}

func (app *App) handleImport(w http.ResponseWriter, r *http.Request, user *User) {
	isPrivileged := app.effectiveHasRole(user, RoleOpLead)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		jsonError(w, "failed to parse form (max 20MB)", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("data")
	if err != nil {
		jsonError(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()
	var data ExportData
	if err := json.NewDecoder(file).Decode(&data); err != nil {
		jsonError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	include := r.FormValue("include")
	if include == "" {
		include = "events,groups,layers,alarms,day_labels"
	}
	reassign := r.FormValue("reassign") == "true"
	result := app.store.ImportData(data, user.ID, user.DisplayName, isPrivileged, reassign, parseCommaSet(include))
	app.audit(user.ID, user.DisplayName, "imported", "data", 0,
		fmt.Sprintf("Imported groups=%d layers=%d events=%d alarms=%d users=%d skipped=%d",
			result.Groups, result.Layers, result.Events, result.Alarms, result.Users, result.Skipped))
	jsonOK(w, result)
}

// ── User members (groups for a user) ─────────────────────────────────────────

func (app *App) handleGetUserGroups(w http.ResponseWriter, r *http.Request, user *User) {
	// Path is /api/users/{id}/groups — extract user ID from segment index 2.
	// pathID would return the last segment ("groups"), which is wrong.
	seg := pathSegment(r, 2)
	id, err := strconv.ParseInt(seg, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	memberships := app.store.GetUserGroups(id)
	if memberships == nil {
		memberships = []GroupMembership{}
	}
	jsonOK(w, memberships)
}
