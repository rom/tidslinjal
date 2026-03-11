# Security Audit Report — Tidslinjal v4.0.0

**Date:** 2026-03-11
**Scope:** Complete source code, architecture, functionality, interfaces, implementation
**Files reviewed:** main.go (5,797 LOC), models.go (589 LOC), store.go (2,637 LOC), all frontend JS/HTML/CSS (~9,351 LOC), tests, configuration

---

## Executive Summary

Tidslinjal is a collaborative operational timeline web application written in Go (backend) with vanilla JavaScript (frontend). The application handles sensitive military/incident-response data and supports multi-user real-time collaboration. This audit identified **7 critical**, **9 high**, **12 medium**, and **8 low** severity security vulnerabilities across authentication, authorization, injection, data exposure, CSRF, infrastructure, and cryptographic domains.

---

## CRITICAL Severity

### SEC-01: Password Reset Token Leaked in HTTP Response (Information Disclosure / Account Takeover)

**File:** `main.go:1232-1234`
**CVSS:** 9.1 (Critical)

When SMTP is not configured, the `handleForgotPassword` endpoint returns the password reset token directly in the HTTP response body:

```go
} else {
    // Return token directly (admin will see it in logs, or no SMTP configured)
    jsonOK(w, map[string]string{"status": "ok", "token": token})
}
```

**Impact:** Any unauthenticated attacker can request a password reset for any user and receive the token in the response. This allows complete account takeover of any account including admin.

**Recommendation:** Never return reset tokens in HTTP responses. If SMTP is not configured, only make the token visible in server logs (already done) and notify the admin via the UI that they need to relay the token manually.

---

### SEC-02: No CSRF Protection on State-Mutating Endpoints

**Files:** `main.go:3762-3842` (routes), `static/api.js`
**CVSS:** 8.8 (Critical)

The application relies on session cookies (`SameSite=Lax`) for authentication but implements **no CSRF token validation** on any state-mutating endpoint. While `SameSite=Lax` blocks cross-origin POST requests from embedded forms in modern browsers, it has known bypasses:

1. **Top-level navigation redirects** — `SameSite=Lax` allows cookies on GET requests triggered by top-level navigation. The application has state-mutating GET endpoints (e.g., `/api/admin/reset` only checks POST internally but the route is registered without method restriction via `mux.HandleFunc`).
2. **Older browsers** — Some browsers don't enforce `SameSite` properly.
3. **Subdomain attacks** — If the app is deployed on a domain with other subdomains, cookies can be shared.

**Impact:** An attacker can forge requests that modify events, delete data, change user roles, or trigger a full system reset if an admin visits a malicious page.

**Recommendation:** Implement CSRF tokens (double-submit cookie pattern or synchronizer token pattern) for all state-mutating API endpoints. Alternatively, require a custom header (e.g., `X-Requested-With`) on all API calls that cookies alone cannot satisfy.

---

### SEC-03: Session Cookie Missing `Secure` Flag

**Files:** `main.go:502-505`, `main.go:5545-5552`
**CVSS:** 8.1 (Critical)

Session cookies are set without the `Secure` flag:

```go
http.SetCookie(w, &http.Cookie{
    Name: "session", Value: sessID, Path: "/",
    HttpOnly: true, SameSite: http.SameSiteLaxMode, Expires: sess.ExpiresAt,
})
```

**Impact:** When the application is accessed over HTTP (the default — port 8080), session tokens are transmitted in cleartext. Even when TLS is configured, the missing `Secure` flag means the browser may send the cookie over an insecure fallback connection, allowing network-level session hijacking.

**Recommendation:** Set `Secure: true` when TLS is enabled. Consider also adding HSTS headers when running in TLS mode.

---

### SEC-04: Change Password Does Not Require Current Password

**File:** `main.go:595-600`
**CVSS:** 8.6 (Critical)

The `handleChangePassword` endpoint only validates the current password if it is provided — it does not require it:

