# Release Notes — Tidslinjal v8.6.0

**Release Date:** 2026-04-13

v8.6.0 is a large feature release focused on the **Key Terrain Board** tool. It introduces a new **Battle Rhythm** subsystem — a shared exercise clock with cyclic steps, per-step coloured borders, automatic snapshot scheduling, and forward / backward / fast-forward step navigation — plus a new **Comments** column, a significantly expanded zoom range, a step-level hover tooltip, terminology customization, and a fresh **Hungarian** locale (the 20th supported language).

Upgrading from 8.5.0 requires no data migration.

---

## Headline features

- **Battle Rhythm** — shared exercise clock with named steps, H0 tracking, start / pause / resume / reset, backward / forward / fast-forward step navigation, per-step coloured board border, automatic snapshot scheduler (CSV / JSON / XML / SVG), detachable clock card, and an auto-incrementing `# Cycles` counter on every entry. See the "⏱ Battle Rhythm" section in the Key Terrain Board's `?` help for full operator docs.
- **Comments column** — a new free-form field on every Key Terrain entry, visible between Actions and the date columns, sortable, filterable, and included in every snapshot format.
- **Customizable column labels** — teamlead+ can rename any Key Terrain Board column from Settings → Column Labels. Overrides are global and propagate to header, filter, hide-columns, column-order, and export dialogs.
- **"Function" UI rename** — reverts the v8.3.0 rename of *Function* to *Capability* in the Key Terrain Board display strings (all 19 original languages). Backend field names are intentionally unchanged so integrations and the Resources tool keep working.
- **Board zoom** — 8 levels (xxs / xs / sm / md / lg / xl / xxl / xxxl) spanning 9 px – 20 px, per-browser localStorage. Detached `/key-terrain` page fills the full window.
- **Hungarian (`hu`) language** — 20th supported locale.

## Improvements

- Battle-rhythm widget re-architected into a shell + in-place text-updates split so inputs (the HH:MM Start picker) and buttons survive every tick. `_bindActions` is re-run after every shell rebuild so Start / Pause / Reset actually fire.
- Start / Pause no longer flash the board — SSE `key_terrain_change` events now carry the action payload, and `_ktHandleSSE` branches on it: `battle_rhythm_*` only polls the widget, `cycle_rollover` refetches entries only, everything else triggers the full refresh.
- Scheduled → running clock transition at H0 is now responsive — the widget flips layout within the same tick the wall clock crosses `started_at` and force-triggers an immediate poll.
- Filter panel uses custom column labels; function checkbox list is rebuilt on every open; matching is case- and whitespace-insensitive.
- Multiple overlapping steps (e.g. Brief = [30, 75), Assess = [60, 90)) report **both** step names in the widget's "Now" field, joined with ` + `. Single-point boundaries (A ends at 60 where B starts at 60) do NOT double-count.
- Mouse-over tooltip on the widget's left info block shows every configured step with its time range, description, and colour swatch, with the active step highlighted.
- "# Rounds" column renamed to "# Cycles" in all 19 pre-existing language files.
- In-board `?` help modal has a dedicated **Battle Rhythm** section covering configuration, controls, cycle rollover + snapshots, and the detached clock card.

## Bug fixes

- Key-terrain.js syntax error from a double-escaped apostrophe in the fast-forward tooltip fallback string (would break the entire board on load).
- Start button was unclickable because `_bindActions` only runs once per modal open; the widget's shell rebuilds on layout transitions now re-bind the host immediately.
- Battle-rhythm widget no longer destroys focus-holding inputs on every 500 ms tick — only text nodes are updated between shell rebuilds.

## Upgrading

No schema changes. Existing `key_terrain_settings.json` loads cleanly with empty defaults for the new fields. Downgrading to 8.5.0 is safe.

See **[`docs/RELEASE_NOTES_v8.6.0.md`](RELEASE_NOTES_v8.6.0.md)** for the full details including the test additions.

---

## Previous Release: v8.5.0 (2026-04-12)

v8.5.0 is a **security hardening release** that closes a series of findings reported by an external security review. All of the fixes in this release are defensive — no new user-facing features are added, but authentication, authorization, and file-handling code paths are now significantly more resilient to both direct attack and supply-chain / backup-restore threats.

Upgrading is **strongly recommended**. No data-migration steps are required.

---

## Security Hardening

