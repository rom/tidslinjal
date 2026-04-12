# Release Notes — Tidslinjal v8.5.0

**Release Date:** 2026-04-12

v8.5.0 is a **security hardening release** that closes a series of findings reported by an external security review. All of the fixes in this release are defensive — no new user-facing features are added, but authentication, authorization, and file-handling code paths are now significantly more resilient to both direct attack and supply-chain / backup-restore threats.

Upgrading is **strongly recommended**. There are no data-migration steps required; existing installations pick up the new defaults on first restart.

---

## Security Hardening

### Session hijack protection — client IP / user-agent binding
A stolen session cookie could previously be replayed from any network or browser. Sessions are now bound to the client IP and user-agent captured at login time and validated on every request. Mismatches are destroyed on the spot and written to the audit log as `session_hijack_suspected`.

- `middleware.go:getSession()` now calls `sessionBindingMismatch` before returning the session to the handler.
- New **Session Hijack Protection** section in Security → Session Management:
  - "Bind session to client IP address" (default on)
  - IP match mode: **Subnet** (/24 IPv4, /64 IPv6 — tolerant of minor NAT/carrier churn, default) or **Strict** (exact match)
  - "Bind session to browser user-agent" (default on)
- Legacy sessions created before the fields existed are allowed through for graceful migration.
- Startup log reports the active binding configuration.

### Fixed arbitrary file read / delete via reference document Filename
A user with TeamLead+ role could create a "local" reference document whose `content` field was a path-traversal string (e.g. `../../../etc/motd`); the constructor historically wrote that string into `ReferenceDoc.Filename`, which then flowed unsanitised into `os.Remove(filepath.Join(ReferenceDir, rd.Filename))` on delete and `os.ReadFile` on checksum — arbitrary file deletion and read on the server.

- `CreateReferenceLink` no longer overloads `Filename` with `URL` or `Content`. URL/local references now have an empty `Filename` and the download handler serves `rd.URL` / `rd.Content` via the existing `RefType` branch.
- New **`safeReferenceFilePath`** choke-point rejects empty, `.`/`..`, forward/back separators, absolute paths, nested paths, and anything whose `filepath.Abs` escapes the reference directory. Used by every reference disk sink (download, delete, checksum).
- Blocked filenames are logged as `refused_path_traversal` audit entries so tampering is visible.

### Fixed arbitrary file read / delete via room image name
`Room.ImageName` was part of the full-struct JSON decoded in `handleSaveRoom`, so a client could POST `{"image_name": "../../../etc/passwd"}` and the next image upload or download would target that path.

- `handleSaveRoom` now preserves `ImageName` from the existing DB record on update and clears it on insert — it's only ever settable by the server-side image upload handler.
- New **`safeAttachmentPath`** choke-point used by both `handleRoomImageDownload` and the image-replace delete path.

### Defence-in-depth at every remaining disk sink
Refactored to a single shared helper so this pattern can never drift again.

- New **`safeJoinFilename(dir, name)`** package-level helper in `middleware.go`.
- `safeReferenceFilePath` and `safeAttachmentPath` now delegate to it.
- Map resource download + delete routed through the helper (`handleServeMapResourceFile`, `handleDeleteMapResource`).
- Event attachment download + delete routed through the helper (`handleDownloadAttachment`, `handleDeleteAttachment`).
- Diary, decision-log, and log-book attachment handlers already had their own `filepath.Base` + prefix checks and were verified safe.

### Syslog log forging blocked
Classic RFC 3164 syslog uses `\n` as a record delimiter. An attacker-controlled event title containing `\n<34>Jan 1 00:00:00 host tidslinjal: FAKE root login` would inject a forged record into the upstream SIEM and mislead incident responders.

- New **`sanitizeSyslogMessage()`** strips CR, LF, NUL, and other C0 control characters (tabs preserved) before the message reaches either formatter. JSON output was already `\n`-escaped but is sanitised for consistency.

### Auto-report email recipients validated
TeamLead+ users could previously schedule recurring email reports to any address with zero validation — the server could be used as a spam relay.

- New **`validateAutoReportEmail()`** helper enforces RFC 5322 format via `net/mail.ParseAddress`, rejects CR/LF (header injection), and supports an optional domain allowlist configurable in Security Settings.
- New **`AutoReportEmailDomains []string`** field on `SecuritySettings` — empty means "any valid address", populated means "case-insensitive domain allowlist".

### Admin UI active-session management
(Carried forward from the 8.4.x patch train — consolidated here for completeness.)

- **Security → Active Sessions** lists every currently-live session with its user, created-at, expires-at, IP address, and user-agent.
- Administrators can destroy individual sessions; the admin cannot terminate their own current session from this list (a dedicated "log out of all sessions" button is available in the user profile menu).
- Session identifiers are SHA-256-hashed before they're shown in the admin UI so the full bearer token never leaves the server.

### Additional fixes bundled in
- **CSRF double-submit cookie on logout** — the logout endpoint now validates the CSRF token and, for OIDC sessions, issues an RP-initiated end-session redirect to the IdP's `end_session_endpoint`.
- **IDOR fixes** for 6 endpoints (spreadsheets, decision log attachments, references, log book attachments) — ownership / layer-access checks are now enforced on read, write, and delete paths.
- **References `git-load` path traversal** — imported records have their `Filename` sanitised via `filepath.Base` + `isDangerousFilename` so a poisoned `references_git_export.json` (reachable only via direct filesystem access or a shared git repo) cannot inject traversal filenames.
- **Dangerous file uploads** on references, report-archive, and board-items are now rejected by `isDangerousFilename`; downloads force `X-Content-Type-Options: nosniff` and `application/octet-stream` for dangerous extensions.
- **Diary rich-text sanitiser** replaced the regex-based parser with `golang.org/x/net/html` tokenizer-based allowlist parser with a dedicated XSS-bypass test suite (13 classic bypass attempts).

---

## Security Tests

- `session_binding_test.go` — IP match modes, UA match, legacy sessions, disabled bindings.
- `reference_path_traversal_test.go` — 11 traversal patterns, root-cause pinning for `CreateReferenceLink`, `safeAttachmentPath` mirror.
- `misc_security_test.go` — `safeJoinFilename`, `sanitizeSyslogMessage` (including the classic log-forging payload), and `validateAutoReportEmail` (valid/malformed/CRLF/domain allowlist).
- `sanitize_test.go` (from 8.4.x) — 13 XSS bypass attempts against the diary HTML sanitiser.

All tests pass on `go test ./...`.

---

## Upgrading

No schema changes. First start after upgrade:

1. Existing sessions are honoured for backwards compatibility; the new IP/UA binding check is applied only to sessions that already carry the metadata (all new logins starting from 8.4.x+).
2. Security defaults change: `session_bind_ip`, `session_bind_ip_mode=subnet`, and `session_bind_ua` are all enabled. If you have users on rotating mobile carrier IPs, leave the mode on "subnet" (the default). If you require exact-IP binding, flip the mode to "strict" in Security → Session Management.
3. If you use auto-report email schedules with external recipients, optionally configure `auto_report_email_domains` to restrict recipient domains.

Downgrading to 8.4.0 is safe — none of these changes write incompatible data.
