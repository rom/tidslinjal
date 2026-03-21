package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"
)

// ── Alarm handlers ─────────────────────────────────────────────────────────────

func (app *App) handleGetAlarms(w http.ResponseWriter, r *http.Request, user *User) {
	alarms := app.store.GetAlarmsByUser(user.ID)
	if alarms == nil {
		alarms = []Alarm{}
	}
	jsonOK(w, alarms)
}

func (app *App) handleCreateAlarm(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		EventID    int64  `json:"event_id"`
		LeadTime   int    `json:"lead_time"`
		Sound      string `json:"sound"`       // optional alarm sound
		WebhookURL string `json:"webhook_url"` // optional per-alarm webhook URL
		ForUserID  int64  `json:"for_user_id"` // optional: create alarm for another user (oplead+ only)
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	event, ok := app.store.GetEventByID(req.EventID)
	if !ok {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	// Validate per-alarm webhook URL (SSRF protection)
	if req.WebhookURL != "" {
		if err := validateWebhookURL(req.WebhookURL); err != nil {
			jsonError(w, "invalid webhook URL: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	targetUserID := user.ID
	if req.ForUserID != 0 && req.ForUserID != user.ID {
		if !hasRole(user.Role, RoleOpLead) {
			jsonError(w, "only operations leads and admins may create alarms for other users", http.StatusForbidden)
			return
		}
		targetUserID = req.ForUserID
	}
	created, err := app.store.CreateAlarm(Alarm{
		UserID: targetUserID, EventID: req.EventID,
		EventTitle: event.Title, EventTime: event.StartTime, LeadTime: req.LeadTime,
		Sound: req.Sound, WebhookURL: req.WebhookURL,
	})
	if err != nil {
		jsonError(w, "failed to create alarm", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleDeleteAlarm(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteAlarm(id, user.ID); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

func (app *App) handleAckAlarm(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	// Capture alarm details before marking it acknowledged
	alarm, _ := app.store.GetAlarmByID(id)
	if err := app.store.AckAlarm(id, user.ID); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// Audit the acknowledgement with who, when (implicit in AuditEntry.Timestamp), and IP
	ip := clientIP(r)
	summary := fmt.Sprintf("Alarm acknowledged: %q (event: %s, lead time: %d min) from IP %s",
		alarm.EventTitle, alarm.EventTime.Format("2006-01-02 15:04 UTC"), alarm.LeadTime, ip)
	app.audit(user.ID, user.DisplayName, "acknowledged", "alarm", id, summary)
	logDebug("alarm acked: id=%d user=%s", id, user.Username)
	jsonOK(w, map[string]string{"status": "acknowledged"})
}

func (app *App) handleSSE(w http.ResponseWriter, r *http.Request) {
	_, user := app.getSession(r)
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	// Enforce per-user SSE connection limit
	ss := app.store.GetSecuritySettings()
	maxConns := ss.MaxSSEConnsPerUser
	if maxConns <= 0 {
		maxConns = 5 // default: 5 concurrent SSE connections per user
	}
	if app.broker.UserConnectionCount(user.ID) >= maxConns {
		log.Printf("[SECURITY] SSE connection limit reached for user %q (%d connections, limit %d)", user.Username, app.broker.UserConnectionCount(user.ID), maxConns)
		app.audit(user.ID, user.DisplayName, "rate_limited", "sse", 0,
			fmt.Sprintf("SSE connection limit reached for user %q (%d max)", user.Username, maxConns))
		http.Error(w, "too many SSE connections", http.StatusTooManyRequests)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	// Only set Connection: keep-alive for HTTP/1.x; it is a hop-by-hop
	// header forbidden in HTTP/2 and causes ERR_HTTP2_PROTOCOL_ERROR.
	if !r.ProtoAtLeast(2, 0) {
		w.Header().Set("Connection", "keep-alive")
	}

	// Use ResponseController to extend the write deadline before each
	// write so the global WriteTimeout (5 min) doesn't kill the stream.
	rc := http.NewResponseController(w)

	client := app.broker.Subscribe(user.ID)
	defer app.broker.Unsubscribe(client)

	// Helper: extend the write deadline and flush.
	sseFlush := func() {
		_ = rc.SetWriteDeadline(time.Now().Add(5 * time.Minute))
		flusher.Flush()
	}

	fmt.Fprintf(w, "event: connected\ndata: {\"user_id\":%d}\n\n", user.ID)
	sseFlush()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case n := <-client.ch:
			data, _ := json.Marshal(n)
			fmt.Fprintf(w, "event: alarm\ndata: %s\n\n", data)
			sseFlush()
		case msg := <-client.broadcast:
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", msg.Event, msg.Data)
			sseFlush()
		case <-ticker.C:
			fmt.Fprintf(w, "event: ping\ndata: {}\n\n")
			sseFlush()
		}
	}
}