### Session hijack protection — client IP / user-agent binding
A stolen session cookie could previously be replayed from any network or browser. Sessions are now bound to the client IP and user-agent captured at login time and validated on every request. Mismatches destroy the session on the spot and write a `session_hijack_suspected` audit entry.

- New **Session Hijack Protection** panel in Security → Session Management:
  - "Bind session to client IP address" (default on)
  - IP match mode: **Subnet** (/24 IPv4, /64 IPv6 — tolerates minor NAT/carrier churn, default) or **Strict** (exact match)
  - "Bind session to browser user-agent" (default on)
- Legacy sessions created before the binding fields existed are allowed through for graceful migration.

### Arbitrary file read / delete via reference document `Filename` — fixed
A TeamLead+ user could historically create a "local" reference whose `content` contained a path-traversal string; the constructor wrote that value into `ReferenceDoc.Filename`, which then flowed unsanitised into `os.Remove` and `os.ReadFile`.

- `CreateReferenceLink` no longer overloads `Filename` with `URL` or `Content`; the download handler serves those via the existing `RefType` branch.
- New `safeReferenceFilePath` choke-point used by every disk sink (download, delete, checksum).

### Arbitrary file read / delete via room image name — fixed
`Room.ImageName` was part of a full-struct JSON decode in `handleSaveRoom`; a client could POST `{"image_name": "../../../etc/passwd"}` and the next image upload or download would target that path.

- `handleSaveRoom` now preserves `ImageName` from the existing DB record on update and clears it on insert.
- New `safeAttachmentPath` choke-point used by the room image download and replace paths.

### Single shared filesystem choke-point
All remaining disk sinks now go through one shared helper so the traversal pattern cannot drift across handlers again.

- New `safeJoinFilename(dir, name)` package-level helper rejects empty, `.`/`..`, forward/back separators, absolute paths, nested paths, and any `filepath.Abs` escape from the intended directory.
- Routed through it: map resource download + delete, event attachment download + delete, reference download/delete/checksum, room image download + replace.

### Syslog log forging blocked
Classic RFC 3164 syslog uses `\n` as a record delimiter; an attacker-controlled event title containing `\n<34>Jan 1 00:00:00 host: FAKE root login` would inject a forged record into the upstream SIEM.

- New `sanitizeSyslogMessage()` strips CR, LF, NUL, and C0 control characters (tabs preserved) before either formatter runs.

### Auto-report email recipient validation
TeamLead+ could previously schedule recurring email reports to any address with zero validation — spam-relay potential.

- New `validateAutoReportEmail()` enforces RFC 5322 format, rejects CR/LF (header injection), and supports an optional domain allowlist.
- New `AutoReportEmailDomains []string` field on `SecuritySettings` — empty = any valid address, populated = case-insensitive domain allowlist.

### Additional fixes bundled in
- **CSRF double-submit cookie on logout** + OIDC RP-initiated end-session redirect.
- **IDOR fixes** on 6 endpoints (spreadsheets, decision log attachments, references, log book attachments).
- **References `git-load` path traversal** — imported records sanitised via `filepath.Base` + `isDangerousFilename`.
- **Dangerous uploads** on references/report-archive/board-items now rejected; downloads force `X-Content-Type-Options: nosniff` + `application/octet-stream` for dangerous extensions.
- **Diary rich-text sanitiser** replaced the regex parser with `golang.org/x/net/html` tokenizer-based allowlist parser with a dedicated XSS-bypass test suite.
- **Active Sessions admin UI** — list and destroy live sessions from Security → Session Management.

---

## Tests added

- `session_binding_test.go`, `reference_path_traversal_test.go`, `misc_security_test.go`, `sanitize_test.go` — all passing on `go test ./...`.

---

## Upgrading

No schema changes. Sessions created before the upgrade are honoured for backwards compatibility. The new binding defaults (`session_bind_ip=true`, `session_bind_ip_mode=subnet`, `session_bind_ua=true`) take effect for new logins. Downgrading to 8.4.0 is safe — none of the new fields break the older parser.

---

## Previous Release: v8.4.0 (2026-04-12)

A major release focused on **custom role authorization**, **offline detection**, **printing improvements**, **new event types**, and dozens of bug fixes uncovered by comprehensive code audits.

---

## New Features

