package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// ── Inbound Ingestion API ───────────────────────────────────────────────────
// POST /api/ingest — single endpoint with format detection that normalises
// incoming data from multiple sources into timeline events.

// IngestFormat identifies the detected payload format.
type IngestFormat string

const (
	FormatJSON      IngestFormat = "json"
	FormatSTIX      IngestFormat = "stix"
	FormatSyslog    IngestFormat = "syslog"
	FormatICalendar IngestFormat = "ical"
	FormatADatP3    IngestFormat = "adatp3"
	FormatGeneric   IngestFormat = "generic"
)

// IngestPayload is the normalised internal representation of an ingested message.
type IngestPayload struct {
	Format      IngestFormat      `json:"format"`
	Source      string            `json:"source"`       // originating system/connector
	ExternalID  string            `json:"external_id"`  // ID in the source system
	Title       string            `json:"title"`
	Description string            `json:"description"`
	EventType   string            `json:"event_type"`   // mapped to Tidslinjal event type key
	Priority    string            `json:"priority"`     // low | medium | high | critical
	Tags        []string          `json:"tags"`
	StartTime   *time.Time        `json:"start_time"`
	EndTime     *time.Time        `json:"end_time"`
	Metadata    map[string]string `json:"metadata"`     // arbitrary key-value pairs
	RawPayload  json.RawMessage   `json:"raw_payload"`  // original payload for audit
}

// IngestResult is the response from POST /api/ingest.
type IngestResult struct {
	Accepted int      `json:"accepted"`
	Routed   int      `json:"routed"`
	EventIDs []int64  `json:"event_ids,omitempty"`
	Errors   []string `json:"errors,omitempty"`
}

// detectFormat examines the raw JSON to determine the payload format.
func detectFormat(data []byte) IngestFormat {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(data, &probe); err != nil {
		// Try as plain text syslog
		s := strings.TrimSpace(string(data))
		if len(s) > 0 && s[0] == '<' {
			return FormatSyslog
		}
		if strings.HasPrefix(s, "BEGIN:VCALENDAR") {
			return FormatICalendar
		}
		return FormatGeneric
	}
	// STIX 2.1 bundle detection
	if t, ok := probe["type"]; ok {
		var typ string
		json.Unmarshal(t, &typ) //nolint
		if typ == "bundle" {
			return FormatSTIX
		}
	}
	// ADatP-3 detection (has "msgid" and "dtg" fields typical of NATO messages)
	if _, hasMsgID := probe["msgid"]; hasMsgID {
		if _, hasDTG := probe["dtg"]; hasDTG {
			return FormatADatP3
		}
	}
	// Syslog JSON detection
	if _, hasFacility := probe["facility"]; hasFacility {
		if _, hasMsg := probe["message"]; hasMsg {
			return FormatSyslog
		}
	}
	// Default: treat as generic JSON payload
	if _, hasTitle := probe["title"]; hasTitle {
		return FormatJSON
	}
	return FormatGeneric
}

// normalisePayload converts raw ingested data into one or more IngestPayloads.
func normalisePayload(data []byte, format IngestFormat, source string) ([]IngestPayload, error) {
	switch format {
	case FormatSTIX:
		return normaliseSTIX(data, source)
	case FormatSyslog:
		return normaliseSyslog(data, source)
	case FormatICalendar:
		return normaliseICalIngest(data, source)
	case FormatADatP3:
		return normaliseADatP3(data, source)
	case FormatJSON:
		return normaliseJSON(data, source)
	default:
		return normaliseGeneric(data, source)
	}
}

// normaliseJSON handles direct JSON payloads (already in our format).
func normaliseJSON(data []byte, source string) ([]IngestPayload, error) {
	var p IngestPayload
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("invalid JSON payload: %w", err)
	}
	p.Format = FormatJSON
	if p.Source == "" {
		p.Source = source
	}
	p.RawPayload = data
	return []IngestPayload{p}, nil
}

