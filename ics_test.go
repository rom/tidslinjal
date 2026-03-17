package main

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"testing"
	"time"
)

// ensure json is not needed directly in this file (decodeJSON is in api_test.go)
var _ = time.Now // keep time import

// ── parseICSTime ──────────────────────────────────────────────────────────────

func TestParseICSTime_UTCDatetime(t *testing.T) {
	tm, allDay, err := parseICSTime("20240315T120000Z")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allDay {
		t.Error("expected allDay=false for datetime value")
	}
	if tm.Year() != 2024 || tm.Month() != 3 || tm.Day() != 15 {
		t.Errorf("wrong date: %v", tm)
	}
	if tm.Hour() != 12 || tm.Minute() != 0 {
		t.Errorf("wrong time: %v", tm)
	}
}

func TestParseICSTime_LocalDatetime(t *testing.T) {
	tm, allDay, err := parseICSTime("20240315T090000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allDay {
		t.Error("expected allDay=false")
	}
	if tm.Hour() != 9 {
		t.Errorf("expected hour 9, got %d", tm.Hour())
	}
}

func TestParseICSTime_DateOnly(t *testing.T) {
	tm, allDay, err := parseICSTime("20240315")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allDay {
		t.Error("expected allDay=true for date-only value")
	}
	if tm.Year() != 2024 || tm.Month() != 3 || tm.Day() != 15 {
		t.Errorf("wrong date: %v", tm)
	}
}

func TestParseICSTime_Invalid(t *testing.T) {
	_, _, err := parseICSTime("not-a-date")
	if err == nil {
		t.Error("expected error for invalid date")
	}
}

// ── icsEventTypeFromCategories ────────────────────────────────────────────────

