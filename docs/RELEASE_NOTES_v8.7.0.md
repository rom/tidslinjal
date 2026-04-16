# Release Notes — Tidslinjal v8.7.0

**Release Date:** 2026-04-16

v8.7.0 is a focused feature release for the **Request For Information (RFI)** and **Poll / Multipoll** tools, plus several cross-cutting quality-of-life improvements: Decision cross-references can now link to other decisions, ZULU/UTC clocks always render with `:` separators, and a large batch of Settings strings that were displayed in English for non-English users have been properly translated.

Upgrading from 8.6.0 requires no data migration. Existing `rfis.json` and `polls.json` files are forward-compatible — every new field (sequence number, colour, references, closed reason) is optional, and legacy records get a sequence number lazily assigned on first read.

---

## New Features

### Request For Information (RFI) — overhauled

The RFI tool is now a full-fledged record-keeping system, not just a live popup.

**Auto-close & unanswered tracking**
- When the deadline on an RFI passes, the server-side scheduler auto-closes the request and flips every still-pending respondent's status from `pending` to `unanswered`. Manual close also marks unanswered respondents.
- The audit log records each close with the count of respondents who did not answer ("RFI EX1-RFI-2026-007 auto-closed at deadline — 3 respondent(s) did not answer").
- The RFI card explicitly calls out "❌ Unanswered (3): Alice, Bob, …" so the requester can see who missed the deadline.

**Stable request IDs**
- Every new RFI is labelled `<exercisename>-RFI-<year>-<NNN>` (e.g. `EX1-RFI-2026-007`), mirroring the decision-log sequence scheme. Legacy RFIs receive a label lazily when listed so the column is never blank.

**Rich text + colour + references**
- The question field now uses the shared diary-style rich-text editor (bold / italic / lists / links / images), sanitised server-side via `sanitizeRichHTML`. Responses use the same editor.
- Background colour swatches (matching the decision log palette) are available when creating an RFI and are rendered on the card.
- Cross-references can be added to Log Book / Diary / Decision / Event entries and appear as clickable chips that open the target tool.

**Requester-initiated delete**
- The requester (or an admin) can permanently delete an RFI and its response history from the log with a confirm dialog. Deletion is recorded in the audit trail and broadcast via a new `rfi_deleted` SSE event so other clients refresh instantly.

**Search / filter / export / print**
- New search box over question text, respondent names, and sequence number.
- Filter tabs: All / Open / Closed / Unanswered.
- CSV export (one row per respondent, UTF-8 BOM-prefixed, survives Excel).
- Per-entry 🖨 print and "Print All" with a filter-aware print stylesheet.

### Poll / Multipoll — new question types & metadata

**Two new question types**
- **Scale 0–10** — an 11-button strip. The aggregated result table colours cells green (≤2) / yellow (≤5) / orange (≤8) / red (≥9).
- **Low / Medium / High / Critical** — severity buttons with matching background colours (green / yellow / orange / red) on both the response form and the result grid.

**Sequence numbers**
- Each poll is labelled `<exercisename>-Poll-<year>-<NNN>`, shown in the header of both the sidebar poll log and the main polls modal. Legacy polls are labelled lazily when read.

**Creator attribution**
- The poll header now shows "👤 By: <name>" alongside the started-at timestamp in every view, so the log always answers "who ran this poll".

### Decision cross-references — link to earlier decisions

The Decision Log's reference picker (both the create-form and the edit-form) now offers **Decision** alongside Log Book / Diary / Event. Clicking a decision reference opens the Decision Log and briefly highlights the target entry with an accent outline. Backend `DecisionReference.Type` accepts the new `decision` value with no schema change.

---

## Improvements

### ZULU / UTC clocks always use `:`

The main header clock, the Clocks popup (12-hour and 24-hour layouts), and the detached clock now render ZULU time as `HH:MM:SSZ` (e.g. `14:23:05Z`) instead of the previous `HHMMSSZ`. Local-time formatting continues to honour the user's `time_separator` preference (`:` vs `.`); only ZULU is forced to colons because operators expect that separator from military / NATO clock displays.

