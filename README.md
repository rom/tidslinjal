# Tidslinjal v3.4.0

**Tidslinjal** ("timeline" in Swedish) is a collaborative operational timeline web tool designed for geographically dispersed groups. It provides a shared, visual chronology and battle rhythm for operations planning, event coordination, and situational awareness — including support for cyber warfare training exercises.

---

## What's New in v3.4.0

- **Prettier error messages** — browser `alert()` dialogs replaced with styled in-app error modals that match the app visual language
- **Inline alarm on event creation/editing** — set a personal alarm directly in the Add/Edit Event modal; choose lead time and whether the alarm is for yourself only or all invited persons (Ops Lead+)
- **Long-press nav buttons** — short click on ‹/› steps by the current view span as before; hold the button for >400 ms to open a jump-size dropdown (1 day / 2 days / 3 days / 1 week / 2 weeks)
- **Center Today button** — new ⊙ Center button centers the current date in the view so days before and after today are visible
- **Templates** — save the current view's events as a named, reusable template (private or public). Apply any template to a chosen base date to create events with offset times. Accessible via the 📋 Templates toolbar button
- **Layer toggle is now instant** — clicking layers in the 🗂 popover immediately updates the timeline; preferences save in the background
- **Prettier Help popup** — redesigned help modal with sectioned cards, color-coded icons, styled keyboard shortcut pills, and a version line in the footer
- **Remove duplicate "goto now" button** — the ⏱ scroll-to-now button has been replaced by ⊙ Center (more useful); the Today button already handles jumping to now
- **Version bump to 3.4.0**

## What's New in v3.3.0

- **Responsive design overhaul** — mobile bottom nav, tablet overlay sidebar, improved out-of-hours contrast
- **Assigned Task event type** — orange #E67E22; Swedish/French translations included
- **Responsible field** — per-event responsible user (dropdown, defaults to creator)
- **Recurring events hidden outside day hours** — recurring instances are not shown in grayed slots
- **Print/report improvements** — layer selection checkboxes, duration column, Responsible column in all report types
- **Layer exclusion model** — `hidden_layers` array replaces `active_layers`; unselected layers hide immediately
- **Invited field on events** — multi-select users + groups; invited persons receive SSE in-app notifications
- **Ops Lead can pause/unpause timeline** (was admin-only)
- **Phase layer assignment** — phases can be attached to specific layers
- **Synthetic time day-hours-only** — H+N count skips out-of-hours periods; red line hidden outside day hours
- **Full-width events** — events with no overlapping neighbours span the full column width
- **Export/import selection** — select which categories to include (events/groups/layers/alarms; users/phases for admins)
- **Import modal** — JSON file import with category checkboxes, reassign-ownership option, result counts
- **Auto-create layer on group creation** — a layer with the same name/description is created automatically
- **Recurring delete dialog** — three-option modal: delete this occurrence / this + all future / entire series

## What's New in v3.1.0

- **STARTEX / ENDEX** — Exercise epoch renamed to "STARTEX"; new "ENDEX" field for end-of-exercise datetime in Settings
- **Instant event type** — single-point-in-time marker (no end time); rendered as a thin vertical bar with a ◆ diamond
- **Möte (Meeting) event type** — dedicated meeting type with a distinct color
- **Intern / Extern attribute** — new per-event participant field; shown as colored badge on event blocks
- **Unified Export modal** — single ⬇ Export button opens a modal to select ICS, JSON, or CSV format
- **CSV export** — export current view events to a spreadsheet-ready CSV file
- **Date/time format preference** — select ISO 8601, UK, FR, or SV format in Settings

---

## Features

### Timeline Visualization
- **Graphical grid view** — days left to right, time-of-day top to bottom (24-hour)
- **Configurable resolution** — 10-minute, 15-minute, hourly, or full-day slots
- **Drag-to-zoom** — drag on the time column to scale slot heights; double-click to reset
- **Drag-to-reschedule** — drag event blocks to move them to a new time
- **Configurable display range** — Day, 2–4 Days, Week, Month, 2–3 Months
- **Live current-time indicator** — red line across the grid updated every 30 s
- **Synthetic exercise time** — optional "Day N / T+Xh" display with configurable epoch
- **Event search** — live filter by title, description, or creator
- **Long-press navigation** — hold ‹/› for jump-size menu; short click steps by current view

### Event Management & Status Workflow
Nine built-in event types (plus custom types):

