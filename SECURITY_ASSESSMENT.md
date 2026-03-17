# Tidslinjal Security Vulnerability Assessment

**Date:** 2026-03-17
**Scope:** Full application — main.go (~14,900 LOC), store.go, models.go, ingest.go, routing.go, connectors, metrics
**Methodology:** White-box source code review, nation-state threat model
**Assessor:** Automated deep-dive security audit

---

## Executive Summary

Tidslinjal demonstrates a **generally security-conscious design** with many best practices already implemented (bcrypt password hashing, CSRF protection, SSRF guards, constant-time comparisons, audit logging, rate limiting). However, several **critical and high-severity vulnerabilities** remain that a sophisticated attacker could exploit to compromise the system, escalate privileges, or exfiltrate sensitive data.

**Findings by Severity:**
- **Critical:** 4
- **High:** 8
- **Medium:** 10
- **Low:** 7
- **Informational / Hardening:** 6

---

## CRITICAL Findings

### C-01: OIDC JWT Signature Verification Missing for RSA/EC Algorithms

**File:** `main.go:13517-13520`
**CVSS:** 9.8 (Critical)

The `validateIDToken()` function only verifies HMAC-based JWT signatures (HS256/384/512). For RSA and EC algorithms (RS256, ES256, etc.) — which are used by **the vast majority of OIDC providers** (Google, Azure AD, Okta, Keycloak) — the signature is **not verified at all**:

```go
case "RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256", "PS384", "PS512":
    log.Printf("[SECURITY] OIDC ID token uses %s algorithm — JWKS signature verification not implemented; relying on TLS channel integrity from token endpoint", header.Alg)
```

**Impact:** An attacker who can intercept or manipulate the token exchange (MITM, compromised proxy, DNS spoofing) can forge arbitrary ID tokens to authenticate as any user, including creating admin accounts via OIDC auto-enrollment.

**Recommendation:**
- Implement JWKS endpoint fetching and RSA/EC signature verification
- Cache JWKS keys with periodic refresh
- Consider using a vetted OIDC library (e.g., `coreos/go-oidc`)

---

### C-02: Path Traversal in `/api/docs/user-manual` API Endpoint

**File:** `main.go:5187-5206`
**CVSS:** 7.5 (High → Critical in context)

The HTML endpoint `/docs/user-manual` (line 5137) has the V-15 path traversal fix with character validation, but the **API endpoint** `/api/docs/user-manual` (line 5187) does **NOT** have the same validation:

```go
// VULNERABLE - no lang validation
mux.HandleFunc("/api/docs/user-manual", app.requireAuth(func(...) {
    lang := r.URL.Query().Get("lang")
    // No validation! lang can contain "../" sequences
    candidate := fmt.Sprintf("docs/USER_MANUAL_%s.md", strings.ToUpper(lang))
    if _, err := os.Stat(candidate); err == nil {
        file = candidate
    }
    content, err := os.ReadFile(file) // Arbitrary file read
```

**Impact:** An authenticated user (any role) can read arbitrary files on the server by crafting a `lang` parameter like `lang=../../etc/passwd`. Since `strings.ToUpper()` doesn't affect path separators, traversal sequences pass through.

**Recommendation:** Apply the same character validation as the HTML endpoint:
```go
for _, r := range lang {
    if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '-') {
        jsonError(w, "invalid language code", http.StatusBadRequest)
        return
    }
}
```

---

### C-03: Default Hardcoded Admin Credentials Without Forced Change

**File:** `main.go:580-589`
**CVSS:** 9.1 (Critical)

On first run, a default admin account is created with username `admin` and password `admin`:

```go
hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
store.CreateUser(User{
    Username: "admin", PasswordHash: string(hash),
    Role: RoleAdmin, CanLock: true, Vetted: true,
})
log.Println("Created default admin (username: admin, password: admin)")
```

There is **no forced password change** on first login. The password is also logged to console in plaintext.

**Impact:** Any Tidslinjal instance is immediately compromisable if the admin doesn't change the password. Automated scanners can easily detect and exploit this.

**Recommendation:**
- Generate a random initial password and display it once
- Add a `MustChangePassword` flag and enforce it on next login
- Remove plaintext password from log output

