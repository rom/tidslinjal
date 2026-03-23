package main

import (
	"fmt"
	"net/http"
	"testing"
	"time"
)

// ── Data integrity tests: cascade deletes, referential validation ───────────

func TestIntegrity_UserDelete_CascadesSessions(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create a user
	resp := apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "cascadetest", "password": "pass123", "display_name": "Cascade", "role": "read",
	}, cookies)
	var user map[string]any
	decodeJSON(t, resp, &user)
	userID := int64(user["id"].(float64))

	// Login as the new user to create a session
	userCookies := login(t, srv, "cascadetest", "pass123")
	_ = userCookies

	// Delete the user (sessions should be cascaded)
	resp2 := apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/users/%d", userID), nil, cookies)
	defer resp2.Body.Close()
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("delete user: got %d", resp2.StatusCode)
	}

	// Verify user's session is no longer valid (try to use it)
	resp3 := apiDo(t, srv, http.MethodGet, "/api/preferences", nil, userCookies)
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 after user deletion, got %d", resp3.StatusCode)
	}
}

func TestIntegrity_UserDelete_CascadesPreferences(t *testing.T) {
	app, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create user
	resp := apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "preftest", "password": "pass123", "display_name": "Pref", "role": "read",
	}, cookies)
	var user map[string]any
	decodeJSON(t, resp, &user)
	userID := int64(user["id"].(float64))

	// Login and set preferences
	userCookies := login(t, srv, "preftest", "pass123")
	apiDo(t, srv, http.MethodPut, "/api/preferences", map[string]any{
		"theme": "light", "size": "large",
	}, userCookies).Body.Close()

	// Verify prefs exist
	prefs := app.store.GetPreferences(userID)
	if prefs.Theme != "light" {
		t.Fatalf("expected theme 'light', got '%s'", prefs.Theme)
	}

	// Delete user
	apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/users/%d", userID), nil, cookies).Body.Close()

	// Verify preferences are cleaned up
	prefsAfter := app.store.GetPreferences(userID)
	// Should return defaults (not the user's saved prefs)
	if prefsAfter.Theme == "light" && prefsAfter.Size == "large" {
		t.Error("expected preferences to be cascaded on user delete")
	}
}

func TestIntegrity_LayerDelete_MovesEventsToMaster(t *testing.T) {
	app, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create a layer
	resp := apiDo(t, srv, http.MethodPost, "/api/layers", map[string]any{
		"name": "TestLayer", "color": "#FF0000",
	}, cookies)
	var layer map[string]any
	decodeJSON(t, resp, &layer)
	layerID := int64(layer["id"].(float64))

	// Create an event on that layer
	now := time.Now()
	end := now.Add(time.Hour)
	resp2 := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title":      "Layer Event",
		"event_type": "event",
		"start_time": now.Format(time.RFC3339),
		"end_time":   end.Format(time.RFC3339),
		"layer_id":   layerID,
	}, cookies)
	var ev map[string]any
	decodeJSON(t, resp2, &ev)
	eventID := int64(ev["id"].(float64))

	// Delete the layer
	resp3 := apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/layers/%d", layerID), nil, cookies)
	defer resp3.Body.Close()
	if !isSuccess(resp3.StatusCode) {
		t.Fatalf("delete layer: got %d", resp3.StatusCode)
	}

	// Verify the event still exists but has no layer (moved to master)
	events := app.store.GetEvents(now.Add(-time.Hour), end.Add(time.Hour), nil)
	found := false
	for _, e := range events {
		if e.ID == eventID {
			found = true
			if e.LayerID != nil {
				t.Error("expected event to be moved to master timeline (nil layer)")
			}
		}
	}
	if !found {
		t.Error("expected event to still exist after layer deletion")
	}
}

func TestIntegrity_EventCreate_ValidatesResponsible(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now()
	end := now.Add(time.Hour)
	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title":          "Bad Responsible",
		"event_type":     "event",
		"start_time":     now.Format(time.RFC3339),
		"end_time":       end.Format(time.RFC3339),
		"responsible_id": 99999, // non-existent user
	}, cookies)
	defer resp.Body.Close()
	if resp.StatusCode == 200 || resp.StatusCode == 201 {
		t.Error("expected error for non-existent responsible_id, got success")
	}
}

func TestIntegrity_EventCreate_ValidatesLayer(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	now := time.Now()
	end := now.Add(time.Hour)
	nonExistentLayer := int64(99999)
	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title":      "Bad Layer",
		"event_type": "event",
		"start_time": now.Format(time.RFC3339),
		"end_time":   end.Format(time.RFC3339),
		"layer_id":   nonExistentLayer,
	}, cookies)
	defer resp.Body.Close()
	if resp.StatusCode == 200 || resp.StatusCode == 201 {
		t.Error("expected error for non-existent layer_id, got success")
	}
}