```go
if req.CurrentPassword != "" {
    if err := bcrypt.CompareHashAndPassword([]byte(fullUser.PasswordHash), []byte(req.CurrentPassword)); err != nil {
        jsonError(w, "current password incorrect", http.StatusUnauthorized)
        return
    }
}
```

**Impact:** If an attacker obtains a valid session (via XSS, session fixation, or an unattended browser), they can change the user's password without knowing the current one, permanently locking out the legitimate user.

**Recommendation:** Always require the current password for password changes. Remove the `if req.CurrentPassword != ""` conditional.

---

### SEC-05: Server-Side Request Forgery (SSRF) via User-Controlled Webhook URLs

**Files:** `main.go:201-224`, `main.go:260-277`, `main.go:2200-2224`
**CVSS:** 8.2 (Critical)

Users can set arbitrary webhook URLs in their preferences (`WebhookURL`) and per-alarm webhook URLs (`WebhookURL`). The server makes HTTP POST requests to these URLs without any validation:

```go
req, err := http.NewRequest("POST", job.url, bytes.NewReader(job.body))
// ... no URL validation, no allowlist, no blocklist
resp, err := client.Do(req)
```

**Impact:** Any authenticated user (including the lowest `read` role) can:
1. Probe internal network services (port scanning, service discovery)
2. Access cloud metadata endpoints (e.g., `http://169.254.169.254/`)
3. Attack internal HTTP services by crafting payloads
4. Exfiltrate data to arbitrary external servers

**Recommendation:** Implement URL validation: block private IP ranges (RFC 1918, link-local, loopback), block cloud metadata IPs, enforce HTTPS-only, and ideally maintain an allowlist of permitted webhook domains.

---

### SEC-06: Attachment Upload Path Traversal

**File:** `main.go:1797`
**CVSS:** 8.4 (Critical)

The uploaded filename is used directly in constructing the storage path:

```go
storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), header.Filename)
destPath := filepath.Join(app.store.AttachmentDir(), storedName)
```

If `header.Filename` contains path traversal sequences (e.g., `../../../etc/cron.d/backdoor`), `filepath.Join` will resolve them, potentially writing files outside the attachments directory.

**Impact:** An attacker can write arbitrary files anywhere the server process has write access, potentially achieving remote code execution.

**Recommendation:** Sanitize the filename by stripping all directory separators and path components: `storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(header.Filename))`. Additionally validate that the resolved path is within the attachments directory.

---

### SEC-07: Attachment Download Path Traversal

**File:** `main.go:1844`
**CVSS:** 8.4 (Critical)

The stored attachment name is used to construct the file path for serving:

```go
path := filepath.Join(app.store.AttachmentDir(), att.StoredName)
```

Since `StoredName` is derived from the original upload filename (SEC-06) and persisted in the JSON store, a previously-exploited path traversal remains permanently exploitable for reading arbitrary files.

**Impact:** An attacker can read any file on the server that the process can access.

**Recommendation:** Apply `filepath.Base()` to `att.StoredName` before joining. Validate the resolved path is within the attachments directory.

---

## HIGH Severity

### SEC-08: Cross-Site Scripting (XSS) via innerHTML with Insufficient Escaping

**Files:** `static/modals.js` (60+ innerHTML assignments), `static/utils.js:191`, `static/timeline.js`
**CVSS:** 7.5 (High)

The frontend extensively uses `innerHTML` with template literals. While an `escHtml()` function exists and is used in many places, there are multiple locations where user-controlled data is interpolated into HTML without escaping:

1. **Event color values** injected directly into `style` attributes: `background:${ev.color}` — a malicious color value like `red;background-image:url(javascript:...)` could be exploited in some contexts.
2. **`modals.js:106`** — Event type options use `et.key` in `value` attributes without escaping: `value="${et.key}"`.
3. **`modals.js:627`** — The detail modal injects `ev.color` directly into inline CSS without validation.
4. **`utils.js:365-371`** — Timezone suggestion `data-tz` and `data-label` attributes use `c.tz` and `c.label` which, while from a static list, set a pattern that could be exploited if the list becomes dynamic.
5. **`modals.js:692`** — Attachment download link uses `a.id` directly in `href="/api/attachments/${a.id}"` without validation.

