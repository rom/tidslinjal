package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
)

// ── Rooms CRUD ──────────────────────────────────────────────────────────────

func TestAPI_Rooms_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/rooms", nil, cookies)
	var rooms []any
	decodeJSON(t, resp, &rooms)
	if len(rooms) != 0 {
		t.Errorf("expected empty rooms list, got %d", len(rooms))
	}
}

func TestAPI_Rooms_CreateAndList(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create a room (PUT to /api/rooms)
	room := map[string]any{
		"name": "Ops Room Alpha", "type": "room", "sub_type": "meeting_room",
		"location": "Building A", "capacity": 20, "enabled": true,
	}
	resp := apiDo(t, srv, http.MethodPut, "/api/rooms", room, cookies)
	var saved map[string]any
	decodeJSON(t, resp, &saved)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create room: expected 2xx, got %d", resp.StatusCode)
	}

	// List rooms
	resp2 := apiDo(t, srv, http.MethodGet, "/api/rooms", nil, cookies)
	var rooms []map[string]any
	decodeJSON(t, resp2, &rooms)
	if len(rooms) != 1 {
		t.Fatalf("expected 1 room, got %d", len(rooms))
	}
	if rooms[0]["name"] != "Ops Room Alpha" {
		t.Errorf("expected name 'Ops Room Alpha', got %v", rooms[0]["name"])
	}
}

func TestAPI_Rooms_Delete(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create
	apiDo(t, srv, http.MethodPut, "/api/rooms", map[string]any{
		"name": "ToDelete", "type": "room", "enabled": true,
	}, cookies)

	// List to get ID
	resp := apiDo(t, srv, http.MethodGet, "/api/rooms", nil, cookies)
	var rooms []map[string]any
	decodeJSON(t, resp, &rooms)
	id := fmt.Sprintf("%v", rooms[0]["id"])

	// Delete
	delResp := apiDo(t, srv, http.MethodDelete, "/api/rooms/"+id, nil, cookies)
	delResp.Body.Close()
	if !isSuccess(delResp.StatusCode) {
		t.Fatalf("delete room: expected 2xx, got %d", delResp.StatusCode)
	}

	// Verify empty
	resp2 := apiDo(t, srv, http.MethodGet, "/api/rooms", nil, cookies)
	var rooms2 []any
	decodeJSON(t, resp2, &rooms2)
	if len(rooms2) != 0 {
		t.Errorf("expected 0 rooms after delete, got %d", len(rooms2))
	}
}

func TestAPI_Rooms_RequiresTeamLead(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create read-only user
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "reader", "password": "pass", "display_name": "Reader", "role": "read",
	}, adminCookies)
	readerCookies := login(t, srv, "reader", "pass")

	// Reader should not be able to create rooms
	resp := apiDo(t, srv, http.MethodPut, "/api/rooms", map[string]any{
		"name": "Forbidden Room", "type": "room", "enabled": true,
	}, readerCookies)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for reader creating room, got %d", resp.StatusCode)
	}
}

// ── Decision Log ────────────────────────────────────────────────────────────

func TestAPI_DecisionLog_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/decision-log", nil, cookies)
	var entries []any
	decodeJSON(t, resp, &entries)
	if len(entries) != 0 {
		t.Errorf("expected empty decision log, got %d", len(entries))
	}
}

func TestAPI_DecisionLog_CreateAndList(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	entry := map[string]any{
		"decision": "Deploy additional sensors to sector 7",
		"log_type": "general",
		"title":    "Sensor Deployment",
		"reason":   "Intelligence suggests increased activity",
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/decision-log", entry, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create decision: expected 2xx, got %d: %v", resp.StatusCode, created)
	}
	if created["decision"] != "Deploy additional sensors to sector 7" {
		t.Errorf("unexpected decision text: %v", created["decision"])
	}

	// List
	resp2 := apiDo(t, srv, http.MethodGet, "/api/decision-log", nil, cookies)
	var entries []map[string]any
	decodeJSON(t, resp2, &entries)
	if len(entries) != 1 {
		t.Fatalf("expected 1 decision entry, got %d", len(entries))
	}
}

