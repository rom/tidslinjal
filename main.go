package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/pbkdf2"
)

// Global logger flags (set in main)
var (
	verbose bool
	debug   bool
)

func init() {
	// Ensure correct MIME types on all platforms (some Linux distros
	// map .js → text/plain in /etc/mime.types, causing browsers to
	// refuse script execution under strict MIME checking).
	mime.AddExtensionType(".js", "application/javascript")
	mime.AddExtensionType(".css", "text/css")
	mime.AddExtensionType(".html", "text/html")
	mime.AddExtensionType(".json", "application/json")
	mime.AddExtensionType(".svg", "image/svg+xml")
	mime.AddExtensionType(".png", "image/png")
	mime.AddExtensionType(".jpg", "image/jpeg")
	mime.AddExtensionType(".woff2", "font/woff2")
}

func logVerbose(format string, args ...any) {
	if verbose || debug {
		log.Printf("[VERBOSE] "+format, args...)
	}
}

func logDebug(format string, args ...any) {
	if debug {
		log.Printf("[DEBUG] "+format, args...)
	}
}

// ── Syslog writer ─────────────────────────────────────────────────────────────

// syslogWriter forwards log messages to a remote syslog server.
// It supports UDP, TCP, and TLS transports, and classic or JSON message formats.
// An instance is set via setSyslogWriter(); concurrent use is safe via its own mutex.
type syslogWriter struct {
	mu       sync.Mutex
	cfg      SyslogConfig
	conn     net.Conn // nil for UDP (reconnect on each write)
	hostname string
}

var (
	globalSyslog     *syslogWriter
	globalSyslogOnce sync.Once
)

// setSyslogWriter replaces the active syslog writer (or disables it if cfg.Enabled is false).
func setSyslogWriter(cfg SyslogConfig) {
	if !cfg.Enabled || cfg.Host == "" {
		globalSyslog = nil
		return
	}
	hn, _ := os.Hostname()
	globalSyslog = &syslogWriter{cfg: cfg, hostname: hn}
}

// syslogSend forwards a log line to the remote syslog server (if configured).
func syslogSend(severity int, msg string) {
	sw := globalSyslog
	if sw == nil {
		return
	}
	sw.send(severity, msg)
}

// syslogPriority computes the RFC 3164 priority value from facility and severity.
func syslogPriority(facility, severity int) int {
	return facility*8 + severity
}

func (sw *syslogWriter) formatClassic(priority int, msg string) []byte {
	// RFC 3164: <PRI>Mmm DD HH:MM:SS hostname tag: message
	t := time.Now().UTC()
	app := sw.cfg.AppName
	if app == "" {
		app = "tidslinjal"
	}
	line := fmt.Sprintf("<%d>%s %s %s: %s\n",
		priority,
		t.Format("Jan _2 15:04:05"),
		sw.hostname,
		app,
		msg,
	)
	return []byte(line)
}

func (sw *syslogWriter) formatJSON(priority int, severity int, msg string) []byte {
	app := sw.cfg.AppName
	if app == "" {
		app = "tidslinjal"
	}
	b, _ := json.Marshal(map[string]any{
		"priority":  priority,
		"facility":  sw.cfg.Facility,
		"severity":  severity,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"hostname":  sw.hostname,
		"app":       app,
		"message":   msg,
	})
	return append(b, '\n')
}

func (sw *syslogWriter) send(severity int, msg string) {
	facility := sw.cfg.Facility
	if facility == 0 {
		facility = 1 // user-level messages
	}
	priority := syslogPriority(facility, severity)

	var payload []byte
	if sw.cfg.Format == "json" {
		payload = sw.formatJSON(priority, severity, msg)
	} else {
		payload = sw.formatClassic(priority, msg)
	}

	port := sw.cfg.Port
	if port == 0 {
		if sw.cfg.Transport == "tls" {
			port = 6514
		} else {
			port = 514
		}
	}
	addr := fmt.Sprintf("%s:%d", sw.cfg.Host, port)

	sw.mu.Lock()
	defer sw.mu.Unlock()

	switch sw.cfg.Transport {
	case "udp":
		// UDP: connectionless, create a new connection per message
		conn, err := net.DialTimeout("udp", addr, 3*time.Second)
		if err != nil {
			return
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(3 * time.Second)) //nolint
		conn.Write(payload)                                //nolint
	case "tls":
		tlsCfg := &tls.Config{InsecureSkipVerify: !sw.cfg.TLSVerify} //nolint
		if sw.conn == nil {
			conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", addr, tlsCfg)
			if err != nil {
				return
			}
			sw.conn = conn
		}
		sw.conn.SetDeadline(time.Now().Add(5 * time.Second)) //nolint
		if _, err := sw.conn.Write(payload); err != nil {
			sw.conn.Close()
			sw.conn = nil
			// Retry once
			conn, err2 := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", addr, tlsCfg)
			if err2 != nil {
				return
			}
			sw.conn = conn
			sw.conn.Write(payload) //nolint
		}
	default: // tcp
		if sw.conn == nil {
			conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
			if err != nil {
				return
			}
			sw.conn = conn
		}
		sw.conn.SetDeadline(time.Now().Add(5 * time.Second)) //nolint
		if _, err := sw.conn.Write(payload); err != nil {
			sw.conn.Close()
			sw.conn = nil
			conn, err2 := net.DialTimeout("tcp", addr, 5*time.Second)
			if err2 != nil {
				return
			}
			sw.conn = conn
			sw.conn.Write(payload) //nolint
		}
	}
}

// syslogLogWriter wraps the standard log package to also forward to syslog.
// It implements io.Writer so it can be set as log.SetOutput(…).
type syslogLogWriter struct {
	orig io.Writer
}

func (w *syslogLogWriter) Write(p []byte) (int, error) {
	n, err := w.orig.Write(p)
	// Determine severity from prefix: ERROR/FATAL→3, WARN→4, INFO→6, default→6
	s := strings.TrimSpace(string(p))
	severity := 6 // informational
	sl := strings.ToUpper(s)
	if strings.Contains(sl, "[WARN]") {
		severity = 4 // warning
	} else if strings.Contains(sl, "[DEBUG]") {
		severity = 7 // debug
	} else if strings.Contains(sl, "FATAL") || strings.Contains(sl, "ERROR") {
		severity = 3 // error
	}
	syslogSend(severity, strings.TrimRight(s, "\n"))
	return n, err
}

// ── SSE broker ────────────────────────────────────────────────────────────────

// SSEMessage is a generic SSE message with an event type and JSON data
type SSEMessage struct {
	Event string `json:"event"`
	Data  string `json:"data"`
}

type SSEClient struct {
	userID    int64
	ch        chan AlarmNotification
	broadcast chan SSEMessage
}

// SSEBroker manages all connected SSE clients.
//
// Performance notes (v4.0):
//   - byUser index gives O(1) targeted alarm delivery instead of O(n) scan.
//   - mu is an RWMutex so Notify/Broadcast/BroadcastAll can run concurrently.
//     Only Subscribe/Unsubscribe need an exclusive lock.
type SSEBroker struct {
	mu      sync.RWMutex
	clients map[*SSEClient]struct{}  // all clients (for broadcast)
	byUser  map[int64][]*SSEClient   // index: userID → clients
}

func NewSSEBroker() *SSEBroker {
	return &SSEBroker{
		clients: make(map[*SSEClient]struct{}),
		byUser:  make(map[int64][]*SSEClient),
	}
}

func (b *SSEBroker) Subscribe(userID int64) *SSEClient {
	b.mu.Lock()
	defer b.mu.Unlock()
	c := &SSEClient{
		userID:    userID,
		ch:        make(chan AlarmNotification, 8),
		broadcast: make(chan SSEMessage, 16),
	}
	b.clients[c] = struct{}{}
	b.byUser[userID] = append(b.byUser[userID], c)
	return c
}

func (b *SSEBroker) Unsubscribe(c *SSEClient) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, c)
	// Remove from byUser index
	list := b.byUser[c.userID]
	for i, ec := range list {
		if ec == c {
			b.byUser[c.userID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(b.byUser[c.userID]) == 0 {
		delete(b.byUser, c.userID)
	}
}

// Notify delivers an alarm to a specific user — O(1) via byUser index.
func (b *SSEBroker) Notify(userID int64, n AlarmNotification) {
	b.mu.RLock()
	clients := b.byUser[userID]
	b.mu.RUnlock()
	for _, c := range clients {
		select {
		case c.ch <- n:
		default:
		}
	}
}

// Broadcast sends an SSE message to all connected clients except the sender.
func (b *SSEBroker) Broadcast(senderID int64, msg SSEMessage) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for c := range b.clients {
		if c.userID != senderID {
			select {
			case c.broadcast <- msg:
			default:
			}
		}
	}
}

// BroadcastAll sends an SSE message to ALL connected clients including sender.
func (b *SSEBroker) BroadcastAll(msg SSEMessage) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for c := range b.clients {
		select {
		case c.broadcast <- msg:
		default:
		}
	}
}

// ── Webhook worker pool ───────────────────────────────────────────────────────

// webhookConcurrency limits simultaneous outbound HTTP webhook calls so a burst
// of alarm firings or event changes cannot exhaust file descriptors or goroutines.
const webhookConcurrency = 32

type webhookJob struct {
	url     string
	wtype   string
	body    []byte
}

// ── App ───────────────────────────────────────────────────────────────────────

type App struct {
	store           *Store
	broker          *SSEBroker
	oidc            *OIDCConfig // nil if OIDC not configured
	oidcExclusive   bool        // when true, disable local username/password login
	oidcDefaultRole Role        // role assigned to auto-created OIDC users (default: RoleReadWrite)
	webhookCh       chan webhookJob
	secureMode      bool        // true when serving over HTTPS (enables Secure cookie flag)
	authLimiter     *ipRateLimiter
	eventBus        *EventBus
	connectors      *ConnectorRegistry
	metrics         *Metrics
	ldap            *LDAPConnector
	stopCh          chan struct{} // closed to stop background goroutines
	stopOnce        sync.Once
}

// ipRateLimiter implements a simple per-IP sliding-window rate limiter.
type ipRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
}

type rateBucket struct {
	count   int
	resetAt time.Time
}

func newIPRateLimiter() *ipRateLimiter {
	return &ipRateLimiter{buckets: make(map[string]*rateBucket)}
}

// allow returns true if the request from ip is within limit per window.
func (rl *ipRateLimiter) allow(ip string, limit int, window time.Duration) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	b, ok := rl.buckets[ip]
	if !ok || now.After(b.resetAt) {
		rl.buckets[ip] = &rateBucket{count: 1, resetAt: now.Add(window)}
		return true
	}
	if b.count >= limit {
		return false
	}
	b.count++
	return true
}

// broadcastEventChange sends an SSE notification to all clients about an event change
func (app *App) broadcastEventChange(senderID int64, action string, ev *Event) {
	payload := map[string]interface{}{
		"action": action,
		"event":  ev,
	}
	data, _ := json.Marshal(payload)
	app.broker.Broadcast(senderID, SSEMessage{Event: "event_change", Data: string(data)})

	// Fire outbound webhook if configured for the event creator
	go app.fireWebhooks(action, ev)
}

// fireWebhooks enqueues outbound webhook notifications for event state transitions.
// All HTTP calls go through the bounded worker pool — no goroutine spawning here.
func (app *App) fireWebhooks(action string, ev *Event) {
	prefs := app.store.GetAllPreferences()
	for _, p := range prefs {
		if p.WebhookURL == "" {
			continue
		}
		payload := map[string]interface{}{
			"type":        "event_" + action,
			"event_id":    ev.ID,
			"event_title": ev.Title,
			"status":      string(ev.Status),
			"event_type":  ev.EventType,
			"start_time":  ev.StartTime.Format(time.RFC3339),
			"updated_by":  ev.CreatedByName,
		}
		var body []byte
		if p.WebhookType == "mattermost" || p.WebhookType == "slack" {
			text := fmt.Sprintf("[%s] **%s** — %s (%s)", action, ev.Title, ev.Status, ev.EventType)
			body, _ = json.Marshal(map[string]string{"text": text})
		} else {
			body, _ = json.Marshal(payload)
		}
		app.enqueueWebhook(p.WebhookType, p.WebhookURL, body)
	}
}

func NewApp(dataDir string) (*App, error) {
	store, err := NewStore(dataDir)
	if err != nil {
		return nil, err
	}
	if err := store.SeedEventTypes(); err != nil {
		return nil, err
	}
	app := &App{
		store:       store,
		broker:      NewSSEBroker(),
		webhookCh:   make(chan webhookJob, 256),
		authLimiter: newIPRateLimiter(),
		eventBus:    NewEventBus(),
		connectors:  NewConnectorRegistry(),
		metrics:     NewMetrics(),
		stopCh:      make(chan struct{}),
	}
	// Start bounded webhook worker pool — prevents goroutine explosion under load.
	for i := 0; i < webhookConcurrency; i++ {
		go app.runWebhookWorker()
	}

	// Start event bus
	go app.eventBus.Run()

	// Register connectors
	app.ldap = NewLDAPConnector()
	app.connectors.Register(NewSTIXConnector())
	app.connectors.Register(NewADatP3Connector())
	app.connectors.Register(NewGitConnector())
	app.connectors.Register(NewJiraConnector())
	app.connectors.Register(NewGCalConnector())
	app.connectors.Register(app.ldap)

	// Load persisted connector configs
	app.connectors.LoadConfigs(store.GetConnectorConfigs())

	// Subscribe connectors to event bus
	app.eventBus.Subscribe("connectors", EventBusSubscriberFunc(func(msg EventBusMessage) {
		app.connectors.Dispatch(msg)
	}))

	// Subscribe webhooks to event bus (replaces direct fireWebhooks call for bus-originated events)
	app.eventBus.Subscribe("webhooks", EventBusSubscriberFunc(func(msg EventBusMessage) {
		if msg.Event != nil {
			app.fireWebhooks(string(msg.Action), msg.Event)
		}
	}))

	// Start connector poller
	go app.runConnectorPoller()

	if len(store.GetUsers()) == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		store.CreateUser(User{ //nolint
			Username:     "admin",
			PasswordHash: string(hash),
			DisplayName:  "Administrator",
			Role:         RoleAdmin,
			CanLock:      true,
			Vetted:       true,
		})
		log.Println("Created default admin (username: admin, password: admin)")
	}
	return app, nil
}

// Stop shuts down background goroutines (event bus, connector poller, webhook workers).
func (app *App) Stop() {
	app.stopOnce.Do(func() {
		close(app.stopCh)
		app.eventBus.Stop()
		close(app.webhookCh)
	})
}

// validateWebhookURL checks that a webhook URL is safe to call:
//   - must be a valid absolute HTTP(S) URL
//   - must not resolve to a private/loopback/link-local address (SSRF protection)
func validateWebhookURL(rawURL string) error {
	if rawURL == "" {
		return nil
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("webhook URL must use http or https scheme")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("webhook URL has no host")
	}
	// Resolve hostname and check against private address ranges
	ips, err := net.LookupHost(host)
	if err != nil {
		return fmt.Errorf("cannot resolve webhook host %q: %w", host, err)
	}
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			continue
		}
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
			ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return fmt.Errorf("webhook URL must not target private/loopback addresses (resolved %s → %s)", host, ipStr)
		}
	}
	return nil
}

// runWebhookWorker processes outbound webhook HTTP calls from the shared job queue.
func (app *App) runWebhookWorker() {
	// Use a custom transport that blocks connections to private/loopback IPs.
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, _, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid address: %w", err)
			}
			ips, err := net.LookupHost(host)
			if err != nil {
				return nil, err
			}
			for _, ipStr := range ips {
				ip := net.ParseIP(ipStr)
				if ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()) {
					return nil, fmt.Errorf("webhook blocked: %s resolves to private address %s", host, ipStr)
				}
			}
			return dialer.DialContext(ctx, network, addr)
		},
	}
	client := &http.Client{Timeout: 10 * time.Second, Transport: transport}
	for job := range app.webhookCh {
		req, err := http.NewRequest("POST", job.url, bytes.NewReader(job.body))
		if err != nil {
			logVerbose("webhook: invalid URL %q: %v", job.url, err)
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			logVerbose("webhook: POST %q failed: %v", job.url, err)
			continue
		}
		resp.Body.Close()
	}
}

// enqueueWebhook submits a webhook call to the worker pool.
// If the queue is full the call is silently dropped rather than blocking.
func (app *App) enqueueWebhook(wtype, webhookURL string, body []byte) {
	select {
	case app.webhookCh <- webhookJob{url: webhookURL, wtype: wtype, body: body}:
	default:
		logVerbose("webhook queue full; dropping call to %q", webhookURL)
	}
}

// ── Middleware ─────────────────────────────────────────────────────────────────

func (app *App) getSession(r *http.Request) (*Session, *User) {
	cookie, err := r.Cookie("session")
	if err != nil {
		return nil, nil
	}
	sess, ok := app.store.GetSession(cookie.Value)
	if !ok {
		logDebug("session not found or expired: cookie=%s", cookie.Value[:min(8, len(cookie.Value))])
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
		RoleObserver:         0,
		RoleRead:             0,
		RoleReporter:         1,
		RoleReadWrite:        2,
		RoleTeamLead:         3,
		RoleOpLead:           4,
		RoleStaffOfficer:     4,
		RoleStaffOfficerFull: 4,
		RoleAdmin:            5,
	}
	return order[userRole] >= order[required]
}

func canEditMasterTimeline(role Role) bool {
	return hasRole(role, RoleOpLead)
}