### Custom role authorization (capability-aware)
- New `effectiveHasRole()` middleware grants custom roles up to OpLead level (1-4) based on capabilities
- All 184 `requireRole()` route gates and 58 handler-level `hasRole()` calls converted
- Frontend `canEdit` checks now use `hasRole2()` + `userHasCapability()` instead of hardcoded role strings
- Custom roles like `bt_13_leadership` can finally access features they were configured for
- Level 5 (Admin/Developer) still requires the actual built-in role for security-critical operations

### Standalone Key Terrain Board page (`/key-terrain`)
- Bookmarkable, deep-linkable URL for the Key Terrain Board
- Independent SSE connection for real-time updates
- Default light theme when accessed via deep link
- Sub-modals (edit entry, settings, filter) with proper borders

### Bulk move events between layers
- New "Bulk Move Events" tool in the Layers sidebar
- Source and target layer dropdowns (Master Timeline included)
- Backend `POST /api/layers/bulk-move` with permission checks on both layers
- Visible to teamlead+ users or anyone with the `manage_layers` capability

### Three new event types
- **Starting Point** (▶) — green right-pointing arrow indicator, marks where something begins
- **Ending Point** (⏹) — red left-pointing arrow indicator, marks where something ends
- **Transport** (🚚) — blue with motion-line stripes, marks transport activities
- Start/End events behave like instant events (no end time, compact width)
- Configurable shape style: Arrow, Diamond, Bar, or Pill (Settings > Start/End Event Shape)

### Event hover tooltip
- Hovering over any event shows a floating tooltip with full title, description (truncated), and start/end times
- 350 ms delay, follows the cursor, avoids screen edges, hides on click

### Country flags on events
- Setting a country code (`SE`), alpha-3 (`SWE`), English name (`Sweden`), or localized name (`Sverige`) as physical_location shows the flag emoji on the event
- ~50 countries supported with localized names across multiple languages

### Print tool enhancements
- New print dialog with view selector: **Calendar / List / Task-Time Matrix**
- Date range picker with quick-select buttons (Day, Week, Month, Current view, All events)
- **Layer selection panel** with checkbox toggles for fine-grained control
- **Smart filenames** — saved PDFs get names like `tidslinjal-listview-2026-04-12_to_2026-04-19.pdf`
- **Boards print** — choose between overview-only or detailed (per-board) printing
- **Key Terrain Board** prints in landscape orientation by default

### List view improvements
- Multi-select **layer filter** with checkbox dropdown panel
- **Column visibility toggle** (Type, Status, Start, End, Responsible, Actions)
- **Wider title column** — no more 260px truncation

### Layer modal improvements
- Shows event count: "This layer contains 12 events"
- Detailed warning when deleting a layer with events
- Edit button now visible on shared layers when user has `manage_layers` capability or readwrite group access

### Minimum event size setting
- New preference (Settings > Minimum Event Size) to keep short events readable
- Four options: Default (14px), Medium (28px), Large (44px), Extra Large (64px)

### Offline detection
- **Client heartbeat** — pings the server every 30 seconds (8 s timeout)
- After 2 consecutive failures, the client is marked offline with a warning notification
- **Request failure detection** — `api()` helper triggers immediate heartbeat check on network errors
- Catches server outages, firewall blocks, and reverse-proxy failures that `navigator.onLine` doesn't detect
- Auto-sync queued actions when connection is restored

### Show event creator (now a setting)
- Creator name on events is **hidden by default**
- Toggleable in Settings > Event Icons > "Show creator name on events"

---

## Bug Fixes

### Critical
- **Double event creation** — duplicate `addEventListener('click')` handlers in `modals.js` and `modal-event.js` caused every event to be created twice. Fixed.
- **Double layer creation** — same pattern + circular auto-creation when creating a layer triggered group creation, which auto-created another layer
- **Modal closes on text selection** — clicking and dragging in an input could trigger the overlay close. Fixed by tracking `mousedown` target.
- **Keyboard shortcuts steal input focus** — global shortcuts (`e`, `t`, `s`, `d`) fired when input lost focus. Now suppressed when any modal is open.
- **Custom roles couldn't edit events** — frontend used hardcoded role strings. Fixed with capability-aware logic.
- **`/key-terrain` returned JSON error** — direct link returned `{"error":"unauthorized"}`. Now redirects to `/login`.
- **Log book attachment download** — handler had no user context, allowing any authenticated user to download any attachment. Fixed.
- **Group member list IDOR** — any authenticated user could enumerate members of any group. Now requires membership/admin/`manage_groups`.
- **Backup missing key terrain data** — `key_terrain.json`, `key_terrain_settings.json`, and `key_terrain_snapshots.json` were not in any backup file list. Added.

