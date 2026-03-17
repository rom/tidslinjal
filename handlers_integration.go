package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

// ── Connector management handlers ───────────────────────────────────────────

// handleConnectors handles GET /api/connectors (list all connectors).
func (app *App) handleConnectors(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	jsonOK(w, app.connectors.List())
}

// handleConnectorConfig handles GET/PUT /api/connectors/{name}
func (app *App) handleConnectorConfig(w http.ResponseWriter, r *http.Request, user *User) {
	name := strings.TrimPrefix(r.URL.Path, "/api/connectors/")
	if name == "" {
		jsonError(w, "Missing connector name", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, ok := app.connectors.GetConfig(name)
		if !ok {
			jsonError(w, "Connector not found", http.StatusNotFound)
			return
		}
		jsonOK(w, cfg)

	case http.MethodPut:
		var cfg ConnectorConfig
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
			jsonError(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		cfg.Name = name
		if err := app.connectors.SetConfig(cfg); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := app.store.SaveConnectorConfig(cfg); err != nil {
			jsonError(w, "Failed to persist config", http.StatusInternalServerError)
			return
		}
		jsonOK(w, cfg)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── LDAP config handlers ────────────────────────────────────────────────────

// handleLDAPConfig handles GET/PUT /api/integrations/ldap
func (app *App) handleLDAPConfig(w http.ResponseWriter, r *http.Request, user *User) {
	switch r.Method {
	case http.MethodGet:
		jsonOK(w, app.ldap.GetConfig())

	case http.MethodPut:
		var cfg LDAPConfig
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
			jsonError(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		rawCfg, _ := json.Marshal(cfg)
		connCfg := ConnectorConfig{
			Name:    "ldap",
			Enabled: true,
			Config:  rawCfg,
		}
		if err := app.connectors.SetConfig(connCfg); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := app.store.SaveConnectorConfig(connCfg); err != nil {
			jsonError(w, "Failed to persist LDAP config", http.StatusInternalServerError)
			return
		}
		jsonOK(w, app.ldap.GetConfig())

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleLDAPTest handles POST /api/integrations/ldap/test
func (app *App) handleLDAPTest(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		jsonError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	result, err := app.ldap.Authenticate(req.Username, req.Password)
	if err != nil {
		jsonOK(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	jsonOK(w, map[string]interface{}{
		"success":      true,
		"username":     result.Username,
		"display_name": result.DisplayName,
		"email":        result.Email,
		"role":         result.Role,
		"groups":       result.Groups,
		"j_designations": result.JDesignations,
	})
}