// ── Version endpoint includes new build fields ──────────────────────────────

func TestAPI_Version_IncludesBuildInfo(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/version", nil, cookies)
	var body map[string]any
	decodeJSON(t, resp, &body)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	// Check new fields exist
	for _, field := range []string{"version", "commit", "build_time", "go_version"} {
		if _, ok := body[field]; !ok {
			t.Errorf("version response missing field: %s", field)
		}
	}
}

// ── Store FlushAll ──────────────────────────────────────────────────────────

func TestStore_FlushAll(t *testing.T) {
	app, _ := newTestApp(t)

	// FlushAll should not error on a clean store
	if err := app.store.FlushAll(); err != nil {
		t.Errorf("FlushAll failed: %v", err)
	}
}

// ── SSE BroadcastToUsers ────────────────────────────────────────────────────

func TestSSE_BroadcastToUsers(t *testing.T) {
	broker := NewSSEBroker()

	c1 := broker.Subscribe(1)
	c2 := broker.Subscribe(2)
	c3 := broker.Subscribe(3)

	msg := SSEMessage{Event: "test", Data: "hello"}
	broker.BroadcastToUsers([]int64{1, 3}, 0, msg)

	// c1 and c3 should have received message
	select {
	case got := <-c1.broadcast:
		if got.Event != "test" {
			t.Errorf("c1: expected event 'test', got '%s'", got.Event)
		}
	default:
		t.Error("c1 should have received message")
	}

	select {
	case <-c2.broadcast:
		t.Error("c2 should NOT have received message")
	default:
		// expected
	}

	select {
	case got := <-c3.broadcast:
		if got.Data != "hello" {
			t.Errorf("c3: expected data 'hello', got '%s'", got.Data)
		}
	default:
		t.Error("c3 should have received message")
	}

	broker.Unsubscribe(c1)
	broker.Unsubscribe(c2)
	broker.Unsubscribe(c3)
}

func TestSSE_BroadcastToUsers_ExcludesSender(t *testing.T) {
	broker := NewSSEBroker()

	c1 := broker.Subscribe(1)
	c2 := broker.Subscribe(2)

	msg := SSEMessage{Event: "test", Data: "data"}
	// Send to users 1 and 2, but sender is user 1
	broker.BroadcastToUsers([]int64{1, 2}, 1, msg)

	// c1 should NOT receive (sender)
	select {
	case <-c1.broadcast:
		t.Error("sender should be excluded")
	default:
	}

	// c2 should receive
	select {
	case <-c2.broadcast:
		// ok
	default:
		t.Error("c2 should have received message")
	}

	broker.Unsubscribe(c1)
	broker.Unsubscribe(c2)
}

// ── Preferences persistence ─────────────────────────────────────────────────

func TestAPI_Preferences_A11y(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Set accessibility preferences
	resp := apiDo(t, srv, http.MethodPut, "/api/preferences", map[string]any{
		"a11y_focus_indicators":  true,
		"a11y_reduced_motion":    true,
		"a11y_screen_reader":     true,
		"a11y_large_click_targets": true,
		"a11y_font_scaling":      "150",
		"a11y_skip_links":        true,
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("set a11y prefs: got %d", resp.StatusCode)
	}

	// Read back
	resp2 := apiDo(t, srv, http.MethodGet, "/api/preferences", nil, cookies)
	var prefs map[string]any
	decodeJSON(t, resp2, &prefs)
	if prefs["a11y_focus_indicators"] != true {
		t.Error("expected a11y_focus_indicators to be true")
	}
	if prefs["a11y_font_scaling"] != "150" {
		t.Errorf("expected a11y_font_scaling '150', got %v", prefs["a11y_font_scaling"])
	}
	if prefs["a11y_skip_links"] != true {
		t.Error("expected a11y_skip_links to be true")
	}
}

// ── Request context propagation ─────────────────────────────────────────────

func TestMiddleware_RequestID_Present(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/version", nil, nil)
	defer resp.Body.Close()
	reqID := resp.Header.Get("X-Request-ID")
	if reqID == "" {
		t.Error("expected X-Request-ID header in response")
	}
	if len(reqID) != 16 { // 8 bytes hex encoded = 16 chars
		t.Errorf("expected 16-char request ID, got %d chars: %s", len(reqID), reqID)
	}
}

func TestMiddleware_CSRF_Required(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// POST without CSRF headers should be rejected
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/events", nil)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	// Intentionally NOT setting X-Requested-With or X-CSRF-Token
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for missing CSRF, got %d", resp.StatusCode)
	}
}
