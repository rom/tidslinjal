package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Decision Log handlers ─────────────────────────────────────────────────────

func (app *App) handleListDecisionLog(w http.ResponseWriter, r *http.Request, user *User) {
	entries := app.store.GetDecisionLog()
	// Filter by access: admin sees all; others see general, own, and same-group entries
	var visible []DecisionLogEntry
	hasConfidentialRead := app.userHasCapability(user, "confidential_read")
	isAdmin := user.Role == RoleAdmin
	for _, e := range entries {
		if e.Confidential && !hasConfidentialRead && !isAdmin {
			// For confidential entries, only expose: timestamp, who decided, and confidential flag
			e.Decision = ""
			e.Title = ""
			e.ReviewComment = ""
			e.Attachments = nil
			e.ExecutorType = ""
			e.ExecutorValue = ""
			e.ExecutorLabel = ""
			e.RequestedOfType = ""
			e.RequestedOfValue = ""
			e.RequestedOfLabel = ""
		}
		if isAdmin || e.LogType == "general" || e.UserID == user.ID {
			visible = append(visible, e)
		} else if e.LogType == "group" && e.GroupID > 0 {
			if app.userInGroup(user.ID, e.GroupID) {
				visible = append(visible, e)
			}
		}
	}
	if visible == nil {
		visible = []DecisionLogEntry{}
	}
	jsonOK(w, visible)
}

