package main

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"
)

// ── Narrative / Storyline handler ─────────────────────────────────────────────

func (app *App) handleNarrative(w http.ResponseWriter, r *http.Request, user *User) {
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	category := r.URL.Query().Get("category") // all, external, operational, security
	var fromTime, toTime time.Time
	if fromStr != "" {
		fromTime, _ = time.Parse(time.RFC3339, fromStr)
	}
	if toStr != "" {
		toTime, _ = time.Parse(time.RFC3339, toStr)
	}
	if fromTime.IsZero() {
		fromTime = time.Now().Add(-24 * time.Hour)
	}
	if toTime.IsZero() {
		toTime = time.Now()
	}

	type NarrativeEntry struct {
		Timestamp   time.Time `json:"timestamp"`
		Type        string    `json:"type"`
		Summary     string    `json:"summary"`
		EntityID    int64     `json:"entity_id,omitempty"`
		EntityType  string    `json:"entity_type,omitempty"`
		UserName    string    `json:"user_name,omitempty"`
		Severity    string    `json:"severity,omitempty"` // info, warning, critical
		Category    string    `json:"category"` // external, operational, security
	}

	var entries []NarrativeEntry

	// Gather events that started/changed in range
	for _, e := range app.store.GetEventsInRange(fromTime, toTime) {
		severity := "info"
		if e.Status == StatusActive {
			severity = "warning"
		}
		entries = append(entries, NarrativeEntry{
			Timestamp:  e.StartTime,
			Type:       "event_started",
			Summary:    fmt.Sprintf("%s: %s", string(e.EventType), e.Title),
			EntityID:   e.ID,
			EntityType: "event",
			UserName:   e.ResponsibleName,
			Severity:   severity,
			Category:   "external",
		})
	}

	// Gather decisions in range
	for _, d := range app.store.GetDecisionLog() {
		if d.Timestamp.After(fromTime) && d.Timestamp.Before(toTime) {
			severity := "info"
			summary := ""
			switch d.Status {
			case "requested":
				summary = fmt.Sprintf("Decision requested: %s", d.Title)
				if d.Title == "" {
					summary = fmt.Sprintf("Decision requested by %s", d.DisplayName)
				}
				severity = "warning"
			case "approved":
				summary = fmt.Sprintf("Decision approved: %s", d.Title)
				if d.Title == "" {
					summary = fmt.Sprintf("Decision approved by %s", d.ReviewedByName)
				}
			case "rejected":
				summary = fmt.Sprintf("Decision denied: %s", d.Title)
				if d.Title == "" {
					summary = fmt.Sprintf("Decision denied by %s", d.ReviewedByName)
				}
				severity = "warning"
			default:
				summary = fmt.Sprintf("Decision made: %s", d.Title)
				if d.Title == "" {
					summary = fmt.Sprintf("Decision by %s", d.DisplayName)
				}
			}
			entries = append(entries, NarrativeEntry{
				Timestamp:  d.Timestamp,
				Type:       "decision_" + d.Status,
				Summary:    summary,
				EntityID:   d.ID,
				EntityType: "decision",
				UserName:   d.DisplayName,
				Severity:   severity,
				Category:   "operational",
			})
		}
	}

	// Gather audit log entries in range
	for _, a := range app.store.GetAudit(500) {
		if a.Timestamp.After(fromTime) && a.Timestamp.Before(toTime) {
			severity := "info"
			entryType := "audit_" + a.Action
			if a.Action == "status_changed" || a.Action == "deleted" {
				severity = "warning"
			}
			cat := "operational"
			if a.Action == "login" || a.Action == "logout" || a.Action == "login_failed" {
				cat = "security"
			} else if a.Action == "co_signed" {
				cat = "security"
			}
			entries = append(entries, NarrativeEntry{
				Timestamp:  a.Timestamp,
				Type:       entryType,
				Summary:    a.Summary,
				EntityID:   a.EntityID,
				EntityType: a.EntityType,
				UserName:   a.UserName,
				Severity:   severity,
				Category:   cat,
			})
		}
	}

	// Sort by timestamp
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Timestamp.Before(entries[j].Timestamp)
	})

	// Filter by category
	if category != "" && category != "all" {
		filtered := make([]NarrativeEntry, 0, len(entries))
		for _, e := range entries {
			if e.Category == category {
				filtered = append(filtered, e)
			}
		}
		entries = filtered
	}

	// Apply limit
	if len(entries) > limit {
		entries = entries[len(entries)-limit:]
	}

	jsonOK(w, entries)
}
