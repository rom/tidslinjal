package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ── Digest handler ──────────────────────────────────────────────────────────

func (app *App) handleSendDigest(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		WebhookURL  string `json:"webhook_url"`
		WebhookType string `json:"webhook_type"` // "mattermost" | "slack"
		Period      string `json:"period"`        // "last_hour" | "last_4h" | "last_12h" | "last_24h"
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.WebhookURL == "" {
		jsonError(w, "webhook_url is required", http.StatusBadRequest)
		return
	}
	// V-08 fix: validate webhook URL to prevent SSRF
	if err := validateWebhookURL(req.WebhookURL); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.WebhookType == "" {
		req.WebhookType = "mattermost"
	}

	var duration time.Duration
	switch req.Period {
	case "last_hour":
		duration = time.Hour
	case "last_4h":
		duration = 4 * time.Hour
	case "last_12h":
		duration = 12 * time.Hour
	case "last_24h", "":
		duration = 24 * time.Hour
	default:
		jsonError(w, "invalid period", http.StatusBadRequest)
		return
	}

	now := time.Now()
	cutoff := now.Add(-duration)

	// V3-H02 fix: filter events by layer visibility
	events := app.visibleEvents(user)
	statusCounts := make(map[string]int)
	eventCount := 0
	for _, ev := range events {
		if ev.StartTime.After(cutoff) || ev.UpdatedAt.After(cutoff) {
			eventCount++
			statusCounts[string(ev.Status)]++
		}
	}

	// Gather decisions in period
	decisions := app.store.GetDecisionLog()
	pendingDecisions := 0
	approvedDecisions := 0
	deniedDecisions := 0
	for _, d := range decisions {
		if d.Timestamp.After(cutoff) {
			switch d.Status {
			case "requested":
				pendingDecisions++
			case "approved":
				approvedDecisions++
			case "rejected":
				deniedDecisions++
			}
		}
	}

	// Active alarms
	activeAlarms := app.store.GetActiveAlarms()

	// Top activity by users
	userActivity := make(map[string]int)
	auditEntries := app.store.GetAudit(500)
	for _, a := range auditEntries {
		if a.Timestamp.After(cutoff) && a.UserName != "" {
			userActivity[a.UserName]++
		}
	}
	topUsers := topN(userActivity, 5)

	// Build digest message
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Operations Digest (%s)\n\n", req.Period))
	sb.WriteString(fmt.Sprintf("**Events:** %d total\n", eventCount))
	for status, count := range statusCounts {
		sb.WriteString(fmt.Sprintf("- %s: %d\n", status, count))
	}
	sb.WriteString(fmt.Sprintf("\n**Decisions:** pending=%d, approved=%d, denied=%d\n", pendingDecisions, approvedDecisions, deniedDecisions))
	sb.WriteString(fmt.Sprintf("**Active Alarms:** %d\n", len(activeAlarms)))
	if len(topUsers) > 0 {
		sb.WriteString("\n**Top Activity:**\n")
		for _, u := range topUsers {
			sb.WriteString(fmt.Sprintf("- %s: %v actions\n", u["name"], u["count"]))
		}
	}

	text := sb.String()
	body, _ := json.Marshal(map[string]string{"text": text})
	app.enqueueWebhook(req.WebhookType, req.WebhookURL, body)

	jsonOK(w, map[string]string{"status": "sent"})
}

// ── Jira Stats handler ──────────────────────────────────────────────────────

func (app *App) handleJiraStats(w http.ResponseWriter, r *http.Request, user *User) {
	// Find the jira connector from the registry
	app.connectors.mu.RLock()
	c, ok := app.connectors.connectors["jira"]
	app.connectors.mu.RUnlock()
	if !ok {
		jsonError(w, "jira connector not registered", http.StatusNotFound)
		return
	}
	jc, ok := c.(*JiraConnector)
	if !ok {
		jsonError(w, "jira connector type error", http.StatusInternalServerError)
		return
	}
	if !jc.Enabled() {
		jsonError(w, "jira connector is not enabled", http.StatusBadRequest)
		return
	}
	stats, err := jc.SyncStats()
	if err != nil {
		jsonError(w, fmt.Sprintf("jira stats failed: %v", err), http.StatusInternalServerError)
		return
	}
	jsonOK(w, stats)
}
