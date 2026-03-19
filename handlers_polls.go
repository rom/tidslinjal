package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ── Ready Check handler ─────────────────────────────────────────────────────

func (app *App) handleReadyCheck(w http.ResponseWriter, r *http.Request, user *User) {
	es := app.store.GetExerciseSettings()
	// Get all events by using a very wide time range
	farPast := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	farFuture := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)
	// V3-H02 fix: filter events by layer visibility
	events := filterVisibleEvents(app.store.GetEventsInRange(farPast, farFuture), app.visibleLayerSet(user))
	var notReady []map[string]interface{}
	for _, ev := range events {
		if string(ev.Status) == string(StatusPlanned) {
			notReady = append(notReady, map[string]interface{}{
				"id":         ev.ID,
				"title":      ev.Title,
				"status":     ev.Status,
				"start_time": ev.StartTime,
				"layer_id":   ev.LayerID,
			})
		}
	}
	result := map[string]interface{}{
		"ready":       len(notReady) == 0,
		"total":       len(events),
		"not_ready":   notReady,
		"check_time":  es.ReadyCheckTime,
		"epoch":       es.Epoch,
	}

	// Audit log for ready check execution
	readyStatus := "NOT READY"
	if len(notReady) == 0 {
		readyStatus = "READY"
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "ready_check", EntityType: "system", EntityID: 0,
		Summary: fmt.Sprintf("Performed system ready check: %s (%d total events, %d not ready)", readyStatus, len(events), len(notReady)),
	})

	jsonOK(w, result)
}

// ── Person Ready Check handlers ─────────────────────────────────────────────

func (app *App) handleGetPersonReadyChecks(w http.ResponseWriter, r *http.Request, user *User) {
	checks := app.store.GetPersonReadyChecks()
	jsonOK(w, checks)
}

