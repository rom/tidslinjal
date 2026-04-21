# Release Notes — Tidslinjal v8.8.0

**Release Date:** 2026-04-20

v8.8.0 is a focused quality-of-life release across the **Event modal**, **Decision Log**, **Key Terrain Board**, and **Boards**. The Key Terrain Board gets the headline feature: a **Wayback Machine** that loads an earlier cycle's board straight into the main view, plus board-level **battle cycle protocols** hidden behind a collapsible bar.

Upgrading from 8.7.0 requires no data migration. The `KeyTerrainEntry` struct dropped its short-lived per-entry `Attachments` field in favour of a board-level list in `key_terrain_attachments.json`; the new file is created lazily on first upload.

---

## Headline features

### ⏪ Wayback Machine — replay an earlier Key Terrain Board

The existing snapshot scheduler (one JSON/CSV/XML/SVG per `(cycle_start, offset, format)` tuple) has always recorded full board state to disk. v8.8.0 finally surfaces it.

- A new **📜 History** button in the Battle Rhythm widget's control area opens the **Wayback Machine** modal.
- The modal lists every cycle that has at least one snapshot (newest first), with computed cycle index and wall-clock start, and one button per recorded snapshot offset+format.
- Click a JSON marker (e.g. `⏪ H+0 JSON`) to **load that historical KTB into the main view**. A yellow banner at the top of the board shows the cycle, offset, and the moment the snapshot was taken.
- While in wayback mode the board is fully read-only — Add, Edit, drag, ghost, archive, and the Settings panel are suppressed; live SSE refreshes are paused so the historical view doesn't move.
- **⏩ Return to live** restores the current state with one click — the live entries are stashed locally in the browser, no server round-trip is needed.
- CSV / XML / SVG markers download the raw snapshot file instead of loading it into the view.

Wayback requires snapshot offsets and at least the JSON format to be configured under *⚙ Settings → Battle Rhythm*.

### 📎 Battle cycle protocols — board-level attachments, collapsible

Operators can now keep a running log of meeting protocols and other per-cycle files directly on the Key Terrain Board — not tied to any single entry.

- A collapsed **Battle cycle protocols** bar sits directly below the Battle Rhythm widget. Click it to expand a scrollable list; click again to collapse. The bar's right side shows the protocol count and the current cycle number. Open/closed state persists in `localStorage`.
- Each protocol has a free-form **comment** pre-filled with *"Battle cycle N — meeting protocol"* using the live cycle number; edit before uploading if you want a different label.
- Every row records the uploader, timestamp, file size, and the cycle number that was active when the file was uploaded.
- Read-access users can download; upload and delete require write access. 10 MB max per file.
- New endpoints under `/api/key-terrain-attachments[/{filename}]`. Storage lives in `data/key_terrain_attachments.json` plus the shared `data/attachments/` directory.

### ✓ Accept button on Boards items

Board items now carry an **Accept** button alongside the existing `✖` (clear due date) button in the due-date row, so a task can be explicitly marked as handled.

- Clicking **✓ Accept** records who accepted the item and when, and writes a history entry.
- The button turns into a green **✓ Accepted · *name* · *date*** pill; clicking again un-accepts the item if it was accepted in error.
- New fields on `BoardItem`: `accepted_at`, `accepted_by_id`, `accepted_by_name` (all `omitempty`).
- New endpoints: `POST /api/board-items/{id}/accept` and `POST /api/board-items/{id}/unaccept`. Both require the caller's write access to the board. Handlers return the full refreshed `BoardItem` so the client can update local state without a follow-up round-trip.
- Accept/unaccept flushes any pending debounced inline save first so a concurrent PUT can't race with the action, and console-logs the underlying error on failure so network issues are easier to diagnose.

### 🔗 URL option for battle cycle protocols

The battle-cycle protocols pane now lets operators save a link instead of uploading a file, for the common case where the protocol already lives in Nextcloud, Google Drive, SharePoint, or another shared store.

- `KeyTerrainAttachment` grows a `URL` field; `StoredName` is now optional.
- `POST /api/key-terrain-attachments` accepts either a `multipart/form-data` file upload (existing flow) or an `application/json` body with `{url, filename?, comment?, cycle?}`. URL validation: `http`/`https` only, ≤2048 chars, parseable host; other schemes rejected with 400.
- The uploader row gains a `📎 Upload file` / `🔗 Save URL` mode toggle, persisted to `localStorage`.
- Attachment rows show `🔗` for URL records with the hostname in parentheses (e.g. *"(cloud.example.com)"*) so the target is obvious at a glance.

