package main

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ── Integration Status ─────────────────────────────────────────────────────────

// handleStatus returns a summary of all integration statuses (admin-only).
// This powers the legend panel's "Integrations" section.
func (app *App) handleStatus(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// OIDC / SSO
	oidcCfg := app.store.GetOIDCSettings()
	ssoStatus := map[string]any{
		"enabled":   oidcCfg.Enabled,
		"issuer":    oidcCfg.Issuer,
		"exclusive": oidcCfg.Exclusive,
		"active":    app.oidc != nil && oidcCfg.Enabled,
	}

	// TLS
	tlsCfg := app.store.GetTLSConfig()
	tlsStatus := map[string]any{
		"configured": tlsCfg.CertFile != "" && tlsCfg.KeyFile != "",
		"cert_file":  tlsCfg.CertFile,
	}

	// Syslog
	syslogCfg := app.store.GetSyslogConfig()
	syslogStatus := map[string]any{
		"enabled":   syslogCfg.Enabled,
		"host":      syslogCfg.Host,
		"port":      syslogCfg.Port,
		"transport": syslogCfg.Transport,
		"format":    syslogCfg.Format,
	}

	// SMTP / Mail
	mailCfg := app.store.GetMailConfig()
	smtpStatus := map[string]any{
		"enabled":   mailCfg.Enabled,
		"host":      mailCfg.SMTPHost,
		"port":      mailCfg.SMTPPort,
		"tls_mode":  mailCfg.TLSMode,
		"from_addr": mailCfg.FromAddr,
	}

	// Mattermost / Webhooks — count users with configured webhooks
	allPrefs := app.store.GetAllPreferences()
	mattermostCount := 0
	webhookCount := 0
	for _, p := range allPrefs {
		if p.WebhookURL != "" {
			webhookCount++
			if p.WebhookType == "mattermost" || p.WebhookType == "slack" {
				mattermostCount++
			}
		}
	}
	mattermostStatus := map[string]any{
		"webhook_users":     webhookCount,
		"mattermost_users":  mattermostCount,
	}

	// API Keys
	apiKeys := app.store.GetAPIKeys()
	apiKeyStatus := map[string]any{
		"count": len(apiKeys),
	}

	jsonOK(w, map[string]any{
		"sso":        ssoStatus,
		"tls":        tlsStatus,
		"syslog":     syslogStatus,
		"smtp":       smtpStatus,
		"mattermost": mattermostStatus,
		"api_keys":   apiKeyStatus,
	})
}

// ── Admin Reset ────────────────────────────────────────────────────────────────