// clientIP extracts the real client IP from the request, respecting forwarding headers.
func clientIP(r *http.Request) string {
	if ff := r.Header.Get("X-Forwarded-For"); ff != "" {
		return strings.TrimSpace(strings.SplitN(ff, ",", 2)[0])
	}
	if ri := r.Header.Get("X-Real-IP"); ri != "" {
		return ri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// audit is a fire-and-forget convenience wrapper
func (app *App) audit(userID int64, userName, action, entityType string, entityID int64, summary string) {
	app.store.LogAudit(AuditEntry{ //nolint
		UserID: userID, UserName: userName,
		Action: action, EntityType: entityType, EntityID: entityID,
		Summary: summary,
	})
}

// callWebhookURL enqueues an alarm webhook call through the bounded worker pool.
func (app *App) callWebhookURL(webhookURL, webhookType, msg string, notif AlarmNotification) {
	if webhookURL == "" {
		return
	}
	var payload []byte
	switch webhookType {
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
	app.enqueueWebhook(webhookType, webhookURL, payload)
}

// callWebhook enqueues the user's configured webhook (if any).
func (app *App) callWebhook(userID int64, msg string, notif AlarmNotification) {
	prefs := app.store.GetPreferences(userID)
	app.callWebhookURL(prefs.WebhookURL, prefs.WebhookType, msg, notif)
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
	if !app.authLimiter.allow(clientIP(r), 10, time.Minute) {
		jsonError(w, "too many requests — try again later", http.StatusTooManyRequests)
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Deny local login when OIDC exclusive mode is enabled.
	// The built-in admin account is exempted so admins can recover if OIDC breaks.
	if app.oidcExclusive && app.oidc != nil && req.Username != "admin" {
		logVerbose("local login blocked for %q — OIDC exclusive mode", req.Username)
		jsonError(w, "local login disabled — use SSO", http.StatusForbidden)
		return
	}
	loginClientIP := clientIP(r)
	user, ok := app.store.GetUserByUsername(req.Username)
	if !ok {
		app.audit(0, "system", "login_failed", "user", 0,
			fmt.Sprintf("Failed login attempt for unknown account %q from %s", req.Username, loginClientIP))
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		app.audit(0, "system", "login_failed", "user", user.ID,
			fmt.Sprintf("Failed login attempt for account %q from %s (wrong password)", user.Username, loginClientIP))
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	// Deny login for blocked accounts
	if user.Blocked {
		app.audit(user.ID, "system", "login_blocked", "user", user.ID,
			fmt.Sprintf("Blocked user %q attempted login from %s", user.Username, loginClientIP))
		jsonError(w, "account is blocked", http.StatusForbidden)
		return
	}
	// Deny login for unvetted accounts (pending admin approval)
	if !user.Vetted && user.Role != RoleAdmin {
		jsonError(w, "account pending approval", http.StatusForbidden)
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
		Name:     "session",
		Value:    sessID,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		SameSite: http.SameSiteLaxMode,
		Expires:  sess.ExpiresAt,
	})
	app.audit(user.ID, user.DisplayName, "login", "user", user.ID,
		fmt.Sprintf("User %q logged in from %s", user.Username, loginClientIP))
	logVerbose("login: user=%q role=%s ip=%s", user.Username, user.Role, loginClientIP)

	// Record last login time, IP, and domain (async to avoid blocking login response)
	go func(u User, ip string) {
		now := time.Now()
		u.LastLoginAt = &now
		u.LastLoginIP = ip
		// Best-effort reverse DNS lookup
		if names, err := net.LookupAddr(ip); err == nil && len(names) > 0 {
			u.LastLoginDomain = strings.TrimSuffix(names[0], ".")
		}
		if fullUser, ok := app.store.GetUserByID(u.ID); ok {
			fullUser.LastLoginAt = u.LastLoginAt
			fullUser.LastLoginIP = u.LastLoginIP
			fullUser.LastLoginDomain = u.LastLoginDomain
			app.store.UpdateUser(*fullUser) //nolint
		}
	}(*user, loginClientIP)

	jsonOK(w, user.Public())
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	_, user := app.getSession(r)
	if c, err := r.Cookie("session"); err == nil {
		logDebug("logout: session=%s", c.Value[:min(8, len(c.Value))])
		app.store.DeleteSession(c.Value) //nolint
	}
	if user != nil {
		ip := clientIP(r)
		app.audit(user.ID, user.DisplayName, "logout", "user", user.ID,
			fmt.Sprintf("User %q logged out from %s", user.Username, ip))
		logVerbose("logout: user=%q ip=%s", user.Username, ip)
	}
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", Expires: time.Unix(0, 0)})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleMe(w http.ResponseWriter, r *http.Request, user *User) {
	pub := user.Public()
	// Enrich with group memberships
	memberships := app.store.GetUserGroups(user.ID)
	allGroups := app.store.GetGroups()
	type groupInfo struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
		Role string `json:"role"`
	}
	groups := make([]groupInfo, 0, len(memberships))
	for _, m := range memberships {
		for _, g := range allGroups {
			if g.ID == m.GroupID {
				groups = append(groups, groupInfo{ID: g.ID, Name: g.Name, Role: m.Role})
				break
			}
		}
	}
	type meResponse struct {
		UserPublic
		Groups          []groupInfo `json:"groups"`
		WebCalToken     string      `json:"webcal_token,omitempty"`
		LastLoginIP     string      `json:"last_login_ip,omitempty"`
		LastLoginDomain string      `json:"last_login_domain,omitempty"`
	}
	jsonOK(w, meResponse{
		UserPublic:      pub,
		Groups:          groups,
		WebCalToken:     user.WebCalToken,
		LastLoginIP:     user.LastLoginIP,
		LastLoginDomain: user.LastLoginDomain,
	})
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

	// Block OIDC/SSO users — their identity is managed by the external provider
	if fullUser.IsOIDC {
		jsonError(w, "oidc_account: Password cannot be changed here — this account uses Single Sign-On (SSO/OIDC). Manage your password through your identity provider.", http.StatusForbidden)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(fullUser.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		jsonError(w, "current password incorrect", http.StatusForbidden)
		return
	}

	// Enforce password quality policy if enabled
	if policy := app.store.GetSecuritySettings(); policy.PasswordPolicyEnabled {
		if err := validatePasswordQuality(req.NewPassword, policy); err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
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

// handlePasswordPolicy returns the password policy for any authenticated user.
func (app *App) handlePasswordPolicy(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ss := app.store.GetSecuritySettings()
	jsonOK(w, map[string]any{
		"password_policy_enabled": ss.PasswordPolicyEnabled,
		"min_length":              ss.MinLength,
		"require_uppercase":       ss.RequireUppercase,
		"require_lowercase":       ss.RequireLowercase,
		"require_numbers":         ss.RequireNumbers,
		"require_symbols":         ss.RequireSymbols,
	})
}

// validateUsername checks that a username is non-empty, not too long, and only
// contains safe characters (letters, digits, underscores, hyphens, dots).
// This prevents log injection and other issues caused by unusual characters.
func validateUsername(username string) error {
	if username == "" {
		return fmt.Errorf("username is required")
	}
	if len(username) > 64 {
		return fmt.Errorf("username must be at most 64 characters")
	}
	for _, r := range username {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '_' || r == '-' || r == '.') {
			return fmt.Errorf("username may only contain letters, digits, underscores, hyphens and dots")
		}
	}
	return nil
}

// validatePasswordQuality checks a candidate password against the active policy.
func validatePasswordQuality(password string, policy SecuritySettings) error {
	minLen := policy.MinLength
	if minLen == 0 {
		minLen = 8
	}
	if len(password) < minLen {
		return fmt.Errorf("password_quality: Password must be at least %d characters long", minLen)
	}
	var hasUpper, hasLower, hasDigit, hasSymbol bool
	for _, r := range password {
		switch {
		case r >= 'A' && r <= 'Z':
			hasUpper = true
		case r >= 'a' && r <= 'z':
			hasLower = true
		case r >= '0' && r <= '9':
			hasDigit = true
		default:
			hasSymbol = true
		}
	}
	if policy.RequireUppercase && !hasUpper {
		return fmt.Errorf("password_quality: Password must contain at least one uppercase letter (A–Z)")
	}
	if policy.RequireLowercase && !hasLower {
		return fmt.Errorf("password_quality: Password must contain at least one lowercase letter (a–z)")
	}
	if policy.RequireNumbers && !hasDigit {
		return fmt.Errorf("password_quality: Password must contain at least one number (0–9)")
	}
	if policy.RequireSymbols && !hasSymbol {
		return fmt.Errorf("password_quality: Password must contain at least one symbol (e.g. !@#$%%^&*)")
	}
	return nil
}

// ── Registration handler ───────────────────────────────────────────────────────

func (app *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !app.authLimiter.allow(clientIP(r), 5, time.Minute) {
		jsonError(w, "too many requests — try again later", http.StatusTooManyRequests)
		return
	}
	rs := app.store.GetRegistrationSettings()
	if rs.Mode == "" || rs.Mode == "off" {
		jsonError(w, "registration is disabled", http.StatusForbidden)
		return
	}
	// oidc_auto_enroll: local registration disabled; users must authenticate via OIDC
	if rs.Mode == "oidc_auto_enroll" {
		jsonError(w, "local registration is disabled — please sign in via OIDC/SSO to get enrolled automatically", http.StatusForbidden)
		return
	}

	var req struct {
		Username       string `json:"username"`
		Password       string `json:"password"`
		DisplayName    string `json:"display_name"`
		Email          string `json:"email"`
		InvitationCode string `json:"invitation_code"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := validateUsername(req.Username); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		jsonError(w, "password is required", http.StatusBadRequest)
		return
	}
	// Apply password quality policy if enabled; otherwise enforce bare minimum of 6
	if policy := app.store.GetSecuritySettings(); policy.PasswordPolicyEnabled {
		if err := validatePasswordQuality(req.Password, policy); err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else if len(req.Password) < 6 {
		jsonError(w, "password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	// Check username availability
	if _, exists := app.store.GetUserByUsername(req.Username); exists {
		jsonError(w, "username already taken", http.StatusConflict)
		return
	}

	// Validate invitation codes
	var invID int64
	switch rs.Mode {
	case "generic_invitation":
		if req.InvitationCode != rs.InvitationCode || rs.InvitationCode == "" {
			jsonError(w, "invalid invitation code", http.StatusForbidden)
			return
		}
	case "personal_invitation":
		inv, ok := app.store.GetInvitationByCode(req.InvitationCode)
		if !ok || inv.Used {
			jsonError(w, "invalid or already-used invitation code", http.StatusForbidden)
			return
		}
		invID = inv.ID
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Username
	}

	// Vetted mode: user must be approved before login
	vetted := rs.Mode != "vetted"

	newUser := User{
		Username:    req.Username,
		PasswordHash: string(hash),
		DisplayName: displayName,
		Email:       req.Email,
		Role:        RoleRead,
		Vetted:      vetted,
	}
	created, err := app.store.CreateUser(newUser)
	if err != nil {
		jsonError(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	// Mark personal invitation as used
	if invID > 0 {
		app.store.MarkInvitationUsed(invID, req.Username) //nolint
	}

	app.audit(0, "system", "created", "user", created.ID,
		fmt.Sprintf("Self-registered user %q via %s mode", req.Username, rs.Mode))

	if vetted {
		jsonOK(w, map[string]interface{}{"status": "registered", "vetted": true})
	} else {
		jsonOK(w, map[string]interface{}{"status": "pending_approval", "vetted": false})
	}
}

// ── Registration Settings handler ──────────────────────────────────────────────

func (app *App) handleRegistrationSettings(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	switch r.Method {
	case http.MethodGet:
		jsonOK(w, app.store.GetRegistrationSettings())
	case http.MethodPut:
		var rs RegistrationSettings
		if err := decode(r, &rs); err != nil {
			jsonError(w, "invalid request", http.StatusBadRequest)
			return
		}
		validModes := map[string]bool{"off": true, "open": true, "vetted": true, "generic_invitation": true, "personal_invitation": true}
		if !validModes[rs.Mode] {
			jsonError(w, "invalid mode", http.StatusBadRequest)
			return
		}
		if err := app.store.SaveRegistrationSettings(rs); err != nil {
			jsonError(w, "failed to save", http.StatusInternalServerError)
			return
		}
		jsonOK(w, rs)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── OIDC settings handler ───────────────────────────────────────────────────────

func (app *App) handleOIDCSettings(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	switch r.Method {
	case http.MethodGet:
		cfg := app.store.GetOIDCSettings()
		// Never expose client secret to the frontend; send a placeholder if set
		out := map[string]interface{}{
			"enabled":      cfg.Enabled,
			"issuer":       cfg.Issuer,
			"client_id":    cfg.ClientID,
			"redirect_url": cfg.RedirectURL,
			"exclusive":    cfg.Exclusive,
			"default_role": cfg.DefaultRole,
			"has_secret":   cfg.ClientSecret != "",
		}
		jsonOK(w, out)
	case http.MethodPut:
		var req struct {
			Enabled      bool   `json:"enabled"`
			Issuer       string `json:"issuer"`
			ClientID     string `json:"client_id"`
			ClientSecret string `json:"client_secret"`
			RedirectURL  string `json:"redirect_url"`
			Exclusive    bool   `json:"exclusive"`
			DefaultRole  string `json:"default_role"`
		}
		if err := decode(r, &req); err != nil {
			jsonError(w, "invalid request", http.StatusBadRequest)
			return
		}
		existing := app.store.GetOIDCSettings()
		// Preserve existing secret if a blank value is submitted (means "keep it")
		secret := req.ClientSecret
		if secret == "" {
			secret = existing.ClientSecret
		}
		cfg := OIDCPersistentConfig{
			Enabled:      req.Enabled,
			Issuer:       req.Issuer,
			ClientID:     req.ClientID,
			ClientSecret: secret,
			RedirectURL:  req.RedirectURL,
			Exclusive:    req.Exclusive,
			DefaultRole:  req.DefaultRole,
		}
		if err := app.store.SaveOIDCSettings(cfg); err != nil {
			jsonError(w, "failed to save", http.StatusInternalServerError)
			return
		}
		// Apply the new config immediately if enabled, clear it if not
		if cfg.Enabled && cfg.Issuer != "" && cfg.ClientID != "" {
			if err := app.configureOIDC(cfg.Issuer, cfg.ClientID, cfg.ClientSecret, cfg.RedirectURL); err != nil {
				log.Printf("[WARN] OIDC reconfiguration failed: %v", err)
				jsonError(w, "OIDC configuration error: "+err.Error(), http.StatusBadGateway)
				return
			}
			app.oidcExclusive = cfg.Exclusive
			if cfg.DefaultRole != "" {
				app.oidcDefaultRole = Role(cfg.DefaultRole)
			} else {
				app.oidcDefaultRole = RoleReadWrite
			}
		} else if !cfg.Enabled {
			app.oidc = nil
			app.oidcExclusive = false
		}
		jsonOK(w, map[string]string{"status": "ok"})
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── OIDC test / diagnostic handler ──────────────────────────────────────────────
//
// POST /api/admin/oidc/test — tests OIDC connectivity and configuration end-to-end.
// Returns a structured diagnostic report with status for each step.

func (app *App) handleOIDCTest(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type stepResult struct {
		Step    string `json:"step"`
		OK      bool   `json:"ok"`
		Message string `json:"message"`
		Detail  string `json:"detail,omitempty"`
	}
	var steps []stepResult

	addStep := func(step string, ok bool, msg, detail string) {
		steps = append(steps, stepResult{Step: step, OK: ok, Message: msg, Detail: detail})
		if ok {
			logVerbose("OIDC test [%s]: OK — %s", step, msg)
		} else {
			log.Printf("[WARN] OIDC test [%s]: FAIL — %s | %s", step, msg, detail)
		}
	}

	// Step 1: Check in-memory OIDC config
	if app.oidc == nil {
		cfg := app.store.GetOIDCSettings()
		if !cfg.Enabled || cfg.Issuer == "" || cfg.ClientID == "" {
			addStep("config", false, "OIDC is not enabled or configured", "Enable OIDC and provide Issuer URL, Client ID, and Client Secret.")
			jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
			return
		}
		addStep("config", false, "OIDC settings are stored but not yet active (server not yet loaded them)", "Try saving the settings again or restarting the server.")
	} else {
		addStep("config", true,
			fmt.Sprintf("OIDC configured: issuer=%s client_id=%s", app.oidc.Issuer, app.oidc.ClientID),
			fmt.Sprintf("authorization_endpoint=%s token_endpoint=%s userinfo_endpoint=%s",
				app.oidc.AuthorizationEndpoint, app.oidc.TokenEndpoint, app.oidc.UserinfoEndpoint))
	}

	if app.oidc == nil {
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}

	// Step 2: Fetch discovery document (re-fetch live)
	discURL := strings.TrimRight(app.oidc.Issuer, "/") + "/.well-known/openid-configuration"
	log.Printf("[INFO] OIDC test: fetching discovery document from %s", discURL)
	discResp, err := http.Get(discURL) //nolint:gosec
	if err != nil {
		addStep("discovery", false, "Cannot reach OIDC discovery endpoint", err.Error())
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}
	defer discResp.Body.Close()
	if discResp.StatusCode != http.StatusOK {
		addStep("discovery", false,
			fmt.Sprintf("Discovery endpoint returned HTTP %d", discResp.StatusCode),
			"Expected HTTP 200. Check that the Issuer URL is correct.")
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}
	var disc map[string]interface{}
	if err := json.NewDecoder(discResp.Body).Decode(&disc); err != nil {
		addStep("discovery", false, "Discovery document is not valid JSON", err.Error())
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}
	discDetail := fmt.Sprintf("issuer=%v auth=%v token=%v userinfo=%v",
		disc["issuer"], disc["authorization_endpoint"], disc["token_endpoint"], disc["userinfo_endpoint"])
	addStep("discovery", true, "Discovery document fetched successfully", discDetail)

	// Step 3: Verify required fields in discovery document
	requiredFields := []string{"authorization_endpoint", "token_endpoint", "userinfo_endpoint"}
	var missingFields []string
	for _, f := range requiredFields {
		if _, ok := disc[f]; !ok {
			missingFields = append(missingFields, f)
		}
	}
	if len(missingFields) > 0 {
		addStep("discovery_fields", false,
			"Discovery document is missing required fields: "+strings.Join(missingFields, ", "),
			"The OIDC provider may not be fully compliant with the OpenID Connect specification.")
	} else {
		addStep("discovery_fields", true, "All required OIDC fields present in discovery document", "")
	}

	// Step 4: Check that redirect URL is configured
	if app.oidc.RedirectURL == "" {
		addStep("redirect_url", false, "Redirect URL is not configured", "Set the Redirect URL to https://your-server/auth/oidc/callback")
	} else {
		addStep("redirect_url", true, "Redirect URL configured: "+app.oidc.RedirectURL, "Make sure this URL is registered in your identity provider's allowed redirect URIs.")
	}

	// Step 5: Check that client credentials are present
	if app.oidc.ClientID == "" {
		addStep("credentials", false, "Client ID is not set", "")
	} else if app.oidc.ClientSecret == "" {
		addStep("credentials", false, "Client Secret is not set", "")
	} else {
		addStep("credentials", true, "Client credentials present (ID and Secret)", "The secret is not shown for security.")
	}

	// Step 6: Check exclusive mode setting
	if app.oidcExclusive {
		addStep("exclusive_mode", true, "Exclusive mode is ON — local login is disabled (admin account excepted)", "")
	} else {
		addStep("exclusive_mode", true, "Exclusive mode is OFF — local login is available alongside SSO", "")
	}

	// Step 7: OIDC route registration
	addStep("routes", true,
		"OIDC routes are registered: /auth/oidc/login and /auth/oidc/callback",
		fmt.Sprintf("Default role for new SSO users: %s", app.oidcDefaultRole))

	// Overall result
	overall := true
	for _, s := range steps {
		if !s.OK {
			overall = false
			break
		}
	}

	jsonOK(w, map[string]interface{}{
		"steps":   steps,
		"overall": overall,
		"summary": func() string {
			if overall {
				return "OIDC configuration looks correct. Users can sign in via SSO."
			}
			return "OIDC configuration has issues. Review the steps above."
		}(),
	})
}

// ── Invitation handlers ─────────────────────────────────────────────────────────

func (app *App) handleInvitations(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	switch r.Method {
	case http.MethodGet:
		jsonOK(w, app.store.GetInvitations())
	case http.MethodPost:
		var req struct {
			Note  string `json:"note"`
			Email string `json:"email"` // optional: send invitation link via email
		}
		if err := decode(r, &req); err != nil {
			jsonError(w, "invalid request", http.StatusBadRequest)
			return
		}
		code, err := generateID()
		if err != nil {
			jsonError(w, "internal error", http.StatusInternalServerError)
			return
		}
		// Use a 24-character code (96 bits of entropy) — short enough to share
		// but long enough to be brute-force resistant.
		code = code[:24]
		inv, err := app.store.CreateInvitation(PersonalInvitation{
			Code:      code,
			Note:      req.Note,
			CreatedBy: user.ID,
		})
		if err != nil {
			jsonError(w, "failed to create invitation", http.StatusInternalServerError)
			return
		}
		// Send invitation email if SMTP is configured and email provided
		if req.Email != "" {
			cfg := app.store.GetMailConfig()
			if cfg.Enabled && cfg.SMTPHost != "" {
				invURL := fmt.Sprintf("/register?code=%s", code)
				body := fmt.Sprintf(`<p>You have been invited to join Tidslinjal.</p>
<p>Click the link below to create your account:</p>
<p><a href="%s">%s</a></p>
<p>Invitation code: <strong>%s</strong></p>`,
					invURL, invURL, htmlEscape(code))
				if err := app.sendMail(cfg, req.Email, "Tidslinjal — Invitation", body); err != nil {
					log.Printf("Failed to send invitation email to %s: %v", req.Email, err)
				} else {
					log.Printf("Invitation email sent to %s (code: %s)", req.Email, code)
				}
			}
		}
		jsonOK(w, inv)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (app *App) handleDeleteInvitation(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodDelete {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteInvitation(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Vet User handler ────────────────────────────────────────────────────────────

func (app *App) handleVetUser(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// /api/users/:id/vet
	if len(parts) < 4 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	uid, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.VetUser(uid); err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "user", uid,
		fmt.Sprintf("Admin %q vetted user #%d", user.Username, uid))
	// Send approval email if SMTP configured and user has email
	go func() {
		users := app.store.GetUsers()
		for _, u := range users {
			if u.ID == uid && u.Email != "" {
				cfg := app.store.GetMailConfig()
				if cfg.Enabled && cfg.SMTPHost != "" {
					body := fmt.Sprintf(`<p>Hello %s,</p>
<p>Your Tidslinjal account has been approved. You can now log in at <a href="/login">/login</a>.</p>`,
						htmlEscape(u.DisplayName))
					if err := app.sendMail(cfg, u.Email, "Tidslinjal — Account Approved", body); err != nil {
						log.Printf("Failed to send approval email to %s: %v", u.Email, err)
					}
				}
				break
			}
		}
	}()
	jsonOK(w, map[string]string{"status": "ok"})
}

// handleBlockUser blocks a user account (admin only). Blocked users cannot login even via OIDC.
func (app *App) handleBlockUser(w http.ResponseWriter, r *http.Request, admin *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	uid, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	target, ok := app.store.GetUserByID(uid)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	if target.Role == RoleAdmin {
		jsonError(w, "cannot block an admin account", http.StatusForbidden)
		return
	}
	target.Blocked = true
	if err := app.store.UpdateUser(*target); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(admin.ID, admin.DisplayName, "blocked", "user", uid,
		fmt.Sprintf("Admin %q blocked user %q (#%d)", admin.Username, target.Username, uid))
	jsonOK(w, map[string]string{"status": "blocked"})
}

// handleUnblockUser removes a block from a user account (admin only).
func (app *App) handleUnblockUser(w http.ResponseWriter, r *http.Request, admin *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	uid, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	target, ok := app.store.GetUserByID(uid)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	target.Blocked = false
	if err := app.store.UpdateUser(*target); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(admin.ID, admin.DisplayName, "unblocked", "user", uid,
		fmt.Sprintf("Admin %q unblocked user %q (#%d)", admin.Username, target.Username, uid))
	jsonOK(w, map[string]string{"status": "unblocked"})
}

// ── Password Reset handlers ────────────────────────────────────────────────────

func (app *App) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !app.authLimiter.allow(clientIP(r), 5, time.Minute) {
		jsonError(w, "too many requests — try again later", http.StatusTooManyRequests)
		return
	}
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Find user by username or email
	var targetUser *User
	if req.Username != "" {
		u, ok := app.store.GetUserByUsername(req.Username)
		if ok {
			targetUser = u
		}
	}
	if targetUser == nil && req.Email != "" {
		users := app.store.GetUsers()
		for i := range users {
			if users[i].Email == req.Email && req.Email != "" {
				targetUser = &users[i]
				break
			}
		}
	}

	// Always return success to avoid user enumeration
	if targetUser == nil {
		jsonOK(w, map[string]string{"status": "ok"})
		return
	}

	token, err := generateID()
	if err != nil {
		jsonOK(w, map[string]string{"status": "ok"})
		return
	}
	expiry := time.Now().Add(2 * time.Hour)
	app.store.SetPasswordResetToken(targetUser.ID, token, expiry) //nolint

	// Never log the token in plaintext — only note that a reset was initiated.
	log.Printf("Password reset requested for user %q (valid 2h)", targetUser.Username)

	// Send reset email if SMTP is configured and user has an email
	cfg := app.store.GetMailConfig()
	if cfg.Enabled && cfg.SMTPHost != "" && targetUser.Email != "" {
		resetURL := fmt.Sprintf("/login?reset_token=%s", token)
		body := fmt.Sprintf(`<p>Hello %s,</p>
<p>A password reset was requested for your Tidslinjal account.</p>
<p>Click the link below to reset your password (valid for 2 hours):</p>
<p><a href="%s">%s</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
			htmlEscape(targetUser.DisplayName), resetURL, resetURL)
		if err := app.sendMail(cfg, targetUser.Email, "Tidslinjal — Password Reset", body); err != nil {
			log.Printf("Failed to send password reset email to %s: %v", targetUser.Email, err)
		}
	} else {
		// SMTP not configured and/or user has no email. Log the token to stderr
		// (server console only, not the HTTP response) so an admin can relay it
		// out-of-band. Never return it in the API response.
		log.Printf("[SECURITY] No SMTP configured — password reset token for %q is available in server logs only. Deliver it out-of-band.", targetUser.Username)
		log.Printf("[SECURITY] Reset token (copy and send to user): %s", token)
	}
	// Always return a generic "ok" regardless of whether email was sent,
	// to avoid leaking whether the account/email exists or whether SMTP is set up.
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Token == "" || req.NewPassword == "" {
		jsonError(w, "token and new_password required", http.StatusBadRequest)
		return
	}
	// Apply password quality policy if enabled; otherwise enforce a bare minimum of 6
	if policy := app.store.GetSecuritySettings(); policy.PasswordPolicyEnabled {
		if err := validatePasswordQuality(req.NewPassword, policy); err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else if len(req.NewPassword) < 6 {
		jsonError(w, "password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	user, ok := app.store.GetUserByResetToken(req.Token)
	if !ok {
		jsonError(w, "invalid or expired token", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	user.PasswordHash = string(hash)
	user.PasswordResetToken = ""
	user.PasswordResetExpiry = nil
	if err := app.store.UpdateUser(*user); err != nil {
		jsonError(w, "failed to update password", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "updated", "user", user.ID, "password reset via token")
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Update email handler ────────────────────────────────────────────────────────

func (app *App) handleUpdateEmail(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Email string `json:"email"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	fullUser, ok := app.store.GetUserByID(user.ID)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	fullUser.Email = req.Email
	if err := app.store.UpdateUser(*fullUser); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Preferences handlers ───────────────────────────────────────────────────────

func (app *App) handleGetPreferences(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetPreferences(user.ID))
}

func (app *App) handleSavePreferences(w http.ResponseWriter, r *http.Request, user *User) {
	oldPrefs := app.store.GetPreferences(user.ID)
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
	// Validate webhook URL: block private/loopback addresses (SSRF protection)
	if p.WebhookURL != "" {
		if err := validateWebhookURL(p.WebhookURL); err != nil {
			jsonError(w, "invalid webhook URL: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	if err := app.store.SavePreferences(p); err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	// Audit webhook/integration changes
	if p.WebhookURL != oldPrefs.WebhookURL {
		if p.WebhookURL == "" {
			app.audit(user.ID, user.DisplayName, "deleted", "integration", 0, "Webhook integration removed")
		} else if oldPrefs.WebhookURL == "" {
			app.audit(user.ID, user.DisplayName, "created", "integration", 0,
				fmt.Sprintf("Webhook integration configured: type=%s", p.WebhookType))
		} else {
			app.audit(user.ID, user.DisplayName, "updated", "integration", 0,
				fmt.Sprintf("Webhook integration updated: type=%s", p.WebhookType))
		}
	}
	logDebug("preferences saved: user=%s theme=%s lang=%s", user.Username, p.Theme, p.Language)
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
	// Broadcast deletion to other clients
	deletedEv := &Event{ID: id, Title: title}
	app.broadcastEventChange(user.ID, "deleted", deletedEv)
	logDebug("event deleted: id=%d title=%q user=%s", id, title, user.Username)
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

	// Strip any path components from the filename to prevent path traversal attacks.
	safeFilename := filepath.Base(header.Filename)
	if safeFilename == "." || safeFilename == "/" {
		safeFilename = "upload"
	}
	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeFilename)
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
	// Sanitise filename for use in Content-Disposition to prevent header injection.
	// Remove double-quotes, backslashes, and newline characters that could break the header.
	safeDisp := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, att.Filename)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeDisp))
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
	logDebug("layer created: id=%d name=%q user=%s", created.ID, created.Name, user.Username)
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
	app.audit(user.ID, user.DisplayName, "deleted", "layer", id,
		fmt.Sprintf("Deleted layer %q", existing.Name))
	logDebug("layer deleted: id=%d user=%s", id, user.Username)
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
	// Auto-create a layer with the same name and add the new group to it
	autoLayer := Layer{
		Name:        created.Name,
		Description: created.Description,
		Color:       "#4A90D9",
		OwnerID:     user.ID,
		OwnerName:   user.DisplayName,
		Visibility:  "groups",
		GroupIDs:    []int64{created.ID},
		Permission:  "readwrite",
	}
	app.store.CreateLayer(autoLayer) //nolint
	w.WriteHeader(http.StatusCreated)
	logDebug("group created: id=%d name=%q user=%s", created.ID, created.Name, user.Username)
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
	grp, grpOK := app.store.GetGroupByID(id)
	if err := app.store.DeleteGroup(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if grpOK {
		app.audit(user.ID, user.DisplayName, "deleted", "group", id,
			fmt.Sprintf("Deleted group %q", grp.Name))
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

// ── Lock handlers ──────────────────────────────────────────────────────────────

func (app *App) handleGetLocks(w http.ResponseWriter, r *http.Request, user *User) {
	locks := app.store.GetLocks()
	if locks == nil {
		locks = []LockedSlot{}
	}
	jsonOK(w, locks)
}

func (app *App) handleCreateLock(w http.ResponseWriter, r *http.Request, user *User) {
	if !hasRole(user.Role, RoleTeamLead) && !user.CanLock {
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
	logVerbose("lock created: id=%d user=%s", created.ID, user.Username)
	jsonOK(w, created)
}

func (app *App) handleDeleteLock(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	// Admin can always unlock; lock creator and can_lock users can unlock their own
	if err := app.store.DeleteLockAuthorized(id, user.ID, hasRole(user.Role, RoleAdmin)); err != nil {
		jsonError(w, err.Error(), http.StatusForbidden)
		return
	}
	logVerbose("lock deleted: id=%d user=%s", id, user.Username)
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
		Username         string   `json:"username"`
		Password         string   `json:"password"`
		DisplayName      string   `json:"display_name"`
		Email            string   `json:"email"`
		Role             Role     `json:"role"`
		CanLock          bool     `json:"can_lock"`
		GroupIDs         []int64  `json:"group_ids"`
		NATODesignations []string `json:"nato_designations"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := validateUsername(req.Username); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		jsonError(w, "password is required", http.StatusBadRequest)
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
	validRoles := map[Role]bool{
		RoleObserver: true, RoleRead: true, RoleReporter: true,
		RoleReadWrite: true, RoleTeamLead: true, RoleOpLead: true,
		RoleStaffOfficer: true, RoleStaffOfficerFull: true, RoleAdmin: true,
	}
	if req.Role == "" {
		req.Role = RoleRead
	} else if !validRoles[req.Role] {
		jsonError(w, "invalid role", http.StatusBadRequest)
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	// Admin-created users are always vetted
	created, err := app.store.CreateUser(User{
		Username: req.Username, PasswordHash: string(hash),
		DisplayName: req.DisplayName, Email: req.Email,
		Role: req.Role, CanLock: req.CanLock, Vetted: true,
		NATODesignations: req.NATODesignations,
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
	logVerbose("user created: id=%d username=%q role=%s by=%s", created.ID, created.Username, created.Role, user.Username)
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
		Password         string   `json:"password"`
		CurrentPassword  string   `json:"current_password"` // required when non-admin changes own password
		DisplayName      string   `json:"display_name"`
		Email            string   `json:"email"`
		Role             Role     `json:"role"`
		CanLock          bool     `json:"can_lock"`
		GroupIDs         []int64  `json:"group_ids"`    // nil = no change; [] = remove all; [...] = replace
		GroupIDsSet      bool     `json:"group_ids_set"` // true if caller passed group_ids field
		NATODesignations []string `json:"nato_designations"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Password != "" {
		// Non-admin users must verify their current password before changing it
		if !hasRole(user.Role, RoleAdmin) {
			if err := bcrypt.CompareHashAndPassword([]byte(existing.PasswordHash), []byte(req.CurrentPassword)); err != nil {
				jsonError(w, "current password incorrect", http.StatusUnauthorized)
				return
			}
		}
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
	existing.Email = req.Email
	if hasRole(user.Role, RoleAdmin) {
		if req.Role != "" {
			existing.Role = req.Role
		}
		existing.CanLock = req.CanLock
		if req.NATODesignations != nil {
			existing.NATODesignations = req.NATODesignations
		}
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
	logVerbose("user deleted: id=%d by=%s", id, user.Username)
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Audit log handler ──────────────────────────────────────────────────────────

func (app *App) handleGetEventLog(w http.ResponseWriter, r *http.Request, user *User) {
	entries := app.store.GetEventLog()
	if entries == nil {
		entries = []EventLogEntry{}
	}
	jsonOK(w, entries)
}

func (app *App) handleAddEventLog(w http.ResponseWriter, r *http.Request, user *User) {
	var entry EventLogEntry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if entry.Source == "" {
		entry.Source = "manual"
	}
	entry.UserID = user.ID
	entry.UserName = user.DisplayName
	created, err := app.store.AddEventLogEntry(entry)
	if err != nil {
		jsonError(w, "failed to add event log entry", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "created", EntityType: "event_log", EntityID: created.ID,
		Summary: fmt.Sprintf("Added event log entry: %s", created.Source),
	})
	jsonOK(w, created)
}

func (app *App) handleGetAudit(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	limit := 500
	if l := q.Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	// Optional CSV export
	exportCSV := q.Get("format") == "csv"

	// Filtering params
	filterUser   := strings.ToLower(q.Get("user"))
	filterAction := strings.ToLower(q.Get("action"))
	filterSearch := strings.ToLower(q.Get("search"))
	var dateFrom, dateTo time.Time
	if df := q.Get("date_from"); df != "" {
		dateFrom, _ = time.Parse("2006-01-02", df)
	}
	if dt := q.Get("date_to"); dt != "" {
		dateTo, _ = time.Parse("2006-01-02", dt)
		dateTo = dateTo.Add(24*time.Hour - time.Second) // end of day
	}

	entries := app.store.GetAudit(limit)
	if entries == nil {
		entries = []AuditEntry{}
	}

	// Apply filters
	if filterUser != "" || filterAction != "" || filterSearch != "" || !dateFrom.IsZero() || !dateTo.IsZero() {
		filtered := entries[:0]
		for _, e := range entries {
			if filterUser != "" && !strings.Contains(strings.ToLower(e.UserName), filterUser) {
				continue
			}
			if filterAction != "" && !strings.Contains(strings.ToLower(e.Action), filterAction) {
				continue
			}
			if filterSearch != "" && !strings.Contains(strings.ToLower(e.Summary), filterSearch) &&
				!strings.Contains(strings.ToLower(e.UserName), filterSearch) &&
				!strings.Contains(strings.ToLower(e.Action), filterSearch) {
				continue
			}
			if !dateFrom.IsZero() && e.Timestamp.Before(dateFrom) {
				continue
			}
			if !dateTo.IsZero() && e.Timestamp.After(dateTo) {
				continue
			}
			filtered = append(filtered, e)
		}
		entries = filtered
	}

	if exportCSV {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=\"audit-log.csv\"")
		fmt.Fprintf(w, "ID,Timestamp,User,Action,EntityType,EntityID,Summary\n")
		for _, e := range entries {
			fmt.Fprintf(w, "%d,%s,%s,%s,%s,%d,%s\n",
				e.ID,
				e.Timestamp.Format(time.RFC3339),
				csvEscape(e.UserName),
				csvEscape(e.Action),
				csvEscape(e.EntityType),
				e.EntityID,
				csvEscape(e.Summary),
			)
		}
		return
	}
	jsonOK(w, entries)
}

func csvEscape(s string) string {
	if strings.ContainsAny(s, ",\"\n\r") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
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
	// Auto-record wall-clock time when artificial time is set/changed
	if es.ArtificialTimeEnabled && es.ArtificialTime != "" {
		old := app.store.GetExerciseSettings()
		if es.ArtificialTime != old.ArtificialTime || !old.ArtificialTimeEnabled {
			es.ArtificialTimeSetAt = time.Now().UTC().Format(time.RFC3339)
		} else if old.ArtificialTimeSetAt != "" {
			es.ArtificialTimeSetAt = old.ArtificialTimeSetAt
		}
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
	jsonOK(w, map[string]any{"version": AppVersion, "github": AppGitHub, "debug": debug})
}

// ── Integration Status ─────────────────────────────────────────────────────────

// handleStatus returns a summary of all integration statuses (admin-only).
// This powers the legend panel's "Integrations" section.
func (app *App) handleStatus(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// OIDC / SSO
	oidcCfg := app.store.GetOIDCSettings()
	ssoStatus := map[string]any{
		"enabled":   oidcCfg.Enabled,
		"issuer":    oidcCfg.Issuer,
		"exclusive": oidcCfg.Exclusive,
		"active":    app.oidc != nil && oidcCfg.Enabled,
	}

	// TLS
	tlsCfg := app.store.GetTLSConfig()
	tlsStatus := map[string]any{
		"configured": tlsCfg.CertFile != "" && tlsCfg.KeyFile != "",
		"cert_file":  tlsCfg.CertFile,
	}

	// Syslog
	syslogCfg := app.store.GetSyslogConfig()
	syslogStatus := map[string]any{
		"enabled":   syslogCfg.Enabled,
		"host":      syslogCfg.Host,
		"port":      syslogCfg.Port,
		"transport": syslogCfg.Transport,
		"format":    syslogCfg.Format,
	}

	// SMTP / Mail
	mailCfg := app.store.GetMailConfig()
	smtpStatus := map[string]any{
		"enabled":   mailCfg.Enabled,
		"host":      mailCfg.SMTPHost,
		"port":      mailCfg.SMTPPort,
		"tls_mode":  mailCfg.TLSMode,
		"from_addr": mailCfg.FromAddr,
	}

	// Mattermost / Webhooks — count users with configured webhooks
	allPrefs := app.store.GetAllPreferences()
	mattermostCount := 0
	webhookCount := 0
	for _, p := range allPrefs {
		if p.WebhookURL != "" {
			webhookCount++
			if p.WebhookType == "mattermost" || p.WebhookType == "slack" {
				mattermostCount++
			}
		}
	}
	mattermostStatus := map[string]any{
		"webhook_users":     webhookCount,
		"mattermost_users":  mattermostCount,
	}

	// API Keys
	apiKeys := app.store.GetAPIKeys()
	apiKeyStatus := map[string]any{
		"count": len(apiKeys),
	}

	jsonOK(w, map[string]any{
		"sso":        ssoStatus,
		"tls":        tlsStatus,
		"syslog":     syslogStatus,
		"smtp":       smtpStatus,
		"mattermost": mattermostStatus,
		"api_keys":   apiKeyStatus,
	})
}

// ── Admin Reset ────────────────────────────────────────────────────────────────

func (app *App) handleAdminReset(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Only admin can reset
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	// Confirm intent via request body
	var req struct {
		Confirm       string `json:"confirm"`
		KeepTemplates bool   `json:"keep_templates"`
	}
	if err := decode(r, &req); err != nil || req.Confirm != "RESET" {
		jsonError(w, "confirmation required: send {\"confirm\":\"RESET\"}", http.StatusBadRequest)
		return
	}
	if err := app.store.ResetToEmpty(*user, req.KeepTemplates); err != nil {
		jsonError(w, "reset failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	log.Printf("Admin %q triggered a full system reset (data cleared, admin account preserved, keepTemplates=%v)", user.Username, req.KeepTemplates)
	jsonOK(w, map[string]string{"status": "reset complete"})
}

// ── Admin Session Management ───────────────────────────────────────────────────

func (app *App) handleAdminSessions(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessions := app.store.GetAllSessions()
	if sessions == nil {
		sessions = []SessionInfo{}
	}
	jsonOK(w, sessions)
}

func (app *App) handleAdminDeleteSession(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodDelete {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// /api/admin/sessions/:id
	if len(parts) < 4 {
		jsonError(w, "missing session id", http.StatusBadRequest)
		return
	}
	sessID := parts[3]
	if err := app.store.DeleteSession(sessID); err != nil {
		jsonError(w, "session not found", http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "session", 0,
		fmt.Sprintf("Admin %q terminated session %s…", user.Username, sessID[:min(8, len(sessID))]))
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Admin Bulk Actions ─────────────────────────────────────────────────────────

func (app *App) handleAdminBulkStatus(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Filter   string      `json:"filter"` // type | user | group | role | status | layer | all
		Value    string      `json:"value"`
		Status   EventStatus `json:"status"`
		TimeFrom string      `json:"time_from,omitempty"` // ISO8601
		TimeTo   string      `json:"time_to,omitempty"`   // ISO8601
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	validFilters := map[string]bool{"type": true, "user": true, "group": true, "role": true, "status": true, "layer": true, "all": true}
	if !validFilters[req.Filter] {
		jsonError(w, "filter must be one of: type, user, group, role, status, layer, all", http.StatusBadRequest)
		return
	}
	if req.Status == "" {
		jsonError(w, "status required", http.StatusBadRequest)
		return
	}
	f := BulkFilter{Filter: req.Filter, Value: req.Value}
	if req.TimeFrom != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeFrom); err == nil {
			f.TimeFrom = &t
		}
	}
	if req.TimeTo != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeTo); err == nil {
			f.TimeTo = &t
		}
	}
	count, err := app.store.BulkSetEventStatus(f, req.Status)
	if err != nil {
		jsonError(w, "bulk update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "bulk_status", "event", 0,
		fmt.Sprintf("Admin %q set %d events (filter=%s value=%q) to status %q", user.Username, count, req.Filter, req.Value, req.Status))
	app.broker.BroadcastAll(SSEMessage{Event: "bulk_change", Data: `{"action":"status_updated"}`})
	jsonOK(w, map[string]any{"updated": count})
}

func (app *App) handleAdminBulkDelete(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Filter   string `json:"filter"`
		Value    string `json:"value"`
		Confirm  string `json:"confirm"` // must be "DELETE"
		TimeFrom string `json:"time_from,omitempty"`
		TimeTo   string `json:"time_to,omitempty"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Confirm != "DELETE" {
		jsonError(w, "confirmation required: send {\"confirm\":\"DELETE\"}", http.StatusBadRequest)
		return
	}
	validFilters := map[string]bool{"type": true, "user": true, "group": true, "role": true, "status": true, "layer": true, "all": true}
	if !validFilters[req.Filter] {
		jsonError(w, "filter must be one of: type, user, group, role, status, layer, all", http.StatusBadRequest)
		return
	}
	f := BulkFilter{Filter: req.Filter, Value: req.Value}
	if req.TimeFrom != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeFrom); err == nil {
			f.TimeFrom = &t
		}
	}
	if req.TimeTo != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeTo); err == nil {
			f.TimeTo = &t
		}
	}
	count, err := app.store.BulkDeleteEvents(f)
	if err != nil {
		jsonError(w, "bulk delete failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "bulk_deleted", "event", 0,
		fmt.Sprintf("Admin %q deleted %d events (filter=%s value=%q)", user.Username, count, req.Filter, req.Value))
	app.broker.BroadcastAll(SSEMessage{Event: "bulk_change", Data: `{"action":"events_deleted"}`})
	jsonOK(w, map[string]any{"deleted": count})
}

func (app *App) handleAdminBulkSetType(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Filter    string `json:"filter"`
		Value     string `json:"value"`
		EventType string `json:"event_type"`
		TimeFrom  string `json:"time_from,omitempty"`
		TimeTo    string `json:"time_to,omitempty"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.EventType == "" {
		jsonError(w, "event_type required", http.StatusBadRequest)
		return
	}
	validFilters := map[string]bool{"type": true, "user": true, "group": true, "role": true, "status": true, "layer": true, "all": true}
	if !validFilters[req.Filter] {
		jsonError(w, "invalid filter", http.StatusBadRequest)
		return
	}
	f := BulkFilter{Filter: req.Filter, Value: req.Value}
	if req.TimeFrom != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeFrom); err == nil {
			f.TimeFrom = &t
		}
	}
	if req.TimeTo != "" {
		if t, err := time.Parse(time.RFC3339, req.TimeTo); err == nil {
			f.TimeTo = &t
		}
	}
	count, err := app.store.BulkSetEventType(f, req.EventType)
	if err != nil {
		jsonError(w, "bulk update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "bulk_type", "event", 0,
		fmt.Sprintf("Admin %q changed type of %d events (filter=%s value=%q) to %q", user.Username, count, req.Filter, req.Value, req.EventType))
	app.broker.BroadcastAll(SSEMessage{Event: "bulk_change", Data: `{"action":"type_updated"}`})
	jsonOK(w, map[string]any{"updated": count})
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

func parseCommaSet(s string) map[string]bool {
	m := map[string]bool{}
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			m[part] = true
		}
	}
	return m
}

// ── Template handlers ─────────────────────────────────────────────────────

func (app *App) handleGetTemplates(w http.ResponseWriter, r *http.Request, user *User) {
	templates := app.store.GetTemplates(user.ID)
	if templates == nil {
		templates = []Template{}
	}
	jsonOK(w, templates)
}

func (app *App) handleCreateTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	var tmpl Template
	if err := json.NewDecoder(r.Body).Decode(&tmpl); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if tmpl.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	if tmpl.Scope == "public" && !hasRole(user.Role, RoleOpLead) {
		jsonError(w, "only operations leads and admins may create public templates", http.StatusForbidden)
		return
	}
	tmpl.CreatedBy = user.ID
	tmpl.CreatedByName = user.DisplayName
	if tmpl.CreatedByName == "" {
		tmpl.CreatedByName = user.Username
	}
	// Populate template items with attachment references from their source events
	for i, item := range tmpl.Items {
		if item.Attachments == nil {
			tmpl.Items[i].Attachments = []TemplateAttachment{}
		}
	}
	created, err := app.store.CreateTemplate(tmpl)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "saved", "template", created.ID,
		fmt.Sprintf("Saved template %q (%d items, scope=%s)", created.Name, len(created.Items), created.Scope))
	logDebug("[template] Created template id=%d name=%q items=%d scope=%s", created.ID, created.Name, len(created.Items), created.Scope)
	jsonOK(w, created)
}

func (app *App) handleDeleteTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	isAdmin := hasRole(user.Role, RoleAdmin)
	if err := app.store.DeleteTemplate(id, user.ID, isAdmin); err != nil {
		jsonError(w, err.Error(), http.StatusForbidden)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) handleApplyTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	// Extract template ID from path /api/templates/{id}/apply
	path := strings.TrimPrefix(r.URL.Path, "/api/templates/")
	parts := strings.SplitN(path, "/", 2)
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}

	var req struct {
		BaseTime time.Time `json:"base_time"`
		LayerID  *int64    `json:"layer_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.BaseTime.IsZero() {
		jsonError(w, "base_time required", http.StatusBadRequest)
		return
	}

	// Check template access
	tmpl, ok := app.store.GetTemplate(id)
	if !ok {
		jsonError(w, "template not found", http.StatusNotFound)
		return
	}
	if tmpl.Scope == "private" && tmpl.CreatedBy != user.ID {
		jsonError(w, "access denied", http.StatusForbidden)
		return
	}

	displayName := user.DisplayName
	if displayName == "" {
		displayName = user.Username
	}
	logDebug("[template] Applying template id=%d name=%q base=%s layer=%v user=%s",
		id, tmpl.Name, req.BaseTime.Format(time.RFC3339), req.LayerID, displayName)
	count, err := app.store.ApplyTemplate(id, req.BaseTime, req.LayerID, user.ID, displayName)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	logDebug("[template] Applied template %q: created %d events (base=%s)", tmpl.Name, count, req.BaseTime.Format(time.RFC3339))
	app.audit(user.ID, user.DisplayName, "applied", "template", id,
		fmt.Sprintf("Applied template %q: created %d events (base=%s)", tmpl.Name, count, req.BaseTime.Format(time.RFC3339)))
	// Set STARTEX (exercise epoch) to the base time specified by the user
	// and record the template name for the legend display
	{
		ex := app.store.GetExerciseSettings()
		ex.Epoch = req.BaseTime.Format(time.RFC3339)
		ex.LastTemplate = tmpl.Name
		app.store.SaveExerciseSettings(ex) //nolint
	}
	// If the template carries an exercise name, update the exercise label
	exerciseNameSet := ""
	if tmpl.ExerciseName != "" {
		ex := app.store.GetExerciseSettings()
		ex.Label = tmpl.ExerciseName
		app.store.SaveExerciseSettings(ex) //nolint
		exerciseNameSet = tmpl.ExerciseName
	}
	// If the template carries day hour preferences, update the requesting user's preferences
	dayStartHour, dayEndHour := 0, 0
	if tmpl.DayEndHour > 0 {
		prefs := app.store.GetPreferences(user.ID)
		prefs.DayStartHour = tmpl.DayStartHour
		prefs.DayEndHour = tmpl.DayEndHour
		app.store.SavePreferences(prefs) //nolint
		dayStartHour = tmpl.DayStartHour
		dayEndHour = tmpl.DayEndHour
	}
	// Apply theme/size/language from template to user preferences
	operationModeSet := ""
	groupLabelSet := ""
	userLabelSet := ""
	if tmpl.Theme != "" || tmpl.Size != "" || tmpl.Language != "" {
		prefs := app.store.GetPreferences(user.ID)
		if tmpl.Theme != "" {
			prefs.Theme = tmpl.Theme
		}
		if tmpl.Size != "" {
			prefs.Size = tmpl.Size
		}
		if tmpl.Language != "" {
			prefs.Language = tmpl.Language
		}
		app.store.SavePreferences(prefs) //nolint
	}
	// Apply operation mode / terminology settings to exercise settings
	if tmpl.OperationMode != "" || tmpl.GroupLabel != "" || tmpl.UserLabel != "" {
		ex := app.store.GetExerciseSettings()
		if tmpl.OperationMode != "" {
			ex.OperationMode = tmpl.OperationMode
			operationModeSet = tmpl.OperationMode
		}
		if tmpl.GroupLabel != "" {
			ex.GroupLabel = tmpl.GroupLabel
			groupLabelSet = tmpl.GroupLabel
		}
		if tmpl.UserLabel != "" {
			ex.UserLabel = tmpl.UserLabel
			userLabelSet = tmpl.UserLabel
		}
		app.store.SaveExerciseSettings(ex) //nolint
	}
	// Create alarms for template items that carry alarm settings
	for _, item := range tmpl.Items {
		if item.AlarmLeadTime <= 0 {
			continue
		}
		eventTime := req.BaseTime.Add(time.Duration(item.StartOffsetMin) * time.Minute)
		alarm := Alarm{
			UserID:     user.ID,
			EventTitle: item.Title,
			EventTime:  eventTime,
			LeadTime:   item.AlarmLeadTime,
			Sound:      item.AlarmSound,
			IsActive:   true,
		}
		app.store.CreateAlarm(alarm) //nolint
	}
	jsonOK(w, map[string]interface{}{
		"created":        count,
		"exercise_name":  exerciseNameSet,
		"day_start_hour": dayStartHour,
		"day_end_hour":   dayEndHour,
		"startex":        req.BaseTime.Format(time.RFC3339),
		"operation_mode": operationModeSet,
		"group_label":    groupLabelSet,
		"user_label":     userLabelSet,
		"theme":          tmpl.Theme,
		"size":           tmpl.Size,
		"language":       tmpl.Language,
	})
}

// handleGetRoles returns the current role configurations
func (app *App) handleGetRoles(w http.ResponseWriter, r *http.Request, user *User) {
	roles := app.store.GetRoleConfigs()
	if roles == nil {
		roles = []RoleConfig{}
	}
	jsonOK(w, roles)
}

// handleUpdateRoles saves updated role configurations (admin only)
func (app *App) handleUpdateRoles(w http.ResponseWriter, r *http.Request, user *User) {
	var configs []RoleConfig
	if err := json.NewDecoder(r.Body).Decode(&configs); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Protect the admin role — remove it if someone tried to include it
	filtered := make([]RoleConfig, 0, len(configs))
	for _, c := range configs {
		if c.Key != "admin" {
			filtered = append(filtered, c)
		}
	}
	if err := app.store.SaveRoleConfigs(filtered); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "roles", 0,
		fmt.Sprintf("Updated %d role configuration(s)", len(filtered)))
	jsonOK(w, filtered)
}

// handleResetDatabase resets all data except the audit trail
func (app *App) handleResetDatabase(w http.ResponseWriter, r *http.Request, user *User) {
	if err := app.store.ResetDatabase(); err != nil {
		jsonError(w, "reset failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Re-seed event types
	if err := app.store.SeedEventTypes(); err != nil {
		logVerbose("re-seed event types after reset: %v", err)
	}
	app.audit(user.ID, user.DisplayName, "reset", "system", 0, "Database reset to empty (audit trail preserved)")
	jsonOK(w, map[string]string{"status": "reset"})
}

// handleDuplicateEvent creates a copy of an existing event
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

// handleExportICS exports events as ICS/iCal format
func (app *App) handleExportICS(w http.ResponseWriter, r *http.Request, user *User) {
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	var from, to time.Time
	if fromStr != "" {
		from, _ = time.Parse(time.RFC3339, fromStr)
	}
	if toStr != "" {
		to, _ = time.Parse(time.RFC3339, toStr)
	}
	if from.IsZero() {
		from = time.Now().Add(-30 * 24 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now().Add(90 * 24 * time.Hour)
	}

	events := app.store.GetEventsInRange(from, to)

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="tidslinjal.ics"`)

	fmt.Fprint(w, "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tidslinjal//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n")
	for _, ev := range events {
		evEnd := ev.EndTime
		if evEnd == nil {
			end := ev.StartTime.Add(time.Hour)
			evEnd = &end
		}
		fmt.Fprintf(w, "BEGIN:VEVENT\r\nUID:tidslinjal-%d@tidslinjal\r\nDTSTAMP:%s\r\nDTSTART:%s\r\nDTEND:%s\r\nSUMMARY:%s\r\n",
			ev.ID,
			ev.CreatedAt.UTC().Format("20060102T150405Z"),
			ev.StartTime.UTC().Format("20060102T150405Z"),
			evEnd.UTC().Format("20060102T150405Z"),
			escICS(ev.Title))
		if ev.Description != "" {
			fmt.Fprintf(w, "DESCRIPTION:%s\r\n", escICS(ev.Description))
		}
		fmt.Fprint(w, "END:VEVENT\r\n")
	}
	fmt.Fprint(w, "END:VCALENDAR\r\n")
}

func escICS(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, ";", "\\;")
	s = strings.ReplaceAll(s, ",", "\\,")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

// unescICS reverses ICS text escaping.
func unescICS(s string) string {
	s = strings.ReplaceAll(s, "\\n", "\n")
	s = strings.ReplaceAll(s, "\\,", ",")
	s = strings.ReplaceAll(s, "\\;", ";")
	s = strings.ReplaceAll(s, "\\\\", "\\")
	return s
}

// parseICSTime parses iCalendar DTSTART/DTEND values which may be:
//   - 20060102T150405Z  (UTC datetime)
//   - 20060102T150405   (local/floating datetime)
//   - 20060102          (date-only, all-day)
func parseICSTime(val string) (time.Time, bool, error) {
	// Strip TZID and other parameters from property (value is after the last colon in the property line,
	// but we only receive the raw value here after the first ':').
	val = strings.TrimSpace(val)
	if len(val) == 8 {
		// DATE only: YYYYMMDD
		t, err := time.Parse("20060102", val)
		return t, true, err
	}
	if strings.HasSuffix(val, "Z") {
		t, err := time.Parse("20060102T150405Z", val)
		return t, false, err
	}
	t, err := time.Parse("20060102T150405", val)
	return t, false, err
}

// icsEventTypeFromCategories maps CATEGORIES strings to a known EventType key.
func icsEventTypeFromCategories(cats string) string {
	known := map[string]string{
		"event": "event", "händelse": "event", "evenement": "event",
		"instant": "instant", "ögonblick": "instant",
		"mote": "mote", "meeting": "mote", "möte": "mote", "reunion": "mote", "réunion": "mote",
		"decision": "decision", "beslut": "decision", "décision": "decision",
		"deadline": "deadline", "tidsgräns": "deadline", "échéance": "deadline", "echeance": "deadline",
		"activity": "activity", "aktivitet": "activity", "activité": "activity", "activite": "activity",
		"repeated": "repeated", "upprepande": "repeated", "récurrent": "repeated", "recurrent": "repeated",
		"reporting": "reporting", "rapportering": "reporting", "rapport": "reporting",
		"assigned_task": "assigned_task", "tilldelad uppgift": "assigned_task", "tâche assignée": "assigned_task",
		"standup": "standup", "standup meeting": "standup", "daglig standup": "standup",
		"physical_meeting": "physical_meeting", "physical meeting": "physical_meeting", "fysiskt möte": "physical_meeting",
	}
	for _, cat := range strings.Split(cats, ",") {
		if key, ok := known[strings.ToLower(strings.TrimSpace(unescICS(cat)))]; ok {
			return key
		}
	}
	return "event"
}

// icsRRuleToPattern maps an RRULE value to a RecurrencePattern string.
func icsRRuleToPattern(rrule string) (string, *time.Time) {
	parts := make(map[string]string)
	for _, p := range strings.Split(rrule, ";") {
		kv := strings.SplitN(p, "=", 2)
		if len(kv) == 2 {
			parts[kv[0]] = kv[1]
		}
	}
	freq := parts["FREQ"]
	interval := parts["INTERVAL"]

	var recEnd *time.Time
	if until := parts["UNTIL"]; until != "" {
		t, _, err := parseICSTime(until)
		if err == nil {
			recEnd = &t
		}
	}

	switch freq {
	case "MINUTELY":
		switch interval {
		case "15":
			return "15min", recEnd
		case "30":
			return "30min", recEnd
		}
	case "HOURLY":
		switch interval {
		case "", "1":
			return "hourly", recEnd
		case "2":
			return "2hours", recEnd
		case "3":
			return "3hours", recEnd
		case "4":
			return "4hours", recEnd
		}
	case "DAILY":
		return "daily", recEnd
	case "WEEKLY":
		return "weekly", recEnd
	case "MONTHLY":
		if interval == "3" {
			return "quarterly", recEnd
		}
		return "monthly", recEnd
	}
	return "", recEnd
}

// parseICSLines unfolds ICS content lines (RFC 5545 line folding: CRLF + SPACE/TAB continues).
func parseICSLines(data []byte) []string {
	raw := strings.ReplaceAll(string(data), "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	var unfolded []string
	for _, line := range strings.Split(raw, "\n") {
		if len(line) == 0 {
			continue
		}
		if (line[0] == ' ' || line[0] == '\t') && len(unfolded) > 0 {
			unfolded[len(unfolded)-1] += line[1:]
		} else {
			unfolded = append(unfolded, line)
		}
	}
	return unfolded
}

// ICSImportResult holds counts from an ICS import operation.
type ICSImportResult struct {
	Events  int `json:"events"`
	Skipped int `json:"skipped"`
}

func (app *App) handleImportICS(w http.ResponseWriter, r *http.Request, user *User) {
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		jsonError(w, "failed to parse form (max 20MB)", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("data")
	if err != nil {
		jsonError(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "failed to read file", http.StatusBadRequest)
		return
	}

	lines := parseICSLines(raw)

	result := ICSImportResult{}
	inEvent := false
	// Per-event scratch state
	var (
		summary     string
		description string
		dtstart     string
		dtend       string
		location    string
		categories  string
		rrule       string
		uid         string
	)
	reset := func() {
		summary, description, dtstart, dtend, location, categories, rrule, uid = "", "", "", "", "", "", "", ""
	}

	for _, line := range lines {
		switch {
		case line == "BEGIN:VEVENT":
			inEvent = true
			reset()
		case line == "END:VEVENT":
			if !inEvent {
				break
			}
			inEvent = false

			if summary == "" && uid == "" {
				result.Skipped++
				break
			}

			startT, allDay, err := parseICSTime(dtstart)
			if err != nil || startT.IsZero() {
				result.Skipped++
				break
			}

			ev := Event{
				Title:         unescICS(summary),
				Description:   unescICS(description),
				EventType:     icsEventTypeFromCategories(categories),
				Status:        StatusPlanned,
				StartTime:     startT,
				AllDay:        allDay,
				CreatedBy:     user.ID,
				CreatedByName: user.DisplayName,
			}

			if dtend != "" {
				endT, _, err := parseICSTime(dtend)
				if err == nil && !endT.IsZero() && endT.After(startT) {
					ev.EndTime = &endT
				}
			}
			if location != "" {
				ev.PhysicalLocation = unescICS(location)
			}
			if rrule != "" {
				pattern, recEnd := icsRRuleToPattern(rrule)
				if pattern != "" {
					ev.IsRecurring = true
					ev.RecurrencePattern = pattern
					ev.RecurrenceEnd = recEnd
				}
			}

			if _, err := app.store.CreateEvent(ev); err != nil {
				result.Skipped++
			} else {
				result.Events++
			}

		default:
			if !inEvent {
				break
			}
			// Split property name (possibly with params) from value
			idx := strings.IndexByte(line, ':')
			if idx < 0 {
				break
			}
			prop := line[:idx]
			val := line[idx+1:]
			// Property name is the part before any ';'
			propName := strings.ToUpper(strings.SplitN(prop, ";", 2)[0])
			switch propName {
			case "SUMMARY":
				summary = val
			case "DESCRIPTION":
				description = val
			case "DTSTART":
				dtstart = val
			case "DTEND":
				dtend = val
			case "LOCATION":
				location = val
			case "CATEGORIES":
				categories = val
			case "RRULE":
				rrule = val
			case "UID":
				uid = val
			}
		}
	}

	app.audit(user.ID, user.DisplayName, "imported", "ics", 0,
		fmt.Sprintf("ICS import: events=%d skipped=%d", result.Events, result.Skipped))
	jsonOK(w, result)
}

func (app *App) handleExport(w http.ResponseWriter, r *http.Request, user *User) {
	isPrivileged := hasRole(user.Role, RoleOpLead)
	include := r.URL.Query().Get("include")
	if include == "" {
		include = "events,groups,layers,alarms,phases,event_types,comments"
		if isPrivileged {
			include += ",users,decision_log,role_configs"
		}
	}
	data := app.store.GetExportDataFiltered(user.ID, isPrivileged, parseCommaSet(include))
	app.audit(user.ID, user.DisplayName, "exported", "data", 0,
		fmt.Sprintf("Exported JSON data (include=%s)", include))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-export-%s.json"`,
		time.Now().Format("2006-01-02")))
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(data) //nolint
}

func (app *App) handleImport(w http.ResponseWriter, r *http.Request, user *User) {
	isPrivileged := hasRole(user.Role, RoleOpLead)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		jsonError(w, "failed to parse form (max 20MB)", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("data")
	if err != nil {
		jsonError(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()
	var data ExportData
	if err := json.NewDecoder(file).Decode(&data); err != nil {
		jsonError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	include := r.FormValue("include")
	if include == "" {
		include = "events,groups,layers,alarms"
	}
	reassign := r.FormValue("reassign") == "true"
	result := app.store.ImportData(data, user.ID, user.DisplayName, isPrivileged, reassign, parseCommaSet(include))
	app.audit(user.ID, user.DisplayName, "imported", "data", 0,
		fmt.Sprintf("Imported groups=%d layers=%d events=%d alarms=%d users=%d skipped=%d",
			result.Groups, result.Layers, result.Events, result.Alarms, result.Users, result.Skipped))
	jsonOK(w, result)
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
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		active := app.store.GetActiveAlarms()
		logDebug("alarm scheduler tick: checking %d alarms", len(active))
		for _, alarm := range active {
			fireAt := alarm.EventTime.Add(-time.Duration(alarm.LeadTime) * time.Minute)
			if !now.Before(fireAt) { // fires when now >= fireAt
				app.store.MarkAlarmFired(alarm.ID) //nolint
				msg := fmt.Sprintf("Reminder: \"%s\" starts in %d minutes", alarm.EventTitle, alarm.LeadTime)
				if alarm.LeadTime == 0 {
					msg = fmt.Sprintf("Now: \"%s\" is starting", alarm.EventTitle)
				}
				notif := AlarmNotification{
					AlarmID: alarm.ID, EventID: alarm.EventID,
					EventTitle: alarm.EventTitle, EventTime: alarm.EventTime,
					LeadTime: alarm.LeadTime, Sound: alarm.Sound, Message: msg,
				}
				app.broker.Notify(alarm.UserID, notif)
				// Call per-alarm webhook if set
				if alarm.WebhookURL != "" {
					app.callWebhookURL(alarm.WebhookURL, "generic", msg, notif)
					app.audit(alarm.UserID, "", "posted", "integration", alarm.ID,
						fmt.Sprintf("Alarm webhook fired for %q (event: %s)", alarm.EventTitle, alarm.EventTime.Format("2006-01-02 15:04")))
				}
				// Call user-level webhook if configured, and audit it
				userPrefs := app.store.GetPreferences(alarm.UserID)
				if userPrefs.WebhookURL != "" {
					app.audit(alarm.UserID, "", "posted", "integration", alarm.ID,
						fmt.Sprintf("Alarm notification posted to user webhook for %q", alarm.EventTitle))
				}
				app.callWebhook(alarm.UserID, msg, notif)
				// Send alarm email if user has email and SMTP is configured
				go func(uID int64, aMsg, aTitle string, aTime time.Time) {
					users := app.store.GetUsers()
					for _, u := range users {
						if u.ID == uID && u.Email != "" {
							cfg := app.store.GetMailConfig()
							if cfg.Enabled && cfg.SMTPHost != "" {
								body := fmt.Sprintf(`<p><strong>Alarm:</strong> %s</p>
<p><strong>Event:</strong> %s</p><p><strong>Time:</strong> %s</p>
<p>Log in to Tidslinjal to acknowledge this alarm.</p>`,
									htmlEscape(aMsg), htmlEscape(aTitle), aTime.Format("2006-01-02 15:04 MST"))
								if err := app.sendMail(cfg, u.Email, "Tidslinjal — Alarm: "+aTitle, body); err != nil {
									log.Printf("alarm email failed for user %d: %v", uID, err)
								}
							}
							break
						}
					}
				}(alarm.UserID, msg, alarm.EventTitle, alarm.EventTime)
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

// securityHeaders wraps an http.Handler and injects security-related HTTP
// response headers on every reply. This provides defence-in-depth against
// clickjacking, MIME-sniffing, and other common web vulnerabilities.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()")
		// CSP: all JS/CSS served from 'self'; inline style="" attributes still
		// need 'unsafe-inline' for style-src but script-src is locked to 'self'.
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: blob: https://*.tile.openstreetmap.org; "+
				"connect-src 'self' https://nominatim.openstreetmap.org; "+
				"font-src 'self' data:; "+
				"frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

// securityHeadersWithHSTS wraps securityHeaders and additionally sets HSTS
// (HTTP Strict Transport Security) when the server is running over HTTPS.
func securityHeadersWithHSTS(next http.Handler) http.Handler {
	inner := securityHeaders(next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// max-age=63072000 = 2 years (OWASP recommended minimum)
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		inner.ServeHTTP(w, r)
	})
}

// ── Router ─────────────────────────────────────────────────────────────────────

func (app *App) routes() http.Handler {
	mux := http.NewServeMux()

	// Static files
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Favicon at root (browsers request /favicon.ico by default)
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/favicon.ico")
	})

	// Pages
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			http.ServeFile(w, r, "static/404.html")
			return
		}
		_, user := app.getSession(r)
		if user == nil {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		http.ServeFile(w, r, "static/index.html")
	})
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/login.html")
	})
	mux.HandleFunc("/admin-view", app.requireAuth(func(w http.ResponseWriter, r *http.Request, user *User) {
		if user.Role != RoleAdmin {
			http.Error(w, "Forbidden — admin access required", http.StatusForbidden)
			return
		}
		http.ServeFile(w, r, "static/admin.html")
	}))

	// Version
	mux.HandleFunc("/api/version", handleVersion)
	// Integration status (admin-only summary of SSO/TLS/Syslog/SMTP/Webhooks/API keys)
	mux.HandleFunc("/api/status", app.requireRole(RoleAdmin, app.handleStatus))

	// Admin operations
	mux.HandleFunc("/api/admin/reset", app.requireAuth(app.handleAdminReset))
	mux.HandleFunc("/api/admin/registration", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			// Public: expose only the mode (not the invitation code) so login page can check
			_, u := app.getSession(r)
			rs := app.store.GetRegistrationSettings()
			if u != nil && u.Role == RoleAdmin {
				// Admin sees full settings including invitation code
				jsonOK(w, rs)
			} else {
				// Public only sees mode
				jsonOK(w, map[string]string{"mode": rs.Mode})
			}
			return
		}
		app.requireAuth(app.handleRegistrationSettings)(w, r)
	})
	mux.HandleFunc("/api/admin/invitations", app.requireAuth(app.handleInvitations))
	mux.HandleFunc("/api/admin/invitations/", app.requireAuth(app.handleDeleteInvitation))
	mux.HandleFunc("/api/admin/oidc", app.requireAuth(app.handleOIDCSettings))
	mux.HandleFunc("/api/admin/oidc/test", app.requireAuth(app.handleOIDCTest))
	mux.HandleFunc("/api/admin/sessions", app.requireRole(RoleAdmin, app.handleAdminSessions))
	mux.HandleFunc("/api/admin/sessions/", app.requireRole(RoleAdmin, app.handleAdminDeleteSession))
	mux.HandleFunc("/api/admin/bulk/status", app.requireRole(RoleAdmin, app.handleAdminBulkStatus))
	mux.HandleFunc("/api/admin/bulk/delete", app.requireRole(RoleAdmin, app.handleAdminBulkDelete))
	mux.HandleFunc("/api/admin/bulk/type", app.requireRole(RoleAdmin, app.handleAdminBulkSetType))
	mux.HandleFunc("/api/export/xlsx", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleExportXLSX)(w, r)
	})

	// Auth
	mux.HandleFunc("/api/auth/login", app.handleLogin)
	mux.HandleFunc("/api/auth/logout", app.handleLogout)
	mux.HandleFunc("/api/auth/me", app.requireAuth(app.handleMe))
	mux.HandleFunc("/api/auth/change-password", app.requireAuth(app.handleChangePassword))
	mux.HandleFunc("/api/auth/password-policy", app.requireAuth(app.handlePasswordPolicy))
	mux.HandleFunc("/api/auth/register", app.handleRegister)
	mux.HandleFunc("/api/auth/forgot-password", app.handleForgotPassword)
	mux.HandleFunc("/api/auth/reset-password", app.handleResetPassword)
	mux.HandleFunc("/api/auth/update-email", app.requireAuth(app.handleUpdateEmail))

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

		// /api/events/:id/history
		if len(parts) == 4 && parts[3] == "history" && r.Method == http.MethodGet {
			app.requireAuth(app.handleGetEventHistory)(w, r)
			return
		}

		// /api/events/:id/lock (editing lock)
		if len(parts) == 4 && parts[3] == "lock" {
			switch r.Method {
			case http.MethodPost:
				app.requireAuth(app.handleAcquireEditingLock)(w, r)
			case http.MethodDelete:
				app.requireAuth(app.handleReleaseEditingLock)(w, r)
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
			app.requireRole(RoleOpLead, app.handleSaveExercise)(w, r)
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
			app.requireRole(RoleRead, app.handleGetUsers)(w, r)
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
		// /api/users/:id/vet
		if len(parts) == 4 && parts[3] == "vet" && r.Method == http.MethodPost {
			app.requireAuth(app.handleVetUser)(w, r)
			return
		}
		// /api/users/:id/block
		if len(parts) == 4 && parts[3] == "block" && r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleBlockUser)(w, r)
			return
		}
		// /api/users/:id/unblock
		if len(parts) == 4 && parts[3] == "unblock" && r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleUnblockUser)(w, r)
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

	// Export (authenticated users; admin/oplead can export all)
	mux.HandleFunc("/api/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleExport)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// Import (authenticated users; admin/oplead can import all)
	mux.HandleFunc("/api/import", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireAuth(app.handleImport)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// ICS import
	mux.HandleFunc("/api/import/ics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireAuth(app.handleImportICS)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Templates
	mux.HandleFunc("/api/templates", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetTemplates)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateTemplate)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/templates/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/templates/"), "/")
		if len(parts) == 1 && r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteTemplate)(w, r)
		} else if len(parts) == 2 && parts[1] == "apply" && r.Method == http.MethodPost {
			app.requireAuth(app.handleApplyTemplate)(w, r)
		} else {
			http.Error(w, "not found", http.StatusNotFound)
		}
	})

	// Role configuration (admin only for PUT)
	mux.HandleFunc("/api/roles", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetRoles)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleUpdateRoles)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Reset database (admin only)
	mux.HandleFunc("/api/reset", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleResetDatabase)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Event duplicate
	mux.HandleFunc("/api/events-duplicate/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleReadWrite, app.handleDuplicateEvent)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Activity feed
	mux.HandleFunc("/api/activity", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetActivityFeed)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ICS export
	mux.HandleFunc("/api/export/ics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleExportICS)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// OIDC SSO routes (only registered if OIDC is configured)
	if app.oidc != nil {
		mux.HandleFunc("/auth/oidc/login", app.handleOIDCLogin)
		mux.HandleFunc("/auth/oidc/callback", app.handleOIDCCallback)
		mux.HandleFunc("/api/auth/oidc-config", app.handleOIDCInfo)
	}

	// Mail configuration (admin only)
	mux.HandleFunc("/api/integrations/mail", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetMailConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveMailConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Mail send (for reports / alarm notifications)
	mux.HandleFunc("/api/mail/send", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleTeamLead, app.handleSendMail)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Mail: test connection
	mux.HandleFunc("/api/integrations/mail/test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleTestMail)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Syslog configuration (admin only)
	mux.HandleFunc("/api/integrations/syslog", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetSyslogConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveSyslogConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Syslog: test connection
	mux.HandleFunc("/api/integrations/syslog/test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleTestSyslog)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Security settings (password policy) — admin only
	mux.HandleFunc("/api/admin/security", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetSecuritySettings)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveSecuritySettings)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// TLS configuration — admin only (takes effect on next server restart)
	mux.HandleFunc("/api/integrations/tls", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetTLSConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveTLSConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Reports: on-demand download in specific format
	mux.HandleFunc("/api/reports/download", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleTeamLead, app.handleReportDownload)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Auto-report schedules (server-side)
	mux.HandleFunc("/api/auto-report-schedules", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleTeamLead, app.handleListAutoReportSchedules)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreateAutoReportSchedule)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/auto-report-schedules/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleTeamLead, app.handleDeleteAutoReportSchedule)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// API Keys
	mux.HandleFunc("/api/apikeys", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListAPIKeys)(w, r)
		case http.MethodPost:
			app.requireRole(RoleAdmin, app.handleCreateAPIKey)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/apikeys/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleDeleteAPIKey)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Filter presets
	mux.HandleFunc("/api/filter-presets", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListFilterPresets)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateFilterPreset)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/filter-presets/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteFilterPreset)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Decision Log — use Go 1.22+ method-based routing for clarity
	mux.HandleFunc("GET /api/decision-log", app.requireAuth(app.handleListDecisionLog))
	mux.HandleFunc("POST /api/decision-log", app.requireAuth(app.handleAddDecisionLogEntry))
	mux.HandleFunc("DELETE /api/decision-log/{id}", app.requireRole(RoleAdmin, app.handleDeleteDecisionLogEntry))
	mux.HandleFunc("PUT /api/decision-log/{id}/review", app.requireRole(RoleTeamLead, app.handleReviewDecisionLogEntry))
	mux.HandleFunc("POST /api/decision-log/{id}/attachment", app.requireAuth(app.handleDecisionLogAttachment))
	mux.HandleFunc("GET /api/decision-log/{id}/attachment/{filename}", app.handleDecisionLogAttachmentDownload)

	// Event Log
	mux.HandleFunc("/api/event-log", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleTeamLead, app.handleGetEventLog)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleAddEventLog)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Map Locations
	mux.HandleFunc("/api/map-locations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListMapLocations)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleAddMapLocation)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/map-locations/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleUpdateMapLocation)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleTeamLead, app.handleDeleteMapLocation)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Connector configuration (admin only)
	mux.HandleFunc("/api/integrations/connectors", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListConnectors)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveConnectorConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Editing locks (all active locks for collaborative editing awareness)
	mux.HandleFunc("/api/editing-locks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetEditingLocks)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Backup & Restore (admin only)
	mux.HandleFunc("/api/backup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleAdmin, app.handleBackup)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/restore", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleRestore)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Gradual Backup (admin only)
	mux.HandleFunc("/api/admin/gradual-backup", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleGradualBackupSettings)(w, r)
	})
	mux.HandleFunc("/api/admin/gradual-backup/snapshot", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleGradualBackupSnapshotNow)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/gradual-backup/restore/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleGradualBackupRestore)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/gradual-backup/download/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleAdmin, app.handleGradualBackupDownload)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/gradual-backup/snapshots/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleGradualBackupDelete)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// WebCal subscription (token-based, no session cookie required)
	mux.HandleFunc("/webcal/", app.handleWebCal)

	// Update user profile handles (social handles, etc.)
	mux.HandleFunc("/api/auth/profile", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			app.requireAuth(app.handleUpdateProfile)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Cascade reschedule for event dependencies
	mux.HandleFunc("/api/events/cascade", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleReadWrite, app.handleCascadeReschedule)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Ingest API ──
	mux.HandleFunc("/api/ingest", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleIngest)(w, r)
	})

	// ── Routing rules (admin/oplead) ──
	mux.HandleFunc("/api/routing-rules", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleOpLead, app.handleRoutingRules)(w, r)
	})
	mux.HandleFunc("/api/routing-rules/", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleOpLead, app.handleRoutingRule)(w, r)
	})

	// ── Connector management (admin only) ──
	mux.HandleFunc("/api/connectors", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleConnectors)(w, r)
	})
	mux.HandleFunc("/api/connectors/", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleConnectorConfig)(w, r)
	})

	// ── STIX export ──
	mux.HandleFunc("/api/export/stix", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleSTIXExport)(w, r)
	})

	// ── LDAP config (admin only) ──
	mux.HandleFunc("/api/integrations/ldap", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleLDAPConfig)(w, r)
	})
	mux.HandleFunc("/api/integrations/ldap/test", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleLDAPTest)(w, r)
	})

	// ── Federated IdPs / Trust Realms (admin only) ──
	mux.HandleFunc("/api/federation/idps", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListFederatedIdPs)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveFederatedIdP)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/federation/idps/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleDeleteFederatedIdP)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/federation/realms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListTrustRealms)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveTrustRealm)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Rooms / Resources ──
	mux.HandleFunc("/api/rooms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListRooms)(w, r)
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleSaveRoom)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/rooms/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleTeamLead, app.handleDeleteRoom)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Free/Busy lookup ──
	mux.HandleFunc("/api/free-busy", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleFreeBusy)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Meeting config (admin only) ──
	mux.HandleFunc("/api/meeting-config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetMeetingConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveMeetingConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Prometheus metrics (no auth — standard for metrics endpoints) ──
	mux.HandleFunc("/metrics", app.handleMetrics)

	// ── Map projection page ──
	mux.HandleFunc("/map", func(w http.ResponseWriter, r *http.Request) {
		_, user := app.getSession(r)
		if user == nil {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		http.ServeFile(w, r, "static/map-popup.html")
	})

	// Wrap the entire mux with security headers.
	if app.secureMode {
		return securityHeadersWithHSTS(mux)
	}
	return securityHeaders(mux)
}

// ── Mail Config ────────────────────────────────────────────────────────────────

func (app *App) handleGetMailConfig(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetMailConfig()
	cfg.Password = "" // never expose password
	jsonOK(w, cfg)
}

func (app *App) handleSaveMailConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg MailConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Preserve existing password if not provided in request
	if cfg.Password == "" {
		existing := app.store.GetMailConfig()
		cfg.Password = existing.Password
	}
	if err := app.store.SaveMailConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "mail_config", 0, "Updated mail configuration")
	resp := cfg
	resp.Password = ""
	jsonOK(w, resp)
}