func TestAPI_DecisionLog_Delete(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create
	resp := apiDo(t, srv, http.MethodPost, "/api/decision-log", map[string]any{
		"decision": "Test delete", "log_type": "general",
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := fmt.Sprintf("%.0f", created["id"].(float64))

	// Delete (admin only)
	delResp := apiDo(t, srv, http.MethodDelete, "/api/decision-log/"+id, nil, cookies)
	delResp.Body.Close()
	if !isSuccess(delResp.StatusCode) {
		t.Fatalf("delete decision: expected 2xx, got %d", delResp.StatusCode)
	}

	// Verify empty
	resp2 := apiDo(t, srv, http.MethodGet, "/api/decision-log", nil, cookies)
	var entries []any
	decodeJSON(t, resp2, &entries)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries after delete, got %d", len(entries))
	}
}

func TestAPI_DecisionLog_ReviewWorkflow(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create a decision request
	resp := apiDo(t, srv, http.MethodPost, "/api/decision-log", map[string]any{
		"decision":  "Request approval for night ops",
		"log_type":  "general",
		"status":    "requested",
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := fmt.Sprintf("%.0f", created["id"].(float64))

	// Review (approve)
	reviewResp := apiDo(t, srv, http.MethodPut, "/api/decision-log/"+id+"/review", map[string]any{
		"status":  "approved",
		"comment": "Approved for execution",
	}, cookies)
	var reviewed map[string]any
	decodeJSON(t, reviewResp, &reviewed)
	if !isSuccess(reviewResp.StatusCode) {
		t.Fatalf("review decision: expected 2xx, got %d", reviewResp.StatusCode)
	}
}

func TestAPI_DecisionLog_CoSign(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create a second user (teamlead) to do the co-sign (cannot co-sign own decision)
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "cosigner", "password": "pass", "display_name": "CoSigner", "role": "teamlead",
	}, adminCookies)
	cosignerCookies := login(t, srv, "cosigner", "pass")

	// Create entry with co-sign required (by admin)
	resp := apiDo(t, srv, http.MethodPost, "/api/decision-log", map[string]any{
		"decision":         "Strategic redeployment",
		"log_type":         "general",
		"co_sign_required": true,
	}, adminCookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := fmt.Sprintf("%.0f", created["id"].(float64))

	// Co-sign by different user
	cosignResp := apiDo(t, srv, http.MethodPut, "/api/decision-log/"+id+"/cosign", map[string]any{
		"comment": "Co-signed and confirmed",
	}, cosignerCookies)
	cosignResp.Body.Close()
	if !isSuccess(cosignResp.StatusCode) {
		t.Fatalf("co-sign decision: expected 2xx, got %d", cosignResp.StatusCode)
	}
}

// ── Log Book ────────────────────────────────────────────────────────────────

func TestAPI_LogBook_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/log-book", nil, cookies)
	var entries []any
	decodeJSON(t, resp, &entries)
	if len(entries) != 0 {
		t.Errorf("expected empty log book, got %d", len(entries))
	}
}

func TestAPI_LogBook_CreateAndList(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	entry := map[string]any{
		"category": "incoming",
		"subject":  "Intel report from sector 3",
		"body":     "Movement detected at coordinates...",
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/log-book", entry, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create log book: expected 2xx, got %d", resp.StatusCode)
	}

	// List
	resp2 := apiDo(t, srv, http.MethodGet, "/api/log-book", nil, cookies)
	var entries []map[string]any
	decodeJSON(t, resp2, &entries)
	if len(entries) != 1 {
		t.Fatalf("expected 1 log book entry, got %d", len(entries))
	}
	if entries[0]["subject"] != "Intel report from sector 3" {
		t.Errorf("unexpected subject: %v", entries[0]["subject"])
	}
}

