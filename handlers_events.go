package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ── Event handlers ─────────────────────────────────────────────────────────────

func (app *App) handleGetEvents(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	var from, to time.Time
	var err error
	if s := q.Get("from"); s != "" {
		if from, err = time.Parse(time.RFC3339, s); err != nil {
			jsonError(w, "invalid from date", http.StatusBadRequest)
			return
		}
	} else {
		from = time.Now().AddDate(0, -1, 0)
	}
	if s := q.Get("to"); s != "" {
		if to, err = time.Parse(time.RFC3339, s); err != nil {
			jsonError(w, "invalid to date", http.StatusBadRequest)
			return
		}
	} else {
		to = time.Now().AddDate(0, 1, 0)
	}

	// H-04 fix + V3-H02 refactor: enforce server-side layer visibility filtering
	events := filterVisibleEvents(app.store.GetEvents(from, to, nil), app.visibleLayerSet(user))
	if events == nil {
		events = []Event{}
	}
	// Enrich with attachment and comment counts
	counts := app.store.attachmentCounts()
	ccounts := app.store.commentCounts()
	for i := range events {
		events[i].AttachmentCount = counts[events[i].ID]
		events[i].CommentCount = ccounts[events[i].ID]
	}
	jsonOK(w, events)
}

func (app *App) handleCreateEvent(w http.ResponseWriter, r *http.Request, user *User) {
	var e Event
	if err := decode(r, &e); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if e.Title == "" {
		jsonError(w, "title required", http.StatusBadRequest)
		return
	}
	// Sanitize user-supplied text fields to prevent stored XSS
	e.Title = stripHTMLTags(e.Title)
	e.Description = stripHTMLTags(e.Description)
	e.PhysicalLocation = stripHTMLTags(e.PhysicalLocation)
	e.LocationAddress = stripHTMLTags(e.LocationAddress)
	if e.EventType == "" {
		e.EventType = "event"
	}
	// Auto-calculate end_time for timed events
	if e.EventType == "timed_event" && e.TimedDurationMinutes > 0 && e.EndTime == nil {
		end := e.StartTime.Add(time.Duration(e.TimedDurationMinutes) * time.Minute)
		e.EndTime = &end
	}
	if e.Color == "" {
		if et, ok := app.store.GetEventTypeByKey(e.EventType); ok {
			e.Color = et.Color
		} else {
			e.Color = "#4A90D9"
		}
	}

	// Master-timeline events require oplead or admin
	if e.LayerID == nil && !app.canEditMasterTimelineUser(user) {
		jsonError(w, "only operations leads and admins may create master-timeline events", http.StatusForbidden)
		return
	}
	// Check layer write permission and existence
	if e.LayerID != nil {
		if _, ok := app.store.GetLayerByID(*e.LayerID); !ok {
			jsonError(w, "layer not found", http.StatusBadRequest)
			return
		}
		if !app.canWriteLayer(*e.LayerID, user) {
			jsonError(w, "no write permission on this layer", http.StatusForbidden)
			return
		}
	}
	// Validate responsible user exists (if specified)
	if e.ResponsibleID != nil && *e.ResponsibleID != 0 {
		if _, ok := app.store.GetUserByID(*e.ResponsibleID); !ok {
			jsonError(w, "responsible user not found", http.StatusBadRequest)
			return
		}
	}

	if e.Status == "" {
		e.Status = StatusPlanned
	}
	e.CreatedBy = user.ID
	e.CreatedByName = user.DisplayName

	// Check for scheduling overlaps (non-blocking: returns warnings)
	overlaps := app.store.CheckOverlaps(e.StartTime, e.EndTime, e.ResponsibleID, e.InvitedUserIDs, 0)

	created, err := app.store.CreateEvent(e)
	if err != nil {
		jsonError(w, "failed to create event", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "event", created.ID,
		fmt.Sprintf("Created event %q", created.Title))

	// Notify invited users and group members
	notifyUsers := make(map[int64]bool)
	for _, uid := range created.InvitedUserIDs {
		notifyUsers[uid] = true
	}
	for _, gid := range created.InvitedGroupIDs {
		for _, m := range app.store.GetGroupMembers(gid) {
			notifyUsers[m.UserID] = true
		}
	}
	inviteNotif := AlarmNotification{
		EventID:    created.ID,
		EventTitle: created.Title,
		EventTime:  created.StartTime,
		Message:    fmt.Sprintf("You have been invited to: %s", created.Title),
	}
	for uid := range notifyUsers {
		if uid != user.ID {
			app.broker.Notify(uid, inviteNotif)
		}
	}

	// Notify responsible user if set and different from creator
	if created.ResponsibleID != nil && *created.ResponsibleID != user.ID {
		app.notifyUser(*created.ResponsibleID, "event",
			"Assigned: "+created.Title,
			fmt.Sprintf("You have been assigned as responsible for event %q by %s", created.Title, user.DisplayName),
			fmt.Sprintf("%d", created.ID))
	}

	app.broadcastEventChange(user.ID, "created", &created)
	logDebug("event created: id=%d title=%q user=%s", created.ID, created.Title, user.Username)
	w.WriteHeader(http.StatusCreated)
	// Include overlap_warnings alongside event fields for non-breaking backward compat
	type createResp struct {
		Event
		OverlapWarnings []OverlapWarning `json:"overlap_warnings,omitempty"`
	}
	jsonOK(w, createResp{Event: created, OverlapWarnings: overlaps})
}

func (app *App) handleUpdateEvent(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// Master-timeline events: oplead+
	if existing.LayerID == nil && !app.canEditMasterTimelineUser(user) {
		jsonError(w, "only operations leads and admins may edit master-timeline events", http.StatusForbidden)
		return
	}
	// Layer events: creator or readwrite+ with layer write access
	if existing.LayerID != nil && existing.CreatedBy != user.ID && !app.effectiveHasRole(user, RoleReadWrite) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	// H-04 fix: verify canWriteLayer for layer events (even for readwrite users)
	if existing.LayerID != nil && !app.effectiveHasRole(user, RoleAdmin) {
		if !app.canWriteLayer(*existing.LayerID, user) {
			jsonError(w, "no write permission on this layer", http.StatusForbidden)
			return
		}
	}
	var e Event
	if err := decode(r, &e); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Sanitize user-supplied text fields to prevent stored XSS
	e.Title = stripHTMLTags(e.Title)
	e.Description = stripHTMLTags(e.Description)
	e.PhysicalLocation = stripHTMLTags(e.PhysicalLocation)
	e.LocationAddress = stripHTMLTags(e.LocationAddress)
	e.ID = id
	e.CreatedBy = existing.CreatedBy
	e.CreatedByName = existing.CreatedByName
	e.CreatedAt = existing.CreatedAt
	// Preserve verification fields unless status is being changed via patch
	e.VerifiedBy = existing.VerifiedBy
	e.VerifiedByName = existing.VerifiedByName
	e.VerifiedAt = existing.VerifiedAt
	e.RejectionReason = existing.RejectionReason
	if e.Status == "" {
		e.Status = existing.Status
	}
	if e.Color == "" {
		if et, ok := app.store.GetEventTypeByKey(e.EventType); ok {
			e.Color = et.Color
		}
	}
	// Auto-calculate end_time for timed events
	if e.EventType == "timed_event" && e.TimedDurationMinutes > 0 && e.EndTime == nil {
		end := e.StartTime.Add(time.Duration(e.TimedDurationMinutes) * time.Minute)
		e.EndTime = &end
	}
	// Check for scheduling overlaps (non-blocking: returns warnings)
	overlaps := app.store.CheckOverlaps(e.StartTime, e.EndTime, e.ResponsibleID, e.InvitedUserIDs, id)

	// Save version snapshot before updating
	app.store.CreateEventVersion(EventVersion{ //nolint
		EventID:       id,
		ChangedBy:     user.ID,
		ChangedByName: user.DisplayName,
		ChangeNote:    fmt.Sprintf("Updated by %s", user.DisplayName),
		Snapshot:      *existing,
	})

	// Preserve planned start/end: only set them if not already set (first update after creation)
	if e.PlannedStart == nil && existing.PlannedStart == nil {
		e.PlannedStart = &existing.StartTime
	} else if existing.PlannedStart != nil {
		e.PlannedStart = existing.PlannedStart
	}
	if e.PlannedEnd == nil && existing.PlannedEnd == nil {
		e.PlannedEnd = existing.EndTime
	} else if existing.PlannedEnd != nil {
		e.PlannedEnd = existing.PlannedEnd
	}

	// Release any editing lock held by this user
	app.store.ReleaseEditingLock(id, user.ID)

	if err := app.store.UpdateEvent(e); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "event", id,
		fmt.Sprintf("Updated event %q", existing.Title))
	updated, _ := app.store.GetEventByID(id)
	app.broadcastEventChange(user.ID, "updated", updated)
	logDebug("event updated: id=%d title=%q user=%s", updated.ID, updated.Title, user.Username)
	type updateResp struct {
		Event
		OverlapWarnings []OverlapWarning `json:"overlap_warnings,omitempty"`
	}
	jsonOK(w, updateResp{Event: *updated, OverlapWarnings: overlaps})
}