### High / medium
- **Calendar grid ignored size preference** — `getSlotHeight()` read CSS variables from `<html>` instead of `<body>`. Fixed.
- **Settings panel didn't visually update** — `renderedTab` guard now clears when changing preferences.
- **French language fully broken** — unescaped apostrophe caused `SyntaxError`, all 2,644 French translations fell back to English. Fixed.
- **Language switching race condition** — `_loadLang()` had no in-flight deduplication. Fixed.
- **Print tool didn't work** — `printTimeline()` was never defined. Implemented with full dialog.
- **OIDC token replay** — `iat` claim was extracted but never validated. Now rejects tokens issued >12 minutes ago.
- **Diary XSS hardening** — `javascript:` removal was case-sensitive. Replaced with case-insensitive multi-protocol removal.
- **9 missing function implementations** in settings UI (artificial time, group/user labels, operation mode, timezone, exercise index info, detached checklists). All now functional.
- **Export stubs fixed** — log export CSV/XML, KML/XML main export, PVA modal `openPVAModal()`/`exportPVAReport()`. All implemented.
- **'rivate' label** in edit layer modal — `t('layer_visibility_private').replace(/^./, '')` was the wrong key + stripped first char. Fixed.

---

## i18n

- **66 missing French translations** added (spreadsheet keys + `btn_copy`)
- **17 message archive / infomanagement keys** added to all 19 languages
- **10 analysis keys** + **18 question type labels** (`qtype_*`) — analysis modal no longer shows raw `free_text`/`scale_0_3` strings
- **Print dialog** — 11 new keys, all 19 languages
- **Boards print dialog** — 6 new keys
- **Offline notifications** — 4 keys (`offline_warning`, `online_restored`, etc.)
- **List view** — `lv_all_layers`, `lv_all_responsible`, `lv_no_layers`, `lv_layers_selected`
- **Min event height + start/end shape selector** — 9 new keys
- **Layer modal Visibility label** — new `layer_visibility` key

---

## Security audit

A comprehensive three-part security audit was performed:
- **Authentication & sessions** — verified bcrypt, HttpOnly, SameSite=Strict, CSRF double-submit; OIDC `iat` validation added
- **Injection & input validation** — verified XSS protection, path traversal, SSRF, command injection, XXE, file uploads
- **Authorization & access control** — fixed log book attachment IDOR, group member list IDOR, custom role authorization gaps

---

## Previous Release: v8.3.0 (2026-04-06)

### New Features (v8.3.0)

### Key Terrain Board — Owner Column & Checkbox Filters
- **Owner column** — displays the owner of each linked capability; hidden by default; sortable
- **Owner field on capabilities** — new field in capability form, synced to Key Terrain Board entries
- **Checkbox filters** — capability, priority (0–10), status, and trend now have checkbox filters complementing existing inputs; all unset by default

### 8 New Visual Themes
- Sand, Matrix, Sunset, Light Blue Sky, Ocean, Forest, Accessible, Crimson
- Full CSS variable definitions with theme selector buttons in Settings

### Language Additions
- **Japanese (日本語)** and **Korean (한국어)** added — Tidslinjal now supports **19 languages**
- Toolbar flag buttons (🇯🇵 🇰🇷) and profile dropdown entries added

### Settings i18n
- 36 hardcoded strings wrapped in `t()` calls; 60+ new translation keys across all 19 languages
- Theme labels, timezone section, terminology buttons, notification labels, and tactical font settings fully internationalized

---

## Previous Release: v8.2.0 (2026-04-05)

## New Features (v8.2.0)

### Diary Module
- Personal diary with rich text editor (bold, italic, underline, strikethrough, lists, inline links, inline images)
- Per-user diary entries with public/private visibility
- Tags, mood indicator, and file attachments
- Export: JSON, XML, CSV, XLSX, ODS, TXT, RTF, Markdown
- Import: JSON, XML
- Filter by author, tag, visibility, and full-text search
- Print single entry or full diary
- Added to Reports module: "Diary Entry" and "Full Diary" report types
- i18n: 40 diary keys translated in all 17 languages