func (app *App) handleAddDecisionLogEntry(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Title             string `json:"title"`
		Decision          string `json:"decision"`
		LogType           string `json:"log_type"`
		GroupID           int64  `json:"group_id"`
		Confidential      bool   `json:"confidential"`
		Status            string `json:"status"`              // "" = decided, "requested" = request for decision
		ApprovalType      string `json:"approval_type"`       // "approved" | "approved_with_condition" | "approved_with_modification"
		RequestedOfType   string `json:"requested_of_type"`   // "role" | "group" | "person"
		RequestedOfValue  string `json:"requested_of_value"`  // role key, group id, or user id
		RequestedOfLabel  string `json:"requested_of_label"`  // display name
		ExecutorType      string `json:"executor_type"`       // "role" | "group" | "person"
		ExecutorValue     string `json:"executor_value"`
		ExecutorLabel     string `json:"executor_label"`
		Reason            string `json:"reason"`
		CoSignRequired    bool   `json:"co_sign_required"`
		Deadline          string `json:"deadline"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Decision == "" {
		jsonError(w, "decision text required", http.StatusBadRequest)
		return
	}
	if req.LogType == "" {
		req.LogType = "general"
	}
	// Validate status
	if req.Status != "" && req.Status != "requested" {
		jsonError(w, "status must be empty or 'requested'", http.StatusBadRequest)
		return
	}
	// Check capability – admin always allowed
	if user.Role != RoleAdmin && !app.userHasCapability(user, "decision_log_readwrite") && !hasRole(user.Role, RoleTeamLead) {
		jsonError(w, "insufficient permissions", http.StatusForbidden)
		return
	}
	now := time.Now()
	// Validate approval_type for direct decisions
	if req.Status == "" && req.ApprovalType != "" {
		switch req.ApprovalType {
		case "approved", "approved_with_condition", "approved_with_modification":
			// valid
		default:
			req.ApprovalType = "approved"
		}
	}
	if req.Status == "" && req.ApprovalType == "" {
		req.ApprovalType = "approved"
	}
	entry := DecisionLogEntry{
		Timestamp:         now,
		UserID:            user.ID,
		UserName:          user.Username,
		DisplayName:       user.DisplayName,
		Title:             stripHTMLTags(req.Title),
		Status:            req.Status,
		Decision:          stripHTMLTags(req.Decision),
		LogType:           req.LogType,
		GroupID:            req.GroupID,
		Confidential:      req.Confidential,
		RequestedOfType:   req.RequestedOfType,
		RequestedOfValue:  req.RequestedOfValue,
		RequestedOfLabel:  req.RequestedOfLabel,
		ExecutorType:      req.ExecutorType,
		ExecutorValue:     req.ExecutorValue,
		ExecutorLabel:     req.ExecutorLabel,
		Reason:            req.Reason,
		CoSignRequired:    req.CoSignRequired,
		Deadline:          req.Deadline,
	}
	if req.Status == "requested" {
		entry.RequestedAt = &now
	} else {
		entry.ApprovalType = req.ApprovalType
		entry.DecidedAt = &now
	}
	created, err := app.store.AddDecisionLogEntry(entry)
	if err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	// Generate sequence number from exercise name + sequential ID
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
	auditAction := "created"
	var auditSummary string
	if req.Confidential {
		// Confidential decisions: log ONLY ID, user, time — no text at all
		auditSummary = fmt.Sprintf("Decision %s created (confidential)", created.SequenceNumber)
		if req.Status == "requested" {
			auditAction = "requested"
			auditSummary = fmt.Sprintf("Decision %s requested (confidential)", created.SequenceNumber)
		}
	} else {
		decisionText := req.Decision
		if req.Title != "" {
			decisionText = req.Title + ": " + req.Decision
		}
		auditSummary = fmt.Sprintf("Decision %s added: %s", created.SequenceNumber, decisionText)
		if req.Status == "requested" {
			auditAction = "requested"
			auditSummary = fmt.Sprintf("Decision %s requested: %s", created.SequenceNumber, decisionText)
		}
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: auditAction, EntityType: "decision_log", EntityID: created.ID,
		Summary: auditSummary,
	})
	// Notify executor via SSE if a person is assigned
	if req.ExecutorType == "person" && req.ExecutorValue != "" {
		execID, _ := strconv.ParseInt(req.ExecutorValue, 10, 64)
		if execID > 0 {
			titleInfo := created.SequenceNumber
			if created.Title != "" {
				titleInfo = created.Title + " (" + created.SequenceNumber + ")"
			}
			payload, _ := json.Marshal(map[string]any{
				"decision_id":     created.ID,
				"sequence_number": created.SequenceNumber,
				"title":           titleInfo,
				"assigned_by":     user.DisplayName,
				"executor_id":     execID,
			})
			app.broker.BroadcastAll(SSEMessage{Event: "decision_assigned", Data: string(payload)})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (app *App) handleDeleteDecisionLogEntry(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteDecisionLogEntry(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "deleted", EntityType: "decision_log", EntityID: id,
		Summary: fmt.Sprintf("Deleted decision log entry #%d", id),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleReviewDecisionLogEntry(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}

	// Authorization: only admin, oplead, deputy_oplead, or someone acting as oplead on duty
	canReview := user.Role == RoleAdmin || user.Role == RoleOpLead || user.Role == RoleDeputyOpLead
	if !canReview {
		// Check if user is set as acting oplead via staff duties
		for _, d := range app.store.GetStaffDuties() {
			if d.UserID == user.ID && (d.Role == "acting_oplead" || d.Role == "acting_deputy_oplead") {
				canReview = true
				break
			}
		}
	}
	if !canReview {
		jsonError(w, "only admin, Operations Lead, Deputy Operations Lead, or acting OpLead can review decisions", http.StatusForbidden)
		return
	}

	var req struct {
		Status       string `json:"status"`        // "approved" or "rejected"
		Comment      string `json:"comment"`
		ApprovalType string `json:"approval_type"`  // "approved" | "approved_with_condition" | "approved_with_modification"
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Accept "denied" as alias for "rejected"
	if req.Status == "denied" {
		req.Status = "rejected"
	}
	if req.Status != "approved" && req.Status != "rejected" {
		jsonError(w, "status must be 'approved', 'denied', or 'rejected'", http.StatusBadRequest)
		return
	}
	// Denial requires a reason/comment
	if req.Status == "rejected" && strings.TrimSpace(req.Comment) == "" {
		jsonError(w, "a reason is required when denying a decision", http.StatusBadRequest)
		return
	}
	// Validate approval type
	if req.Status == "approved" && req.ApprovalType == "" {
		req.ApprovalType = "approved"
	}
	if req.Status == "approved" && req.ApprovalType != "approved" && req.ApprovalType != "approved_with_condition" && req.ApprovalType != "approved_with_modification" {
		req.ApprovalType = "approved"
	}
	entries := app.store.GetDecisionLog()
	var found *DecisionLogEntry
	for i := range entries {
		if entries[i].ID == id {
			found = &entries[i]
			break
		}
	}
	if found == nil {
		jsonError(w, "entry not found", http.StatusNotFound)
		return
	}
	now := time.Now()
	found.Status = req.Status
	found.ReviewedBy = user.ID
	found.ReviewedByName = user.DisplayName
	if found.ReviewedByName == "" {
		found.ReviewedByName = user.Username
	}
	found.ReviewedAt = &now
	found.ReviewComment = req.Comment
	if req.Status == "approved" {
		found.ApprovalType = req.ApprovalType
		found.DecidedAt = &now
	}
	if err := app.store.UpdateDecisionLogEntry(*found); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	reviewSummary := fmt.Sprintf("%s decision %s (#%d): %s — %s", req.Status, found.SequenceNumber, id, found.Decision, req.Comment)
	if found.Confidential {
		reviewSummary = fmt.Sprintf("%s decision %s (#%d) (confidential)", req.Status, found.SequenceNumber, id)
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: req.Status, EntityType: "decision_log", EntityID: id,
		Summary: reviewSummary,
	})
	// Notify the original requester about the decision outcome via SSE
	if found.UserID > 0 {
		outcomeLabel := "approved"
		if req.Status == "rejected" {
			outcomeLabel = "denied"
		}
		payload, _ := json.Marshal(map[string]any{
			"decision_id":      found.ID,
			"sequence_number":  found.SequenceNumber,
			"title":            found.Title,
			"decision":         found.Decision,
			"outcome":          outcomeLabel,
			"approval_type":    found.ApprovalType,
			"decided_by":      user.DisplayName,
			"decided_by_id":   user.ID,
			"comment":         req.Comment,
			"reason":          found.Reason,
			"requester_id":    found.UserID,
			"reviewed_at":     found.ReviewedAt,
			"status":          found.Status,
		})
		// Send targeted notification to the original requester
		app.broker.SendToUser(found.UserID, SSEMessage{Event: "decision_outcome", Data: string(payload)})
		// Also broadcast to all for decision log refresh
		app.broker.BroadcastAll(SSEMessage{Event: "decision_outcome", Data: string(payload)})
	}
	jsonOK(w, found)
}

func (app *App) handleCoSignDecisionLogEntry(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		Comment string `json:"comment"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	entries := app.store.GetDecisionLog()
	var found *DecisionLogEntry
	for i := range entries {
		if entries[i].ID == id {
			found = &entries[i]
			break
		}
	}
	if found == nil {
		jsonError(w, "entry not found", http.StatusNotFound)
		return
	}
	if !found.CoSignRequired {
		jsonError(w, "co-sign not required for this entry", http.StatusBadRequest)
		return
	}
	if found.CoSignedBy != 0 {
		jsonError(w, "already co-signed", http.StatusConflict)
		return
	}
	if found.UserID == user.ID {
		jsonError(w, "cannot co-sign your own decision", http.StatusForbidden)
		return
	}
	now := time.Now()
	found.CoSignedBy = user.ID
	found.CoSignedByName = user.DisplayName
	if found.CoSignedByName == "" {
		found.CoSignedByName = user.Username
	}
	found.CoSignedAt = &now
	found.CoSignComment = req.Comment
	if err := app.store.UpdateDecisionLogEntry(*found); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "co_signed", EntityType: "decision_log", EntityID: id,
		Summary: fmt.Sprintf("co-signed decision #%d", id),
	})
	jsonOK(w, found)
}

