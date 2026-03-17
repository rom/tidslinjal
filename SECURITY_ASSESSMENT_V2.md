# Tidslinjal Security Vulnerability Assessment v2

**Date**: 2026-03-17
**Threat Model**: Nation-state adversary with advanced skills, substantial time, and resources
**Scope**: Full application — authentication, authorization, data handling, network, cryptography, concurrency, infrastructure
**Application**: Go web application (military C2 timeline tool) — single-binary, JSON file-backed store

---

## Executive Summary

This second assessment was conducted after an initial round of security fixes. The application has significantly improved — OIDC JWKS verification is now implemented, CSRF protection covers login, rate limiters have cleanup, and many IDOR issues were addressed. However, **critical gaps remain in layer-based access control across multiple data paths**, and several new findings emerge from deeper analysis of session management, SSE broadcasting, export endpoints, and concurrency handling.

**Finding breakdown**: 5 High, 12 Medium, 8 Low, 6 Informational = **31 findings total**

---

## Critical & High Severity Findings

### H-01: SSE Broadcasts Leak Private Layer Events to All Users

**Location**: `main.go:533-539` (`broadcastEventChange`) and all `BroadcastAll` calls
**Severity**: **HIGH**
**CVSS**: 7.5

`broadcastEventChange` sends the full event JSON (including title, description, all fields) to every connected SSE client via `Broadcast()`. There is no filtering by layer visibility. A user on a `read` role who is not a member of a private layer's groups will still receive real-time updates for events created, updated, or deleted on that layer.

This effectively nullifies the entire layer visibility system for any user with an open SSE connection.

**Attack scenario**: Attacker opens an SSE connection (`/api/sse`), then passively receives all event changes across all layers, including classified or compartmented layers they have no access to.