---

### C-04: OIDC Auto-Enrollment Grants Pre-Authenticated Access with Configurable Default Role

**File:** `main.go:13576-13600`
**CVSS:** 8.1 (High)

When OIDC auto-enrollment is active, any user who authenticates via the configured IdP is automatically created with `Vetted: true` and the configured default role (defaults to `RoleReadWrite`):

```go
newUser := User{
    Username:    username,
    DisplayName: displayName,
    Role:        defaultRole,    // defaults to RoleReadWrite
    Vetted:      true,           // auto-vetted
    IsOIDC:      true,
}
```

**Impact:** If the OIDC provider has a broad user base (e.g., corporate Azure AD with thousands of users), any employee — even those who should never access this military C2 timeline tool — gets `ReadWrite` access automatically.

**Recommendation:**
- Default OIDC role should be `RoleObserver` or `RoleRead` (least privilege)
- Support OIDC group-to-role mapping to assign roles based on IdP groups
- Consider requiring admin approval even for OIDC users (vetted=false by default)

---

## HIGH Findings

### H-01: IDOR on Attachment Downloads — No Event-Level Access Control

**File:** `main.go:2477-2500`
**CVSS:** 6.5

`handleDownloadAttachment` retrieves any attachment by ID without checking if the authenticated user has access to the parent event or its layer:

```go
func (app *App) handleDownloadAttachment(w http.ResponseWriter, r *http.Request, user *User) {
    id, err := pathID(r)
    att, ok := app.store.GetAttachmentByID(id)  // No ownership/layer check
    path := filepath.Join(app.store.AttachmentDir(), att.StoredName)
    http.ServeFile(w, r, path)
}
```

**Impact:** Any authenticated user can download attachments from private layers or events they shouldn't have access to by guessing/enumerating attachment IDs (sequential integers).

**Recommendation:** Verify the user has read access to the event's layer before serving the file.

---

### H-02: IDOR on Attachment Deletion — Insufficient Ownership Check

**File:** `main.go:2502-2530`
**CVSS:** 6.5

Similar to H-01, `handleDeleteAttachment` may not verify event/layer access comprehensively. An attacker could delete attachments belonging to events in private layers.

**Impact:** Data destruction on events outside the attacker's access scope.

**Recommendation:** Check event and layer ownership/access before allowing deletion.

---

### H-03: No Password Maximum Length Enforcement — bcrypt 72-Byte Truncation

**File:** `main.go` (various bcrypt calls)
**CVSS:** 5.3

bcrypt silently truncates passwords at 72 bytes. No maximum length is enforced anywhere in the codebase:

```go
hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
```

**Impact:**
- Two passwords that share the same first 72 bytes but differ afterward will hash identically
- Enables password collision attacks
- Can be used for DoS: sending extremely long passwords forces expensive bcrypt computation

**Recommendation:** Enforce a maximum password length of 128 characters. Consider pre-hashing with SHA-256 before bcrypt for passwords > 72 bytes.

---

### H-04: Event Layer Visibility Not Enforced Server-Side

**File:** `store.go:1365-1395`, `main.go:2060`
**CVSS:** 5.3

`GetEvents()` returns all events when no layer filter is specified, and the code comment says "Layer visibility filtering is done client-side":

```go
// If no specific layers requested, return all (master + all layers).
// Layer visibility filtering is done client-side.
```

**Impact:** An attacker can call the events API directly (bypassing the UI) to read events from private layers they shouldn't see. This undermines the entire layer permission model.

**Recommendation:** Enforce server-side layer visibility filtering. Never rely on client-side filtering for access control.

---

### H-05: Webhook URL SSRF via DNS Rebinding

**File:** `main.go:606-661`
**CVSS:** 5.9

The SSRF protection resolves DNS **before** connecting via `validateWebhookURL()`, but the actual connection through the HTTP transport resolves DNS **again**. A DNS rebinding attack can bypass this:

1. First DNS lookup (validation) resolves to a public IP → passes
2. By the time `DialContext` connects, DNS has been rebound to `127.0.0.1`

The `newSSRFSafeTransport()` at line 641 mitigates this by also checking at connection time, but there's still a TOCTOU window between the two resolution steps.

