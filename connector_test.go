package main

import (
	"encoding/json"
	"testing"
)

// ── Connector Registry ──────────────────────────────────────────────────────

func TestConnectorRegistry_RegisterAndList(t *testing.T) {
	cr := NewConnectorRegistry()
	cr.Register(NewSTIXConnector())
	cr.Register(NewADatP3Connector())
	cr.Register(NewGitConnector())

	list := cr.List()
	if len(list) != 3 {
		t.Errorf("expected 3 connectors, got %d", len(list))
	}
	names := map[string]bool{}
	for _, c := range list {
		names[c.Name] = true
	}
	for _, want := range []string{"stix_taxii", "nato_adatp3", "github_gitlab"} {
		if !names[want] {
			t.Errorf("expected connector %q in list", want)
		}
	}
}

func TestConnectorRegistry_SetConfigAndGet(t *testing.T) {
	cr := NewConnectorRegistry()
	cr.Register(NewSTIXConnector())

	cfg := ConnectorConfig{
		Name:    "stix_taxii",
		Enabled: true,
		Config:  json.RawMessage(`{"taxii_server_url":"https://taxii.example.com","taxii_collection":"default","ingest_all":true}`),
	}
	if err := cr.SetConfig(cfg); err != nil {
		t.Fatalf("SetConfig: %v", err)
	}

	got, ok := cr.GetConfig("stix_taxii")
	if !ok {
		t.Fatal("expected to find config for stix_taxii")
	}
	if !got.Enabled {
		t.Error("expected config to be enabled")
	}
}

func TestConnectorRegistry_DispatchNoError(t *testing.T) {
	cr := NewConnectorRegistry()
	stix := NewSTIXConnector()
	cr.Register(stix)

	cfg := ConnectorConfig{
		Name:    "stix_taxii",
		Enabled: true,
		Config:  json.RawMessage(`{"export_enabled":false}`),
	}
	cr.SetConfig(cfg) //nolint

	// Should not panic
	ev := Event{ID: 1, Title: "Test"}
	cr.Dispatch(EventBusMessage{Action: ActionCreated, Event: &ev})
}

// ── STIX ────────────────────────────────────────────────────────────────────

func TestNormaliseSTIX(t *testing.T) {
	bundle := `{
		"type": "bundle",
		"id": "bundle--test",
		"objects": [
			{
				"type": "indicator",
				"id": "indicator--001",
				"created": "2024-01-15T10:00:00Z",
				"modified": "2024-01-15T10:00:00Z",
				"name": "Malicious IP",
				"description": "Known C2 server IP",
				"pattern": "[ipv4-addr:value = '198.51.100.1']",
				"labels": ["malicious-activity"]
			},
			{
				"type": "malware",
				"id": "malware--002",
				"created": "2024-01-15T12:00:00Z",
				"modified": "2024-01-15T12:00:00Z",
				"name": "BadBot",
				"description": "RAT malware",
				"labels": ["trojan"]
			}
		]
	}`

	payloads, err := normaliseSTIX([]byte(bundle), "test")
	if err != nil {
		t.Fatalf("normaliseSTIX: %v", err)
	}
	if len(payloads) != 2 {
		t.Fatalf("expected 2 payloads, got %d", len(payloads))
	}

	// First should be indicator
	if payloads[0].Title != "Malicious IP" {
		t.Errorf("expected title 'Malicious IP', got %q", payloads[0].Title)
	}
	if payloads[0].Priority != "high" {
		t.Errorf("expected priority 'high', got %q", payloads[0].Priority)
	}

	// Second should be malware
	if payloads[1].Title != "BadBot" {
		t.Errorf("expected title 'BadBot', got %q", payloads[1].Title)
	}
	if payloads[1].Priority != "critical" {
		t.Errorf("expected priority 'critical', got %q", payloads[1].Priority)
	}
}

func TestEventToSTIXBundle(t *testing.T) {
	events := []Event{
		{ID: 1, Title: "Test Event", EventType: "event", Status: StatusPlanned},
	}
	bundle := EventToSTIXBundle(events)
	if bundle.Type != "bundle" {
		t.Errorf("expected type 'bundle', got %q", bundle.Type)
	}
	if len(bundle.Objects) != 1 {
		t.Errorf("expected 1 object, got %d", len(bundle.Objects))
	}
	if bundle.Objects[0].Name != "Test Event" {
		t.Errorf("expected name 'Test Event', got %q", bundle.Objects[0].Name)
	}
}

// ── ADatP-3 ─────────────────────────────────────────────────────────────────

func TestNormaliseADatP3(t *testing.T) {
	msg := `{
		"msgid": "NATO-001",
		"dtg": "061430ZJUN2024",
		"classification": "NATO UNCLASSIFIED",
		"originator": "SHAPE",
		"recipient": ["JFC-BRUNSSUM"],
		"subject": "Ops Update",
		"msg_type": "SITREP",
		"body": "Situation report content"
	}`

	payloads, err := normaliseADatP3([]byte(msg), "test")
	if err != nil {
		t.Fatalf("normaliseADatP3: %v", err)
	}
	if len(payloads) != 1 {
		t.Fatalf("expected 1 payload, got %d", len(payloads))
	}
	if payloads[0].EventType != "reporting" {
		t.Errorf("expected event type 'reporting', got %q", payloads[0].EventType)
	}
	if payloads[0].ExternalID != "NATO-001" {
		t.Errorf("expected external ID 'NATO-001', got %q", payloads[0].ExternalID)
	}
}

func TestParseDTG(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"061430ZJUN2024", "2024-06-06T14:30:00Z"},
		{"251200ZDEC2023", "2023-12-25T12:00:00Z"},
		{"", ""},
		{"short", ""},
	}
	for _, tc := range tests {
		got := parseDTG(tc.input)
		if tc.want == "" {
			if !got.IsZero() {
				t.Errorf("parseDTG(%q): expected zero time, got %v", tc.input, got)
			}
		} else {
			if got.Format("2006-01-02T15:04:05Z") != tc.want {
				t.Errorf("parseDTG(%q): expected %s, got %s", tc.input, tc.want, got.Format("2006-01-02T15:04:05Z"))
			}
		}
	}
}

func TestEventToADatP3(t *testing.T) {
	ev := Event{ID: 1, Title: "Test", Description: "Desc", EventType: "decision"}
	msg := EventToADatP3(ev, "TIDSLINJAL", "NATO UNCLASSIFIED")
	if msg.MsgType != "FRAGO" {
		t.Errorf("expected FRAGO for decision type, got %q", msg.MsgType)
	}
	if msg.Subject != "Test" {
		t.Errorf("expected subject 'Test', got %q", msg.Subject)
	}
}