func (app *App) handleDecisionLogAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	// Check permission
	if user.Role != RoleAdmin && !app.userHasCapability(user, "decision_log_readwrite") && !hasRole(user.Role, RoleTeamLead) {
		jsonError(w, "insufficient permissions", http.StatusForbidden)
		return
	}
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB
		jsonError(w, "file too large (max 10 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field missing", http.StatusBadRequest)
		return
	}
	defer file.Close()
	safeFilename := filepath.Base(header.Filename)
	if safeFilename == "." || safeFilename == "/" {
		safeFilename = "upload"
	}
	if isDangerousFilename(safeFilename) {
		jsonError(w, "file type not allowed", http.StatusBadRequest)
		return
	}
	storedName := fmt.Sprintf("dl_%d_%d_%s", id, time.Now().UnixNano(), safeFilename)
	destPath := filepath.Join(app.store.AttachmentDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	written, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(destPath)
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	att := DecisionAttachment{
		Filename:   safeFilename,
		StoredName: storedName,
		Size:       written,
		MimeType:   header.Header.Get("Content-Type"),
	}
	if err := app.store.AddDecisionLogAttachment(id, att); err != nil {
		os.Remove(destPath)
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(att)
}

func (app *App) handleDecisionLogAttachmentDownload(w http.ResponseWriter, r *http.Request) {
	entryID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	storedName := filepath.Base(r.PathValue("filename"))
	// Validate the decision log entry exists and the attachment belongs to it
	entry := app.store.GetDecisionLogEntryByID(entryID)
	if entry == nil {
		http.NotFound(w, r)
		return
	}
	found := false
	for _, att := range entry.Attachments {
		if att.StoredName == storedName {
			found = true
			break
		}
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	filePath := filepath.Join(app.store.AttachmentDir(), storedName)
	if _, err := os.Stat(filePath); err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	mimeType := mime.TypeByExtension(filepath.Ext(storedName))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mimeType)
	safeDisp := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, storedName)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeDisp))
	http.ServeFile(w, r, filePath)
}

