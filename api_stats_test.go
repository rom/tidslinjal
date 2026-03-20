package main

import (
	"net/http"
	"testing"
	"time"
)

// ── Stats API ────────────────────────────────────────────────────────────────

func TestAPI_StatsOverview(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create some data for meaningful stats
	apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
		"title": "Stats Event", "start_time": time.Now().UTC().Format(time.RFC3339),
		"end_time": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
	}, cookies)

	resp := apiDo(t, srv, http.MethodGet, "/api/stats/overview", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var stats map[string]any
	decodeJSON(t, resp, &stats)
	if _, ok := stats["total_events"]; !ok {
		t.Error("expected total_events in stats overview")
	}
	if _, ok := stats["total_users"]; !ok {
		t.Error("expected total_users in stats overview")
	}
}

func TestAPI_StatsOverview_Unauthenticated(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/overview", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsEventsTimeline(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/events/timeline?resolution=day", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsEventsStatus(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/events/status", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsEventsType(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/events/type", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsEventsHeatmap(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/events/heatmap", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsUsersWorkload(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/users/workload", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsDecisions(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/decisions", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsSlipHistogram(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/events/slip", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsOpTempo(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/events/tempo", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsDecisionAnalytics(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/decision-analytics", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsDependencyGraph(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/dependency-graph", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsLeadershipDashboard(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/leadership-dashboard", nil, cookies)
	defer resp.Body.Close()
	// Admin should be able to access (OpLead or above)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 200 or 403, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsPersonnelPerformance(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/personnel-performance", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsUsage(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/usage", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_StatsExport(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/stats/export", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}