### Settings panel — properly translated

A large sweep of Settings strings that were showing English to users of `hu`, `is`, `ja`, `ko`, and `nl` are now translated into the user's language. Touched keys include:

- Color-blind Safe Palette (and description)
- Tooltip Hover Delay
- Confirm Before Drag-Move (and description)
- Default Event Type
- Workspace Presets (and description)
- Log Book — Decisions (and description, "hide decisions" toggle)
- Clock Flags (description, "Add flags on clocks" toggle)
- Day Visualisation
- Quick Response Receiver (info + description)
- Vertical Spacing (description + info)
- Hover Zoom (description + info)
- Auto-busy on activities (description + info)
- Country code format (ISO 3166-1), 2-letter, 3-letter
- Startup Message (description, placeholder, Save, Clear)
- Links & URLs, Welcome / Help / Training / Demo URL
- Date / Time Format, Time Format, Time Separator, Week Starts On
- Real-time clock time format, Local time

Approximately 200 strings across the 5 languages went from hard-coded English fallback to native translations.

### New i18n keys (all 20 languages)

Added for the RFI rewrite:
`rfi_title`, `rfi_question`, `rfi_question_placeholder`, `rfi_question_required`, `rfi_target`, `rfi_target_required`, `rfi_all`, `rfi_all_desc`, `rfi_deadline`, `rfi_deadline_at`, `rfi_schedule`, `rfi_send`, `rfi_sent`, `rfi_close`, `rfi_closed`, `rfi_closed_success`, `rfi_open`, `rfi_filter_open`, `rfi_filter_closed`, `rfi_filter_unanswered`, `rfi_search_placeholder`, `rfi_references`, `rfi_responded`, `rfi_pending`, `rfi_unanswered`, `rfi_responses`, `rfi_response_placeholder`, `rfi_response_sent`, `rfi_submit`, `rfi_popup_title`, `rfi_popup_asks`, `rfi_empty`, `rfi_entries`, `rfi_deleted`, `rfi_delete_confirm`.

Added for the Poll update:
`poll_type_scale_0_10`, `poll_type_severity`, `severity_low`, `severity_medium`, `severity_high`, `severity_critical`, `poll_created_by`.

Added for offline mode & push notifications (previously hard-coded English in `offline.js`):
`settings_push_notifications`, `offline_banner`, `offline_mode_enabled`, `online_mode_restored`.

Every new key has a native translation in all 20 supported languages and every language file parses cleanly under `node --check`.

---

## Bug Fixes

- **RFI response XSS** — the free-text response is now sanitised server-side via `sanitizeRichHTML` before it is broadcast or rendered, closing a stored-XSS path in the response popup.
- **Offline banner hard-coded in English** — `offline.js` now routes its banner and state-transition notifications through `t()` with native translations in every language.
- **Question text strip** — `stripHTMLTags(req.Question)` was downgrading rich-text RFI questions to plain text when created. Replaced with `sanitizeRichHTML` so bold, links, and lists survive.

---

## Tests

- Go build green; `go test -short ./...` all green.
- Every language file verified to parse under `node --check`.

---

## Upgrading

No schema changes. First start after the upgrade:

1. Existing `rfis.json` and `polls.json` files load cleanly. Each RFI/Poll record receives a sequence number lazily when listed.
2. The new RFI auto-close behaviour runs on the regular 10-second scheduler tick. RFIs that are already past their deadline will be auto-closed (with unanswered respondents flagged) on the first scheduler tick after startup.
3. Downgrading to 8.6.0 is safe — v8.6.0 parsers will ignore the new `sequence_number`, `color`, `references`, `closed_reason` fields on RFIs, and the new `sequence_number` on polls; the on-disk files remain backward-compatible.

---
