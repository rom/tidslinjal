package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

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
	jwksCache       *jwksKeySet // C-01 fix: cached JWKS keys for RSA/EC signature verification
	jwksMu          sync.Mutex  // protects jwksCache
	webhookCh       chan webhookJob
	secureMode      bool        // true when serving over HTTPS (enables Secure cookie flag)
	authLimiter     *ipRateLimiter
	eventBus        *EventBus
	connectors      *ConnectorRegistry
	metrics         *Metrics
	ldap            *LDAPConnector
	enabledLangs    []string      // languages available to users (nil = all)
	stopCh          chan struct{} // closed to stop background goroutines
	stopOnce        sync.Once
}

// jwksKeySet holds cached JWKS keys from an OIDC provider.
type jwksKeySet struct {
	Keys      []jwksKey
	FetchedAt time.Time
}

// jwksKey represents a single JWK (JSON Web Key).
type jwksKey struct {
	Kty string `json:"kty"` // RSA or EC
	Kid string `json:"kid"` // key ID
	Alg string `json:"alg"` // RS256, ES256, etc.
	Use string `json:"use"` // sig
	// RSA fields
	N string `json:"n"` // modulus (base64url)
	E string `json:"e"` // exponent (base64url)
	// EC fields
	Crv string `json:"crv"` // P-256, P-384, P-521
	X   string `json:"x"`   // x coordinate (base64url)
	Y   string `json:"y"`   // y coordinate (base64url)
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

func newIPRateLimiter(stopCh <-chan struct{}) *ipRateLimiter {
	rl := &ipRateLimiter{buckets: make(map[string]*rateBucket)}
	// M-02 fix: periodically clean up expired rate limit buckets to prevent memory exhaustion
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.cleanup()
			case <-stopCh:
				return
			}
		}
	}()
	return rl
}

// cleanup removes expired rate limit buckets to prevent unbounded memory growth.
func (rl *ipRateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	for ip, b := range rl.buckets {
		if now.After(b.resetAt) {
			delete(rl.buckets, ip)
		}
	}
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

// broadcastUserChange sends an SSE notification to all clients about a user change
func (app *App) broadcastUserChange(senderID int64, action string, userID int64) {
	payload := map[string]interface{}{
		"action":  action,
		"user_id": userID,
	}
	data, _ := json.Marshal(payload)
	app.broker.BroadcastAll(SSEMessage{Event: "user_change", Data: string(data)})
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
	stopCh := make(chan struct{})
	app := &App{
		store:       store,
		broker:      NewSSEBroker(),
		webhookCh:   make(chan webhookJob, 256),
		authLimiter: newIPRateLimiter(stopCh),
		eventBus:    NewEventBus(),
		connectors:  NewConnectorRegistry(),
		metrics:     NewMetrics(),
		stopCh:      stopCh,
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
		// C-03 fix: generate a random initial admin password instead of hardcoded "admin"
		adminPassBytes := make([]byte, 16)
		if _, err := rand.Read(adminPassBytes); err != nil {
			log.Fatalf("failed to generate admin password: %v", err)
		}
		adminPass := hex.EncodeToString(adminPassBytes)
		hash, _ := bcrypt.GenerateFromPassword([]byte(adminPass), bcrypt.DefaultCost)
		store.CreateUser(User{ //nolint
			Username:           "admin",
			PasswordHash:       string(hash),
			DisplayName:        "Administrator",
			Role:               RoleAdmin,
			CanLock:            true,
			Vetted:             true,
			MustChangePassword: true,
		})
		log.Printf("Created default admin (username: admin, password: %s) — change this password immediately!", adminPass)
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

// newSSRFSafeTransport returns an http.Transport that blocks connections to private/loopback IPs.
// Used by webhooks, connectors, and reference downloads (V-20 fix).
func newSSRFSafeTransport() *http.Transport {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	return &http.Transport{
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
					return nil, fmt.Errorf("request blocked: %s resolves to private address %s", host, ipStr)
				}
			}
			return dialer.DialContext(ctx, network, addr)
		},
	}
}

// runWebhookWorker processes outbound webhook HTTP calls from the shared job queue.
func (app *App) runWebhookWorker() {
	// Use a custom transport that blocks connections to private/loopback IPs.
	transport := newSSRFSafeTransport()
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
