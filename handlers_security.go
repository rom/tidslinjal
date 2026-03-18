package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
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
