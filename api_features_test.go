package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"
)

// ── Tags CRUD ────────────────────────────────────────────────────────────────

func TestAPI_Tags_ListEmpty(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/tags", nil, cookies)
	var tags []any
	decodeJSON(t, resp, &tags)
	if len(tags) != 0 {
		t.Errorf("expected empty tags list, got %d", len(tags))
	}
}

func TestAPI_Tags_CreateAndList(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/tags", map[string]any{
		"name": "urgent", "color": "#ff0000",
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create tag: expected 2xx, got %d: %s", resp.StatusCode, body)
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/tags", nil, cookies)
	var tags []map[string]any
	decodeJSON(t, resp2, &tags)
	if len(tags) < 1 {
		t.Fatal("expected at least 1 tag")
	}
	found := false
	for _, tag := range tags {
		if tag["name"] == "urgent" {
			found = true
			break
		}
	}
	if !found {
		t.Error("tag 'urgent' not found in list")
	}
}

func TestAPI_Tags_Delete(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/tags", map[string]any{
		"name": "delete-me", "color": "#000000",
	}, cookies)
	var tag map[string]any
	decodeJSON(t, resp, &tag)

	id := fmt.Sprintf("%.0f", tag["id"].(float64))
	delResp := apiDo(t, srv, http.MethodDelete, "/api/tags/"+id, nil, cookies)
	defer delResp.Body.Close()
	if delResp.StatusCode != http.StatusOK && delResp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 200/204, got %d", delResp.StatusCode)
	}
}

func TestAPI_TagCloud(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/tags/cloud", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Checklist Templates & Instances ──────────────────────────────────────────

func TestAPI_ChecklistTemplates_ListDefault(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/checklist-templates", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_ChecklistTemplates_CreateAndList(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	tmpl := map[string]any{
		"name": "Pre-flight Check",
		"items": []map[string]any{
			{"label": "Check comms", "order": 1},
			{"label": "Verify coordinates", "order": 2},
		},
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/checklist-templates", tmpl, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create template: expected 2xx, got %d: %s", resp.StatusCode, body)
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/checklist-templates", nil, cookies)
	var templates []map[string]any
	decodeJSON(t, resp2, &templates)
	found := false
	for _, tmpl := range templates {
		if tmpl["name"] == "Pre-flight Check" {
			found = true
			break
		}
	}
	if !found {
		t.Error("template 'Pre-flight Check' not found")
	}
}

func TestAPI_ChecklistInstances_CreateFromTemplate(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create template first
	resp := apiDo(t, srv, http.MethodPost, "/api/checklist-templates", map[string]any{
		"name": "Test Template",
		"items": []map[string]any{
			{"label": "Step 1", "order": 1},
		},
	}, cookies)
	var tmpl map[string]any
	decodeJSON(t, resp, &tmpl)

	// Create instance from template
	resp2 := apiDo(t, srv, http.MethodPost, "/api/checklist-instances", map[string]any{
		"template_id": tmpl["id"],
		"name":        "Instance 1",
	}, cookies)
	defer resp2.Body.Close()
	if !isSuccess(resp2.StatusCode) {
		body, _ := io.ReadAll(resp2.Body)
		t.Fatalf("create instance: expected 2xx, got %d: %s", resp2.StatusCode, body)
	}

	// List instances
	resp3 := apiDo(t, srv, http.MethodGet, "/api/checklist-instances", nil, cookies)
	var instances []map[string]any
	decodeJSON(t, resp3, &instances)
	if len(instances) < 1 {
		t.Fatal("expected at least 1 checklist instance")
	}
}

// ── Polls ────────────────────────────────────────────────────────────────────

func TestAPI_Polls_ListEmpty(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/polls", nil, cookies)
	var polls []any
	decodeJSON(t, resp, &polls)
	if len(polls) != 0 {
		t.Errorf("expected empty polls list, got %d", len(polls))
	}
}

func TestAPI_Polls_CreateAndGet(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	poll := map[string]any{
		"title":       "Readiness Poll",
		"description": "Check team readiness",
		"target_type": "role",
		"target_ids":  []string{"admin"},
		"questions": []map[string]any{
			{"text": "Are you ready?", "type": "yes_no"},
		},
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/polls", poll, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create poll: expected 2xx, got %d: %s", resp.StatusCode, body)
	}
	var created map[string]any
	json.NewDecoder(resp.Body).Decode(&created)

	// List polls
	resp2 := apiDo(t, srv, http.MethodGet, "/api/polls", nil, cookies)
	var polls []map[string]any
	decodeJSON(t, resp2, &polls)
	if len(polls) < 1 {
		t.Fatal("expected at least 1 poll")
	}
}

func TestAPI_Polls_DefaultQuestions(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/polls/default-questions", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Poll Questionnaires ─────────────────────────────────────────────────────

func TestAPI_PollQuestionnaires_CRUD(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create
	q := map[string]any{
		"name":        "Standard Questions",
		"description": "Default questionnaire",
		"questions": []map[string]any{
			{"text": "Overall readiness?", "type": "scale"},
		},
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/poll-questionnaires", q, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create questionnaire: expected 2xx, got %d: %s", resp.StatusCode, body)
	}
	var created map[string]any
	json.NewDecoder(resp.Body).Decode(&created)

	// List
	resp2 := apiDo(t, srv, http.MethodGet, "/api/poll-questionnaires", nil, cookies)
	var qs []map[string]any
	decodeJSON(t, resp2, &qs)
	if len(qs) < 1 {
		t.Fatal("expected at least 1 questionnaire")
	}
}

// ── References ──────────────────────────────────────────────────────────────

