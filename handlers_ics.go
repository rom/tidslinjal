package main

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// handleExportICS exports events as ICS/iCal format
func (app *App) handleExportICS(w http.ResponseWriter, r *http.Request, user *User) {
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	var from, to time.Time
	if fromStr != "" {
		from, _ = time.Parse(time.RFC3339, fromStr)
	}
	if toStr != "" {
		to, _ = time.Parse(time.RFC3339, toStr)
	}
	if from.IsZero() {
		from = time.Now().Add(-30 * 24 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now().Add(90 * 24 * time.Hour)
	}

	// V3-H02 fix: filter events by layer visibility
	events := filterVisibleEvents(app.store.GetEventsInRange(from, to), app.visibleLayerSet(user))

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="tidslinjal.ics"`)

	fmt.Fprint(w, "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tidslinjal//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n")
	for _, ev := range events {
		evEnd := ev.EndTime
		if evEnd == nil {
			end := ev.StartTime.Add(time.Hour)
			evEnd = &end
		}
		fmt.Fprintf(w, "BEGIN:VEVENT\r\nUID:tidslinjal-%d@tidslinjal\r\nDTSTAMP:%s\r\nDTSTART:%s\r\nDTEND:%s\r\nSUMMARY:%s\r\n",
			ev.ID,
			ev.CreatedAt.UTC().Format("20060102T150405Z"),
			ev.StartTime.UTC().Format("20060102T150405Z"),
			evEnd.UTC().Format("20060102T150405Z"),
			escICS(ev.Title))
		if ev.Description != "" {
			fmt.Fprintf(w, "DESCRIPTION:%s\r\n", escICS(ev.Description))
		}
		fmt.Fprint(w, "END:VEVENT\r\n")
	}
	fmt.Fprint(w, "END:VCALENDAR\r\n")
}

func escICS(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, ";", "\\;")
	s = strings.ReplaceAll(s, ",", "\\,")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

// unescICS reverses ICS text escaping.
func unescICS(s string) string {
	s = strings.ReplaceAll(s, "\\n", "\n")
	s = strings.ReplaceAll(s, "\\,", ",")
	s = strings.ReplaceAll(s, "\\;", ";")
	s = strings.ReplaceAll(s, "\\\\", "\\")
	return s
}

// parseICSTime parses iCalendar DTSTART/DTEND values which may be:
//   - 20060102T150405Z  (UTC datetime)
//   - 20060102T150405   (local/floating datetime)
//   - 20060102          (date-only, all-day)
func parseICSTime(val string) (time.Time, bool, error) {
	// Strip TZID and other parameters from property (value is after the last colon in the property line,
	// but we only receive the raw value here after the first ':').
	val = strings.TrimSpace(val)
	if len(val) == 8 {
		// DATE only: YYYYMMDD
		t, err := time.Parse("20060102", val)
		return t, true, err
	}
	if strings.HasSuffix(val, "Z") {
		t, err := time.Parse("20060102T150405Z", val)
		return t, false, err
	}
	t, err := time.Parse("20060102T150405", val)
	return t, false, err
}

// icsEventTypeFromCategories maps CATEGORIES strings to a known EventType key.
func icsEventTypeFromCategories(cats string) string {
	known := map[string]string{
		"event": "event", "händelse": "event", "evenement": "event",
		"instant": "instant", "ögonblick": "instant",
		"mote": "mote", "meeting": "mote", "möte": "mote", "reunion": "mote", "réunion": "mote",
		"decision": "decision", "beslut": "decision", "décision": "decision",
		"deadline": "deadline", "tidsgräns": "deadline", "échéance": "deadline", "echeance": "deadline",
		"activity": "activity", "aktivitet": "activity", "activité": "activity", "activite": "activity",
		"repeated": "repeated", "upprepande": "repeated", "récurrent": "repeated", "recurrent": "repeated",
		"reporting": "reporting", "rapportering": "reporting", "rapport": "reporting",
		"assigned_task": "assigned_task", "tilldelad uppgift": "assigned_task", "tâche assignée": "assigned_task",
		"standup": "standup", "standup meeting": "standup", "daglig standup": "standup",
		"physical_meeting": "physical_meeting", "physical meeting": "physical_meeting", "fysiskt möte": "physical_meeting",
	}
	for _, cat := range strings.Split(cats, ",") {
		if key, ok := known[strings.ToLower(strings.TrimSpace(unescICS(cat)))]; ok {
			return key
		}
	}
	return "event"
}

// icsRRuleToPattern maps an RRULE value to a RecurrencePattern string.
func icsRRuleToPattern(rrule string) (string, *time.Time) {
	parts := make(map[string]string)
	for _, p := range strings.Split(rrule, ";") {
		kv := strings.SplitN(p, "=", 2)
		if len(kv) == 2 {
			parts[kv[0]] = kv[1]
		}
	}
	freq := parts["FREQ"]
	interval := parts["INTERVAL"]

	var recEnd *time.Time
	if until := parts["UNTIL"]; until != "" {
		t, _, err := parseICSTime(until)
		if err == nil {
			recEnd = &t
		}
	}

	switch freq {
	case "MINUTELY":
		switch interval {
		case "15":
			return "15min", recEnd
		case "30":
			return "30min", recEnd
		}
	case "HOURLY":
		switch interval {
		case "", "1":
			return "hourly", recEnd
		case "2":
			return "2hours", recEnd
		case "3":
			return "3hours", recEnd
		case "4":
			return "4hours", recEnd
		}
	case "DAILY":
		return "daily", recEnd
	case "WEEKLY":
		return "weekly", recEnd
	case "MONTHLY":
		if interval == "3" {
			return "quarterly", recEnd
		}
		return "monthly", recEnd
	}
	return "", recEnd
}

// parseICSLines unfolds ICS content lines (RFC 5545 line folding: CRLF + SPACE/TAB continues).
func parseICSLines(data []byte) []string {
	raw := strings.ReplaceAll(string(data), "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	var unfolded []string
	for _, line := range strings.Split(raw, "\n") {
		if len(line) == 0 {
			continue
		}
		if (line[0] == ' ' || line[0] == '\t') && len(unfolded) > 0 {
			unfolded[len(unfolded)-1] += line[1:]
		} else {
			unfolded = append(unfolded, line)
		}
	}
	return unfolded
}

// ICSImportResult holds counts from an ICS import operation.
type ICSImportResult struct {
	Events  int `json:"events"`
	Skipped int `json:"skipped"`
}

func (app *App) handleImportICS(w http.ResponseWriter, r *http.Request, user *User) {
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		jsonError(w, "failed to parse form (max 20MB)", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("data")
	if err != nil {
		jsonError(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "failed to read file", http.StatusBadRequest)
		return
	}

	lines := parseICSLines(raw)

	result := ICSImportResult{}
	inEvent := false
	// Per-event scratch state
	var (
		summary     string
		description string
		dtstart     string
		dtend       string
		location    string
		categories  string
		rrule       string
		uid         string
	)
	reset := func() {
		summary, description, dtstart, dtend, location, categories, rrule, uid = "", "", "", "", "", "", "", ""
	}

	for _, line := range lines {
		switch {
		case line == "BEGIN:VEVENT":
			inEvent = true
			reset()
		case line == "END:VEVENT":
			if !inEvent {
				break
			}
			inEvent = false

			if summary == "" && uid == "" {
				result.Skipped++
				break
			}

			startT, allDay, err := parseICSTime(dtstart)
			if err != nil || startT.IsZero() {
				result.Skipped++
				break
			}

			ev := Event{
				Title:         unescICS(summary),
				Description:   unescICS(description),
				EventType:     icsEventTypeFromCategories(categories),
				Status:        StatusPlanned,
				StartTime:     startT,
				AllDay:        allDay,
				CreatedBy:     user.ID,
				CreatedByName: user.DisplayName,
			}

			if dtend != "" {
				endT, _, err := parseICSTime(dtend)
				if err == nil && !endT.IsZero() && endT.After(startT) {
					ev.EndTime = &endT
				}
			}
			if location != "" {
				ev.PhysicalLocation = unescICS(location)
			}
			if rrule != "" {
				pattern, recEnd := icsRRuleToPattern(rrule)
				if pattern != "" {
					ev.IsRecurring = true
					ev.RecurrencePattern = pattern
					ev.RecurrenceEnd = recEnd
				}
			}

			if _, err := app.store.CreateEvent(ev); err != nil {
				result.Skipped++
			} else {
				result.Events++
			}

		default:
			if !inEvent {
				break
			}
			// Split property name (possibly with params) from value
			idx := strings.IndexByte(line, ':')
			if idx < 0 {
				break
			}
			prop := line[:idx]
			val := line[idx+1:]
			// Property name is the part before any ';'
			propName := strings.ToUpper(strings.SplitN(prop, ";", 2)[0])
			switch propName {
			case "SUMMARY":
				summary = val
			case "DESCRIPTION":
				description = val
			case "DTSTART":
				dtstart = val
			case "DTEND":
				dtend = val
			case "LOCATION":
				location = val
			case "CATEGORIES":
				categories = val
			case "RRULE":
				rrule = val
			case "UID":
				uid = val
			}
		}
	}

	app.audit(user.ID, user.DisplayName, "imported", "ics", 0,
		fmt.Sprintf("ICS import: events=%d skipped=%d", result.Events, result.Skipped))
	jsonOK(w, result)
}