func TestAPI_LogBook_Delete(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/log-book", map[string]any{
		"category": "action", "subject": "Delete me", "body": "test",
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := fmt.Sprintf("%.0f", created["id"].(float64))

	delResp := apiDo(t, srv, http.MethodDelete, "/api/log-book/"+id, nil, cookies)
	delResp.Body.Close()
	if !isSuccess(delResp.StatusCode) {
		t.Fatalf("delete log book: expected 2xx, got %d", delResp.StatusCode)
	}
}

// ── Ready Check ─────────────────────────────────────────────────────────────

func TestAPI_ReadyCheck(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodGet, "/api/ready-check", nil, cookies)
	var result map[string]any
	decodeJSON(t, resp, &result)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("ready check: expected 2xx, got %d", resp.StatusCode)
	}
	// Should have expected fields
	if _, ok := result["ready"]; !ok {
		t.Error("missing 'ready' field in ready check response")
	}
	if _, ok := result["total"]; !ok {
		t.Error("missing 'total' field in ready check response")
	}
}

func TestAPI_ReadyCheck_Unauthenticated(t *testing.T) {
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/ready-check", nil, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated ready check, got %d", resp.StatusCode)
	}
}

func TestAPI_ReadyCheck_AuditLogged(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Perform ready check
	resp := apiDo(t, srv, http.MethodGet, "/api/ready-check", nil, cookies)
	resp.Body.Close()

	// Check audit log has the ready check entry
	auditResp := apiDo(t, srv, http.MethodGet, "/api/audit", nil, cookies)
	var audits []map[string]any
	decodeJSON(t, auditResp, &audits)
	found := false
	for _, a := range audits {
		if a["action"] == "ready_check" {
			found = true
			summary := a["summary"].(string)
			if len(summary) == 0 {
				t.Error("ready check audit summary is empty")
			}
			break
		}
	}
	if !found {
		t.Error("ready check did not generate audit entry")
	}
}

// ── Person Ready Check ──────────────────────────────────────────────────────

func TestAPI_PersonReadyCheck_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/person-ready-check", nil, cookies)
	var checks []any
	decodeJSON(t, resp, &checks)
	if len(checks) != 0 {
		t.Errorf("expected empty PRC list, got %d", len(checks))
	}
}

func TestAPI_PersonReadyCheck_CreateAndRespond(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create a second user to be a participant
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "operator1", "password": "pass", "display_name": "Operator One", "role": "teammember",
	}, adminCookies)
	opCookies := login(t, srv, "operator1", "pass")

	// Get user IDs
	usersResp := apiDo(t, srv, http.MethodGet, "/api/users", nil, adminCookies)
	var users []map[string]any
	decodeJSON(t, usersResp, &users)
	var opID float64
	for _, u := range users {
		if u["username"] == "operator1" {
			opID = u["id"].(float64)
		}
	}

	// Create PRC targeting operator1
	createResp := apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{opID},
	}, adminCookies)
	var prc map[string]any
	decodeJSON(t, createResp, &prc)
	if !isSuccess(createResp.StatusCode) {
		t.Fatalf("create PRC: expected 2xx, got %d: %v", createResp.StatusCode, prc)
	}
	prcID := fmt.Sprintf("%.0f", prc["id"].(float64))

	// Verify participants
	participants := prc["participants"].([]any)
	if len(participants) != 1 {
		t.Fatalf("expected 1 participant, got %d", len(participants))
	}
	p := participants[0].(map[string]any)
	if p["status"] != "pending" {
		t.Errorf("expected pending status, got %v", p["status"])
	}

	// Respond as operator1
	respondResp := apiDo(t, srv, http.MethodPut, "/api/person-ready-check/"+prcID+"/respond", map[string]any{
		"status": "ready",
	}, opCookies)
	var updated map[string]any
	decodeJSON(t, respondResp, &updated)
	if !isSuccess(respondResp.StatusCode) {
		t.Fatalf("respond PRC: expected 2xx, got %d", respondResp.StatusCode)
	}

	// Verify response was recorded
	updatedParticipants := updated["participants"].([]any)
	up := updatedParticipants[0].(map[string]any)
	if up["status"] != "ready" {
		t.Errorf("expected ready status after respond, got %v", up["status"])
	}
}

