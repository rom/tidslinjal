# Security Vulnerability Assessment — Tidslinjal

**Date:** 2026-03-17
**Scope:** Full application audit (open-ended, no predefined scope)
**Target:** Go web application — timeline/event management tool

---

## Executive Summary

Four parallel security audits were conducted covering authentication & access control, input validation & injection, business logic & race conditions, and cryptography & network security. The application demonstrates generally solid security practices (bcrypt, crypto/rand, CSRF protection, SSRF-aware webhook transport, CSP headers, rate limiting). However, **27 unique findings** were identified, including 2 critical, 10 high, and 15 medium/low severity issues.

The most impactful findings are: (1) OIDC ID tokens are accepted without cryptographic signature verification, (2) the LDAP connector stub accepts any credentials, (3) blocked users retain active sessions, and (4) race conditions in the registration flow allow invitation code reuse and duplicate usernames.

---

## CRITICAL

### V-01: OIDC ID Token Signature Not Verified
- **File:** `main.go:13400-13461`
- **CWE:** CWE-345 (Insufficient Verification of Data Authenticity)
- **Description:** `validateIDToken()` decodes and checks JWT claims (issuer, audience, expiry, nonce) but **never verifies the cryptographic signature** against the provider's JWK keys. The code comment at line 13400 acknowledges this: *"without full JWK signature verification."*
- **Impact:** An attacker who can intercept/tamper with the token exchange response (MITM, compromised provider endpoint) can forge arbitrary ID tokens and authenticate as any user. Combined with OIDC auto-provisioning (line 13591), this enables full authentication bypass.
- **Remediation:** Fetch the provider's JWKS from the discovery document and verify the JWT signature before trusting claims. Consider using a battle-tested library like `github.com/coreos/go-oidc`.

### V-02: LDAP Connector Accepts Any Credentials (Authentication Bypass)
- **File:** `connector_ldap.go:131-186`
- **CWE:** CWE-287 (Improper Authentication)
- **Description:** The `Authenticate()` method establishes a TCP/TLS connection to the LDAP server but **never performs an LDAP bind or search operation**. It returns a successful result with the default role for any username/password combination. The comment at line 162 says: *"This is a simplified LDAP implementation."*
- **Impact:** If LDAP authentication is enabled in production, any credentials are accepted — complete authentication bypass.
- **Remediation:** Implement actual LDAP bind authentication using a proper library (e.g., `go-ldap/ldap/v3`). At minimum, add a prominent warning that LDAP auth is a stub and must not be enabled in production.

---

## HIGH

### V-03: Blocked/Unvetted Users Retain Active Sessions
- **File:** `main.go:687-702`
- **CWE:** CWE-613 (Insufficient Session Expiration)
- **Description:** `getSession()` validates the session token and expiry but does NOT check `user.Blocked` or `user.Vetted`. When an admin blocks a user, their existing sessions (24-hour lifetime) remain valid.
- **Impact:** Completely defeats user blocking as an incident response measure. A blocked user continues to have full access until session expiry.
- **Remediation:** Add `if user.Blocked { return nil, nil }` in `getSession()`. Also invalidate all sessions for a user when blocking them.

### V-04: Race Condition — Invitation Code Reuse (TOCTOU)
- **File:** `main.go:1229-1267`
- **CWE:** CWE-367 (Time-of-check Time-of-use)
- **Description:** In `handleRegister`, the invitation code is checked via `GetInvitationByCode` (acquires RLock, releases) and marked used via `MarkInvitationUsed` (acquires write lock, separate operation). Between these two operations, the lock is released. Two concurrent requests with the same code can both pass the validity check.
- **Impact:** Single-use invitation codes can be reused to register multiple unauthorized accounts.
- **Remediation:** Perform the check-and-mark-used as a single atomic operation under a write lock.

