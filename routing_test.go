package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func TestRuleMatches_SourceMatch(t *testing.T) {
	rule := RoutingRule{
		SourceMatch: []string{"github", "jira"},
	}
	if !ruleMatches(rule, IngestPayload{Source: "github"}) {
		t.Error("expected match on source 'github'")
	}
	if !ruleMatches(rule, IngestPayload{Source: "JIRA"}) {
		t.Error("expected case-insensitive match on source 'JIRA'")
	}
	if ruleMatches(rule, IngestPayload{Source: "unknown"}) {
		t.Error("expected no match on source 'unknown'")
	}
}

func TestRuleMatches_TagMatch(t *testing.T) {
	rule := RoutingRule{
		TagMatch: []string{"critical", "security"},
	}
	if !ruleMatches(rule, IngestPayload{Tags: []string{"security", "ops"}}) {
		t.Error("expected match on tag 'security'")
	}
	if ruleMatches(rule, IngestPayload{Tags: []string{"info", "ops"}}) {
		t.Error("expected no match without matching tags")
	}
}

func TestRuleMatches_PriorityMatch(t *testing.T) {
	rule := RoutingRule{
		PriorityMatch: []string{"critical", "high"},
	}
	if !ruleMatches(rule, IngestPayload{Priority: "critical"}) {
		t.Error("expected match on priority 'critical'")
	}
	if ruleMatches(rule, IngestPayload{Priority: "low"}) {
		t.Error("expected no match on priority 'low'")
	}
}

func TestRuleMatches_ContentMatch(t *testing.T) {
	rule := RoutingRule{
		ContentMatch: "malware",
	}
	if !ruleMatches(rule, IngestPayload{Title: "New Malware Detected"}) {
		t.Error("expected match on title containing 'malware'")
	}
	if !ruleMatches(rule, IngestPayload{Description: "Analysis of MALWARE sample"}) {
		t.Error("expected match on description containing 'malware'")
	}
	if ruleMatches(rule, IngestPayload{Title: "Normal event", Description: "Nothing special"}) {
		t.Error("expected no match without content match")
	}
}

func TestRuleMatches_FormatMatch(t *testing.T) {
	rule := RoutingRule{
		FormatMatch: []string{"stix", "adatp3"},
	}
	if !ruleMatches(rule, IngestPayload{Format: FormatSTIX}) {
		t.Error("expected match on format stix")
	}
	if ruleMatches(rule, IngestPayload{Format: FormatJSON}) {
		t.Error("expected no match on format json")
	}
}

func TestRuleMatches_EmptyConditions(t *testing.T) {
	rule := RoutingRule{}
	// Empty conditions should match everything
	if !ruleMatches(rule, IngestPayload{Source: "any", Priority: "any"}) {
		t.Error("empty rule should match any payload")
	}
}

func TestRuleMatches_AllConditions(t *testing.T) {
	rule := RoutingRule{
		SourceMatch:   []string{"github"},
		PriorityMatch: []string{"high"},
		TagMatch:      []string{"security"},
	}
	// All conditions must match
	matching := IngestPayload{Source: "github", Priority: "high", Tags: []string{"security"}}
	if !ruleMatches(rule, matching) {
		t.Error("expected all conditions to match")
	}
	// Only some match → should fail
	partial := IngestPayload{Source: "github", Priority: "low", Tags: []string{"security"}}
	if ruleMatches(rule, partial) {
		t.Error("expected partial match to fail (all conditions AND)")
	}
}

func TestContainsCI(t *testing.T) {
	if !containsCI([]string{"Hello", "World"}, "hello") {
		t.Error("expected case-insensitive match")
	}
	if containsCI([]string{"Hello"}, "Hi") {
		t.Error("expected no match")
	}
}

func TestContainsInt64(t *testing.T) {
	if !containsInt64([]int64{1, 2, 3}, 2) {
		t.Error("expected to find 2")
	}
	if containsInt64([]int64{1, 2, 3}, 4) {
		t.Error("expected not to find 4")
	}
}

// ── HTTP handler tests ──────────────────────────────────────────────────────

func TestRoutingRulesAPI_CRUD(t *testing.T) {
	app, srv := newTestApp(t)
	_ = app

	// Create admin user and login
	cookies := login(t, srv, "admin", "admin")

	// Create a routing rule
	rule := RoutingRule{
		Name:          "Test Rule",
		Enabled:       true,
		SourceMatch:   []string{"github"},
		PriorityMatch: []string{"high", "critical"},
		TargetJDesignations: []string{"J2", "J6"},
		NotifyViaSSE:  true,
	}

	resp := apiDo(t, srv, http.MethodPost, "/api/routing-rules", rule, cookies)
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("POST /api/routing-rules: expected 201, got %d: %s", resp.StatusCode, body)
	}
	var created RoutingRule
	decodeJSON(t, resp, &created)
	if created.ID == 0 {
		t.Error("expected non-zero ID")
	}
	if created.Name != "Test Rule" {
		t.Errorf("expected name 'Test Rule', got %q", created.Name)
	}

	// List rules
	resp = apiDo(t, srv, http.MethodGet, "/api/routing-rules", nil, cookies)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/routing-rules: expected 200, got %d", resp.StatusCode)
	}
	var rules []RoutingRule
	decodeJSON(t, resp, &rules)
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules))
	}

	// Update rule
	created.Name = "Updated Rule"
	resp = apiDo(t, srv, http.MethodPut, "/api/routing-rules/"+itoa(created.ID), created, cookies)
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("PUT: expected 200, got %d: %s", resp.StatusCode, body)
	}

	// Delete rule
	resp = apiDo(t, srv, http.MethodDelete, "/api/routing-rules/"+itoa(created.ID), nil, cookies)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE: expected 204, got %d", resp.StatusCode)
	}
}

func TestIngestAPI(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	payload := map[string]interface{}{
		"title":       "Ingested Test Event",
		"description": "From ingest API",
		"event_type":  "event",
		"priority":    "high",
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/ingest?source=test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /api/ingest: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		t.Fatalf("POST /api/ingest: expected 200, got %d: %s", resp.StatusCode, respBody)
	}

	var result IngestResult
	json.NewDecoder(resp.Body).Decode(&result) //nolint
	if result.Accepted != 1 {
		t.Errorf("expected 1 accepted, got %d", result.Accepted)
	}
	if len(result.EventIDs) != 1 {
		t.Errorf("expected 1 event ID, got %d", len(result.EventIDs))
	}
}

func TestMetricsEndpoint(t *testing.T) {
	_, srv := newTestApp(t)
	resp, err := http.Get(srv.URL + "/metrics")
	if err != nil {
		t.Fatalf("GET /metrics: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /metrics: expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	for _, want := range []string{"tidslinjal_info", "tidslinjal_uptime_seconds", "tidslinjal_http_requests_total", "tidslinjal_go_goroutines"} {
		if !contains(bodyStr, want) {
			t.Errorf("expected metric %q in output", want)
		}
	}
}

func TestConnectorsAPI_List(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodGet, "/api/connectors", nil, cookies)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/connectors: expected 200, got %d", resp.StatusCode)
	}
	var list []ConnectorConfig
	decodeJSON(t, resp, &list)
	if len(list) < 5 {
		t.Errorf("expected at least 5 connectors registered, got %d", len(list))
	}
}

// helpers
func itoa(n int64) string {
	return json.Number(json.Number(string(rune('0'+n%10)) + "").String()).String()
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}
func containsStr(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