// normaliseGeneric wraps unknown payload as a generic event.
func normaliseGeneric(data []byte, source string) ([]IngestPayload, error) {
	p := IngestPayload{
		Format:      FormatGeneric,
		Source:      source,
		Title:       fmt.Sprintf("Ingested from %s", source),
		Description: string(data),
		EventType:   "event",
		Priority:    "medium",
		RawPayload:  data,
	}
	now := time.Now()
	p.StartTime = &now
	return []IngestPayload{p}, nil
}

// normaliseSyslog converts syslog JSON or RFC3164 into IngestPayload.
func normaliseSyslog(data []byte, source string) ([]IngestPayload, error) {
	var slog struct {
		Facility int    `json:"facility"`
		Severity int    `json:"severity"`
		Message  string `json:"message"`
		Hostname string `json:"hostname"`
		AppName  string `json:"app_name"`
		Timestamp string `json:"timestamp"`
	}
	if err := json.Unmarshal(data, &slog); err != nil {
		// Treat as raw syslog text
		p := IngestPayload{
			Format:      FormatSyslog,
			Source:      source,
			Title:       "Syslog message",
			Description: string(data),
			EventType:   "event",
			Priority:    "medium",
			RawPayload:  data,
		}
		now := time.Now()
		p.StartTime = &now
		return []IngestPayload{p}, nil
	}

	priority := "medium"
	if slog.Severity <= 3 {
		priority = "critical"
	} else if slog.Severity <= 4 {
		priority = "high"
	} else if slog.Severity >= 7 {
		priority = "low"
	}

	title := fmt.Sprintf("[%s] %s", slog.AppName, truncate(slog.Message, 80))
	p := IngestPayload{
		Format:      FormatSyslog,
		Source:      source,
		Title:       title,
		Description: slog.Message,
		EventType:   "event",
		Priority:    priority,
		Tags:        []string{"syslog", slog.Hostname},
		Metadata: map[string]string{
			"hostname": slog.Hostname,
			"app_name": slog.AppName,
			"facility": fmt.Sprintf("%d", slog.Facility),
			"severity": fmt.Sprintf("%d", slog.Severity),
		},
		RawPayload: data,
	}
	now := time.Now()
	if slog.Timestamp != "" {
		if t, err := time.Parse(time.RFC3339, slog.Timestamp); err == nil {
			p.StartTime = &t
		}
	}
	if p.StartTime == nil {
		p.StartTime = &now
	}
	return []IngestPayload{p}, nil
}

// normaliseICalIngest parses iCalendar data into IngestPayloads.
func normaliseICalIngest(data []byte, source string) ([]IngestPayload, error) {
	lines := parseICSLines(data)
	var payloads []IngestPayload
	var inEvent bool
	var uid, summary, description, location string
	var start, end time.Time

	for _, line := range lines {
		if line == "BEGIN:VEVENT" {
			inEvent = true
			uid, summary, description, location = "", "", "", ""
			start, end = time.Time{}, time.Time{}
			continue
		}
		if line == "END:VEVENT" && inEvent {
			inEvent = false
			if summary == "" {
				summary = "Untitled event"
			}
			p := IngestPayload{
				Format:      FormatICalendar,
				Source:      source,
				ExternalID:  uid,
				Title:       summary,
				Description: description,
				EventType:   "event",
				Priority:    "medium",
				RawPayload:  data,
			}
			if !start.IsZero() {
				t := start
				p.StartTime = &t
			}
			if !end.IsZero() {
				t := end
				p.EndTime = &t
			}
			if location != "" {
				p.Metadata = map[string]string{"location": location}
			}
			payloads = append(payloads, p)
			continue
		}
		if !inEvent {
			continue
		}
		key, val := splitICSProp(line)
		switch key {
		case "UID":
			uid = val
		case "SUMMARY":
			summary = val
		case "DESCRIPTION":
			description = val
		case "LOCATION":
			location = val
		case "DTSTART":
			start, _, _ = parseICSTime(val)
		case "DTEND":
			end, _, _ = parseICSTime(val)
		}
	}
	if len(payloads) == 0 {
		return nil, fmt.Errorf("no events found in iCalendar data")
	}
	return payloads, nil
}

