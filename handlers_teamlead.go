package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ── TeamLead Toolbox handlers ─────────────────────────────────────────────────

func (app *App) handleTeamLeadQuickResponse(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Message   string  `json:"message"`
		Priority  string  `json:"priority"`  // normal, high, critical
		Target    string  `json:"target"`    // "oplead", "oplead_deputy", "custom"
		CustomIDs []int64 `json:"custom_ids"` // user IDs when target is "custom"
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Message == "" {
		jsonError(w, "message is required", http.StatusBadRequest)
		return
	}
	if req.Priority == "" {
		req.Priority = "high"
	}
	if req.Target == "" {
		req.Target = "oplead"
	}

	payload, _ := json.Marshal(map[string]any{
		"type":      "quick_response",
		"message":   req.Message,
		"priority":  req.Priority,
		"from_user": user.DisplayName,
		"from_role": string(user.Role),
		"target":    req.Target,
		"timestamp": time.Now().Format(time.RFC3339),
	})
	msg := SSEMessage{Event: "teamlead_quick_response", Data: string(payload)}

	// Route to target recipients
	targetLabel := "Operations Lead"
	switch req.Target {
	case "oplead":
		// Send only to OpLead+ roles
		for _, u := range app.store.GetUsers() {
			if u.ID != user.ID && app.effectiveHasRole(&u, RoleOpLead) {
				app.broker.SendToUser(u.ID, msg)
			}
		}
	case "oplead_deputy":
		// Send to OpLead+ and Deputy OpLead roles
		targetLabel = "Operations Lead + Deputies"
		for _, u := range app.store.GetUsers() {
			if u.ID != user.ID && (app.effectiveHasRole(&u, RoleOpLead) || u.Role == RoleDeputyOpLead) {
				app.broker.SendToUser(u.ID, msg)
			}
		}
	case "custom":
		// Send to specific users
		targetLabel = "Custom recipients"
		for _, uid := range req.CustomIDs {
			if uid != user.ID {
				app.broker.SendToUser(uid, msg)
			}
		}
	default:
		// Fallback: broadcast to all
		app.broker.BroadcastAll(msg)
	}
	// Also send confirmation back to sender
	app.broker.SendToUser(user.ID, SSEMessage{Event: "teamlead_quick_response_sent", Data: string(payload)})

	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "quick_response", EntityType: "teamlead_toolbox",
		Summary: fmt.Sprintf("Quick response to %s: %s (priority: %s)", targetLabel, req.Message, req.Priority),
	})
	jsonOK(w, map[string]string{"status": "sent"})
}

func (app *App) handleTeamLeadEscalateDecision(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Title    string `json:"title"`
		Decision string `json:"decision"`
		Reason   string `json:"reason"`
		Urgency  string `json:"urgency"` // normal, urgent, critical
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Decision == "" {
		jsonError(w, "decision text is required", http.StatusBadRequest)
		return
	}
	if req.Urgency == "" {
		req.Urgency = "urgent"
	}
	now := time.Now()
	entry := DecisionLogEntry{
		Timestamp:        now,
		UserID:           user.ID,
		UserName:         user.Username,
		DisplayName:      user.DisplayName,
		Title:            req.Title,
		Decision:         req.Decision,
		LogType:          "general",
		Status:           "requested",
		RequestedAt:      &now,
		RequestedOfType:  "role",
		RequestedOfValue: "oplead",
		RequestedOfLabel: "Operations Lead",
		Reason:           req.Reason,
	}
	created, err := app.store.AddDecisionLogEntry(entry)
	if err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	seqPrefix := "decision"
	if ex := app.store.GetExerciseSettings(); ex.Enabled && ex.Label != "" {
		abbr := strings.ToUpper(strings.ReplaceAll(ex.Label, " ", "-"))
		if len(abbr) > 20 {
			abbr = abbr[:20]
		}
		seqPrefix = abbr
	}
	created.SequenceNumber = fmt.Sprintf("%s-%03d", seqPrefix, created.ID)
	_ = app.store.UpdateDecisionLogEntry(created)
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "escalated", EntityType: "decision_log", EntityID: created.ID,
		Summary: fmt.Sprintf("Decision escalated to OpLead: %s (%s)", req.Title, req.Urgency),
	})
	payload, _ := json.Marshal(map[string]any{
		"type":            "escalate_decision",
		"decision_id":     created.ID,
		"sequence_number": created.SequenceNumber,
		"title":           req.Title,
		"decision":        req.Decision,
		"urgency":         req.Urgency,
		"from_user":       user.DisplayName,
		"from_role":       string(user.Role),
		"message":         req.Decision,
		"priority":        req.Urgency,
		"timestamp":       time.Now().Format(time.RFC3339),
	})
	// Send specifically to OpLead, Deputy OpLead, Admin, and anyone acting as OpLead
	sseMsg := SSEMessage{Event: "decision_escalated", Data: string(payload)}
	for _, u := range app.store.GetUsers() {
		if u.ID != user.ID && (u.Role == RoleOpLead || u.Role == RoleDeputyOpLead || u.Role == RoleAdmin) {
			app.broker.SendToUser(u.ID, sseMsg)
		}
	}
	// Also send to anyone acting as OpLead via staff duties
	for _, d := range app.store.GetStaffDuties() {
		if (d.Role == "acting_oplead" || d.Role == "acting_deputy_oplead") && d.UserID != user.ID {
			app.broker.SendToUser(d.UserID, sseMsg)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (app *App) handleTeamLeadReadyCheck(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		GroupID int64  `json:"group_id"`
		Message string `json:"message"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.GroupID == 0 {
		jsonError(w, "group_id is required", http.StatusBadRequest)
		return
	}
	msg := req.Message
	if msg == "" {
		msg = "Ready check from " + user.DisplayName
	}
	payload, _ := json.Marshal(map[string]any{
		"type":      "team_ready_check",
		"group_id":  req.GroupID,
		"message":   msg,
		"from_user": user.DisplayName,
		"timestamp": time.Now().Format(time.RFC3339),
	})
	app.broker.BroadcastAll(SSEMessage{Event: "team_ready_check", Data: string(payload)})
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "ready_check", EntityType: "teamlead_toolbox",
		Summary: fmt.Sprintf("Team ready check for group %d: %s", req.GroupID, msg),
	})
	jsonOK(w, map[string]string{"status": "sent"})
}

func (app *App) handleTeamLeadTeamPoll(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		GroupID  int64    `json:"group_id"`
		Question string   `json:"question"`
		Options  []string `json:"options"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.GroupID == 0 {
		jsonError(w, "group_id is required", http.StatusBadRequest)
		return
	}
	if req.Question == "" {
		jsonError(w, "question is required", http.StatusBadRequest)
		return
	}
	if len(req.Options) < 2 {
		jsonError(w, "at least 2 options are required", http.StatusBadRequest)
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"type":      "team_poll",
		"group_id":  req.GroupID,
		"question":  req.Question,
		"options":   req.Options,
		"from_user": user.DisplayName,
		"timestamp": time.Now().Format(time.RFC3339),
	})
	app.broker.BroadcastAll(SSEMessage{Event: "team_poll", Data: string(payload)})
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "team_poll", EntityType: "teamlead_toolbox",
		Summary: fmt.Sprintf("Team poll for group %d: %s", req.GroupID, req.Question),
	})
	jsonOK(w, map[string]string{"status": "sent"})
}

