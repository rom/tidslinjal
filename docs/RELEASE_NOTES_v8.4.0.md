# Release Notes — Tidslinjal v8.4.0

**Release Date:** 2026-04-12

This is a major release focused on **custom role authorization**, **offline detection**, **printing improvements**, **new event types**, and dozens of bug fixes uncovered by comprehensive code audits.

---

## New Features

### Standalone Key Terrain Board page (`/key-terrain`)
- The Key Terrain Board can now be opened as its own URL-addressable page (`/key-terrain`)
- Bookmarkable, shareable, and works as a deep link without requiring an opener window
- Independent SSE connection for real-time updates and own theme sync via `BroadcastChannel`
- Default light theme when opened via deep link (was unreadable in dark before)
- Sub-modals (edit entry, settings, filter) now have visible borders and box shadow

### Bulk move events between layers
- New "Bulk Move Events" tool in the Layers sidebar section
- Two dropdowns (source and target layer) with confirmation dialog showing layer names
- Backend `POST /api/layers/bulk-move` with permission checks on both source and target
- Visible to teamlead+ or users with `manage_layers` capability

### Three new event types with custom shapes
- **Starting Point** (▶) — right-pointing arrow indicator, green
- **Ending Point** (⏹) — left-pointing arrow indicator, red
- **Transport** (🚚) — motion-line stripes pattern, blue
- Start/End point events behave like instant events (no end time, compact width) so they don't overshadow other events at the same time slot
- Configurable shape style for start/end events: Arrow (default), Diamond, Bar, or Pill — selectable in Settings

### Event hover tooltip
- Hovering over any event on the calendar shows a floating tooltip with full title, description (truncated), and start/end times
- 350 ms delay before showing, follows the cursor, avoids screen edges, hides on click
- Works on dynamically rendered blocks via event delegation

### Country flags on events
- When `physical_location` is set to a country code (e.g. `SE`, `FR`), alpha-3 code (e.g. `SWE`), English name, or localized name (e.g. `Sverige`, `Deutschland`, `Frankrike`), the flag emoji is shown on the event block and in the detail modal
- Supports ~50 common country names across multiple languages

### Print tool enhancements
- New print dialog with **view selector** (Calendar / List / Task-Time Matrix)
- **Date range picker** with quick-select buttons (Day, Week, Month, Current view, All events)
- **Layer selection panel** with checkboxes — choose exactly which layers to include
- **Smart filenames** — saved PDFs get meaningful names like `tidslinjal-listview-2026-04-12_to_2026-04-19.pdf`
- **Boards print dialog** — choose between printing the boards overview (one page) or each individual board with all items in detail (landscape, page-break per board)
- **Key Terrain Board** prints in landscape by default

### List view enhancements
- **Multi-select layer filter** — checkbox dropdown panel with "All layers" toggle, color swatches, smart select-all behavior
- **Column visibility toggle** — show/hide Type, Status, Start, End, Responsible, Actions columns
- **Wider title column** — no more `max-width:260px` truncation
- Removed week numbers from date columns to save space

### Layer modal improvements
- Shows event count: "This layer contains 12 events" or "This layer has no events"
- Detailed warning when deleting a layer with events: "This layer contains N events. Deleting it will move all events to the Master Timeline."
- Shared layers now show edit button when the user has `manage_layers` capability or is in a group with `readwrite` permission

### Minimum event size setting
- New preference in Settings > Minimum Event Size
- Four options: Default (14px), Medium (28px), Large (44px), Extra Large (64px)
- Ensures short-duration events remain readable when using large fonts

### Offline detection improvements
- **Client heartbeat** — pings the server every 30 seconds with an 8-second timeout
- After 2 consecutive failures, the client is marked offline and a warning notification appears
- **Request failure detection** — the `api()` helper now reports network failures immediately, triggering a heartbeat check
- Successful responses reset the failure counter and clear offline state
- Catches server-side outages, firewall blocks, and reverse-proxy failures that the browser's `navigator.onLine` event never fires for