**Impact:** Stored XSS through event titles, descriptions, filenames, or other user-controlled fields could allow session hijacking, data exfiltration, or privilege escalation.

**Recommendation:** Replace all `innerHTML` usage with DOM APIs (`textContent`, `createElement`, etc.) for user-controlled data. Where `innerHTML` is necessary, ensure ALL interpolated values go through `escHtml()`, including values used in attributes and CSS contexts.

---

### SEC-09: Content-Disposition Header Injection in Attachment Downloads

**File:** `main.go:1846`
**CVSS:** 7.1 (High)

The attachment filename is placed directly into a `Content-Disposition` header without sanitization:

```go
w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, att.Filename))
```

If `att.Filename` contains double quotes or newline characters, an attacker can inject additional HTTP headers (header injection / response splitting).

**Recommendation:** Sanitize the filename: strip or replace `"`, `\r`, `\n`, and non-ASCII characters. Use RFC 5987 encoding for the filename parameter.

---

### SEC-10: No Rate Limiting on Authentication Endpoints

**Files:** `main.go:447-528` (login), `main.go:621-721` (register), `main.go:1169-1235` (forgot-password)
**CVSS:** 7.3 (High)

No rate limiting is implemented on any endpoint, including:
- Login (`/api/auth/login`) — enables brute-force password attacks
- Registration (`/api/auth/register`) — enables mass account creation
- Password reset (`/api/auth/forgot-password`) — enables reset token flooding

**Impact:** Attackers can conduct brute-force attacks against user accounts. The default `admin/admin` credentials make this especially dangerous.

**Recommendation:** Implement rate limiting per IP and per username. Consider adding account lockout after repeated failures. Add CAPTCHA for registration.

---

### SEC-11: Default Admin Credentials Not Forced to Change

**File:** `main.go:245-256`
**CVSS:** 7.5 (High)

The application creates a default admin account with `admin/admin` credentials and only logs a message. There is no mechanism to force the admin to change the password on first login.

```go
hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
store.CreateUser(User{
    Username: "admin", PasswordHash: string(hash),
    DisplayName: "Administrator", Role: RoleAdmin, ...
})
log.Println("Created default admin (username: admin, password: admin)")
```

**Impact:** If the admin fails to change the password, any network-reachable attacker gains full admin access.

**Recommendation:** Force password change on first admin login. Add a startup warning that persists in the UI until the password is changed.

---

### SEC-12: SMTP Credential Injection / Email Header Injection

**File:** `main.go:4478-4528`
**CVSS:** 7.0 (High)

The `sendMail` function constructs email headers by string concatenation without sanitizing the `to`, `subject`, or `fromName` fields:

```go
msg := []byte(fmt.Sprintf("From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\n...",
    fromName, from, to, subject, bodyHTML))
```

**Impact:** If user-controlled data reaches these fields (e.g., display names containing `\r\n`), an attacker can inject additional email headers (BCC, CC) to send spam or phishing emails through the server's SMTP infrastructure.

**Recommendation:** Sanitize all email header values by stripping `\r` and `\n` characters. Use a proper email library for header encoding.

---

### SEC-13: Backup Endpoint Exposes Sensitive Data

**File:** `main.go:5097-5130`
**CVSS:** 7.2 (High)

The backup endpoint includes `oidc.json` and `mail.json` in the ZIP archive, which contain:
- OIDC client secrets
- SMTP passwords
- Potentially other sensitive configuration

```go
files := []string{
    "event_types.json", "users.json", ...
    ... "oidc.json", "mail.json", "apikeys.json", ...
}
```

Also includes `users.json` (with bcrypt password hashes) and `apikeys.json` (with API key hashes).

**Impact:** Admin-level data exfiltration of all credentials and secrets.