---

## Improvements

### Event modal — independent start/end time editing

Previously, changing the start time of an event always reset the end to `start + 1h`, clobbering any existing end value. The defaults have flipped:

- **Start and End are now independent**: changing one no longer touches the other.
- A new `Link Event Start/End Times` preference in the settings sidebar (off by default) re-enables a **duration-preserving** link — editing either side shifts the other by the same delta, rather than snapping to a fixed offset.
- Fixed a duplicate `eventStart` change listener in `modals.js` that had been ignoring the preference.

### Decision Log — editor clears after approve/deny

After a successful **✓ Approve / ✓⚠ Approve w/ Condition / ✓✏ Approve w/ Modification / ✗ Deny**, every input in the editor row is reset — not just the decision text. Title, reason, log type, group, executor, deadline, co-sign target, references, colour, attachments, and the rich-text body (including the contenteditable variant, which the old code silently missed) all clear, leaving the editor ready for the next entry.

### In-app help updated

Both the Key Terrain Board's own `?` help modal and the global Help modal (`#h-keyterrain`, `#h-events`, `#h-decisionlog`) now document:
- the protocols pane and its collapse/expand behaviour,
- the Wayback Machine,
- the independent start/end default on events,
- the decision-log editor-clear behaviour.

---

## API surface changes

### New

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/key-terrain-attachments` | List board-level attachments |
| `POST` | `/api/key-terrain-attachments` | Upload a new protocol (multipart: `file` + `comment` + `cycle`, **or** JSON `{url, filename?, comment?, cycle?}` for URL-only records) |
| `GET` | `/api/key-terrain-attachments/{filename}` | Download a protocol |
| `DELETE` | `/api/key-terrain-attachments/{filename}` | Remove a protocol |
| `POST` | `/api/board-items/{id}/accept` | Mark a board item as handled |
| `POST` | `/api/board-items/{id}/unaccept` | Reverse an accept |

### Removed

The short-lived per-entry endpoints introduced in the same branch (`/api/key-terrain-attachment/{id}[/{filename}]`) are gone — replaced by the board-level routes above.

---

## Data-model changes

- `BoardItem` — added `accepted_at *time.Time`, `accepted_by_id int64`, `accepted_by_name string`.
- `UserPreferences` — added `LinkEventTimes bool` (default false).
- `KeyTerrainEntry` — removed the short-lived `Attachments` field.
- `KeyTerrainAttachment` — gained a `URL` field; `StoredName`, `Size`, and `MimeType` are now `omitempty` so URL-only records don't carry empty file metadata.
- `AlarmNotification` — gained a `Kind` field (`"invite"`, `"info"`, or empty for a real alarm).
- New top-level `Store.keyTerrainAttachments []KeyTerrainAttachment`, persisted to `key_terrain_attachments.json`.

All new struct fields use `omitempty`; legacy JSON files load cleanly with zero values.

---

## Bug fixes

- **"Not found" when acking an event invite** — the *You have been invited to: X* banner is fired over SSE with `alarm_id = 0` because there's no persisted alarm record. The banner's *✓ ACK* button posted to `/api/alarms/0/ack`, which correctly 404'd. Invites (and the similarly-shaped routed-event and @mention banners) now carry `Kind: "invite"` / `"info"`; the client swaps the *ACK* button for a local-only *Got it* that dismisses the banner without touching the server. Escalation-after-60s is also suppressed for these informational banners, and the `unackedAlarms` map uses a per-banner synthetic key so concurrent invites don't evict each other under the shared `alarm_id = 0`.
- **Board item Accept — "Failed to fetch" during a debounced inline save** — a pending `_inlineSaveTimer` PUT could race with the Accept POST. The accept/unaccept handlers now flush any pending inline save first, the server returns the refreshed `BoardItem`, and the client merges it into local state directly. The underlying error is also logged to the browser console on failure so the next time something trips this path it's easier to diagnose.

---

## Upgrading

No schema migrations. Existing `key_terrain.json`, `boards.json`, and `user_preferences.json` load unchanged. Downgrading to 8.7.0 is safe — the new fields are simply ignored, and the new attachments file stays on disk ready to be picked up on upgrade.