### Custom role authorization (capability-aware)
- New `effectiveHasRole()` middleware function: built-in role check + capability-based level computation for custom roles
- Custom roles can now reach role levels 1-4 (Reporter through OpLead) based on capabilities
- Level 5 (Admin) still requires the actual built-in admin role for security-critical operations
- All 184 `requireRole()` route gates and 58 handler-level `hasRole()` calls converted
- Frontend checks updated to use `hasRole2()` + `userHasCapability()` fallbacks instead of hardcoded role string comparisons

### Show event creator setting
- The creator name on event blocks is now hidden by default
- New "Show creator name on events" toggle in Settings > Event Icons

---

## Bug Fixes

### Critical fixes
- **Double event creation** — duplicate `addEventListener('click')` handlers in `modals.js` and `modal-event.js` caused every event creation to fire twice. Removed the duplicate handlers from `modals.js`.
- **Double layer creation** — same pattern as events: duplicate save handlers in `modals.js`. Also fixed circular auto-creation: when creating a layer triggered group creation, which auto-created another layer with the same name.
- **Modal closes when selecting text** — clicking and dragging in an input field could close the modal if the mouse crossed the overlay area. Fixed by tracking `mousedown` target and requiring both mousedown AND click to be on the overlay.
- **Keyboard shortcuts steal input focus** — when a modal was open, global shortcuts (`e`, `t`, `s`, `d`) could fire if the input lost focus. Now suppressed for all modals except Escape.
- **Custom roles couldn't edit events** — frontend `canEdit` check used hardcoded role strings (`'admin'`, `'readwrite'`), so custom roles like `bt_13_leadership` saw no edit button even with `edit_all` capability. Replaced with capability-aware logic.
- **`/key-terrain` returned JSON error** — direct link returned `{"error":"unauthorized"}` instead of redirecting to `/login`. Fixed.
- **Log book attachment download bypass** — handler had no user context, so any authenticated user could download any attachment. Fixed.
- **Group member list IDOR** — any authenticated user could enumerate members of any group. Now requires membership, admin role, or `manage_groups` capability.
- **Backup missing key terrain data** — `key_terrain.json`, `key_terrain_settings.json`, and `key_terrain_snapshots.json` were not in any backup file list. Added to full backup, gradual backup, and the restore allow-list.

### High / medium fixes
- **Calendar grid ignored size preference** — `getSlotHeight()` and `renderTimeline()` read CSS variables from `document.documentElement` (`<html>`), but the `body.size-large` rules set them on `<body>`. CSS custom properties don't propagate upward, so the timeline always used the `:root` defaults. Fixed by reading from `document.body`.
- **Settings panel didn't visually update** — `renderSidebar()` had a guard that skipped re-rendering the settings tab if it was already shown. The guard now clears when changing preferences.
- **French language fully broken** — an unescaped apostrophe in `d'arrivée` caused a `SyntaxError` that prevented the entire French language file from loading. All 2,644 French translations fell back to English. Fixed.
- **Language switching race condition** — `_loadLang()` had no deduplication for in-flight requests; `setPref('language', 'fr')` triggered two parallel script loads. Added `_langLoading{}` map and reordered the await.
- **Print tool didn't work** — `printTimeline()` was referenced via `data-action` but never defined. The `_bindActions` dispatcher silently ignored it.
- **OIDC token replay** — `iat` claim was extracted but never validated. Now rejects tokens issued more than 12 minutes ago.
- **Diary XSS hardening** — `javascript:` removal was case-sensitive and missed `vbscript:`/`data:`. Replaced with case-insensitive multi-protocol removal.
- **Hardcoded role string checks** in 12+ frontend and 5+ backend locations replaced with capability-aware logic.
- **9 missing function implementations** in settings UI (artificial time, group label, user label, operation mode, timezone, exercise index info, detached checklists). All now functional.
- **Export stubs fixed** — log export CSV/XML were dumping JSON; main export had no XML/KML handlers; PVA modal had no `openPVAModal()` or `exportPVAReport()` function. All now fully implemented.
- **'rivate' label** in edit layer modal — `t('layer_visibility_private').replace(/^./, '')` was stripping the first character and using the wrong key. Fixed.

