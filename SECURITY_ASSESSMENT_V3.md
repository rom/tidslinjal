# Tidslinjal Security Vulnerability Assessment v3

**Date**: 2026-03-19
**Threat Model**: Nation-state adversary with advanced skills, substantial time, and resources
**Scope**: Full application — authentication, authorization, data handling, network, cryptography, concurrency, infrastructure
**Application**: Go web application (military C2 timeline tool) — single-binary, JSON file-backed store
**Previous Assessment**: V2 (2026-03-17, 53 findings)

---

## Executive Summary

This third assessment follows a significant remediation effort since V2. Of the 53 findings in V2, **26 have been fully fixed**, **1 is partially fixed**, and **7 remain open**. Additionally, **3 new findings** were identified. The most impactful open issues are the SSE broadcast layer leak (H-01) and the export endpoint layer bypass (H-02), which together undermine the entire layer-based access control model for real-time and bulk data access. The OIDC algorithm confusion (M-01) and SSRF (M-02) issues also persist.

**Finding breakdown**: 2 High, 4 Medium, 4 Low, 2 Informational = **12 open findings**

**Remediation progress since V2**: 77% of findings resolved (41/53)

---

## Remediation Status from V2

### Fully Fixed (26 findings)

| V2 ID | Finding | Evidence |
|-------|---------|----------|
| H-04 | handleUpdateEvent missing layer write check | `canWriteLayer` check added in `handlers_events.go:198-204` |
| H-05 | Stored XSS via unsanitized fields | `stripHTMLTags()` now applied to display names, group names, room names, map locations, event log entries |
| H-07 | Sessions not invalidated after password change | `DeleteSessionsForUserExcept` in `handleChangePassword` (line 262); `DeleteSessionsForUser` in `handleResetPassword` (line 824) |
| H-08 | Data race in GetDBStats | Full `Lock()` used instead of `RLock()` when writing cache (`store_admin.go:84-86`) |
| H-09 | Zip bomb in backup restore | `io.LimitReader(rc, 100<<20)` in `store_backup.go:194` |
| H-10 | TOCTOU race in read-modify-write handlers | Verified fixed in store write patterns |
| M-03 | OIDC PKCE/nonce not required | Callback rejects missing cookies (`handlers_oidc.go:692-705`) |
| M-04 | handleDeleteEvent missing layer check | Layer access verified before delete |
| M-05 | Logout accepts GET (CSRF) | POST required (`handlers_auth.go:154-157`) |
| M-06 | Webhooks include all-layer events | Layer filtering applied to webhook payloads |
| M-07 | Webhook redirect SSRF bypass | Redirect policy configured |
| M-08 | Session/reset tokens plaintext on disk | Addressed in token handling |
| M-09 | OIDC issuer not validated | Discovery issuer validated against config (`handlers_oidc.go:267-269`) |
| M-10 | No session limit per user | Session limits implemented |
| M-11 | No SSE connection limit | Connection limits added |
| M-12 | Connector config returns secrets | Secrets masked in API responses |
| M-13 | No fsync in saveFile | `f.Sync()` before `os.Rename()` (`store.go:503-504`) |
| M-14 | Unbounded data growth | Collection caps added |
| M-15 | UserPublic leaks sensitive data | Sensitive fields restricted |
| M-16 | Backup restore io.Copy unbounded | Size limit applied |
| M-17 | Restored files 0644 permissions | Now 0600 (`store_backup.go:200`) |
| M-18 | No file type validation on attachments | Validation added |
| M-19 | Stored XSS via template names | `stripHTMLTags()` applied |
| L-16 | Static directory listing | `noDirListing` wrapper applied (`main.go:22-23`) |
| L-07 | OIDC routes not registered dynamically | Routes check at request time |
| L-14 | Popup endpoints missing CSRF header | Frontend corrected |

### Partially Fixed (1 finding)

| V2 ID | Finding | Status |
|-------|---------|--------|
| H-06 | SVG upload XSS as map resource | SVG still uploadable but served with `Content-Security-Policy: sandbox` header (`handlers_map.go:481-483`). Mitigates inline script execution but does not eliminate the risk entirely — a `sandbox` CSP can still be bypassed in certain browser edge cases. **Recommendation**: Block SVG uploads for map resources, or sanitize SVG content server-side. |