| Type | Description | Default Color |
|---|---|---|
| **Event** | General occurrence | Blue |
| **Instant** | Single-point-in-time marker (no end time) | Orange |
| **Meeting (Möte)** | Scheduled meeting | Grey |
| **Decision** | Decision point | Green |
| **Deadline** | Hard deadline | Red |
| **Activity** | Planned work | Light Green |
| **Repeated** | Recurring activity | Purple |
| **Reporting** | Report / briefing | Teal |
| **Assigned Task** | Delegated task | Orange |

Each event carries:
- Title, description, type, custom color
- Start time and optional end time; optional recurrence
- **Participant** — intern, extern, or none
- **Responsible** — assigned user (defaults to creator)
- **Invited** — multi-select users and groups (notified on creation)
- **Inline alarm** — set alarm at creation/edit time for yourself or all invited
- **Day-only** — no specific time (shown in all-day area)
- Layer assignment (master timeline or named layer)
- **Status** — planned / active / responded_to / completed / submitted / verified / rejected / cancelled
- File attachments (up to 25 MB)

### Templates
Save and reuse sets of events:
- Click **📋 Templates** in the toolbar to manage templates
- **Save**: stores all events in the current view with relative time offsets from the earliest event
- **Apply**: choose a base date/time — all events are re-created offset from that moment
- **Private** templates are yours only; **Public** templates are visible to all users
- Only Ops Lead+ may create public templates with master-timeline events
- Delete your own templates (admins can delete any)

### Layers
Named overlays on top of the master timeline:
- **Private** — owner only
- **Groups** — shared with specific user groups (read or read/write)
- **Public** — visible to all authenticated users

Toggle layers on/off with the **🗂 Layers** toolbar button; changes are instant.

### Access Control

| Role | Capabilities |
|---|---|
| **Read** | View timeline, events, layers; set personal alarms; comment on events |
| **Reporter** | + Set event status to Responded To / Completed (requires Team Lead approval) |
| **Read/Write** | + Create/edit own events on accessible layers; create event types and layers |
| **Team Lead** | + Create groups; verify/reject events; manage phases; approve reporter status changes; view audit log |
| **Operations Lead** | + Create/edit/delete master-timeline events; manage exercise settings; pause timeline; create public templates; create alarms for other users |
| **Admin** | Full access — manage users, roles, locks, exercise settings; export all data |

### Personal Alarms & Webhooks
- Per-user reminder on any event (lead times: at time, 5/10/15/30/60/120 min before)
- Set alarm **inline** while creating/editing an event, or from the Detail view
- When setting inline alarm with invited users, Ops Lead+ can notify all invited persons
- Delivered via **SSE** in real time; optional browser push notification
- ACK button on notifications — unacknowledged alarms escalate (orange → pulsing red)
- **Webhook integration** — per-user webhook URL fires on alarm trigger
  - Supports Mattermost, Slack (`{"text":"..."}`) or generic JSON POST

### Audit Log
- Every create, update, delete, verify, and reject action is logged
- Accessible by Team Leads and above in the **Audit** sidebar tab
- Capped at 10,000 most-recent entries

### Synthetic / Exercise Time
- Ops Lead+ sets an **exercise epoch** (real datetime = Day 1 T+0) and an optional exercise name
- Users toggle "exercise time mode" with the 🕐 T+ toolbar button
- Day headers display "Day N" (Day -1, Day 0, Day 1 … all supported)
- **Day-hours-only** option counts H+N only within configured day hours
- **Freeze / pause** timeline progression for planning reviews

---

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Go 1.21+ (standard library + `golang.org/x/crypto`) |
| Persistence | JSON file store (no external database required) |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript — no frameworks |
| Auth | Cookie-based sessions, bcrypt passwords; optional OIDC SSO |
| Real-time | Server-Sent Events (SSE) |
| i18n | Client-side translation dictionary (EN / SV / FR) |

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

Open `http://localhost:8080`.

### Default Credentials

```
Username: admin
Password: admin
```

**Change the admin password after first login** (Admin → Users tab → edit admin).