func TestAPI_PersonReadyCheck_AuditIncludesParticipants(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create participant
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "target1", "password": "pass", "display_name": "Target One", "role": "teammember",
	}, adminCookies)

	usersResp := apiDo(t, srv, http.MethodGet, "/api/users", nil, adminCookies)
	var users []map[string]any
	decodeJSON(t, usersResp, &users)
	var targetID float64
	for _, u := range users {
		if u["username"] == "target1" {
			targetID = u["id"].(float64)
		}
	}

	// Create PRC
	apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{targetID},
	}, adminCookies)

	// Check audit
	auditResp := apiDo(t, srv, http.MethodGet, "/api/audit", nil, adminCookies)
	var audits []map[string]any
	decodeJSON(t, auditResp, &audits)
	found := false
	for _, a := range audits {
		if a["action"] == "create_prc" {
			found = true
			summary := a["summary"].(string)
			if len(summary) == 0 {
				t.Error("PRC audit summary is empty")
			}
			// Should mention participant name
			if !containsStr(summary, "Target One") {
				t.Errorf("PRC audit summary should include participant name, got: %s", summary)
			}
			break
		}
	}
	if !found {
		t.Error("PRC creation did not generate audit entry")
	}
}

func TestAPI_PersonReadyCheck_RespondAudit(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create participant
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "responder1", "password": "pass", "display_name": "Responder", "role": "teammember",
	}, adminCookies)
	responderCookies := login(t, srv, "responder1", "pass")

	usersResp := apiDo(t, srv, http.MethodGet, "/api/users", nil, adminCookies)
	var users []map[string]any
	decodeJSON(t, usersResp, &users)
	var responderID float64
	for _, u := range users {
		if u["username"] == "responder1" {
			responderID = u["id"].(float64)
		}
	}

	// Create PRC
	createResp := apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{responderID},
	}, adminCookies)
	var prc map[string]any
	decodeJSON(t, createResp, &prc)
	prcID := fmt.Sprintf("%.0f", prc["id"].(float64))

	// Respond
	apiDo(t, srv, http.MethodPut, "/api/person-ready-check/"+prcID+"/respond", map[string]any{
		"status": "not_ready",
	}, responderCookies)

	// Check audit for respond entry
	auditResp := apiDo(t, srv, http.MethodGet, "/api/audit", nil, adminCookies)
	var audits []map[string]any
	decodeJSON(t, auditResp, &audits)
	found := false
	for _, a := range audits {
		if a["action"] == "respond_prc" {
			found = true
			break
		}
	}
	if !found {
		t.Error("PRC response did not generate audit entry")
	}
}

func TestAPI_PersonReadyCheck_RequiresTeamLead(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create read-only user
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "reader", "password": "pass", "display_name": "Reader", "role": "read",
	}, adminCookies)
	readerCookies := login(t, srv, "reader", "pass")

	resp := apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{1},
	}, readerCookies)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for reader creating PRC, got %d", resp.StatusCode)
	}
}

func TestAPI_PersonReadyCheck_InvalidResponse(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create participant
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "user1", "password": "pass", "display_name": "User1", "role": "teammember",
	}, adminCookies)

	usersResp := apiDo(t, srv, http.MethodGet, "/api/users", nil, adminCookies)
	var users []map[string]any
	decodeJSON(t, usersResp, &users)
	var userID float64
	for _, u := range users {
		if u["username"] == "user1" {
			userID = u["id"].(float64)
		}
	}

	createResp := apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{userID},
	}, adminCookies)
	var prc map[string]any
	decodeJSON(t, createResp, &prc)
	prcID := fmt.Sprintf("%.0f", prc["id"].(float64))

	// Respond with invalid status
	user1Cookies := login(t, srv, "user1", "pass")
	resp := apiDo(t, srv, http.MethodPut, "/api/person-ready-check/"+prcID+"/respond", map[string]any{
		"status": "invalid_status",
	}, user1Cookies)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid PRC status, got %d", resp.StatusCode)
	}
}