### V-05: Race Condition — Duplicate Username Registration (TOCTOU)
- **File:** `main.go:1215-1259`
- **CWE:** CWE-367 (Time-of-check Time-of-use)
- **Description:** Username uniqueness check (`GetUserByUsername`, RLock) and user creation (`CreateUser`, write lock) are separate operations. Two concurrent registrations with the same username can both pass the uniqueness check.
- **Impact:** Two users with the same username — causes authentication confusion and potential account hijacking.
- **Remediation:** Move uniqueness check inside `CreateUser` under the write lock, or add a unique constraint enforcement in the store.

### V-06: Invitation Code Timing Side-Channel
- **File:** `main.go:1224`
- **CWE:** CWE-208 (Observable Timing Discrepancy)
- **Description:** The generic invitation code is compared with Go's standard `!=` operator, which short-circuits on the first differing byte. Contrast with the password reset token (line 831) which correctly uses `subtle.ConstantTimeCompare`.
- **Impact:** An attacker can brute-force the generic invitation code character by character via timing analysis. Combined with V-07 (rate limiter bypass), this is practically exploitable.
- **Remediation:** Use `subtle.ConstantTimeCompare` for the generic invitation code comparison.

### V-07: Rate Limiter Bypass via X-Forwarded-For Spoofing
- **File:** `main.go:755-767`
- **CWE:** CWE-348 (Use of Less Trusted Source)
- **Description:** `clientIP()` trusts `X-Forwarded-For` and `X-Real-IP` headers unconditionally. Without a reverse proxy that strips these headers, any attacker can spoof a different IP on each request.
- **Impact:** Complete bypass of rate limiting on login (10/min), registration (5/min), and password reset (5/min). Enables brute-force attacks.
- **Remediation:** Add a configuration option for trusted proxy IPs. Only trust forwarded headers when the direct connection comes from a trusted proxy.

### V-08: SSRF in Digest Webhook Handler (Missing Validation)
- **File:** `main.go:11521`
- **CWE:** CWE-918 (Server-Side Request Forgery)
- **Description:** `handleSendDigest` accepts a `webhook_url` from the request body and passes it to `enqueueWebhook()` **without calling `validateWebhookURL()`**. Other handlers (preferences at line 1902, alarm creation at line 2839) correctly validate.
- **Impact:** Any authenticated user can make the server send POST requests to arbitrary internal URLs (e.g., cloud metadata endpoints).
- **Remediation:** Add `validateWebhookURL(req.WebhookURL)` before enqueueing.

### V-09: SSRF Bypass via DNS Rebinding in Reference URL Fetch
- **File:** `main.go:6210-6242`
- **CWE:** CWE-918 (Server-Side Request Forgery)
- **Description:** The SSRF protection uses string-based hostname prefix checks but the HTTP request uses the default client (no custom dialer). Vulnerable to DNS rebinding, IPv6 mapped addresses (`[::ffff:127.0.0.1]`), and decimal/octal IP notation. The webhook system (line 637-656) has proper IP-resolution-based protection — the reference fetch does not.
- **Impact:** Authenticated users with reference-creation privileges can access internal services.
- **Remediation:** Reuse the webhook system's custom transport with DNS-resolution-based IP validation.

### V-10: OIDC Username Not Validated
- **File:** `main.go:13564-13569`
- **CWE:** CWE-20 (Improper Input Validation)
- **Description:** Usernames from OIDC `preferred_username` or `email` claims are used directly without passing through `validateUsername()`. The local registration path validates at line 1195, but the OIDC path does not.
- **Impact:** A malicious IDP could return usernames with special characters, excessive length, or control characters — causing log injection or bypassing username-based access controls.
- **Remediation:** Apply `validateUsername()` (or equivalent sanitization) to OIDC-derived usernames.

### V-11: Backup Restore Can Overwrite Registration Configuration
- **File:** `main.go:13064-13095`
- **CWE:** CWE-862 (Missing Authorization for Resource)
- **Description:** The restore allowlist includes `registration.json` and `invitations.json`. A crafted backup can set `registration.json` to `{"mode":"open"}` to enable open registration, or inject pre-validated invitation codes.
- **Impact:** An admin with backup-restore access can reopen registration or inject invitation codes. Relevant in scenarios with compromised admin accounts or social engineering.
- **Remediation:** Exclude `registration.json` from restore, or require explicit confirmation for security-sensitive config changes during restore.