**Impact:** Attacker with DNS control can potentially reach internal services.

**Recommendation:** Remove the double-check pattern. Only use `newSSRFSafeTransport()` (which checks at connection time) and drop the pre-check `validateWebhookURL()` DNS resolution, or better: pin resolved IPs in the dialer.

---

### H-06: OIDC Discovery Endpoint Fetched Without SSRF Protection

**File:** `main.go:13350`
**CVSS:** 6.1

```go
resp, err := http.Get(discURL) //nolint:gosec
```

The OIDC discovery document is fetched using a bare `http.Get()` with no SSRF protection. An admin who configures a malicious issuer URL can force the server to make requests to internal services.

**Impact:** SSRF via admin-controlled OIDC configuration.

**Recommendation:** Use `newSSRFSafeTransport()` for all outbound HTTP requests, including OIDC discovery.

---

### H-07: No Session Invalidation on Password Change

**File:** `main.go:3138-3151`
**CVSS:** 5.4

When a user's password is changed (by self or admin), existing sessions are **not** invalidated:

```go
if req.Password != "" {
    existing.PasswordHash = string(hash)
    // No call to invalidate existing sessions for this user
}
```

**Impact:** A compromised session continues to be valid even after password reset, defeating the purpose of password changes in incident response scenarios.

**Recommendation:** Add `app.store.DeleteUserSessions(id)` after password changes and account blocking.

---

### H-08: Missing Password Quality Validation on `handleUpdateUser`

**File:** `main.go:3138-3151`
**CVSS:** 5.0

When updating a user's password via `handleUpdateUser`, there is **no** password quality policy enforcement:

```go
if req.Password != "" {
    // No call to validatePasswordQuality() — compare to handleRegister (line 1204) and handleResetPassword (line 1822)
    hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
```

**Recommendation:** Apply `validatePasswordQuality()` consistently in all password-setting paths.

---

## MEDIUM Findings

### M-01: `crypto/md5` and `crypto/sha1` Imported — Potential Weak Hash Usage

**File:** `main.go:10,12` (imports)

The codebase imports `crypto/md5` and `crypto/sha1`. While these may be used for non-security purposes (e.g., ETags, content fingerprinting), their presence warrants audit to confirm they are not used for authentication or integrity verification in security-critical contexts.

**Recommendation:** Audit all md5/sha1 call sites. Replace with SHA-256 where used for security-relevant hashing.

---

### M-02: Rate Limiter Has No Cleanup — Memory Exhaustion

**File:** `main.go:443-473`

The IP rate limiter stores buckets per IP address with no garbage collection for expired entries:

```go
type ipRateLimiter struct {
    mu      sync.Mutex
    buckets map[string]*rateBucket
}
```

**Impact:** An attacker sending requests from many distinct IPs can grow this map unboundedly, eventually exhausting server memory.

**Recommendation:** Add periodic cleanup of expired rate limit buckets (e.g., every 10 minutes, remove buckets older than 2x the window).

---

### M-03: CSRF Protection — `X-Requested-With` Header Only

**File:** `main.go:728-734`

CSRF protection relies solely on the `X-Requested-With` header combined with `SameSite=Lax` cookies. While generally effective for modern browsers, it has edge cases:
- `Lax` allows top-level navigations (GET requests) from cross-origin sites
- Some browser plugins/extensions can set custom headers on cross-origin requests
- `Strict` would be more appropriate for a security-focused application

**Recommendation:** Consider adding a synchronizer token pattern or switching cookies to `SameSite=Strict`.

---

### M-04: Logout Endpoint — Possible CSRF

The logout endpoint may not require the `X-Requested-With` header (if using `getSession()` directly rather than `requireAuth()`), potentially allowing CSRF-based forced logout via image/script tags.

**Recommendation:** Require POST method with CSRF protection for logout.

---

### M-05: API Key Role Hardcoded to `RoleReadWrite`

**File:** `main.go:12692-12697`

```go
u := &User{
    Role: RoleReadWrite, // conservative default — but unconfigurable
}
```

All API keys get the same role. Cannot create read-only API keys or restrict to specific endpoints.

**Impact:** Violates principle of least privilege. A compromised API key grants full read/write access.

