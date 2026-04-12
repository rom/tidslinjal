package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// ── Security Settings Handlers ────────────────────────────────────────────────

func (app *App) handleGetSecuritySettings(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetSecuritySettings())
}

func (app *App) handleSaveSecuritySettings(w http.ResponseWriter, r *http.Request, user *User) {
	var ss SecuritySettings
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&ss); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if ss.MinLength == 0 {
		ss.MinLength = 8
	}
	// Apply session management defaults
	if ss.SessionTimeHours == 0 {
		ss.SessionTimeHours = 100
	}
	if ss.IdleTimeoutHours == 0 {
		ss.IdleTimeoutHours = 100
	}
	if err := app.store.SaveSecuritySettings(ss); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "security_settings", 0, "Updated password policy")
	jsonOK(w, ss)
}

// ── TLS Config Handlers ───────────────────────────────────────────────────────

func (app *App) handleGetTLSConfig(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetTLSConfig())
}

func (app *App) handleSaveTLSConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg TLSConfig
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Validate paths exist if provided
	if cfg.CertFile != "" {
		if _, err := os.Stat(cfg.CertFile); err != nil {
			jsonError(w, "cert file not accessible", http.StatusBadRequest)
			return
		}
	}
	if cfg.KeyFile != "" {
		if _, err := os.Stat(cfg.KeyFile); err != nil {
			jsonError(w, "key file not accessible", http.StatusBadRequest)
			return
		}
	}
	if err := app.store.SaveTLSConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "tls_config", 0,
		fmt.Sprintf("Updated TLS config: cert=%s key=%s", cfg.CertFile, cfg.KeyFile))
	jsonOK(w, map[string]any{
		"cert_file":       cfg.CertFile,
		"key_file":        cfg.KeyFile,
		"restart_required": true,
	})
}

// ── IP Blacklist Handlers ────────────────────────────────────────────────────

func (app *App) handleGetIPBlacklist(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetIPBlacklist())
}

func (app *App) handleSaveIPBlacklist(w http.ResponseWriter, r *http.Request, user *User) {
	var settings IPBlacklistSettings
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&settings); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Validate each entry
	for i, entry := range settings.Entries {
		entry.IP = strings.TrimSpace(entry.IP)
		if entry.IP == "" {
			jsonError(w, fmt.Sprintf("entry %d: IP is required", i), http.StatusBadRequest)
			return
		}
		// Validate IP or CIDR format
		if strings.Contains(entry.IP, "/") {
			if _, _, err := net.ParseCIDR(entry.IP); err != nil {
				jsonError(w, fmt.Sprintf("entry %d: invalid CIDR %q: %v", i, entry.IP, err), http.StatusBadRequest)
				return
			}
		} else {
			if net.ParseIP(entry.IP) == nil {
				jsonError(w, fmt.Sprintf("entry %d: invalid IP %q", i, entry.IP), http.StatusBadRequest)
				return
			}
		}
		settings.Entries[i] = entry
	}
	if err := app.store.SaveIPBlacklist(settings); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "ip_blacklist", 0,
		fmt.Sprintf("Updated IP blacklist: enabled=%v, %d entries", settings.Enabled, len(settings.Entries)))
	jsonOK(w, settings)
}

func (app *App) handleAddIPBlacklistEntry(w http.ResponseWriter, r *http.Request, user *User) {
	var entry IPBlacklistEntry
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&entry); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	entry.IP = strings.TrimSpace(entry.IP)
	if entry.IP == "" {
		jsonError(w, "IP is required", http.StatusBadRequest)
		return
	}
	// Validate
	if strings.Contains(entry.IP, "/") {
		if _, _, err := net.ParseCIDR(entry.IP); err != nil {
			jsonError(w, fmt.Sprintf("invalid CIDR %q: %v", entry.IP, err), http.StatusBadRequest)
			return
		}
	} else {
		if net.ParseIP(entry.IP) == nil {
			jsonError(w, fmt.Sprintf("invalid IP %q", entry.IP), http.StatusBadRequest)
			return
		}
	}
	entry.AddedBy = user.DisplayName
	if entry.AddedBy == "" {
		entry.AddedBy = user.Username
	}
	entry.AddedAt = time.Now().Format(time.RFC3339)

	settings := app.store.GetIPBlacklist()
	// Check for duplicates
	for _, existing := range settings.Entries {
		if existing.IP == entry.IP {
			jsonError(w, "IP already in blacklist", http.StatusConflict)
			return
		}
	}
	settings.Entries = append(settings.Entries, entry)
	if err := app.store.SaveIPBlacklist(settings); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "added", "ip_blacklist", 0,
		fmt.Sprintf("SECURITY: Added IP %s to blacklist (reason: %s)", entry.IP, entry.Reason))
	jsonOK(w, settings)
}