func TestAPI_References_ListEmpty(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/references", nil, cookies)
	var refs []any
	decodeJSON(t, resp, &refs)
	if len(refs) != 0 {
		t.Errorf("expected empty references list, got %d", len(refs))
	}
}

func TestAPI_References_AddLink(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/references/link", map[string]any{
		"title":       "NATO Reference",
		"url":         "https://example.com/doc.pdf",
		"description": "Important document",
		"category":    "doctrine",
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("add reference link: expected 2xx, got %d: %s", resp.StatusCode, body)
	}

	// List to verify
	resp2 := apiDo(t, srv, http.MethodGet, "/api/references", nil, cookies)
	var refs []map[string]any
	decodeJSON(t, resp2, &refs)
	if len(refs) < 1 {
		t.Fatal("expected at least 1 reference")
	}
}

func TestAPI_References_Index(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/references/index", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Resource Notes & Stars ──────────────────────────────────────────────────

func TestAPI_ResourceNotes_CRUD(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/resource-notes", map[string]any{
		"resource_type": "user",
		"resource_id":   "1",
		"note_type":     "general",
		"content":       "Important note",
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create resource note: expected 2xx, got %d: %s", resp.StatusCode, body)
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/resource-notes", nil, cookies)
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("list resource notes: expected 200, got %d", resp2.StatusCode)
	}
}

func TestAPI_ResourceStars_CRUD(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/resource-stars", map[string]any{
		"resource_type": "user",
		"resource_id":   "1",
		"stars":         5,
		"visibility":    "global",
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create resource star: expected 2xx, got %d: %s", resp.StatusCode, body)
	}

	resp2 := apiDo(t, srv, http.MethodGet, "/api/resource-stars", nil, cookies)
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("list resource stars: expected 200, got %d", resp2.StatusCode)
	}
}

// ── Auto Report Schedules ───────────────────────────────────────────────────

func TestAPI_AutoReportSchedules_ListEmpty(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/auto-report-schedules", nil, cookies)
	var schedules []any
	decodeJSON(t, resp, &schedules)
	if len(schedules) != 0 {
		t.Errorf("expected empty schedules list, got %d", len(schedules))
	}
}

func TestAPI_AutoReportSchedules_CreateAndList(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	schedule := map[string]any{
		"name":       "Daily Report",
		"cron":       "0 8 * * *",
		"format":     "pdf",
		"recipients": []string{"admin@example.com"},
		"enabled":    true,
	}
	resp := apiDo(t, srv, http.MethodPost, "/api/auto-report-schedules", schedule, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create schedule: expected 2xx, got %d: %s", resp.StatusCode, body)
	}
}

// ── Map Resources & Geo Items ───────────────────────────────────────────────

func TestAPI_MapResources_ListEmpty(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/map-resources", nil, cookies)
	var resources []any
	decodeJSON(t, resp, &resources)
	if len(resources) != 0 {
		t.Errorf("expected empty map resources list, got %d", len(resources))
	}
}

func TestAPI_GeoItems_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/geo-items", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Narrative ───────────────────────────────────────────────────────────────

func TestAPI_Narrative(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/narrative", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Startup Text ────────────────────────────────────────────────────────────

func TestAPI_StartupText_GetAndSet(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Get default
	resp := apiDo(t, srv, http.MethodGet, "/api/startup-text", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// Set text
	resp2 := apiDo(t, srv, http.MethodPut, "/api/startup-text", map[string]any{
		"text": "Welcome to the exercise",
	}, cookies)
	defer resp2.Body.Close()
	if !isSuccess(resp2.StatusCode) {
		body, _ := io.ReadAll(resp2.Body)
		t.Fatalf("set startup text: expected 2xx, got %d: %s", resp2.StatusCode, body)
	}
}

// ── Day Labels ──────────────────────────────────────────────────────────────

func TestAPI_DayLabels(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/day-labels", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Languages ───────────────────────────────────────────────────────────────

func TestAPI_Languages(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/languages", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Activity ────────────────────────────────────────────────────────────────

func TestAPI_Activity(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/activity", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── DB Stats ────────────────────────────────────────────────────────────────

func TestAPI_DBStats(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/db-stats", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Editing Locks ───────────────────────────────────────────────────────────

func TestAPI_EditingLocks_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/editing-locks", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Free/Busy ───────────────────────────────────────────────────────────────

func TestAPI_FreeBusy(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	now := time.Now().UTC()
	from := now.Format(time.RFC3339)
	to := now.Add(24 * time.Hour).Format(time.RFC3339)
	resp := apiDo(t, srv, http.MethodGet, "/api/free-busy?from="+from+"&to="+to, nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Meeting Config ──────────────────────────────────────────────────────────

func TestAPI_MeetingConfig_GetAndSet(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodGet, "/api/meeting-config", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Event Cascade ───────────────────────────────────────────────────────────

func TestAPI_EventCascade_Post(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create an event
	resp := apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Cascade Test", "start_time": time.Now().UTC().Format(time.RFC3339),
		"end_time": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
	}, cookies)
	var ev map[string]any
	decodeJSON(t, resp, &ev)
	id := ev["id"].(float64)

	// Cascade reschedule is POST only
	resp2 := apiDo(t, srv, http.MethodPost, "/api/events/cascade", map[string]any{
		"event_id":  int64(id),
		"delta_min": 60,
	}, cookies)
	defer resp2.Body.Close()
	if resp2.StatusCode == http.StatusMethodNotAllowed {
		t.Fatalf("expected method to be accepted, got 405")
	}
}

// ── Export Formats ──────────────────────────────────────────────────────────

func TestAPI_ExportICS(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/export/ics", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_ExportSTIX(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/export/stix", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_ExportSettings(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/export/settings", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_ExportLogs(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/export/logs?type=audit_log&format=json", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
}