func (app *App) handleCreatePersonReadyCheck(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		ParticipantIDs []int64 `json:"participant_ids"`
		EventID        *int64  `json:"event_id,omitempty"`
		Message        string  `json:"message,omitempty"`
		ScheduledAt    string  `json:"scheduled_at,omitempty"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if len(req.ParticipantIDs) == 0 {
		jsonError(w, "at least one participant required", http.StatusBadRequest)
		return
	}
	participants := make([]PersonReadyCheckParticipant, 0, len(req.ParticipantIDs))
	for _, uid := range req.ParticipantIDs {
		u, ok := app.store.GetUserByID(uid)
		name := ""
		if ok && u != nil {
			name = u.DisplayName
			if name == "" {
				name = u.Username
			}
		}
		participants = append(participants, PersonReadyCheckParticipant{
			UserID:   uid,
			UserName: name,
			Status:   "pending",
		})
	}
	check := PersonReadyCheck{
		CreatedBy:     user.ID,
		CreatedByName: user.DisplayName,
		EventID:       req.EventID,
		Message:       req.Message,
		Participants:  participants,
		CreatedAt:     time.Now(),
		ScheduledAt:   req.ScheduledAt,
	}
	if check.CreatedByName == "" {
		check.CreatedByName = user.Username
	}
	created, err := app.store.AddPersonReadyCheck(check)
	if err != nil {
		jsonError(w, "failed to create ready check", http.StatusInternalServerError)
		return
	}
	jsonOK(w, created)

	// Determine if this is a future-scheduled check
	isScheduled := false
	if req.ScheduledAt != "" {
		if t, err := time.Parse(time.RFC3339, req.ScheduledAt); err == nil && t.After(time.Now()) {
			isScheduled = true
		}
	}

	if !isScheduled {
		// Broadcast SSE event for the new PRC so all clients can update
		prcData, _ := json.Marshal(created)
		app.broker.BroadcastAll(SSEMessage{Event: "prc_new_check", Data: string(prcData)})

		// Notify each participant via personal notification
		app.sendPRCNotifications(created, user.ID)
	}

	// Create an audit log entry with participant details
	participantNames := make([]string, 0, len(created.Participants))
	for _, p := range created.Participants {
		if p.UserName != "" {
			participantNames = append(participantNames, p.UserName)
		} else {
			participantNames = append(participantNames, fmt.Sprintf("user#%d", p.UserID))
		}
	}
	auditSummary := fmt.Sprintf("Created person ready check targeting %d participants: %s", len(created.Participants), strings.Join(participantNames, ", "))
	if isScheduled {
		auditSummary += fmt.Sprintf(" (scheduled at %s)", req.ScheduledAt)
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "create_prc", EntityType: "person_ready_check", EntityID: created.ID,
		Summary: auditSummary,
	})
}

// sendPRCNotifications sends personal notifications to all participants of a PRC.
func (app *App) sendPRCNotifications(check PersonReadyCheck, excludeUserID int64) {
	notifBody := fmt.Sprintf("You have been included in a ready check by %s", check.CreatedByName)
	if check.Message != "" {
		notifBody += ": " + check.Message
	}
	for _, p := range check.Participants {
		if p.UserID != excludeUserID {
			app.notifyUser(p.UserID, "prc",
				"Ready Check",
				notifBody,
				fmt.Sprintf("%d", check.ID))
		}
	}
}

// runPRCScheduler checks for scheduled person ready checks that are due and fires them.
func (app *App) runPRCScheduler() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-app.stopCh:
			return
		case <-ticker.C:
		}
		now := time.Now()
		checks := app.store.GetPersonReadyChecks()
		for _, check := range checks {
			if check.ScheduledAt == "" || check.Fired {
				continue
			}
			scheduledTime, err := time.Parse(time.RFC3339, check.ScheduledAt)
			if err != nil {
				continue
			}
			if now.Before(scheduledTime) {
				continue
			}
			// Mark as fired
			check.Fired = true
			if err := app.store.UpdatePersonReadyCheck(check); err != nil {
				continue
			}
			// Broadcast SSE event
			prcData, _ := json.Marshal(check)
			app.broker.BroadcastAll(SSEMessage{Event: "prc_new_check", Data: string(prcData)})
			// Send notifications to all participants
			app.sendPRCNotifications(check, 0)
		}
	}
}

// runPollScheduler checks for scheduled polls that are due and activates them.
func (app *App) runPollScheduler() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-app.stopCh:
			return
		case <-ticker.C:
		}
		now := time.Now()
		polls := app.store.GetPolls()
		for _, poll := range polls {
			if poll.ScheduledAt == "" || poll.Status != "scheduled" {
				continue
			}
			scheduledTime, err := time.Parse(time.RFC3339, poll.ScheduledAt)
			if err != nil {
				continue
			}
			if now.Before(scheduledTime) {
				continue
			}
			// Activate the poll
			poll.Status = "open"
			poll.Fired = true
			if err := app.store.UpdatePoll(poll); err != nil {
				continue
			}
			// Broadcast SSE
			pollData, _ := json.Marshal(poll)
			app.broker.BroadcastAll(SSEMessage{Event: "poll_new", Data: string(pollData)})
			// Notify targeted users
			targetUserIDs := app.resolvePollTargets(poll)
			for _, uid := range targetUserIDs {
				if uid != poll.CreatedBy {
					app.notifyUser(uid, "poll",
						"New Poll: "+poll.Title,
						fmt.Sprintf("A scheduled poll by %s is now active", poll.CreatedByName),
						fmt.Sprintf("%d", poll.ID))
				}
			}
			log.Printf("[INFO] Scheduled poll '%s' (ID %d) activated", poll.Title, poll.ID)
		}

		// Auto-remind: check polls with reminder_mins set
		for _, poll := range polls {
			if poll.Status != "open" || poll.ReminderMins <= 0 {
				continue
			}
			reminderTime := poll.CreatedAt.Add(time.Duration(poll.ReminderMins) * time.Minute)
			if now.Before(reminderTime) {
				continue
			}
			// Check if all targets have responded
			targetUserIDs := app.resolvePollTargets(poll)
			respondedSet := make(map[int64]bool)
			for _, r := range poll.Responses {
				respondedSet[r.UserID] = true
			}
			reminded := 0
			for _, uid := range targetUserIDs {
				if !respondedSet[uid] {
					app.notifyUser(uid, "poll_reminder",
						"Poll Reminder: "+poll.Title,
						fmt.Sprintf("Please respond to the poll '%s'", poll.Title),
						fmt.Sprintf("%d", poll.ID))
					reminded++
				}
			}
			if reminded > 0 {
				// Clear reminder so it doesn't fire again
				poll.ReminderMins = 0
				app.store.UpdatePoll(poll)
				log.Printf("[INFO] Auto-reminded %d non-responders for poll '%s' (ID %d)", reminded, poll.Title, poll.ID)
			}
		}
	}
}

func (app *App) handleRespondPersonReadyCheck(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		Status string `json:"status"` // "ready" or "not_ready"
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Status != "ready" && req.Status != "not_ready" {
		jsonError(w, "status must be 'ready' or 'not_ready'", http.StatusBadRequest)
		return
	}
	checks := app.store.GetPersonReadyChecks()
	var found *PersonReadyCheck
	for i := range checks {
		if checks[i].ID == id {
			found = &checks[i]
			break
		}
	}
	if found == nil {
		jsonError(w, "ready check not found", http.StatusNotFound)
		return
	}
	updated := false
	for j := range found.Participants {
		if found.Participants[j].UserID == user.ID {
			found.Participants[j].Status = req.Status
			found.Participants[j].RespondedAt = time.Now().UTC().Format(time.RFC3339)
			updated = true
			break
		}
	}
	if !updated {
		jsonError(w, "you are not a participant in this ready check", http.StatusForbidden)
		return
	}
	if err := app.store.UpdatePersonReadyCheck(*found); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	jsonOK(w, found)

	// Audit log for PRC response
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "respond_prc", EntityType: "person_ready_check", EntityID: found.ID,
		Summary: fmt.Sprintf("Responded '%s' to ready check created by %s", req.Status, found.CreatedByName),
	})

	// Broadcast SSE event for the updated PRC
	updatedData, _ := json.Marshal(found)
	app.broker.BroadcastAll(SSEMessage{Event: "prc_update", Data: string(updatedData)})
}

// ── Poll / Multipoll handlers ───────────────────────────────────────────────

func (app *App) handleGetPolls(w http.ResponseWriter, r *http.Request, user *User) {
	polls := app.store.GetPolls()
	if polls == nil {
		polls = []Poll{}
	}
	// For non-creators, strip other users' responses and target details
	// so receivers only see the questionnaire and their own response status
	filtered := make([]Poll, len(polls))
	for i, p := range polls {
		filtered[i] = p
		if p.CreatedBy != user.ID {
			// Only keep the current user's own responses
			var myResponses []PollResponse
			for _, r := range p.Responses {
				if r.UserID == user.ID {
					myResponses = append(myResponses, r)
				}
			}
			filtered[i].Responses = myResponses
			filtered[i].TargetIDs = nil
		}
	}
	jsonOK(w, filtered)
}

func (app *App) handleGetDefaultPollQuestions(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, DefaultPollQuestions())
}

func (app *App) handleCreatePoll(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Title        string         `json:"title"`
		Description  string         `json:"description"`
		TargetType   string         `json:"target_type"`
		TargetIDs    []string       `json:"target_ids"`
		Questions    []PollQuestion `json:"questions"`
		ScheduledAt  string         `json:"scheduled_at,omitempty"`
		ReminderMins int            `json:"reminder_mins,omitempty"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		jsonError(w, "title is required", http.StatusBadRequest)
		return
	}
	if req.TargetType != "user" && req.TargetType != "group" && req.TargetType != "role" {
		jsonError(w, "target_type must be 'user', 'group', or 'role'", http.StatusBadRequest)
		return
	}
	if len(req.TargetIDs) == 0 {
		jsonError(w, "at least one target required", http.StatusBadRequest)
		return
	}
	questions := req.Questions
	if len(questions) == 0 {
		questions = DefaultPollQuestions()
	}
	creatorName := user.DisplayName
	if creatorName == "" {
		creatorName = user.Username
	}
	// Determine if this is a scheduled (timed) poll
	isScheduled := false
	if req.ScheduledAt != "" {
		if st, err := time.Parse(time.RFC3339, req.ScheduledAt); err == nil && st.After(time.Now()) {
			isScheduled = true
		}
	}

	poll := Poll{
		CreatedBy:     user.ID,
		CreatedByName: creatorName,
		CreatedAt:     time.Now(),
		Title:         req.Title,
		Description:   req.Description,
		TargetType:    req.TargetType,
		TargetIDs:     req.TargetIDs,
		Questions:     questions,
		Responses:     []PollResponse{},
		Status:        "open",
		ScheduledAt:   req.ScheduledAt,
		ReminderMins:  req.ReminderMins,
	}
	if isScheduled {
		poll.Status = "scheduled"
	}
	created, err := app.store.AddPoll(poll)
	if err != nil {
		jsonError(w, "failed to create poll", http.StatusInternalServerError)
		return
	}
	jsonOK(w, created)

	if !isScheduled {
		// Broadcast SSE
		pollData, _ := json.Marshal(created)
		app.broker.BroadcastAll(SSEMessage{Event: "poll_new", Data: string(pollData)})

		// Notify targeted users
		targetUserIDs := app.resolvePollTargets(created)
		for _, uid := range targetUserIDs {
			if uid != user.ID {
				app.notifyUser(uid, "poll",
					"New Poll: "+created.Title,
					fmt.Sprintf("You have been included in a poll by %s", creatorName),
					fmt.Sprintf("%d", created.ID))
			}
		}
	}

	// Audit log
	auditSummary := fmt.Sprintf("Created poll '%s' targeting %s: %s", created.Title, created.TargetType, strings.Join(created.TargetIDs, ", "))
	if isScheduled {
		auditSummary += fmt.Sprintf(" (scheduled at %s)", req.ScheduledAt)
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "create_poll", EntityType: "poll", EntityID: created.ID,
		Summary: auditSummary,
	})
}

