package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── Fuzz Test Helpers ───────────────────────────────────────────────────────

func newFuzzApp(f *testing.F) (*App, *httptest.Server) {
	f.Helper()
	app, err := NewApp(f.TempDir())
	if err != nil {
		f.Fatalf("NewApp: %v", err)
	}
	users := app.store.GetUsers()
	for _, u := range users {
		if u.Username == "admin" {
			hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
			u.PasswordHash = string(hash)
			u.MustChangePassword = false
			app.store.UpdateUser(u)
			break
		}
	}
	srv := httptest.NewServer(app.routes())
	f.Cleanup(func() {
		srv.Close()
		app.Stop()
	})
	return app, srv
}

func fuzzLogin(f *testing.F, srv *httptest.Server) []*http.Cookie {
	f.Helper()
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "admin"})
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		f.Fatalf("login: %v", err)
	}
	resp.Body.Close()
	return resp.Cookies()
}

func fuzzRequest(srv *httptest.Server, method, path string, body string, cookies []*http.Cookie) (*http.Response, error) {
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, srv.URL+path, bodyReader)
	if err != nil {
		return nil, err
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if method != http.MethodGet && method != http.MethodHead {
		setCSRFHeaders(req, cookies)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	return http.DefaultClient.Do(req)
}

// ── Fuzz: Login Endpoint ────────────────────────────────────────────────────
// Tests that arbitrary username/password combinations never crash the server.

func FuzzLogin(f *testing.F) {
	_, srv := newFuzzApp(f)

	f.Add("admin", "admin")
	f.Add("", "")
	f.Add("admin", "wrongpassword")
	f.Add("nonexistent", "password")
	f.Add(strings.Repeat("a", 10000), "b")
	f.Add("user", strings.Repeat("x", 10000))
	f.Add("<script>alert(1)</script>", "password")
	f.Add("admin'; DROP TABLE users; --", "pass")
	f.Add("user\x00null", "pass\x00null")

	f.Fuzz(func(t *testing.T, username, password string) {
		body, _ := json.Marshal(map[string]string{"username": username, "password": password})
		req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/login", bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return
		}
		resp.Body.Close()
		// Server must not crash; must return valid HTTP status
		if resp.StatusCode < 200 || resp.StatusCode >= 600 {
			t.Errorf("unexpected status code: %d", resp.StatusCode)
		}
	})
}

// ── Fuzz: Event Creation ────────────────────────────────────────────────────
// Tests that arbitrary event data never crashes the server.

func FuzzCreateEvent(f *testing.F) {
	_, srv := newFuzzApp(f)
	cookies := fuzzLogin(f, srv)

	f.Add("Normal Event", "2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z", "description")
	f.Add("", "", "", "")
	f.Add("<script>alert('xss')</script>", "invalid-date", "invalid-date", "<img onerror=alert(1)>")
	f.Add(strings.Repeat("A", 100000), "2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z", "")
	f.Add("Event\x00with\x00nulls", "2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z", "null\x00bytes")

	f.Fuzz(func(t *testing.T, title, startTime, endTime, description string) {
		body, _ := json.Marshal(map[string]string{
			"title":       title,
			"start_time":  startTime,
			"end_time":    endTime,
			"description": description,
		})
		resp, err := fuzzRequest(srv, http.MethodPost, "/api/events", string(body), cookies)
		if err != nil {
			return
		}
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 600 {
			t.Errorf("unexpected status code: %d for title=%q", resp.StatusCode, title)
		}
	})
}

// ── Fuzz: User Creation ─────────────────────────────────────────────────────