**Recommendation:** Exclude or redact sensitive fields from backup exports. At minimum, strip `oidc.json` client secrets, `mail.json` passwords, and `users.json` password hashes from backups.

---

### SEC-14: OIDC State Not Cryptographically Bound to Session

**File:** `main.go:5410-5414`
**CVSS:** 7.1 (High)

The OIDC state token is stored in a plain cookie and compared on callback:

```go
stateCookie, err := r.Cookie("oidc_state")
if err != nil || stateCookie.Value != r.URL.Query().Get("state") {
```

The state cookie is not cryptographically bound to the user's browser session and is not signed. An attacker who can observe the state value (e.g., via Referer leakage or network sniffing on HTTP) can complete the OIDC flow.

**Impact:** OIDC login CSRF — an attacker could force-link their external identity to a victim's local account.

**Recommendation:** Use a signed/HMAC'd state token or bind it to a session nonce. Ensure the state cookie has `Secure` flag when TLS is enabled.

---

### SEC-15: OIDC ID Token Not Validated

**File:** `main.go:5442-5470`
**CVSS:** 7.0 (High)

The OIDC callback receives an `id_token` but never validates it (no signature verification, no issuer check, no audience check, no expiry check). Instead, the application only uses the `access_token` to call the userinfo endpoint:

```go
var tokens struct {
    AccessToken string `json:"access_token"`
    IDToken     string `json:"id_token"`   // received but NEVER validated
    TokenType   string `json:"token_type"`
}
```

While using the userinfo endpoint is acceptable, failing to validate the ID token means the application cannot verify the token's integrity, making it vulnerable to token substitution attacks if the OIDC provider's userinfo endpoint is compromised or intercepted.

**Recommendation:** Validate the ID token (signature, issuer, audience, expiry, nonce) using a proper OIDC library. Consider using `github.com/coreos/go-oidc`.

---

### SEC-16: Weak Password Policy

**Files:** `main.go:652`, `main.go:1254`
**CVSS:** 6.5 (High)

The only password requirement is a minimum length of 6 characters:

```go
if len(req.Password) < 6 {
    jsonError(w, "password must be at least 6 characters", http.StatusBadRequest)
}
```

No checks for: uppercase, numbers, special characters, common passwords, or password breach databases.

**Impact:** Users can set trivially guessable passwords. Combined with no rate limiting (SEC-10), this makes brute-force attacks highly feasible.

**Recommendation:** Require at least 8 characters with complexity requirements. Consider checking against common password lists (e.g., Have I Been Pwned).

---

## MEDIUM Severity

### SEC-17: JSON Data Files Stored with World-Readable Permissions

**File:** `store.go:81`
**CVSS:** 6.0 (Medium)

Data directories and files are created with `0755` / `0644` permissions:

```go
os.MkdirAll(dataDir, 0755)
```

This means any user on the system can read all JSON files, which contain password hashes, OIDC secrets, SMTP credentials, session tokens, and all application data.

**Recommendation:** Use `0700` for directories and `0600` for files.

---

### SEC-18: Session Tokens Not Invalidated on Password Change

**File:** `main.go:572-617`
**CVSS:** 6.5 (Medium)

When a user changes their password, existing sessions are not invalidated:

```go
func (app *App) handleChangePassword(...) {
    // ... changes password ...
    // No session invalidation!
    jsonOK(w, map[string]string{"status": "ok"})
}
```

**Impact:** If a user's session was compromised, changing the password does not revoke the attacker's access.

**Recommendation:** Invalidate all other sessions for the user when the password is changed. Keep only the current session active.

---

### SEC-19: API Key Authentication Grants Fixed ReadWrite Role

**File:** `main.go:4956-4961`
**CVSS:** 6.3 (Medium)

API key authentication creates a synthetic user with `RoleReadWrite` regardless of the actual role of the user who created the key:

```go
u := &User{
    ID:          k.CreatedBy,
    Username:    "apikey:" + k.Name,
    DisplayName: k.Name,
    Role:        RoleReadWrite, // conservative default
}
```