// ── Quick Report ──────────────────────────────────────────────────────────────

func (app *App) handleTeamLeadQuickReport(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Subject    string `json:"subject"`
		Body       string `json:"body"`
		Priority   string `json:"priority"`   // normal, high, critical
		Category   string `json:"category"`   // situation, incident, resource, progress, other
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Subject == "" || req.Body == "" {
		jsonError(w, "subject and body are required", http.StatusBadRequest)
		return
	}
	if req.Priority == "" {
		req.Priority = "normal"
	}
	if req.Category == "" {
		req.Category = "situation"
	}

	// Build the report payload
	report := map[string]any{
		"type":        "quick_report",
		"subject":     req.Subject,
		"body":        req.Body,
		"priority":    req.Priority,
		"category":    req.Category,
		"from_user":   user.DisplayName,
		"from_role":   string(user.Role),
		"from_user_id": user.ID,
		"timestamp":   time.Now().Format(time.RFC3339),
	}
	payload, _ := json.Marshal(report)

	// Send to OpLead+ users and users with info_handler capability
	users := app.store.GetUsers()
	roleConfigs := app.store.GetRoleConfigs()
	infoHandlerRoles := map[string]bool{}
	for _, rc := range roleConfigs {
		if rc.Capabilities["info_handler"] {
			infoHandlerRoles[rc.Key] = true
		}
	}

	for _, u := range users {
		if u.ID == user.ID {
			continue
		}
		// Send to OpLead+ or info_handler capability roles
		isLeadership := app.effectiveHasRole(&u, RoleOpLead)
		isInfoHandler := infoHandlerRoles[string(u.Role)]
		if isLeadership || isInfoHandler {
			app.broker.SendToUser(u.ID, SSEMessage{Event: "quick_report", Data: string(payload)})
		}
	}

	// Also broadcast (so sender gets confirmation)
	app.broker.SendToUser(user.ID, SSEMessage{Event: "quick_report_sent", Data: string(payload)})

	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "quick_report", EntityType: "teamlead_toolbox",
		Summary: fmt.Sprintf("Quick report: [%s] %s (priority: %s)", req.Category, req.Subject, req.Priority),
	})

	jsonOK(w, map[string]string{"status": "sent"})
}

func (app *App) handleGetQuickReports(w http.ResponseWriter, r *http.Request, user *User) {
	// Only leadership and info_handler roles can view reports
	isLeadership := app.effectiveHasRole(user, RoleOpLead)
	roleConfigs := app.store.GetRoleConfigs()
	isInfoHandler := false
	for _, rc := range roleConfigs {
		if rc.Key == string(user.Role) && rc.Capabilities["info_handler"] {
			isInfoHandler = true
			break
		}
	}
	// TeamLead+ can also see reports they sent
	isTeamLead := app.effectiveHasRole(user, RoleTeamLead)

	if !isLeadership && !isInfoHandler && !isTeamLead {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	// Return quick reports from audit log
	audits := app.store.GetAudit(200)
	var reports []map[string]any
	for _, a := range audits {
		if a.Action == "quick_report" {
			reports = append(reports, map[string]any{
				"timestamp": a.Timestamp,
				"user_name": a.UserName,
				"summary":   a.Summary,
			})
		}
	}
	jsonOK(w, reports)
}