func (app *App) handleTestMail(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetMailConfig()
	if !cfg.Enabled || cfg.SMTPHost == "" {
		jsonError(w, "Mail is not configured", http.StatusBadRequest)
		return
	}
	to := user.Email
	if to == "" {
		to = user.Username + "@example.com"
	}
	if err := app.sendMail(cfg, to, "Tidslinjal — Mail Test", "<p>Mail configuration is working correctly.</p>"); err != nil {
		jsonError(w, "Mail test failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "ok", "sent_to": to})
}

func (app *App) handleSendMail(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		To       string `json:"to"`
		Subject  string `json:"subject"`
		BodyHTML string `json:"body_html"`
		BodyText string `json:"body_text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	cfg := app.store.GetMailConfig()
	if !cfg.Enabled || cfg.SMTPHost == "" {
		jsonError(w, "mail not configured", http.StatusServiceUnavailable)
		return
	}
	body := req.BodyHTML
	if body == "" {
		body = "<pre>" + req.BodyText + "</pre>"
	}
	if err := app.sendMail(cfg, req.To, req.Subject, body); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "sent"})
}

// sendMail sends a plain HTML email via configured SMTP
func (app *App) sendMail(cfg MailConfig, to, subject, bodyHTML string) error {
	port := cfg.SMTPPort
	if port == 0 {
		port = 587
	}
	from := cfg.FromAddr
	if from == "" {
		from = "tidslinjal@localhost"
	}
	fromName := cfg.FromName
	if fromName == "" {
		fromName = "Tidslinjal"
	}

	msg := []byte(fmt.Sprintf("From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		fromName, from, to, subject, bodyHTML))

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, port)
	var auth interface{ Start(*smtp.ServerInfo) (string, []byte, error) }
	if cfg.Username != "" && cfg.Password != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)
	}

	if cfg.TLSMode == "tls" {
		tlsCfg := &tls.Config{ServerName: cfg.SMTPHost}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return err
		}
		defer conn.Close()
		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return err
		}
		defer client.Quit()
		if auth != nil {
			if err := client.Auth(auth.(smtp.Auth)); err != nil {
				return err
			}
		}
		if err := client.Mail(from); err != nil {
			return err
		}
		if err := client.Rcpt(to); err != nil {
			return err
		}
		wc, err := client.Data()
		if err != nil {
			return err
		}
		_, err = wc.Write(msg)
		wc.Close()
		return err
	}

	// STARTTLS or plain
	if auth != nil {
		return smtp.SendMail(addr, auth.(smtp.Auth), from, []string{to}, msg)
	}
	return smtp.SendMail(addr, nil, from, []string{to}, msg)
}

// ── Syslog Config Handlers ────────────────────────────────────────────────────

func (app *App) handleGetSyslogConfig(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetSyslogConfig())
}

func (app *App) handleSaveSyslogConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg SyslogConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if cfg.Transport == "" {
		cfg.Transport = "udp"
	}
	if cfg.Format == "" {
		cfg.Format = "classic"
	}
	if err := app.store.SaveSyslogConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Apply new config immediately
	setSyslogWriter(cfg)
	if cfg.Enabled && cfg.Host != "" {
		log.SetOutput(&syslogLogWriter{orig: os.Stderr})
	} else {
		log.SetOutput(os.Stderr)
	}
	app.audit(user.ID, user.DisplayName, "updated", "syslog_config", 0, "Updated syslog configuration")
	jsonOK(w, cfg)
}

func (app *App) handleTestSyslog(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetSyslogConfig()
	if !cfg.Enabled || cfg.Host == "" {
		jsonError(w, "Syslog is not configured", http.StatusBadRequest)
		return
	}
	// Temporarily create a writer and send a test message
	hn, _ := os.Hostname()
	sw := &syslogWriter{cfg: cfg, hostname: hn}
	sw.send(6, fmt.Sprintf("Tidslinjal syslog test from %s (user: %s)", hn, user.Username))
	jsonOK(w, map[string]string{"status": "ok", "transport": cfg.Transport, "host": cfg.Host})
}

// ── Security Settings Handlers ────────────────────────────────────────────────

func (app *App) handleGetSecuritySettings(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetSecuritySettings())
}

func (app *App) handleSaveSecuritySettings(w http.ResponseWriter, r *http.Request, user *User) {
	var ss SecuritySettings
	if err := json.NewDecoder(r.Body).Decode(&ss); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if ss.MinLength == 0 {
		ss.MinLength = 8
	}
	if err := app.store.SaveSecuritySettings(ss); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "security_settings", 0, "Updated password policy")
	jsonOK(w, ss)
}

// ── TLS Config Handlers ───────────────────────────────────────────────────────

func (app *App) handleGetTLSConfig(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetTLSConfig())
}

func (app *App) handleSaveTLSConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg TLSConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Validate paths exist if provided
	if cfg.CertFile != "" {
		if _, err := os.Stat(cfg.CertFile); err != nil {
			jsonError(w, fmt.Sprintf("cert file not accessible: %v", err), http.StatusBadRequest)
			return
		}
	}
	if cfg.KeyFile != "" {
		if _, err := os.Stat(cfg.KeyFile); err != nil {
			jsonError(w, fmt.Sprintf("key file not accessible: %v", err), http.StatusBadRequest)
			return
		}
	}
	if err := app.store.SaveTLSConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "tls_config", 0,
		fmt.Sprintf("Updated TLS config: cert=%s key=%s", cfg.CertFile, cfg.KeyFile))
	jsonOK(w, map[string]any{
		"cert_file":       cfg.CertFile,
		"key_file":        cfg.KeyFile,
		"restart_required": true,
	})
}

// ── Report Download Handler ────────────────────────────────────────────────────

// handleReportDownload serves an on-demand report in the requested format.
// Query params: type=<report_type>, format=excel|rtf|docx|html|csv
func (app *App) handleReportDownload(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	reportType := q.Get("type")
	if reportType == "" {
		reportType = "timeline"
	}
	format := strings.ToLower(q.Get("format"))
	if format == "" {
		format = "html"
	}

	from := time.Now().Add(-30 * 24 * time.Hour)
	to := time.Now().Add(30 * 24 * time.Hour)
	if qf := q.Get("from"); qf != "" {
		if t, err := time.Parse(time.RFC3339, qf); err == nil {
			from = t
		}
	}
	if qt := q.Get("to"); qt != "" {
		if t, err := time.Parse(time.RFC3339, qt); err == nil {
			to = t
		}
	}

	events := app.store.GetEvents(from, to, nil)
	commentsMap := make(map[int64][]EventComment)
	for _, ev := range events {
		if cs := app.store.GetCommentsByEvent(ev.ID); len(cs) > 0 {
			commentsMap[ev.ID] = cs
		}
	}
	title := fmt.Sprintf("%s Report — %s", reportType, time.Now().Format("2006-01-02"))

	switch format {
	case "excel", "xlsx":
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.xlsx\"", reportType))
		buildReportXLSXWriter(w, title, events)
	case "rtf":
		w.Header().Set("Content-Type", "application/rtf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.rtf\"", reportType))
		w.Write(buildAutoReportRTF(title, events, commentsMap)) //nolint
	case "docx":
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.docx\"", reportType))
		buildReportDOCXWriter(w, title, events, commentsMap)
	default: // html
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.html\"", reportType))
		w.Write([]byte(buildAutoReportHTML(reportType, events, commentsMap))) //nolint
	}
}

// ── Auto-Report Schedule Handlers ─────────────────────────────────────────────

func (app *App) handleListAutoReportSchedules(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetAutoReportSchedules())
}

func (app *App) handleCreateAutoReportSchedule(w http.ResponseWriter, r *http.Request, user *User) {
	var sched AutoReportSchedule
	if err := decode(r, &sched); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	sched.CreatedBy = user.ID
	// Validate webhook URL when delivery is webhook (SSRF protection)
	if sched.Delivery == "webhook" && sched.Recipient != "" {
		if err := validateWebhookURL(sched.Recipient); err != nil {
			jsonError(w, "invalid webhook URL: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	sched.NextRun = calcNextRun(sched.Frequency, time.Now())
	created, err := app.store.CreateAutoReportSchedule(sched)
	if err != nil {
		jsonError(w, "failed to create schedule", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "auto_report_schedule", created.ID,
		fmt.Sprintf("Auto-report schedule created: %s %s → %s", created.ReportType, created.Frequency, created.Delivery))
	jsonOK(w, created)
}

func (app *App) handleDeleteAutoReportSchedule(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteAutoReportSchedule(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "auto_report_schedule", id, "Auto-report schedule removed")
	jsonOK(w, map[string]string{"status": "ok"})
}

func calcNextRun(frequency string, from time.Time) time.Time {
	switch frequency {
	case "hourly":
		return from.Add(time.Hour)
	case "weekly":
		return from.Add(7 * 24 * time.Hour)
	default: // daily
		return from.Add(24 * time.Hour)
	}
}

// startAutoReportScheduler runs a background goroutine that fires scheduled reports
func (app *App) startAutoReportScheduler() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			app.runDueAutoReports()
		}
	}()
}

func (app *App) runDueAutoReports() {
	now := time.Now()
	schedules := app.store.GetAutoReportSchedules()
	for _, s := range schedules {
		if !s.Enabled || s.NextRun.After(now) {
			continue
		}
		// Deliver the report
		if s.Delivery == "email" && s.Recipient != "" {
			app.sendAutoReportEmail(s)
		}
		// Update last run and next run
		s.LastRun = &now
		s.NextRun = calcNextRun(s.Frequency, now)
		app.store.UpdateAutoReportSchedule(s) //nolint
	}
}

func (app *App) sendAutoReportEmail(s AutoReportSchedule) {
	cfg := app.store.GetMailConfig()
	if !cfg.Enabled || cfg.SMTPHost == "" {
		log.Printf("Auto-report: mail not configured, skipping schedule %d", s.ID)
		return
	}
	now2 := time.Now()
	events := app.store.GetEvents(now2.Add(-30*24*time.Hour), now2.Add(30*24*time.Hour), nil)
	subject := fmt.Sprintf("Auto %s Report — %s", s.ReportType, time.Now().Format("2006-01-02"))
	// Build comments map for report
	commentsMap := make(map[int64][]EventComment)
	for _, ev := range events {
		comments := app.store.GetCommentsByEvent(ev.ID)
		if len(comments) > 0 {
			commentsMap[ev.ID] = comments
		}
	}

	format := strings.ToLower(s.Format)
	if format == "" {
		format = "html"
	}

	var err error
	switch format {
	case "excel", "xlsx":
		var buf bytes.Buffer
		buildReportXLSXWriter(&buf, subject, events)
		err = app.sendMailWithAttachment(cfg, s.Recipient, subject,
			"<p>Please find the report attached as an Excel file.</p>",
			buf.Bytes(), fmt.Sprintf("report-%s.xlsx", s.ReportType),
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	case "rtf":
		data := buildAutoReportRTF(subject, events, commentsMap)
		err = app.sendMailWithAttachment(cfg, s.Recipient, subject,
			"<p>Please find the report attached as an RTF file.</p>",
			data, fmt.Sprintf("report-%s.rtf", s.ReportType), "application/rtf")
	case "docx":
		var buf bytes.Buffer
		buildReportDOCXWriter(&buf, subject, events, commentsMap)
		err = app.sendMailWithAttachment(cfg, s.Recipient, subject,
			"<p>Please find the report attached as a Word document.</p>",
			buf.Bytes(), fmt.Sprintf("report-%s.docx", s.ReportType),
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	default: // html
		html := buildAutoReportHTML(s.ReportType, events, commentsMap)
		err = app.sendMail(cfg, s.Recipient, subject, html)
	}

	if err != nil {
		log.Printf("Auto-report: failed to send email for schedule %d: %v", s.ID, err)
	} else {
		log.Printf("Auto-report: sent %s report (%s) to %s (schedule %d)", s.ReportType, format, s.Recipient, s.ID)
	}
}

func buildAutoReportHTML(reportType string, events []Event, commentsMap map[int64][]EventComment) string {
	title := fmt.Sprintf("Auto %s Report — %s", reportType, time.Now().Format("2006-01-02 15:04"))
	rows := ""
	for _, ev := range events {
		start := ev.StartTime.Format("2006-01-02 15:04")
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		// Build comments cell
		commentHTML := ""
		if comments, ok := commentsMap[ev.ID]; ok && len(comments) > 0 {
			for _, c := range comments {
				commentHTML += fmt.Sprintf(`<div style="margin-bottom:4px"><span style="color:#666;font-size:11px">%s — %s</span><br>%s</div>`,
					htmlEscape(c.AuthorName), c.CreatedAt.Format("2006-01-02 15:04"), htmlEscape(c.Content))
			}
		}
		rows += fmt.Sprintf("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
			htmlEscape(ev.Title), htmlEscape(ev.EventType), htmlEscape(string(ev.Status)), start, end, commentHTML)
	}
	return fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>%s</title>
<style>body{font-family:sans-serif;margin:32px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%%;font-size:13px}th,td{border:1px solid #ccc;padding:6px 10px;vertical-align:top}th{background:#f0f0f0}</style></head><body>
<h1>%s</h1><p style="color:#666;font-size:13px">Auto-generated: %s</p>
<table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Comments</th></tr></thead><tbody>%s</tbody></table>
</body></html>`, htmlEscape(title), htmlEscape(title), time.Now().Format("2006-01-02 15:04:05"), rows)
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&#34;")
	return s
}

// ── Report format builders ────────────────────────────────────────────────────

// buildReportXLSXWriter writes an XLSX report to w using the existing xlsx helpers.
func buildReportXLSXWriter(w io.Writer, title string, events []Event) {
	zw := zip.NewWriter(w)
	xlsxWriteFile(zw, "[Content_Types].xml", xlsxContentTypes())
	xlsxWriteFile(zw, "_rels/.rels", xlsxRels())
	xlsxWriteFile(zw, "xl/workbook.xml", xlsxWorkbook())
	xlsxWriteFile(zw, "xl/_rels/workbook.xml.rels", xlsxWorkbookRels())
	xlsxWriteFile(zw, "xl/styles.xml", xlsxStyles())
	xlsxWriteFile(zw, "xl/worksheets/sheet1.xml", xlsxSheet(events, nil))
	zw.Close() //nolint
}

// buildAutoReportRTF builds an RTF document for the given events.
// RTF is a plain-text format that any word processor can open.
func buildAutoReportRTF(title string, events []Event, commentsMap map[int64][]EventComment) []byte {
	rtfEsc := func(s string) string {
		var b strings.Builder
		for _, r := range s {
			switch {
			case r == '\\':
				b.WriteString(`\\`)
			case r == '{':
				b.WriteString(`\{`)
			case r == '}':
				b.WriteString(`\}`)
			case r > 127:
				b.WriteString(fmt.Sprintf(`\u%d?`, r))
			default:
				b.WriteRune(r)
			}
		}
		return b.String()
	}

	var b strings.Builder
	b.WriteString(`{\rtf1\ansi\deff0`)
	b.WriteString(`{\fonttbl{\f0\froman\fcharset0 Times New Roman;}{\f1\fswiss\fcharset0 Arial;}}`)
	b.WriteString(`{\colortbl;\red0\green0\blue0;\red100\green100\blue100;\red0\green70\blue150;}`)
	b.WriteString("\n")

	// Title
	b.WriteString(fmt.Sprintf(`\f1\fs28\b\cf3 %s\b0\cf1\fs22\par`, rtfEsc(title)))
	b.WriteString(fmt.Sprintf(`\f0\fs18\cf2 Generated: %s\cf1\par\par`, time.Now().Format("2006-01-02 15:04:05")))

	// Table header (simulated with tabs)
	b.WriteString(`\f1\fs20\b Title\tab Type\tab Status\tab Start\tab End\b0\par`)
	b.WriteString(`\brdrb\brdrs\brdrw10 `)

	for _, ev := range events {
		start := ev.StartTime.Format("2006-01-02 15:04")
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		b.WriteString(fmt.Sprintf(`\f0\fs18 %s\tab %s\tab %s\tab %s\tab %s\par`,
			rtfEsc(ev.Title), rtfEsc(ev.EventType), rtfEsc(string(ev.Status)), rtfEsc(start), rtfEsc(end)))
		if comments, ok := commentsMap[ev.ID]; ok {
			for _, c := range comments {
				b.WriteString(fmt.Sprintf(`\cf2\fs16   [%s] %s: %s\cf1\fs18\par`,
					rtfEsc(c.CreatedAt.Format("2006-01-02 15:04")), rtfEsc(c.AuthorName), rtfEsc(c.Content)))
			}
		}
	}
	b.WriteString("}")
	return []byte(b.String())
}

// buildReportDOCXWriter writes a DOCX document to w.
// DOCX is an Office Open XML ZIP archive with XML parts.
func buildReportDOCXWriter(w io.Writer, title string, events []Event, commentsMap map[int64][]EventComment) {
	docxEsc := func(s string) string {
		s = strings.ReplaceAll(s, "&", "&amp;")
		s = strings.ReplaceAll(s, "<", "&lt;")
		s = strings.ReplaceAll(s, ">", "&gt;")
		s = strings.ReplaceAll(s, `"`, "&quot;")
		return s
	}

	// Build document.xml body
	var body strings.Builder
	body.WriteString(fmt.Sprintf(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>%s</w:t></w:r></w:p>`, docxEsc(title)))
	body.WriteString(fmt.Sprintf(`<w:p><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t>Generated: %s</w:t></w:r></w:p>`,
		time.Now().Format("2006-01-02 15:04:05")))

	// Table
	body.WriteString(`<w:tbl>`)
	body.WriteString(`<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>`)
	body.WriteString(`<w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>`)

	// Header row
	hdrCell := func(text string) string {
		return fmt.Sprintf(`<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9E1F2"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>%s</w:t></w:r></w:p></w:tc>`, docxEsc(text))
	}
	body.WriteString(`<w:tr>`)
	for _, h := range []string{"Title", "Type", "Status", "Start", "End"} {
		body.WriteString(hdrCell(h))
	}
	body.WriteString(`</w:tr>`)

	for _, ev := range events {
		start := ev.StartTime.Format("2006-01-02 15:04")
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		cell := func(text string) string {
			return fmt.Sprintf(`<w:tc><w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>`, docxEsc(text))
		}
		body.WriteString(`<w:tr>`)
		body.WriteString(cell(ev.Title))
		body.WriteString(cell(ev.EventType))
		body.WriteString(cell(string(ev.Status)))
		body.WriteString(cell(start))
		body.WriteString(cell(end))
		body.WriteString(`</w:tr>`)

		// Comments as extra rows
		if comments, ok := commentsMap[ev.ID]; ok {
			for _, c := range comments {
				commentText := fmt.Sprintf("[%s] %s: %s", c.CreatedAt.Format("2006-01-02 15:04"), c.AuthorName, c.Content)
				body.WriteString(fmt.Sprintf(`<w:tr><w:tc><w:tcPr><w:gridSpan w:val="5"/></w:tcPr><w:p><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">  %s</w:t></w:r></w:p></w:tc></w:tr>`, docxEsc(commentText)))
			}
		}
	}
	body.WriteString(`</w:tbl>`)

	documentXML := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
<w:body>%s<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>
</w:document>`, body.String())

	stylesXML := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="003366"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:color="auto"/>
    </w:tblBorders></w:tblPr>
  </w:style>
</w:styles>`

	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

	relsRoot := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

	wordRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

	zw := zip.NewWriter(w)
	for _, part := range []struct{ name, content string }{
		{"[Content_Types].xml", contentTypes},
		{"_rels/.rels", relsRoot},
		{"word/document.xml", documentXML},
		{"word/styles.xml", stylesXML},
		{"word/_rels/document.xml.rels", wordRels},
	} {
		f, _ := zw.Create(part.name)
		f.Write([]byte(part.content)) //nolint
	}
	zw.Close() //nolint
}

// sendMailWithAttachment sends an email with a binary attachment via SMTP.
func (app *App) sendMailWithAttachment(cfg MailConfig, to, subject, bodyHTML string, attachData []byte, attachName, attachMIME string) error {
	smtpPort := cfg.SMTPPort
	if smtpPort == 0 {
		smtpPort = 587
	}
	from := cfg.FromAddr
	if from == "" {
		from = "tidslinjal@localhost"
	}
	fromName := cfg.FromName
	if fromName == "" {
		fromName = "Tidslinjal"
	}

	boundary := fmt.Sprintf("---=_Part_%d", time.Now().UnixNano())
	// Encode attachment as base64
	enc := make([]byte, 0, len(attachData)*2)
	const lineLen = 76
	b64 := make([]byte, ((len(attachData)+2)/3)*4)
	n := encodeBase64(b64, attachData)
	for i := 0; i < n; i += lineLen {
		end := i + lineLen
		if end > n {
			end = n
		}
		enc = append(enc, b64[i:end]...)
		enc = append(enc, '\r', '\n')
	}

	msg := fmt.Sprintf(
		"From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n"+
			"--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n\r\n"+
			"--%s\r\nContent-Type: %s; name=\"%s\"\r\nContent-Disposition: attachment; filename=\"%s\"\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n--%s--",
		fromName, from, to, subject, boundary,
		boundary, bodyHTML,
		boundary, attachMIME, attachName, attachName, string(enc), boundary,
	)

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, smtpPort)
	var auth smtp.Auth
	if cfg.Username != "" && cfg.Password != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)
	}

	if cfg.TLSMode == "tls" {
		tlsCfg := &tls.Config{ServerName: cfg.SMTPHost}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return err
		}
		defer conn.Close()
		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return err
		}
		defer client.Quit()
		if auth != nil {
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
		if err := client.Mail(from); err != nil {
			return err
		}
		if err := client.Rcpt(to); err != nil {
			return err
		}
		wc, err := client.Data()
		if err != nil {
			return err
		}
		_, err = wc.Write([]byte(msg))
		wc.Close()
		return err
	}
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}