func (app *App) handleGetPoll(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	poll, ok := app.store.GetPollByID(id)
	if !ok {
		jsonError(w, "poll not found", http.StatusNotFound)
		return
	}
	jsonOK(w, poll)
}

func (app *App) handleRespondPoll(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		Answers []struct {
			QuestionID string `json:"question_id"`
			Answer     string `json:"answer"`
		} `json:"answers"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if len(req.Answers) == 0 {
		jsonError(w, "at least one answer required", http.StatusBadRequest)
		return
	}

	poll, ok := app.store.GetPollByID(id)
	if !ok {
		jsonError(w, "poll not found", http.StatusNotFound)
		return
	}
	if poll.Status != "open" {
		jsonError(w, "poll is closed", http.StatusBadRequest)
		return
	}

	// Check that user is in the target list
	targetUserIDs := app.resolvePollTargets(*poll)
	isTarget := false
	for _, uid := range targetUserIDs {
		if uid == user.ID {
			isTarget = true
			break
		}
	}
	if !isTarget {
		jsonError(w, "you are not a target of this poll", http.StatusForbidden)
		return
	}

	// Build a set of valid question IDs
	validQIDs := make(map[string]bool)
	for _, q := range poll.Questions {
		validQIDs[q.ID] = true
	}

	userName := user.DisplayName
	if userName == "" {
		userName = user.Username
	}
	now := time.Now()

	// Remove any previous responses from this user for these questions, then add new ones
	for _, ans := range req.Answers {
		if !validQIDs[ans.QuestionID] {
			continue
		}
		// Remove old response for this user+question
		filtered := make([]PollResponse, 0, len(poll.Responses))
		for _, resp := range poll.Responses {
			if !(resp.UserID == user.ID && resp.QuestionID == ans.QuestionID) {
				filtered = append(filtered, resp)
			}
		}
		poll.Responses = filtered
		// Add new response
		poll.Responses = append(poll.Responses, PollResponse{
			UserID:     user.ID,
			UserName:   userName,
			QuestionID: ans.QuestionID,
			Answer:     ans.Answer,
			AnsweredAt: now,
		})
	}

	if err := app.store.UpdatePoll(*poll); err != nil {
		jsonError(w, "failed to update poll", http.StatusInternalServerError)
		return
	}
	jsonOK(w, poll)

	// Audit log
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "respond_poll", EntityType: "poll", EntityID: poll.ID,
		Summary: fmt.Sprintf("Responded to poll '%s' with %d answers", poll.Title, len(req.Answers)),
	})

	// Broadcast SSE
	updatedData, _ := json.Marshal(poll)
	app.broker.BroadcastAll(SSEMessage{Event: "poll_update", Data: string(updatedData)})
}

func (app *App) handleClosePoll(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	poll, ok := app.store.GetPollByID(id)
	if !ok {
		jsonError(w, "poll not found", http.StatusNotFound)
		return
	}
	// Only creator or admin can close
	if poll.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "only the creator or an admin can close this poll", http.StatusForbidden)
		return
	}
	if poll.Status == "closed" {
		jsonError(w, "poll is already closed", http.StatusBadRequest)
		return
	}
	now := time.Now()
	poll.Status = "closed"
	poll.ClosedAt = &now

	if err := app.store.UpdatePoll(*poll); err != nil {
		jsonError(w, "failed to close poll", http.StatusInternalServerError)
		return
	}
	jsonOK(w, poll)

	// Audit log
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "close_poll", EntityType: "poll", EntityID: poll.ID,
		Summary: fmt.Sprintf("Closed poll '%s' (%d responses)", poll.Title, len(poll.Responses)),
	})

	// Broadcast SSE
	closedData, _ := json.Marshal(poll)
	app.broker.BroadcastAll(SSEMessage{Event: "poll_closed", Data: string(closedData)})
}

func (app *App) handlePollReminder(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	poll, ok := app.store.GetPollByID(id)
	if !ok {
		jsonError(w, "poll not found", http.StatusNotFound)
		return
	}
	if poll.Status != "open" {
		jsonError(w, "poll is not open", http.StatusBadRequest)
		return
	}
	// Only creator or admin can send reminders
	if poll.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "only the creator or an admin can send reminders", http.StatusForbidden)
		return
	}

	// Find users who haven't responded
	respondedUsers := make(map[int64]bool)
	for _, resp := range poll.Responses {
		respondedUsers[resp.UserID] = true
	}
	targetUserIDs := app.resolvePollTargets(*poll)
	reminded := 0
	creatorName := user.DisplayName
	if creatorName == "" {
		creatorName = user.Username
	}
	for _, uid := range targetUserIDs {
		if !respondedUsers[uid] && uid != user.ID {
			app.notifyUser(uid, "poll",
				"Reminder: "+poll.Title,
				fmt.Sprintf("Reminder from %s — please respond to the poll \"%s\"", creatorName, poll.Title),
				fmt.Sprintf("%d", poll.ID))
			reminded++
		}
	}

	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "remind_poll", EntityType: "poll", EntityID: poll.ID,
		Summary: fmt.Sprintf("Sent poll reminder for '%s' to %d non-responders", poll.Title, reminded),
	})

	jsonOK(w, map[string]interface{}{"status": "ok", "reminded": reminded})
}

func (app *App) handleGetPollLog(w http.ResponseWriter, r *http.Request, user *User) {
	polls := app.store.GetPolls()
	// Return all polls (open, closed, scheduled) — not just closed ones
	if polls == nil {
		polls = []Poll{}
	}
	jsonOK(w, polls)
}

// ── Poll Questionnaire handlers ─────────────────────────────────────────────

func (app *App) handleGetQuestionnaires(w http.ResponseWriter, r *http.Request, user *User) {
	custom := app.store.GetQuestionnaires()
	builtIn := BuiltInQuestionnaires()
	all := append(builtIn, custom...)
	jsonOK(w, all)
}

func (app *App) handleCreateQuestionnaire(w http.ResponseWriter, r *http.Request, user *User) {
	var req PollQuestionnaire
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name is required", http.StatusBadRequest)
		return
	}
	if len(req.Questions) == 0 {
		jsonError(w, "at least one question is required", http.StatusBadRequest)
		return
	}
	now := time.Now()
	req.CreatedBy = user.ID
	req.CreatedAt = now
	req.UpdatedAt = now
	req.BuiltIn = false
	saved, err := app.store.AddQuestionnaire(req)
	if err != nil {
		jsonError(w, "failed to save questionnaire", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "create_questionnaire", EntityType: "questionnaire", EntityID: saved.ID,
		Summary: fmt.Sprintf("Created poll questionnaire '%s'", saved.Name),
	})
	jsonOK(w, saved)
}

func (app *App) handleUpdateQuestionnaire(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}

	var req struct {
		PollQuestionnaire
		AcknowledgeBuiltin bool `json:"acknowledge_builtin"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name is required", http.StatusBadRequest)
		return
	}

	if id < 0 {
		// Built-in questionnaire: require acknowledgement, then save as a new copy
		if !req.AcknowledgeBuiltin {
			jsonError(w, "You must acknowledge that you are editing a built-in questionnaire", http.StatusBadRequest)
			return
		}
		// Find the built-in questionnaire to use as base
		var base *PollQuestionnaire
		for _, q := range BuiltInQuestionnaires() {
			if q.ID == id {
				base = &q
				break
			}
		}
		if base == nil {
			jsonError(w, "built-in questionnaire not found", http.StatusNotFound)
			return
		}
		// Apply changes from request onto the base, save as new user-created copy
		now := time.Now()
		newQ := PollQuestionnaire{
			Name:        req.Name,
			Description: req.Description,
			Questions:   req.Questions,
			BuiltIn:     false,
			CreatedBy:   user.ID,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if len(newQ.Questions) == 0 {
			newQ.Questions = base.Questions
		}
		saved, err := app.store.AddQuestionnaire(newQ)
		if err != nil {
			jsonError(w, "failed to save copy", http.StatusInternalServerError)
			return
		}
		app.store.LogAudit(AuditEntry{
			UserID: user.ID, UserName: user.DisplayName,
			Action: "copy_builtin_questionnaire", EntityType: "questionnaire", EntityID: saved.ID,
			Summary: fmt.Sprintf("Created copy of built-in questionnaire '%s' as '%s'", base.Name, saved.Name),
		})
		jsonOK(w, saved)
		return
	}

	q := req.PollQuestionnaire
	q.ID = id
	q.UpdatedAt = time.Now()
	q.BuiltIn = false
	if err := app.store.UpdateQuestionnaire(q); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "update_questionnaire", EntityType: "questionnaire", EntityID: id,
		Summary: fmt.Sprintf("Updated poll questionnaire '%s'", q.Name),
	})
	jsonOK(w, q)
}

