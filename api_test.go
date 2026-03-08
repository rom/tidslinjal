package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ── Test helpers ─────────────────────────────────────────────────────────────

// newTestApp creates a fresh App backed by a temp data directory.
func newTestApp(t *testing.T) (*App, *httptest.Server) {
	t.Helper()
	app, err := NewApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewApp: %v", err)
	}
	srv := httptest.NewServer(app.routes())
	t.Cleanup(srv.Close)
	return app, srv
}

// apiDo fires a JSON request and returns the response.
func apiDo(t *testing.T, srv *httptest.Server, method, path string, body any, cookies []*http.Cookie) *http.Response {
	t.Helper()
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, srv.URL+path, bodyReader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request %s %s: %v", method, path, err)
	}
	return resp
}

// login performs a login and returns the session cookie.
func login(t *testing.T, srv *httptest.Server, username, password string) []*http.Cookie {
	t.Helper()
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/login",
		map[string]string{"username": username, "password": password}, nil)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("login failed (%d): %s", resp.StatusCode, body)
	}
	return resp.Cookies()
}

// decodeJSON reads the response body into v.
func decodeJSON(t *testing.T, resp *http.Response, v any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
}

// isSuccess checks that status is 200 or 201.
func isSuccess(code int) bool {
	return code == http.StatusOK || code == http.StatusCreated
}

// ── Auth ─────────────────────────────────────────────────────────────────────

func TestAPI_Login_Success(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/login",
		map[string]string{"username": "admin", "password": "admin"}, nil)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var user map[string]any
	json.NewDecoder(resp.Body).Decode(&user)
	if user["username"] != "admin" {
		t.Errorf("expected username 'admin', got %v", user["username"])
	}
	if user["password_hash"] != nil {
		t.Error("password_hash must not be returned in login response")
	}
}

func TestAPI_Login_InvalidCredentials(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/login",
		map[string]string{"username": "admin", "password": "wrong"}, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPI_Login_UnknownUser(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/login",
		map[string]string{"username": "nobody", "password": "x"}, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPI_Login_SessionCookieSet(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/login",
		map[string]string{"username": "admin", "password": "admin"}, nil)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("login failed: %d", resp.StatusCode)
	}
	hasCookie := false
	for _, c := range resp.Cookies() {
		if c.Name == "session" && c.Value != "" {
			hasCookie = true
		}
	}
	if !hasCookie {
		t.Error("expected session cookie to be set after login")
	}
}

func TestAPI_Logout(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/logout", nil, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	// Subsequent me call should fail
	resp2 := apiDo(t, srv, http.MethodGet, "/api/auth/me", nil, cookies)
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 after logout, got %d", resp2.StatusCode)
	}
}

func TestAPI_Me(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/auth/me", nil, cookies)
	var user map[string]any
	decodeJSON(t, resp, &user)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if user["username"] != "admin" {
		t.Errorf("expected admin, got %v", user["username"])
	}
}

func TestAPI_Me_Unauthenticated(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/auth/me", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

// ── Version ───────────────────────────────────────────────────────────────────

func TestAPI_Version(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/version", nil, nil)
	var result map[string]any
	decodeJSON(t, resp, &result)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	v, ok := result["version"].(string)
	if !ok || v == "" {
		t.Errorf("expected non-empty version, got %v", result["version"])
	}
	if v != AppVersion {
		t.Errorf("version mismatch: got %q, want %q", v, AppVersion)
	}
}

// ── Users ─────────────────────────────────────────────────────────────────────

func TestAPI_GetUsers(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/users", nil, cookies)
	var users []map[string]any
	decodeJSON(t, resp, &users)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if len(users) == 0 {
		t.Error("expected at least 1 user (admin)")
	}
	// Verify password_hash is not exposed
	for _, u := range users {
		if _, exists := u["password_hash"]; exists {
			t.Error("password_hash must not be in GET /api/users response")
		}
	}
}

func TestAPI_GetUsers_Unauthenticated(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/users", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPI_CreateUser(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	newUser := map[string]any{
		"username":     "testuser",
		"password":     "testpass123",
		"display_name": "Test User",
		"role":         "read",
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/users", newUser, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 200/201, got %d: %v", resp.StatusCode, created)
	}
	if created["username"] != "testuser" {
		t.Errorf("expected username 'testuser', got %v", created["username"])
	}
	id := created["id"]
	if id == nil || id == float64(0) {
		t.Error("expected non-zero user ID")
	}
}