// userInGroup checks if a user is a member of a specific group
func (app *App) userInGroup(userID, groupID int64) bool {
	members := app.store.GetGroupMembers(groupID)
	for _, m := range members {
		if m.UserID == userID {
			return true
		}
	}
	return false
}

// userHasCapability checks if a user has a specific capability via role config
func (app *App) userHasCapability(user *User, cap string) bool {
	// Admin always has all capabilities
	if user.Role == RoleAdmin {
		return true
	}
	for _, rc := range app.store.GetRoleConfigs() {
		if rc.Key == string(user.Role) {
			return rc.Capabilities[cap]
		}
	}
	return false
}

// ── Decision Request handler (any authenticated user) ─────────────────────────
func (app *App) handleRequestDecision(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Title            string `json:"title"`
		Decision         string `json:"decision"`
		LogType          string `json:"log_type"`
		GroupID          int64  `json:"group_id"`
		Confidential     bool   `json:"confidential"`
		Reason           string `json:"reason"`
		RequestedOfType  string `json:"requested_of_type"`
		RequestedOfValue string `json:"requested_of_value"`
		RequestedOfLabel string `json:"requested_of_label"`
		Deadline         string `json:"deadline"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Decision == "" {
		jsonError(w, "decision request text is required", http.StatusBadRequest)
		return
	}
	if req.LogType == "" {
		req.LogType = "general"
	}
	now := time.Now()
	entry := DecisionLogEntry{
		Timestamp:        now,
		UserID:           user.ID,
		UserName:         user.Username,
		DisplayName:      user.DisplayName,
		Title:            req.Title,
		Decision:         req.Decision,
		LogType:          req.LogType,
		GroupID:          req.GroupID,
		Confidential:     req.Confidential,
		Status:           "requested",
		RequestedAt:      &now,
		RequestedOfType:  req.RequestedOfType,
		RequestedOfValue: req.RequestedOfValue,
		RequestedOfLabel: req.RequestedOfLabel,
		Reason:           req.Reason,
		Deadline:         req.Deadline,
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
	auditSummary := fmt.Sprintf("Decision %s requested: %s", created.SequenceNumber, req.Decision)
	if req.Confidential {
		auditSummary = fmt.Sprintf("Decision %s requested (confidential)", created.SequenceNumber)
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "requested", EntityType: "decision_log", EntityID: created.ID,
		Summary: auditSummary,
	})
	// Broadcast decision request via SSE
	titleInfo := created.SequenceNumber
	if created.Title != "" {
		titleInfo = created.Title + " (" + created.SequenceNumber + ")"
	}
	payload, _ := json.Marshal(map[string]any{
		"decision_id":     created.ID,
		"sequence_number": created.SequenceNumber,
		"title":           titleInfo,
		"requested_by":    user.DisplayName,
		"requested_of":    req.RequestedOfLabel,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "decision_requested", Data: string(payload)})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

// ── Decision Log Share Token ────────────────────────────────────────────────

func (app *App) handleGenerateDecisionLogShareToken(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetDecisionLogEntryByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	token, err := generateID()
	if err != nil {
		jsonError(w, "failed to generate token", http.StatusInternalServerError)
		return
	}
	entry.ShareToken = token
	if err := app.store.UpdateDecisionLogEntry(*entry); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "share", "decision_log", entry.ID, fmt.Sprintf("Generated share link for decision #%d", entry.ID))
	jsonOK(w, map[string]string{"share_token": token})
}

func (app *App) handleGetDecisionLogByShareToken(w http.ResponseWriter, r *http.Request, user *User) {
	token := r.URL.Query().Get("token")
	if token == "" {
		jsonError(w, "token is required", http.StatusBadRequest)
		return
	}
	entries := app.store.GetDecisionLog()
	for _, e := range entries {
		if e.ShareToken != "" && e.ShareToken == token {
			// Check access: confidential entries require capability
			if e.Confidential && !app.userHasCapability(user, "confidential_read") && user.Role != RoleAdmin {
				jsonError(w, "forbidden", http.StatusForbidden)
				return
			}
			// Private entries require being the author or admin
			if e.LogType == "private" && e.UserID != user.ID && user.Role != RoleAdmin {
				jsonError(w, "forbidden", http.StatusForbidden)
				return
			}
			// Group entries require group membership
			if e.LogType == "group" && user.Role != RoleAdmin {
				inGroup := false
				for _, gid := range app.userGroups(user.ID) {
					if gid == e.GroupID {
						inGroup = true
						break
					}
				}
				if !inGroup && e.UserID != user.ID {
					jsonError(w, "forbidden", http.StatusForbidden)
					return
				}
			}
			jsonOK(w, e)
			return
		}
	}
	jsonError(w, "invalid or expired share link", http.StatusNotFound)
}