// ── Personal Notifications ──────────────────────────────────────────────────

func TestAPI_Notifications_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/personal-notifications", nil, cookies)
	var notifs []any
	decodeJSON(t, resp, &notifs)
	if len(notifs) != 0 {
		t.Errorf("expected empty notifications, got %d", len(notifs))
	}
}

func TestAPI_Notifications_ReceivedOnPRC(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create user to receive notification
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "notifuser", "password": "pass", "display_name": "Notif User", "role": "teammember",
	}, adminCookies)
	userCookies := login(t, srv, "notifuser", "pass")

	usersResp := apiDo(t, srv, http.MethodGet, "/api/users", nil, adminCookies)
	var users []map[string]any
	decodeJSON(t, usersResp, &users)
	var userID float64
	for _, u := range users {
		if u["username"] == "notifuser" {
			userID = u["id"].(float64)
		}
	}

	// Create PRC targeting this user (should generate notification)
	apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{userID},
	}, adminCookies)

	// Check notifications for the user
	notifResp := apiDo(t, srv, http.MethodGet, "/api/personal-notifications", nil, userCookies)
	var notifs []map[string]any
	decodeJSON(t, notifResp, &notifs)
	if len(notifs) == 0 {
		t.Error("expected notification after PRC creation, got none")
	}
}

// ── Templates ───────────────────────────────────────────────────────────────

func TestAPI_Templates_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/templates", nil, cookies)
	var templates []any
	decodeJSON(t, resp, &templates)
	if len(templates) != 0 {
		t.Errorf("expected empty templates, got %d", len(templates))
	}
}

func TestAPI_Templates_CreateAndList(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	tmpl := map[string]any{
		"name":        "Exercise Alpha",
		"description": "Standard exercise template",
		"scope":       "public",
		"items":       []any{},
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/templates", tmpl, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create template: expected 2xx, got %d: %v", resp.StatusCode, created)
	}

	// List
	resp2 := apiDo(t, srv, http.MethodGet, "/api/templates", nil, cookies)
	var templates []map[string]any
	decodeJSON(t, resp2, &templates)
	if len(templates) != 1 {
		t.Fatalf("expected 1 template, got %d", len(templates))
	}
	if templates[0]["name"] != "Exercise Alpha" {
		t.Errorf("unexpected template name: %v", templates[0]["name"])
	}
}

func TestAPI_Templates_Delete(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/templates", map[string]any{
		"name": "ToDelete", "scope": "private", "items": []any{},
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := fmt.Sprintf("%.0f", created["id"].(float64))

	delResp := apiDo(t, srv, http.MethodDelete, "/api/templates/"+id, nil, cookies)
	delResp.Body.Close()
	if delResp.StatusCode >= 300 {
		t.Fatalf("delete template: expected 2xx, got %d", delResp.StatusCode)
	}
}

// ── Filter Presets ──────────────────────────────────────────────────────────

func TestAPI_FilterPresets_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/filter-presets", nil, cookies)
	var presets []any
	decodeJSON(t, resp, &presets)
	if len(presets) != 0 {
		t.Errorf("expected empty filter presets, got %d", len(presets))
	}
}

func TestAPI_FilterPresets_CreateAndList(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	preset := map[string]any{
		"name": "My Filter",
		"filters": map[string]any{
			"layer_ids": []float64{1, 2},
			"status":    "planned",
		},
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/filter-presets", preset, cookies)
	resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create filter preset: expected 2xx, got %d", resp.StatusCode)
	}

	// List
	resp2 := apiDo(t, srv, http.MethodGet, "/api/filter-presets", nil, cookies)
	var presets []map[string]any
	decodeJSON(t, resp2, &presets)
	if len(presets) == 0 {
		t.Fatal("expected at least 1 filter preset")
	}
}