**Recommendation:** Allow admins to specify role when creating API keys. Support scoped permissions.

---

### M-06: API Key Validation — O(N) Bcrypt Comparisons

**File:** `store.go:2950-2965`

Each API key validation iterates all stored keys performing expensive bcrypt comparisons. With N keys, every API request costs O(N) bcrypt operations (~100ms each).

**Impact:** Performance degrades linearly with number of API keys. Potential DoS vector.

**Recommendation:** Use HMAC-SHA256 with server-side secret for API key hashing (bcrypt is designed for passwords, not API keys). Or index by key prefix.

---

### M-07: Connector Credentials Stored as Plaintext JSON on Disk

**Files:** `connector_ldap.go:35`, `connector_jira.go`, `connector_stix.go`, `connector_gcal.go`

Integration credentials (LDAP bind passwords, Jira API tokens, TAXII API keys, Google OAuth tokens) are stored as plaintext in JSON files:

```go
BindPassword string `json:"bind_password,omitempty"`
```

**Impact:** File system access reveals all integration credentials.

**Recommendation:** Encrypt sensitive configuration fields at rest using the existing AES-GCM encryption infrastructure.

---

### M-08: Ingest API Creates Events Without XSS Sanitization

**File:** `ingest.go:289-340`

`processIngestPayload` creates events without applying `stripHTMLTags()` to title and description, unlike `handleCreateEvent` (line 2074):

```go
ev := Event{
    Title:       p.Title,        // Not sanitized
    Description: p.Description,  // Not sanitized
}
```

**Impact:** Stored XSS via ingested data if connectors ingest malicious content or external feeds are compromised.

**Recommendation:** Apply `stripHTMLTags()` to ingested title and description.

---

### M-09: `os.Exit(0)` Reachable via Admin API Endpoint

**File:** `main.go:6198-6201`

```go
go func() {
    time.Sleep(500 * time.Millisecond)
    os.Exit(0) // Supervisor/systemd should restart the process
}()
```

While admin-only, repeated calls could hit supervisor restart limits and permanently disable the service.

**Recommendation:** Add rate limiting for restart endpoint. Require re-authentication. Log and alert.

---

### M-10: Backup Encryption Strength Tied to Admin Password

**File:** `main.go:12983-13039`

Backup encryption key is derived from admin password hash via PBKDF2. If the admin uses the default `admin` password, the backup encryption is trivially breakable.

**Recommendation:** Warn if backup is requested while default credentials are active. Consider a separate backup passphrase.

---

## LOW Findings

### L-01: Session Cookie Missing `Domain` Attribute

**File:** `main.go:965-973`

No `Domain` attribute on session cookie. While browsers default to exact domain match, explicitly setting it prevents potential subdomain attacks.

---

### L-02: Password Reset Token Sent in URL Query Parameter

**File:** `main.go:1803`

Reset tokens in URLs leak via browser history, referer headers, and access logs.

**Recommendation:** Use POST-based token submission or fragment-based delivery (`#token=...`).

---

### L-03: Metrics Endpoint Exposes Internal State to All Authenticated Users

**File:** `main.go:6897-6903`, `metrics.go`

The `/metrics` endpoint requires authentication but allows any role to view detailed internal state (goroutine count, memory, event counts, user counts, SSE connections).

**Recommendation:** Restrict to admin role.

---

### L-04: OIDC Flow Cookies Use `SameSite=Lax` Instead of `Strict`

**File:** `main.go:13405-13451`

OIDC state/nonce/PKCE cookies should use `SameSite=Strict` as they should never be sent in cross-origin contexts.

---

### L-05: Sequential Integer IDs Enable Enumeration

**File:** `store.go` (various `nextXxxID++` patterns)

All entity IDs are sequential integers, making enumeration trivial for attackers.

**Recommendation:** Use UUIDs for externally-facing resources, particularly attachments.

---

### L-06: No Account Lockout After Failed Login Attempts

Failed login attempts are tracked (`LastFailedLoginAt`, `LastFailedLoginIP`) but no automatic lockout mechanism exists. IP-based rate limiting doesn't prevent distributed brute-force.