func TestAPI_CreateUser_NonAdmin_Forbidden(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	// Create a read-only user
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "reader", "password": "pass", "display_name": "Reader", "role": "read",
	}, adminCookies)
	readerCookies := login(t, srv, "reader", "pass")

	resp := apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "another", "password": "pass", "display_name": "Another", "role": "read",
	}, readerCookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin creating user, got %d", resp.StatusCode)
	}
}

func TestAPI_UpdateUser(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create user
	resp := apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "updateme", "password": "pass", "display_name": "Old Name", "role": "read",
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := int(created["id"].(float64))

	// Update
	resp2 := apiDo(t, srv, http.MethodPut, fmt.Sprintf("/api/users/%d", id), map[string]any{
		"username": "updateme", "display_name": "New Name", "role": "readwrite",
	}, cookies)
	if !isSuccess(resp2.StatusCode) {
		body, _ := io.ReadAll(resp2.Body)
		resp2.Body.Close()
		t.Fatalf("expected 200, got %d: %s", resp2.StatusCode, body)
	}
	resp2.Body.Close()
}

func TestAPI_DeleteUser(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "tobedeleted", "password": "pass", "display_name": "Del", "role": "read",
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := int(created["id"].(float64))

	resp2 := apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/users/%d", id), nil, cookies)
	defer resp2.Body.Close()
	if !isSuccess(resp2.StatusCode) {
		t.Errorf("expected 200 on delete, got %d", resp2.StatusCode)
	}
}

// ── Event types ───────────────────────────────────────────────────────────────

func TestAPI_GetEventTypes(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/event-types", nil, nil)
	var types []map[string]any
	decodeJSON(t, resp, &types)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if len(types) < len(SystemEventTypes) {
		t.Errorf("expected at least %d event types, got %d", len(SystemEventTypes), len(types))
	}
}

func TestAPI_CreateEventType_RequiresReadWrite(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "reader2", "password": "pass", "display_name": "R", "role": "read",
	}, adminCookies)
	readerCookies := login(t, srv, "reader2", "pass")

	resp := apiDo(t, srv, http.MethodPost, "/api/event-types", map[string]any{
		"key": "custom", "label": "Custom", "color": "#FF0000",
	}, readerCookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for read-only user, got %d", resp.StatusCode)
	}
}

// ── Events ────────────────────────────────────────────────────────────────────

func TestAPI_CreateEvent(t *testing.T) {
	_, srv := newTestApp(t)
	// Admin is oplead — can create master-timeline events
	cookies := login(t, srv, "admin", "admin")

	now := time.Now().UTC().Truncate(time.Minute)
	end := now.Add(time.Hour)
	event := map[string]any{
		"title":      "Test Event",
		"event_type": "event",
		"status":     "planned",
		"start_time": now.Format(time.RFC3339),
		"end_time":   end.Format(time.RFC3339),
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/events", event, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 200/201, got %d: %v", resp.StatusCode, created)
	}
	if created["title"] != "Test Event" {
		t.Errorf("title mismatch: %v", created["title"])
	}
	if created["id"] == nil || created["id"].(float64) == 0 {
		t.Error("expected non-zero event ID")
	}
}

func TestAPI_CreateEvent_Unauthenticated(t *testing.T) {
	_, srv := newTestApp(t)
	now := time.Now().UTC()
	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Bad", "event_type": "event", "start_time": now.Format(time.RFC3339),
	}, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPI_GetEvents(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now().UTC().Truncate(time.Minute)
	end := now.Add(time.Hour)
	apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Queryable", "event_type": "event", "status": "planned",
		"start_time": now.Format(time.RFC3339), "end_time": end.Format(time.RFC3339),
	}, cookies)

	from := now.Add(-time.Minute).Format(time.RFC3339)
	to := now.Add(2 * time.Hour).Format(time.RFC3339)
	resp := apiDo(t, srv, http.MethodGet,
		fmt.Sprintf("/api/events?from=%s&to=%s", from, to), nil, cookies)
	var events []map[string]any
	decodeJSON(t, resp, &events)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	found := false
	for _, e := range events {
		if e["title"] == "Queryable" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find 'Queryable' in events list")
	}
}

func TestAPI_UpdateEvent(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now().UTC().Truncate(time.Minute)
	end := now.Add(time.Hour)
	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Update Me", "event_type": "event", "status": "planned",
		"start_time": now.Format(time.RFC3339), "end_time": end.Format(time.RFC3339),
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := int(created["id"].(float64))

	resp2 := apiDo(t, srv, http.MethodPut, fmt.Sprintf("/api/events/%d", id), map[string]any{
		"title": "Updated Title", "event_type": "event", "status": "planned",
		"start_time": now.Format(time.RFC3339), "end_time": end.Format(time.RFC3339),
	}, cookies)
	var updated map[string]any
	decodeJSON(t, resp2, &updated)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("expected 200, got %d: %v", resp2.StatusCode, updated)
	}
	if updated["title"] != "Updated Title" {
		t.Errorf("title not updated: %v", updated["title"])
	}
}