### V-12: Missing Role Validation in Admin User Update
- **File:** `main.go:3131-3134`
- **CWE:** CWE-20 (Improper Input Validation)
- **Description:** `handleUpdateUser` sets `existing.Role = req.Role` without validating against the allowed roles whitelist. `handleCreateUser` (lines 3046-3055) correctly validates.
- **Impact:** An admin can set arbitrary role strings, causing unpredictable behavior.
- **Remediation:** Add the same role validation whitelist from `handleCreateUser`.

---

## MEDIUM

### V-13: Ingest API Has No Role Restriction
- **File:** `main.go:6375-6377`
- **CWE:** CWE-862 (Missing Authorization)
- **Description:** `/api/ingest` only requires `requireAuth` — any authenticated user including `observer` and `read` roles can ingest events, bypassing the `requireRole(RoleReadWrite)` check on `POST /api/events`.
- **Remediation:** Change to `requireRole(RoleReadWrite, app.handleIngest)`.

### V-14: Layer Creation Has No Role Restriction
- **File:** `main.go:5376-5378`
- **CWE:** CWE-862 (Missing Authorization)
- **Description:** Any authenticated user can create layers via `POST /api/layers`, contradicting the read-only role model.
- **Remediation:** Add `requireRole(RoleReadWrite, ...)` or higher.

### V-15: Path Traversal in User Manual `lang` Parameter
- **File:** `main.go:5098-5109`
- **CWE:** CWE-22 (Path Traversal)
- **Description:** The `lang` query parameter is inserted into a file path without sanitization: `fmt.Sprintf("docs/USER_MANUAL_%s.md", strings.ToUpper(lang))`. While constrained by `os.Stat` check and `.md` suffix, `../` sequences still resolve.
- **Remediation:** Validate `lang` against an allowlist of known language codes, or strip path separators.

### V-16: Jira JQL Injection
- **File:** `connector_jira.go:83-88`
- **CWE:** CWE-943 (Improper Neutralization of Special Elements in Data Query Logic)
- **Description:** `cfg.Project` is inserted directly into a JQL query without escaping or URL-encoding. Admin-configurable only.
- **Remediation:** URL-encode JQL parameters and escape special characters in project names.

### V-17: Password Reset Token Logged in Plaintext
- **File:** `main.go:1797`
- **CWE:** CWE-532 (Insertion of Sensitive Information into Log File)
- **Description:** When SMTP is not configured, the reset token is logged via `log.Printf`. If syslog forwarding is enabled (especially over non-TLS), this token can be intercepted.
- **Remediation:** Consider writing tokens to a separate secure admin-only channel rather than general logging.

### V-18: Syslog TLS Certificate Verification Disabled by Default
- **File:** `main.go:227`
- **CWE:** CWE-295 (Improper Certificate Validation)
- **Description:** `InsecureSkipVerify: !sw.cfg.TLSVerify` — since `TLSVerify` defaults to `false`, syslog TLS connections skip certificate verification by default.
- **Remediation:** Default `TLSVerify` to `true`.

### V-19: `go test` Execution via Admin Endpoint
- **File:** `store.go:4279-4282`
- **CWE:** CWE-94 (Improper Control of Generation of Code)
- **Description:** `GET /api/admin/test-stats` runs `exec.CommandContext(ctx, "go", "test", ...)` which compiles and runs all Go test code. Admin-only but represents code execution.
- **Remediation:** Remove this endpoint from production builds or gate behind an explicit development-mode flag.

### V-20: Connector SSRF (Admin-only)
- **Files:** `connector_stix.go`, `connector_jira.go`, `connector_gcal.go`, `connector_github.go`
- **CWE:** CWE-918 (Server-Side Request Forgery)
- **Description:** Connector configurations accept arbitrary URLs fetched without private-IP validation, unlike the webhook system.
- **Remediation:** Apply the same SSRF-aware transport used by the webhook system.