### User Labels
- Colored labels that can be attached to user profiles
- Labels are visible to everyone in the user list
- Setting and removing labels are audit-logged events
- Requires TeamLead+ role to add/remove labels

### Capabilities (Resources)
- Fixed "Capabilities" button in Resources — was not working
- Added capability-specific form fields: Zone, Ownership, Status
- Capabilities are now reactive objects: changes propagate to Key Terrain Board entries linked via capability_id
- "Load from Capability" dropdown in Key Terrain entry form

### Key Terrain Board Enhancements
- **New columns:** `#` (sequence number, auto-assigned), `Zone` (sortable string)
- **New settings:** "Show Functions Without Priority" (hide priority-0 entries), customizable status labels, column visibility toggles, column order reorder
- **"Management" column** is now a proper column that can be shown/hidden and reordered
- **"Manage & Export" button** — consolidated History, Versions, Print, and Export into one panel (decluttered toolbar)
- Column order moved into Settings panel
- Detached window now inherits the parent's theme/colors
- Renamed "Function" to "Capability" in all 17 languages

### Export/Import Format Additions
- **Markdown (MD):** Reports, Diary, Stats, Key Terrain
- **XLSX/ODS:** Boards, Stats, Key Terrain, Reports, Diary
- **JPEG/TIFF/BMP:** Boards, Key Terrain
- **XML export:** Boards
- **XML import:** Diary, Boards

### Online Help
- Added Release Notes, README, and User Manual sections to the help modal
- Fixed text height/readability in help sections (increased line-height and padding)

---

## Backend Improvements

### Missing Feature Implementations
- **LDAP Authentication:** Full go-ldap/ldap/v3 implementation replacing the stub (service account bind → user search → user bind → group mapping)
- **XLSX Stats Export:** Proper XLSX generation with Events and Decisions sheets (was silently falling back to JSON)
- **Git References Endpoints:** POST /api/references/git/save and /load for version-controlled reference export
- **Meeting Config Persistence:** Now properly saved to meeting.json (was stub returning hardcoded data)
- **Dashboard Config Persistence:** Widget configuration stored server-side per user (was localStorage only)
- **Sidebar Security Endpoints:** /api/tls/status, /api/oidc/config, /api/security/policy
- **Board CSV Import:** POST /api/boards/import/csv with flexible column mapping
- **Decision Co-Sign Target:** co_sign_target_id and co_sign_target_name fields now persisted

### Offline Mode Improvements
- Deduplication of queued offline actions (PUT/DELETE on same path keeps latest)
- Exponential backoff retry (up to 3 attempts: 1s, 2s, 4s)
- Smart error handling: 4xx client errors discarded, 409 conflicts treated as applied

---

## Security Fixes

- **CRITICAL:** Diary export authorization bypass via user_id parameter — now restricted to own diary or admin
- **CRITICAL:** User label authorization escalation — now requires TeamLead+ role
- **CRITICAL:** Stored XSS in diary body — added `sanitizeRichHTML()` that strips dangerous tags while preserving formatting
- **HIGH:** XXE injection in diary XML import — replaced with strict XML decoder
- **HIGH:** Path traversal in diary attachment download — added filepath validation
- **HIGH:** LDAP filter validation — validates %s placeholder and parentheses syntax
- **MEDIUM:** Diary import body size reduced from 10MB to 2MB

---

## i18n

- Board filter: 21 keys × 17 languages
- Board search: 10 keys × 17 languages
- Diary: 40 keys × 17 languages
- Key Terrain (zone, seq_num, capability, manage, settings): 20+ keys × 17 languages
- Capability form: 7 keys × 17 languages

---

## Bug Fixes

- Fixed CSP violations in diary module (replaced all inline event handlers with addEventListener)
- Fixed CSP violations in key-terrain.js (row hover, rich text toolbar, print button)
- Fixed diary editor losing focus and leaking keystrokes to timeline shortcuts
- Fixed timeline.js global shortcut handler to check for contenteditable elements
- Fixed column move in Key Terrain Settings (function signature mismatch with _bindActions spread args)
- Fixed Key Terrain _ktMoveEntry and _ktMoveCol argument handling
- Fixed capability dropdown URL (was using broken relative path)
- Removed unused escapeLDAPFilter function (replaced by ldaplib.EscapeFilter)