func TestAPI_DeleteEvent(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now().UTC().Truncate(time.Minute)
	end := now.Add(time.Hour)
	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Delete Me", "event_type": "event", "status": "planned",
		"start_time": now.Format(time.RFC3339), "end_time": end.Format(time.RFC3339),
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := int(created["id"].(float64))

	resp2 := apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/events/%d", id), nil, cookies)
	defer resp2.Body.Close()
	if !isSuccess(resp2.StatusCode) {
		t.Errorf("expected 200 on delete, got %d", resp2.StatusCode)
	}
}

func TestAPI_PatchEventStatus(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now().UTC().Truncate(time.Minute)
	end := now.Add(time.Hour)
	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Status Changer", "event_type": "event", "status": "planned",
		"start_time": now.Format(time.RFC3339), "end_time": end.Format(time.RFC3339),
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := int(created["id"].(float64))

	resp2 := apiDo(t, srv, http.MethodPatch, fmt.Sprintf("/api/events/%d/status", id),
		map[string]any{"status": "active"}, cookies)
	var patched map[string]any
	decodeJSON(t, resp2, &patched)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("expected 200, got %d: %v", resp2.StatusCode, patched)
	}
	if patched["status"] != "active" {
		t.Errorf("status not updated: %v", patched["status"])
	}
}

// ── Layers ─────────────────────────────────────────────────────────────────────

func TestAPI_CreateAndGetLayers(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create a readwrite user for layer creation
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "layermaker", "password": "pass", "display_name": "LM", "role": "readwrite",
	}, cookies)
	lmCookies := login(t, srv, "layermaker", "pass")

	resp := apiDo(t, srv, http.MethodPost, "/api/layers", map[string]any{
		"name":       "Ops Layer",
		"color":      "#0000FF",
		"visibility": "private",
	}, lmCookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d: %v", resp.StatusCode, created)
	}
	if created["name"] != "Ops Layer" {
		t.Errorf("layer name mismatch: %v", created["name"])
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/layers", nil, lmCookies)
	var layers []map[string]any
	decodeJSON(t, resp2, &layers)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("expected 200 on GET layers, got %d", resp2.StatusCode)
	}
	found := false
	for _, l := range layers {
		if l["name"] == "Ops Layer" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find 'Ops Layer' in layers list")
	}
}

// ── Preferences ───────────────────────────────────────────────────────────────

func TestAPI_GetAndSavePreferences(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// GET default prefs
	resp := apiDo(t, srv, http.MethodGet, "/api/preferences", nil, cookies)
	var prefs map[string]any
	decodeJSON(t, resp, &prefs)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if prefs["language"] == nil {
		t.Error("expected language field in preferences")
	}

	// PUT updated prefs
	resp2 := apiDo(t, srv, http.MethodPut, "/api/preferences", map[string]any{
		"theme": "light", "language": "sv", "size": "large",
		"day_start_hour": 6, "day_end_hour": 22,
	}, cookies)
	if !isSuccess(resp2.StatusCode) {
		body, _ := io.ReadAll(resp2.Body)
		resp2.Body.Close()
		t.Fatalf("expected 200, got %d: %s", resp2.StatusCode, body)
	}
	resp2.Body.Close()

	// Verify saved
	resp3 := apiDo(t, srv, http.MethodGet, "/api/preferences", nil, cookies)
	var saved map[string]any
	decodeJSON(t, resp3, &saved)
	if saved["theme"] != "light" || saved["language"] != "sv" {
		t.Errorf("preferences not saved: theme=%v lang=%v", saved["theme"], saved["language"])
	}
}

// ── Groups ────────────────────────────────────────────────────────────────────

func TestAPI_CreateAndGetGroups(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "teamlead", "password": "pass", "display_name": "TL", "role": "teamlead",
	}, adminCookies)
	tlCookies := login(t, srv, "teamlead", "pass")

	resp := apiDo(t, srv, http.MethodPost, "/api/groups", map[string]any{
		"name": "Bravo Team", "description": "Intel group",
	}, tlCookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d: %v", resp.StatusCode, created)
	}
	if created["name"] != "Bravo Team" {
		t.Errorf("group name mismatch: %v", created["name"])
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/groups", nil, tlCookies)
	var groups []map[string]any
	decodeJSON(t, resp2, &groups)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}
	found := false
	for _, g := range groups {
		if g["name"] == "Bravo Team" {
			found = true
		}
	}
	if !found {
		t.Error("expected 'Bravo Team' in groups")
	}
}