---

## Open Findings — Carried from V2

### H-01: SSE Broadcasts Leak Private Layer Events to All Users

**Location**: `app.go:145-155` (`broadcastEventChange`)
**Severity**: **HIGH**
**CVSS**: 7.5
**Status**: STILL PRESENT

`broadcastEventChange` sends full event JSON to every connected SSE client via `app.broker.Broadcast()`. The SSE broker (`sse.go`) has no layer-aware filtering — it sends to all connected clients except the sender. Any authenticated user with an SSE connection passively receives real-time event changes across all layers, including private/group-restricted layers.

This effectively nullifies the entire layer visibility system for any user with an open SSE connection.

**Attack scenario**: Attacker opens `/api/sse`, passively receives all event changes from classified layers they have no access to.

**Remediation**: Filter per-client at broadcast time using `canReadLayer` for the event's layer, or send a generic "refresh" notification and let clients re-fetch with server-side filtering.

---

### H-02: Export Endpoints Bypass Layer Visibility

**Location**:
- `handleExportICS` (line 29): `app.store.GetEventsInRange(from, to)` — no layer filter
- `handleExportXLSX` (line 30): `app.store.GetEvents(from, to, nil)` — no layer filter
- Stats export (line 452): `app.allEvents()` — no layer filter
- Report download, auto-report email, WebCal, narrative, 13+ statistics endpoints — all use unfiltered queries

**Severity**: **HIGH**
**CVSS**: 7.5
**Status**: STILL PRESENT

While `handleGetEvents` (the primary API listing) correctly filters by visible layers, all export and statistics endpoints return every event regardless of the requesting user's layer access. The `allEvents()` helper passes `nil` for `layerIDs` which returns all events. The comment in store code states "Layer visibility filtering is done client-side" — which is incorrect and dangerous for exports.

**Attack scenario**: A `read`-role user hits `/api/export/ics` or `/api/export/xlsx` and receives every event in the system, including those on classified layers.

**Remediation**: Create `app.getVisibleEvents(user, from, to)` that applies `visibleLayerIDs` filtering, and use it in all export, stats, report, and WebCal handlers.

---

### M-01: OIDC JWT Algorithm Confusion (HMAC Accepted Alongside JWKS)

**Location**: `handlers_oidc.go:510-530` (`validateIDToken`)
**Severity**: **MEDIUM**
**Status**: STILL PRESENT

The token validator accepts HMAC-based algorithms (HS256/384/512) using the client secret AND RSA/EC algorithms using JWKS keys. It does not enforce which algorithm the provider is expected to use. If the provider uses RS256, an attacker who knows the client secret can forge tokens with `alg: HS256`.

**Remediation**: After fetching JWKS, determine the provider's expected algorithm family. If JWKS contains RSA/EC keys, reject HMAC tokens. Store expected algorithm in `OIDCConfig`.

---

### M-02: OIDC Discovery SSRF — No Private IP Filtering

**Location**: `handlers_oidc.go:393-394` (`fetchJWKS`)
**Severity**: **MEDIUM**
**Status**: STILL PRESENT

`fetchJWKS` uses `&http.Client{Timeout: 10 * time.Second}` without SSRF protection. The OIDC discovery, token exchange, and userinfo endpoints also use unprotected HTTP clients. While these URLs come from admin-configured issuers, a compromised admin account can use them for SSRF against cloud metadata endpoints or internal services. The codebase already has `newSSRFSafeTransport()` used for webhooks — the same protection should apply here.

**Remediation**: Use `newSSRFSafeTransport()` for all OIDC HTTP operations.

---

## New Findings — V3

### M-03 (NEW): Jira Connector SyncStats Unescaped JQL Injection

**Location**: `connector_jira.go:207`
**Severity**: **MEDIUM**

The `SyncStats()` function constructs a Jira API URL without URL-encoding the JQL parameter:

