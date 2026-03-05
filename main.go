package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── SSE broker ───────────────────────────────────────────────────────────────

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

// ── App ──────────────────────────────────────────────────────────────────────

type App struct {
	store  *Store
	broker *SSEBroker
}

func NewApp(dataDir string) (*App, error) {
	store, err := NewStore(dataDir)
	if err != nil {
		return nil, err
	}
	app := &App{
		store:  store,
		broker: NewSSEBroker(),
	}

	// Create default admin if no users exist
	if len(store.GetUsers()) == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		store.CreateUser(User{ //nolint
			Username:     "admin",
			PasswordHash: string(hash),
			DisplayName:  "Administrator",
			Role:         RoleAdmin,
			CanLock:      true,
		})
		log.Println("Created default admin user (username: admin, password: admin)")
	}

	return app, nil
}

// ── Middleware ────────────────────────────────────────────────────────────────

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
	order := map[Role]int{RoleRead: 0, RoleReadWrite: 1, RoleAdmin: 2}
	return order[userRole] >= order[required]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

func generateSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

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

	sessID, err := generateSessionID()
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	sess := Session{
		ID:        sessID,
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	if err := app.store.CreateSession(sess); err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  sess.ExpiresAt,
	})
	jsonOK(w, user.Public())
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session")
	if err == nil {
		app.store.DeleteSession(cookie.Value) //nolint
	}
	http.SetCookie(w, &http.Cookie{
		Name:    "session",
		Value:   "",
		Path:    "/",
		Expires: time.Unix(0, 0),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleMe(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, user.Public())
}

// ── Event handlers ────────────────────────────────────────────────────────────

func (app *App) handleGetEvents(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	fromStr := q.Get("from")
	toStr := q.Get("to")

	var from, to time.Time
	var err error

	if fromStr != "" {
		from, err = time.Parse(time.RFC3339, fromStr)
		if err != nil {
			jsonError(w, "invalid from date", http.StatusBadRequest)
			return
		}
	} else {
		from = time.Now().AddDate(0, -1, 0)
	}
	if toStr != "" {
		to, err = time.Parse(time.RFC3339, toStr)
		if err != nil {
			jsonError(w, "invalid to date", http.StatusBadRequest)
			return
		}
	} else {
		to = time.Now().AddDate(0, 1, 0)
	}

	events := app.store.GetEvents(from, to)
	if events == nil {
		events = []Event{}
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
		e.EventType = EventTypeEvent
	}
	if e.Color == "" {
		if c, ok := DefaultEventColors[e.EventType]; ok {
			e.Color = c
		} else {
			e.Color = "#4A90D9"
		}
	}
	e.CreatedBy = user.ID
	e.CreatedByName = user.DisplayName

	created, err := app.store.CreateEvent(e)
	if err != nil {
		jsonError(w, "failed to create event", http.StatusInternalServerError)
		return
	}
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
	// Only creator, readwrite+, or admin can edit
	if existing.CreatedBy != user.ID && !hasRole(user.Role, RoleReadWrite) {
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
	if e.Color == "" {
		if c, ok := DefaultEventColors[e.EventType]; ok {
			e.Color = c
		}
	}

	if err := app.store.UpdateEvent(e); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
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
	if err := app.store.DeleteEvent(id); err != nil {
		jsonError(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Alarm handlers ────────────────────────────────────────────────────────────

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
		LeadTime int   `json:"lead_time"` // minutes
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

	alarm := Alarm{
		UserID:     user.ID,
		EventID:    req.EventID,
		EventTitle: event.Title,
		EventTime:  event.StartTime,
		LeadTime:   req.LeadTime,
	}
	created, err := app.store.CreateAlarm(alarm)
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

	// Send connected event
	fmt.Fprintf(w, "event: connected\ndata: {\"user_id\":%d}\n\n", user.ID)
	flusher.Flush()

	// Keep-alive ticker
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

// ── Lock handlers ─────────────────────────────────────────────────────────────

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

// ── User management handlers ──────────────────────────────────────────────────

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
		Username    string `json:"username"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
		Role        Role   `json:"role"`
		CanLock     bool   `json:"can_lock"`
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
		Username:     req.Username,
		PasswordHash: string(hash),
		DisplayName:  req.DisplayName,
		Role:         req.Role,
		CanLock:      req.CanLock,
	})
	if err != nil {
		jsonError(w, "failed to create user", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created.Public())
}

func (app *App) handleUpdateUser(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}

	// Non-admins can only update their own password
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
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
		Role        Role   `json:"role"`
		CanLock     bool   `json:"can_lock"`
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
	}

	if err := app.store.UpdateUser(*existing); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetUserByID(id)
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
	if err := app.store.DeleteUser(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Event types ───────────────────────────────────────────────────────────────

func (app *App) handleGetEventTypes(w http.ResponseWriter, r *http.Request) {
	types := []map[string]string{
		{"type": string(EventTypeEvent), "label": "Event", "color": DefaultEventColors[EventTypeEvent]},
		{"type": string(EventTypeDecision), "label": "Decision", "color": DefaultEventColors[EventTypeDecision]},
		{"type": string(EventTypeDeadline), "label": "Deadline", "color": DefaultEventColors[EventTypeDeadline]},
		{"type": string(EventTypeActivity), "label": "Activity", "color": DefaultEventColors[EventTypeActivity]},
		{"type": string(EventTypeRepeated), "label": "Repeated", "color": DefaultEventColors[EventTypeRepeated]},
		{"type": string(EventTypeReporting), "label": "Reporting", "color": DefaultEventColors[EventTypeReporting]},
	}
	jsonOK(w, types)
}

// ── Alarm scheduler ───────────────────────────────────────────────────────────

func (app *App) runAlarmScheduler() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		app.checkAlarms()
	}
}

func (app *App) checkAlarms() {
	alarms := app.store.GetActiveAlarms()
	now := time.Now()
	for _, alarm := range alarms {
		fireAt := alarm.EventTime.Add(-time.Duration(alarm.LeadTime) * time.Minute)
		if now.After(fireAt) || now.Equal(fireAt) {
			app.store.MarkAlarmFired(alarm.ID) //nolint
			msg := fmt.Sprintf("Reminder: \"%s\" starts in %d minutes", alarm.EventTitle, alarm.LeadTime)
			if alarm.LeadTime == 0 {
				msg = fmt.Sprintf("Now: \"%s\" is starting", alarm.EventTitle)
			}
			app.broker.Notify(alarm.UserID, AlarmNotification{
				AlarmID:    alarm.ID,
				EventID:    alarm.EventID,
				EventTitle: alarm.EventTitle,
				EventTime:  alarm.EventTime,
				LeadTime:   alarm.LeadTime,
				Message:    msg,
			})
		}
	}
}

// ── Session cleaner ───────────────────────────────────────────────────────────

func (app *App) runSessionCleaner() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		app.store.CleanExpiredSessions()
	}
}

// ── Router ────────────────────────────────────────────────────────────────────

func pathID(r *http.Request) (int64, error) {
	parts := strings.Split(r.URL.Path, "/")
	idStr := parts[len(parts)-1]
	return strconv.ParseInt(idStr, 10, 64)
}

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

	// Auth
	mux.HandleFunc("/api/auth/login", app.handleLogin)
	mux.HandleFunc("/api/auth/logout", app.handleLogout)
	mux.HandleFunc("/api/auth/me", app.requireAuth(app.handleMe))

	// Event types (public, read-only)
	mux.HandleFunc("/api/event-types", app.handleGetEventTypes)

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
	mux.HandleFunc("/api/events/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateEvent)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteEvent)(w, r)
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
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteAlarm)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// SSE notifications
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

	// Users (admin)
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
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateUser)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleAdmin, app.handleDeleteUser)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	return mux
}

// ── Main ──────────────────────────────────────────────────────────────────────

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
		log.Fatalf("Failed to initialize app: %v", err)
	}

	go app.runAlarmScheduler()
	go app.runSessionCleaner()

	addr := ":" + port
	log.Printf("Tidslinjal starting on http://localhost%s", addr)
	log.Printf("Default credentials: admin / admin  (change after first login)")

	if err := http.ListenAndServe(addr, app.routes()); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