func (app *App) handleAdminReset(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Only admin can reset
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	// Confirm intent via request body
	var req struct {
		Confirm       string `json:"confirm"`
		KeepTemplates bool   `json:"keep_templates"`
	}
	if err := decode(r, &req); err != nil || req.Confirm != "RESET" {
		jsonError(w, "confirmation required: send {\"confirm\":\"RESET\"}", http.StatusBadRequest)
		return
	}
	if err := app.store.ResetToEmpty(*user, req.KeepTemplates); err != nil {
		jsonError(w, "reset failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	log.Printf("Admin %q triggered a full system reset (data cleared, admin account preserved, keepTemplates=%v)", user.Username, req.KeepTemplates)
	jsonOK(w, map[string]string{"status": "reset complete"})
}

// ── Admin Session Management ───────────────────────────────────────────────────

func (app *App) handleAdminSessions(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessions := app.store.GetAllSessions()
	if sessions == nil {
		sessions = []SessionInfo{}
	}
	jsonOK(w, sessions)
}

func (app *App) handleAdminDeleteSession(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodDelete {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// /api/admin/sessions/:id
	if len(parts) < 4 {
		jsonError(w, "missing session id", http.StatusBadRequest)
		return
	}
	sessID := parts[3]
	if err := app.store.DeleteSession(sessID); err != nil {
		jsonError(w, "session not found", http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "session", 0,
		fmt.Sprintf("Admin %q terminated session %s…", user.Username, sessID[:min(8, len(sessID))]))
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Admin Bulk Actions ─────────────────────────────────────────────────────────

func (app *App) handleAdminBulkStatus(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Filter   string      `json:"filter"` // type | user | group | role | status | layer | all
		Value    string      `json:"value"`
		Status   EventStatus `json:"status"`
		TimeFrom string      `json:"time_from,omitempty"` // ISO8601
		TimeTo   string      `json:"time_to,omitempty"`   // ISO8601
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	validFilters := map[string]bool{"type": true, "user": true, "group": true, "role": true, "status": true, "layer": true, "all": true}
	if !validFilters[req.Filter] {
		jsonError(w, "filter must be one of: type, user, group, role, status, layer, all", http.StatusBadRequest)
		return
	}
	if req.Status == "" {
		jsonError(w, "status required", http.StatusBadRequest)
		return
	}
	f := BulkFilter{Filter: req.Filter, Value: req.Value}
	if req.TimeFrom != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeFrom); err == nil {
			f.TimeFrom = &t
		}
	}
	if req.TimeTo != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeTo); err == nil {
			f.TimeTo = &t
		}
	}
	count, err := app.store.BulkSetEventStatus(f, req.Status)
	if err != nil {
		jsonError(w, "bulk update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "bulk_status", "event", 0,
		fmt.Sprintf("Admin %q set %d events (filter=%s value=%q) to status %q", user.Username, count, req.Filter, req.Value, req.Status))
	app.broker.BroadcastAll(SSEMessage{Event: "bulk_change", Data: `{"action":"status_updated"}`})
	jsonOK(w, map[string]any{"updated": count})
}

func (app *App) handleAdminBulkDelete(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Filter   string `json:"filter"`
		Value    string `json:"value"`
		Confirm  string `json:"confirm"` // must be "DELETE"
		TimeFrom string `json:"time_from,omitempty"`
		TimeTo   string `json:"time_to,omitempty"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Confirm != "DELETE" {
		jsonError(w, "confirmation required: send {\"confirm\":\"DELETE\"}", http.StatusBadRequest)
		return
	}
	validFilters := map[string]bool{"type": true, "user": true, "group": true, "role": true, "status": true, "layer": true, "all": true}
	if !validFilters[req.Filter] {
		jsonError(w, "filter must be one of: type, user, group, role, status, layer, all", http.StatusBadRequest)
		return
	}
	f := BulkFilter{Filter: req.Filter, Value: req.Value}
	if req.TimeFrom != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeFrom); err == nil {
			f.TimeFrom = &t
		}
	}
	if req.TimeTo != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeTo); err == nil {
			f.TimeTo = &t
		}
	}
	count, err := app.store.BulkDeleteEvents(f)
	if err != nil {
		jsonError(w, "bulk delete failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "bulk_deleted", "event", 0,
		fmt.Sprintf("Admin %q deleted %d events (filter=%s value=%q)", user.Username, count, req.Filter, req.Value))
	app.broker.BroadcastAll(SSEMessage{Event: "bulk_change", Data: `{"action":"events_deleted"}`})
	jsonOK(w, map[string]any{"deleted": count})
}

func (app *App) handleAdminBulkSetType(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Filter    string `json:"filter"`
		Value     string `json:"value"`
		EventType string `json:"event_type"`
		TimeFrom  string `json:"time_from,omitempty"`
		TimeTo    string `json:"time_to,omitempty"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.EventType == "" {
		jsonError(w, "event_type required", http.StatusBadRequest)
		return
	}
	validFilters := map[string]bool{"type": true, "user": true, "group": true, "role": true, "status": true, "layer": true, "all": true}
	if !validFilters[req.Filter] {
		jsonError(w, "invalid filter", http.StatusBadRequest)
		return
	}
	f := BulkFilter{Filter: req.Filter, Value: req.Value}
	if req.TimeFrom != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeFrom); err == nil {
			f.TimeFrom = &t
		}
	}
	if req.TimeTo != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeTo); err == nil {
			f.TimeTo = &t
		}
	}
	count, err := app.store.BulkSetEventType(f, req.EventType)
	if err != nil {
		jsonError(w, "bulk update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "bulk_type", "event", 0,
		fmt.Sprintf("Admin %q changed type of %d events (filter=%s value=%q) to %q", user.Username, count, req.Filter, req.Value, req.EventType))
	app.broker.BroadcastAll(SSEMessage{Event: "bulk_change", Data: `{"action":"type_updated"}`})
	jsonOK(w, map[string]any{"updated": count})
}
