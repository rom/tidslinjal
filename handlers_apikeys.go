package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// ── API Keys ──────────────────────────────────────────────────────────────────

func (app *App) handleListAPIKeys(w http.ResponseWriter, r *http.Request, user *User) {
	keys := app.store.GetAPIKeys()
	if keys == nil {
		keys = []APIKey{}
	}
	// Strip secrets from list response
	safe := make([]APIKey, len(keys))
	for i, k := range keys {
		safe[i] = k
		safe[i].KeyHash = ""
		safe[i].KeyPlain = ""
		safe[i].Key = ""
	}
	jsonOK(w, safe)
}

func (app *App) handleRevealAPIKey(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/apikeys/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	keys := app.store.GetAPIKeys()
	for _, k := range keys {
		if k.ID == id {
			if k.KeyPlain == "" {
				jsonError(w, "key was created without 'Save raw key' enabled — recreate with that option to enable reveal", http.StatusNotFound)
				return
			}
			app.audit(user.ID, user.DisplayName, "revealed", "api_key", id,
				fmt.Sprintf("Revealed API key %q", k.Name))
			jsonOK(w, map[string]string{"key": k.KeyPlain})
			return
		}
	}
	jsonError(w, "not found", http.StatusNotFound)
}

func (app *App) handleCreateAPIKey(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Role        Role   `json:"role"`
		SaveRawKey  bool   `json:"save_raw_key"`
		RouteMode   string `json:"route_mode"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	// M-05 fix: validate and default API key role
	if req.Role == "" {
		req.Role = RoleRead
	}
	validAPIKeyRoles := map[Role]bool{
		RoleObserver: true, RoleRead: true, RoleReporter: true,
		RoleReadWrite: true, RoleTeamLead: true, RoleOpLead: true,
	}
	if !validAPIKeyRoles[req.Role] {
		jsonError(w, "invalid role for API key (admin/staff roles not allowed)", http.StatusBadRequest)
		return
	}

	// Generate a random API key
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		jsonError(w, "failed to generate key", http.StatusInternalServerError)
		return
	}
	rawKey := "tlk_" + hex.EncodeToString(raw)
	hash, err := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "failed to hash key", http.StatusInternalServerError)
		return
	}

	// Validate route mode
	if req.RouteMode == "" {
		req.RouteMode = "message_archive"
	}
	if req.RouteMode != "message_archive" && req.RouteMode != "external_event" {
		jsonError(w, "invalid route_mode (must be message_archive or external_event)", http.StatusBadRequest)
		return
	}

	keyPlain := ""
	if req.SaveRawKey {
		keyPlain = rawKey
	}

	k := APIKey{
		Name:        req.Name,
		Description: req.Description,
		Role:        req.Role,
		KeyHash:     string(hash),
		KeyPlain:    keyPlain,
		SaveRawKey:  req.SaveRawKey,
		RouteMode:   req.RouteMode,
		CreatedBy:   user.ID,
	}
	created, err := app.store.CreateAPIKey(k)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "api_key", created.ID,
		fmt.Sprintf("Created API key %q", req.Name))
	// Return the raw key once (never stored in plain text)
	created.Key = rawKey
	created.KeyHash = ""
	jsonOK(w, created)
}

func (app *App) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/apikeys/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteAPIKey(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "api_key", id, fmt.Sprintf("Deleted API key #%d", id))
	jsonOK(w, map[string]string{"status": "deleted"})
}