**Impact:** An admin who creates an API key might expect it to have admin-level access; a read-only user who somehow gets an API key gets elevated to readwrite.

**Recommendation:** Inherit the role from the creating user, or allow specifying the role at creation time with an upper bound of the creator's role.

---

### SEC-20: No Request Body Size Limit on JSON Endpoints

**File:** `main.go:420-422`
**CVSS:** 5.5 (Medium)

The `decode` function reads the entire request body without size limits:

```go
func decode(r *http.Request, v interface{}) error {
    return json.NewDecoder(r.Body).Decode(v)
}
```

While `MaxHeaderBytes` is set to 1MB, there is no limit on request body size for JSON API endpoints.

**Impact:** An attacker can send extremely large JSON payloads to exhaust server memory (DoS).

**Recommendation:** Use `http.MaxBytesReader` to limit request body size: `r.Body = http.MaxBytesReader(w, r.Body, 1<<20)`.

---

### SEC-21: Restore Endpoint Writes Arbitrary JSON Files to Data Directory

**File:** `main.go:5132-5197`
**CVSS:** 6.5 (Medium)

While the restore endpoint uses an allowlist for filenames, it writes raw data from the uploaded ZIP directly to disk without JSON validation:

```go
data, err := io.ReadAll(rc)
// ... no JSON validation ...
os.WriteFile(filepath.Join(dataDir, f.Name), data, 0644)
```

**Impact:** An admin (or attacker with admin access) could upload malformed JSON that crashes the application on restart, or inject data that exploits business logic vulnerabilities.

**Recommendation:** Validate that each file contains valid JSON before writing. Unmarshal into the expected type to verify structure.

---

### SEC-22: Sensitive Data in Server Logs

**Files:** `main.go:1215`, `main.go:508`, `main.go:5572`
**CVSS:** 5.0 (Medium)

Password reset tokens are logged in plaintext:

```go
log.Printf("Password reset requested for user %q — token: %s (valid 2h)", targetUser.Username, token)
```

Session IDs are partially logged, and verbose mode logs include IP addresses and usernames.

**Impact:** If logs are accessible (shared filesystem, log aggregation service, container stdout), secrets can be extracted.

**Recommendation:** Never log security tokens. Log only token prefixes (first 8 chars) for debugging. Ensure verbose/debug mode is not enabled in production.

---

### SEC-23: X-Forwarded-For Header Trusted Without Proxy Validation

**File:** `main.go:349-361`
**CVSS:** 5.3 (Medium)

The `clientIP` function trusts `X-Forwarded-For` and `X-Real-IP` headers unconditionally:

```go
func clientIP(r *http.Request) string {
    if ff := r.Header.Get("X-Forwarded-For"); ff != "" {
        return strings.TrimSpace(strings.SplitN(ff, ",", 2)[0])
    }
```

**Impact:** Attackers can spoof their IP address in audit logs and any IP-based rate limiting that might be added.

**Recommendation:** Only trust forwarding headers when the request comes from a known proxy IP. Add a configuration option for trusted proxy addresses.

---

### SEC-24: No Content Security Policy (CSP) Headers

**File:** `main.go:3762+` (routes)
**CVSS:** 5.5 (Medium)

The application sets no security headers:
- No `Content-Security-Policy`
- No `X-Content-Type-Options`
- No `X-Frame-Options`
- No `Strict-Transport-Security` (HSTS)
- No `X-XSS-Protection`
- No `Referrer-Policy`

**Impact:** Makes XSS exploitation easier (no CSP), allows clickjacking (`X-Frame-Options`), allows MIME sniffing attacks, and leaks referrer data.

**Recommendation:** Add a middleware that sets security headers on all responses:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

---

### SEC-25: Zip Slip Vulnerability in Restore Endpoint

**File:** `main.go:5169-5186`
**CVSS:** 5.8 (Medium)