func TestICSEventTypeFromCategories(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"event", "event"},
		{"meeting", "mote"},
		{"Meeting", "mote"},
		{"MEETING", "mote"},
		{"decision", "decision"},
		{"Deadline", "deadline"},
		{"activity", "activity"},
		{"repeated", "repeated"},
		{"reporting", "reporting"},
		{"assigned_task", "assigned_task"},
		{"standup", "standup"},
		{"physical_meeting", "physical_meeting"},
		{"unknown", "event"},
		{"", "event"},
		// comma-separated: first known wins
		{"unknown,meeting", "mote"},
	}
	for _, tc := range cases {
		got := icsEventTypeFromCategories(tc.input)
		if got != tc.want {
			t.Errorf("icsEventTypeFromCategories(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

// ── icsRRuleToPattern ─────────────────────────────────────────────────────────

func TestICSRRuleToPattern(t *testing.T) {
	cases := []struct {
		rrule string
		want  string
	}{
		{"FREQ=MINUTELY;INTERVAL=15", "15min"},
		{"FREQ=MINUTELY;INTERVAL=30", "30min"},
		{"FREQ=HOURLY", "hourly"},
		{"FREQ=HOURLY;INTERVAL=1", "hourly"},
		{"FREQ=HOURLY;INTERVAL=2", "2hours"},
		{"FREQ=HOURLY;INTERVAL=3", "3hours"},
		{"FREQ=HOURLY;INTERVAL=4", "4hours"},
		{"FREQ=DAILY", "daily"},
		{"FREQ=WEEKLY", "weekly"},
		{"FREQ=MONTHLY", "monthly"},
		{"FREQ=MONTHLY;INTERVAL=3", "quarterly"},
		{"FREQ=YEARLY", ""},
	}
	for _, tc := range cases {
		got, _ := icsRRuleToPattern(tc.rrule)
		if got != tc.want {
			t.Errorf("icsRRuleToPattern(%q) = %q, want %q", tc.rrule, got, tc.want)
		}
	}
}

func TestICSRRuleToPattern_WithUntil(t *testing.T) {
	pattern, recEnd := icsRRuleToPattern("FREQ=DAILY;UNTIL=20241231T235959Z")
	if pattern != "daily" {
		t.Errorf("expected daily, got %q", pattern)
	}
	if recEnd == nil {
		t.Fatal("expected recEnd to be set")
	}
	if recEnd.Year() != 2024 || recEnd.Month() != 12 || recEnd.Day() != 31 {
		t.Errorf("wrong recEnd date: %v", recEnd)
	}
}

// ── parseICSLines (line unfolding) ────────────────────────────────────────────

func TestParseICSLines_Unfolding(t *testing.T) {
	// RFC 5545 line folding: continuation line starts with SPACE/TAB which is stripped.
	// "SUMMARY:Hello" folded + " Wor" + " ld" => "SUMMARY:HelloWorld"
	input := "BEGIN:VCALENDAR\r\nSUMMARY:Hello\r\n Wor\r\n ld\r\nEND:VCALENDAR\r\n"
	lines := parseICSLines([]byte(input))
	found := false
	for _, l := range lines {
		if l == "SUMMARY:HelloWorld" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected folded line to be unfolded; got lines: %v", lines)
	}
}

// ── unescICS ──────────────────────────────────────────────────────────────────

func TestUnescICS(t *testing.T) {
	// Inputs use Go double-quoted strings so \\ = one backslash in the actual string.
	cases := []struct{ input, want string }{
		{"Hello\\nWorld", "Hello\nWorld"},   // ICS \n → newline
		{"line1\\nline2", "line1\nline2"},   // ICS \n → newline
		{"semi\\;colon", "semi;colon"},      // ICS \; → ;
		{"com\\,ma", "com,ma"},              // ICS \, → ,
		{"back\\\\slash", "back\\slash"},    // ICS \\ → \
	}
	for _, tc := range cases {
		got := unescICS(tc.input)
		if got != tc.want {
			t.Errorf("unescICS(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

// ── handleImportICS (integration) ────────────────────────────────────────────

func buildICSMultipart(t *testing.T, icsContent string) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, err := w.CreateFormFile("data", "calendar.ics")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	fw.Write([]byte(icsContent)) //nolint
	w.Close()
	return &buf, w.FormDataContentType()
}

func TestAPI_ImportICS_Success(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	icsData := "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
		"BEGIN:VEVENT\r\n" +
		"UID:test-001@test\r\n" +
		"SUMMARY:Test ICS Event\r\n" +
		"DTSTART:20240315T100000Z\r\n" +
		"DTEND:20240315T110000Z\r\n" +
		"DESCRIPTION:A test event\r\n" +
		"CATEGORIES:event\r\n" +
		"END:VEVENT\r\n" +
		"END:VCALENDAR\r\n"

	body, ct := buildICSMultipart(t, icsData)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/import/ics", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var result ICSImportResult
	decodeJSON(t, resp, &result)
	if result.Events != 1 {
		t.Errorf("expected 1 event imported, got %d", result.Events)
	}
	if result.Skipped != 0 {
		t.Errorf("expected 0 skipped, got %d", result.Skipped)
	}
}

func TestAPI_ImportICS_AllDay(t *testing.T) {
	app, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	icsData := "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
		"BEGIN:VEVENT\r\n" +
		"UID:allday-001@test\r\n" +
		"SUMMARY:All Day Event\r\n" +
		"DTSTART:20240401\r\n" +
		"DTEND:20240402\r\n" +
		"END:VEVENT\r\n" +
		"END:VCALENDAR\r\n"

	body, ct := buildICSMultipart(t, icsData)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/import/ics", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var result ICSImportResult
	decodeJSON(t, resp, &result)
	if result.Events != 1 {
		t.Fatalf("expected 1 event, got %d", result.Events)
	}
	// Verify the event was stored with AllDay=true
	events := app.store.GetAllEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event in store, got %d", len(events))
	}
	if !events[0].AllDay {
		t.Error("expected AllDay=true for date-only DTSTART")
	}
}

func TestAPI_ImportICS_RecurringEvent(t *testing.T) {
	app, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	icsData := "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
		"BEGIN:VEVENT\r\n" +
		"UID:recur-001@test\r\n" +
		"SUMMARY:Weekly Standup\r\n" +
		"DTSTART:20240101T090000Z\r\n" +
		"DTEND:20240101T093000Z\r\n" +
		"RRULE:FREQ=WEEKLY;UNTIL=20240630T000000Z\r\n" +
		"CATEGORIES:standup\r\n" +
		"END:VEVENT\r\n" +
		"END:VCALENDAR\r\n"

	body, ct := buildICSMultipart(t, icsData)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/import/ics", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	events := app.store.GetAllEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event in store, got %d", len(events))
	}
	ev := events[0]
	if !ev.IsRecurring {
		t.Error("expected IsRecurring=true")
	}
	if ev.RecurrencePattern != "weekly" {
		t.Errorf("expected pattern=weekly, got %q", ev.RecurrencePattern)
	}
	if ev.RecurrenceEnd == nil {
		t.Error("expected RecurrenceEnd to be set")
	}
	if ev.EventType != "standup" {
		t.Errorf("expected event_type=standup, got %q", ev.EventType)
	}
}

func TestAPI_ImportICS_Unauthenticated(t *testing.T) {
	_, srv := newTestApp(t)
	body, ct := buildICSMultipart(t, "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/import/ics", body)
	req.Header.Set("Content-Type", ct)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPI_ImportICS_EmptyCalendar(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	body, ct := buildICSMultipart(t, "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n")
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/import/ics", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var result ICSImportResult
	decodeJSON(t, resp, &result)
	if result.Events != 0 {
		t.Errorf("expected 0 events for empty calendar, got %d", result.Events)
	}
}

func TestAPI_ImportICS_MultipleEvents(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	icsData := "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
		"BEGIN:VEVENT\r\nUID:e1@test\r\nSUMMARY:Event One\r\nDTSTART:20240301T080000Z\r\nDTEND:20240301T090000Z\r\nEND:VEVENT\r\n" +
		"BEGIN:VEVENT\r\nUID:e2@test\r\nSUMMARY:Event Two\r\nDTSTART:20240302T100000Z\r\nDTEND:20240302T110000Z\r\nEND:VEVENT\r\n" +
		"BEGIN:VEVENT\r\nUID:e3@test\r\nSUMMARY:Event Three\r\nDTSTART:20240303T140000Z\r\nDTEND:20240303T150000Z\r\nEND:VEVENT\r\n" +
		"END:VCALENDAR\r\n"

	body, ct := buildICSMultipart(t, icsData)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/import/ics", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var result ICSImportResult
	decodeJSON(t, resp, &result)
	if result.Events != 3 {
		t.Errorf("expected 3 events, got %d", result.Events)
	}
}

func TestAPI_ImportICS_WithLocation(t *testing.T) {
	app, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	icsData := "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
		"BEGIN:VEVENT\r\n" +
		"UID:loc-001@test\r\n" +
		"SUMMARY:On-site meeting\r\n" +
		"DTSTART:20240315T140000Z\r\n" +
		"DTEND:20240315T150000Z\r\n" +
		"LOCATION:Conference Room A\r\n" +
		"CATEGORIES:physical_meeting\r\n" +
		"END:VEVENT\r\n" +
		"END:VCALENDAR\r\n"

	body, ct := buildICSMultipart(t, icsData)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/import/ics", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	events := app.store.GetAllEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].PhysicalLocation != "Conference Room A" {
		t.Errorf("expected location %q, got %q", "Conference Room A", events[0].PhysicalLocation)
	}
	if events[0].EventType != "physical_meeting" {
		t.Errorf("expected event_type=physical_meeting, got %q", events[0].EventType)
	}
}

// ── helper: GetAllEvents for test inspection ──────────────────────────────────

func (s *Store) GetAllEvents() []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Event, len(s.events))
	copy(out, s.events)
	return out
}