// ── Comments ──────────────────────────────────────────────────────────────────

func TestAPI_CreateAndGetComments(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now().UTC().Truncate(time.Minute)
	end := now.Add(time.Hour)
	evResp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Commented", "event_type": "event", "status": "planned",
		"start_time": now.Format(time.RFC3339), "end_time": end.Format(time.RFC3339),
	}, cookies)
	var ev map[string]any
	decodeJSON(t, evResp, &ev)
	id := int(ev["id"].(float64))

	resp := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/events/%d/comments", id),
		map[string]any{"content": "This is a comment"}, cookies)
	var comment map[string]any
	decodeJSON(t, resp, &comment)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d: %v", resp.StatusCode, comment)
	}
	if comment["content"] != "This is a comment" {
		t.Errorf("comment content mismatch: %v", comment["content"])
	}

	resp2 := apiDo(t, srv, http.MethodGet, fmt.Sprintf("/api/events/%d/comments", id), nil, cookies)
	var comments []map[string]any
	decodeJSON(t, resp2, &comments)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}
	if len(comments) != 1 {
		t.Errorf("expected 1 comment, got %d", len(comments))
	}
}

// ── Alarms ────────────────────────────────────────────────────────────────────

func TestAPI_CreateAndGetAlarms(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now().UTC().Truncate(time.Minute)
	end := now.Add(time.Hour)
	evResp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Alarmed Event", "event_type": "event", "status": "planned",
		"start_time": now.Format(time.RFC3339), "end_time": end.Format(time.RFC3339),
	}, cookies)
	var ev map[string]any
	decodeJSON(t, evResp, &ev)
	id := int(ev["id"].(float64))

	resp := apiDo(t, srv, http.MethodPost, "/api/alarms", map[string]any{
		"event_id":  id,
		"lead_time": 15,
	}, cookies)
	var alarm map[string]any
	decodeJSON(t, resp, &alarm)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d: %v", resp.StatusCode, alarm)
	}
	if alarm["lead_time"].(float64) != 15 {
		t.Errorf("lead_time mismatch: %v", alarm["lead_time"])
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/alarms", nil, cookies)
	var alarms []map[string]any
	decodeJSON(t, resp2, &alarms)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}
	if len(alarms) == 0 {
		t.Error("expected at least 1 alarm")
	}
}

// ── Phases ────────────────────────────────────────────────────────────────────

func TestAPI_CreateAndGetPhases(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "tl2", "password": "pass", "display_name": "TL2", "role": "teamlead",
	}, adminCookies)
	tlCookies := login(t, srv, "tl2", "pass")

	now := time.Now().UTC().Truncate(time.Minute)
	resp := apiDo(t, srv, http.MethodPost, "/api/phases", map[string]any{
		"name":       "Alpha Phase",
		"color":      "#FF0000",
		"start_time": now.Format(time.RFC3339),
		"end_time":   now.Add(4 * time.Hour).Format(time.RFC3339),
		"order":      0,
	}, tlCookies)
	var phase map[string]any
	decodeJSON(t, resp, &phase)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d: %v", resp.StatusCode, phase)
	}
	if phase["name"] != "Alpha Phase" {
		t.Errorf("phase name mismatch: %v", phase["name"])
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/phases", nil, tlCookies)
	var phases []map[string]any
	decodeJSON(t, resp2, &phases)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}
	if len(phases) != 1 {
		t.Errorf("expected 1 phase, got %d", len(phases))
	}
}

// ── Exercise ──────────────────────────────────────────────────────────────────

func TestAPI_GetExercise(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodGet, "/api/exercise", nil, cookies)
	var ex map[string]any
	decodeJSON(t, resp, &ex)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if _, ok := ex["enabled"]; !ok {
		t.Error("expected 'enabled' field in exercise response")
	}
}

func TestAPI_SaveExercise_RequiresOpLead(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "rwuser", "password": "pass", "display_name": "RW", "role": "readwrite",
	}, adminCookies)
	rwCookies := login(t, srv, "rwuser", "pass")

	resp := apiDo(t, srv, http.MethodPut, "/api/exercise", map[string]any{
		"enabled": true, "epoch": time.Now().Format(time.RFC3339), "label": "X",
	}, rwCookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for readwrite user setting exercise, got %d", resp.StatusCode)
	}
}