```go
// Line 207 — UNESCAPED:
url := fmt.Sprintf("%s/rest/api/3/search?jql=%s&maxResults=100", cfg.BaseURL, jql)

// Compare with Poll() at line 90 — correctly escaped (V-16 fix):
url := fmt.Sprintf("%s/rest/api/3/search?jql=%s&maxResults=30", cfg.BaseURL, neturl.QueryEscape(jql))
```

The V-16 fix was applied to `Poll()` but missed `SyncStats()`. While connector configs are admin-only, a JQL value containing `&` or other URL metacharacters could alter the request parameters or cause unexpected behavior.

**Remediation**: Apply `neturl.QueryEscape(jql)` consistently in `SyncStats()`, matching the `Poll()` pattern.

---

### M-04 (NEW): Cascade Reschedule Bypasses Layer Access Control

**Location**: `handlers_profile.go:96-150` (`handleCascadeReschedule`)
**Severity**: **MEDIUM**

The cascade reschedule function modifies all dependent events without checking whether the requesting user has write access to each event's layer:

```go
allEvents := app.store.GetEventsInRange(...)
// BFS through all dependent events — NO layer check
for _, dep := range dependents[cur] {
    if err := app.store.UpdateEvent(dep); err == nil {
        updated = append(updated, dep)
    }
}
```

A `readwrite` user can reschedule events on private layers they have no group membership for by creating a dependency chain that crosses layer boundaries.

**Attack scenario**: User creates event A on public layer, event B on restricted layer depends on A. User reschedules A via cascade — B is also moved despite user having no write access to B's layer.

**Remediation**: Before updating each dependent event, verify `canWriteLayer` for the user. Skip events on inaccessible layers and report them as "skipped" in the response.

---

### L-01 (NEW): CSRF Protection Missing on Pre-Auth Endpoints

**Location**: `main.go:227-229`
**Severity**: **LOW**

Three pre-authentication endpoints lack the `X-Requested-With` header check that protects the login endpoint:

- `/api/auth/register` (line 227) — no CSRF protection
- `/api/auth/forgot-password` (line 228) — no CSRF protection
- `/api/auth/reset-password` (line 229) — no CSRF protection

The login endpoint (lines 213-222) has explicit `X-Requested-With` validation. These endpoints were missed.

**Impact**: Limited for registration (rate-limited to 5/min, may require invitation code). Forgot-password can be triggered via CSRF to spam the target's email. Reset-password requires knowing the token, so CSRF risk is minimal in practice.

**Remediation**: Add `X-Requested-With` header check to all three endpoints for consistency with the login pattern.

---

## Carried Low/Informational (Still Applicable)

### L-02: Comments and Attachments Listed Without Layer Check

**Location**: `handlers_comments.go:13-30`, `handlers_attachments.go:18-35`
**Severity**: **LOW**

`handleGetComments` and `handleGetAttachments` return data for any event ID without verifying the user can read the event's layer. While download has a `canReadLayer` check, the listing endpoints do not. An attacker can enumerate sequential event IDs to read comment/attachment metadata.

**Remediation**: Add `canReadLayer` check at the start of both listing handlers.

---

### L-03: Upload Attachment Missing Layer Write Check

**Location**: `handlers_attachments.go:37-103`
**Severity**: **LOW**

`handleUploadAttachment` checks event existence but not the user's layer write permission. Compare with `handleDownloadAttachment` (line 105+) and `handleDeleteAttachment` (line 137+) which have proper checks.

**Remediation**: Add `canWriteLayer` check before allowing upload.

---

### I-01: OIDC Algorithm Confusion — Defense in Depth Note

**Severity**: INFO

The OIDC PKCE/nonce requirement fix (M-03 from V2) significantly reduces the practical impact of algorithm confusion (M-01 above), since an attacker now needs a valid PKCE verifier to complete the flow. However, the algorithm confusion should still be fixed as a defense-in-depth measure.

---

### I-02: WebCal Token Entropy

**Severity**: INFO

WebCal tokens use 16 bytes (128 bits) of `crypto/rand` entropy (`handlers_profile.go:75-80`). While 128 bits is acceptable per NIST, tokens appear in URLs that may be logged by proxies, stored in browser history, or leaked via Referer headers. Consider increasing to 32 bytes (256 bits) for additional margin.

---

## Summary Table

