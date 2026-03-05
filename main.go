package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── SSE broker ────────────────────────────────────────────────────────────────

type SSEClient struct {
	userID int64
	ch     chan AlarmNotification
}

type SSEBroker struct {
	mu      sync.Mutex
	clients map[*SSEClient]struct{}
}

func NewSSEBroker() *SSEBroker {
	return &SSEBroker{clients: make(map[*SSEClient]struct{})}
}

func (b *SSEBroker) Subscribe(userID int64) *SSEClient {
	b.mu.Lock()
	defer b.mu.Unlock()
	c := &SSEClient{userID: userID, ch: make(chan AlarmNotification, 8)}
	b.clients[c] = struct{}{}
	return c
}

func (b *SSEBroker) Unsubscribe(c *SSEClient) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, c)
}

func (b *SSEBroker) Notify(userID int64, n AlarmNotification) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for c := range b.clients {
		if c.userID == userID {
			select {
			case c.ch <- n:
			default:
			}
		}
	}
}

// ── App ───────────────────────────────────────────────────────────────────────

type App struct {
	store  *Store
	broker *SSEBroker
}

func NewApp(dataDir string) (*App, error) {
	store, err := NewStore(dataDir)
	if err != nil {
		return nil, err
	}
	if err := store.SeedEventTypes(); err != nil {
		return nil, err
	}
	app := &App{store: store, broker: NewSSEBroker()}

	if len(store.GetUsers()) == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		store.CreateUser(User{ //nolint
			Username:     "admin",
			PasswordHash: string(hash),
			DisplayName:  "Administrator",
			Role:         RoleAdmin,
			CanLock:      true,
		})
		log.Println("Created default admin (username: admin, password: admin)")
	}
	return app, nil
}

// ── Middleware ─────────────────────────────────────────────────────────────────

func (app *App) getSession(r *http.Request) (*Session, *User) {
	cookie, err := r.Cookie("session")
	if err != nil {
		return nil, nil
	}
	sess, ok := app.store.GetSession(cookie.Value)
	if !ok {
		return nil, nil
	}
	user, ok := app.store.GetUserByID(sess.UserID)
	if !ok {
		return nil, nil
	}
	return sess, user
}

func (app *App) requireAuth(next func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, user := app.getSession(r)
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r, user)
	}
}

func (app *App) requireRole(role Role, next func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return app.requireAuth(func(w http.ResponseWriter, r *http.Request, user *User) {
		if !hasRole(user.Role, role) {
			jsonError(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r, user)
	})
}

func hasRole(userRole, required Role) bool {
	order := map[Role]int{
		RoleRead:      0,
		RoleReporter:  1,
		RoleReadWrite: 2,
		RoleTeamLead:  3,
		RoleOpLead:    4,
		RoleAdmin:     5,
	}
	return order[userRole] >= order[required]
}

func canEditMasterTimeline(role Role) bool {
	return hasRole(role, RoleOpLead)
}

// audit is a fire-and-forget convenience wrapper
func (app *App) audit(userID int64, userName, action, entityType string, entityID int64, summary string) {
	app.store.LogAudit(AuditEntry{ //nolint
		UserID: userID, UserName: userName,
		Action: action, EntityType: entityType, EntityID: entityID,
		Summary: summary,
	})
}

// callWebhook fires a user's configured webhook (if any) asynchronously
func (app *App) callWebhook(userID int64, msg string, notif AlarmNotification) {
	prefs := app.store.GetPreferences(userID)
	if prefs.WebhookURL == "" {
		return
	}
	var payload []byte
	switch prefs.WebhookType {
	case "mattermost", "slack":
		payload, _ = json.Marshal(map[string]string{"text": msg})
	default:
		payload, _ = json.Marshal(map[string]interface{}{
			"message":     msg,
			"event_title": notif.EventTitle,
			"event_time":  notif.EventTime.Format(time.RFC3339),
			"alarm_id":    notif.AlarmID,
		})
	}
	go func() {
		resp, err := http.Post(prefs.WebhookURL, "application/json", bytes.NewReader(payload))
		if err != nil {
			log.Printf("webhook for user %d failed: %v", userID, err)
			return
		}
		resp.Body.Close()
	}()
}

func (app *App) userGroups(userID int64) []int64 {
	memberships := app.store.GetUserGroups(userID)
	ids := make([]int64, len(memberships))
	for i, m := range memberships {
		ids[i] = m.GroupID
	}
	return ids
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func jsonOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func decode(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}

func generateID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func pathID(r *http.Request) (int64, error) {
	parts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
	return strconv.ParseInt(parts[len(parts)-1], 10, 64)
}

func pathSegment(r *http.Request, n int) string {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if n < len(parts) {
		return parts[n]
	}
	return ""
}

// ── Auth handlers ──────────────────────────────────────────────────────────────

func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	user, ok := app.store.GetUserByUsername(req.Username)
	if !ok {
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	sessID, err := generateID()
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	sess := Session{ID: sessID, UserID: user.ID, ExpiresAt: time.Now().Add(24 * time.Hour)}
	if err := app.store.CreateSession(sess); err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: "session", Value: sessID, Path: "/",
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Expires: sess.ExpiresAt,
	})
	app.audit(user.ID, user.DisplayName, "login", "user", user.ID,
		fmt.Sprintf("User %q logged in", user.Username))
	jsonOK(w, user.Public())
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("session"); err == nil {
		app.store.DeleteSession(c.Value) //nolint
	}
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", Expires: time.Unix(0, 0)})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleMe(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, user.Public())
}

