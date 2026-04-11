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

// ── Template handlers ─────────────────────────────────────────────────────

func (app *App) handleGetTemplates(w http.ResponseWriter, r *http.Request, user *User) {
	templates := app.store.GetTemplates(user.ID)
	if templates == nil {
		templates = []Template{}
	}
	jsonOK(w, templates)
}

func (app *App) handleCreateTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	var tmpl Template
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&tmpl); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if tmpl.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	// M-19 fix: sanitize template name/description/items to prevent stored XSS
	tmpl.Name = stripHTMLTags(tmpl.Name)
	tmpl.Description = stripHTMLTags(tmpl.Description)
	for i := range tmpl.Items {
		tmpl.Items[i].Title = stripHTMLTags(tmpl.Items[i].Title)
		tmpl.Items[i].Description = stripHTMLTags(tmpl.Items[i].Description)
	}
	if tmpl.Scope == "public" && !app.effectiveHasRole(user, RoleOpLead) {
		jsonError(w, "only operations leads and admins may create public templates", http.StatusForbidden)
		return
	}
	tmpl.CreatedBy = user.ID
	tmpl.CreatedByName = user.DisplayName
	if tmpl.CreatedByName == "" {
		tmpl.CreatedByName = user.Username
	}
	// Populate template items with attachment references from their source events
	for i, item := range tmpl.Items {
		if item.Attachments == nil {
			tmpl.Items[i].Attachments = []TemplateAttachment{}
		}
	}
	created, err := app.store.CreateTemplate(tmpl)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "saved", "template", created.ID,
		fmt.Sprintf("Saved template %q (%d items, scope=%s)", created.Name, len(created.Items), created.Scope))
	logDebug("[template] Created template id=%d name=%q items=%d scope=%s", created.ID, created.Name, len(created.Items), created.Scope)
	jsonOK(w, created)
}