func (app *App) handleDeleteQuestionnaire(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if id < 0 {
		jsonError(w, "cannot delete built-in questionnaires", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteQuestionnaire(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "delete_questionnaire", EntityType: "questionnaire", EntityID: id,
		Summary: "Deleted poll questionnaire",
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Duplicate Questionnaire handler ─────────────────────────────────────────

func (app *App) handleDuplicateQuestionnaire(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	_ = decode(r, &req) // optional body

	// Find questionnaire (check built-in first, then custom)
	var source *PollQuestionnaire
	for _, q := range BuiltInQuestionnaires() {
		if q.ID == id {
			source = &q
			break
		}
	}
	if source == nil {
		for _, q := range app.store.GetQuestionnaires() {
			if q.ID == id {
				source = &q
				break
			}
		}
	}
	if source == nil {
		jsonError(w, "questionnaire not found", http.StatusNotFound)
		return
	}

	name := req.Name
	if name == "" {
		name = source.Name + " (Copy)"
	}

	now := time.Now()
	newQ := PollQuestionnaire{
		Name:        name,
		Description: source.Description,
		Questions:   source.Questions,
		BuiltIn:     false,
		CreatedBy:   user.ID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	saved, err := app.store.AddQuestionnaire(newQ)
	if err != nil {
		jsonError(w, "failed to save copy", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "duplicate_questionnaire", EntityType: "questionnaire", EntityID: saved.ID,
		Summary: fmt.Sprintf("Duplicated questionnaire '%s' as '%s'", source.Name, saved.Name),
	})
	jsonOK(w, saved)
}