func (app *App) handlePatchEventStatus(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	var req struct {
		Status          string `json:"status"`
		RejectionReason string `json:"rejection_reason"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	newStatus := EventStatus(req.Status)
	// Read-only / observer users cannot change event status at all
	if !app.effectiveHasRole(user, RoleReporter) {
		jsonError(w, "insufficient permissions to change event status", http.StatusForbidden)
		return
	}
	// Verify/reject require teamlead+
	if (newStatus == StatusVerified || newStatus == StatusRejected) && !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "team lead or above required to verify or reject events", http.StatusForbidden)
		return
	}
	// Reporter role: can only set responded_to or completed (pending approval)
	if app.effectiveHasRole(user, RoleReporter) && !app.effectiveHasRole(user, RoleReadWrite) {
		if newStatus != StatusRespondedTo && newStatus != StatusCompleted {
			jsonError(w, "reporters may only set status to responded_to or completed", http.StatusForbidden)
			return
		}
		// For reporters, status changes require team lead approval - handled via comments
	}
	if newStatus == StatusRejected && strings.TrimSpace(req.RejectionReason) == "" {
		jsonError(w, "rejection_reason is required when rejecting", http.StatusBadRequest)
		return
	}
	existing.Status = newStatus
	if newStatus == StatusVerified {
		now := time.Now()
		existing.VerifiedBy = user.ID
		existing.VerifiedByName = user.DisplayName
		existing.VerifiedAt = &now
		existing.RejectionReason = ""
	} else if newStatus == StatusRejected {
		existing.RejectionReason = req.RejectionReason
		existing.VerifiedBy = 0
		existing.VerifiedByName = ""
		existing.VerifiedAt = nil
	} else {
		// Clear verification data when moving to any other status
		existing.VerifiedBy = 0
		existing.VerifiedByName = ""
		existing.VerifiedAt = nil
		existing.RejectionReason = ""
	}
	if err := app.store.UpdateEvent(*existing); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "status_changed", "event", id,
		fmt.Sprintf("Event %q → %s", existing.Title, newStatus))
	updated, _ := app.store.GetEventByID(id)
	app.broadcastEventChange(user.ID, "status_changed", updated)
	jsonOK(w, updated)
}

func (app *App) handleDeleteEvent(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.CreatedBy != user.ID && !app.effectiveHasRole(user, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	// M-04 fix: check layer write access for non-admin users
	if existing.LayerID != nil && !app.effectiveHasRole(user, RoleAdmin) {
		if !app.canWriteLayer(*existing.LayerID, user) {
			jsonError(w, "no write permission on this layer", http.StatusForbidden)
			return
		}
	}
	title := existing.Title
	if err := app.store.DeleteEvent(id); err != nil {
		jsonError(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "event", id,
		fmt.Sprintf("Deleted event %q", title))
	// Broadcast deletion to other clients
	deletedEv := &Event{ID: id, Title: title}
	app.broadcastEventChange(user.ID, "deleted", deletedEv)
	logDebug("event deleted: id=%d title=%q user=%s", id, title, user.Username)
	jsonOK(w, map[string]string{"status": "deleted"})
}

func (app *App) handleDuplicateEvent(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	dup := *existing
	dup.ID = 0
	dup.Title = existing.Title + " (copy)"
	dup.Status = StatusPlanned
	dup.CreatedBy = user.ID
	dup.CreatedByName = user.DisplayName
	if dup.CreatedByName == "" {
		dup.CreatedByName = user.Username
	}
	dup.VerifiedBy = 0
	dup.VerifiedByName = ""
	dup.VerifiedAt = nil
	dup.RejectionReason = ""
	created, err := app.store.CreateEvent(dup)
	if err != nil {
		jsonError(w, "failed to duplicate", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "event", created.ID,
		fmt.Sprintf("Duplicated event %q from #%d", created.Title, id))
	app.broadcastEventChange(user.ID, "created", &created)
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

// handleGetActivityFeed returns recent audit entries as an activity stream
func (app *App) handleGetActivityFeed(w http.ResponseWriter, r *http.Request, user *User) {
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 500 {
		limit = l
	}
	entries := app.store.GetAudit(limit)
	if entries == nil {
		entries = []AuditEntry{}
	}
	jsonOK(w, entries)
}