### V-21: Login Endpoint Missing CSRF Protection (Login CSRF)
- **File:** `main.go:872`
- **CWE:** CWE-352 (Cross-Site Request Forgery)
- **Description:** `handleLogin` is not wrapped in the CSRF check (`X-Requested-With` header). An attacker can force a victim to authenticate to an attacker-controlled account.
- **Remediation:** Require `X-Requested-With` on the login endpoint.

### V-22: Email Wipe on Non-Admin Self-Edit
- **File:** `main.go:3130`
- **CWE:** CWE-20 (Improper Input Validation)
- **Description:** `existing.Email = req.Email` is applied unconditionally. If a non-admin user omits `email` from their profile update JSON, it decodes as empty string, wiping their email.
- **Remediation:** Only update email if explicitly provided (check for zero-value or use a pointer field).

---

## LOW / INFORMATIONAL

### V-23: Blocked User Check After Password Verification
- **File:** `main.go:902-922`
- **Description:** Login verifies the password before checking if the user is blocked. Different error messages confirm correct credentials to an attacker.

### V-24: Session Tokens Persisted in Plaintext on Disk
- **File:** `store.go:1713-1719`
- **Description:** `sessions.json` stores session IDs in cleartext. File-system access compromises all active sessions.

### V-25: Secrets Stored in Plaintext on Disk
- **File:** `store.go:184-213`
- **Description:** `oidc.json` (client secret), `mail.json` (SMTP password), `connectors.json` (API tokens) are stored as plaintext JSON. Data directory is 0700 but no application-level encryption.

### V-26: UserPublic Exposes LastFailedLoginIP
- **File:** `models.go:167-168`
- **CWE:** CWE-200 (Information Exposure)
- **Description:** `UserPublic` struct includes `LastFailedLoginIP`, leaking IP addresses of failed login attempts to any authenticated user.

### V-27: innerHTML Usage in Frontend JavaScript
- **Files:** `static/admin.js`, other JS files
- **CWE:** CWE-79 (Cross-Site Scripting)
- **Description:** Admin panel uses `innerHTML` with template literals containing user data. CSP (`script-src 'self'`) mitigates script injection, but HTML injection (phishing, UI redress) remains possible with inconsistent escaping.

---

## Positive Security Observations

The codebase demonstrates several strong security practices:

- **Password hashing:** bcrypt with default cost
- **Session tokens:** 256-bit entropy from `crypto/rand`
- **Timing-safe comparisons:** Used for password reset tokens, WebCal tokens, OIDC state
- **Dummy bcrypt on unknown users:** Prevents user enumeration via login timing
- **CSRF protection:** `X-Requested-With` header required on state-changing requests
- **XSS sanitization:** `stripHTMLTags()` applied at write time across ~20 input fields
- **CSP headers:** `script-src 'self'` blocks inline script injection
- **HSTS:** Enabled when TLS is active
- **Rate limiting:** Login (10/min), registration (5/min), password reset (5/min)
- **Webhook SSRF protection:** Custom `DialContext` with DNS-resolution-based private IP blocking
- **Path traversal protection:** `filepath.Base()` on file uploads
- **Request body size limits:** 1 MB JSON, 25 MB attachments
- **PKCE:** Used for OIDC authentication flow
- **Audit logging:** Comprehensive audit trail for security-relevant actions
- **Backup excludes sessions:** `sessions.json` excluded from backup export

---

## Recommended Priority

| Priority | Findings | Effort |
|----------|----------|--------|
| **P0 — Fix immediately** | V-01 (OIDC sig), V-02 (LDAP stub), V-03 (blocked sessions) | Medium |
| **P1 — Fix before next release** | V-04/V-05 (race conditions), V-06 (timing), V-07 (rate limiter), V-08/V-09 (SSRF) | Medium |
| **P2 — Fix soon** | V-10 (OIDC username), V-12 (role validation), V-13/V-14 (missing role checks), V-15 (path traversal) | Low |
| **P3 — Harden** | V-16 through V-27 | Low |