---

## i18n Improvements

- **66 missing French translations** added (all spreadsheet keys + `btn_copy`)
- **17 message archive / infomanagement keys** added to all 19 languages: `message_archive_title`, `message_archive_add`, `message_archive_local`, `message_archive_incoming`, `message_archive_empty`, `message_archive_subject_prompt`, `message_archive_body_prompt`, `ref_index`, `ref_type`, `ref_languages`, `ref_category`, `search`, `unknown`, `uploading`, `description`, `btn_download`
- **10 analysis keys** + **18 question type labels** (`qtype_*`) added — analysis modal no longer shows raw `free_text`/`scale_0_3` strings
- **Layer modal Visibility label** ("rivate" bug) — added new `layer_visibility` key and proper option labels
- **Print dialog i18n** — 11 new keys (`print_dialog_title`, `print_view_calendar`, `print_view_list`, `print_layers`, etc.) translated to all 19 languages
- **Boards print dialog** — 6 new keys (`boards_print_overview`, `boards_print_detailed`, etc.)
- **Offline notification messages** — `offline_warning`, `online_restored`, `data_synced`, `sync_partial_fail` translated
- **List view labels** — `lv_all_layers`, `lv_all_responsible`, `lv_no_layers`, `lv_layers_selected` added
- **Settings min-event-height** + **start/end shape selector** — 9 new keys

---

## Security

A comprehensive three-part security audit (authentication, injection/input validation, authorization/access control) was performed. Findings:

- **Critical fixed**: Log book attachment download missing auth check, group member list IDOR
- **High/medium fixed**: OIDC `iat` validation, diary XSS hardening, custom role authorization gaps across all handlers
- **Verified secure (no fix needed)**: XSS protection (`stripHTMLTags`/`sanitizeRichHTML`), path traversal (all use `filepath.Base()`), SSRF (private IPs blocked via `newSSRFSafeTransport`), command injection (no user input in `exec`), XXE (no unsafe XML unmarshaling), session security (bcrypt, HttpOnly, SameSite=Strict, CSRF double-submit), file upload safety (dangerous extensions blocked, size limits)

---

## Backend Changes

- **`effectiveHasRole(user, role)`** — new middleware function that checks built-in role hierarchy first, then computes effective level from custom role capabilities
- **`customRoleLevel(user)`** — new helper that maps a custom role's capabilities to a numeric level (1-4)
- **`canWriteLayer()`** — now also accepts users with `manage_layers` capability
- **`visibleLayerSet()`** — now also returns nil (all layers) for users with `manage_layers` capability
- **`handleBulkMoveEvents()`** — new endpoint at `POST /api/layers/bulk-move`
- **`findLayerByName()`** — new helper for case-insensitive layer name lookup
- **`handleCreateGroup()`** — checks for existing layer with same name before auto-creating to prevent duplicates
- **`handleExport()`** — added XML and KML format support
- **`writeLogCSV()`** — proper CSV serialization for log exports (was dumping JSON)
- **3 new event types** seeded as system types: `starting_point`, `ending_point`, `transport`
- **Backup file lists** updated to include key terrain data
- **Confidential event filter, decision review, share link access, diary edit/delete, board access, spreadsheet visibility, key terrain access** — all converted to `app.effectiveHasRole()` for custom role support

---

## Frontend Changes

- New page: `static/key-terrain-popup.html` and `static/key-terrain-popup.js` for the standalone Key Terrain Board
- New file: `static/lang/*` — added 100+ new translation keys across 19 language files
- `getRangeDays()` honors `state._printDays` override for custom print ranges
- `applyPreferences()` reads CSS variables from `document.body` instead of `document.documentElement`
- New event delegation system for tooltip rendering on `.event-block`

---

*Full documentation: [README.md](../README.md) | [User Manual](USER_MANUAL.md)*