func (app *App) handleChangePassword(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.NewPassword == "" {
		jsonError(w, "new password required", http.StatusBadRequest)
		return
	}
	// Verify current password (unless admin changing own or other — here it's always self)
	fullUser, ok := app.store.GetUserByID(user.ID)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	if req.CurrentPassword != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(fullUser.PasswordHash), []byte(req.CurrentPassword)); err != nil {
			jsonError(w, "current password incorrect", http.StatusUnauthorized)
			return
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	fullUser.PasswordHash = string(hash)
	if err := app.store.UpdateUser(*fullUser); err != nil {
		jsonError(w, "failed to update password", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "user", EntityID: user.ID,
		Summary: "changed own password",
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Preferences handlers ───────────────────────────────────────────────────────

func (app *App) handleGetPreferences(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetPreferences(user.ID))
}

func (app *App) handleSavePreferences(w http.ResponseWriter, r *http.Request, user *User) {
	var p UserPreferences
	if err := decode(r, &p); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	p.UserID = user.ID
	if p.HiddenTypes == nil {
		p.HiddenTypes = []string{}
	}
	if p.ActiveLayers == nil {
		p.ActiveLayers = []int64{}
	}
	if err := app.store.SavePreferences(p); err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	jsonOK(w, p)
}

// ── Event type handlers ────────────────────────────────────────────────────────

func (app *App) handleGetEventTypes(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, app.store.GetEventTypes())
}

func (app *App) handleCreateEventType(w http.ResponseWriter, r *http.Request, user *User) {
	var et EventTypeDef
	if err := decode(r, &et); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if et.Key == "" || et.Label == "" {
		jsonError(w, "key and label required", http.StatusBadRequest)
		return
	}
	if et.Color == "" {
		et.Color = "#666666"
	}
	et.IsSystem = false
	et.CreatedBy = user.ID

	created, err := app.store.CreateEventType(et)
	if err != nil {
		jsonError(w, "failed to create", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdateEventType(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventTypeByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// System types editable only by admin; custom types by creator or admin
	if existing.IsSystem && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if !existing.IsSystem && existing.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var et EventTypeDef
	if err := decode(r, &et); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	et.ID = id
	et.Key = existing.Key // key is immutable
	et.IsSystem = existing.IsSystem
	et.CreatedBy = existing.CreatedBy
	et.CreatedAt = existing.CreatedAt

	if err := app.store.UpdateEventType(et); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetEventTypeByID(id)
	jsonOK(w, updated)
}

func (app *App) handleDeleteEventType(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventTypeByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.IsSystem {
		jsonError(w, "cannot delete system event type", http.StatusBadRequest)
		return
	}
	if existing.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteEventType(id); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

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

	// Return all events; layer visibility is filtered client-side
	events := app.store.GetEvents(from, to, nil)
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
	if e.EventType == "" {
		e.EventType = "event"
	}
	if e.Color == "" {
		if et, ok := app.store.GetEventTypeByKey(e.EventType); ok {
			e.Color = et.Color
		} else {
			e.Color = "#4A90D9"
		}
	}

	// Master-timeline events require oplead or admin
	if e.LayerID == nil && !canEditMasterTimeline(user.Role) {
		jsonError(w, "only operations leads and admins may create master-timeline events", http.StatusForbidden)
		return
	}
	// Check layer write permission
	if e.LayerID != nil {
		if !app.canWriteLayer(*e.LayerID, user) {
			jsonError(w, "no write permission on this layer", http.StatusForbidden)
			return
		}
	}

	if e.Status == "" {
		e.Status = StatusPlanned
	}
	e.CreatedBy = user.ID
	e.CreatedByName = user.DisplayName
	created, err := app.store.CreateEvent(e)
	if err != nil {
		jsonError(w, "failed to create event", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "event", created.ID,
		fmt.Sprintf("Created event %q", created.Title))
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
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
	if existing.LayerID == nil && !canEditMasterTimeline(user.Role) {
		jsonError(w, "only operations leads and admins may edit master-timeline events", http.StatusForbidden)
		return
	}
	// Layer events: creator or readwrite+
	if existing.LayerID != nil && existing.CreatedBy != user.ID && !hasRole(user.Role, RoleReadWrite) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var e Event
	if err := decode(r, &e); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
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
	if err := app.store.UpdateEvent(e); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "event", id,
		fmt.Sprintf("Updated event %q", existing.Title))
	updated, _ := app.store.GetEventByID(id)
	jsonOK(w, updated)
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
	// Verify/reject require teamlead+
	if (newStatus == StatusVerified || newStatus == StatusRejected) && !hasRole(user.Role, RoleTeamLead) {
		jsonError(w, "team lead or above required to verify or reject events", http.StatusForbidden)
		return
	}
	// Reporter role: can only set responded_to or completed (pending approval)
	if hasRole(user.Role, RoleReporter) && !hasRole(user.Role, RoleReadWrite) {
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
	if existing.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	title := existing.Title
	if err := app.store.DeleteEvent(id); err != nil {
		jsonError(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "event", id,
		fmt.Sprintf("Deleted event %q", title))
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Attachment handlers ────────────────────────────────────────────────────────

func (app *App) handleGetAttachments(w http.ResponseWriter, r *http.Request, user *User) {
	// path: /api/events/:id/attachments
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
	atts := app.store.GetAttachmentsByEvent(eventID)
	if atts == nil {
		atts = []Attachment{}
	}
	jsonOK(w, atts)
}

func (app *App) handleUploadAttachment(w http.ResponseWriter, r *http.Request, user *User) {
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
	if _, ok := app.store.GetEventByID(eventID); !ok {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}

	if err := r.ParseMultipartForm(25 << 20); err != nil {
		jsonError(w, "file too large (max 25 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field missing", http.StatusBadRequest)
		return
	}
	defer file.Close()

	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), header.Filename)
	destPath := filepath.Join(app.store.AttachmentDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	size, err := io.Copy(dst, file)
	if err != nil {
		jsonError(w, "failed to write file", http.StatusInternalServerError)
		return
	}

	mimeType := mime.TypeByExtension(filepath.Ext(header.Filename))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	att, err := app.store.CreateAttachment(Attachment{
		EventID:      eventID,
		Filename:     header.Filename,
		StoredName:   storedName,
		Size:         size,
		MimeType:     mimeType,
		UploadedBy:   user.ID,
		UploaderName: user.DisplayName,
	})
	if err != nil {
		jsonError(w, "failed to record attachment", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, att)
}

func (app *App) handleDownloadAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	att, ok := app.store.GetAttachmentByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	path := filepath.Join(app.store.AttachmentDir(), att.StoredName)
	w.Header().Set("Content-Type", att.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, att.Filename))
	http.ServeFile(w, r, path)
}

func (app *App) handleDeleteAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	att, ok := app.store.GetAttachmentByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if att.UploadedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	path := filepath.Join(app.store.AttachmentDir(), att.StoredName)
	os.Remove(path) //nolint
	if err := app.store.DeleteAttachment(id); err != nil {
		jsonError(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Layer helpers ──────────────────────────────────────────────────────────────

func (app *App) canWriteLayer(layerID int64, user *User) bool {
	layer, ok := app.store.GetLayerByID(layerID)
	if !ok {
		return false
	}
	if layer.OwnerID == user.ID || hasRole(user.Role, RoleAdmin) {
		return true
	}
	if layer.Visibility == "groups" && layer.Permission == "readwrite" {
		userGroups := app.userGroups(user.ID)
		groupSet := make(map[int64]bool)
		for _, gid := range userGroups {
			groupSet[gid] = true
		}
		for _, gid := range layer.GroupIDs {
			if groupSet[gid] {
				return true
			}
		}
	}
	return false
}

// ── Layer handlers ─────────────────────────────────────────────────────────────

func (app *App) handleGetLayers(w http.ResponseWriter, r *http.Request, user *User) {
	var layers []Layer
	if hasRole(user.Role, RoleAdmin) {
		// Admins see all layers
		layers = app.store.GetAllLayers()
	} else {
		userGroups := app.userGroups(user.ID)
		layers = app.store.GetLayersVisibleTo(user.ID, userGroups)
	}
	if layers == nil {
		layers = []Layer{}
	}
	jsonOK(w, layers)
}

func (app *App) handleCreateLayer(w http.ResponseWriter, r *http.Request, user *User) {
	var l Layer
	if err := decode(r, &l); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if l.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	if l.Visibility == "" {
		l.Visibility = "private"
	}
	if l.Permission == "" {
		l.Permission = "read"
	}
	l.OwnerID = user.ID
	l.OwnerName = user.DisplayName

	created, err := app.store.CreateLayer(l)
	if err != nil {
		jsonError(w, "failed to create layer", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdateLayer(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetLayerByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.OwnerID != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var l Layer
	if err := decode(r, &l); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	l.ID = id
	l.OwnerID = existing.OwnerID
	l.OwnerName = existing.OwnerName
	l.CreatedAt = existing.CreatedAt
	if l.GroupIDs == nil {
		l.GroupIDs = []int64{}
	}
	if err := app.store.UpdateLayer(l); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetLayerByID(id)
	jsonOK(w, updated)
}

func (app *App) handleDeleteLayer(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetLayerByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.OwnerID != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteLayer(id); err != nil {
		jsonError(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Group handlers ─────────────────────────────────────────────────────────────

func (app *App) handleGetGroups(w http.ResponseWriter, r *http.Request, user *User) {
	var groups []Group
	if hasRole(user.Role, RoleAdmin) {
		groups = app.store.GetGroups()
	} else {
		// Non-admins see only groups they're members of
		memberships := app.store.GetUserGroups(user.ID)
		for _, m := range memberships {
			if g, ok := app.store.GetGroupByID(m.GroupID); ok {
				groups = append(groups, *g)
			}
		}
	}
	if groups == nil {
		groups = []Group{}
	}
	jsonOK(w, groups)
}

func (app *App) handleCreateGroup(w http.ResponseWriter, r *http.Request, user *User) {
	var g Group
	if err := decode(r, &g); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if g.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	g.CreatedBy = user.ID
	created, err := app.store.CreateGroup(g)
	if err != nil {
		jsonError(w, "failed to create group", http.StatusInternalServerError)
		return
	}
	// Auto-add creator as admin
	app.store.AddGroupMember(GroupMembership{GroupID: created.ID, UserID: user.ID, Role: "admin"}) //nolint
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdateGroup(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetGroupByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var g Group
	if err := decode(r, &g); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	g.ID = id
	g.CreatedBy = existing.CreatedBy
	g.CreatedAt = existing.CreatedAt
	if err := app.store.UpdateGroup(g); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetGroupByID(id)
	jsonOK(w, updated)
}

func (app *App) handleDeleteGroup(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteGroup(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

func (app *App) handleGetGroupMembers(w http.ResponseWriter, r *http.Request, user *User) {
	// /api/groups/:id/members
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	groupID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid group id", http.StatusBadRequest)
		return
	}
	members := app.store.GetGroupMembers(groupID)
	type MemberView struct {
		GroupMembership
		DisplayName string `json:"display_name"`
		Username    string `json:"username"`
	}
	var result []MemberView
	for _, m := range members {
		mv := MemberView{GroupMembership: m}
		if u, ok := app.store.GetUserByID(m.UserID); ok {
			mv.DisplayName = u.DisplayName
			mv.Username = u.Username
		}
		result = append(result, mv)
	}
	if result == nil {
		result = []MemberView{}
	}
	jsonOK(w, result)
}

func (app *App) handleAddGroupMember(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	groupID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid group id", http.StatusBadRequest)
		return
	}
	var req struct {
		UserID int64  `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = "member"
	}
	if err := app.store.AddGroupMember(GroupMembership{GroupID: groupID, UserID: req.UserID, Role: req.Role}); err != nil {
		jsonError(w, "failed to add member", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "added"})
}

func (app *App) handleRemoveGroupMember(w http.ResponseWriter, r *http.Request, user *User) {
	// /api/groups/:id/members/:uid
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	groupID, _ := strconv.ParseInt(parts[2], 10, 64)
	userID, _ := strconv.ParseInt(parts[4], 10, 64)
	app.store.RemoveGroupMember(groupID, userID) //nolint
	jsonOK(w, map[string]string{"status": "removed"})
}

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
		EventID  int64 `json:"event_id"`
		LeadTime int   `json:"lead_time"`
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
	created, err := app.store.CreateAlarm(Alarm{
		UserID: user.ID, EventID: req.EventID,
		EventTitle: event.Title, EventTime: event.StartTime, LeadTime: req.LeadTime,
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
	if err := app.store.AckAlarm(id, user.ID); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "acknowledged"})
}

func (app *App) handleSSE(w http.ResponseWriter, r *http.Request) {
	_, user := app.getSession(r)
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	client := app.broker.Subscribe(user.ID)
	defer app.broker.Unsubscribe(client)

	fmt.Fprintf(w, "event: connected\ndata: {\"user_id\":%d}\n\n", user.ID)
	flusher.Flush()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case n := <-client.ch:
			data, _ := json.Marshal(n)
			fmt.Fprintf(w, "event: alarm\ndata: %s\n\n", data)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, "event: ping\ndata: {}\n\n")
			flusher.Flush()
		}
	}
}

// ── Lock handlers ──────────────────────────────────────────────────────────────

func (app *App) handleGetLocks(w http.ResponseWriter, r *http.Request, user *User) {
	locks := app.store.GetLocks()
	if locks == nil {
		locks = []LockedSlot{}
	}
	jsonOK(w, locks)
}

func (app *App) handleCreateLock(w http.ResponseWriter, r *http.Request, user *User) {
	if !hasRole(user.Role, RoleAdmin) && !user.CanLock {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var l LockedSlot
	if err := decode(r, &l); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	l.LockedBy = user.ID
	l.LockedByName = user.DisplayName
	created, err := app.store.CreateLock(l)
	if err != nil {
		jsonError(w, "failed to create lock", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleDeleteLock(w http.ResponseWriter, r *http.Request, user *User) {
	if !hasRole(user.Role, RoleAdmin) && !user.CanLock {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteLock(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── User management handlers ───────────────────────────────────────────────────

func (app *App) handleGetUsers(w http.ResponseWriter, r *http.Request, user *User) {
	users := app.store.GetUsers()
	pub := make([]UserPublic, len(users))
	for i, u := range users {
		pub[i] = u.Public()
	}
	jsonOK(w, pub)
}

func (app *App) handleCreateUser(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Username    string  `json:"username"`
		Password    string  `json:"password"`
		DisplayName string  `json:"display_name"`
		Role        Role    `json:"role"`
		CanLock     bool    `json:"can_lock"`
		GroupIDs    []int64 `json:"group_ids"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Password == "" {
		jsonError(w, "username and password required", http.StatusBadRequest)
		return
	}
	if _, exists := app.store.GetUserByUsername(req.Username); exists {
		jsonError(w, "username already exists", http.StatusConflict)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	if req.Role == "" {
		req.Role = RoleRead
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	created, err := app.store.CreateUser(User{
		Username: req.Username, PasswordHash: string(hash),
		DisplayName: req.DisplayName, Role: req.Role, CanLock: req.CanLock,
	})
	if err != nil {
		jsonError(w, "failed to create user", http.StatusInternalServerError)
		return
	}
	// Add to groups if specified
	for _, gid := range req.GroupIDs {
		app.store.AddGroupMember(GroupMembership{GroupID: gid, UserID: created.ID, Role: "member"}) //nolint
	}
	app.audit(user.ID, user.DisplayName, "created", "user", created.ID,
		fmt.Sprintf("Created user %q (role: %s)", created.Username, created.Role))
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created.Public())
}

func (app *App) handleUpdateUser(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if !hasRole(user.Role, RoleAdmin) && user.ID != id {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	existing, ok := app.store.GetUserByID(id)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	var req struct {
		Password    string  `json:"password"`
		DisplayName string  `json:"display_name"`
		Role        Role    `json:"role"`
		CanLock     bool    `json:"can_lock"`
		GroupIDs    []int64 `json:"group_ids"`    // nil = no change; [] = remove all; [...] = replace
		GroupIDsSet bool    `json:"group_ids_set"` // true if caller passed group_ids field
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			jsonError(w, "internal error", http.StatusInternalServerError)
			return
		}
		existing.PasswordHash = string(hash)
	}
	if req.DisplayName != "" {
		existing.DisplayName = req.DisplayName
	}
	if hasRole(user.Role, RoleAdmin) {
		if req.Role != "" {
			existing.Role = req.Role
		}
		existing.CanLock = req.CanLock
		// Update group memberships if admin passed group_ids
		if req.GroupIDs != nil {
			// Remove all existing memberships for this user
			allGroups := app.store.GetGroups()
			for _, g := range allGroups {
				app.store.RemoveGroupMember(g.ID, id) //nolint
			}
			// Add new memberships
			for _, gid := range req.GroupIDs {
				app.store.AddGroupMember(GroupMembership{GroupID: gid, UserID: id, Role: "member"}) //nolint
			}
		}
	}
	if err := app.store.UpdateUser(*existing); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetUserByID(id)
	app.audit(user.ID, user.DisplayName, "updated", "user", id,
		fmt.Sprintf("Updated user %q (role: %s)", updated.Username, updated.Role))
	jsonOK(w, updated.Public())
}

func (app *App) handleDeleteUser(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if user.ID == id {
		jsonError(w, "cannot delete yourself", http.StatusBadRequest)
		return
	}
	target, targetOK := app.store.GetUserByID(id)
	if err := app.store.DeleteUser(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if targetOK {
		app.audit(user.ID, user.DisplayName, "deleted", "user", id,
			fmt.Sprintf("Deleted user %q", target.Username))
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Audit log handler ──────────────────────────────────────────────────────────

func (app *App) handleGetAudit(w http.ResponseWriter, r *http.Request, user *User) {
	limit := 500
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	entries := app.store.GetAudit(limit)
	if entries == nil {
		entries = []AuditEntry{}
	}
	jsonOK(w, entries)
}

// ── Exercise settings handlers ─────────────────────────────────────────────────

func (app *App) handleGetExercise(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetExerciseSettings())
}

func (app *App) handleSaveExercise(w http.ResponseWriter, r *http.Request, user *User) {
	var es ExerciseSettings
	if err := decode(r, &es); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveExerciseSettings(es); err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "exercise", 0,
		fmt.Sprintf("Exercise settings updated: enabled=%v epoch=%q label=%q", es.Enabled, es.Epoch, es.Label))
	jsonOK(w, es)
}

// ── Version ────────────────────────────────────────────────────────────────────

func handleVersion(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]string{"version": AppVersion})
}

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
	if _, ok := app.store.GetEventByID(eventID); !ok {
		jsonError(w, "event not found", http.StatusNotFound)
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
	// For reporters proposing a status change
	pendingApproval := false
	if req.StatusChange != "" && hasRole(user.Role, RoleReporter) && !hasRole(user.Role, RoleReadWrite) {
		pendingApproval = true
	}
	c, err := app.store.CreateComment(EventComment{
		EventID:         eventID,
		AuthorID:        user.ID,
		AuthorName:      user.DisplayName,
		Content:         req.Content,
		PendingApproval: pendingApproval,
		StatusChange:    req.StatusChange,
	})
	if err != nil {
		jsonError(w, "failed to create comment", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "commented", "event", eventID,
		fmt.Sprintf("Comment on event %d", eventID))
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, c)
}

func (app *App) handleDeleteComment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	isAdmin := hasRole(user.Role, RoleAdmin)
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
	if !hasRole(user.Role, RoleTeamLead) {
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
	if !hasRole(user.Role, RoleTeamLead) {
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
	if !hasRole(user.Role, RoleTeamLead) {
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
	if !hasRole(user.Role, RoleTeamLead) {
		jsonError(w, "team lead or above required", http.StatusForbidden)
		return
	}
	if err := app.store.DeletePhase(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Export handler ────────────────────────────────────────────────────────────

func (app *App) handleExport(w http.ResponseWriter, r *http.Request, user *User) {
	if !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "admin required", http.StatusForbidden)
		return
	}
	data := app.store.GetExportData()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-export-%s.json"`,
		time.Now().Format("2006-01-02")))
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(data) //nolint
}

// ── User members (groups for a user) ─────────────────────────────────────────

func (app *App) handleGetUserGroups(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	memberships := app.store.GetUserGroups(id)
	if memberships == nil {
		memberships = []GroupMembership{}
	}
	jsonOK(w, memberships)
}

// ── Background tasks ───────────────────────────────────────────────────────────

func (app *App) runAlarmScheduler() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		for _, alarm := range app.store.GetActiveAlarms() {
			fireAt := alarm.EventTime.Add(-time.Duration(alarm.LeadTime) * time.Minute)
			if now.After(fireAt) || now.Equal(fireAt) {
				app.store.MarkAlarmFired(alarm.ID) //nolint
				msg := fmt.Sprintf("Reminder: \"%s\" starts in %d minutes", alarm.EventTitle, alarm.LeadTime)
				if alarm.LeadTime == 0 {
					msg = fmt.Sprintf("Now: \"%s\" is starting", alarm.EventTitle)
				}
				notif := AlarmNotification{
					AlarmID: alarm.ID, EventID: alarm.EventID,
					EventTitle: alarm.EventTitle, EventTime: alarm.EventTime,
					LeadTime: alarm.LeadTime, Message: msg,
				}
				app.broker.Notify(alarm.UserID, notif)
				app.callWebhook(alarm.UserID, msg, notif)
			}
		}
	}
}

func (app *App) runSessionCleaner() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		app.store.CleanExpiredSessions()
	}
}

// ── Router ─────────────────────────────────────────────────────────────────────

func (app *App) routes() http.Handler {
	mux := http.NewServeMux()

	// Static files
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Pages
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "static/index.html")
	})
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/login.html")
	})

	// Version
	mux.HandleFunc("/api/version", handleVersion)

	// Auth
	mux.HandleFunc("/api/auth/login", app.handleLogin)
	mux.HandleFunc("/api/auth/logout", app.handleLogout)
	mux.HandleFunc("/api/auth/me", app.requireAuth(app.handleMe))
	mux.HandleFunc("/api/auth/change-password", app.requireAuth(app.handleChangePassword))

	// Preferences
	mux.HandleFunc("/api/preferences", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetPreferences)(w, r)
		case http.MethodPut:
			app.requireAuth(app.handleSavePreferences)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Event types
	mux.HandleFunc("/api/event-types", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.handleGetEventTypes(w, r)
		case http.MethodPost:
			app.requireRole(RoleReadWrite, app.handleCreateEventType)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/event-types/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateEventType)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteEventType)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Events
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetEvents)(w, r)
		case http.MethodPost:
			app.requireRole(RoleReadWrite, app.handleCreateEvent)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// Event sub-resources (attachments, comments) and event CRUD
	mux.HandleFunc("/api/events/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")

		// /api/events/:id/status
		if len(parts) == 4 && parts[3] == "status" && r.Method == http.MethodPatch {
			app.requireAuth(app.handlePatchEventStatus)(w, r)
			return
		}

		// /api/events/:id/attachments
		if len(parts) == 4 && parts[3] == "attachments" {
			switch r.Method {
			case http.MethodGet:
				app.requireAuth(app.handleGetAttachments)(w, r)
			case http.MethodPost:
				app.requireAuth(app.handleUploadAttachment)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// /api/events/:id/comments
		if len(parts) == 4 && parts[3] == "comments" {
			switch r.Method {
			case http.MethodGet:
				app.requireAuth(app.handleGetComments)(w, r)
			case http.MethodPost:
				app.requireAuth(app.handleCreateComment)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// /api/events/:id
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateEvent)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteEvent)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Attachments download/delete
	mux.HandleFunc("/api/attachments/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleDownloadAttachment)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteAttachment)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Layers
	mux.HandleFunc("/api/layers", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetLayers)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateLayer)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/layers/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateLayer)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteLayer)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Groups
	mux.HandleFunc("/api/groups", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetGroups)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreateGroup)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/groups/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")

		if len(parts) >= 4 && parts[3] == "members" {
			if len(parts) == 5 && r.Method == http.MethodDelete {
				app.requireRole(RoleAdmin, app.handleRemoveGroupMember)(w, r)
				return
			}
			switch r.Method {
			case http.MethodGet:
				app.requireAuth(app.handleGetGroupMembers)(w, r)
			case http.MethodPost:
				app.requireRole(RoleAdmin, app.handleAddGroupMember)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleUpdateGroup)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleAdmin, app.handleDeleteGroup)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Alarms
	mux.HandleFunc("/api/alarms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetAlarms)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateAlarm)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/alarms/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		// POST /api/alarms/:id/ack
		if len(parts) == 4 && parts[3] == "ack" && r.Method == http.MethodPost {
			app.requireAuth(app.handleAckAlarm)(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteAlarm)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Audit log (teamlead+)
	mux.HandleFunc("/api/audit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleTeamLead, app.handleGetAudit)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Exercise settings (admin saves, any auth reads)
	mux.HandleFunc("/api/exercise", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetExercise)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveExercise)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// SSE
	mux.HandleFunc("/api/notifications/stream", app.handleSSE)

	// Locks
	mux.HandleFunc("/api/locks", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetLocks)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateLock)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/locks/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteLock)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Users
	mux.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetUsers)(w, r)
		case http.MethodPost:
			app.requireRole(RoleAdmin, app.handleCreateUser)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/users/:id/groups
		if len(parts) == 4 && parts[3] == "groups" && r.Method == http.MethodGet {
			app.requireAuth(app.handleGetUserGroups)(w, r)
			return
		}
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateUser)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleAdmin, app.handleDeleteUser)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Comments delete/approve
	mux.HandleFunc("/api/comments/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/comments/:id/approve
		if len(parts) == 4 && parts[3] == "approve" && r.Method == http.MethodPost {
			app.requireRole(RoleTeamLead, app.handleApproveComment)(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteComment)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Exercise Phases
	mux.HandleFunc("/api/phases", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetPhases)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreatePhase)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/phases/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleUpdatePhase)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleTeamLead, app.handleDeletePhase)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Export (admin only)
	mux.HandleFunc("/api/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleAdmin, app.handleExport)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	return mux
}

// ── Main ───────────────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "data"
	}

	app, err := NewApp(dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize: %v", err)
	}

	go app.runAlarmScheduler()
	go app.runSessionCleaner()

	addr := ":" + port
	log.Printf("Tidslinjal v%s — http://localhost%s", AppVersion, addr)
	log.Printf("Default credentials: admin / admin")

	if err := http.ListenAndServe(addr, app.routes()); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