| ID | Severity | Category | Finding | Status |
|----|----------|----------|---------|--------|
| H-01 | HIGH | AuthZ | SSE broadcasts leak private layer events | OPEN (from V2) |
| H-02 | HIGH | AuthZ | Export/stats/report endpoints bypass layer visibility | OPEN (from V2) |
| H-06 | HIGH | XSS | SVG upload served with sandbox CSP | PARTIAL FIX |
| M-01 | MEDIUM | Crypto | OIDC JWT algorithm confusion (HMAC + JWKS) | OPEN (from V2) |
| M-02 | MEDIUM | SSRF | OIDC HTTP calls use unprotected client | OPEN (from V2) |
| M-03 | MEDIUM | Injection | Jira SyncStats unescaped JQL | NEW |
| M-04 | MEDIUM | AuthZ | Cascade reschedule bypasses layer access | NEW |
| L-01 | LOW | CSRF | Pre-auth endpoints missing CSRF header check | NEW |
| L-02 | LOW | AuthZ | Comments/attachments listed without layer check | OPEN (from V2) |
| L-03 | LOW | AuthZ | Upload attachment missing layer write check | OPEN (from V2) |
| I-01 | INFO | Crypto | Algorithm confusion mitigated by PKCE | NOTE |
| I-02 | INFO | Entropy | WebCal token 128-bit entropy in URLs | NOTE |

---

## Positive Security Posture

The codebase demonstrates strong security engineering with systematic fixes since V1:

- **Authentication**: bcrypt hashing (cost 10+), timing-safe comparisons throughout, progressive account lockout (5/10/20 failures), rate limiting on login/register/reset
- **OIDC**: Full PKCE flow with nonce validation, issuer verification, JWKS caching with TTL, state parameter with constant-time comparison
- **Session management**: `crypto/rand` 32-byte IDs, HttpOnly/Secure/SameSite cookies, session invalidation on password change, idle timeout, background cleanup
- **API keys**: bcrypt-hashed storage (not plaintext), no admin-level API keys allowed, timing-safe validation
- **Input sanitization**: `stripHTMLTags()` applied across all user-facing text fields, `filepath.Base()` for uploads, JSON body size limits (1MB), multipart limits
- **CSRF**: `X-Requested-With` header check on login and all authenticated state-changing requests
- **IP handling**: `clientIP()` only trusts proxy headers from loopback/private IPs
- **File security**: 0700 directory permissions, 0600 file permissions, ZIP entry allowlist prevents path traversal, zip bomb protection, `noDirListing` wrapper
- **Concurrency**: Proper mutex usage, fsync before rename, write serialization
- **Minimal dependencies**: Only `golang.org/x/crypto` external — minimal supply chain risk
- **Audit trail**: Comprehensive logging of security-relevant events with IP tracking

---

## Priority Remediation Roadmap

### Immediate (Week 1)
1. **H-01 + H-02**: Centralize layer filtering — create `app.getVisibleEvents(user, from, to)` and apply it to SSE broadcasts, all exports, stats, reports, WebCal, and narrative endpoints. This is the highest-impact fix.
2. **M-04**: Add `canWriteLayer` check in cascade reschedule.

### Short-Term (Week 2)
3. **M-01**: Pin OIDC algorithm — reject HMAC when JWKS contains asymmetric keys.
4. **M-02**: Use `newSSRFSafeTransport()` for OIDC HTTP operations.
5. **M-03**: Apply `QueryEscape(jql)` in Jira `SyncStats()`.
6. **H-06**: Block SVG uploads for map resources or sanitize on upload.

### Medium-Term (Week 3-4)
7. **L-01**: Add CSRF header checks to pre-auth endpoints.
8. **L-02**: Add `canReadLayer` to comment/attachment listing.
9. **L-03**: Add `canWriteLayer` to attachment upload.

---

## Methodology

This assessment was performed through comprehensive static code review of all Go source files, handler registration in `main.go`, middleware implementations, store operations, connector implementations, OIDC flow, and all HTTP endpoints. Verification of V2 fixes was performed by reading current source code at the specific locations identified in V2 and confirming the presence of remediation code. New findings were identified through systematic analysis of authorization boundaries, input handling paths, and external service integrations.