**Remediation**: Before broadcasting event changes, check each SSE client's layer visibility. Either:
- Filter per-client at broadcast time (checking `canReadLayer` for the event's layer)
- Or send a generic "refresh" notification and let the client re-fetch (with proper server-side filtering)

---

### H-02: Export Endpoints Bypass Layer Visibility (ICS, XLSX, STIX, Reports)

**Location**:
- `main.go:4797` — ICS export: `app.store.GetEventsInRange(from, to)` — **no layer filter**
- `main.go:8009` — XLSX export: `app.store.GetEvents(from, to, nil)` — **no layer filter**
- `connector_stix.go:259` — STIX export: `app.store.GetEventsInRange(...)` — **no layer filter**
- `main.go:7476` — Report download: `app.store.GetEvents(from, to, nil)` — **no layer filter**
- `main.go:7602` — Auto-report email: `app.store.GetEvents(...)` — **no layer filter**
- `main.go:10871` — Stats export: `app.allEvents()` — **no layer filter, only requireAuth**
- `main.go:13393` — WebCal: delegates to ICS export — **no layer filter, token-authenticated**

**Severity**: **HIGH**
**CVSS**: 7.5

While `handleGetEvents` (the primary event listing API) was fixed to filter by visible layers, all export endpoints still return every event regardless of the requesting user's layer access. Any authenticated user can export the entire event database including private/group-restricted layer events.

**Attack scenario**: A `read`-role user who shouldn't see classified layer data hits `/api/export/ics` or `/api/export/xlsx` and gets every event in the system.

**Remediation**: Apply the same `visibleLayerIDs` filtering logic used in `handleGetEvents` to all export handlers. Create a shared helper like `app.getVisibleEvents(user, from, to)` to prevent future divergence.

---

### H-03: Comments and Attachments Listed Without Layer Access Check

**Location**:
- `main.go:2496-2513` — `handleGetAttachments`: returns all attachments for any event ID
- `main.go:4212-4228` — `handleGetComments`: returns all comments for any event ID

**Severity**: **HIGH**
**CVSS**: 6.5

Both handlers take an event ID from the URL path and return associated data without checking whether the requesting user can read the event's layer. While attachment download (`handleDownloadAttachment`) was fixed with a `canReadLayer` check, the listing endpoint was not. An attacker can enumerate event IDs (sequential integers) and read all comments/attachments metadata for events on private layers.

**Attack scenario**: Iterate through `/api/events/1/comments`, `/api/events/2/comments`, etc. to read all comments including those on restricted layers. Comments often contain operational details more sensitive than the event titles themselves.

**Remediation**: Add `canReadLayer` check at the start of both handlers, similar to the fix in `handleDownloadAttachment`.

---

### H-04: handleUpdateEvent Missing Layer Write Check

**Location**: `main.go:2314-2317`
**Severity**: **HIGH**

The update handler checks `existing.CreatedBy != user.ID && !hasRole(user.Role, RoleReadWrite)` but never calls `canWriteLayer`. A user with `RoleReadWrite` can modify events on any private layer, even ones they have no group membership for. Compare with `handleCreateEvent` (line 2233) which correctly calls `canWriteLayer`.

**Attack scenario**: A `readwrite` user not in any groups modifies events on a group-restricted private layer.

**Remediation**: Add `canWriteLayer` check when `existing.LayerID != nil`, matching the pattern in `handleCreateEvent`.

---

### H-05: Sessions Not Invalidated After Self-Service Password Change

**Location**: `main.go:1130-1189` (`handleChangePassword`)
**Severity**: **HIGH**

The self-service password change endpoint updates the password hash but does not call `app.store.DeleteSessionsForUser(user.ID)`. The admin endpoint `handleUpdateUser` (line 3317) correctly invalidates sessions. This means a compromised session persists even after the victim changes their password.

Similarly, `handleResetPassword` (line 1905-1958, the forgot-password token flow) also does not invalidate existing sessions.

**Attack scenario**: Attacker steals a session cookie. Victim changes password. Attacker retains access for up to 24 hours.

**Remediation**: Add `app.store.DeleteSessionsForUser(user.ID)` to both `handleChangePassword` and `handleResetPassword`, matching the pattern in `handleUpdateUser`.

---

## Medium Severity Findings

### M-01: OIDC JWT Algorithm Confusion (HMAC Accepted Alongside JWKS)

**Location**: `main.go:13805-13826` (`validateIDToken`)
**Severity**: **MEDIUM**

The token validator accepts HMAC-based algorithms (HS256/384/512) using the client secret, AND RSA/EC algorithms using JWKS. It does not enforce which algorithm the provider is expected to use. If the provider uses RS256 but the client secret is weak, an attacker who knows the secret can forge tokens using `alg: HS256`.

The OIDC spec recommends that clients only accept the algorithm the provider is known to use.

**Remediation**: After fetching JWKS, determine the provider's expected algorithm family. If the JWKS contains RSA/EC keys, reject HMAC tokens. Store the expected algorithm in `OIDCConfig`.

---

### M-02: OIDC Discovery SSRF — No Private IP Filtering

**Location**: `main.go:13543` and `main.go:1543`
**Severity**: **MEDIUM**

`configureOIDC` and the OIDC test endpoint use `http.Get(discURL)` with the default HTTP client, which has no SSRF protection. The token endpoint call (`http.PostForm`, line 14014) and userinfo fetch (`http.DefaultClient.Do`, line 14043) also use unprotected clients. While these URLs come from the admin-configured issuer, a compromised admin account can use them for SSRF against cloud metadata endpoints or internal services.

The webhook system uses `newSSRFSafeTransport()` — the same protection should apply here.

**Remediation**: Use `newSSRFSafeTransport()` for OIDC discovery, token exchange, and userinfo fetches.

---

### M-03: OIDC PKCE and Nonce Not Required (Graceful Degradation to No Protection)

**Location**: `main.go:13977-13990`
**Severity**: **MEDIUM**

The OIDC callback silently falls through if the PKCE cookie or nonce cookie is missing. If `oidc_pkce` is absent, `codeVerifier` is `""` and the token exchange proceeds without PKCE. If `oidc_nonce` is absent, `expectedNonce` is `""` and the nonce check is skipped (line 13954: `if expectedNonce != "" && ...`).

A network attacker who strips cookies can downgrade the OIDC flow.

**Remediation**: Require both cookies to be present; reject the callback with an error if either is missing.

---

### M-04: handleDeleteEvent Missing Layer Access Check

**Location**: `main.go:2476`
**Severity**: **MEDIUM**

`handleDeleteEvent` only checks `existing.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin)`. An admin can delete events on any layer (which may be acceptable), but there's no `canWriteLayer` check for non-admin users who created the event — a user who created an event then lost group access could still delete it.

**Remediation**: Add `canWriteLayer` check when `existing.LayerID != nil` and the user is not an admin.

---

### M-05: Logout Endpoint Accepts GET (CSRF Logout)

**Location**: `main.go:1079-1093` — route at line 5473
**Severity**: **MEDIUM**

`handleLogout` has no method check and is not wrapped by `requireAuth`, so CSRF protection (X-Requested-With header check) does not apply. A `<img src="/api/auth/logout">` on any page will silently log the user out. In a military C2 context, forced logout during operations is a denial-of-service concern.

**Remediation**: Restrict to POST and wrap with `requireAuth` to enforce CSRF header check.

---

### M-06: Webhook Payloads Include Full Event Data Without Layer Filtering

**Location**: `main.go:542` (`go app.fireWebhooks(action, ev)`)
**Severity**: **MEDIUM**

`broadcastEventChange` fires webhooks with full event data for all events. Webhook URLs are configured per-user. If a user configures a webhook and another user creates an event on a private layer, the webhook may send the full event content to the first user's endpoint.

**Remediation**: Check whether the webhook owner has `canReadLayer` access before including the event in the payload.

---

### M-07: Webhook HTTP Client Follows Redirects (SSRF Bypass Vector)

**Location**: `main.go:722` (`runWebhookWorker`)
**Severity**: **MEDIUM**

The webhook `http.Client` (line 722) has no `CheckRedirect` function set. While the custom `DialContext` in `newSSRFSafeTransport()` blocks connections to private IPs at dial time, the client follows HTTP 302/307 redirects by default. An attacker could set a webhook to `https://evil.com/redirect` which passes SSRF validation (public IP), then `evil.com` returns a redirect to `http://internal-service:8080/`. The safe transport's DialContext should block this at connection time, but adding an explicit redirect policy provides defense-in-depth.

**Remediation**: Set `CheckRedirect` on the webhook client to re-validate each redirect URL against private IP ranges, or disable redirects entirely for webhooks.

---

### M-08: Session Tokens and Password Reset Tokens Stored in Plaintext on Disk

**Location**: `store.go` — sessions.json, users.json (reset tokens)
**Severity**: **MEDIUM**

Session IDs are stored in plaintext in `sessions.json`. Password reset tokens are stored directly in user records. If an attacker gains filesystem read access (e.g., via a backup leak, LFI, or compromised adjacent service), they get all active sessions.

**Remediation**: Store only SHA-256 hashes of session tokens and reset tokens. Compare using `subtle.ConstantTimeCompare` on the hash.

---

### M-09: OIDC Discovery Issuer Not Validated

**Location**: `main.go:13536-13562`
**Severity**: **MEDIUM**

`configureOIDC` fetches the discovery document but does not verify that the `issuer` field in the returned JSON matches the configured issuer URL. Per OpenID Connect Discovery spec §4.3, the client MUST verify this. A compromised or redirected discovery endpoint could return token/userinfo endpoints pointing to an attacker-controlled server.

**Remediation**: After decoding the discovery document, verify `cfg.Issuer == issuer`.

---

### M-10: No Concurrent Session Limit / No Session Limit Per User

**Location**: `main.go:1028-1046`
**Severity**: **MEDIUM**

There is no limit on active sessions per user. Each login creates a new 24-hour session. An attacker with stolen credentials can create unlimited sessions, making it hard to revoke all access even if the password is changed (unless `DeleteSessionsForUser` is called).

**Remediation**: Limit to N concurrent sessions per user (e.g., 10). On new login, if the limit is reached, either reject or expire the oldest session.

---

### M-11: No SSE Connection Limit Per User/IP

**Location**: `main.go:334-345` (`SSEBroker.Subscribe`)
**Severity**: **MEDIUM**

There is no limit on concurrent SSE connections per user or per IP. Each SSE connection holds a goroutine and two buffered channels. An attacker with a single session can open thousands of SSE connections, exhausting server goroutines and file descriptors.

**Remediation**: Limit to 5 SSE connections per user and 20 per IP. Drop oldest connection when limit is exceeded.

---

### M-12: Connector Config API Returns Secrets in Plaintext

**Location**: Connector config GET endpoint
**Severity**: **MEDIUM**

The connector config GET endpoint returns raw `Config` JSON which may contain API keys, tokens, and passwords for GitHub, Jira, Google Calendar, and STIX connectors. While admin-only, secrets should be masked in API responses.

**Remediation**: Strip or mask secret fields (api_key, token, password) in connector config GET responses, similar to how OIDC client_secret is masked.

---

## Low Severity Findings

### L-01: `handleUploadAttachment` Missing Layer Write Check

**Location**: `main.go:2515`
**Severity**: **LOW**

The upload handler extracts the event ID from the path and saves an attachment without verifying the user has write access to the event's layer. However, since it does require authentication, the risk is limited to authenticated users uploading to events on layers they shouldn't write to.

**Remediation**: Add `canWriteLayer` check similar to `handleCreateEvent`.

---

### L-02: `handleCreateComment` Missing Layer Write Check

**Location**: `main.go:4231`
**Severity**: **LOW**

Similar to L-01. Comments can be added to any event by any authenticated user without checking layer write access.

**Remediation**: Add layer visibility/write check before creating the comment.

---

### L-03: Auto-Report Email Includes All Events

**Location**: `main.go:7602`
**Severity**: **LOW**

The automated report email system sends reports containing all events without layer filtering. Since the recipient is configured by an admin, the risk is contextual, but it may leak restricted-layer data to recipients who shouldn't see it.

**Remediation**: Filter events by the report recipient's layer visibility.

---

### L-04: API Key Validation O(N) Bcrypt with Timing Side-Channel

**Location**: `store.go:2950-2976`
**Severity**: **LOW**

`ValidateAPIKey` iterates all API keys with bcrypt comparison. The number of keys is leaked via timing — first key is validated faster than the last. Minor given bcrypt's inherent protection.

**Remediation**: Consider HMAC-based key validation or a hash-indexed lookup.

---

### L-05: OIDC Callback Uses `r.RemoteAddr` Instead of `clientIP(r)`

**Location**: `main.go:14183`
**Severity**: **LOW**

The OIDC login tracking at line 14183 uses raw `r.RemoteAddr` while the normal login handler correctly uses `clientIP(r)`. Behind a reverse proxy, OIDC logins will show the proxy's address.

**Remediation**: Replace with `clientIP(r)`.

---

### L-06: `handleDeleteAttachment` Does Not Check Layer Write Permission

**Location**: `main.go:2615-2666`
**Severity**: **LOW**

The attachment delete handler checks `canReadLayer` (from the previous fix) but not `canWriteLayer`. A user with read-only access to a layer can delete attachments on that layer's events.

**Remediation**: Change to `canWriteLayer` check, or additionally require that the user is the attachment uploader or an admin.

---

### L-07: OIDC Routes Not Registered Dynamically

**Location**: `main.go:5957-5962`
**Severity**: **LOW**

OIDC routes (`/auth/oidc/login`, `/auth/oidc/callback`) are only registered at startup if `app.oidc != nil`. If OIDC is configured at runtime via admin panel, the routes don't exist until restart. An admin may believe SSO is active when it isn't.

**Remediation**: Always register the routes; have handlers check `app.oidc != nil` at request time.

---

### L-08: `handleGetEventHistory` Missing Layer Access Check

**Location**: `main.go:5566-5569`
**Severity**: **LOW**

Event version history is accessible for any event ID without layer visibility check. Exposes change history of events on restricted layers.

**Remediation**: Add `canReadLayer` check.

---

## Informational Findings

### I-01: MD5 and SHA-1 Used for Attachment Checksums

**Location**: Various attachment handlers
**Severity**: **INFO**

MD5 and SHA-1 are computed alongside SHA-256/512 for file checksums. Not used for security purposes (deduplication/integrity only), but auditors may flag it.

---

### I-02: `SkipVerify` Option in LDAP Configuration

**Location**: `connector_ldap.go:31`
**Severity**: **INFO**

LDAP config includes `skip_verify` to disable TLS certificate verification. LDAP is currently a stub, but when implemented, this option should be removed or restricted to development environments.

---

### I-03: Registration Mode "open" Auto-Vets Users

**Location**: `main.go:1348`
**Severity**: **INFO**

When registration mode is "open", users are immediately vetted (`vetted := rs.Mode != "vetted"`). This is by design but worth noting — an admin mistakenly setting "open" mode exposes the system to unauthenticated account creation.

---

### I-04: `style-src 'unsafe-inline'` in CSP

**Location**: `main.go:5247`
**Severity**: **INFO**

The Content-Security-Policy includes `style-src 'self' 'unsafe-inline'` which weakens CSS injection protection. Inline styles are needed for the current frontend but should be migrated to external stylesheets.

---

### I-05: No Request Size Limit on Multipart Forms

**Location**: Various `ParseMultipartForm` calls
**Severity**: **INFO**

While `decode()` limits JSON bodies to 1MB, multipart form uploads vary: 10MB for imports, 20MB for attachments, 64MB for backup restore. These are reasonable but should be documented and reviewed.

---

### I-06: Backup Encryption Key Derived from Admin Password Hash

**Location**: `main.go:13269`, `store.go:1017`
**Severity**: **INFO**

Backup encryption uses the admin account's bcrypt hash as PBKDF2 key material. If the admin password is changed, old encrypted backups become undecryptable (no key rotation mechanism). Additionally, if the admin password is weak, the backup encryption is proportionally weak.

---

## Security Hardening Recommendations

### Architecture

1. **Centralize layer visibility enforcement**: Create a single function like `app.getVisibleEvents(user, from, to)` that all handlers, exports, broadcasts, and webhooks use. The current approach of individually fixing each endpoint is error-prone.

2. **Move to middleware-based authorization**: Instead of checking roles inside handlers, use route-level middleware that declares required permissions. This makes it easier to audit and prevents forgotten checks.

3. **Add integration tests for layer isolation**: Create tests that verify a user without layer access cannot read events, comments, attachments, exports, or SSE broadcasts from that layer.

### Authentication & Sessions

4. **Hash session tokens at rest**: Store `SHA-256(sessionID)` in sessions.json. Compare with hash on lookup. This prevents mass session theft via file disclosure.

5. **Implement session limits**: Cap concurrent sessions per user (e.g., 10). Provide a "terminate all sessions" button in the UI.

6. **Pin OIDC algorithm**: When JWKS contains RSA/EC keys, reject HMAC tokens. This prevents algorithm confusion attacks.

7. **Require PKCE and nonce**: Make both mandatory in the OIDC callback. Fail loudly if cookies are missing.

### Network Security

8. **Apply SSRF protection to all outbound HTTP**: Use `newSSRFSafeTransport()` for OIDC discovery, token exchange, and userinfo endpoints — not just webhooks.

9. **Add `Secure` cookie flag detection for reverse proxy**: Detect `X-Forwarded-Proto: https` and set `Secure` flag accordingly, or add a CLI flag `--behind-https-proxy`.

10. **Rate limit SSE connections**: Limit concurrent SSE connections per user (e.g., 5) and per IP (e.g., 20) to prevent resource exhaustion.

### Data Protection

11. **Encrypt sensitive JSON files at rest**: At minimum, `sessions.json` and `users.json` (which contains password hashes) should be encrypted or have restricted filesystem permissions enforced.

12. **Add backup key rotation**: Allow re-encrypting backups when the admin password changes, or use a separate dedicated backup encryption key.

### Monitoring & Audit

13. **Audit all export operations with scope**: Log which user exported what data, including whether layer filtering was applied.

14. **Alert on anomalous session patterns**: Multiple concurrent sessions from different IPs for the same user should trigger an alert.

15. **Add security event logging for OIDC**: Log algorithm used, kid, issuer match results, and PKCE/nonce presence for each OIDC authentication.

---

## Summary Table

| ID | Severity | Category | Finding |
|----|----------|----------|---------|
| H-01 | HIGH | AuthZ | SSE broadcasts leak private layer events to all users |
| H-02 | HIGH | AuthZ | Export endpoints (ICS/XLSX/STIX/Reports) bypass layer visibility |
| H-03 | HIGH | AuthZ | Comments and attachments listed without layer access check |
| H-04 | HIGH | AuthZ | handleUpdateEvent missing layer write check |
| H-05 | HIGH | AuthN | Sessions not invalidated after self-service password change/reset |
| M-01 | MEDIUM | Crypto | OIDC JWT algorithm confusion (HMAC alongside JWKS) |
| M-02 | MEDIUM | SSRF | OIDC discovery/token/userinfo use unprotected HTTP client |
| M-03 | MEDIUM | AuthN | OIDC PKCE and nonce not required |
| M-04 | MEDIUM | AuthZ | handleDeleteEvent missing layer access check |
| M-05 | MEDIUM | CSRF | Logout endpoint accepts GET (CSRF logout) |
| M-06 | MEDIUM | AuthZ | Webhook payloads include events from all layers |
| M-07 | MEDIUM | SSRF | Webhook HTTP client follows redirects without re-validation |
| M-08 | MEDIUM | Data | Session/reset tokens stored in plaintext on disk |
| M-09 | MEDIUM | AuthN | OIDC discovery issuer not validated |
| M-10 | MEDIUM | AuthN | No concurrent session limit |
| M-11 | MEDIUM | DoS | No SSE connection limit per user/IP |
| M-12 | MEDIUM | Data | Connector config API returns secrets in plaintext |
| L-01 | LOW | AuthZ | handleUploadAttachment missing layer write check |
| L-02 | LOW | AuthZ | handleCreateComment missing layer write check |
| L-03 | LOW | AuthZ | Auto-report email includes all events |
| L-04 | LOW | Crypto | API key validation O(N) bcrypt timing |
| L-05 | LOW | Logging | OIDC callback uses r.RemoteAddr not clientIP |
| L-06 | LOW | AuthZ | handleDeleteAttachment checks read not write |
| L-07 | LOW | Config | OIDC routes not registered dynamically |
| L-08 | LOW | AuthZ | handleGetEventHistory missing layer access check |
| I-01 | INFO | Crypto | MD5/SHA-1 used for attachment checksums |
| I-02 | INFO | Config | SkipVerify in LDAP config |
| I-03 | INFO | AuthN | Open registration auto-vets users |
| I-04 | INFO | Headers | unsafe-inline in style-src CSP |
| I-05 | INFO | DoS | Multipart form size limits vary |
| I-06 | INFO | Crypto | Backup encryption tied to admin password |

---

## What the Application Does Well

The codebase demonstrates strong security awareness:

- **Atomic file writes**: `saveJSON` uses write-to-temp then rename — prevents corruption on crash
- **SSRF-safe transport**: Webhooks and reference fetches use DNS-resolution-based blocking with `newSSRFSafeTransport`
- **X-Forwarded-For trust scoping**: `clientIP` only trusts proxy headers from private/loopback addresses
- **CSRF protection**: X-Requested-With header check on all state-changing requests in `requireAuth`, including login
- **Progressive account lockout**: 5→15min, 10→1hr, 20→4hr with reset on success
- **OIDC hardening**: PKCE, nonce, state parameter, `alg: none` rejection, JWKS verification for RSA/EC/PSS
- **XSS prevention**: `stripHTMLTags` on event fields, strong CSP with `script-src 'self'`
- **Body size limits**: 1MB JSON, bounded file uploads
- **Timing-safe comparisons**: Used for sessions, tokens, OIDC state, invitation codes
- **Dummy bcrypt on unknown users**: Prevents user enumeration via login timing
- **Random admin password**: Generated on first run with forced change
- **Secure cookie defaults**: HttpOnly, SameSite=Lax, Secure when HTTPS
- **Security headers**: X-Frame-Options DENY, HSTS, X-Content-Type-Options nosniff, Referrer-Policy
- **Backup encryption**: AES-256-GCM with PBKDF2-derived key
- **Path traversal prevention**: `filepath.Base` used consistently on user-supplied filenames
- **LDAP filter escaping**: `escapeLDAPFilter` prevents injection
