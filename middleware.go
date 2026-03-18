package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

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
		// CSRF protection: require X-Requested-With header on state-changing requests
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			if r.Header.Get("X-Requested-With") == "" {
				jsonError(w, "missing required header", http.StatusForbidden)
				return
			}
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
		RoleDeputyTeamLead:   3,
		RoleOpLead:           4,
		RoleDeputyOpLead:     4,
		RoleStaffOfficer:     4,
		RoleStaffAssistant:   4,
		RoleStaffOfficerFull: 4,
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
				// Check API keys
				if k := app.store.ValidateAPIKey(raw); k != nil {
					// V-05/API key fix: apply CSRF check to API-key authenticated requests too
					if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
						if r.Header.Get("X-Requested-With") == "" {
							jsonError(w, "missing required header", http.StatusForbidden)
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
