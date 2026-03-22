package main

import (
	"net/http"
	"time"
)

// handleDashboardData returns all data needed for the dashboard widgets in one call.
func (app *App) handleDashboardData(w http.ResponseWriter, r *http.Request, user *User) {
	now := time.Now()

	// ── 1. Urgent TeamLead requests (from audit log) ────────────────────────
	urgentRequests := []map[string]any{}
	auditEntries := app.store.GetAudit(100)
	cutoff24h := now.Add(-24 * time.Hour)
	for _, a := range auditEntries {
		if a.Timestamp.Before(cutoff24h) {
			continue
		}
		if a.Action == "quick_response" || a.Action == "escalate_decision" {
			urgentRequests = append(urgentRequests, map[string]any{
				"id":        a.ID,
				"action":    a.Action,
				"user_name": a.UserName,
				"summary":   a.Summary,
				"timestamp": a.Timestamp,
			})
		}
		if len(urgentRequests) >= 20 {
			break
		}
	}

	// ── 2. Currently connected users ─────────────────────────────────────────
	connectedIDs := app.broker.ConnectedUserIDs()
	allUsers := app.store.GetUsers()
	userMap := make(map[int64]User, len(allUsers))
	for _, u := range allUsers {
		userMap[u.ID] = u
	}
	onlineUsers := []map[string]any{}
	for _, uid := range connectedIDs {
		if u, ok := userMap[uid]; ok {
			onlineUsers = append(onlineUsers, map[string]any{
				"id":           u.ID,
				"username":     u.Username,
				"display_name": u.DisplayName,
				"role":         u.Role,
			})
		}
	}

	// ── 3. Recent audit events ───────────────────────────────────────────────
	recentAudit := []map[string]any{}
	for i, a := range auditEntries {
		if i >= 20 { // return up to 20, frontend trims to user preference
			break
		}
		recentAudit = append(recentAudit, map[string]any{
			"id":          a.ID,
			"user_name":   a.UserName,
			"action":      a.Action,
			"entity_type": a.EntityType,
			"summary":     a.Summary,
			"timestamp":   a.Timestamp,
		})
	}

	// ── 4. Active integrations ───────────────────────────────────────────────
	integrations := []map[string]any{}
	for _, c := range app.store.GetConnectorConfigs() {
		if c.Enabled {
			integrations = append(integrations, map[string]any{
				"name":    c.Name,
				"enabled": c.Enabled,
			})
		}
	}
	// Check mail config
	mailCfg := app.store.GetMailConfig()
	if mailCfg.SMTPHost != "" {
		integrations = append(integrations, map[string]any{
			"id":   0,
			"name": "Email (SMTP)",
			"type": "mail",
		})
	}
	// Check syslog
	syslogCfg := app.store.GetSyslogConfig()
	if syslogCfg.Enabled {
		integrations = append(integrations, map[string]any{
			"id":   0,
			"name": "Syslog",
			"type": "syslog",
		})
	}

	// ── 5. Ongoing activities ────────────────────────────────────────────────
	// Open polls
	openPolls := []map[string]any{}
	for _, p := range app.store.GetPolls() {
		if p.Status == "open" {
			openPolls = append(openPolls, map[string]any{
				"id":              p.ID,
				"title":           p.Title,
				"created_by_name": p.CreatedByName,
				"created_at":      p.CreatedAt,
				"response_count":  len(p.Responses),
			})
		}
	}

	// Active person ready checks (show recent ones from last 24h)
	activeReadyChecks := []map[string]any{}
	for _, rc := range app.store.GetPersonReadyChecks() {
		if rc.CreatedAt.After(cutoff24h) {
			responded := 0
			total := len(rc.Participants)
			for _, p := range rc.Participants {
				if p.Status == "ready" || p.Status == "not_ready" {
					responded++
				}
			}
			activeReadyChecks = append(activeReadyChecks, map[string]any{
				"id":              rc.ID,
				"message":         rc.Message,
				"created_by_name": rc.CreatedByName,
				"created_at":      rc.CreatedAt,
				"responded":       responded,
				"total":           total,
			})
		}
	}

	// ── 6. Summary stats ─────────────────────────────────────────────────────
	events := app.visibleEvents(user)
	activeEvents := 0
	for _, ev := range events {
		if ev.Status == "active" {
			activeEvents++
		}
	}
	pendingDecisions := 0
	for _, d := range app.store.GetDecisionLog() {
		if d.Status == "pending" || d.Status == "requested" {
			pendingDecisions++
		}
	}

	jsonOK(w, map[string]any{
		"urgent_requests":     urgentRequests,
		"online_users":        onlineUsers,
		"recent_audit":        recentAudit,
		"active_integrations": integrations,
		"open_polls":          openPolls,
		"active_ready_checks": activeReadyChecks,
		"stats": map[string]any{
			"total_users":       len(allUsers),
			"online_users":      len(onlineUsers),
			"active_events":     activeEvents,
			"pending_decisions":  pendingDecisions,
			"open_polls":        len(openPolls),
		},
	})
}