// splitICSProp splits "KEY;params:value" into (KEY, value).
func splitICSProp(line string) (string, string) {
	colonIdx := strings.IndexByte(line, ':')
	if colonIdx < 0 {
		return line, ""
	}
	keyPart := line[:colonIdx]
	val := line[colonIdx+1:]
	if semiIdx := strings.IndexByte(keyPart, ';'); semiIdx >= 0 {
		keyPart = keyPart[:semiIdx]
	}
	return strings.ToUpper(keyPart), val
}

// processIngestPayload creates a timeline event from an IngestPayload and
// runs it through the message routing engine.
func (app *App) processIngestPayload(p IngestPayload) *Event {
	now := time.Now()
	startTime := now
	if p.StartTime != nil {
		startTime = *p.StartTime
	}

	// M-08 fix: sanitize ingested text fields to prevent stored XSS
	ev := Event{
		Title:       stripHTMLTags(p.Title),
		Description: stripHTMLTags(p.Description),
		EventType:   p.EventType,
		Status:      StatusPlanned,
		StartTime:   startTime,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if p.EndTime != nil {
		ev.EndTime = p.EndTime
	}
	if ev.EventType == "" {
		ev.EventType = "event"
	}

	created, err := app.store.CreateEvent(ev)
	if err != nil {
		log.Printf("[WARN] ingest: failed to create event from %s: %v", p.Source, err)
		logDebug("ingest: failed to create event from source=%q title=%q: %v", p.Source, p.Title, err)
		return nil
	}
	logDebug("ingest: created event id=%d from source=%q title=%q format=%s", created.ID, p.Source, p.Title, p.Format)

	// Run through message routing
	app.routeIngestedMessage(p, &created)

	// Publish to event bus
	app.eventBus.Publish(EventBusMessage{
		Action: ActionCreated,
		Event:  &created,
	})

	// Broadcast via SSE
	app.broadcastEventChange(0, "created", &created)

	// Audit
	app.store.LogAudit(AuditEntry{
		Action:     "created",
		EntityType: "event",
		EntityID:   created.ID,
		Summary:    fmt.Sprintf("Ingested from %s: %s", p.Source, p.Title),
	})

	return &created
}

// handleIngest handles POST /api/ingest.
func (app *App) handleIngest(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20)) // 10 MB limit
	if err != nil {
		http.Error(w, "Request too large", http.StatusRequestEntityTooLarge)
		return
	}
	defer r.Body.Close()

	source := r.URL.Query().Get("source")
	if source == "" {
		source = "api"
	}
	formatHint := r.URL.Query().Get("format")
	logDebug("ingest: received %d bytes from source=%q format=%q user=%s", len(body), source, formatHint, user.Username)

	var format IngestFormat
	if formatHint != "" {
		format = IngestFormat(formatHint)
	} else {
		format = detectFormat(body)
	}

	payloads, err := normalisePayload(body, format, source)
	if err != nil {
		jsonError(w, fmt.Sprintf("Failed to parse payload: %v", err), http.StatusBadRequest)
		return
	}

	result := IngestResult{}
	for _, p := range payloads {
		ev := app.processIngestPayload(p)
		if ev != nil {
			result.Accepted++
			result.EventIDs = append(result.EventIDs, ev.ID)
		} else {
			result.Errors = append(result.Errors, fmt.Sprintf("failed to ingest: %s", p.Title))
		}
	}
	result.Routed = result.Accepted // all accepted events are routed
	// Log ingest event to event log
	status := "success"
	if len(result.Errors) > 0 {
		status = "partial"
	}
	if result.Accepted == 0 && len(result.Errors) > 0 {
		status = "failed"
	}
	app.store.AddEventLogEntry(EventLogEntry{
		Source:   "ingest:" + source,
		Message:  fmt.Sprintf("Ingest via %s: %d accepted, %d errors (format: %s, IP: %s)", source, result.Accepted, len(result.Errors), format, clientIP(r)),
		Summary:  status,
		UserName: user.DisplayName,
		UserID:   user.ID,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "log_change", Data: `{"type":"event_log"}`})
	jsonOK(w, result)
}

// truncate shortens a string to maxLen, appending "…" if truncated.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-1] + "…"
}