// encodeBase64 encodes src into dst using standard base64 encoding, returns bytes written.
func encodeBase64(dst, src []byte) int {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	di, si := 0, 0
	for ; si+2 < len(src); si += 3 {
		v := uint(src[si])<<16 | uint(src[si+1])<<8 | uint(src[si+2])
		dst[di] = alphabet[v>>18&0x3F]
		dst[di+1] = alphabet[v>>12&0x3F]
		dst[di+2] = alphabet[v>>6&0x3F]
		dst[di+3] = alphabet[v&0x3F]
		di += 4
	}
	rem := len(src) - si
	if rem == 1 {
		v := uint(src[si]) << 16
		dst[di] = alphabet[v>>18&0x3F]
		dst[di+1] = alphabet[v>>12&0x3F]
		dst[di+2] = '='
		dst[di+3] = '='
		di += 4
	} else if rem == 2 {
		v := uint(src[si])<<16 | uint(src[si+1])<<8
		dst[di] = alphabet[v>>18&0x3F]
		dst[di+1] = alphabet[v>>12&0x3F]
		dst[di+2] = alphabet[v>>6&0x3F]
		dst[di+3] = '='
		di += 4
	}
	return di
}

// ── XLSX Export ────────────────────────────────────────────────────────────────

// handleExportXLSX exports events as an Excel XLSX file.
// XLSX is a ZIP archive containing XML files; we build it directly without
// any external library using the archive/zip package (already imported).
func (app *App) handleExportXLSX(w http.ResponseWriter, r *http.Request, user *User) {
	from := time.Now().Add(-365 * 24 * time.Hour)
	to := time.Now().Add(365 * 24 * time.Hour)
	if q := r.URL.Query().Get("from"); q != "" {
		if t, err := time.Parse(time.RFC3339, q); err == nil {
			from = t
		}
	}
	if q := r.URL.Query().Get("to"); q != "" {
		if t, err := time.Parse(time.RFC3339, q); err == nil {
			to = t
		}
	}
	events := app.store.GetEvents(from, to, nil)

	// Fetch comments for each event
	commentsMap := make(map[int64][]EventComment)
	for _, ev := range events {
		comments := app.store.GetCommentsByEvent(ev.ID)
		if len(comments) > 0 {
			commentsMap[ev.ID] = comments
		}
	}

	// Build the XLSX in memory
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	// Required XLSX files
	xlsxWriteFile(zw, "[Content_Types].xml", xlsxContentTypes())
	xlsxWriteFile(zw, "_rels/.rels", xlsxRels())
	xlsxWriteFile(zw, "xl/workbook.xml", xlsxWorkbook())
	xlsxWriteFile(zw, "xl/_rels/workbook.xml.rels", xlsxWorkbookRels())
	xlsxWriteFile(zw, "xl/styles.xml", xlsxStyles())
	xlsxWriteFile(zw, "xl/worksheets/sheet1.xml", xlsxSheet(events, commentsMap))

	zw.Close()

	app.audit(user.ID, user.DisplayName, "exported", "data", 0, "Exported XLSX")
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-%s.xlsx"`, time.Now().Format("2006-01-02")))
	w.Write(buf.Bytes()) //nolint
}

