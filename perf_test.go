package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── Performance Test Helpers ────────────────────────────────────────────────

// perfResult holds timing data for a single operation.
type perfResult struct {
	Operation string        `json:"operation"`
	Count     int           `json:"count"`
	Min       time.Duration `json:"min_ns"`
	Max       time.Duration `json:"max_ns"`
	Avg       time.Duration `json:"avg_ns"`
	P50       time.Duration `json:"p50_ns"`
	P95       time.Duration `json:"p95_ns"`
	P99       time.Duration `json:"p99_ns"`
}

func computePerf(name string, durations []time.Duration) perfResult {
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	var total time.Duration
	for _, d := range durations {
		total += d
	}
	n := len(durations)
	return perfResult{
		Operation: name,
		Count:     n,
		Min:       durations[0],
		Max:       durations[n-1],
		Avg:       total / time.Duration(n),
		P50:       durations[n*50/100],
		P95:       durations[n*95/100],
		P99:       durations[n*99/100],
	}
}

func writePerfReport(t *testing.T, results []perfResult) {
	t.Helper()
	// Log to test output
	t.Logf("\n╔══════════════════════════════════════════════════════════════════════╗")
	t.Logf("║  Performance Results                                               ║")
	t.Logf("╠══════════════════════════════════════════════════════════════════════╣")
	for _, r := range results {
		t.Logf("║  %-30s  n=%-5d  avg=%-10s p95=%-10s ║",
			r.Operation, r.Count, r.Avg.Round(time.Microsecond), r.P95.Round(time.Microsecond))
	}
	t.Logf("╚══════════════════════════════════════════════════════════════════════╝")

	// Write JSON report to file
	report := map[string]any{
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"results":   results,
	}
	data, _ := json.MarshalIndent(report, "", "  ")
	reportPath := os.TempDir() + "/tidslinjal-perf-" + time.Now().Format("20060102-150405") + ".json"
	if err := os.WriteFile(reportPath, data, 0644); err == nil {
		t.Logf("Performance report written to: %s", reportPath)
	}
}

// ── API Benchmarks ──────────────────────────────────────────────────────────

func BenchmarkAPI_Login(b *testing.B) {
	app, err := NewApp(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	defer app.Stop()
	resetAdminPassword(b, app)
	srv := httptest.NewServer(app.routes())
	defer srv.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := benchDo(b, srv, http.MethodPost, "/api/auth/login",
			`{"username":"admin","password":"admin"}`, nil)
		resp.Body.Close()
	}
}

func BenchmarkAPI_GetEvents(b *testing.B) {
	app, err := NewApp(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	defer app.Stop()
	resetAdminPassword(b, app)
	srv := httptest.NewServer(app.routes())
	defer srv.Close()
	cookies := benchLogin(b, srv)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := benchDo(b, srv, http.MethodGet, "/api/events", "", cookies)
		resp.Body.Close()
	}
}

func BenchmarkAPI_CreateEvent(b *testing.B) {
	app, err := NewApp(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	defer app.Stop()
	resetAdminPassword(b, app)
	srv := httptest.NewServer(app.routes())
	defer srv.Close()
	cookies := benchLogin(b, srv)

	now := time.Now().UTC()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		body := fmt.Sprintf(`{"title":"Event %d","start_time":"%s","end_time":"%s"}`,
			i, now.Format(time.RFC3339), now.Add(time.Hour).Format(time.RFC3339))
		resp := benchDo(b, srv, http.MethodPost, "/api/events", body, cookies)
		resp.Body.Close()
	}
}

func BenchmarkAPI_StatsOverview(b *testing.B) {
	app, err := NewApp(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	defer app.Stop()
	resetAdminPassword(b, app)
	srv := httptest.NewServer(app.routes())
	defer srv.Close()
	cookies := benchLogin(b, srv)

	// Seed some data
	now := time.Now().UTC()
	for i := 0; i < 50; i++ {
		body := fmt.Sprintf(`{"title":"Event %d","start_time":"%s","end_time":"%s"}`,
			i, now.Add(time.Duration(i)*time.Hour).Format(time.RFC3339),
			now.Add(time.Duration(i+1)*time.Hour).Format(time.RFC3339))
		resp := benchDo(b, srv, http.MethodPost, "/api/events", body, cookies)
		resp.Body.Close()
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := benchDo(b, srv, http.MethodGet, "/api/stats/overview", "", cookies)
		resp.Body.Close()
	}
}

func BenchmarkAPI_Export(b *testing.B) {
	app, err := NewApp(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	defer app.Stop()
	resetAdminPassword(b, app)
	srv := httptest.NewServer(app.routes())
	defer srv.Close()
	cookies := benchLogin(b, srv)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := benchDo(b, srv, http.MethodGet, "/api/export", "", cookies)
		resp.Body.Close()
	}
}

func BenchmarkStore_CreateEvent(b *testing.B) {
	s, err := NewStore(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	now := time.Now().UTC()
	end := now.Add(time.Hour)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.CreateEvent(Event{
			Title:     fmt.Sprintf("Event %d", i),
			StartTime: now,
			EndTime:   &end,
		})
	}
}

func BenchmarkStore_GetEvents(b *testing.B) {
	s, err := NewStore(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	now := time.Now().UTC()
	for i := 0; i < 1000; i++ {
		end := now.Add(time.Duration(i+1) * time.Minute)
		s.CreateEvent(Event{
			Title:     fmt.Sprintf("Event %d", i),
			StartTime: now.Add(time.Duration(i) * time.Minute),
			EndTime:   &end,
		})
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.GetEvents(now, now.Add(500*time.Minute), nil)
	}
}

func BenchmarkStore_ConcurrentReadWrite(b *testing.B) {
	s, err := NewStore(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	now := time.Now().UTC()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			if i%2 == 0 {
				end := now.Add(time.Hour)
				s.CreateEvent(Event{
					Title:     fmt.Sprintf("Event %d", i),
					StartTime: now,
					EndTime:   &end,
				})
			} else {
				s.GetEvents(now.Add(-time.Hour), now.Add(time.Hour), nil)
			}
			i++
		}
	})
}