func FuzzCreateUser(f *testing.F) {
	_, srv := newFuzzApp(f)
	cookies := fuzzLogin(f, srv)

	f.Add("testuser", "Password123!", "Test User", "read")
	f.Add("", "", "", "")
	f.Add("admin", "admin", "admin", "admin")
	f.Add("<script>alert(1)</script>", "pass", "name", "invalid_role")
	f.Add(strings.Repeat("u", 10000), "p", "n", "read")

	f.Fuzz(func(t *testing.T, username, password, displayName, role string) {
		body, _ := json.Marshal(map[string]string{
			"username":     username,
			"password":     password,
			"display_name": displayName,
			"role":         role,
		})
		resp, err := fuzzRequest(srv, http.MethodPost, "/api/users", string(body), cookies)
		if err != nil {
			return
		}
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 600 {
			t.Errorf("unexpected status code: %d", resp.StatusCode)
		}
	})
}

// ── Fuzz: JSON API Endpoints ────────────────────────────────────────────────
// Sends arbitrary JSON to various POST endpoints.

func FuzzAPIEndpoints(f *testing.F) {
	_, srv := newFuzzApp(f)
	cookies := fuzzLogin(f, srv)

	f.Add("/api/events", `{"title":"test"}`)
	f.Add("/api/tags", `{"name":"tag"}`)
	f.Add("/api/layers", `{"name":"layer"}`)
	f.Add("/api/groups", `{"name":"group"}`)
	f.Add("/api/events", `{invalid json`)
	f.Add("/api/events", `null`)
	f.Add("/api/events", `[]`)
	f.Add("/api/events", `""`)
	f.Add("/api/events", strings.Repeat("{", 10000))

	f.Fuzz(func(t *testing.T, path, body string) {
		// Only fuzz known writable paths to avoid noise
		validPaths := []string{"/api/events", "/api/tags", "/api/layers",
			"/api/groups", "/api/alarms", "/api/phases",
			"/api/templates", "/api/filter-presets", "/api/log-book",
			"/api/resource-notes", "/api/resource-stars"}
		found := false
		for _, vp := range validPaths {
			if path == vp {
				found = true
				break
			}
		}
		if !found {
			return
		}

		resp, err := fuzzRequest(srv, http.MethodPost, path, body, cookies)
		if err != nil {
			return
		}
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 600 {
			t.Errorf("unexpected status code %d for POST %s", resp.StatusCode, path)
		}
	})
}

// ── Fuzz: URL Path Traversal ────────────────────────────────────────────────
// Tests that path traversal attempts in URL don't crash the server.

func FuzzURLPaths(f *testing.F) {
	_, srv := newFuzzApp(f)
	cookies := fuzzLogin(f, srv)

	f.Add("/api/events")
	f.Add("/api/../../../etc/passwd")
	f.Add("/api/events/%00")
	f.Add("/api/events/../../admin")
	f.Add("/static/../main.go")
	f.Add("/api/" + strings.Repeat("a/", 1000))
	f.Add("/api/events/-1")
	f.Add("/api/events/999999999999999999999999999")

	f.Fuzz(func(t *testing.T, path string) {
		// Must not start with double-slash (invalid URL)
		if strings.HasPrefix(path, "//") {
			return
		}
		resp, err := fuzzRequest(srv, http.MethodGet, path, "", cookies)
		if err != nil {
			return
		}
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 600 {
			t.Errorf("unexpected status code %d for GET %s", resp.StatusCode, path)
		}
	})
}

// ── Fuzz: StripHTMLTags ─────────────────────────────────────────────────────
// Verifies the HTML sanitizer never lets through dangerous content.