func xlsxWriteFile(zw *zip.Writer, name, content string) {
	f, _ := zw.Create(name)
	f.Write([]byte(content)) //nolint
}

func xlsxContentTypes() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
}

func xlsxRels() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
}

func xlsxWorkbook() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Events" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
}

func xlsxWorkbookRels() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

func xlsxStyles() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills>
  <borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`
}

// xlsxEsc escapes a string for use in XML cell values.
func xlsxEsc(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	// Remove control characters that are invalid in XML 1.0
	var b strings.Builder
	for _, r := range s {
		if r == 0x09 || r == 0x0A || r == 0x0D || (r >= 0x20 && r != 0xFFFE && r != 0xFFFF) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func xlsxCell(col, row int, value string, styleIdx int) string {
	// Convert col index to letter (A, B, C, …)
	colLetter := string(rune('A' + col))
	if col >= 26 {
		colLetter = string(rune('A'+col/26-1)) + string(rune('A'+col%26))
	}
	ref := fmt.Sprintf("%s%d", colLetter, row)
	return fmt.Sprintf(`<c r="%s" t="inlineStr" s="%d"><is><t>%s</t></is></c>`, ref, styleIdx, xlsxEsc(value))
}

func xlsxSheet(events []Event, commentsMap map[int64][]EventComment) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>`)

	headers := []string{"ID", "Title", "Type", "Status", "Start", "End", "All Day", "Description", "Created By", "Location", "Address", "Comments"}
	sb.WriteString(`<row r="1">`)
	for i, h := range headers {
		sb.WriteString(xlsxCell(i, 1, h, 1))
	}
	sb.WriteString(`</row>`)

	for rowIdx, ev := range events {
		r := rowIdx + 2
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		allDay := ""
		if ev.AllDay {
			allDay = "Yes"
		}
		// Build comments cell
		commentText := ""
		if comments, ok := commentsMap[ev.ID]; ok {
			parts := make([]string, 0, len(comments))
			for _, c := range comments {
				parts = append(parts, fmt.Sprintf("[%s %s] %s", c.AuthorName, c.CreatedAt.Format("2006-01-02 15:04"), c.Content))
			}
			commentText = strings.Join(parts, " | ")
		}
		cells := []string{
			fmt.Sprintf("%d", ev.ID),
			ev.Title,
			ev.EventType,
			string(ev.Status),
			ev.StartTime.Format("2006-01-02 15:04"),
			end,
			allDay,
			ev.Description,
			ev.CreatedByName,
			ev.PhysicalLocation,
			ev.LocationAddress,
			commentText,
		}
		sb.WriteString(fmt.Sprintf(`<row r="%d">`, r))
		for i, val := range cells {
			sb.WriteString(xlsxCell(i, r, val, 0))
		}
		sb.WriteString(`</row>`)
	}

	sb.WriteString(`</sheetData></worksheet>`)
	return sb.String()
}