func (app *App) handleDeleteTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	isAdmin := app.effectiveHasRole(user, RoleAdmin)
	if err := app.store.DeleteTemplate(id, user.ID, isAdmin); err != nil {
		jsonError(w, err.Error(), http.StatusForbidden)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) handleApplyTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	// Extract template ID from path /api/templates/{id}/apply
	path := strings.TrimPrefix(r.URL.Path, "/api/templates/")
	parts := strings.SplitN(path, "/", 2)
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}

	var req struct {
		BaseTime          time.Time `json:"base_time"`
		LayerID           *int64    `json:"layer_id"`
		UseTemplateLayers *bool     `json:"use_template_layers"` // nil/true = use per-item layers from template; false = force all to LayerID
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.BaseTime.IsZero() {
		jsonError(w, "base_time required", http.StatusBadRequest)
		return
	}

	// Check template access
	tmpl, ok := app.store.GetTemplate(id)
	if !ok {
		jsonError(w, "template not found", http.StatusNotFound)
		return
	}
	if tmpl.Scope == "private" && tmpl.CreatedBy != user.ID {
		jsonError(w, "access denied", http.StatusForbidden)
		return
	}

	displayName := user.DisplayName
	if displayName == "" {
		displayName = user.Username
	}
	useTemplateLayers := req.UseTemplateLayers == nil || *req.UseTemplateLayers // default true
	logDebug("[template] Applying template id=%d name=%q base=%s layer=%v useTemplateLayers=%v user=%s",
		id, tmpl.Name, req.BaseTime.Format(time.RFC3339), req.LayerID, useTemplateLayers, displayName)
	count, err := app.store.ApplyTemplate(id, req.BaseTime, req.LayerID, useTemplateLayers, user.ID, displayName)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	logDebug("[template] Applied template %q: created %d events (base=%s)", tmpl.Name, count, req.BaseTime.Format(time.RFC3339))
	app.audit(user.ID, user.DisplayName, "applied", "template", id,
		fmt.Sprintf("Applied template %q: created %d events (base=%s)", tmpl.Name, count, req.BaseTime.Format(time.RFC3339)))
	// Compute template duration from the latest-ending item
	maxOffsetMin := 0
	for _, item := range tmpl.Items {
		end := item.StartOffsetMin + item.DurationMin
		if end > maxOffsetMin {
			maxOffsetMin = end
		}
		if item.StartOffsetMin > maxOffsetMin {
			maxOffsetMin = item.StartOffsetMin
		}
	}
	endex := req.BaseTime.Add(time.Duration(maxOffsetMin) * time.Minute)

	// Set STARTEX, ENDEX, exercise label, and enable synthetic time display
	exerciseNameSet := tmpl.ExerciseName
	if exerciseNameSet == "" {
		exerciseNameSet = tmpl.Name
	}
	{
		ex := app.store.GetExerciseSettings()
		ex.Epoch = req.BaseTime.Format(time.RFC3339)
		ex.Endex = endex.Format(time.RFC3339)
		ex.LastTemplate = tmpl.Name
		ex.Label = exerciseNameSet
		ex.Enabled = true // enable synthetic time display
		app.store.SaveExerciseSettings(ex) //nolint
	}
	// If the template carries day hour preferences, update the requesting user's preferences
	dayStartHour, dayEndHour := 0, 0
	if tmpl.DayEndHour > 0 {
		prefs := app.store.GetPreferences(user.ID)
		prefs.DayStartHour = tmpl.DayStartHour
		prefs.DayEndHour = tmpl.DayEndHour
		app.store.SavePreferences(prefs) //nolint
		dayStartHour = tmpl.DayStartHour
		dayEndHour = tmpl.DayEndHour
	}
	// Apply theme/size/language from template to user preferences
	operationModeSet := ""
	groupLabelSet := ""
	userLabelSet := ""
	if tmpl.Theme != "" || tmpl.Size != "" || tmpl.Language != "" {
		prefs := app.store.GetPreferences(user.ID)
		if tmpl.Theme != "" {
			prefs.Theme = tmpl.Theme
		}
		if tmpl.Size != "" {
			prefs.Size = tmpl.Size
		}
		if tmpl.Language != "" {
			prefs.Language = tmpl.Language
		}
		app.store.SavePreferences(prefs) //nolint
	}
	// Apply operation mode / terminology settings to exercise settings
	if tmpl.OperationMode != "" || tmpl.GroupLabel != "" || tmpl.UserLabel != "" {
		ex := app.store.GetExerciseSettings()
		if tmpl.OperationMode != "" {
			ex.OperationMode = tmpl.OperationMode
			operationModeSet = tmpl.OperationMode
		}
		if tmpl.GroupLabel != "" {
			ex.GroupLabel = tmpl.GroupLabel
			groupLabelSet = tmpl.GroupLabel
		}
		if tmpl.UserLabel != "" {
			ex.UserLabel = tmpl.UserLabel
			userLabelSet = tmpl.UserLabel
		}
		app.store.SaveExerciseSettings(ex) //nolint
	}
	// Create alarms for template items that carry alarm settings
	for _, item := range tmpl.Items {
		if item.AlarmLeadTime <= 0 {
			continue
		}
		eventTime := req.BaseTime.Add(time.Duration(item.StartOffsetMin) * time.Minute)
		alarm := Alarm{
			UserID:     user.ID,
			EventTitle: item.Title,
			EventTime:  eventTime,
			LeadTime:   item.AlarmLeadTime,
			Sound:      item.AlarmSound,
			IsActive:   true,
		}
		app.store.CreateAlarm(alarm) //nolint
	}
	jsonOK(w, map[string]interface{}{
		"created":           count,
		"exercise_name":     exerciseNameSet,
		"day_start_hour":    dayStartHour,
		"day_end_hour":      dayEndHour,
		"startex":           req.BaseTime.Format(time.RFC3339),
		"endex":             endex.Format(time.RFC3339),
		"synthetic_enabled": true,
		"operation_mode":    operationModeSet,
		"group_label":       groupLabelSet,
		"user_label":        userLabelSet,
		"theme":             tmpl.Theme,
		"size":              tmpl.Size,
		"language":          tmpl.Language,
	})
}

// handleGetRoles returns the current role configurations
func (app *App) handleGetRoles(w http.ResponseWriter, r *http.Request, user *User) {
	roles := app.store.GetRoleConfigs()
	if roles == nil {
		roles = []RoleConfig{}
	}
	jsonOK(w, roles)
}

// handleUpdateRoles saves updated role configurations (admin only)
func (app *App) handleUpdateRoles(w http.ResponseWriter, r *http.Request, user *User) {
	var configs []RoleConfig
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&configs); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Protect the admin role — remove it if someone tried to include it
	filtered := make([]RoleConfig, 0, len(configs))
	for _, c := range configs {
		if c.Key != "admin" {
			filtered = append(filtered, c)
		}
	}
	if err := app.store.SaveRoleConfigs(filtered); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "roles", 0,
		fmt.Sprintf("Updated %d role configuration(s)", len(filtered)))
	jsonOK(w, filtered)
}

// handleResetDatabase resets all data except the audit trail
func (app *App) handleResetDatabase(w http.ResponseWriter, r *http.Request, user *User) {
	if err := app.store.ResetDatabase(); err != nil {
		jsonError(w, "reset failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Re-seed event types
	if err := app.store.SeedEventTypes(); err != nil {
		logVerbose("re-seed event types after reset: %v", err)
	}
	app.audit(user.ID, user.DisplayName, "reset", "system", 0, "Database reset to empty (audit trail preserved)")
	jsonOK(w, map[string]string{"status": "reset"})
}