// ── Performance Integration Test ────────────────────────────────────────────
// This test runs a fixed number of iterations and produces a human-readable
// performance report. Run with: go test -run TestPerformance -count=1 -v

func TestPerformance_APILatency(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping performance test in -short mode")
	}
	t.Parallel()

	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	iterations := 100

	// Seed data
	now := time.Now().UTC()
	for i := 0; i < 20; i++ {
		apiDo(t, srv, http.MethodPost, "/api/events", map[string]any{
			"title":      fmt.Sprintf("Perf Event %d", i),
			"start_time": now.Add(time.Duration(i) * time.Hour).Format(time.RFC3339),
			"end_time":   now.Add(time.Duration(i+1) * time.Hour).Format(time.RFC3339),
		}, cookies)
	}

	endpoints := []struct {
		name   string
		method string
		path   string
	}{
		{"GET /api/events", http.MethodGet, "/api/events"},
		{"GET /api/users", http.MethodGet, "/api/users"},
		{"GET /api/stats/overview", http.MethodGet, "/api/stats/overview"},
		{"GET /api/audit", http.MethodGet, "/api/audit"},
		{"GET /api/export", http.MethodGet, "/api/export"},
		{"GET /api/layers", http.MethodGet, "/api/layers"},
		{"GET /api/preferences", http.MethodGet, "/api/preferences"},
		{"GET /api/tags", http.MethodGet, "/api/tags"},
		{"GET /api/narrative", http.MethodGet, "/api/narrative"},
	}

	var results []perfResult
	for _, ep := range endpoints {
		durations := make([]time.Duration, iterations)
		for i := 0; i < iterations; i++ {
			start := time.Now()
			resp := apiDo(t, srv, ep.method, ep.path, nil, cookies)
			durations[i] = time.Since(start)
			resp.Body.Close()
		}
		results = append(results, computePerf(ep.name, durations))
	}

	writePerfReport(t, results)
}

func TestPerformance_ConcurrentLoad(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping performance test in -short mode")
	}
	t.Parallel()

	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	concurrency := 10
	requestsPerWorker := 50
	var mu sync.Mutex
	var allDurations []time.Duration
	var wg sync.WaitGroup

	wg.Add(concurrency)
	for w := 0; w < concurrency; w++ {
		go func() {
			defer wg.Done()
			var local []time.Duration
			for i := 0; i < requestsPerWorker; i++ {
				start := time.Now()
				resp := apiDo(t, srv, http.MethodGet, "/api/events", nil, cookies)
				local = append(local, time.Since(start))
				resp.Body.Close()
			}
			mu.Lock()
			allDurations = append(allDurations, local...)
			mu.Unlock()
		}()
	}
	wg.Wait()

	result := computePerf(
		fmt.Sprintf("GET /api/events (%d concurrent)", concurrency),
		allDurations,
	)
	writePerfReport(t, []perfResult{result})
}

// ── Benchmark helpers ───────────────────────────────────────────────────────

func resetAdminPassword(tb testing.TB, app *App) {
	tb.Helper()
	users := app.store.GetUsers()
	for _, u := range users {
		if u.Username == "admin" {
			hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
			u.PasswordHash = string(hash)
			u.MustChangePassword = false
			app.store.UpdateUser(u)
			return
		}
	}
}

func benchDo(tb testing.TB, srv *httptest.Server, method, path, body string, cookies []*http.Cookie) *http.Response {
	tb.Helper()
	var bodyReader *strings.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	var req *http.Request
	var err error
	if bodyReader != nil {
		req, err = http.NewRequest(method, srv.URL+path, bodyReader)
	} else {
		req, err = http.NewRequest(method, srv.URL+path, nil)
	}
	if err != nil {
		tb.Fatalf("new request: %v", err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if method != http.MethodGet && method != http.MethodHead {
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		tb.Fatalf("do request: %v", err)
	}
	return resp
}

func benchLogin(tb testing.TB, srv *httptest.Server) []*http.Cookie {
	tb.Helper()
	resp := benchDo(tb, srv, http.MethodPost, "/api/auth/login",
		`{"username":"admin","password":"admin"}`, nil)
	defer resp.Body.Close()
	return resp.Cookies()
}