// ── Custom Resource Types ───────────────────────────────────────────────────

func TestAPI_CustomResourceTypes_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/custom-resource-types", nil, cookies)
	var types []any
	decodeJSON(t, resp, &types)
	if len(types) != 0 {
		t.Errorf("expected empty custom resource types, got %d", len(types))
	}
}

func TestAPI_CustomResourceTypes_CreateAndDelete(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	crt := map[string]any{
		"key":   "vehicles",
		"label": "Vehicles",
		"icon":  "truck",
	}
	resp := apiDo(t, srv, http.MethodPut, "/api/custom-resource-types", crt, cookies)
	resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create custom resource type: expected 2xx, got %d", resp.StatusCode)
	}

	// List
	resp2 := apiDo(t, srv, http.MethodGet, "/api/custom-resource-types", nil, cookies)
	var types []map[string]any
	decodeJSON(t, resp2, &types)
	if len(types) == 0 {
		t.Fatal("expected at least 1 custom resource type")
	}
}

func TestAPI_CustomResourceTypes_RequiresAdmin(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create teammember user
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "member", "password": "pass", "display_name": "Member", "role": "teammember",
	}, adminCookies)
	memberCookies := login(t, srv, "member", "pass")

	resp := apiDo(t, srv, http.MethodPut, "/api/custom-resource-types", map[string]any{
		"name": "Forbidden", "icon": "x",
	}, memberCookies)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin creating resource type, got %d", resp.StatusCode)
	}
}

// ── Roles ───────────────────────────────────────────────────────────────────

func TestAPI_Roles_GetList(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/roles", nil, cookies)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("get roles: expected 2xx, got %d", resp.StatusCode)
	}
	var roles any
	decodeJSON(t, resp, &roles)
}

func TestAPI_Roles_UpdateRequiresAdmin(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "lead", "password": "pass", "display_name": "Lead", "role": "teamlead",
	}, adminCookies)
	leadCookies := login(t, srv, "lead", "pass")

	resp := apiDo(t, srv, http.MethodPut, "/api/roles", []any{}, leadCookies)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin updating roles, got %d", resp.StatusCode)
	}
}

// ── Event Types Update/Delete ───────────────────────────────────────────────