func (app *App) handleRemoveIPBlacklistEntry(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		IP string `json:"ip"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	req.IP = strings.TrimSpace(req.IP)
	settings := app.store.GetIPBlacklist()
	found := false
	newEntries := make([]IPBlacklistEntry, 0, len(settings.Entries))
	for _, e := range settings.Entries {
		if e.IP == req.IP {
			found = true
			continue
		}
		newEntries = append(newEntries, e)
	}
	if !found {
		jsonError(w, "IP not found in blacklist", http.StatusNotFound)
		return
	}
	settings.Entries = newEntries
	if err := app.store.SaveIPBlacklist(settings); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "removed", "ip_blacklist", 0,
		fmt.Sprintf("SECURITY: Removed IP %s from blacklist", req.IP))
	jsonOK(w, settings)
}

// handleExportIPBlacklist returns the blacklist as downloadable JSON
func (app *App) handleExportIPBlacklist(w http.ResponseWriter, r *http.Request, user *User) {
	settings := app.store.GetIPBlacklist()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=ip_blacklist.json")
	json.NewEncoder(w).Encode(settings)
}

// handleImportIPBlacklist loads a blacklist from uploaded JSON (merge or replace)
func (app *App) handleImportIPBlacklist(w http.ResponseWriter, r *http.Request, user *User) {
	var imported IPBlacklistSettings
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&imported); err != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	mode := r.URL.Query().Get("mode") // "replace" or "merge" (default: merge)
	current := app.store.GetIPBlacklist()
	if mode == "replace" {
		current.Entries = imported.Entries
		current.Enabled = imported.Enabled
	} else {
		// Merge: add entries that don't already exist
		existingIPs := map[string]bool{}
		for _, e := range current.Entries {
			existingIPs[e.IP] = true
		}
		for _, e := range imported.Entries {
			if !existingIPs[e.IP] {
				current.Entries = append(current.Entries, e)
				existingIPs[e.IP] = true
			}
		}
		if imported.Enabled {
			current.Enabled = true
		}
	}
	if err := app.store.SaveIPBlacklist(current); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "imported", "ip_blacklist", 0,
		fmt.Sprintf("SECURITY: Imported IP blacklist (%s mode, %d entries total)", mode, len(current.Entries)))
	jsonOK(w, current)
}

// ── TLS Status endpoint (used by sidebar security tab) ─────────────────────────

func (app *App) handleTLSStatus(w http.ResponseWriter, r *http.Request, user *User) {
	tlsCfg := app.store.GetTLSConfig()
	configured := tlsCfg.CertFile != "" && tlsCfg.KeyFile != ""
	jsonOK(w, map[string]any{
		"configured": configured,
		"cert_file":  tlsCfg.CertFile,
		"key_file":   tlsCfg.KeyFile,
	})
}

// ── OIDC Config endpoint (used by sidebar security tab) ────────────────────────
// This provides the /api/oidc/config endpoint that the frontend expects,
// returning fields matching the sidebar.js expectations.

func (app *App) handleOIDCConfigForSidebar(w http.ResponseWriter, r *http.Request, user *User) {
	oidcCfg := app.store.GetOIDCSettings()
	if !oidcCfg.Enabled || oidcCfg.Issuer == "" {
		// Return empty/null so frontend shows "not configured"
		jsonOK(w, map[string]any{})
		return
	}
	exclusiveMode := oidcCfg.Exclusive || app.store.GetSecuritySettings().DisablePasswordLogin
	defaultRole := oidcCfg.DefaultRole
	if defaultRole == "" {
		defaultRole = "teammember"
	}
	jsonOK(w, map[string]any{
		"issuer":         oidcCfg.Issuer,
		"client_id":      oidcCfg.ClientID,
		"redirect_url":   oidcCfg.RedirectURL,
		"exclusive_mode": exclusiveMode,
		"sso_enabled":    oidcCfg.Enabled,
		"default_role":   defaultRole,
	})
}

// ── Security Policy endpoint (used by sidebar security tab) ────────────────────

func (app *App) handleSecurityPolicy(w http.ResponseWriter, r *http.Request, user *User) {
	ss := app.store.GetSecuritySettings()
	jsonOK(w, ss)
}

// ── Active Sessions (admin only) ──────────────────────────────────────────

// handleListActiveSessions returns all non-expired sessions with enriched
// user info. Admin only. Session IDs are truncated to the first 8 chars
// to avoid exposing full tokens in the UI (cookie theft risk).
func (app *App) handleListActiveSessions(w http.ResponseWriter, r *http.Request, user *User) {
	sessions := app.store.GetActiveSessions()
	type sessionView struct {
		IDPrefix    string `json:"id_prefix"` // first 8 chars, used for display only
		IDHash      string `json:"id_hash"`   // SHA-256 hex of full ID, used for delete lookup
		UserID      int64  `json:"user_id"`
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		IPAddress   string `json:"ip_address,omitempty"`
		UserAgent   string `json:"user_agent,omitempty"`
		CreatedAt   string `json:"created_at,omitempty"`
		ExpiresAt   string `json:"expires_at"`
		IsCurrent   bool   `json:"is_current"` // the session making this request
	}
	// Current session ID for "this session" marking
	currentID := ""
	if c, err := r.Cookie("session"); err == nil {
		currentID = c.Value
	}
	views := make([]sessionView, 0, len(sessions))
	for _, s := range sessions {
		u, ok := app.store.GetUserByID(s.UserID)
		username := ""
		displayName := ""
		if ok {
			username = u.Username
			displayName = u.DisplayName
		}
		idPrefix := s.ID
		if len(idPrefix) > 8 {
			idPrefix = idPrefix[:8]
		}
		hash := sha256.Sum256([]byte(s.ID))
		created := ""
		if !s.CreatedAt.IsZero() {
			created = s.CreatedAt.Format(time.RFC3339)
		}
		views = append(views, sessionView{
			IDPrefix:    idPrefix,
			IDHash:      hex.EncodeToString(hash[:]),
			UserID:      s.UserID,
			Username:    username,
			DisplayName: displayName,
			IPAddress:   s.IPAddress,
			UserAgent:   s.UserAgent,
			CreatedAt:   created,
			ExpiresAt:   s.ExpiresAt.Format(time.RFC3339),
			IsCurrent:   s.ID == currentID,
		})
	}
	jsonOK(w, views)
}

// handleDeleteActiveSession destroys one or more sessions by their SHA-256
// hashed ID. Admin only. Refuses to delete the caller's current session
// (the admin should use regular logout for that).
func (app *App) handleDeleteActiveSession(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		IDHash      string `json:"id_hash"`
		UserID      int64  `json:"user_id"`
		AllForUser  bool   `json:"all_for_user"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Determine the current session ID to refuse self-deletion via this endpoint
	currentID := ""
	if c, err := r.Cookie("session"); err == nil {
		currentID = c.Value
	}

	if req.AllForUser && req.UserID > 0 {
		// Prevent admin from nuking their own sessions via this endpoint
		if req.UserID == user.ID {
			jsonError(w, "use regular logout to sign out your own sessions", http.StatusBadRequest)
			return
		}
		u, ok := app.store.GetUserByID(req.UserID)
		if !ok {
			jsonError(w, "user not found", http.StatusNotFound)
			return
		}
		app.store.DeleteSessionsForUser(req.UserID)
		app.audit(user.ID, user.DisplayName, "deleted", "sessions", req.UserID,
			fmt.Sprintf("Admin %q destroyed all sessions for user %q", user.Username, u.Username))
		jsonOK(w, map[string]string{"status": "ok"})
		return
	}

	// Single session deletion: find by hash
	if req.IDHash == "" {
		jsonError(w, "id_hash or user_id required", http.StatusBadRequest)
		return
	}
	target := ""
	var targetUserID int64
	for _, s := range app.store.GetActiveSessions() {
		h := sha256.Sum256([]byte(s.ID))
		if hex.EncodeToString(h[:]) == req.IDHash {
			target = s.ID
			targetUserID = s.UserID
			break
		}
	}
	if target == "" {
		jsonError(w, "session not found", http.StatusNotFound)
		return
	}
	if target == currentID {
		jsonError(w, "cannot destroy your own current session via admin endpoint; use logout", http.StatusBadRequest)
		return
	}
	_ = app.store.DeleteSession(target)
	targetName := ""
	if u, ok := app.store.GetUserByID(targetUserID); ok {
		targetName = u.Username
	}
	app.audit(user.ID, user.DisplayName, "deleted", "session", targetUserID,
		fmt.Sprintf("Admin %q destroyed session for user %q", user.Username, targetName))
	jsonOK(w, map[string]string{"status": "ok"})
}