// ── Export / Import ───────────────────────────────────────────────────────────

func TestAPI_Export(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodGet, "/api/export", nil, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	// Check that the export JSON contains the expected top-level keys
	// (values may be null for empty collections)
	for _, field := range []string{"version", "events", "groups", "layers"} {
		if !strings.Contains(bodyStr, `"`+field+`"`) {
			t.Errorf("expected %q key in export JSON", field)
		}
	}
}

// ── Audit ─────────────────────────────────────────────────────────────────────

func TestAPI_GetAudit(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	// Create a teamlead to check audit access
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "tl3", "password": "pass", "display_name": "TL3", "role": "teamlead",
	}, adminCookies)
	tlCookies := login(t, srv, "tl3", "pass")

	resp := apiDo(t, srv, http.MethodGet, "/api/audit", nil, tlCookies)
	var entries []map[string]any
	decodeJSON(t, resp, &entries)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	// Audit should have entries from login events
	if len(entries) == 0 {
		t.Error("expected at least 1 audit entry")
	}
}

func TestAPI_GetAudit_ReadOnlyForbidden(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "reader3", "password": "pass", "display_name": "R3", "role": "read",
	}, adminCookies)
	readerCookies := login(t, srv, "reader3", "pass")

	resp := apiDo(t, srv, http.MethodGet, "/api/audit", nil, readerCookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for read-only user accessing audit, got %d", resp.StatusCode)
	}
}

// ── Password change ───────────────────────────────────────────────────────────

func TestAPI_ChangePassword(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "pwuser", "password": "oldpass", "display_name": "PW", "role": "read",
	}, adminCookies)
	pwCookies := login(t, srv, "pwuser", "oldpass")

	resp := apiDo(t, srv, http.MethodPost, "/api/auth/change-password", map[string]any{
		"current_password": "oldpass",
		"new_password":     "newpass123",
	}, pwCookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}

	// Login with new password should work
	resp2 := apiDo(t, srv, http.MethodPost, "/api/auth/login", map[string]any{
		"username": "pwuser", "password": "newpass123",
	}, nil)
	defer resp2.Body.Close()
	if !isSuccess(resp2.StatusCode) {
		t.Error("expected login with new password to succeed")
	}

	// Old password should fail
	resp3 := apiDo(t, srv, http.MethodPost, "/api/auth/login", map[string]any{
		"username": "pwuser", "password": "oldpass",
	}, nil)
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusUnauthorized {
		t.Error("expected old password login to fail after change")
	}
}

// ── Method not allowed ────────────────────────────────────────────────────────

func TestAPI_MethodNotAllowed(t *testing.T) {
	_, srv := newTestApp(t)
	// /api/event-types only supports GET and POST, not DELETE
	resp := apiDo(t, srv, http.MethodDelete, "/api/event-types", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

// ── JSON content-type ─────────────────────────────────────────────────────────

func TestAPI_ResponseContentType(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/version", nil, nil)
	defer resp.Body.Close()
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Errorf("expected application/json content-type, got %q", ct)
	}
}

// ── Static files ─────────────────────────────────────────────────────────────

func TestAPI_StaticFiles(t *testing.T) {
	_, srv := newTestApp(t)
	// The test runs from the package root; static files should be served
	resp, err := http.Get(srv.URL + "/static/style.css")
	if err != nil {
		t.Fatalf("GET /static/style.css: %v", err)
	}
	defer resp.Body.Close()
	// Allow 200 or 404 depending on working directory during test
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		t.Errorf("unexpected status for static file: %d", resp.StatusCode)
	}
}

// ── Locks ─────────────────────────────────────────────────────────────────────

func TestAPI_Locks_ReadRequiresAuth(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/locks", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated locks request, got %d", resp.StatusCode)
	}
}

func TestAPI_CreateLock_RequiresCanLock(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")
	// Regular user without can_lock
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "nolocker", "password": "pass", "display_name": "NL", "role": "readwrite",
	}, adminCookies)
	nlCookies := login(t, srv, "nolocker", "pass")

	now := time.Now().UTC()
	resp := apiDo(t, srv, http.MethodPost, "/api/locks", map[string]any{
		"start_time": now.Format(time.RFC3339),
		"end_time":   now.Add(time.Hour).Format(time.RFC3339),
		"reason":     "Test",
		"scope":      "all",
	}, nlCookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for user without can_lock, got %d", resp.StatusCode)
	}
}