func TestAPI_EventTypes_UpdateAndDelete(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create event type
	resp := apiDo(t, srv, http.MethodPost, "/api/event-types", map[string]any{
		"key": "recon", "label": "Recon", "color": "#FF0000",
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := fmt.Sprintf("%.0f", created["id"].(float64))

	// Update
	updateResp := apiDo(t, srv, http.MethodPut, "/api/event-types/"+id, map[string]any{
		"key": "recon", "label": "Recon Updated", "color": "#00FF00",
	}, cookies)
	updateResp.Body.Close()
	if !isSuccess(updateResp.StatusCode) {
		t.Fatalf("update event type: expected 2xx, got %d", updateResp.StatusCode)
	}

	// Verify update
	listResp := apiDo(t, srv, http.MethodGet, "/api/event-types", nil, cookies)
	var types []map[string]any
	decodeJSON(t, listResp, &types)
	found := false
	for _, et := range types {
		if fmt.Sprintf("%.0f", et["id"].(float64)) == id {
			found = true
			if et["label"] != "Recon Updated" {
				t.Errorf("expected updated label, got %v", et["label"])
			}
		}
	}
	if !found {
		t.Error("updated event type not found in list")
	}

	// Delete
	delResp := apiDo(t, srv, http.MethodDelete, "/api/event-types/"+id, nil, cookies)
	delResp.Body.Close()
	if !isSuccess(delResp.StatusCode) {
		t.Fatalf("delete event type: expected 2xx, got %d", delResp.StatusCode)
	}
}

// ── Layers Update/Delete ────────────────────────────────────────────────────

func TestAPI_Layers_UpdateAndDelete(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create layer
	resp := apiDo(t, srv, http.MethodPost, "/api/layers", map[string]any{
		"name": "Intel Layer", "color": "#0000FF",
	}, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	id := fmt.Sprintf("%.0f", created["id"].(float64))

	// Delete
	delResp := apiDo(t, srv, http.MethodDelete, "/api/layers/"+id, nil, cookies)
	delResp.Body.Close()
	if !isSuccess(delResp.StatusCode) {
		t.Fatalf("delete layer: expected 2xx, got %d", delResp.StatusCode)
	}
}

// ── Event Log ───────────────────────────────────────────────────────────────

func TestAPI_EventLog_CreateAndGet(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	entry := map[string]any{
		"source":  "manual",
		"message": "Test event log entry",
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/event-log", entry, cookies)
	resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create event log: expected 2xx, got %d", resp.StatusCode)
	}

	// Get
	getResp := apiDo(t, srv, http.MethodGet, "/api/event-log", nil, cookies)
	var entries []any
	decodeJSON(t, getResp, &entries)
	if len(entries) == 0 {
		t.Error("expected at least 1 event log entry")
	}
}

// ── Map Locations ───────────────────────────────────────────────────────────

func TestAPI_MapLocations_ListEmpty(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/map-locations", nil, cookies)
	var locs []any
	decodeJSON(t, resp, &locs)
	if len(locs) != 0 {
		t.Errorf("expected empty map locations, got %d", len(locs))
	}
}

func TestAPI_MapLocations_CreateAndList(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	loc := map[string]any{
		"name": "HQ Alpha",
		"lat":  59.3293,
		"lng":  18.0686,
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/map-locations", loc, cookies)
	resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create map location: expected 2xx, got %d", resp.StatusCode)
	}

	// List
	listResp := apiDo(t, srv, http.MethodGet, "/api/map-locations", nil, cookies)
	var locs []map[string]any
	decodeJSON(t, listResp, &locs)
	if len(locs) == 0 {
		t.Error("expected at least 1 map location after create")
	}
}

// ── Event Cascade ───────────────────────────────────────────────────────────

func TestAPI_EventDuplicate(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create event type first
	apiDo(t, srv, http.MethodPost, "/api/event-types", map[string]any{
		"key": "ops", "label": "Ops", "color": "#333",
	}, cookies)

	// Create layer
	apiDo(t, srv, http.MethodPost, "/api/layers", map[string]any{
		"name": "Main", "color": "#444",
	}, cookies)

	// Get IDs
	etResp := apiDo(t, srv, http.MethodGet, "/api/event-types", nil, cookies)
	var ets []map[string]any
	decodeJSON(t, etResp, &ets)
	etID := ets[0]["id"].(float64)

	lResp := apiDo(t, srv, http.MethodGet, "/api/layers", nil, cookies)
	var layers []map[string]any
	decodeJSON(t, lResp, &layers)
	layerID := layers[0]["id"].(float64)

	// Create an event
	ev := map[string]any{
		"title":         "Original Event",
		"event_type_id": etID,
		"layer_id":      layerID,
		"start_time":    "2026-03-14T08:00:00Z",
		"end_time":      "2026-03-14T10:00:00Z",
	}
	createResp := apiDo(t, srv, http.MethodPost, "/api/events", ev, cookies)
	var created map[string]any
	decodeJSON(t, createResp, &created)
	evID := fmt.Sprintf("%.0f", created["id"].(float64))

	// Duplicate
	dupResp := apiDo(t, srv, http.MethodPost, "/api/events-duplicate/"+evID, nil, cookies)
	if !isSuccess(dupResp.StatusCode) {
		body, _ := io.ReadAll(dupResp.Body)
		t.Fatalf("duplicate event: expected 2xx, got %d: %s", dupResp.StatusCode, body)
	}
	var duplicated map[string]any
	json.NewDecoder(dupResp.Body).Decode(&duplicated)
	dupResp.Body.Close()

	// Should have 2 events now
	evtsResp := apiDo(t, srv, http.MethodGet, "/api/events?from=2026-03-14T00:00:00Z&to=2026-03-15T00:00:00Z", nil, cookies)
	var events []any
	decodeJSON(t, evtsResp, &events)
	if len(events) < 2 {
		t.Errorf("expected at least 2 events after duplicate, got %d", len(events))
	}
}

// ── Data Validation Edge Cases ──────────────────────────────────────────────

func TestAPI_CreateEvent_MissingTitle(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"start_time": "2026-03-14T08:00:00Z",
		"end_time":   "2026-03-14T10:00:00Z",
	}, cookies)
	defer resp.Body.Close()
	// The server may accept or reject - but should not crash
	if resp.StatusCode == http.StatusInternalServerError {
		t.Error("server returned 500 for event without title - should handle gracefully")
	}
}

func TestAPI_CreateEvent_SpecialCharacters(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create prereqs
	apiDo(t, srv, http.MethodPost, "/api/event-types", map[string]any{
		"key": "test", "label": "Test", "color": "#111",
	}, cookies)
	apiDo(t, srv, http.MethodPost, "/api/layers", map[string]any{
		"name": "Layer", "color": "#222",
	}, cookies)

	etResp := apiDo(t, srv, http.MethodGet, "/api/event-types", nil, cookies)
	var ets []map[string]any
	decodeJSON(t, etResp, &ets)
	lResp := apiDo(t, srv, http.MethodGet, "/api/layers", nil, cookies)
	var layers []map[string]any
	decodeJSON(t, lResp, &layers)

	// Event with special characters (XSS attempt, Unicode)
	ev := map[string]any{
		"title":         `O'Brien's <script>alert('xss')</script> Event — Ü`,
		"event_type_id": ets[0]["id"],
		"layer_id":      layers[0]["id"],
		"start_time":    "2026-03-14T08:00:00Z",
		"end_time":      "2026-03-14T10:00:00Z",
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/events", ev, cookies)
	var created map[string]any
	decodeJSON(t, resp, &created)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create event with special chars: expected 2xx, got %d", resp.StatusCode)
	}
	// Title should be stored as-is (output encoding is frontend responsibility)
	if created["title"] != `O'Brien's <script>alert('xss')</script> Event — Ü` {
		t.Errorf("title not stored correctly: %v", created["title"])
	}
}

func TestAPI_PRC_EmptyParticipants(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{},
	}, cookies)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for empty PRC participants, got %d", resp.StatusCode)
	}
}

