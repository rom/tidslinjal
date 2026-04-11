package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// ── Event Comment handlers ─────────────────────────────────────────────────────

func (app *App) handleGetComments(w http.ResponseWriter, r *http.Request, user *User) {
	// path: /api/events/:id/comments
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	eventID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid event id", http.StatusBadRequest)
		return
	}
	// V3-L02 fix: verify user can read the event's layer before returning comments
	ev, ok := app.store.GetEventByID(eventID)
	if !ok {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	if ev.LayerID != nil && !app.canReadLayer(*ev.LayerID, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	comments := app.store.GetCommentsByEvent(eventID)
	if comments == nil {
		comments = []EventComment{}
	}
	jsonOK(w, comments)
}

func (app *App) handleCreateComment(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	eventID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid event id", http.StatusBadRequest)
		return
	}
	ev, ok := app.store.GetEventByID(eventID)
	if !ok {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	// V3-L02 fix: verify user can read the event's layer before allowing comments
	if ev.LayerID != nil && !app.canReadLayer(*ev.LayerID, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Content      string      `json:"content"`
		StatusChange EventStatus `json:"status_change,omitempty"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		jsonError(w, "content required", http.StatusBadRequest)
		return
	}
	// Enforce max comments per event
	ss := app.store.GetSecuritySettings()
	maxComments := ss.MaxCommentsPerEvent
	if maxComments <= 0 {
		maxComments = 500 // default: 500 comments per event
	}
	existing := app.store.GetCommentsByEvent(eventID)
	if len(existing) >= maxComments {
		logDebug("limits: comment limit reached on event %d (%d/%d) by user %q", eventID, len(existing), maxComments, user.Username)
		app.audit(user.ID, user.DisplayName, "rate_limited", "comment", eventID,
			fmt.Sprintf("Comment limit reached on event %d (%d max) by user %q", eventID, maxComments, user.Username))
		jsonError(w, fmt.Sprintf("comment limit reached (%d per event)", maxComments), http.StatusTooManyRequests)
		return
	}
	// For reporters proposing a status change
	pendingApproval := false
	if req.StatusChange != "" && app.effectiveHasRole(user, RoleReporter) && !app.effectiveHasRole(user, RoleReadWrite) {
		pendingApproval = true
	}
	c, err := app.store.CreateComment(EventComment{
		EventID:         eventID,
		AuthorID:        user.ID,
		AuthorName:      user.DisplayName,
		Content:         stripHTMLTags(req.Content),
		PendingApproval: pendingApproval,
		StatusChange:    req.StatusChange,
	})
	if err != nil {
		jsonError(w, "failed to create comment", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "commented", "event", eventID,
		fmt.Sprintf("Comment on event %d", eventID))

	// Notify @mentioned users via SSE
	go app.notifyMentions(c, user.DisplayName, eventID)

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, c)
}

// notifyMentions parses @username mentions from a comment and sends SSE notifications.
func (app *App) notifyMentions(c EventComment, authorName string, eventID int64) {
	content := c.Content
	// Find all @word tokens in the comment
	words := strings.Fields(content)
	seen := make(map[string]bool)
	for _, w := range words {
		if !strings.HasPrefix(w, "@") {
			continue
		}
		// Strip trailing punctuation
		mention := strings.TrimLeft(w, "@")
		mention = strings.TrimRight(mention, ".,;:!?")
		mention = strings.ToLower(mention)
		if mention == "" || seen[mention] {
			continue
		}
		seen[mention] = true
		// Find user by username or display name (case insensitive)
		users := app.store.GetUsers()
		for _, u := range users {
			if strings.ToLower(u.Username) == mention || strings.ToLower(u.DisplayName) == mention {
				if u.ID == c.AuthorID {
					break // don't notify self
				}
				// Send SSE mention notification
				ev, ok := app.store.GetEventByID(eventID)
				evTitle := ""
				if ok {
					evTitle = ev.Title
				}
				payload := map[string]any{
					"type":        "mention",
					"author":      authorName,
					"comment":     content,
					"event_id":    eventID,
					"event_title": evTitle,
				}
				data, _ := json.Marshal(payload)
				app.broker.Notify(u.ID, AlarmNotification{
					AlarmID:    0,
					EventID:    eventID,
					EventTitle: evTitle,
					Message:    fmt.Sprintf("%s mentioned you in a comment on %q", authorName, evTitle),
				})
				_ = data
				logDebug("mention: @%s notified (user %d) in comment on event %d", mention, u.ID, eventID)
				break
			}
		}
	}
}

func (app *App) handleDeleteComment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	// Verify the user can read the event's layer before allowing comment deletion
	comment := app.store.GetCommentByID(id)
	if comment == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if ev, ok := app.store.GetEventByID(comment.EventID); ok {
		if ev.LayerID != nil && !app.canReadLayer(*ev.LayerID, user) {
			jsonError(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	isAdmin := app.effectiveHasRole(user, RoleAdmin)
	if err := app.store.DeleteComment(id, user.ID, isAdmin); err != nil {
		if err.Error() == "forbidden" {
			jsonError(w, "forbidden", http.StatusForbidden)
		} else {
			jsonError(w, "not found", http.StatusNotFound)
		}
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

func (app *App) handleApproveComment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "team lead or above required", http.StatusForbidden)
		return
	}
	if err := app.store.ApproveComment(id, user.ID); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "approved"})
}

// ── Exercise Phase handlers ────────────────────────────────────────────────────

func (app *App) handleGetPhases(w http.ResponseWriter, r *http.Request, user *User) {
	phases := app.store.GetPhases()
	if phases == nil {
		phases = []ExercisePhase{}
	}
	jsonOK(w, phases)
}

func (app *App) handleCreatePhase(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "team lead or above required", http.StatusForbidden)
		return
	}
	var p ExercisePhase
	if err := decode(r, &p); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if p.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	if p.Color == "" {
		p.Color = "#888888"
	}
	p.CreatedBy = user.ID
	created, err := app.store.CreatePhase(p)
	if err != nil {
		jsonError(w, "failed to create phase", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "phase", created.ID,
		fmt.Sprintf("Created exercise phase %q", created.Name))
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdatePhase(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "team lead or above required", http.StatusForbidden)
		return
	}
	var p ExercisePhase
	if err := decode(r, &p); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	p.ID = id
	if err := app.store.UpdatePhase(p); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "phase", id,
		fmt.Sprintf("Updated exercise phase %q", p.Name))
	updated, _ := app.store.GetPhaseByID(id)
	jsonOK(w, updated)
}

func (app *App) handleDeletePhase(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "team lead or above required", http.StatusForbidden)
		return
	}
	if err := app.store.DeletePhase(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}