### Command-Line Flags & Environment Variables

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--port` | `PORT` | `8080` | TCP listen port |
| `--host` | `HOST` | `` (all interfaces) | Listen interface/address |
| `--data` | `DATA_DIR` | `data` | Data directory for JSON files and attachments |
| `--verbose` | — | `false` | Enable verbose log output |
| `--debug` | — | `false` | Enable debug log output |

---

## Data Files

All data is stored in `DATA_DIR`:

```
data/
├── event_types.json   # Dynamic event type definitions
├── users.json         # User accounts
├── preferences.json   # Per-user UI preferences
├── groups.json        # User groups
├── memberships.json   # Group memberships
├── layers.json        # Timeline layers
├── events.json        # Timeline events
├── attachments.json   # Attachment metadata
├── alarms.json        # Personal alarms
├── locks.json         # Locked time slots
├── sessions.json      # Active login sessions
├── audit.json         # Audit log (max 10 000 entries)
├── exercise.json      # Exercise / synthetic time settings
├── comments.json      # Event comments
├── phases.json        # Exercise phases
├── templates.json     # Event templates
└── attachments/       # Uploaded files
```

Back up by copying the `data/` directory.

---

## Usage Guide

### Navigating the Timeline
- **‹ / ›** — short click: step back/forward by current view; long press: choose jump size
- **Today** — jump to current date
- **⊙ Center** — center today in the view so dates before and after are visible
- **Show** dropdown — select date range
- **Resolution** dropdown — select slot granularity
- **🕐 T+** button (when exercise is enabled) — toggle synthetic time display

### Adding Events
1. Click any empty cell in the grid, or use **+ Add Event**
2. Choose type, times, status, layer, responsible user, and optional invited persons
3. Enable **🔔 Set alarm** if you want a reminder; choose lead time and notify scope
4. Attach a file if needed, then click **Save**

### Templates
1. Navigate to the date range with the events you want to template
2. Click **📋 Templates** → **💾 Save current events as template…**
3. Name the template, optionally add a description, choose Private or Public
4. To apply: click **▶ Apply** next to any template, choose a base date, and click Create Events

### Layers
1. Click **🗂 Layers** in the toolbar — popover shows all layers with checkboxes
2. Click any layer to instantly show/hide it on the timeline
3. Manage layers (create, edit, share) in the **Layers** sidebar tab

### Audit Log (Team Lead+)
Open the **Audit** sidebar tab to see a timestamped list of all actions.

### Webhook Notifications
1. Open the **Settings** sidebar tab
2. Enter a webhook URL and select the format type
3. Click **Test** to verify, then **Save**

### Exercise / Synthetic Time (Ops Lead+)
1. Open the **Settings** sidebar tab → Exercise Settings section
2. Enter the exercise name, STARTEX (epoch), and optional ENDEX
3. Check **Enable synthetic time display** and click **Save**
4. Users see the 🕐 T+ button appear; click to toggle

---

## Architecture

```
tidslinjal/
├── main.go          # Server, routing, all HTTP handlers, SSE, alarm scheduler
├── models.go        # All data types, roles, event status, audit, exercise, templates
├── store.go         # Thread-safe JSON file store; all CRUD methods
├── go.mod / go.sum
├── data/            # Runtime data (auto-created)
└── static/
    ├── index.html   # App shell with all modals
    ├── login.html   # Login page
    ├── i18n.js      # EN / SV / FR translation strings
    ├── app.js       # Timeline engine, all UI logic
    └── style.css    # Dark + light themes, 4 size variants, mobile CSS
```

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Log in |
| `POST` | `/api/auth/logout` | Any | Log out |
| `GET` | `/api/auth/me` | Any | Current user |
| `POST` | `/api/auth/change-password` | Any | Change own password |
| `GET` | `/api/version` | Public | App version |
| `GET/PUT` | `/api/preferences` | Any | User preferences |
| `GET` | `/api/event-types` | Public | List event types |
| `POST` | `/api/event-types` | RW+ | Create event type |
| `PUT` | `/api/event-types/:id` | Owner/Admin | Update event type |
| `DELETE` | `/api/event-types/:id` | Owner/Admin | Delete event type |
| `GET` | `/api/events?from=&to=` | Any | List events in range |
| `POST` | `/api/events` | RW+ | Create event |
| `PUT` | `/api/events/:id` | Creator/RW+ | Update event |
| `PATCH` | `/api/events/:id/status` | Various | Change status / verify / reject |
| `DELETE` | `/api/events/:id` | Creator/Admin | Delete event |
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
| `GET` | `/api/notifications/stream` | Any | SSE alarm stream |
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

---

## License

See [LICENSE](LICENSE).