func FuzzStripHTMLTags(f *testing.F) {
	f.Add("<script>alert(1)</script>")
	f.Add("<img src=x onerror=alert(1)>")
	f.Add("<svg onload=alert(1)>")
	f.Add("normal text")
	f.Add("<style>body{display:none}</style>")
	f.Add("javascript:alert(1)")
	f.Add("<a href='javascript:alert(1)'>click</a>")
	f.Add("<ScRiPt>alert(1)</sCrIpT>")
	f.Add("<scr\x00ipt>alert(1)</script>")
	f.Add(strings.Repeat("<b>", 10000))
	f.Add("<iframe src=javascript:alert(1)>")
	f.Add("vbscript:MsgBox")

	f.Fuzz(func(t *testing.T, input string) {
		result := stripHTMLTags(input)
		lower := strings.ToLower(result)

		// Result must never contain HTML tags
		if strings.Contains(result, "<") && strings.Contains(result, ">") {
			t.Errorf("stripHTMLTags left HTML tags: input=%q result=%q", input, result)
		}
		// Result must never contain script tags
		if strings.Contains(lower, "<script") {
			t.Errorf("stripHTMLTags left <script: input=%q result=%q", input, result)
		}
		// Result must never contain javascript: URIs
		if strings.Contains(lower, "javascript:") {
			t.Errorf("stripHTMLTags left javascript: URI: input=%q result=%q", input, result)
		}
		// Result must never contain vbscript: URIs
		if strings.Contains(lower, "vbscript:") {
			t.Errorf("stripHTMLTags left vbscript: URI: input=%q result=%q", input, result)
		}
	})
}

// ── Fuzz: isDangerousFilename ────────────────────────────────────────────────

func FuzzIsDangerousFilename(f *testing.F) {
	f.Add("document.pdf")
	f.Add("script.js")
	f.Add("page.html")
	f.Add("image.svg")
	f.Add("binary.exe")
	f.Add("no-extension")
	f.Add(".hidden")
	f.Add("")
	f.Add(strings.Repeat("a", 10000) + ".exe")
	f.Add("file.JS")     // case sensitivity
	f.Add("file.Html")   // case sensitivity
	f.Add("file.tar.gz") // double extension

	f.Fuzz(func(t *testing.T, filename string) {
		// Must not panic
		_ = isDangerousFilename(filename)
	})
}

// ── Fuzz: Ingest Endpoint ───────────────────────────────────────────────────

func FuzzIngest(f *testing.F) {
	_, srv := newFuzzApp(f)
	cookies := fuzzLogin(f, srv)

	f.Add(`{"source":"test","events":[{"title":"event1"}]}`)
	f.Add(`not json at all`)
	f.Add(``)
	f.Add(`{"type":"bundle","objects":[]}`) // STIX-like
	f.Add(strings.Repeat(`{"a":`, 1000) + `1` + strings.Repeat(`}`, 1000))

	f.Fuzz(func(t *testing.T, body string) {
		resp, err := fuzzRequest(srv, http.MethodPost, "/api/ingest", body, cookies)
		if err != nil {
			return
		}
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 600 {
			t.Errorf("unexpected status code: %d", resp.StatusCode)
		}
	})
}

// ── Fuzz: Store Operations ──────────────────────────────────────────────────

func FuzzStoreEventCRUD(f *testing.F) {
	f.Add("Event Title", "Description", int64(1704067200), int64(3600))
	f.Add("", "", int64(0), int64(0))
	f.Add(strings.Repeat("X", 10000), "", int64(-1), int64(-1))
	f.Add("<script>alert(1)</script>", "desc", int64(1704067200), int64(7200))

	f.Fuzz(func(t *testing.T, title, description string, startUnix, durationSec int64) {
		s, err := NewStore(t.TempDir())
		if err != nil {
			t.Skip("cannot create store")
		}

		startTime := time.Unix(startUnix, 0).UTC()
		endTime := startTime.Add(time.Duration(durationSec) * time.Second)

		ev := &Event{
			Title:       title,
			Description: description,
			StartTime:   startTime,
			EndTime:     &endTime,
		}

		// CreateEvent must not panic
		added, err := s.CreateEvent(*ev)
		if err != nil {
			return
		}

		// GetEventByID must return the same event
		got, ok := s.GetEventByID(added.ID)
		if !ok || got == nil {
			t.Errorf("GetEventByID(%d) returned nil after CreateEvent", added.ID)
			return
		}
		if got.Title != title {
			t.Errorf("title mismatch: got %q, want %q", got.Title, title)
		}
	})
}
