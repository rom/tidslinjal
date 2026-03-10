package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"
)

// ── NATO ADatP-3 / MIP / ODB Connector ─────────────────────────────────────
// Supports ingestion and generation of ADatP-3 formatted messages and
// MIP (Multilateral Interoperability Programme) data exchange.

// ADatP3Connector implements the Connector interface for NATO message formats.
type ADatP3Connector struct {
	mu      sync.RWMutex
	cfg     ADatP3Config
	enabled bool
}

// ADatP3Config configures the NATO message connector.
type ADatP3Config struct {
	// ODB (Operational Database) endpoint for MIP sync
	ODBEndpoint string `json:"odb_endpoint,omitempty"`
	ODBUsername string `json:"odb_username,omitempty"`
	ODBPassword string `json:"odb_password,omitempty"`

	// Message handling
	IngestOPORD   bool `json:"ingest_opord"`   // Operational Orders
	IngestFRAGO   bool `json:"ingest_frago"`   // Fragmentary Orders
	IngestINTSUM  bool `json:"ingest_intsum"`  // Intelligence Summaries
	IngestSITREP  bool `json:"ingest_sitrep"`  // Situation Reports
	IngestOPSUM   bool `json:"ingest_opsum"`   // Operations Summaries
	IngestAll     bool `json:"ingest_all"`     // All message types

	// Export: generate ADatP-3 formatted messages from timeline events
	ExportEnabled bool   `json:"export_enabled"`
	Originator    string `json:"originator,omitempty"`    // e.g. "NATO SHAPE"
	Classification string `json:"classification,omitempty"` // NATO UNCLASSIFIED | RESTRICTED | etc.
}

// ADatP3Message represents a NATO ADatP-3 formatted message.
type ADatP3Message struct {
	MsgID          string   `json:"msgid"`          // message identifier
	DTG            string   `json:"dtg"`            // date-time group (DDHHMMZMmmYYYY)
	Classification string   `json:"classification"` // security classification
	Originator     string   `json:"originator"`     // sending unit/HQ
	Recipient      []string `json:"recipient"`      // TO: addresses
	Info           []string `json:"info,omitempty"`  // INFO: addresses
	Subject        string   `json:"subject"`
	MsgType        string   `json:"msg_type"`       // OPORD | FRAGO | INTSUM | SITREP | OPSUM
	Body           string   `json:"body"`
	References     []string `json:"references,omitempty"`
	// MIP fields
	MIPID          string            `json:"mip_id,omitempty"` // MIP object identifier
	MIPType        string            `json:"mip_type,omitempty"`
	MIPAttributes  map[string]string `json:"mip_attributes,omitempty"`
}

func NewADatP3Connector() *ADatP3Connector {
	return &ADatP3Connector{}
}

func (c *ADatP3Connector) Name() string { return "nato_adatp3" }

func (c *ADatP3Connector) Enabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *ADatP3Connector) Init(cfg json.RawMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := json.Unmarshal(cfg, &c.cfg); err != nil {
		return fmt.Errorf("invalid ADatP-3 config: %w", err)
	}
	c.enabled = true
	return nil
}

func (c *ADatP3Connector) OnEvent(ev EventBusMessage) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if !c.cfg.ExportEnabled {
		return
	}
	// In production, this would format the event as an ADatP-3 message
	// and send it to the configured recipients/ODB.
}

func (c *ADatP3Connector) Poll(app *App) ([]IngestPayload, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	if cfg.ODBEndpoint == "" {
		return nil, nil
	}
	// In production, this would query the ODB endpoint for new/updated objects
	// and convert them to IngestPayloads.
	return nil, nil
}

