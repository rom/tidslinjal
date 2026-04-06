package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// setCSRFCookie generates a cryptographic CSRF token and sets it as a
// non-HttpOnly cookie so that JavaScript can read it and include it in
// the X-CSRF-Token header (double-submit cookie pattern).
func (app *App) setCSRFCookie(w http.ResponseWriter, expires time.Time) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "csrf_token",
		Value:    hex.EncodeToString(b),
		Path:     "/",
		HttpOnly: false, // JS must be able to read this
		Secure:   app.secureMode,
		SameSite: http.SameSiteStrictMode,
		Expires:  expires,
	})
}

// validateCSRF checks that the X-CSRF-Token header matches the csrf_token cookie
// (double-submit cookie pattern). Falls back to requiring X-Requested-With if no
// CSRF cookie is present (backwards compatibility for API key auth).
func validateCSRF(r *http.Request) bool {
	cookie, err := r.Cookie("csrf_token")
	if err == nil && cookie.Value != "" {
		header := r.Header.Get("X-CSRF-Token")
		if header != "" {
			return subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) == 1
		}
		return false
	}
	// Fallback: require X-Requested-With header (for API key auth or legacy clients)
	return r.Header.Get("X-Requested-With") != ""
}

// requestIDKey is the context key for the HTTP request ID.
type requestIDKeyType struct{}

var requestIDKey = requestIDKeyType{}

// requestIDMiddleware generates a unique request ID and adds it to the context
// and the response headers for audit correlation.
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 8)
		rand.Read(b) //nolint
		reqID := hex.EncodeToString(b)
		w.Header().Set("X-Request-ID", reqID)
		ctx := r.Context()
		ctx = contextWithRequestID(ctx, reqID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func contextWithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

func getRequestID(r *http.Request) string {
	if id, ok := r.Context().Value(requestIDKey).(string); ok {
		return id
	}
	return ""
}

// userContextKey is the context key for the authenticated user.
type userContextKeyType struct{}

var userContextKey = userContextKeyType{}

// contextWithUser stores the authenticated user in the request context.
func contextWithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, userContextKey, u)
}

// getUserFromContext retrieves the authenticated user from the request context.
func getUserFromContext(r *http.Request) *User {
	if u, ok := r.Context().Value(userContextKey).(*User); ok {
		return u
	}
	return nil
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
	// Deny session access for blocked or unvetted users (V-03 fix)
	if user.Blocked {
		return nil, nil
	}
	if !user.Vetted && user.Role != RoleAdmin {
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
		// CSRF protection: double-submit cookie token or X-Requested-With header
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			if !validateCSRF(r) {
				jsonError(w, "CSRF validation failed", http.StatusForbidden)
				return
			}
		}
		// Propagate user into request context for downstream use
		ctx := contextWithUser(r.Context(), user)
		next(w, r.WithContext(ctx), user)
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
		RoleDeputyTeamLead:   3,
		RoleOpLead:           4,
		RoleDeputyOpLead:     4,
		RoleStaffOfficer:     4,
		RoleStaffAssistant:   4,
		RoleStaffOfficerFull: 4,
		RoleDeveloper:        5,
		RoleAdmin:            5,
	}
	return order[userRole] >= order[required]
}

func canEditMasterTimeline(role Role) bool {
	return hasRole(role, RoleOpLead)
}

// clientIP extracts the real client IP from the request.
// V-07 fix: Only trust forwarding headers when the direct connection comes from
// a loopback/private address (i.e., a local reverse proxy). This prevents
// arbitrary IP spoofing from the public internet.
func clientIP(r *http.Request) string {
	directIP, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		directIP = r.RemoteAddr
	}
	// Only trust proxy headers if the direct peer is a private/loopback address
	if ip := net.ParseIP(directIP); ip != nil && (ip.IsLoopback() || ip.IsPrivate()) {
		if ff := r.Header.Get("X-Forwarded-For"); ff != "" {
			return strings.TrimSpace(strings.SplitN(ff, ",", 2)[0])
		}
		if ri := r.Header.Get("X-Real-IP"); ri != "" {
			return ri
		}
	}
	return directIP
}

// audit is a fire-and-forget convenience wrapper
func (app *App) audit(userID int64, userName, action, entityType string, entityID int64, summary string) {
	app.store.LogAudit(AuditEntry{ //nolint
		UserID: userID, UserName: userName,
		Action: action, EntityType: entityType, EntityID: entityID,
		Summary: summary,
	})
}

// notifyUser creates a persistent notification and sends an SSE event to the user.
func (app *App) notifyUser(userID int64, ntype, title, body, refID string) {
	n := Notification{
		UserID: userID,
		Type:   ntype,
		Title:  title,
		Body:   body,
		RefID:  refID,
	}
	created, err := app.store.AddNotification(n)
	if err != nil {
		log.Printf("failed to create notification for user %d: %v", userID, err)
		return
	}
	data, _ := json.Marshal(created)
	app.broker.SendToUser(userID, SSEMessage{Event: "personal_notification", Data: string(data)})
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
	// Limit request body to 1 MB to prevent memory exhaustion attacks.
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v)
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