// ── API Keys ──────────────────────────────────────────────────────────────────

func (app *App) handleListAPIKeys(w http.ResponseWriter, r *http.Request, user *User) {
	keys := app.store.GetAPIKeys()
	if keys == nil {
		keys = []APIKey{}
	}
	jsonOK(w, keys)
}

func (app *App) handleCreateAPIKey(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}

	// Generate a random API key
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		jsonError(w, "failed to generate key", http.StatusInternalServerError)
		return
	}
	rawKey := "tlk_" + hex.EncodeToString(raw)
	hash, err := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "failed to hash key", http.StatusInternalServerError)
		return
	}

	k := APIKey{
		Name:        req.Name,
		Description: req.Description,
		KeyHash:     string(hash),
		CreatedBy:   user.ID,
	}
	created, err := app.store.CreateAPIKey(k)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "api_key", created.ID,
		fmt.Sprintf("Created API key %q", req.Name))
	// Return the raw key once (never stored in plain text)
	created.Key = rawKey
	created.KeyHash = ""
	jsonOK(w, created)
}

func (app *App) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/apikeys/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteAPIKey(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "api_key", id, fmt.Sprintf("Deleted API key #%d", id))
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Decision Log handlers ─────────────────────────────────────────────────────

func (app *App) handleListDecisionLog(w http.ResponseWriter, r *http.Request, user *User) {
	entries := app.store.GetDecisionLog()
	// Filter by access: admin sees all; others see general, own, and same-group entries
	var visible []DecisionLogEntry
	hasConfidentialRead := app.userHasCapability(user, "confidential_read")
	isAdmin := user.Role == RoleAdmin
	for _, e := range entries {
		if e.Confidential && !hasConfidentialRead {
			// Hide the decision text, but show that a confidential entry exists
			e.Decision = "[CONFIDENTIAL]"
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
		Decision          string `json:"decision"`
		LogType           string `json:"log_type"`
		GroupID           int64  `json:"group_id"`
		Confidential      bool   `json:"confidential"`
		Status            string `json:"status"`              // "" = decided, "requested" = request for decision
		RequestedOfType   string `json:"requested_of_type"`   // "role" | "group" | "person"
		RequestedOfValue  string `json:"requested_of_value"`  // role key, group id, or user id
		RequestedOfLabel  string `json:"requested_of_label"`  // display name
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
	entry := DecisionLogEntry{
		Timestamp:         now,
		UserID:            user.ID,
		UserName:          user.Username,
		DisplayName:       user.DisplayName,
		Status:            req.Status,
		Decision:          req.Decision,
		LogType:           req.LogType,
		GroupID:            req.GroupID,
		Confidential:      req.Confidential,
		RequestedOfType:   req.RequestedOfType,
		RequestedOfValue:  req.RequestedOfValue,
		RequestedOfLabel:  req.RequestedOfLabel,
	}
	if req.Status == "requested" {
		entry.RequestedAt = &now
	} else {
		entry.DecidedAt = &now
	}
	created, err := app.store.AddDecisionLogEntry(entry)
	if err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	// Generate sequence number from exercise name + sequential ID
	seqPrefix := "DEC"
	if ex := app.store.GetExerciseSettings(); ex.Enabled && ex.Label != "" {
		// Use uppercase abbreviation of exercise name
		abbr := strings.ToUpper(strings.ReplaceAll(ex.Label, " ", "-"))
		if len(abbr) > 20 {
			abbr = abbr[:20]
		}
		seqPrefix = abbr
	}
	created.SequenceNumber = fmt.Sprintf("%s-%03d", seqPrefix, created.ID)
	_ = app.store.UpdateDecisionLogEntry(created)
	auditAction := "created"
	auditSummary := fmt.Sprintf("Decision %s added: %.50s", created.SequenceNumber, req.Decision)
	if req.Status == "requested" {
		auditAction = "requested"
		auditSummary = fmt.Sprintf("Decision %s requested: %.50s", created.SequenceNumber, req.Decision)
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: auditAction, EntityType: "decision_log", EntityID: created.ID,
		Summary: auditSummary,
	})
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
	var req struct {
		Status  string `json:"status"`  // "approved" or "rejected"
		Comment string `json:"comment"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Status != "approved" && req.Status != "rejected" {
		jsonError(w, "status must be 'approved' or 'rejected'", http.StatusBadRequest)
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
		found.DecidedAt = &now
	}
	if err := app.store.UpdateDecisionLogEntry(*found); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: req.Status, EntityType: "decision_log", EntityID: id,
		Summary: fmt.Sprintf("%s decision request #%d: %s", req.Status, id, req.Comment),
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
	storedName := filepath.Base(r.PathValue("filename"))
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

// ── Map Location handlers ─────────────────────────────────────────────────────

func (app *App) handleListMapLocations(w http.ResponseWriter, r *http.Request, user *User) {
	locs := app.store.GetMapLocations()
	if locs == nil {
		locs = []MapLocation{}
	}
	jsonOK(w, locs)
}

func (app *App) handleAddMapLocation(w http.ResponseWriter, r *http.Request, user *User) {
	var loc MapLocation
	if err := decode(r, &loc); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if loc.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	created, err := app.store.AddMapLocation(loc)
	if err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "created", EntityType: "map_location", EntityID: created.ID,
		Summary: fmt.Sprintf("Added map location: %s", loc.Name),
	})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (app *App) handleUpdateMapLocation(w http.ResponseWriter, r *http.Request, user *User) {
	var loc MapLocation
	if err := decode(r, &loc); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/map-locations/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	loc.ID = id
	if err := app.store.UpdateMapLocation(loc); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, loc)
}

func (app *App) handleDeleteMapLocation(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/map-locations/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteMapLocation(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Connector config handlers ─────────────────────────────────────────────────

func (app *App) handleListConnectors(w http.ResponseWriter, r *http.Request, user *User) {
	configs := app.store.GetConnectorConfigs()
	if configs == nil {
		configs = []ConnectorConfig{}
	}
	jsonOK(w, configs)
}

func (app *App) handleSaveConnectorConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg ConnectorConfig
	if err := decode(r, &cfg); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if cfg.Name == "" {
		jsonError(w, "connector name required", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveConnectorConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "connector", EntityID: 0,
		Summary: fmt.Sprintf("Updated connector config: %s", cfg.Name),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Federated IdP handlers ─────────────────────────────────────────────────────

func (app *App) handleListFederatedIdPs(w http.ResponseWriter, r *http.Request, user *User) {
	idps := app.store.GetFederatedIdPs()
	if idps == nil {
		idps = []FederatedIdP{}
	}
	// Strip secrets before sending to frontend
	safe := make([]FederatedIdP, len(idps))
	copy(safe, idps)
	for i := range safe {
		safe[i].ClientSecret = ""
	}
	jsonOK(w, safe)
}

func (app *App) handleSaveFederatedIdP(w http.ResponseWriter, r *http.Request, user *User) {
	var idp FederatedIdP
	if err := decode(r, &idp); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if idp.ID == "" || idp.Name == "" {
		jsonError(w, "id and name required", http.StatusBadRequest)
		return
	}
	if idp.Protocol != "oidc" && idp.Protocol != "saml" {
		jsonError(w, "protocol must be oidc or saml", http.StatusBadRequest)
		return
	}
	// If no secret provided, preserve existing one
	if idp.ClientSecret == "" {
		existing := app.store.GetFederatedIdPs()
		for _, e := range existing {
			if e.ID == idp.ID {
				idp.ClientSecret = e.ClientSecret
				break
			}
		}
	}
	if err := app.store.SaveFederatedIdP(idp); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "federated_idp", EntityID: 0,
		Summary: fmt.Sprintf("Updated federated IdP: %s (%s)", idp.Name, idp.Protocol),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleDeleteFederatedIdP(w http.ResponseWriter, r *http.Request, user *User) {
	id := strings.TrimPrefix(r.URL.Path, "/api/federation/idps/")
	if id == "" {
		jsonError(w, "id required", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteFederatedIdP(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "deleted", EntityType: "federated_idp", EntityID: 0,
		Summary: fmt.Sprintf("Deleted federated IdP: %s", id),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleListTrustRealms(w http.ResponseWriter, r *http.Request, user *User) {
	realms := app.store.GetTrustRealms()
	if realms == nil {
		realms = []TrustRealm{}
	}
	jsonOK(w, realms)
}

func (app *App) handleSaveTrustRealm(w http.ResponseWriter, r *http.Request, user *User) {
	var realm TrustRealm
	if err := decode(r, &realm); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if realm.ID == "" || realm.Name == "" {
		jsonError(w, "id and name required", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveTrustRealm(realm); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Room / Resource handlers ───────────────────────────────────────────────────

func (app *App) handleListRooms(w http.ResponseWriter, r *http.Request, user *User) {
	rooms := app.store.GetRooms()
	if rooms == nil {
		rooms = []Room{}
	}
	jsonOK(w, rooms)
}

func (app *App) handleSaveRoom(w http.ResponseWriter, r *http.Request, user *User) {
	var room Room
	if err := decode(r, &room); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if room.Name == "" {
		jsonError(w, "room name required", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveRoom(room); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "room", EntityID: room.ID,
		Summary: fmt.Sprintf("Updated room: %s", room.Name),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleDeleteRoom(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteRoom(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Free/Busy lookup handler ───────────────────────────────────────────────────

func (app *App) handleFreeBusy(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	resourceType := q.Get("type")   // "user" or "room"
	idStr := q.Get("id")
	fromStr := q.Get("from")
	toStr := q.Get("to")

	if fromStr == "" || toStr == "" {
		jsonError(w, "from and to parameters required (ISO8601)", http.StatusBadRequest)
		return
	}
	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		jsonError(w, "invalid from date", http.StatusBadRequest)
		return
	}
	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		jsonError(w, "invalid to date", http.StatusBadRequest)
		return
	}

	id, _ := strconv.ParseInt(idStr, 10, 64)

	type busySlot struct {
		Title     string    `json:"title"`
		StartTime time.Time `json:"start_time"`
		EndTime   *time.Time `json:"end_time,omitempty"`
	}

	var slots []busySlot
	if resourceType == "room" && id > 0 {
		events := app.store.GetRoomFreeBusy(id, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	} else if id > 0 {
		events := app.store.GetFreeBusy(id, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	} else {
		// Return availability for requesting user
		events := app.store.GetFreeBusy(user.ID, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	}
	if slots == nil {
		slots = []busySlot{}
	}
	jsonOK(w, slots)
}

// ── Meeting config handlers ────────────────────────────────────────────────────

func (app *App) handleGetMeetingConfig(w http.ResponseWriter, r *http.Request, user *User) {
	// Return meeting config (without secrets)
	jsonOK(w, map[string]interface{}{
		"teams_enabled": false,
		"zoom_enabled":  false,
	})
}

func (app *App) handleSaveMeetingConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg MeetingConfig
	if err := decode(r, &cfg); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Store meeting config (future: persist and use for auto-creation)
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "meeting_config", EntityID: 0,
		Summary: "Updated meeting integration config",
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── API Key auth middleware ────────────────────────────────────────────────────

// requireAPIKeyOrAuth allows requests authenticated with either a session cookie
// or an Authorization: Bearer <api-key> header.
func (app *App) requireAPIKeyOrAuth(next func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Try bearer token first
		authHdr := r.Header.Get("Authorization")
		if strings.HasPrefix(authHdr, "Bearer ") {
			raw := strings.TrimPrefix(authHdr, "Bearer ")
			if raw != "" {
				// Check API keys
				if k := app.store.ValidateAPIKey(raw); k != nil {
					// API key auth: fabricate a synthetic admin-like user context
					u := &User{
						ID:          k.CreatedBy,
						Username:    "apikey:" + k.Name,
						DisplayName: k.Name,
						Role:        RoleReadWrite, // conservative default
					}
					next(w, r, u)
					return
				}
				// Also check regular bearer (JWT or session token) — pass through
			}
		}
		// Fall back to session-based auth
		app.requireAuth(next)(w, r)
	}
}

// ── Filter Presets ────────────────────────────────────────────────────────────

func (app *App) handleListFilterPresets(w http.ResponseWriter, r *http.Request, user *User) {
	presets := app.store.GetFilterPresets(user.ID)
	if presets == nil {
		presets = []FilterPreset{}
	}
	jsonOK(w, presets)
}

func (app *App) handleCreateFilterPreset(w http.ResponseWriter, r *http.Request, user *User) {
	var p FilterPreset
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if p.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	p.UserID = user.ID
	created, err := app.store.CreateFilterPreset(p)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, created)
}

func (app *App) handleDeleteFilterPreset(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/filter-presets/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteFilterPreset(id, user.ID); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Event History ──────────────────────────────────────────────────────────────

func (app *App) handleGetEventHistory(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		// Try parsing from /api/events/:id/history
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			id, err = strconv.ParseInt(parts[2], 10, 64)
		}
		if err != nil {
			jsonError(w, "invalid id", http.StatusBadRequest)
			return
		}
	}
	if _, ok := app.store.GetEventByID(id); !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	versions := app.store.GetEventVersions(id)
	jsonOK(w, versions)
}

// ── Editing Locks ──────────────────────────────────────────────────────────────

func (app *App) handleAcquireEditingLock(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	lock, ok := app.store.AcquireEditingLock(id, user.ID, user.DisplayName)
	if !ok {
		jsonError(w, fmt.Sprintf("Event is being edited by %s", lock.UserName), http.StatusConflict)
		return
	}
	// Broadcast editing lock acquisition to all users
	lockData, _ := json.Marshal(map[string]interface{}{
		"type":       "editing_lock",
		"event_id":   id,
		"user_id":    user.ID,
		"user_name":  user.DisplayName,
		"expires_at": lock.ExpiresAt,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "editing_lock", Data: string(lockData)})
	jsonOK(w, lock)
}

func (app *App) handleReleaseEditingLock(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	app.store.ReleaseEditingLock(id, user.ID)
	unlockData, _ := json.Marshal(map[string]interface{}{
		"type":     "editing_unlock",
		"event_id": id,
		"user_id":  user.ID,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "editing_lock", Data: string(unlockData)})
	jsonOK(w, map[string]string{"status": "released"})
}

func (app *App) handleGetEditingLocks(w http.ResponseWriter, r *http.Request, user *User) {
	locks := app.store.GetAllEditingLocks()
	jsonOK(w, locks)
}

// ── Gradual Backup ──────────────────────────────────────────────────────────────

// runGradualBackupScheduler runs in a background goroutine, waking every minute
// to check whether it is time to create a new automatic snapshot.
func (app *App) runGradualBackupScheduler() {
	// Track when the last snapshot was taken so we fire at the correct cadence
	// even if the ticker is slightly late.
	var lastSnap time.Time
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cfg := app.store.GetGradualBackupSettings()
		if !cfg.Enabled {
			continue
		}
		interval := time.Duration(cfg.IntervalMinutes) * time.Minute
		if time.Since(lastSnap) < interval {
			continue
		}
		filename, err := app.store.CreateGradualBackupSnapshot()
		if err != nil {
			log.Printf("[WARN] gradual backup snapshot failed: %v", err)
			continue
		}
		logVerbose("[gradual-backup] snapshot created: %s", filename)
		lastSnap = time.Now()
		// Prune old snapshots
		if err := app.store.PruneGradualBackupSnapshots(cfg.MaxSnapshots); err != nil {
			log.Printf("[WARN] gradual backup prune failed: %v", err)
		}
	}
}

// handleGradualBackupSettings handles GET and PUT for /api/admin/gradual-backup
func (app *App) handleGradualBackupSettings(w http.ResponseWriter, r *http.Request, user *User) {
	switch r.Method {
	case http.MethodGet:
		cfg := app.store.GetGradualBackupSettings()
		snapshots, _ := app.store.ListGradualBackupSnapshots()
		if snapshots == nil {
			snapshots = []GradualBackupSnapshot{}
		}
		jsonOK(w, map[string]interface{}{
			"settings":  cfg,
			"snapshots": snapshots,
		})
	case http.MethodPut:
		var cfg GradualBackupSettings
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			jsonError(w, "invalid body", http.StatusBadRequest)
			return
		}
		if err := app.store.SaveGradualBackupSettings(cfg); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		app.audit(user.ID, user.DisplayName, "update", "gradual_backup_settings", 0,
			fmt.Sprintf("Gradual backup settings updated: enabled=%v interval=%dm max=%d",
				cfg.Enabled, cfg.IntervalMinutes, cfg.MaxSnapshots))
		jsonOK(w, cfg)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGradualBackupSnapshotNow handles POST /api/admin/gradual-backup/snapshot
func (app *App) handleGradualBackupSnapshotNow(w http.ResponseWriter, r *http.Request, user *User) {
	filename, err := app.store.CreateGradualBackupSnapshot()
	if err != nil {
		jsonError(w, "failed to create snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Prune per current settings
	cfg := app.store.GetGradualBackupSettings()
	_ = app.store.PruneGradualBackupSnapshots(cfg.MaxSnapshots)
	app.audit(user.ID, user.DisplayName, "create", "gradual_backup_snapshot", 0,
		fmt.Sprintf("Manual snapshot created: %s", filename))
	snapshots, _ := app.store.ListGradualBackupSnapshots()
	if snapshots == nil {
		snapshots = []GradualBackupSnapshot{}
	}
	jsonOK(w, map[string]interface{}{"filename": filename, "snapshots": snapshots})
}

// handleGradualBackupRestore handles POST /api/admin/gradual-backup/restore/{filename}
func (app *App) handleGradualBackupRestore(w http.ResponseWriter, r *http.Request, user *User) {
	filename := strings.TrimPrefix(r.URL.Path, "/api/admin/gradual-backup/restore/")
	if filename == "" {
		jsonError(w, "filename required", http.StatusBadRequest)
		return
	}
	restored, err := app.store.RestoreGradualBackupSnapshot(filename)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	app.audit(user.ID, user.DisplayName, "restore", "gradual_backup_snapshot", 0,
		fmt.Sprintf("Restored %d files from snapshot: %s", restored, filename))
	jsonOK(w, map[string]interface{}{
		"restored": restored,
		"message":  fmt.Sprintf("Restored %d files. Please restart the server for changes to take full effect.", restored),
	})
}

// handleGradualBackupDownload handles GET /api/admin/gradual-backup/download/{filename}
func (app *App) handleGradualBackupDownload(w http.ResponseWriter, r *http.Request, user *User) {
	filename := strings.TrimPrefix(r.URL.Path, "/api/admin/gradual-backup/download/")
	if filename == "" || strings.ContainsAny(filename, "/\\") {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}
	snapPath := filepath.Join(app.store.DataDir(), "snapshots", filename)
	if _, err := os.Stat(snapPath); err != nil {
		http.Error(w, "snapshot not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	http.ServeFile(w, r, snapPath)
}

// handleGradualBackupDelete handles DELETE /api/admin/gradual-backup/snapshots/{filename}
func (app *App) handleGradualBackupDelete(w http.ResponseWriter, r *http.Request, user *User) {
	filename := strings.TrimPrefix(r.URL.Path, "/api/admin/gradual-backup/snapshots/")
	if filename == "" || strings.ContainsAny(filename, "/\\") {
		jsonError(w, "invalid filename", http.StatusBadRequest)
		return
	}
	snapPath := filepath.Join(app.store.DataDir(), "snapshots", filename)
	if err := os.Remove(snapPath); err != nil {
		if os.IsNotExist(err) {
			jsonError(w, "snapshot not found", http.StatusNotFound)
		} else {
			jsonError(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	app.audit(user.ID, user.DisplayName, "delete", "gradual_backup_snapshot", 0,
		fmt.Sprintf("Deleted snapshot: %s", filename))
	w.WriteHeader(http.StatusNoContent)
}

// ── Backup & Restore ──────────────────────────────────────────────────────────

// encryptBackupData encrypts plaintext using AES-256-GCM with a key derived from
// keyMaterial (the admin password hash) via PBKDF2-SHA256.
// Output layout: salt(16) ‖ nonce(12) ‖ AES-GCM ciphertext.
func encryptBackupData(plaintext, keyMaterial []byte) ([]byte, error) {
	if len(keyMaterial) == 0 {
		return nil, fmt.Errorf("no encryption key material available")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	key := deriveBackupKey(keyMaterial, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)
	out := make([]byte, 0, 16+len(nonce)+len(ciphertext))
	out = append(out, salt...)
	out = append(out, nonce...)
	out = append(out, ciphertext...)
	return out, nil
}

// decryptBackupData reverses encryptBackupData.
func decryptBackupData(data, keyMaterial []byte) ([]byte, error) {
	if len(keyMaterial) == 0 {
		return nil, fmt.Errorf("no encryption key material available")
	}
	const saltLen, nonceLen = 16, 12
	if len(data) < saltLen+nonceLen {
		return nil, fmt.Errorf("ciphertext too short")
	}
	key := deriveBackupKey(keyMaterial, data[:saltLen])
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, data[saltLen:saltLen+nonceLen], data[saltLen+nonceLen:], nil)
}

// deriveBackupKey derives a 32-byte AES-256 key from keyMaterial and salt using PBKDF2-SHA256.
func deriveBackupKey(keyMaterial, salt []byte) []byte {
	return pbkdf2.Key(keyMaterial, salt, 100_000, 32, sha256.New)
}

func (app *App) handleBackup(w http.ResponseWriter, r *http.Request, user *User) {
	// Create a zip archive of all JSON data files, then encrypt it.
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-backup-%s.zip.enc"`, time.Now().Format("2006-01-02T150405")))

	// Build zip in memory
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	dataDir := app.store.DataDir()
	files := []string{
		"event_types.json", "users.json", "preferences.json", "groups.json",
		"memberships.json", "layers.json", "events.json", "attachments.json",
		"alarms.json", "locks.json", "audit.json", "exercise.json",
		"comments.json", "phases.json", "templates.json", "roles.json",
		"registration.json", "invitations.json", "oidc.json", "mail.json",
		"apikeys.json", "filter_presets.json", "event_versions.json",
		"decision_log.json", "event_log.json",
	}
	for _, f := range files {
		path := filepath.Join(dataDir, f)
		data, err := os.ReadFile(path)
		if err != nil {
			continue // skip missing files
		}
		fw, err := zw.Create(f)
		if err != nil {
			continue
		}
		fw.Write(data) //nolint
	}
	zw.Close() //nolint

	// Encrypt with admin password hash as key material
	keyMaterial := app.store.GetAdminPasswordHash()
	encrypted, err := encryptBackupData(buf.Bytes(), keyMaterial)
	if err != nil {
		jsonError(w, "failed to encrypt backup", http.StatusInternalServerError)
		return
	}
	w.Write(encrypted) //nolint
	app.store.LogAudit(AuditEntry{ //nolint
		UserID: user.ID, UserName: user.DisplayName,
		Action: "backup", EntityType: "system", EntityID: 0,
		Summary: "Admin downloaded encrypted data backup",
	})
}