// normaliseADatP3 converts an ADatP-3 message into IngestPayloads.
func normaliseADatP3(data []byte, source string) ([]IngestPayload, error) {
	var msg ADatP3Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, fmt.Errorf("invalid ADatP-3 message: %w", err)
	}

	// Map message type to event type and priority
	eventType := "event"
	priority := "medium"
	switch strings.ToUpper(msg.MsgType) {
	case "OPORD":
		eventType = "decision"
		priority = "high"
	case "FRAGO":
		eventType = "decision"
		priority = "critical"
	case "INTSUM":
		eventType = "reporting"
		priority = "high"
	case "SITREP":
		eventType = "reporting"
		priority = "medium"
	case "OPSUM":
		eventType = "reporting"
		priority = "medium"
	}

	// Parse DTG (Date-Time Group: DDHHMMZMmmYYYY)
	var startTime time.Time
	if msg.DTG != "" {
		startTime = parseDTG(msg.DTG)
	}
	if startTime.IsZero() {
		startTime = time.Now()
	}

	title := fmt.Sprintf("[%s] %s", msg.MsgType, msg.Subject)
	desc := msg.Body
	if len(msg.References) > 0 {
		desc += "\n\nReferences: " + strings.Join(msg.References, ", ")
	}

	tags := []string{"nato", "adatp3", strings.ToLower(msg.MsgType)}
	if msg.Classification != "" {
		tags = append(tags, msg.Classification)
	}

	metadata := map[string]string{
		"msgid":          msg.MsgID,
		"dtg":            msg.DTG,
		"classification": msg.Classification,
		"originator":     msg.Originator,
		"msg_type":       msg.MsgType,
	}
	if msg.MIPID != "" {
		metadata["mip_id"] = msg.MIPID
		metadata["mip_type"] = msg.MIPType
	}

	p := IngestPayload{
		Format:      FormatADatP3,
		Source:      source,
		ExternalID:  msg.MsgID,
		Title:       title,
		Description: desc,
		EventType:   eventType,
		Priority:    priority,
		Tags:        tags,
		StartTime:   &startTime,
		Metadata:    metadata,
		RawPayload:  data,
	}
	return []IngestPayload{p}, nil
}

// parseDTG parses a NATO Date-Time Group (e.g. "061430ZJUN2024").
func parseDTG(dtg string) time.Time {
	dtg = strings.TrimSpace(strings.ToUpper(dtg))
	if len(dtg) < 13 {
		return time.Time{}
	}

	// Format: DDHHMMZMmmYYYY
	months := map[string]time.Month{
		"JAN": time.January, "FEB": time.February, "MAR": time.March,
		"APR": time.April, "MAY": time.May, "JUN": time.June,
		"JUL": time.July, "AUG": time.August, "SEP": time.September,
		"OCT": time.October, "NOV": time.November, "DEC": time.December,
	}

	day := parseInt(dtg[0:2])
	hour := parseInt(dtg[2:4])
	minute := parseInt(dtg[4:6])
	// Skip timezone letter at position 6
	monthStr := dtg[7:10]
	year := parseInt(dtg[10:14])

	month, ok := months[monthStr]
	if !ok || day == 0 || year == 0 {
		return time.Time{}
	}

	return time.Date(year, month, day, hour, minute, 0, 0, time.UTC)
}

// parseInt is a simple integer parser that returns 0 on error.
func parseInt(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// EventToADatP3 converts a timeline event to an ADatP-3 message.
func EventToADatP3(ev Event, originator, classification string) ADatP3Message {
	now := time.Now().UTC()
	dtg := fmt.Sprintf("%02d%02d%02dZ%s%04d",
		now.Day(), now.Hour(), now.Minute(),
		strings.ToUpper(now.Month().String()[:3]), now.Year())

	msgType := "SITREP"
	switch ev.EventType {
	case "decision":
		msgType = "FRAGO"
	case "reporting":
		msgType = "SITREP"
	case "activity":
		msgType = "OPSUM"
	}

	return ADatP3Message{
		MsgID:          fmt.Sprintf("TIDSLINJAL-%d-%d", ev.ID, now.Unix()),
		DTG:            dtg,
		Classification: classification,
		Originator:     originator,
		Subject:        ev.Title,
		MsgType:        msgType,
		Body:           ev.Description,
	}
}