// requireAPIKeyOrAuth allows requests authenticated with either a session cookie
// or an Authorization: Bearer <api-key> header.
func (app *App) requireAPIKeyOrAuth(next func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Try bearer token first
		authHdr := r.Header.Get("Authorization")
		if strings.HasPrefix(authHdr, "Bearer ") {
			raw := strings.TrimPrefix(authHdr, "Bearer ")
			if raw != "" {
				// API key brute-force protection: rate-limit validation attempts per IP
				if !app.authLimiter.allow("apikey:"+clientIP(r), 20, time.Minute) {
					ip := clientIP(r)
					logDebug("limits: API key rate limit hit for IP %s", ip)
					log.Printf("[SECURITY] API key rate limit exceeded from IP %s", ip)
					app.store.LogAudit(AuditEntry{ //nolint
						Action: "rate_limited", EntityType: "api_key", Summary: fmt.Sprintf("API key brute-force protection triggered from IP %s", ip),
					})
					jsonError(w, "too many API key attempts — try again later", http.StatusTooManyRequests)
					return
				}
				// Check API keys
				if k := app.store.ValidateAPIKey(raw, clientIP(r)); k != nil {
					// V-05/API key fix: apply CSRF check to API-key authenticated requests too
					if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
						if !validateCSRF(r) {
							jsonError(w, "CSRF validation failed", http.StatusForbidden)
							return
						}
					}
					// M-05 fix: use the API key's configured role instead of hardcoded RoleReadWrite
				keyRole := k.Role
				if keyRole == "" {
					keyRole = RoleRead // safe default for legacy keys without role
				}
				u := &User{
						ID:          k.CreatedBy,
						Username:    "apikey:" + k.Name,
						DisplayName: k.Name,
						Role:        keyRole,
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

// authenticateAPIKey extracts and validates an API key from the Authorization header.
// Returns the synthetic User for the key, or nil if invalid/missing.
func (app *App) authenticateAPIKey(r *http.Request) *User {
	authHdr := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHdr, "Bearer ") {
		return nil
	}
	raw := strings.TrimPrefix(authHdr, "Bearer ")
	if raw == "" {
		return nil
	}
	// API key brute-force protection
	if !app.authLimiter.allow("apikey:"+clientIP(r), 20, time.Minute) {
		logDebug("apikey: rate limited from %s", clientIP(r))
		return nil
	}
	k := app.store.ValidateAPIKey(raw, clientIP(r))
	if k == nil {
		logDebug("apikey: invalid key from %s (prefix=%s...)", clientIP(r), raw[:min(8, len(raw))])
		return nil
	}
	keyRole := k.Role
	if keyRole == "" {
		keyRole = RoleRead
	}
	logDebug("apikey: authenticated key=%q role=%s from %s", k.Name, keyRole, clientIP(r))
	return &User{
		ID:          k.CreatedBy,
		Username:    "apikey:" + k.Name,
		DisplayName: k.Name,
		Role:        keyRole,
	}
}

// noDirListing wraps an http.Handler and returns 404 for directory requests.
// L-16 fix: prevents http.FileServer from exposing directory contents.
func noDirListing(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") || r.URL.Path == "" {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ipBlacklistMiddleware blocks requests from blacklisted IP addresses.
func (app *App) ipBlacklistMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bl := app.store.GetIPBlacklist()
		if bl.Enabled && len(bl.Entries) > 0 {
			ip := clientIP(r)
			parsedIP := net.ParseIP(ip)
			for _, entry := range bl.Entries {
				// Check exact IP match
				if entry.IP == ip {
					logDebug("IP %s has been blocked — blacklisted IP %s", ip, entry.IP)
					app.store.LogAudit(AuditEntry{
						Action: "blocked", EntityType: "ip_blacklist",
						Summary: fmt.Sprintf("SECURITY: Blocked connection from blacklisted IP %s (reason: %s)", ip, entry.Reason),
					})
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				// Check CIDR match
				if strings.Contains(entry.IP, "/") {
					_, cidr, err := net.ParseCIDR(entry.IP)
					if err == nil && parsedIP != nil && cidr.Contains(parsedIP) {
						logDebug("IP %s has been blocked — blacklisted IP %s (CIDR match %s)", ip, ip, entry.IP)
						app.store.LogAudit(AuditEntry{
							Action: "blocked", EntityType: "ip_blacklist",
							Summary: fmt.Sprintf("SECURITY: Blocked connection from blacklisted range %s (IP: %s, reason: %s)", entry.IP, ip, entry.Reason),
						})
						http.Error(w, "Forbidden", http.StatusForbidden)
						return
					}
				}
			}
		}
		next.ServeHTTP(w, r)
	})
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
		// Generate CSP nonce for scripts (defence-in-depth)
		nonceBytes := make([]byte, 16)
		rand.Read(nonceBytes) //nolint
		nonce := base64.StdEncoding.EncodeToString(nonceBytes)
		// CSP: all JS/CSS served from 'self'; nonce allows specific inline scripts if needed.
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'nonce-"+nonce+"'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: blob: https://*.tile.openstreetmap.org; "+
				"connect-src 'self' https://nominatim.openstreetmap.org; "+
				"font-src 'self' data:; "+
				"frame-ancestors 'none'")
		// Make nonce available to handlers that render HTML
		w.Header().Set("X-CSP-Nonce", nonce)
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