func (app *App) handleRestore(w http.ResponseWriter, r *http.Request, user *User) {
	// Parse the uploaded zip file and restore JSON data files
	if err := r.ParseMultipartForm(64 << 20); err != nil { // 64 MB
		jsonError(w, "failed to parse upload", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("backup")
	if err != nil {
		jsonError(w, "backup file required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Read the entire file into memory
	buf := new(bytes.Buffer)
	if _, err := io.Copy(buf, file); err != nil {
		jsonError(w, "failed to read backup", http.StatusInternalServerError)
		return
	}
	raw := buf.Bytes()

	// Detect encrypted backups (magic bytes "PK" = plain zip; anything else = encrypted)
	if len(raw) < 2 || raw[0] != 0x50 || raw[1] != 0x4B {
		keyMaterial := app.store.GetAdminPasswordHash()
		decrypted, err := decryptBackupData(raw, keyMaterial)
		if err != nil {
			jsonError(w, "failed to decrypt backup — wrong admin password or corrupt file", http.StatusBadRequest)
			return
		}
		raw = decrypted
	}

	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		jsonError(w, "invalid zip file", http.StatusBadRequest)
		return
	}

	dataDir := app.store.DataDir()
	allowed := map[string]bool{
		"event_types.json": true, "preferences.json": true, "groups.json": true,
		"memberships.json": true, "layers.json": true, "events.json": true,
		"attachments.json": true, "alarms.json": true, "locks.json": true,
		"exercise.json": true, "comments.json": true, "phases.json": true,
		"templates.json": true, "roles.json": true, "registration.json": true,
		"invitations.json": true, "filter_presets.json": true, "event_versions.json": true,
	}
	// Note: users.json, sessions.json, apikeys.json, oidc.json, mail.json excluded for security
	restored := 0
	for _, f := range zr.File {
		if !allowed[f.Name] {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			continue
		}
		if err := os.WriteFile(filepath.Join(dataDir, f.Name), data, 0600); err != nil {
			continue
		}
		restored++
	}
	app.store.LogAudit(AuditEntry{ //nolint
		UserID: user.ID, UserName: user.DisplayName,
		Action: "restore", EntityType: "system", EntityID: 0,
		Summary: fmt.Sprintf("Admin restored %d data files from backup", restored),
	})
	jsonOK(w, map[string]interface{}{
		"status":   "restored",
		"files":    restored,
		"message":  "Backup restored successfully. Please restart the server for changes to take full effect.",
	})
}

// ── WebCal Subscription ───────────────────────────────────────────────────────

func (app *App) handleWebCal(w http.ResponseWriter, r *http.Request) {
	// /webcal/:token.ics
	token := strings.TrimPrefix(r.URL.Path, "/webcal/")
	token = strings.TrimSuffix(token, ".ics")
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}
	// Find user by WebCal token
	users := app.store.GetUsers()
	var calUser *User
	for i := range users {
		if users[i].WebCalToken != "" && subtle.ConstantTimeCompare([]byte(users[i].WebCalToken), []byte(token)) == 1 {
			calUser = &users[i]
			break
		}
	}
	if calUser == nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	// Re-use existing ICS export handler with the found user
	r2 := r.WithContext(r.Context())
	app.handleExportICS(w, r2, calUser)
}

// ── Update User Profile (handles + webcal token) ──────────────────────────────

func (app *App) handleUpdateProfile(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		MattermostHandle string `json:"mattermost_handle"`
		DiscordHandle    string `json:"discord_handle"`
		SignalHandle     string `json:"signal_handle"`
		Telephone        string `json:"telephone"`
		Cellular         string `json:"cellular"`
		Title            string `json:"title"`
		Rank             string `json:"rank"`
		JobRole          string `json:"job_role"`
		Expertise        string `json:"expertise"`
		PhotoDataURL     string  `json:"photo_data_url"` // base64 data URL
		GenerateWebCal   bool    `json:"generate_webcal"`
		Location         string  `json:"location"`
		Latitude         float64 `json:"latitude"`
		Longitude        float64 `json:"longitude"`
		Availability     string  `json:"availability"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Validate and limit photo data URL.
	if req.PhotoDataURL != "" {
		if len(req.PhotoDataURL) > 1_400_000 {
			jsonError(w, "photo too large (max ~1 MB)", http.StatusRequestEntityTooLarge)
			return
		}
		// Only accept image/* data URLs to prevent arbitrary content injection.
		if !strings.HasPrefix(req.PhotoDataURL, "data:image/jpeg;base64,") &&
			!strings.HasPrefix(req.PhotoDataURL, "data:image/png;base64,") &&
			!strings.HasPrefix(req.PhotoDataURL, "data:image/gif;base64,") &&
			!strings.HasPrefix(req.PhotoDataURL, "data:image/webp;base64,") {
			jsonError(w, "photo must be a JPEG, PNG, GIF, or WebP image", http.StatusBadRequest)
			return
		}
	}
	fullUser, ok := app.store.GetUserByID(user.ID)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	fullUser.MattermostHandle = req.MattermostHandle
	fullUser.DiscordHandle = req.DiscordHandle
	fullUser.SignalHandle = req.SignalHandle
	fullUser.Telephone = req.Telephone
	fullUser.Cellular = req.Cellular
	fullUser.Title = req.Title
	fullUser.Rank = req.Rank
	fullUser.JobRole = req.JobRole
	fullUser.Expertise = req.Expertise
	fullUser.Location = req.Location
	fullUser.Latitude = req.Latitude
	fullUser.Longitude = req.Longitude
	if req.Availability == "free" || req.Availability == "busy" || req.Availability == "dnd" || req.Availability == "away" || req.Availability == "" {
		fullUser.Availability = req.Availability
	}
	if req.PhotoDataURL != "" {
		fullUser.PhotoDataURL = req.PhotoDataURL
	}
	if req.GenerateWebCal && fullUser.WebCalToken == "" {
		tokBytes := make([]byte, 16)
		rand.Read(tokBytes) //nolint
		fullUser.WebCalToken = hex.EncodeToString(tokBytes)
	}
	if err := app.store.UpdateUser(*fullUser); err != nil {
		jsonError(w, "failed to update profile", http.StatusInternalServerError)
		return
	}
	// Return public profile plus webcal_token (owner's own data)
	type profileResponse struct {
		UserPublic
		WebCalToken string `json:"webcal_token,omitempty"`
	}
	jsonOK(w, profileResponse{UserPublic: fullUser.Public(), WebCalToken: fullUser.WebCalToken})
}

// ── Cascade Reschedule ─────────────────────────────────────────────────────────

func (app *App) handleCascadeReschedule(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		EventID   int64         `json:"event_id"`
		ShiftMins int           `json:"shift_minutes"` // positive = forward, negative = backward
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.ShiftMins == 0 {
		jsonError(w, "shift_minutes must not be zero", http.StatusBadRequest)
		return
	}
	shift := time.Duration(req.ShiftMins) * time.Minute

	// Gather all events and find dependents (BFS/DFS cascade)
	allEvents := app.store.GetEventsInRange(time.Now().Add(-365*24*time.Hour), time.Now().Add(365*24*time.Hour))
	// Build dependency map: eventID -> list of events that depend on it
	dependents := map[int64][]Event{}
	for _, ev := range allEvents {
		for _, dep := range ev.DependsOn {
			dependents[dep] = append(dependents[dep], ev)
		}
	}

	// BFS
	visited := map[int64]bool{req.EventID: true}
	queue := []int64{req.EventID}
	updated := []Event{}

	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, dep := range dependents[cur] {
			if !visited[dep.ID] {
				visited[dep.ID] = true
				dep.StartTime = dep.StartTime.Add(shift)
				if dep.EndTime != nil {
					t := dep.EndTime.Add(shift)
					dep.EndTime = &t
				}
				if err := app.store.UpdateEvent(dep); err == nil {
					updated = append(updated, dep)
					app.broadcastEventChange(user.ID, "updated", &dep)
				}
				queue = append(queue, dep.ID)
			}
		}
	}

	jsonOK(w, map[string]interface{}{
		"rescheduled": len(updated),
		"events":      updated,
	})
}

// ── OIDC SSO ─────────────────────────────────────────────────────────────────

// configureOIDC discovers the OIDC provider endpoints from the issuer's well-known URL.
func (app *App) configureOIDC(issuer, clientID, clientSecret, redirectURL string) error {
	if issuer == "" {
		return fmt.Errorf("issuer URL is required")
	}
	// Fetch discovery document
	discURL := strings.TrimRight(issuer, "/") + "/.well-known/openid-configuration"
	resp, err := http.Get(discURL) //nolint:gosec
	if err != nil {
		return fmt.Errorf("fetch discovery document: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("discovery document returned %d", resp.StatusCode)
	}
	var cfg OIDCConfig
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return fmt.Errorf("decode discovery document: %w", err)
	}
	cfg.ClientID     = clientID
	cfg.ClientSecret = clientSecret
	cfg.RedirectURL  = redirectURL
	if cfg.RedirectURL == "" {
		cfg.RedirectURL = "http://localhost:8080/auth/oidc/callback"
	}
	app.oidc = &cfg
	return nil
}

// handleOIDCInfo returns OIDC configuration info to the frontend (public, no auth required)
func (app *App) handleOIDCInfo(w http.ResponseWriter, r *http.Request) {
	if app.oidc == nil {
		jsonError(w, "OIDC not configured", http.StatusNotFound)
		return
	}
	exclusive := "false"
	if app.oidcExclusive {
		exclusive = "true"
	}
	jsonOK(w, map[string]string{
		"enabled":      "true",
		"exclusive":    exclusive,
		"issuer":       app.oidc.Issuer,
		"client_id":    app.oidc.ClientID,
		"redirect_url": app.oidc.RedirectURL,
	})
}

// handleOIDCLogin redirects the user to the OIDC authorization endpoint.
func (app *App) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	if app.oidc == nil {
		http.Redirect(w, r, "/login?error=oidc_not_configured", http.StatusFound)
		return
	}
	logDebug("OIDC: login initiated from %s", r.RemoteAddr)
	// Generate a random state token and store it in a short-lived cookie
	stateTok := make([]byte, 16)
	if _, err := rand.Read(stateTok); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	state := hex.EncodeToString(stateTok)
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		MaxAge:   300, // 5 minutes
		SameSite: http.SameSiteLaxMode,
	})

	// PKCE: generate code_verifier (43-128 chars of unreserved URL chars)
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	codeVerifier := base64.RawURLEncoding.EncodeToString(verifierBytes)
	// Store code_verifier in cookie for use during callback
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_pkce",
		Value:    codeVerifier,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		MaxAge:   300,
		SameSite: http.SameSiteLaxMode,
	})
	// code_challenge = BASE64URL(SHA256(code_verifier))
	h := sha256.Sum256([]byte(codeVerifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(h[:])

	// Nonce: random value bound to the session to prevent ID token replay attacks
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	nonce := hex.EncodeToString(nonceBytes)
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_nonce",
		Value:    nonce,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		MaxAge:   300,
		SameSite: http.SameSiteLaxMode,
	})

	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {app.oidc.ClientID},
		"redirect_uri":          {app.oidc.RedirectURL},
		"scope":                 {"openid profile email"},
		"state":                 {state},
		"nonce":                 {nonce},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
	}
	http.Redirect(w, r, app.oidc.AuthorizationEndpoint+"?"+params.Encode(), http.StatusFound)
}

// handleOIDCCallback exchanges the auth code for tokens, fetches user info, and creates a session.
// validateIDToken performs local validation of OIDC ID token claims without
// full JWK signature verification. It checks issuer, audience, expiry, and nonce.
func (app *App) validateIDToken(rawToken, expectedNonce string) error {
	// JWT is three base64url-encoded segments separated by dots
	parts := strings.SplitN(rawToken, ".", 3)
	if len(parts) < 2 {
		return fmt.Errorf("malformed JWT: expected 3 parts, got %d", len(parts))
	}
	// Decode the claims (second segment)
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("decode JWT claims: %w", err)
	}
	var claims struct {
		Issuer   string `json:"iss"`
		Audience json.RawMessage `json:"aud"` // can be string or []string
		Expiry   int64  `json:"exp"`
		IssuedAt int64  `json:"iat"`
		Nonce    string `json:"nonce"`
	}
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return fmt.Errorf("parse JWT claims: %w", err)
	}

	// Validate issuer matches our configured OIDC issuer
	if claims.Issuer != app.oidc.Issuer {
		return fmt.Errorf("issuer mismatch: got %q, want %q", claims.Issuer, app.oidc.Issuer)
	}

	// Validate audience contains our client ID
	var audiences []string
	var singleAud string
	if err := json.Unmarshal(claims.Audience, &audiences); err != nil {
		if err := json.Unmarshal(claims.Audience, &singleAud); err != nil {
			return fmt.Errorf("invalid aud claim")
		}
		audiences = []string{singleAud}
	}
	audOK := false
	for _, a := range audiences {
		if a == app.oidc.ClientID {
			audOK = true
			break
		}
	}
	if !audOK {
		return fmt.Errorf("audience mismatch: %v does not contain %q", audiences, app.oidc.ClientID)
	}

	// Validate expiry (with 2-minute clock skew tolerance)
	now := time.Now().Unix()
	if claims.Expiry > 0 && now > claims.Expiry+120 {
		return fmt.Errorf("token expired at %d, now %d", claims.Expiry, now)
	}

	// Validate nonce (prevents replay attacks)
	if expectedNonce != "" && claims.Nonce != expectedNonce {
		return fmt.Errorf("nonce mismatch: got %q, want %q", claims.Nonce, expectedNonce)
	}

	return nil
}

func (app *App) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	if app.oidc == nil {
		http.Redirect(w, r, "/login?error=oidc_not_configured", http.StatusFound)
		return
	}

	// Validate state
	stateCookie, err := r.Cookie("oidc_state")
	if err != nil || subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(r.URL.Query().Get("state"))) != 1 {
		http.Redirect(w, r, "/login?error=state_mismatch", http.StatusFound)
		return
	}
	// Clear state cookie
	http.SetCookie(w, &http.Cookie{Name: "oidc_state", Path: "/", MaxAge: -1})

	// Retrieve PKCE code_verifier from cookie
	pkceCookie, _ := r.Cookie("oidc_pkce")
	codeVerifier := ""
	if pkceCookie != nil {
		codeVerifier = pkceCookie.Value
	}
	// Clear PKCE cookie
	http.SetCookie(w, &http.Cookie{Name: "oidc_pkce", Path: "/", MaxAge: -1})

	// Retrieve nonce from cookie for ID token validation
	nonceCookie, _ := r.Cookie("oidc_nonce")
	expectedNonce := ""
	if nonceCookie != nil {
		expectedNonce = nonceCookie.Value
	}
	http.SetCookie(w, &http.Cookie{Name: "oidc_nonce", Path: "/", MaxAge: -1})

	code := r.URL.Query().Get("code")
	if code == "" {
		errMsg := r.URL.Query().Get("error_description")
		if errMsg == "" {
			errMsg = r.URL.Query().Get("error")
		}
		http.Redirect(w, r, "/login?error="+url.QueryEscape(errMsg), http.StatusFound)
		return
	}

	// Exchange code for tokens (with PKCE code_verifier)
	tokenParams := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {app.oidc.RedirectURL},
		"client_id":     {app.oidc.ClientID},
		"client_secret": {app.oidc.ClientSecret},
	}
	if codeVerifier != "" {
		tokenParams.Set("code_verifier", codeVerifier)
	}
	tokenResp, err := http.PostForm(app.oidc.TokenEndpoint, tokenParams)
	if err != nil || tokenResp.StatusCode != http.StatusOK {
		http.Redirect(w, r, "/login?error=token_exchange_failed", http.StatusFound)
		return
	}
	defer tokenResp.Body.Close()

	var tokens struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokens); err != nil {
		http.Redirect(w, r, "/login?error=token_parse_failed", http.StatusFound)
		return
	}

	// Validate ID token claims (issuer, audience, expiry, nonce)
	if tokens.IDToken != "" {
		if err := app.validateIDToken(tokens.IDToken, expectedNonce); err != nil {
			logVerbose("OIDC: ID token validation failed: %v", err)
			http.Redirect(w, r, "/login?error=id_token_invalid", http.StatusFound)
			return
		}
	}

	// Fetch user info
	req, _ := http.NewRequest("GET", app.oidc.UserinfoEndpoint, nil)
	req.Header.Set("Authorization", tokens.TokenType+" "+tokens.AccessToken)
	uiResp, err := http.DefaultClient.Do(req)
	if err != nil || uiResp.StatusCode != http.StatusOK {
		http.Redirect(w, r, "/login?error=userinfo_failed", http.StatusFound)
		return
	}
	defer uiResp.Body.Close()

	var userInfo struct {
		Sub         string `json:"sub"`
		Email       string `json:"email"`
		Name        string `json:"name"`
		PreferredUN string `json:"preferred_username"`
	}
	if err := json.NewDecoder(uiResp.Body).Decode(&userInfo); err != nil {
		http.Redirect(w, r, "/login?error=userinfo_parse_failed", http.StatusFound)
		return
	}

	// Determine username: preferred_username → email → sub
	username := userInfo.PreferredUN
	if username == "" {
		username = userInfo.Email
	}
	if username == "" {
		username = "oidc-" + userInfo.Sub
	}
	displayName := userInfo.Name
	if displayName == "" {
		displayName = username
	}

	// Find or auto-create the local user
	user, found := app.store.GetUserByUsername(username)
	if !found {
		defaultRole := app.oidcDefaultRole
		if defaultRole == "" {
			defaultRole = RoleReadWrite
		}
		newUser := User{
			Username:    username,
			DisplayName: displayName,
			Role:        defaultRole,
			Vetted:      true, // SSO users are pre-authenticated by the IDP
			IsOIDC:      true,
		}
		// No password — OIDC-only login
		created, err := app.store.CreateUser(newUser)
		if err != nil {
			logVerbose("OIDC: failed to create user %s: %v", username, err)
			http.Redirect(w, r, "/login?error=user_create_failed", http.StatusFound)
			return
		}
		user = &created
		log.Printf("OIDC: auto-created user %q (role=%s, vetted=true)", username, defaultRole)
		app.audit(0, "system", "created", "user", created.ID,
			fmt.Sprintf("SSO auto enrollment: user %q auto-created via OIDC (role=%s)", username, defaultRole))
	} else {
		// Sync display name from IDP on every login
		if displayName != "" && displayName != user.DisplayName {
			logVerbose("OIDC: updating display name for %q: %q → %q", username, user.DisplayName, displayName)
			user.DisplayName = displayName
			if err := app.store.UpdateUser(*user); err != nil {
				logVerbose("OIDC: failed to update display name for %q: %v", username, err)
			}
		}
		// Ensure existing OIDC users are vetted
		if !user.Vetted {
			user.Vetted = true
			app.store.UpdateUser(*user) //nolint
			logVerbose("OIDC: auto-vetted existing user %q", username)
		}
	}

	// Deny login for blocked accounts (even via OIDC)
	if user.Blocked {
		app.audit(user.ID, "system", "login_blocked", "user", user.ID,
			fmt.Sprintf("Blocked OIDC user %q attempted login", username))
		http.Redirect(w, r, "/login?error=account_blocked", http.StatusFound)
		return
	}

	// Create session
	sessID, err := generateID()
	if err != nil {
		http.Redirect(w, r, "/login?error=session_failed", http.StatusFound)
		return
	}
	sess := Session{ID: sessID, UserID: user.ID, ExpiresAt: time.Now().Add(24 * time.Hour)}
	if err := app.store.CreateSession(sess); err != nil {
		http.Redirect(w, r, "/login?error=session_failed", http.StatusFound)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessID,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		Expires:  sess.ExpiresAt,
		SameSite: http.SameSiteLaxMode,
	})
	// Track last login and ensure IsOIDC is set
	go func(u User, ip string) {
		now := time.Now()
		u.LastLoginAt = &now
		u.LastLoginIP = ip
		u.IsOIDC = true
		if names, err := net.LookupAddr(ip); err == nil && len(names) > 0 {
			u.LastLoginDomain = strings.TrimSuffix(names[0], ".")
		}
		if fullUser, ok := app.store.GetUserByID(u.ID); ok {
			fullUser.LastLoginAt = u.LastLoginAt
			fullUser.LastLoginIP = u.LastLoginIP
			fullUser.LastLoginDomain = u.LastLoginDomain
			fullUser.IsOIDC = true
			app.store.UpdateUser(*fullUser) //nolint
		}
	}(*user, r.RemoteAddr)

	logVerbose("OIDC login success: user=%s role=%s", username, user.Role)
	logDebug("OIDC: session created id=%s expires=%s", sessID, sess.ExpiresAt.Format(time.RFC3339))
	http.Redirect(w, r, "/", http.StatusFound)
}

// ── Main ───────────────────────────────────────────────────────────────────────

func main() {
	// CLI flags
	var (
		host    string
		port    string
		dataDir string
		tlsCert string
		tlsKey  string
		// OIDC flags
		oidcIssuer       string
		oidcClientID     string
		oidcClientSecret string
		oidcRedirectURL  string
		oidcExclusive    bool
		oidcDefaultRole  string
	)
	flag.StringVar(&host,    "host",    "",      "Listen host/interface (default: all interfaces, i.e. 0.0.0.0)")
	flag.StringVar(&port,    "port",    "",      "Listen port (default: 8080 for HTTP, 443 for HTTPS, or $PORT env)")
	flag.StringVar(&dataDir, "data",    "",      "Data directory (default: data, or $DATA_DIR env)")
	flag.BoolVar(&verbose,   "verbose", false,   "Enable verbose logging")
	flag.BoolVar(&debug,     "debug",   false,   "Enable debug logging (implies verbose)")
	flag.StringVar(&tlsCert, "tls-cert", "",     "Path to TLS certificate file (enables HTTPS)")
	flag.StringVar(&tlsKey,  "tls-key",  "",     "Path to TLS private key file (enables HTTPS)")
	flag.StringVar(&oidcIssuer,       "oidc-issuer",        os.Getenv("OIDC_ISSUER"),        "OIDC provider issuer URL (e.g. https://accounts.google.com)")
	flag.StringVar(&oidcClientID,     "oidc-client-id",     os.Getenv("OIDC_CLIENT_ID"),     "OIDC client ID")
	flag.StringVar(&oidcClientSecret, "oidc-client-secret", os.Getenv("OIDC_CLIENT_SECRET"), "OIDC client secret")
	flag.StringVar(&oidcRedirectURL,  "oidc-redirect-url",  os.Getenv("OIDC_REDIRECT_URL"),  "OIDC redirect URL (e.g. https://your-server/auth/oidc/callback)")
	flag.BoolVar(&oidcExclusive,      "oidc-exclusive",     os.Getenv("OIDC_EXCLUSIVE") == "true", "Disable local username/password login (SSO only; admin account excepted)")
	flag.StringVar(&oidcDefaultRole,  "oidc-default-role",  os.Getenv("OIDC_DEFAULT_ROLE"),  "Default role for auto-created OIDC users (teammember|teamlead|oplead; default: teammember)")

	// Syslog flags (override persistent config stored in syslog.json)
	var (
		syslogHost      = os.Getenv("SYSLOG_HOST")
		syslogPort      int
		syslogTransport = os.Getenv("SYSLOG_TRANSPORT") // udp | tcp | tls
		syslogFormat    = os.Getenv("SYSLOG_FORMAT")    // classic | json
	)
	flag.StringVar(&syslogHost,      "syslog-host",      syslogHost,      "Syslog server host (enables syslog forwarding)")
	flag.IntVar(&syslogPort,         "syslog-port",      0,               "Syslog server port (default 514 UDP/TCP, 6514 TLS)")
	flag.StringVar(&syslogTransport, "syslog-transport", syslogTransport, "Syslog transport: udp | tcp | tls (default: udp)")
	flag.StringVar(&syslogFormat,    "syslog-format",    syslogFormat,    "Syslog message format: classic | json (default: classic)")
	flag.Parse()

	if debug {
		verbose = true
	}

	// Fall back to environment variables
	portEnv := os.Getenv("PORT")
	if port == "" {
		port = portEnv // may still be "" — final default set after TLS is resolved
	}
	if dataDir == "" {
		dataDir = os.Getenv("DATA_DIR")
		if dataDir == "" {
			dataDir = "data"
		}
	}
	if tlsCert == "" {
		tlsCert = os.Getenv("TLS_CERT")
	}
	if tlsKey == "" {
		tlsKey = os.Getenv("TLS_KEY")
	}

	app, err := NewApp(dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize: %v", err)
	}

	// TLS config: CLI flags / env vars take priority; fall back to persistent admin UI settings
	if tlsCert == "" && tlsKey == "" {
		persisted := app.store.GetTLSConfig()
		if persisted.CertFile != "" && persisted.KeyFile != "" {
			tlsCert = persisted.CertFile
			tlsKey = persisted.KeyFile
			log.Printf("[INFO] TLS config loaded from persistent settings: cert=%s key=%s", tlsCert, tlsKey)
		}
	}

	// Set default port now that TLS is fully resolved:
	// 443 when TLS is configured (saved or via flags/env), 8080 otherwise.
	if port == "" {
		if tlsCert != "" && tlsKey != "" {
			port = "443"
		} else {
			port = "8080"
		}
	}

	// Configure OIDC — CLI flags take priority; fall back to persistent settings stored in DB
	if oidcIssuer != "" {
		if err := app.configureOIDC(oidcIssuer, oidcClientID, oidcClientSecret, oidcRedirectURL); err != nil {
			log.Printf("[WARN] OIDC configuration failed: %v — SSO will be unavailable", err)
		} else {
			app.oidcExclusive = oidcExclusive
			if oidcDefaultRole != "" {
				app.oidcDefaultRole = Role(oidcDefaultRole)
			}
			log.Printf("OIDC SSO enabled (CLI): issuer=%s exclusive=%v defaultRole=%q",
				oidcIssuer, oidcExclusive, app.oidcDefaultRole)
		}
	} else {
		// No CLI flags — try persistent settings saved via the admin UI
		persistedOIDC := app.store.GetOIDCSettings()
		if persistedOIDC.Enabled && persistedOIDC.Issuer != "" && persistedOIDC.ClientID != "" {
			if err := app.configureOIDC(persistedOIDC.Issuer, persistedOIDC.ClientID, persistedOIDC.ClientSecret, persistedOIDC.RedirectURL); err != nil {
				log.Printf("[WARN] OIDC configuration (from DB) failed: %v — SSO will be unavailable", err)
			} else {
				app.oidcExclusive = persistedOIDC.Exclusive
				if persistedOIDC.DefaultRole != "" {
					app.oidcDefaultRole = Role(persistedOIDC.DefaultRole)
				}
				log.Printf("OIDC SSO enabled (DB): issuer=%s exclusive=%v defaultRole=%q",
					persistedOIDC.Issuer, persistedOIDC.Exclusive, app.oidcDefaultRole)
			}
		}
	}

	// Configure syslog — CLI flags override persistent settings
	{
		sysCfg := app.store.GetSyslogConfig()
		if syslogHost != "" {
			// CLI flags take priority
			sysCfg.Enabled = true
			sysCfg.Host = syslogHost
			if syslogPort != 0 {
				sysCfg.Port = syslogPort
			}
			if syslogTransport != "" {
				sysCfg.Transport = syslogTransport
			}
			if syslogFormat != "" {
				sysCfg.Format = syslogFormat
			}
		}
		if sysCfg.Transport == "" {
			sysCfg.Transport = "udp"
		}
		if sysCfg.Format == "" {
			sysCfg.Format = "classic"
		}
		setSyslogWriter(sysCfg)
		if sysCfg.Enabled && sysCfg.Host != "" {
			// Hook syslog into the standard logger
			log.SetOutput(&syslogLogWriter{orig: os.Stderr})
		}
	}

	go app.runAlarmScheduler()
	go app.runSessionCleaner()
	go app.runGradualBackupScheduler()
	app.startAutoReportScheduler()

	addr := host + ":" + port
	listenAddr := addr
	if host == "" {
		listenAddr = "0.0.0.0:" + port
	}

	useTLS := tlsCert != "" && tlsKey != ""
	scheme := "http"
	if useTLS {
		scheme = "https"
	}

	// ── Startup summary ──────────────────────────────────────────────────────
	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	log.Printf("  Tidslinjal v%s", AppVersion)
	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// Network / TLS
	log.Printf("  URL        : %s://%s", scheme, listenAddr)
	log.Printf("  Bind addr  : %s (host=%q port=%s)", addr, func() string { if host == "" { return "0.0.0.0 (all interfaces)" }; return host }(), port)
	if useTLS {
		log.Printf("  TLS        : ENABLED")
		log.Printf("    cert     : %s", tlsCert)
		log.Printf("    key      : %s", tlsKey)
		// Verify cert/key files are readable
		if _, err := os.Stat(tlsCert); err != nil {
			log.Printf("    [WARN] cert file not accessible: %v", err)
		}
		if _, err := os.Stat(tlsKey); err != nil {
			log.Printf("    [WARN] key file not accessible: %v", err)
		}
	} else {
		log.Printf("  TLS        : disabled (plain HTTP)")
	}

	// Data / debug
	absData, _ := filepath.Abs(dataDir)
	log.Printf("  Data dir   : %s", absData)
	log.Printf("  Debug      : %v   Verbose: %v", debug, verbose)

	// Authentication — registration
	rs := app.store.GetRegistrationSettings()
	log.Printf("  Auth")
	log.Printf("    local login    : enabled (admin always allowed)")
	log.Printf("    registration   : mode=%s", rs.Mode)

	// Authentication — OIDC
	if app.oidc != nil {
		log.Printf("    OIDC/SSO       : ENABLED")
		log.Printf("      issuer       : %s", app.oidc.Issuer)
		log.Printf("      client_id    : %s", app.oidc.ClientID)
		log.Printf("      redirect_url : %s", app.oidc.RedirectURL)
		log.Printf("      exclusive    : %v  (local login %s)", app.oidcExclusive, func() string {
			if app.oidcExclusive { return "BLOCKED for non-admin" }
			return "still allowed"
		}())
		dr := app.oidcDefaultRole
		if dr == "" { dr = RoleReadWrite }
		log.Printf("      default_role : %s", dr)
	} else {
		log.Printf("    OIDC/SSO       : disabled")
	}

	// Exercise / operation mode
	ex := app.store.GetExerciseSettings()
	log.Printf("  Exercise")
	log.Printf("    enabled        : %v", ex.Enabled)
	if ex.Enabled {
		log.Printf("    mode           : %s", func() string { if ex.OperationMode != "" { return ex.OperationMode }; return "exercise" }())
		log.Printf("    label          : %q", ex.Label)
		log.Printf("    epoch (STARTEX): %s", ex.Epoch)
	}

	log.Printf("  Default credentials: admin / admin")

	// Syslog
	sysCfgDisplay := app.store.GetSyslogConfig()
	if globalSyslog != nil {
		p := sysCfgDisplay.Port
		if p == 0 {
			if sysCfgDisplay.Transport == "tls" {
				p = 6514
			} else {
				p = 514
			}
		}
		log.Printf("  Syslog     : ENABLED (%s) %s:%d format=%s",
			sysCfgDisplay.Transport, sysCfgDisplay.Host, p, sysCfgDisplay.Format)
	} else {
		log.Printf("  Syslog     : disabled")
	}

	// Extra debug info: data counts
	if debug {
		users := app.store.GetUsers()
		evs := app.store.GetEvents(time.Time{}, time.Now().Add(10*365*24*time.Hour), nil)
		grps := app.store.GetGroups()
		lyrs := app.store.GetLayersVisibleTo(0, nil)
		log.Printf("  [DEBUG] Loaded data:")
		log.Printf("    users    : %d", len(users))
		log.Printf("    events   : %d", len(evs))
		log.Printf("    groups   : %d", len(grps))
		log.Printf("    layers   : %d", len(lyrs))
		log.Printf("  [DEBUG] All registered API routes will be logged per request")
	}
	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// Enable secure-mode (HTTPS) features when TLS is configured.
	app.secureMode = useTLS

	handler := app.routes()

	// Wrap with debug request logger when --debug is enabled
	if debug {
		inner := handler
		handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("[DEBUG] %s %s from %s", r.Method, r.URL.Path, clientIP(r))
			inner.ServeHTTP(w, r)
		})
	}

	// Tuned HTTP server — explicit timeouts prevent resource leaks under high load.
	// WriteTimeout is long (5 min) to allow SSE connections to stay open.
	srv := &http.Server{
		Addr:           addr,
		Handler:        handler,
		ReadTimeout:    30 * time.Second,
		WriteTimeout:   5 * time.Minute,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MB
	}

	if useTLS {
		log.Printf("TLS enabled — cert=%s key=%s", tlsCert, tlsKey)
		if err := srv.ListenAndServeTLS(tlsCert, tlsKey); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	} else {
		if err := srv.ListenAndServe(); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	}
}