While the restore endpoint uses an allowlist, the filename check uses exact match (`allowed[f.Name]`) which mitigates classic zip-slip. However, the zip entry's `f.Name` could potentially contain path traversal if an attacker crafts a zip with names like `../../etc/events.json` that might pass through the allowlist differently on different operating systems.

**Recommendation:** Apply `filepath.Base()` to `f.Name` before checking the allowlist and writing.

---

### SEC-26: Audit Log Can Be Truncated by an Attacker

**File:** `store.go:248`
**CVSS:** 5.0 (Medium)

The audit log is capped at 10,000 entries with oldest entries dropped:

```go
if len(s.audit) > 10000 {
    s.audit = s.audit[len(s.audit)-10000:]
}
```

**Impact:** An attacker with any authenticated access can generate 10,000+ audit entries (e.g., rapid event creation/deletion) to flush evidence of their malicious actions.

**Recommendation:** Implement an append-only audit log that cannot be truncated by application actions. Consider writing audit entries to a separate file or external logging system.

---

### SEC-27: WebCal Token Brute-Force

**File:** `main.go:5201-5225`
**CVSS:** 5.5 (Medium)

WebCal tokens are 16 bytes (32 hex characters) and looked up by iterating all users:

```go
for i := range users {
    if users[i].WebCalToken == token {
```

There is no rate limiting on the WebCal endpoint, and no authentication beyond the token itself.

**Impact:** While 128-bit tokens are computationally infeasible to brute-force, the lack of rate limiting makes the endpoint a target for timing attacks.

**Recommendation:** Add rate limiting to the WebCal endpoint.

---

### SEC-28: Registration Mode "oidc_auto_enroll" Not in Validation List

**File:** `main.go:739`
**CVSS:** 4.5 (Medium)

The admin registration settings handler validates modes against a whitelist that does not include `oidc_auto_enroll`:

```go
validModes := map[string]bool{"off": true, "open": true, "vetted": true, "generic_invitation": true, "personal_invitation": true}
```

But the registration handler checks for `oidc_auto_enroll` mode at `main.go:632`. This means the mode can only be set by manually editing the JSON file, not through the admin UI validation.

**Recommendation:** Add `oidc_auto_enroll` to the valid modes list.

---

## LOW Severity

### SEC-29: Sequential Integer IDs Enable Enumeration

**Files:** `store.go:52-68`
**CVSS:** 3.5 (Low)

All entity IDs are sequential integers. An attacker can enumerate users, events, attachments, etc. by iterating IDs.

**Recommendation:** Consider using UUIDs for externally-visible IDs.

---

### SEC-30: Debug Mode Exposes Internal Information

**File:** `main.go:2624`
**CVSS:** 3.0 (Low)

The public `/api/version` endpoint exposes the debug flag:

```go
jsonOK(w, map[string]any{"version": AppVersion, "github": AppGitHub, "debug": debug})
```

**Recommendation:** Do not expose the debug flag publicly.

---

### SEC-31: Error Messages May Leak Internal State

**Files:** Various handlers
**CVSS:** 3.0 (Low)

Some error messages include internal details (e.g., `"OIDC configuration error: " + err.Error()`).

**Recommendation:** Return generic error messages to clients; log details server-side only.

---

### SEC-32: No HTTP-to-HTTPS Redirect

**File:** `main.go:5776-5797`
**CVSS:** 3.5 (Low)

When TLS is configured, the server only listens on HTTPS. There is no HTTP listener that redirects to HTTPS, so users who type `http://` get a connection refused rather than a secure redirect.

**Recommendation:** Add an HTTP-to-HTTPS redirect listener when TLS is enabled.

---

### SEC-33: Static File Server Exposes Directory Listings

**File:** `main.go:3766`
**CVSS:** 2.5 (Low)

```go
mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
```

`http.FileServer` returns directory listings by default.

**Recommendation:** Disable directory listings by wrapping the file server handler.

---

### SEC-34: Session Expiry Not Refreshed on Activity