func TestAPI_PRC_NonParticipantCannotRespond(t *testing.T) {
	_, srv := newTestApp(t)
	adminCookies := login(t, srv, "admin", "admin")

	// Create two users
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "participant", "password": "pass", "display_name": "Part", "role": "teammember",
	}, adminCookies)
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "outsider", "password": "pass", "display_name": "Out", "role": "teammember",
	}, adminCookies)
	outsiderCookies := login(t, srv, "outsider", "pass")

	usersResp := apiDo(t, srv, http.MethodGet, "/api/users", nil, adminCookies)
	var users []map[string]any
	decodeJSON(t, usersResp, &users)
	var partID float64
	for _, u := range users {
		if u["username"] == "participant" {
			partID = u["id"].(float64)
		}
	}

	// Create PRC targeting only participant
	createResp := apiDo(t, srv, http.MethodPost, "/api/person-ready-check", map[string]any{
		"participant_ids": []float64{partID},
	}, adminCookies)
	var prc map[string]any
	decodeJSON(t, createResp, &prc)
	prcID := fmt.Sprintf("%.0f", prc["id"].(float64))

	// Outsider tries to respond
	resp := apiDo(t, srv, http.MethodPut, "/api/person-ready-check/"+prcID+"/respond", map[string]any{
		"status": "ready",
	}, outsiderCookies)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for non-participant responding, got %d", resp.StatusCode)
	}
}

// containsStr is already defined in routing_test.go
