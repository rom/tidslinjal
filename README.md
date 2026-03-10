# Tidslinjal

**Tidslinjal** ("timeline" in Swedish) is a collaborative operational timeline web application designed for geographically dispersed groups. It provides a shared, visual chronology and battle rhythm for operations planning, event coordination, and situational awareness — including support for military exercises, cyber incident response, and crisis management.

---

## Table of Contents

- [Features Overview](#features-overview)
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
- **List / table view** — alternative to the grid view; sortable columns and full-text search
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

Physical Meeting events with a latitude/longitude can be opened in an interactive **Leaflet.js map modal**, showing the event location on an OpenStreetMap tile layer.

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
- Notification popup shows **Dismiss**, **📋 Show Event**, and **ACK** buttons
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

Full UI translation in **English (EN)**, **Swedish (SV)**, and **French (FR)**. Language preference saved per user. All new features are translated in all three languages.

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
| `GET` | `/api/backup` | Admin | Download data ZIP |
| `POST` | `/api/restore` | Admin | Restore from ZIP |
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
    ├── i18n.js       # EN / SV / FR translation strings
    ├── app.js        # Timeline engine, all UI logic
    ├── modals.js     # Modal dialogs (settings, templates, profile, map, PVA…)
    ├── timeline.js   # Timeline rendering and event drawing
    ├── state.js      # Shared application state
    ├── api.js        # API client helpers
    ├── utils.js      # Clock, timezone, @mention autocomplete, utilities
    └── style.css     # Dark + light themes, 4 size variants, mobile CSS
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

### Latest

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