**File:** `main.go:497`
**CVSS:** 3.0 (Low)

Sessions are created with a fixed 24-hour expiry and never refreshed:

```go
sess := Session{ID: sessID, UserID: user.ID, ExpiresAt: time.Now().Add(24 * time.Hour)}
```

**Impact:** Active users are forced to re-login after 24 hours regardless of activity.

**Recommendation:** Implement sliding session expiry — refresh the expiry timestamp on each authenticated request.

---

### SEC-35: bcrypt MinCost Used for API Keys

**File:** `main.go:4902`
**CVSS:** 3.0 (Low)

API key hashes use `bcrypt.MinCost` (cost factor 4) instead of `bcrypt.DefaultCost` (10):

```go
hash, err := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.MinCost)
```

While API keys are 256-bit random values (making brute-force of the key itself infeasible), using MinCost means that if the API key hash file is stolen, offline attacks against the hash would be significantly faster.

**Recommendation:** Use `bcrypt.DefaultCost` for consistency.

---

### SEC-36: Invitation Code Entropy Reduction

**File:** `main.go:1001`
**CVSS:** 3.0 (Low)

Personal invitation codes are generated as 32 random bytes (64 hex chars) but then truncated to 12 characters:

```go
code = code[:12]
```

This reduces entropy from 256 bits to 48 bits (12 hex chars), which is borderline for brute-force protection.

**Recommendation:** Use at least 16 hex characters (64 bits of entropy) for invitation codes.

---

## Architecture-Level Observations

### OBS-01: All Data in Flat JSON Files

All application data, including user credentials, session tokens, OIDC secrets, and SMTP passwords, is stored in plain JSON files on disk. This has several implications:
- No encryption at rest
- No access control beyond filesystem permissions
- No transaction safety (crash during write could corrupt data)
- Backup files contain all secrets

### OBS-02: Single-Process Architecture

The application runs as a single process with in-memory state. There is no support for horizontal scaling, and a crash loses all in-flight data (editing locks, SSE connections).

### OBS-03: No Input Validation on Many Fields

Many user-provided fields (event titles, descriptions, group names, layer names, display names) have no length limits or character restrictions beyond being non-empty. This could lead to storage exhaustion or rendering issues.

### OBS-04: Webhook Worker Pool Has No Authentication

Outbound webhook requests carry no authentication mechanism (no HMAC signatures, no shared secrets). Receiving services cannot verify that webhook payloads genuinely originated from Tidslinjal.

---

## Prioritized Remediation Plan

### Immediate (Week 1)
1. **SEC-01**: Remove token from forgot-password response
2. **SEC-04**: Require current password for password changes
3. **SEC-06/SEC-07**: Sanitize attachment filenames with `filepath.Base()`
4. **SEC-03**: Add `Secure` flag to session cookies when TLS is enabled

### Short-term (Week 2-3)
5. **SEC-02**: Implement CSRF protection
6. **SEC-05**: Validate webhook URLs against private IP ranges
7. **SEC-08**: Audit and fix all innerHTML XSS vectors
8. **SEC-10**: Add rate limiting to auth endpoints
9. **SEC-11**: Force default password change on first login
10. **SEC-24**: Add security headers middleware

### Medium-term (Month 1-2)
11. **SEC-09**: Sanitize Content-Disposition headers
12. **SEC-12**: Use proper email library for header encoding
13. **SEC-13**: Exclude sensitive data from backups
14. **SEC-15**: Implement proper OIDC ID token validation
15. **SEC-16**: Strengthen password policy
16. **SEC-17**: Restrict file permissions to 0700/0600
17. **SEC-18**: Invalidate sessions on password change

### Long-term (Quarter)
18. **SEC-14**: Cryptographically bind OIDC state
19. **SEC-19**: Fix API key role inheritance
20. **SEC-20**: Add request body size limits
21. **SEC-26**: Implement tamper-resistant audit logging
22. All remaining medium and low severity items

---

*End of Security Audit Report*
