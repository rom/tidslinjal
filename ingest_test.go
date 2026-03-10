package main

import (
	"testing"
)

func TestDetectFormat_STIX(t *testing.T) {
	data := []byte(`{"type":"bundle","id":"bundle--test","objects":[]}`)
	if got := detectFormat(data); got != FormatSTIX {
		t.Errorf("expected stix, got %s", got)
	}
}

func TestDetectFormat_ADatP3(t *testing.T) {
	data := []byte(`{"msgid":"NATO-001","dtg":"061430ZJUN2024","body":"test"}`)
	if got := detectFormat(data); got != FormatADatP3 {
		t.Errorf("expected adatp3, got %s", got)
	}
}

func TestDetectFormat_Syslog(t *testing.T) {
	data := []byte(`{"facility":1,"severity":5,"message":"test log","hostname":"srv01"}`)
	if got := detectFormat(data); got != FormatSyslog {
		t.Errorf("expected syslog, got %s", got)
	}
}

func TestDetectFormat_JSON(t *testing.T) {
	data := []byte(`{"title":"My Event","description":"Something happened"}`)
	if got := detectFormat(data); got != FormatJSON {
		t.Errorf("expected json, got %s", got)
	}
}

func TestDetectFormat_ICalendar(t *testing.T) {
	data := []byte("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Test\nEND:VEVENT\nEND:VCALENDAR")
	if got := detectFormat(data); got != FormatICalendar {
		t.Errorf("expected ical, got %s", got)
	}
}

func TestNormaliseSyslog_JSON(t *testing.T) {
	data := []byte(`{"facility":1,"severity":3,"message":"Critical error","hostname":"db01","app_name":"postgres","timestamp":"2024-06-01T12:00:00Z"}`)
	payloads, err := normaliseSyslog(data, "test")
	if err != nil {
		t.Fatalf("normaliseSyslog: %v", err)
	}
	if len(payloads) != 1 {
		t.Fatalf("expected 1 payload, got %d", len(payloads))
	}
	if payloads[0].Priority != "critical" {
		t.Errorf("expected priority 'critical', got %q", payloads[0].Priority)
	}
}

func TestNormaliseJSON(t *testing.T) {
	data := []byte(`{"title":"Ingested Event","description":"From external","event_type":"reporting","priority":"high"}`)
	payloads, err := normaliseJSON(data, "api")
	if err != nil {
		t.Fatalf("normaliseJSON: %v", err)
	}
	if len(payloads) != 1 {
		t.Fatalf("expected 1 payload, got %d", len(payloads))
	}
	if payloads[0].Title != "Ingested Event" {
		t.Errorf("expected title 'Ingested Event', got %q", payloads[0].Title)
	}
}

func TestNormaliseGeneric(t *testing.T) {
	data := []byte("some unknown data format")
	payloads, err := normaliseGeneric(data, "unknown")
	if err != nil {
		t.Fatalf("normaliseGeneric: %v", err)
	}
	if len(payloads) != 1 {
		t.Fatalf("expected 1 payload, got %d", len(payloads))
	}
	if payloads[0].Source != "unknown" {
		t.Errorf("expected source 'unknown', got %q", payloads[0].Source)
	}
}

func TestTruncate(t *testing.T) {
	tests := []struct {
		input  string
		maxLen int
		want   string
	}{
		{"short", 10, "short"},
		{"a very long string indeed", 10, "a very lo…"},
		{"", 5, ""},
		{"exact", 5, "exact"},
	}
	for _, tc := range tests {
		got := truncate(tc.input, tc.maxLen)
		if got != tc.want {
			t.Errorf("truncate(%q, %d): expected %q, got %q", tc.input, tc.maxLen, tc.want, got)
		}
	}
}
