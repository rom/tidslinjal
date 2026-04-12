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
	// Session hijack protection: reject sessions whose bound client metadata
	// (IP, user-agent) no longer matches the current request. A stolen
	// session cookie replayed from a different client will fail this check.
	ss := app.store.GetSecuritySettings()
	if reason := sessionBindingMismatch(sess, r, ss); reason != "" {
		ip := clientIP(r)
		log.Printf("[SECURITY] session binding mismatch for user %d (%s): %s; ip=%s stored_ip=%s", user.ID, user.Username, reason, ip, sess.IPAddress)
		app.store.LogAudit(AuditEntry{ //nolint
			UserID: user.ID, UserName: user.Username,
			Action: "session_hijack_suspected", EntityType: "session",
			Summary: fmt.Sprintf("SECURITY: session binding mismatch (%s); original ip=%s ua=%q, current ip=%s ua=%q — session destroyed", reason, sess.IPAddress, sess.UserAgent, ip, r.UserAgent()),
		})
		// Destroy the suspect session so a stolen cookie can't be reused.
		_ = app.store.DeleteSession(sess.ID)
		return nil, nil
	}
	return sess, user
}

// sessionBindingMismatch returns a non-empty reason string if the current
// request does not match the client metadata bound to the session at login
// time. Returns "" when the binding is OK or disabled, or when the stored
// metadata is empty (legacy sessions created before binding was added).
func sessionBindingMismatch(sess *Session, r *http.Request, ss SecuritySettings) string {
	if ss.SessionBindIP && sess.IPAddress != "" {
		curIP := clientIP(r)
		if !ipsMatchBinding(sess.IPAddress, curIP, ss.SessionBindIPMode) {
			return "ip"
		}
	}
	if ss.SessionBindUA && sess.UserAgent != "" {
		if subtle.ConstantTimeCompare([]byte(sess.UserAgent), []byte(r.UserAgent())) != 1 {
			return "user-agent"
		}
	}
	return ""
}

// ipsMatchBinding compares two IP addresses under the configured binding mode.
// "strict" requires an exact match; "subnet" (or any other value) uses /24 for
// IPv4 and /64 for IPv6 so that clients on the same LAN / carrier block
// continue to work across minor NAT churn.
func ipsMatchBinding(storedIP, currentIP, mode string) bool {
	if storedIP == currentIP {
		return true
	}
	if mode == "strict" {
		return false
	}
	a := net.ParseIP(storedIP)
	b := net.ParseIP(currentIP)
	if a == nil || b == nil {
		return false
	}
	// Normalise: if both are IPv4, compare /24.
	if a4, b4 := a.To4(), b.To4(); a4 != nil && b4 != nil {
		return a4[0] == b4[0] && a4[1] == b4[1] && a4[2] == b4[2]
	}
	// Reject mixing IPv4 and IPv6 forms.
	if a.To4() != nil || b.To4() != nil {
		return false
	}
	// IPv6: compare first 64 bits.
	a16 := a.To16()
	b16 := b.To16()
	if a16 == nil || b16 == nil {
		return false
	}
	for i := 0; i < 8; i++ {
		if a16[i] != b16[i] {
			return false
		}
	}
	return true
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
		if !app.effectiveHasRole(user, role) {
			jsonError(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r, user)
	})
}

// effectiveHasRole checks if a user has the required role level.
// For built-in roles, it uses the standard role hierarchy.
// For custom roles not in the hierarchy, it computes an effective level
// from the role's capabilities so that custom roles with appropriate
// permissions are not blocked. Custom roles can reach up to level 4
// (oplead/staff); level 5 (admin/developer) requires the actual role.
func (app *App) effectiveHasRole(user *User, required Role) bool {
	if hasRole(user.Role, required) {
		return true
	}
	// If the built-in check passed, we're done. If it failed, check whether
	// this is a custom role that should be allowed based on capabilities.
	// Only bother computing the effective level if the role is not a known
	// built-in role (built-in roles are already correctly ordered).
	if _, known := roleOrder[user.Role]; known {
		return false // built-in role genuinely too low
	}
	// Custom role — compute effective level from capabilities
	level := app.customRoleLevel(user)
	return level >= roleOrder[required]
}

// roleOrder is the shared role hierarchy used by hasRole and effectiveHasRole.
var roleOrder = map[Role]int{
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

func hasRole(userRole, required Role) bool {
	return roleOrder[userRole] >= roleOrder[required]
}

// customRoleLevel computes the effective role level for a custom role based
// on its capabilities. Returns 0-4; never 5 (admin requires actual admin role).
func (app *App) customRoleLevel(user *User) int {
	caps := app.getRoleCaps(user.Role)
	if caps == nil {
		return 0
	}
	level := 0
	// Level 1 (reporter): can create events or interact
	if caps["create_events"] || caps["comment"] || caps["manage_alarms"] {
		level = 1
	}
	// Level 2 (readwrite): can edit own events
	if caps["edit_own"] || caps["import_export"] {
		if level < 2 {
			level = 2
		}
	}
	// Level 3 (teamlead): elevated management capabilities
	if caps["edit_all"] || caps["manage_layers"] || caps["manage_groups"] ||
		caps["view_audit"] || caps["manage_rooms"] || caps["boards"] ||
		caps["teamlead_toolbox"] || caps["decision_log_readwrite"] ||
		caps["delete_events"] || caps["report"] || caps["see_location"] {
		if level < 3 {
			level = 3
		}
	}
	// Level 4 (oplead/staff): high-level operational capabilities
	if caps["exercise"] || caps["manage_templates"] || caps["approve_users"] ||
		caps["critical_line_analysis"] || caps["staff_toolbox"] ||
		caps["manage_integrations"] || caps["lock_slots"] || caps["confidential_read"] {
		if level < 4 {
			level = 4
		}
	}
	return level
}

// getRoleCaps returns the capability map for a role, or nil if not found.
func (app *App) getRoleCaps(role Role) map[string]bool {
	for _, rc := range app.store.GetRoleConfigs() {
		if rc.Key == string(role) {
			return rc.Capabilities
		}
	}
	return nil
}

func canEditMasterTimeline(role Role) bool {
	return hasRole(role, RoleOpLead)
}

// canEditMasterTimelineUser is the capability-aware version of canEditMasterTimeline.
func (app *App) canEditMasterTimelineUser(user *User) bool {
	return app.effectiveHasRole(user, RoleOpLead)
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

// authenticateAPIKeyFull extracts and validates an API key, returning both the User and the full APIKey record.
func (app *App) authenticateAPIKeyFull(r *http.Request) (*User, *APIKey) {
	user := app.authenticateAPIKey(r)
	if user == nil {
		return nil, nil
	}
	// Find the full API key record by matching the name from the synthetic user
	keyName := strings.TrimPrefix(user.Username, "apikey:")
	keys := app.store.GetAPIKeys()
	for _, k := range keys {
		if k.Name == keyName {
			return user, &k
		}
	}
	return user, nil
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
				"script-src 'self' 'unsafe-eval' 'nonce-"+nonce+"'; "+
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