**Recommendation:** Implement progressive account lockout (5 failures → 15min lock, 10 → 1hr).

---

### L-07: LDAP Connector Is a Stub — Not Production-Ready

**File:** `connector_ldap.go:155-174`

The LDAP connector opens a TCP connection but doesn't perform actual LDAP bind authentication:

```go
// This is a simplified LDAP implementation.
// In production, use a proper LDAP library (e.g., go-ldap/ldap/v3).
```

**Impact:** If enabled, any password would be accepted. Must be clearly documented as not production-ready.

---

## INFORMATIONAL / Hardening Recommendations

### I-01: Add Content-Security-Policy `report-uri` Directive

The CSP header (line 5078) is well-configured but lacks `report-uri`/`report-to` for monitoring violations.

### I-02: Consider Subresource Integrity (SRI) for Static Assets

Static JS/CSS from `/static/` don't use SRI hashes. If the static directory is compromised, malicious scripts bypass CSP.

### I-03: Add `security.txt`

No `/.well-known/security.txt` endpoint exists for responsible disclosure.

### I-04: Enable Explicit CORS Headers

No explicit CORS policy is set. Adding `Access-Control-Allow-Origin` restricted to the application origin would add defense in depth.

### I-05: Consider Structured Logging

Current `log.Printf` with formatted strings. Structured JSON logging would improve SIEM integration and forensic analysis.

### I-06: Minimal Dependency Footprint — Maintain This

The `go.mod` has only one external dependency (`golang.org/x/crypto v0.48.0`). This is excellent for supply chain security. The minimal footprint significantly reduces the attack surface.

---

## Security Strengths Observed

The following security measures are well-implemented and should be maintained:

1. **Session tokens:** 256-bit entropy via `crypto/rand` — excellent
2. **Password hashing:** bcrypt with default cost (10) — industry standard
3. **API key storage:** bcrypt-hashed, shown once on creation — correct
4. **Timing attack protection:** Dummy bcrypt on unknown users, constant-time comparisons throughout
5. **SSRF protection:** DNS-resolution-based blocking on webhooks and reference downloads
6. **Security headers:** CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS
7. **Input sanitization:** HTML tag stripping, SMTP header injection prevention, LDAP filter escaping
8. **Rate limiting:** Applied to login, registration, password reset
9. **Audit logging:** Comprehensive action logging for forensic analysis
10. **Backup encryption:** AES-256-GCM with PBKDF2-SHA256 key derivation (100K iterations)
11. **PKCE for OIDC:** Implements code_challenge/code_verifier — prevents authorization code interception
12. **Blocked user session invalidation:** Sessions checked against user.Blocked on every request
13. **Restore allowlist:** Backup restore only allows whitelisted JSON files, excluding sensitive ones
14. **Constant-time invitation code comparison:** Prevents timing side-channel attacks
15. **X-Forwarded-For trust only from private IPs:** Prevents client IP spoofing from public internet

---

## Prioritized Remediation Roadmap

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | C-02: Path traversal in `/api/docs/user-manual` | Low | High |
| 2 | C-03: Default admin credentials | Medium | Critical |
| 3 | C-01: OIDC JWT signature verification | High | Critical |
| 4 | H-01: Attachment download IDOR | Medium | High |
| 5 | H-07: No session invalidation on password change | Low | High |
| 6 | H-08: Missing password validation in updateUser | Low | Medium |
| 7 | M-08: Ingest API missing XSS sanitization | Low | Medium |
| 8 | H-04: Client-side layer visibility filtering | Medium | High |
| 9 | H-03: bcrypt 72-byte truncation | Low | Medium |
| 10 | L-07: LDAP connector stub returns success | Medium | High (if used) |
| 11 | C-04: OIDC auto-enrollment default role | Low | High |
| 12 | H-05/H-06: SSRF via DNS rebinding / OIDC discovery | Medium | Medium |
| 13 | M-06: API key O(N) bcrypt validation | Medium | Medium |
| 14 | M-02: Rate limiter memory exhaustion | Low | Medium |
| 15 | M-07: Connector credentials plaintext storage | Medium | Medium |

---

*Assessment generated by automated security audit tooling. Manual penetration testing recommended to validate findings.*
