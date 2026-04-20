# Tidslinjal

**Tidslinjal** ("timeline" in Swedish) is a collaborative operational timeline web application designed for geographically dispersed groups. It provides a shared, visual chronology and battle rhythm for operations planning, event coordination, and situational awareness — including support for military exercises, cyber incident response, and crisis management.

---

## Table of Contents

- [Features Overview](#features-overview)
- [Documentation](#documentation)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [Configuration](#configuration)
- [Access Control](#access-control)
- [Data Files](#data-files)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Example Templates](#example-templates)
- [Changelog](#changelog)

---

## Features Overview

### Timeline Visualization

- **Graphical grid view** — days left to right, time-of-day top to bottom (24-hour)
- **Configurable resolution** — 10-minute, 15-minute, hourly, or full-day slots
- **Drag-to-zoom** — drag on the time column to scale slot heights; double-click to reset
- **Drag-to-reschedule** — drag event blocks to move them to a new time
- **Display range options** — Day, 2 Days, 3 Days, 4 Days, 5 Days, Week, 2 Weeks, 3 Weeks, Month, 2–3 Months
- **Live current-time indicator** — red line across the grid, updated every 30 s
- **List / table view** — alternative to the grid view; sortable columns, full-text search, date range picker, responsible filter, type filter, status filter, inline delete with undo, and meeting URL quick-link buttons
- **Multi-select events** — Ctrl+click to select multiple events; a floating bar shows count with Move and Clear actions
- **Right-click context menu** — "Move to new time/date" for single or multi-selected events

### Event Management & Status Workflow

Twelve built-in event types (plus custom types created via the type editor):

| Icon | Type | Description | Default Color |
|---|---|---|---|
| — | **Event** | General occurrence | Blue |
| ⚡ | **Instant** | Single-point-in-time marker (no end time) | Orange |
| 🤝 | **Meeting** | Scheduled meeting | Grey |
| 🏢 | **Physical Meeting** | In-person meeting at a specific location; stores lat/lng for map view | Burnt Orange |
| ⚖️ | **Decision** | Decision point | Green |
| ⏰ | **Deadline** | Hard deadline | Red |
| — | **Activity** | Planned work | Light Green |
| 🔄 | **Repeated** | Recurring activity template | Purple |
| 📊 | **Reporting** | Report / briefing | Teal |
| 📌 | **Assigned Task** | Delegated task | Orange |
| 🧍 | **Standing Meeting** | Short daily stand-up meeting | Cyan |

Each event carries:

- Title, description, type, custom color
- Start time and optional end time; optional recurrence
- **Participant** — intern, extern, or none
- **Responsible** — assigned user (defaults to creator)
- **Invited** — multi-select users and groups (notified on creation)
- **Inline alarm** — set alarm at creation/edit time for yourself or all invited persons
- **Day-only** — no specific time (shown in the all-day area)
- Layer assignment (master timeline or a named layer)
- **Status** — planned / active / responded_to / completed / submitted / verified / rejected / cancelled
- File attachments (up to 25 MB per file)
- **Dependencies** — link events so rescheduling one cascades to dependants (BFS propagation)
- **Location coordinates** (Physical Meeting) — latitude/longitude stored and shown on an interactive map modal

### Event Versioning & History

Every save creates a snapshot of the event before the edit. Users can open the **Version History** modal on any event to browse and compare previous states. Versions are stored in `event_versions.json`.

### Real-Time Collaborative Editing

When a user opens an event for editing, an in-memory editing lock (2-minute TTL) is acquired and broadcast via SSE so other users see who is currently editing. The lock is released automatically on save, cancel, or TTL expiry.

### Planned vs. Actual (PVA)

On the first edit of an event, its original start/end times are captured as `planned_start` / `planned_end`. The **PVA modal** shows the difference between planned and actual times side by side, including slip duration. Available as a report type.

### Critical Path Analysis

Client-side computation of the longest dependency chain across all events. Highlighted on the timeline and available as a dedicated report. Uses memoised longest-path over the `depends_on` DAG.

### Map Integration

Physical Meeting events with a latitude/longitude can be opened in an interactive **Leaflet.js map modal**, showing the event location on an OpenStreetMap tile layer. The map also supports:

- **Detachable map window** — open the full map projection in a separate browser window
- **Resource overlays** — rooms, buildings, IT services, and data centers plotted as map markers with layer toggles
- **Multiple tile layers** — OpenStreetMap, Topographic, Satellite, and Dark themes
- **Address search** — geocoded address lookup with zoom-to-location
- **GeoJSON/KML import** — load external geographic data files onto the map
- **User & meeting markers** — display user locations and physical meeting locations
- **Fit All** — auto-zoom to show all visible markers

### Decision Log

A structured decision-tracking system accessible from the sidebar:

- Decisions with title, description, rationale, status, and responsible person
- Status workflow: Proposed → Approved / Rejected
- File attachments on decisions
- Detachable to a standalone browser window
- Full i18n support (20 languages)

### Log Book

Chronological activity log for recording operational events, observations, and notes during exercises or incidents.

### Resource Management

Manage operational resources from the sidebar Resources tab:

- **Resource types** — Rooms, Buildings, Computer Services, Data Centers
- **Resource details** — name, description, location (lat/lng), image upload, symbol/icon selection
- **Map integration** — resources displayed as overlay markers on the map projection
- **Room types** — categorize rooms by function

### Polls & Multipoll

A survey system for operational awareness, accessible from the Tools sidebar tab:

- **Multipoll** — send a poll with one or more questions to users, groups, or roles
- **Question types** — scale (0–3), yes/no, and free text
- **Standard questions** — pre-built stress assessment, situational control, and assistance request questions
- **Custom questions** — define your own questions with any response type
- **Real-time tracking** — see who has responded vs. not responded, with response timestamps
- **Reminders** — send reminders to non-responders
- **Pollster log** — all completed polls with questions, responses, and timestamps are stored for review
- **Poll report** — summary of polls with aggregated responses, available as a report type
- Requires Team Lead+ role to create polls

### Ready Checks

Two types of readiness verification:

- **Activity Ready Check** — verify that all activities have been moved from "planned" status before an operation starts; supports force-activate of all planned activities; can be configured to run automatically at a specific time or N minutes before epoch
- **Person Ready Check** — request all participants to confirm their readiness with traffic-light indicators (green = ready, red = not ready, yellow = pending); supports individual, group, and role-based selection; timed checks can be scheduled for a future date/time; includes optional custom messages

### Day Labels

Custom labels that can be placed on specific days in the timeline header:

- Configurable text, text color, background color, font size, and font weight
- Useful for marking special days (D-Day, H-Hour, milestone markers)

### Resource Notes & Stars

- **Notes** — add timestamped notes to resources (performance reviews, team spirit observations, achievements)
- **Stars** — award recognition stars to resources with configurable visibility (global, team, role, or private)

### Startup Message (MOTD)

Administrators can configure a startup message displayed to all users when they log in, useful for announcements, exercise briefings, or status updates.

### Countdown & Timer System

Enhanced clock system with multiple clock types and a redesigned detached clock window:

- **Countdown timers** — set target time or duration; visual progress bar; alarm on expiry; acknowledge workflow; detachable to standalone window
- **Stopwatch timers** — configurable target duration (hours/minutes/seconds); preset buttons (5/10/15/30/60 min); option to stop or continue after target; audible alarm with sound selection; progress bar with overtime indicator; detachable to standalone window
- **Alarm clocks** — set absolute or exercise-epoch-relative alarms; audible alert with selectable sound; pulsing indicator when triggered
- **Phase clocks** — visualize exercise phases with progress bars showing elapsed time within each phase
- **Narrative clocks** — display a scrolling narrative log of recent events and activities
- **F1 start clocks** — Formula 1-style start sequence with configurable light count (3-7), countdown timer, and go signal
- **Synthetic exercise clock** — shows elapsed time since exercise epoch (H+00:00:00 format)
- **Color pickers** — customize background, countdown accent, timer accent, and alarm accent colors from the clock toolbar
- **VCR seven-segment display** — retro digital clock styling with configurable colors and segment thickness
- **Redesigned detached clock window** — collapsible settings panel with gear button; display mode (digital/analog/VCR), size slider (XS to XXL), style selector (standard/minimal/compact), time format (local/ZULU, 24h/12h), and add buttons for all clock types
- **Drag-to-detach** — drag any clock card to the edge of the window to open it in its own standalone popup
- **Per-clock color pickers** — hover over any clock card to access individual background color customization
- **Country flag backgrounds** — timezone clocks can show a watermark flag of the associated country
- **Clock pinning** — pin clocks to the main Tidslinjal window via BroadcastChannel sync

### Checklists

Operational checklists for tracking structured tasks:

- **26 built-in templates** organized into 5 categories:
  - **Generic** — Meeting Preparation, Project Kickoff, Decision Log Entry, Weekly Review, Onboarding New Member
  - **Exercise** — Exercise Setup, STARTEX, ENDEX, Observer Checklist, Inject Preparation, After Action Review Prep
  - **Incident** — Initial Response, Incident Handover, Incident Closure, Crisis Communication
  - **Operations** — TeamLead Battle Rhythm Prep, Shift Handover, Team Status Assessment, Team Briefing, Team Coordination Check, Daily Standup, Communication Check
  - **Tidslinjal** — Initial Setup, Pre-Event Check, Data Export, Upgrade
- **Custom templates** — create your own checklist templates with named items and categories
- **Checklist instances** — start a checklist from any template; track per-item check/skip states with user attribution and timestamps
- **Category grouping** — items within a checklist are grouped by category headers
- **Progress tracking** — real-time progress bar with percentage; skipped items contribute to completion
- **Completion workflow** — mark complete when all items are checked/skipped; reopen if needed
- **Sidebar integration** — active and completed checklists shown in the Checklists sidebar tab
- **Audit logging** — all checklist lifecycle events are logged

### Layers

Named overlays on top of the master timeline:

- **Private** — owner only
- **Groups** — shared with specific user groups (read or read/write)
- **Public** — visible to all authenticated users

Toggle layers on/off with the **🗂 Layers** toolbar button; changes are instant and saved per user.

### Templates

Save and reuse sets of events, phases, locks, groups, and layers:

- **Save** — choose a date range; events, phases, and locks within that range are stored with relative offsets from the earliest event; groups and layers are optionally included; role configurations, theme, size, language, operation mode, and terminology labels are optionally saved
- **Apply** — enter the **STARTEX / T=0** datetime; all events, phases, and locks re-created offset from that moment; groups and layers re-created; user preferences (theme, size, language) and exercise settings (operation mode, terminology) applied automatically
- **Import from file** — load `.json` files from disk or from the `example-templates/` directory
- **Scope** — Private (your eyes only) or Public (visible to all users)
- Only Ops Lead+ may create public templates with master-timeline events

### Personal Alarms & Webhooks

- Per-user reminder on any event (lead times: at time, 5 / 10 / 15 / 30 / 60 / 120 min before)
- Set alarm **inline** while creating/editing an event, or from the event Detail view
- Ops Lead+ can notify all invited persons when setting an inline alarm
- Delivered via **SSE** in real time; optional browser push notification
- Notification popup shows **Dismiss**, **📋 Show Event**, **ACK**, and **Enter Meeting** (for events with a meeting URL) buttons
- Unacknowledged alarms escalate (orange → pulsing red every 60 s); a live seconds-since counter is shown in the notification
- Alarm scheduler polls every **5 s** for precise trigger timing
- **Alarm audit trail** — every ACK records who acknowledged it, when, and from which IP address
- **Webhook integration** — per-user webhook URL fires on alarm trigger
  - Supports Mattermost, Slack (`{"text":"..."}`) or generic JSON POST

### Reports

Generate printable or exportable reports via the **Reports** toolbar button:

| Report Type | Description |
|---|---|
| **Overview** | All events in the current view range |
| **Status Summary** | Event counts grouped by status |
| **Daily Briefing** | Events grouped by day |
| **Type Breakdown** | Event counts grouped by type |
| **Responsible** | Events grouped by responsible user |
| **Planned vs. Actual** | Slip analysis for all events with a planning baseline |
| **Critical Path** | Longest dependency chain, highlighted |

Roles with the `report` or `auto_report` capability can generate and schedule automatic reports. Auto-report scheduling runs every 5 minutes in the background (stored per user in localStorage).

### SMTP Mail

Configure outgoing email for alarms, report delivery, invitations, and password-reset tokens in the **Integrations** sidebar tab. Supports STARTTLS and TLS modes. Fields:

- SMTP host, port, username, password
- From address, display name
- TLS mode (none / STARTTLS / TLS)
- Test button to send a verification email

### API Keys

Generate bearer tokens for external tool integration in the **Integrations** sidebar tab. Tokens are passed as `Authorization: Bearer <token>` and grant the same access level as the generating user.

### WebCal Subscription

Each user can generate a personal WebCal token from their **Profile** modal. External calendar clients (Outlook, Apple Calendar, Google Calendar) can subscribe to the feed at:

```
/webcal/<token>.ics
```

The feed returns all events the user can see in iCalendar format, updated on every request.

### Backup & Restore

Admins can download a ZIP archive of all JSON data files via **Admin → Backup**. A backup ZIP can be uploaded to **Admin → Restore** to overwrite the current data (requires confirmation).

### Audit Log

Every create, update, delete, verify, reject, and alarm-acknowledge action is logged. Accessible by Team Leads and above in the **Audit** sidebar tab. Capped at 10,000 most-recent entries.

### Synthetic / Exercise Time

- Ops Lead+ sets an **exercise epoch** (real datetime = Day 1 T+0), an optional exercise name, and an optional ENDEX
- Users toggle "exercise time mode" with the **🕐 T+** toolbar button
- Day headers display "Day N" (Day −1, Day 0, Day 1 … all supported)
- **Day-hours-only** option counts H+N only within configured day hours
- **Include weekends** option — when disabled, weekend days are skipped in H+N counting; weekend columns are dimmed with a hatched pattern
- **Freeze / pause** timeline progression for planning reviews

### Operation Modes & Terminology

The application adapts its labels based on the configured mode (set in Settings by Ops Lead+):

| Setting | Options |
|---|---|
| **Operation mode** | Exercise / Incident / Operation |
| **Group label** | Group / Unit / Team |
| **User label** | Users / Soldiers / Personnel |

Labels affect STARTEX/ENDEX field names, sidebar tabs, filter headings, and report headers. Templates carry these settings so they apply automatically on template import.

### Integrations

The **Integrations** sidebar tab (Admin / Ops Lead) contains:

- **OIDC SSO** — configure issuer URL, client ID/secret, redirect URL, exclusive mode, default role (see [OIDC/SSO](#oidc--sso))
- **SMTP Mail** — outgoing email settings
- **Microsoft Teams** — tenant / channel webhook; generates deep-link join buttons on Meeting-type events
- **Zoom** — meeting link pattern; generates deep-link join buttons on Meeting-type events
- **API Keys** — generate and revoke bearer tokens

### User Profile

Each user can open their **Profile** modal to:

- Update display name and email
- Change password
- View last login time, IP address, and resolved hostname
- View account type (local or OIDC SSO)
- View group memberships and J-level designation
- Set social handles (Mattermost username, Discord tag, Signal number)
- Generate / regenerate their personal WebCal token

### Filter Presets

Save named filter combinations (event type, status, layer, responsible user, search text) as presets stored server-side per user. Load any preset with one click from the filter bar.

### Multi-Timezone Clocks

Click the **+** button left of the main clock to add extra real-time clocks for any IANA timezone. Each shows a label, live time, and timezone abbreviation. Remove with **×**. Saved per user. Timezone is picked via a searchable city/country autocomplete input.

Click the **⧉** button to **detach all clocks to a separate browser window** — useful for displaying the clock on a secondary monitor or a dedicated screen during exercises or incidents.

### Phases

Visual colored bands overlaid on the timeline marking exercise phases (e.g. STARTEX → ENDEX). Team Lead+ can create and edit phases; phases can be attached to specific layers. Phases are included when saving/applying templates.

### Locks

Ops Lead+ (and Team Lead, with the `can_lock` capability) can lock time slots to prevent event creation or editing during that period. Lock creation and deletion are undoable (Ctrl+Z).

### Internationalization

Full UI translation in **20 languages**:

| Code | Language | Locale |
|------|----------|--------|
| `en` | English | en-GB |
| `sv` | Svenska (Swedish) | sv-SE |
| `fr` | Français (French) | fr-FR |
| `fi` | Suomi (Finnish) | fi-FI |
| `da` | Dansk (Danish) | da-DK |
| `nb` | Norsk Bokmål (Norwegian) | nb-NO |
| `et` | Eesti (Estonian) | et-EE |
| `lv` | Latviešu (Latvian) | lv-LV |
| `lt` | Lietuvių (Lithuanian) | lt-LT |
| `it` | Italiano (Italian) | it-IT |
| `es` | Español (Spanish) | es-ES |
| `pt` | Português (Portuguese) | pt-PT |
| `pl` | Polski (Polish) | pl-PL |
| `uk` | Українська (Ukrainian) | uk-UA |
| `hu` | Magyar (Hungarian) | hu-HU |
| `de` | Deutsch (German) | de-DE |
| `nl` | Nederlands (Dutch) | nl-NL |
| `is` | Íslenska (Icelandic) | is-IS |
| `ja` | 日本語 (Japanese) | ja-JP |
| `ko` | 한국어 (Korean) | ko-KR |

Language preference is saved per user. Administrators can restrict the available language set at startup using `--languages` or `--disable-languages` flags. English is always available as the fallback language.

### Settings & Preferences

User-configurable preferences (saved per user via the Settings sidebar tab):

- **Time format** — 12-hour or 24-hour clock (default: 24h)
- **DTG (Date-Time Group)** — military date format support (DDHHMMZmmmYY)
- **High-contrast mode** — accessibility overlay applied on top of any theme
- **Color-blind-safe palettes** — selectable modes for protanopia, deuteranopia, and tritanopia
- **Default landing view** — choose which view opens on login: grid, list, log book, decisions, map, or reports
- **Auto-follow "now"** — toggle to keep the current time centered on the timeline
- **Default timeline range** — preferred display range on load
- **Default time-slot resolution** — preferred slot granularity on load
- **Start-of-week** — Monday or Sunday
- **Tooltip hover delay** — configurable delay before event tooltips appear
- **Confirm before drag-move** — require confirmation dialog when drag-moving events
- **Default event type** — pre-selected event type for new events
- **Workspace presets** — save and restore complete workspace state (view, filters, layers, zoom level, clocks, sidebar tab)

### Welcome Banner

First-time login displays a configurable **welcome banner** with:

- Application description and version
- Welcome URL and help URL links
- Server uptime display

### Server Uptime

The **Legend** sidebar displays the current server uptime, showing how long the server has been running since last restart.

### Map Symbol Picker

The map draw-symbol mode includes a **symbol picker** for selecting from a library of map symbols when placing markers on the map projection.

### Alarm Improvements

- **"Enter Meeting" button** — alarm notifications for events with an associated meeting URL display an "Enter Meeting" button for one-click access to the meeting

### Reference Documents

A reference document management system for attaching and tracking operational documents:

- **Language metadata** — specify the language of each reference document
- **Automated file type detection** — automatic identification of file types (inspired by google/magika)
- **Copy modes** — central copy, local copy, or show link
- **Owner and custodian** — metadata fields for document accountability
- **Time added** — timestamp showing when the reference was added
- **Reference count** — track how many times a reference is linked
- **Cryptographic checksums** — compute and verify MD5, SHA-1, SHA-256, and SHA-512 checksums for document integrity
- **Bulk upload** — upload multiple reference documents at once
- **Reference edit modal** — edit reference metadata after creation
- **Checksum viewer modal** — view and verify all computed checksums for a reference

---

## Documentation

### User Manuals

Comprehensive user manuals are available in all 19 supported languages:

| Language | Manual |
|----------|--------|
| 🇬🇧 English | [USER_MANUAL.md](docs/USER_MANUAL.md) |
| 🇸🇪 Svenska (Swedish) | [USER_MANUAL_SV.md](docs/USER_MANUAL_SV.md) |
| 🇫🇷 Français (French) | [USER_MANUAL_FR.md](docs/USER_MANUAL_FR.md) |
| 🇫🇮 Suomi (Finnish) | [USER_MANUAL_FI.md](docs/USER_MANUAL_FI.md) |
| 🇩🇰 Dansk (Danish) | [USER_MANUAL_DA.md](docs/USER_MANUAL_DA.md) |
| 🇳🇴 Norsk Bokmål (Norwegian) | [USER_MANUAL_NB.md](docs/USER_MANUAL_NB.md) |
| 🇪🇪 Eesti (Estonian) | [USER_MANUAL_ET.md](docs/USER_MANUAL_ET.md) |
| 🇱🇻 Latviešu (Latvian) | [USER_MANUAL_LV.md](docs/USER_MANUAL_LV.md) |
| 🇱🇹 Lietuvių (Lithuanian) | [USER_MANUAL_LT.md](docs/USER_MANUAL_LT.md) |
| 🇮🇹 Italiano (Italian) | [USER_MANUAL_IT.md](docs/USER_MANUAL_IT.md) |
| 🇪🇸 Español (Spanish) | [USER_MANUAL_ES.md](docs/USER_MANUAL_ES.md) |
| 🇵🇹 Português (Portuguese) | [USER_MANUAL_PT.md](docs/USER_MANUAL_PT.md) |
| 🇵🇱 Polski (Polish) | [USER_MANUAL_PL.md](docs/USER_MANUAL_PL.md) |
| 🇺🇦 Українська (Ukrainian) | [USER_MANUAL_UK.md](docs/USER_MANUAL_UK.md) |
| 🇯🇵 日本語 (Japanese) | [USER_MANUAL_JA.md](docs/USER_MANUAL_JA.md) |
| 🇰🇷 한국어 (Korean) | [USER_MANUAL_KO.md](docs/USER_MANUAL_KO.md) |

### Technical Documentation

| Document | Description |
|----------|-------------|
| [OIDC.md](docs/OIDC.md) | Single Sign-On (OIDC) configuration guide |
| [TLS.md](docs/TLS.md) | HTTPS/TLS setup guide |
| [TESTS.md](docs/TESTS.md) | Testing guide |
| [SIMULATION_TESTS.md](docs/SIMULATION_TESTS.md) | Simulation test procedures |
| [PERFORMANCE_ANALYSIS.md](docs/PERFORMANCE_ANALYSIS.md) | Performance analysis and tuning |

### Training Materials

The `training/` directory contains structured training guides and example templates:

- **7 training guides** — from getting started to quick reference
- **31 example templates** — 20 military exercise scenarios + 11 incident response scenarios

---

## Getting Started

### Prerequisites

- Go 1.21 or newer

### Build & Run

```bash
git clone <repo-url>
cd tidslinjal
go build -o tidslinjal ./...
./tidslinjal
```

Open `http://localhost:8080` (or `https://localhost:443` if TLS is configured).

### Default Credentials

```
Username: admin
Password: admin
```

**Change the admin password after first login** (Admin → Users tab → edit admin).

---

## Configuration

### Command-Line Flags & Environment Variables

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--port` | `PORT` | `8080` (HTTP) / `443` (HTTPS) | TCP listen port |
| `--host` | `HOST` | `` (all interfaces) | Listen interface/address |
| `--data` | `DATA_DIR` | `data` | Data directory for JSON files and attachments |
| `--verbose` | — | `false` | Enable verbose log output |
| `--debug` | — | `false` | Enable debug log output (implies verbose) |
| `--tls-cert` | `TLS_CERT` | — | Path to TLS certificate file (enables HTTPS) |
| `--tls-key` | `TLS_KEY` | — | Path to TLS private key file |
| `--oidc-issuer` | `OIDC_ISSUER` | — | OIDC provider issuer URL |
| `--oidc-client-id` | `OIDC_CLIENT_ID` | — | OIDC client ID |
| `--oidc-client-secret` | `OIDC_CLIENT_SECRET` | — | OIDC client secret |
| `--oidc-redirect-url` | `OIDC_REDIRECT_URL` | — | OIDC redirect URL |
| `--oidc-exclusive` | `OIDC_EXCLUSIVE` | `false` | Disable local login for all users except admin |
| `--oidc-default-role` | `OIDC_DEFAULT_ROLE` | `readwrite` | Default role for auto-created OIDC users |
| `--syslog-host` | `SYSLOG_HOST` | — | Syslog server host (enables syslog forwarding) |
| `--syslog-port` | — | `514` / `6514` | Syslog server port (default 514 UDP/TCP, 6514 TLS) |
| `--syslog-transport` | `SYSLOG_TRANSPORT` | `udp` | Syslog transport: `udp` / `tcp` / `tls` |
| `--syslog-format` | `SYSLOG_FORMAT` | `classic` | Syslog message format: `classic` / `json` |
| `--languages` | `LANGUAGES` | _(all)_ | Comma-separated whitelist of enabled language codes (e.g. `en,sv,da`) |
| `--disable-languages` | `DISABLE_LANGUAGES` | _(none)_ | Comma-separated blacklist of language codes to disable (ignored if `--languages` is set) |

### TLS / HTTPS

Provide `--tls-cert` and `--tls-key` to enable HTTPS. When TLS is active, the server listens on port **443** by default (override with `--port`). TLS settings can also be configured at runtime in the admin UI (Admin → System → TLS Settings) — saved settings are loaded automatically on startup and also trigger the port-443 default.

```bash
./tidslinjal --tls-cert /etc/ssl/certs/server.crt --tls-key /etc/ssl/private/server.key
```

### OIDC / SSO

Pass OIDC flags at startup **or** configure via the Integrations tab at runtime (Admin only). Runtime settings are saved to `oidc.json` and take effect immediately; CLI flags override `oidc.json` at startup.

**Exclusive mode** (`--oidc-exclusive`) blocks username/password login for all non-admin accounts and auto-redirects the login page to the SSO provider.

Auto-created OIDC users receive the role set by `--oidc-default-role` (default: `readwrite`). Display names are synced from the IDP on every login.

---

## Access Control

### Roles

| Role | Key | Capabilities |
|---|---|---|
| **Observer** | `observer` | Read-only access to timeline and events — cannot edit, comment, set alarms, or lock slots |
| **Read** | `read` | View timeline, events, layers; set personal alarms; comment on events |
| **Reporter** | `reporter` | + Set event status to Responded To / Completed (requires Team Lead approval) |
| **Read/Write** | `readwrite` | + Create/edit own events on accessible layers; create event types and layers |
| **Staff Officer Assistant** | `staffofficer` | + Can lock time slots; access to reports; same authority level as Operations Lead |
| **Staff Officer** | `staffofficer_full` | Same as Staff Officer Assistant, requires at least one J-designation (J1–J9) to be assigned |
| **Team Lead** | `teamlead` | + Create groups; verify/reject events; manage phases and locks; approve reporter status changes; view audit log; auto-report scheduling |
| **Operations Lead** | `oplead` | + Create/edit/delete master-timeline events; manage activity settings; pause timeline; create public templates; create alarms for other users; configure integrations |
| **Admin** | `admin` | Full access — manage users, roles, locks, activity settings; backup/restore; OIDC configuration; export all data |

### J-Designations (Staff Officer role)

The **Staff Officer** (`staffofficer_full`) role requires at least one NATO J-designation to be assigned. Designations identify the staff branch:

| Code | Branch |
|---|---|
| J1 | Personnel |
| J2 | Intelligence |
| J3 | Operations |
| J4 | Logistics |
| J5 | Plans |
| J6 | Communications |
| J7 | Training |
| J8 | Finance |
| J9 | Civil-Military Cooperation |

J-designations are assigned via Admin → Users → edit user. They are stored in the user profile and displayed on the user badge.

### Role Editor

The **Role Editor** (Admin → Users tab → 🛡 Role Editor) lets admins customise display names and capability flags for every role except Admin. Role configurations are saved to `roles.json` and served from `/api/roles`. Role configs are optionally included when saving a template.

### Self-Registration Modes

Configured by Admin in the Users tab:

| Mode | Description |
|---|---|
| **Off** | Admin creates all accounts |
| **Open** | Anyone can register; account is immediately active |
| **Vetted** | Anyone can register; account must be approved by Admin |
| **Generic invitation** | A single invitation link grants registration |
| **Personal invitation** | Admin generates per-user invitation links |

---

## Usage Guide

### Navigating the Timeline

- **‹ / ›** — short click: step back/forward by current view span; long press (>400 ms): choose jump size (1 day / 2 days / 3 days / 1 week / 2 weeks)
- **Today** — jump to current date
- **⊙ Center** — center today in the view so dates before and after are visible
- **Show** dropdown — select date range (Day through 3 Months, plus 2-week and 3-week options)
- **Resolution** dropdown — select slot granularity (10 min / 15 min / 1 hr / Full day)
- **🕐 T+** button — toggle synthetic exercise time display (visible when an exercise is configured)
- **List view** button — switch between grid and table/list view

### Adding & Editing Events

1. Click any empty cell in the grid, or click **+ Add Event** in the toolbar
2. Fill in type, times, status, layer, responsible user, and optional invited persons
3. Enable **🔔 Set alarm** if you want a reminder; choose lead time and notify scope
4. Optionally add file attachments, event dependencies, or map coordinates
5. Click **Save**

To edit: click an existing event to open the Detail view, then click **Edit**. Collaborative editing awareness shows if another user is already editing the event.

### Event Dependencies

In the Edit modal, use the **Dependencies** field to link events. When you reschedule a parent event, a cascade dialog offers to shift all dependent events by the same offset (BFS traversal). The **Critical Path** report highlights the longest chain.

### Multi-Select & Bulk Move

- **Ctrl+click** events to add to selection
- A floating action bar shows the count; click **Move** to reposition all selected events by a chosen offset, or **Clear** to deselect

### Right-Click Context Menu

Right-click any event block for quick actions:

- **Move to new time/date** — opens a date/time dialog; works for single or multi-select (all selected events move by the same offset)
- **View history** — open the Version History modal
- **Delete** / **Edit**

### Version History

Click the **History** button in the event Detail view (or right-click → View history) to browse all previous snapshots. Each version shows who saved it and when.

### Map View (Physical Meeting)

Events of type "Physical Meeting" show a **🗺 Map** button in the Detail view. Click it to open a Leaflet map modal where you can view or set the event's latitude/longitude.

### Templates

1. Navigate to the date range with the events you want to template
2. Click **📋 Templates** → **💾 Save current events as template…**
3. Choose the date range, name the template, optionally add a description, choose Private or Public
4. To apply: click **▶ Apply** next to any template, choose a STARTEX base date/time, and click **Create Events**
5. To import from file: click **📂 Import from file** and select a `.json` template file

### Layers

1. Click **🗂 Layers** in the toolbar — popover shows all layers with checkboxes
2. Click any layer to instantly show/hide it on the timeline
3. Manage layers (create, edit, share with groups) in the **Layers** sidebar tab

### Filter Presets

1. Apply filters using the filter bar (event type, status, layer, responsible user, search text)
2. Click **💾 Save preset** to name and save the combination
3. Load any preset from the preset dropdown — presets are stored per user on the server

### Alarm & Webhook Notifications

1. Open the **Settings** sidebar tab
2. Enter a **Webhook URL** and select the format type (Mattermost/Slack or generic JSON)
3. Click **Test** to verify, then **Save**
4. Alarms fire via SSE in-app and via webhook simultaneously

### Reports

1. Click **Reports** in the toolbar
2. Select the report type from the dropdown
3. Choose date range and any filters
4. Click **Generate** to view; use the print/export button to save

### Exercise / Synthetic Time (Ops Lead+)

1. Open the **Settings** sidebar tab → Exercise Settings section
2. Enter the operation name, STARTEX (epoch), optional ENDEX, operation mode, and terminology labels
3. Check **Enable synthetic time display** and optionally configure day hours and weekend exclusion
4. Click **Save** — users see the **🕐 T+** button appear; click to toggle
5. Use **⏸ Pause** to freeze progression during planning reviews

### Backup & Restore (Admin)

- **Backup**: Admin → ⬇ Download backup — downloads a ZIP of all JSON data files
- **Restore**: Admin → ⬆ Restore from backup — upload a ZIP to overwrite all data (confirmation required)

### API Keys

1. Open the **Integrations** sidebar tab
2. Click **Generate new API key**
3. Copy the token and use it as `Authorization: Bearer <token>` in HTTP requests

### WebCal Subscription

1. Open your **Profile** modal (click your name in the header)
2. Click **Generate WebCal token**
3. Copy the subscription URL and add it to your external calendar client

### Audit Log (Team Lead+)

Open the **Audit** sidebar tab to see a timestamped list of all actions (creates, edits, deletes, status changes, alarm ACKs).

### Integrations (Admin / Ops Lead)

Open the **Integrations** sidebar tab to configure:

- **OIDC SSO** — live configuration without restart
- **SMTP mail** — enable email delivery for alarms, reports, invitations, and password resets
- **Microsoft Teams** — webhook URL for team notifications; generates join-link buttons on Meeting events
- **Zoom** — meeting link pattern; generates join-link buttons on Meeting events

---

## Data Files

All data is stored in `DATA_DIR` (default: `data/`):

```
data/
├── event_types.json      # Dynamic event type definitions
├── users.json            # User accounts
├── preferences.json      # Per-user UI preferences
├── groups.json           # User groups
├── memberships.json      # Group memberships
├── layers.json           # Timeline layers
├── events.json           # Timeline events
├── event_versions.json   # Event version snapshots (history)
├── attachments.json      # Attachment metadata
├── alarms.json           # Personal alarms
├── locks.json            # Locked time slots
├── sessions.json         # Active login sessions
├── audit.json            # Audit log (max 10 000 entries)
├── exercise.json         # Exercise / synthetic time settings
├── comments.json         # Event comments
├── phases.json           # Exercise phases
├── templates.json        # Event templates
├── roles.json            # Custom role configurations
├── registration.json     # Self-registration settings
├── invitations.json      # Pending user invitations
├── oidc.json             # OIDC SSO runtime configuration
├── mail.json             # SMTP mail configuration
├── apikeys.json          # API bearer tokens
├── filter_presets.json   # Per-user saved filter presets
├── security.json         # Password policy & session management
├── rate_limits.json      # Per-IP rate limiting thresholds
├── geoblocking.json      # Country-based access control
├── ip_blacklist.json     # IP deny list (addresses & CIDR ranges)
├── encryption.json       # Backup encryption settings
└── attachments/          # Uploaded files
```

Back up by copying the entire `data/` directory, or use the **Admin → Backup** ZIP download.

---

## API Reference

### Authentication

All endpoints (except `/api/version` and `/api/auth/login`) require an authenticated session cookie **or** an `Authorization: Bearer <api-key>` header.

### Endpoints

| Method | Path | Min Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Log in |
| `POST` | `/api/auth/logout` | Any | Log out |
| `GET` | `/api/auth/me` | Any | Current user info |
| `POST` | `/api/auth/change-password` | Any | Change own password |
| `POST` | `/api/auth/update-email` | Any | Update own email |
| `GET` | `/api/auth/oidc-config` | Public | OIDC provider info |
| `GET` | `/api/version` | Public | App version |
| `GET` | `/api/languages` | Public | Enabled language codes (JSON array) |
| `GET/PUT` | `/api/preferences` | Any | User preferences |
| `GET/PUT` | `/api/auth/profile` | Any | Social handles / profile fields |
| `GET` | `/api/event-types` | Public | List event types |
| `POST` | `/api/event-types` | RW+ | Create event type |
| `PUT` | `/api/event-types/:id` | Owner/Admin | Update event type |
| `DELETE` | `/api/event-types/:id` | Owner/Admin | Delete event type |
| `GET` | `/api/events?from=&to=` | Any | List events in range |
| `POST` | `/api/events` | RW+ | Create event |
| `PUT` | `/api/events/:id` | Creator/RW+ | Update event |
| `PATCH` | `/api/events/:id/status` | Various | Change status / verify / reject |
| `DELETE` | `/api/events/:id` | Creator/Admin | Delete event |
| `POST` | `/api/events/cascade` | RW+ | Cascade reschedule via dependency BFS |
| `GET` | `/api/events/:id/versions` | Any | Event version history |
| `GET/POST` | `/api/events/:id/attachments` | Any/Auth | List / upload attachment |
| `GET` | `/api/attachments/:id` | Any | Download attachment |
| `DELETE` | `/api/attachments/:id` | Owner/Admin | Delete attachment |
| `GET/POST` | `/api/events/:id/comments` | Any | List / add comments |
| `GET` | `/api/layers` | Any | Visible layers |
| `POST` | `/api/layers` | Any | Create layer |
| `PUT` | `/api/layers/:id` | Owner/Admin | Update layer |
| `DELETE` | `/api/layers/:id` | Owner/Admin | Delete layer |
| `GET/POST` | `/api/groups` | TeamLead+ | List / create groups |
| `PUT/DELETE` | `/api/groups/:id` | Admin | Update / delete group |
| `GET/POST` | `/api/groups/:id/members` | Admin | List / add members |
| `DELETE` | `/api/groups/:id/members/:uid` | Admin | Remove member |
| `GET/POST` | `/api/alarms` | Any | List / create alarms |
| `DELETE` | `/api/alarms/:id` | Owner | Delete alarm |
| `POST` | `/api/alarms/:id/ack` | Owner | Acknowledge alarm |
| `GET` | `/api/notifications/stream` | Any | SSE alarm + editing-lock stream |
| `GET/POST` | `/api/locks` | Any | List / create locks |
| `DELETE` | `/api/locks/:id` | Admin/CanLock | Delete lock |
| `GET/POST` | `/api/users` | Read+/Admin | List / create users |
| `PUT` | `/api/users/:id` | Admin/Self | Update user |
| `DELETE` | `/api/users/:id` | Admin | Delete user |
| `GET` | `/api/audit` | TeamLead+ | Audit log (newest first) |
| `GET` | `/api/exercise` | Any | Exercise settings |
| `PUT` | `/api/exercise` | OpLead+ | Update exercise settings |
| `GET` | `/api/phases` | Any | List phases |
| `POST` | `/api/phases` | TeamLead+ | Create phase |
| `PUT/DELETE` | `/api/phases/:id` | Creator/Admin | Update / delete phase |
| `GET` | `/api/export` | Any | Export data as JSON |
| `POST` | `/api/import` | Any | Import data from JSON |
| `GET` | `/api/templates` | Any | List templates |
| `POST` | `/api/templates` | Any | Create template |
| `DELETE` | `/api/templates/:id` | Owner/Admin | Delete template |
| `POST` | `/api/templates/:id/apply` | Any | Apply template to base time |
| `GET` | `/api/roles` | Any | List role configurations |
| `GET/PUT` | `/api/admin/oidc` | Admin | OIDC runtime configuration |
| `GET/POST` | `/api/integrations/mail` | Admin/OpLead | Mail configuration |
| `POST` | `/api/integrations/mail/test` | Admin/OpLead | Send test email |
| `GET/POST` | `/api/apikeys` | Any | List / create API keys |
| `DELETE` | `/api/apikeys/:id` | Owner | Delete API key |
| `GET/POST` | `/api/filter-presets` | Any | List / save filter presets |
| `DELETE` | `/api/filter-presets/:id` | Owner | Delete filter preset |
| `GET/POST` | `/api/editing-locks` | Any | Active collaborative editing locks |
| `GET/PUT` | `/api/admin/ip-blacklist` | Admin | IP blacklist settings |
| `POST` | `/api/admin/ip-blacklist/add` | Admin | Add IP to blacklist |
| `POST` | `/api/admin/ip-blacklist/remove` | Admin | Remove IP from blacklist |
| `GET` | `/api/admin/ip-blacklist/export` | Admin | Download blacklist JSON |
| `POST` | `/api/admin/ip-blacklist/import` | Admin | Import blacklist JSON |
| `GET` | `/api/backup` | Admin | Download data ZIP |
| `POST` | `/api/restore` | Admin | Restore from ZIP |
| `POST` | `/api/references/bulk` | RW+ | Bulk upload references |
| `GET` | `/api/references/:id/checksums` | Any | Compute/retrieve file checksums |
| `GET` | `/webcal/:token.ics` | Token | WebCal iCalendar feed |

---

## Architecture

```
tidslinjal/
├── main.go           # Server, routing, all HTTP handlers, SSE broker, alarm scheduler
├── models.go         # All data types, roles, event status, audit, exercise, templates
├── store.go          # Thread-safe JSON file store; all CRUD methods
├── go.mod / go.sum
├── example-templates/  # Ready-made exercise and incident response templates (31 total)
├── training/           # Training guides and reference materials
├── data/             # Runtime data (auto-created)
└── static/
    ├── index.html    # App shell with all modals
    ├── login.html    # Login page
    ├── i18n.js       # 19-language translation strings (EN/SV/FR/DE/NL/FI/IS/DA/NB/ET/LV/LT/IT/ES/PT/PL/UK/JA/KO)
    ├── app.js        # Timeline engine, all UI logic
    ├── modals.js     # Modal dialogs (settings, templates, profile, map, PVA…)
    ├── timeline.js   # Timeline rendering and event drawing
    ├── state.js      # Shared application state
    ├── api.js        # API client helpers
    ├── utils.js      # Clock, timezone, @mention autocomplete, utilities
    └── style.css     # 12 themes (dark, light, camo, sand, matrix, sunset, ocean, forest, accessible, crimson…), 4 size variants, mobile CSS
```

### Performance Characteristics

- **O(1) session and user lookups** — sessions and users indexed in hash maps
- **Write-after-unlock** — all store mutation methods release the global RWMutex before JSON I/O; a dedicated write mutex serialises disk writes
- **Per-user SSE index** — alarm notifications target specific users via O(1) map lookup
- **Bounded webhook worker pool** — 32 persistent goroutines handle alarm webhooks with drop-on-full back-pressure
- **HTTP server timeouts** — ReadTimeout 30 s, WriteTimeout 5 min (SSE), IdleTimeout 120 s, MaxHeaderBytes 1 MB
- Tested to sustain **1,000 concurrent users** (≈ 900 read-only + 100 writers) with sub-10 ms median latency on commodity hardware

---

## Example Templates

The `example-templates/` directory contains **31 ready-made templates**:

### Exercise Templates (20)

| Template | Duration | Hours |
|---|---|---|
| EX-01 Quick Reaction Force | 1 day | 0800–1700 |
| EX-02 Cyber Defence Sprint | 1 day | 0800–1700 |
| EX-03 Joint Command Post — Co-located | 2 days | 24/7 |
| EX-04 Urban Defence — Co-located | 2 days | 0800–1700 |
| EX-05 Distributed Command — Virtual | 2 days | 24/7 |
| EX-06 Staff Training — Virtual | 2 days | 0800–1700 |
| EX-07 Combined Arms Manoeuvre | 3 days | 24/7 + working hours |
| EX-08 Crisis Management Simulation | 3 days | 0800–1800 |
| EX-09 NATO Integration Exercise | 5 days | 24/7 + working hours |
| EX-10 Full Spectrum Warfare | 5 days | Mixed intensity |
| EX-11 Border Security Operation | 2 days | 24/7 |
| EX-12 Maritime Patrol & Interdiction | 3 days | 24/7 |
| EX-13 Civil-Military Cooperation | 4 days | 0800–2000 |
| EX-14 Logistics & Sustainment | 5 days | 0700–1900 |
| EX-15 Hostage Rescue Operation | 1 day | 0600–2000 |
| EX-16 CBRN / NBC Response | 2 days | 24/7 |
| EX-17 Information Operations | 3 days | 0800–1800 |
| EX-18 Air Defence Exercise | 2 days | 24/7 |
| EX-19 Peacekeeping & Stabilisation | 5 days | 0700–1900 |
| EX-20 Electronic Warfare | 3 days | 24/7 |

### Incident Response Templates (11)

| Template | Duration | Scenario |
|---|---|---|
| INC-01 DDoS Attack | 2 days | Volumetric DDoS response |
| INC-02 Targeted Hacker Attack | 4 days | Cyber intrusion response |
| INC-03 Large Hacker / APT Attack | 8 days | Nation-state intrusion, full IR |
| INC-04 Ransomware Attack | 2 weeks | Ransomware with negotiation decision point |
| INC-05 Wiper Malware Attack | 4 weeks | Destructive malware, full rebuild |
| INC-06 Datacenter Fire | 12 weeks | Physical disaster, DR activation, full recovery |
| INC-07 Supply Chain Attack | 3 weeks | Third-party vendor compromise |
| INC-08 Insider Threat | 2 weeks | Data exfiltration by departing employee |
| INC-09 Targeted Phishing / BEC | 1 week | AiTM phishing, business email compromise |
| INC-10 OT/ICS Cyber Attack | 10 days | SCADA/PLC attack on energy utility |
| INC-11 Cloud Infrastructure Breach | 5 days | AWS breach, crypto mining, S3 data exposure |

Incident templates use `operation_mode=incident`, include phases, automatic alarms on critical events, external stakeholder notifications, and post-incident review events.

See `example-templates/README.md` for detailed descriptions and loading instructions.

### Training Materials

The `training/` directory contains step-by-step training guides and reference materials:

| File | Contents |
|------|---------|
| `01-getting-started.md` | First login, navigation, creating events |
| `02-working-with-templates.md` | Loading, customising, and saving templates |
| `03-exercise-planning-guide.md` | Complete exercise planning workflow |
| `04-incident-response-guide.md` | Using Tidslinjal during live incidents |
| `05-collaboration-and-roles.md` | Roles, groups, layers, access control |
| `06-template-reference.md` | Reference card for all 31 templates |
| `07-quick-reference.md` | One-page cheat sheet |

---

## Changelog

### v8.8.0 — KTB Wayback Machine, cycle protocols, Boards accept, independent event times

A quality-of-life release across the Event modal, Decision Log, Key Terrain Board, and Boards.

- **⏪ Wayback Machine (Key Terrain Board)** — a new *📜 History* button in the Battle Rhythm widget opens a list of every cycle that has a saved snapshot on disk. Clicking a JSON marker loads that historical KTB straight into the main view; a yellow banner with a *Return to live* button lets the operator flip between past and present without losing context. Edit affordances and live SSE refreshes are suppressed while in wayback mode. CSV/XML/SVG markers fall back to a raw download. Reuses the existing per-minute snapshot scheduler — no new backend state.
- **📎 Battle cycle protocols** — board-level attachments on the Key Terrain Board (no longer per-entry). Collapsed by default behind a one-line *Battle cycle protocols · N files · Cycle X* bar directly below the Battle Rhythm widget; click to expand, click to collapse. Open/closed state persists in `localStorage`. Uploading a protocol pre-fills its comment with *"Battle cycle N — meeting protocol"* using the live cycle number, and records uploader + timestamp + cycle-at-upload. New endpoints under `/api/key-terrain-attachments[/{filename}]` with a companion `key_terrain_attachments.json` store file.
- **✓ Accept button on Boards items** — the due-date row now has a green *Accept* button alongside the existing *✖* (clear due date). Accepting records who accepted the item and when; the button turns into an *Accepted · name · date* pill that can also un-accept if pressed. New fields on `BoardItem`: `accepted_at`, `accepted_by_id`, `accepted_by_name` (all `omitempty`). New endpoints `POST /api/board-items/{id}/accept|unaccept`.
- **Independent event start/end times** — the event modal no longer snaps *end* to *start + 1 h* when *start* is edited. A new sidebar preference (*Link Event Start/End Times*, off by default) re-enables a duration-preserving link where editing either side shifts the other by the same delta. Fixed a stale duplicate `eventStart` listener in `modals.js` that had been overriding the preference.
- **Decision editor clears on approve/deny** — after pressing any of the four decision buttons (*✓ Approve*, *✓⚠ Approve w/ Condition*, *✓✏ Approve w/ Modification*, *✗ Deny*), every input in the editor row resets — decision body (rich-text and textarea variants both; the old code silently missed the contenteditable), title, reason, log type, group, executor, deadline, co-sign target, references, colour, and attachments. Leaves the editor ready for the next entry.
- **In-app help updated** — both the Key Terrain Board's own `?` help modal and the global Help modal (*Key Terrain Board*, *Working with Events*, *Decision Log* sections) now document every feature above, including the collapsible protocols pane, the Wayback Machine, the new event-time default, and the decision-log editor behaviour.

### v8.7.0 — RFI rewrite, Poll enhancements, Decision cross-refs, ZULU `:` separators

A focused feature release for the RFI and Poll / Multipoll tools, plus several cross-cutting quality-of-life fixes.

- **Request For Information (RFI) overhaul**
  - Auto-close on deadline: when an RFI deadline passes, the scheduler closes it and flips every still-pending respondent's status to `unanswered`. Manual close does the same. The audit log records the unanswered count.
  - Stable request IDs — every RFI is labelled `<exercisename>-RFI-<year>-<NNN>`. Legacy RFIs receive a label lazily when read.
  - Rich-text question + response (shared diary editor, sanitised server-side via `sanitizeRichHTML`), background-colour swatches matching the decision log, and cross-references to Log Book / Diary / Decision / Event entries.
  - Requester-initiated delete with audit-log entry and `rfi_deleted` SSE event.
  - Search (question text, respondent names, sequence number), filter tabs (All / Open / Closed / Unanswered), CSV export (one row per respondent, BOM-prefixed), and per-entry + "Print All" printing.
- **Poll / Multipoll**
  - Two new question types: **Scale 0–10** (11-button strip, colour-graded green → yellow → orange → red) and **Low / Medium / High / Critical** severity.
  - Each poll gets a `<exercisename>-Poll-<year>-<NNN>` sequence number; legacy polls labelled lazily.
  - The poll header in both the sidebar log and the main modal now shows "👤 By: <name>" so the log always tells you who ran it.
- **Decision cross-references can link to earlier decisions** — the reference picker offers **Decision** alongside Log Book / Diary / Event. Clicking a decision reference opens the decision log and briefly highlights the target entry.
- **ZULU / UTC clocks always use `:`** — the main header clock, Clocks popup (12h and 24h), and detached clock render ZULU as `HH:MM:SSZ` (e.g. `14:23:05Z`). Local time still honours the user's `time_separator` preference.
- **Settings properly translated for `hu`, `is`, `ja`, `ko`, `nl`** — ~200 Settings strings (color-blind palette, tooltip delay, drag-move confirm, default event type, workspace presets, log book — decisions, clock flags, day visualisation, quick response receiver, vertical spacing, hover zoom, auto-busy, country code format, startup message, links/URLs, date/time format, week start, etc.) went from hard-coded English fallback to native translations.
- **New i18n keys in all 20 languages** — 35 `rfi_*` keys, 7 poll keys (`poll_type_scale_0_10`, `poll_type_severity`, `severity_{low,medium,high,critical}`, `poll_created_by`), and 4 offline / push-notification keys (`settings_push_notifications`, `offline_banner`, `offline_mode_enabled`, `online_mode_restored`). Every language file verified to parse under `node --check`.
- **Bug fixes**: stored-XSS in RFI responses (`sanitizeRichHTML` now sanitises the free-text answer before broadcast), RFI question text being downgraded to plain text via `stripHTMLTags` (replaced with `sanitizeRichHTML`), `offline.js` banner and state-transition notifications hard-coded in English (now routed through `t()`).

### v8.6.0 — Key Terrain Board: Battle Rhythm, Comments column, Hungarian

A large feature release focused on the Key Terrain Board. Introduces a new Battle Rhythm subsystem and adds Hungarian as the 20th supported language.

- **Battle Rhythm** — shared exercise clock under Key Terrain Board → Settings. Named steps with start / end offsets (negative allowed for pre-H0 steps), per-step colour picker, optional HH:MM armed start with a "⏳ Waiting for 09:00" countdown, Start / Pause / Resume / Reset controls. Every connected client polls every 2 s and extrapolates locally for a smooth countdown; SSE hooks push state changes within one round trip. The board's outer border fades between step colours as the active step changes.
- **Step navigation** — three new buttons in the widget:
  - Backward ⏮ — rewinds to the start of the previous step (or H+0 / one full cycle back if already at H+0). Wall clock unchanged.
  - Forward ⏭ — ends the current step now and **donates the leftover time to the next step**, which runs longer than its original definition. Steps are mutated in place.
  - Fast-forward ⏩ — jumps the clock forward to the next step's nominal start. Current step cut short, cycle ends sooner in wall clock.
- **Snapshot scheduler** — a per-minute server goroutine writes CSV / JSON / XML / SVG snapshots of the board at configured offsets (e.g. `0, 15, 60` minutes from H0) under `data/key_terrain_battle_rhythm/<cycle_start>/`. Teamlead+ can browse and download past snapshots from a new file list in the settings modal.
- **Cycle rollover auto-increment** — when the clock rolls over into a new cycle, the per-minute goroutine increments the `# Cycles` column on every non-archived Key Terrain entry by the delta (dedup via `LastCycleIdx`, audit-logged).
- **Overlapping steps** — two or more steps whose intervals genuinely overlap at the current position are both reported in the widget's "Now" field (joined with `+`). Half-open `[start, end)` intervals so single-point boundaries don't double-count.
- **Step hover tooltip** — hovering the widget's left info block pops a floating panel listing every configured step with its time range, description, and per-step colour; active steps are highlighted.
- **Detachable clock card** — the existing Clocks popup gains a "Battle Rhythm" button that adds a read-only card showing H-offset, current step, next-step countdown, and cycles-completed counter next to the other clocks.
- **Comments column** — new `comments` field on every Key Terrain entry, visible between Actions and the date columns, sortable, filterable, and included in every snapshot format. Line breaks in the edit textarea are preserved in the rendered cell.
- **Customizable column labels** — teamlead+ can rename any Key Terrain Board column from Settings → Column Labels. Overrides propagate to the header, filter panel, hide-columns grid, column-order editor, and print/export dialogs.
- **"Function" UI rename** — reverts the v8.3.0 UI rename of *Function* to *Capability* in the Key Terrain Board display strings for all 19 original languages. Backend field names (`capability_id`, `from_capability`) are intentionally unchanged for integration compatibility.
- **Board zoom** — 8 levels (xxs / xs / sm / md / lg / xl / xxl / xxxl) from 9 px to 20 px, per-browser localStorage. Detached `/key-terrain` page now fills the full window width.
- **Mouse-over step tooltip, filter label + whitespace handling, extended `?` help** covering Battle Rhythm.
- **# Rounds → # Cycles** rename in all 19 pre-existing languages; the column auto-increments on every battle-rhythm cycle rollover.
- **Hungarian (`hu`)** added as the 20th supported language. Roughly 600 of the ~2675 keys are hand-translated covering the visible UI (toolbar, sidebar, settings, event / layer / group / user dialogs, Key Terrain Board including Battle Rhythm, reports, filters, common status messages); untranslated keys fall back to English.
- **Bug fixes**: Start button binding after shell rebuilds (`_bindActions` re-run), Start/Pause flash (SSE dispatcher now forwards event detail so `_ktHandleSSE` can branch on action type), scheduled → running transition at H0 (widget self-heals and force-triggers an immediate poll), double-escaped apostrophe in the fast-forward tooltip fallback that broke the board on load, widget re-render destroying focus-holding inputs.
- **Tests**: `TestComputeBattleRhythmState` + `ScheduledTransition` + `OverlappingSteps`, `TestResolveBattleRhythmStartTime`, `TestComputeBattleRhythmStepShift`, `TestDonateLeftoverToNextStep`, `TestRunDueBattleRhythmCycles`, `TestRunDueBattleRhythmSnapshots`, `TestRenderBattleRhythm{CSV,JSON,XML,SVG}`. All `go test ./...` green.

### v8.5.0 — Security Hardening Release

A defensive release that closes a series of findings from an external security review. No new user-facing features; existing installations pick up the new defaults on first restart.

- **Session hijack protection** — sessions are bound to the client IP and user-agent captured at login; mismatches destroy the session and write an audit entry. New Security → Session Management controls: IP binding (Subnet / Strict), user-agent binding. Subnet mode (/24 IPv4, /64 IPv6) is the default and tolerates mobile-carrier roaming.
- **Arbitrary file read / delete via reference `Filename`** — fixed. The `CreateReferenceLink` constructor no longer overloads `Filename` with user content; every reference disk sink now goes through a single `safeReferenceFilePath` choke-point.
- **Arbitrary file read / delete via room `ImageName`** — fixed. `handleSaveRoom` no longer accepts `ImageName` from client JSON; every room image disk sink goes through `safeAttachmentPath`.
- **Defence-in-depth at every remaining disk sink** — new shared `safeJoinFilename(dir, name)` helper used by map resource, event attachment, reference, and room image handlers. Blocks traversal, absolute paths, nested paths, and any `filepath.Abs` escape.
- **Syslog log forging** — `sanitizeSyslogMessage()` strips CR/LF/NUL before the message reaches the classic or JSON formatter, preventing an attacker-controlled event title from injecting forged records into the upstream SIEM.
- **Auto-report email recipient spam relay** — new `validateAutoReportEmail()` enforces RFC 5322 format, rejects CR/LF header injection, and supports an optional `auto_report_email_domains` allowlist on SecuritySettings.
- **CSRF double-submit cookie on logout** + OIDC RP-initiated end-session redirect to the IdP's `end_session_endpoint`.
- **6 IDOR fixes** — spreadsheets, decision log attachments, references, and log book attachments now enforce ownership / layer-access checks on read, write, and delete paths.
- **Dangerous uploads** on references/report-archive/board-items rejected; downloads force `X-Content-Type-Options: nosniff` and `application/octet-stream` for dangerous extensions.
- **Diary HTML sanitiser** rewritten from regex to the `golang.org/x/net/html` tokenizer with an allowlist parser; 13 XSS bypass tests pinned in `sanitize_test.go`.
- **Active Sessions** management UI in Security → Session Management — list, inspect, and destroy live sessions. Session IDs are SHA-256-hashed before exposure so the full bearer token never leaves the server.
- **Tests added**: `session_binding_test.go`, `reference_path_traversal_test.go`, `misc_security_test.go`, `sanitize_test.go`. All `go test ./...` pass.

### v8.4.0 — Custom Roles, Offline Detection, Print Tool & Many Bug Fixes

- **Custom role authorization** — `effectiveHasRole()` middleware grants custom roles up to OpLead level based on capabilities; all 184 route gates and 58 handler-level checks converted; frontend `canEdit` checks now capability-aware (custom roles like `bt_13_leadership` can finally edit events)
- **Offline detection** — 30-second client heartbeat to `/api/auth/me`; detects server outages, firewall blocks, network partitions; immediate failure detection on regular API requests; auto-sync queue on reconnect
- **Print tool** — new dialog with view selector (Calendar / List / Task-Time Matrix), date range picker, **layer selection panel**, smart filenames (`tidslinjal-listview-2026-04-12_to_2026-04-19.pdf`), **Boards print** with overview-vs-detailed choice, Key Terrain Board prints in landscape
- **Bulk move events between layers** — new tool in Layers sidebar; backend `/api/layers/bulk-move` endpoint
- **3 new event types** — Starting Point (▶), Ending Point (⏹), Transport (🚚) with custom shapes; configurable shape style (Arrow/Diamond/Bar/Pill); compact width prevents overshadowing other events
- **Event hover tooltip** — floating popup with full title, description, and start/end times
- **Country flags on events** — physical_location matching country codes/names shows flag emoji (~50 countries with localized names)
- **Standalone Key Terrain Board page** (`/key-terrain`) — bookmarkable, deep-linkable, own SSE connection, light theme by default
- **List view** — multi-select layer filter, column visibility toggle, wider title column
- **Layer modal** — shows event count, detailed warning when deleting layers with events, edit button for shared layers when user has appropriate capabilities
- **Minimum event size** setting — keeps short events readable (Default/Medium/Large/Extra Large)
- **Show event creator** is now a setting (off by default)
- **Security**: critical IDOR fix for log book attachment download; group member list authorization; OIDC `iat` token replay prevention; diary XSS hardening
- **Major bug fixes**: double event/layer creation (duplicate listeners), modal closing on text selection, keyboard shortcuts stealing input focus, calendar grid not honoring size preference, settings panel not visually updating, French language fully broken (apostrophe syntax error), language switching race condition, print tool didn't work, 9 missing stub functions in settings UI, export stubs (KML/XML/PVA), 'rivate' label in edit layer modal
- **i18n**: 100+ new translation keys across all 19 languages (analysis, message archive, print dialog, offline messages, list view, settings, layer visibility); 66 missing French translations restored

### v8.3.0 — Themes, Languages, Key Terrain Owner & Settings i18n

- **8 new themes** — Sand, Matrix, Sunset, Light Blue Sky, Ocean, Forest, Accessible, Crimson (12 total themes)
- **Japanese & Korean languages** — full UI translation; Tidslinjal now supports 19 languages
- **Key Terrain Board — Owner column** — displays capability owner (hidden by default); new Owner field on capabilities
- **Key Terrain Board — checkbox filters** — capability, priority (0–10), status, and trend filters with checkboxes complementing existing inputs
- **Settings i18n** — 36 hardcoded strings internationalized; 60+ new translation keys in all 19 languages
- **Tactical font, timezone, terminology** labels fully translatable

### v8.2.0 — Diary, Capabilities, Key Terrain Enhancements & Security Hardening

- **Diary module** — personal paper trail with rich text editor (bold, italic, links, inline images), tags, mood, private/public visibility, file attachments, export (JSON, XML, CSV, XLSX, ODS, TXT, RTF, Markdown), import (JSON, XML), filter/search, print, and report integration
- **User labels** — colored labels on user profiles with audit-logged setting/removal (TeamLead+ required)
- **Capabilities in Resources** — fixed capabilities button, added Zone/Ownership/Status fields; capabilities are reactive objects that sync to Key Terrain Board entries
- **Key Terrain Board** — new # (sequence) and Zone columns; customizable status labels; column visibility toggles; "Manage & Export" consolidated panel; "Load from Capability" integration
- **Export format additions** — Markdown, XLSX, ODS, JPEG, TIFF, BMP added across all applicable modules
- **LDAP authentication** — full go-ldap/ldap/v3 implementation replacing stub
- **Meeting config persistence** — properly saved/loaded (was stub)
- **Dashboard config persistence** — stored server-side per user
- **Security fixes** — diary export auth bypass, user label escalation, stored XSS sanitization, XXE prevention, path traversal fix, LDAP filter validation
- **i18n** — 100+ new translation keys across all 17 languages
- **Online help** — Release Notes, README, and User Manual now rendered in the help modal; fixed text readability

### v8.1.0 — IP Blacklist, Debug Diagnostics & TeamLead Decisions

- **IP blacklist / deny list** — block specific IP addresses or CIDR ranges from connecting; managed in the Security admin panel with enable/disable toggle, add/remove entries, reason tracking, and who-added-when attribution; blocked IPs receive 403 Forbidden; audit logging for all blocked connections
- **IP blacklist import/export** — download the blacklist as JSON; upload a JSON file to merge or replace entries; supports sharing deny lists between instances
- **IP blacklist in backups** — `ip_blacklist.json` included in snapshots and backup/restore alongside other security configuration files (`security.json`, `rate_limits.json`, `geoblocking.json`, `encryption.json`)
- **Debug logging for limits** — when `--debug` is enabled, all rate limit and quota enforcement events emit `[DEBUG] limits:` messages: login, registration, forgot-password, password-reset, API key brute-force, SSE connection limit, upload quota, and comment-per-event limit
- **Debug logging for IP blacklist** — when `--debug` is enabled, blocked connections emit `[DEBUG] IP <addr> has been blocked — blacklisted IP <entry>` with CIDR match details
- **TeamLead decisions in toolbox** — the TeamLead Toolbox now displays a "My Decisions" panel below the decision form, showing the teamlead's own recorded decisions with title, text, reason, sequence number, and timestamp; sortable newest/oldest first; live-refreshes after adding a decision; works in both modal and detached window

### v8.0.0 — Clocks, Checklists & List View Enhancements

- **New clock types** — alarm clocks (absolute/epoch-relative), phase clocks, narrative clocks, F1 start clocks, and synthetic exercise clocks; all fully integrated into the detached clock popup
- **Redesigned detached clock window** — new settings panel with gear toggle; display mode selector (digital/analog/VCR); size slider (XS-XXL); style options; time format controls; add buttons for all clock types; per-clock color pickers; drag-to-detach individual clocks; country flag watermarks
- **Checklists system** — 26 built-in checklist templates organized into 5 categories (Generic, Exercise, Incident, Operations, Tidslinjal); custom template creation; instance tracking with per-item check/skip states and user attribution; category-grouped display; progress bars; completion workflow
- **List view date range picker** — filter events by start/end date range in the list view
- **List view responsible filter** — filter events by assigned responsible person
- **Event meeting URL button** — events with a `contact_url` show a quick-link button in the list view
- **Event delete button** — inline delete buttons with undo support in the list view
- **Task-time matrix fixes** — fixed event type color lookup; fixed text color for sticky columns when scrolling; fixed event filtering to correctly show events when changing timespan
- **i18n: ttm_phase** — proper translations for the Phase row label in the task-time matrix (all 14 languages)
- **Cache-busting** — detached clock popup and its resources use version-tagged URLs to prevent stale browser caches

### v7.0.0 — Language Expansion, Polls & Ready Checks

- **Polish (PL) language** — full UI translation added
- **Ukrainian (UK) language** — full UI translation added; Tidslinjal now supports 14 languages
- **Language control flags** — new `--languages` (whitelist) and `--disable-languages` (blacklist) CLI flags to restrict available languages; corresponding `LANGUAGES` and `DISABLE_LANGUAGES` environment variables
- **Language API endpoint** — `GET /api/languages` returns the list of enabled language codes
- **Startup summary** — languages section added to server boot output showing enabled languages
- **Polls / Multipoll** — send surveys with scale, yes/no, and free-text questions to users, groups, or roles; standard stress-assessment questions; real-time response tracking; reminders for non-responders; pollster log with full history
- **Person Ready Check** — request participants to confirm readiness with traffic-light display (green/red/yellow); individual, group, and role-based selection; timed/scheduled checks; custom messages
- **Activity Ready Check** — verify all activities moved from "planned" status; force-activate option; configurable auto-run at specific time or before epoch
- **Day Labels** — custom labels on timeline day headers with configurable colors, font size, and weight
- **Resource Notes & Stars** — timestamped notes and recognition stars on resources with visibility controls
- **Startup Message (MOTD)** — admin-configurable message displayed to all users on login
- **Sequence numbers** — `#` column in list view for sequential event numbering
- **Time separator setting** — choose between colon (`:`) and dot (`.`) time separators
- **Timed ready checks** — schedule ready checks for a specific future date/time
- **Reference document improvements** — checklist category; Git save/load actions
- **Danish (DA) and Norwegian (NB) full translations** — expanded from partial to comprehensive coverage including all new features

### v6.1.0 — References, Preferences & Accessibility

- **Finnish (FI) language** — full UI translation added; Tidslinjal now supports EN, SV, FR, and FI
- **Settings & preferences overhaul** — time format (12h/24h), DTG military date format, default landing view, auto-follow "now", default timeline range, default time-slot resolution, start-of-week, tooltip hover delay, confirm before drag-move, default event type, and workspace presets (save/restore view, filters, layers, zoom, clocks, sidebar tab)
- **High-contrast mode** — accessibility overlay that works on top of any theme
- **Color-blind-safe palettes** — selectable modes for protanopia, deuteranopia, and tritanopia
- **Welcome banner** — configurable first-time login banner with description, welcome URL, help URL, version, and server uptime
- **Server uptime display** — shown in the Legend sidebar
- **Map symbol picker** — symbol library for draw-symbol mode on the map projection
- **Alarm "Enter Meeting" button** — alarm notifications for events with meeting URLs include a one-click join button
- **Reference document management** — language metadata, automated file type detection (inspired by google/magika), copy modes (central/local/link), owner and custodian fields, time added, reference count, cryptographic checksums (MD5, SHA-1, SHA-256, SHA-512), bulk upload, reference edit modal, and checksum viewer modal
- **New API endpoints** — `POST /api/references/bulk` for bulk upload; `GET /api/references/:id/checksums` for file checksums

### v6.0.0 — Detachable Windows, Timers & Resources

- **Timer clock enhancements** — configurable target duration with hours/minutes/seconds inputs, preset buttons (5/10/15/30/60 min), option to stop or continue after reaching target, audible alarm with selectable sound type, progress bar showing elapsed vs. target
- **Countdown progress bars** — visual progress indicator on all countdown timers showing time remaining vs. total duration, with overtime styling
- **Color pickers for clocks** — toolbar color inputs for background (BG), countdown accent (CD), and timer accent (TM) colors; changes apply in real time
- **Detachable timer windows** — each timer can be detached to its own standalone browser window with live progress bar and controls
- **Detached sidebar fix** — replaced fragile `document.write()` injection with safe DOM-based approach; fixed duplicate window opening; added periodic closure detection with automatic reattach
- **Detached decision log fix** — safe `getOpener()` helper with API fallback; BroadcastChannel theme sync; periodic theme sync from opener; robust initialization that falls back to `/api/decision-log` when opener is unavailable
- **Detached map projection fix** — safe `getOpener()` helper; all resource layers (rooms, buildings, IT services, data centers) now visible by default; async data loading with API fallback; BroadcastChannel theme sync
- **Resource management** — rooms, buildings, computer services, and data centers with image upload, symbol/icon selection, and map pin integration; resource list in sidebar
- **Map projection improvements** — address search with geocoding; tile layer selector (OSM, topo, satellite, dark); overlay layer panel; GeoJSON/KML file import; user and meeting location markers; fit-all button
- **Decision log** — structured decision tracking with status workflow (proposed → approved / rejected); attachments support; i18n translations; detachable to standalone window; routing and permissions
- **Log book** — chronological activity log for operations
- **Task-time matrix** — cross-reference view of tasks vs. time periods
- **Timed events** — events with precise timing controls
- **Countdown timer defaults** — improved default behavior and acknowledge workflow
- **VCR seven-segment display** — retro-style digital clock with configurable colors and thicker segments; VCR text display mode
- **Artificial time system** — exercise time recalibrates all clocks with relative offset; all extra clocks adjust accordingly
- **Enhanced role editor** — column-select for bulk capability toggling; tooltips; new rights and translations
- **List view status dots** — colored status indicators in list/table view
- **Country geolocation** — user location detection by country for map display
- **Offline sync mode** — local changes queued and synced when connectivity returns
- **Federation support** — cross-instance event sharing
- **Per-item layer assignment in templates** — individual events can be assigned to specific layers when saving templates; multi-layer default when applying
- **Audit log enhancements** — mail send logging; SMTP debug logging; comprehensive action tracking
- **Confidential event filtering** — events marked confidential are filtered from unauthorized users
- **Room types** — categorization of room resources
- **@mention autocomplete** — type `@` in comments to get username suggestions
- **Detachable sidebar menu** — open the sidebar in a separate window; content syncs with main window
- **Export completeness** — improved export coverage for all event fields
- **Pause event type** — new event type for marking pauses in the timeline
- **Timeline styling** — customizable timeline appearance settings
- **Logs tab** — dedicated sidebar tab for viewing logs
- **i18n elapsed time** — localized elapsed time formatting
- **Hover zoom setting** — configurable zoom level on event hover
- **BroadcastChannel cross-window sync** — theme, language, and time format synchronized across all open windows via BroadcastChannel API
- **Security hardening** — CSP compliance; extracted inline scripts; input validation improvements

### v5.0.0 — Integrations & Connectors

- **Integration framework** — connectors, event bus, ingestion API, routing, and metrics
- **STIX/TAXII connector** — ingest cyber threat intelligence feeds
- **Syslog connector** — receive syslog events for incident timelines
- **Default port 443 for HTTPS** — when TLS is configured (via flags, env vars, or saved admin settings), port 443 is used by default instead of 8443
- **Tools tab renamed and repositioned** — "Tools" tab is now second in the sidebar (after "Legend") for faster access
- **Auto reports renamed** — "Auto reports" label in the Tools panel (was "Auto Report")
- **Fixed double icons** — export/import/report buttons no longer show duplicate emoji symbols
- **Detachable clock window** — click ⧉ next to the clock to open all clocks in a separate browser window; useful for secondary monitors
- **@username autocomplete** — typing `@` in event comments shows a dropdown of matching usernames
- **15 new example templates** — 10 new exercise templates (EX-11 through EX-20: border security, maritime, CIMIC, logistics, special ops, CBRN, info ops, air defence, peacekeeping, electronic warfare) and 5 new cyber incident templates (INC-07 through INC-11: supply chain, insider threat, phishing/BEC, OT/ICS attack, cloud breach)
- **Training directory** — `training/` with 7 training guides: getting started, templates, exercise planning, incident response, collaboration/roles, full template reference, quick-reference card
- **Event versioning** — full snapshot history per event; browse and compare previous states
- **Event dependencies** — link events; BFS cascade reschedule propagates offsets to all dependants
- **Map integration** — Leaflet.js map modal for Physical Meeting events with lat/lng storage
- **Backup/restore UI** — admin ZIP download of all JSON data files; restore via upload
- **WebCal subscription** — token-based iCalendar feed at `/webcal/:token.ics`
- **Real-time collaborative editing** — editing-lock awareness via SSE; 2-minute TTL
- **Planned vs. actual (PVA)** — planning baseline captured on first edit; PVA modal and report
- **Critical path analysis** — client-side longest-path computation over the dependency graph
- **New report types** — status summary, daily briefing, type breakdown, responsible, PVA, critical path
- **Profile improvements** — social handles, last login details, account type, WebCal token generation
- **Incident response templates** (6) — cybersecurity and physical disaster scenarios
- **Terminology settings** — operation mode (exercise/incident/operation), group label, user label
- **Template enhancements** — carry theme, size, language, operation mode, and terminology on apply
- **2-week and 3-week view options**
- **List / table view** — sortable alternative to the grid
- **SMTP mail** — alarms, reports, invitations, password-reset delivery
- **API keys / bearer token auth**
- **Microsoft Teams and Zoom deep-link integration** for Meeting-type events
- **Auto-report scheduling** — periodic report generation configured per user
- **Saved filter presets** — server-side storage, one-click load
- **OIDC SSO runtime configuration** — configure SSO without restart; exclusive mode; configurable default role
- **Include weekends toggle** — exclude weekend days from synthetic H+N counting
- **Searchable timezone picker** — city/country autocomplete for extra clocks
- **Alarm live counter** — seconds-since display in alarm notifications
- **Templates include groups and layers**
- **Team Lead can create/delete locks** (previously Admin-only)
- **TLS / HTTPS support** via `--tls-cert` / `--tls-key` flags

### v4.0.0 — Performance & Scalability

- O(1) session/user lookups; write-after-unlock store; per-user SSE index
- Bounded webhook worker pool (32 goroutines); HTTP server timeouts
- Tested at 1,000 concurrent users with sub-10 ms median latency

### v3.7.0

- Toolbar redesign with logical groupings; 5-day view; full i18n coverage
- Role editor with capability matrix; roles saved with templates
- Multi-select events (Ctrl+click); right-click "Move to new time/date"
- Multi-timezone clocks; alarm audit trail; "Show Event" button on alarm popups
- Alarm scheduler precision improved to 5 s polling; lock undo (Ctrl+Z)
- 10 example exercise templates

### v3.6.0

- New roles: Observer, Reporter, Staff Officer
- Self-registration modes; overlap warnings; i18n foundation (EN/SV/FR)

### v3.4.0

- Styled error modals; inline alarm on event creation; long-press navigation
- ⊙ Center Today button; templates (save & apply); layer toggle instant

### v3.3.0

- Responsive design; Assigned Task event type; Responsible field; recurring events
- Print/report improvements; invited field; Ops Lead can pause timeline

### v3.1.0

- STARTEX/ENDEX; Instant event type; Meeting event type; Intern/Extern attribute
- Unified Export modal; CSV export; date/time format preference

---

## License

See [LICENSE](LICENSE).
