# Tidslinjal v2.3.0

**Tidslinjal** ("timeline" in Swedish) is a collaborative operational timeline web tool designed for geographically dispersed groups. It provides a shared, visual chronology and battle rhythm for operations planning, event coordination, and situational awareness — including support for cyber warfare training exercises.

---

## What's New in v2.3.0

- **Role-based access control overhaul** — five-level role hierarchy: Read → Read/Write → Team Lead → Operations Lead → Admin. Team Leads can create groups and layers, and verify/reject events. Operations Leads have full master timeline edit rights. Admins manage everything.
- **Event status workflow** — every event carries a status: `planned → active → completed → submitted → verified / rejected / cancelled`. Team Leads and above can verify or reject submitted events; rejected events require a mandatory rejection reason. Verified events record who verified them and when.
- **Drag-to-reschedule** — drag any event block on the timeline grid to a new time slot; the backend is updated immediately.
- **Audit log** — every create, update, delete, verify, and reject action is recorded with user, timestamp, and summary. Team Leads and above can view the log in the new **Audit** sidebar tab. Capped at 10,000 entries.
- **Webhook / external notification integration** — per-user webhook URL (Mattermost, Slack, or generic JSON POST) fired whenever an alarm triggers. Configure in the Settings sidebar tab.
- **Synthetic / exercise time** — admins configure an exercise epoch (a real ISO datetime that maps to "Day 1 T+0"). When enabled, day headers switch to "Day N" (supports negative days: Day 0, Day -1). A labelled exercise badge appears in the header. Users toggle the display on/off with the 🕐 T+ button.
- **Mobile-friendly UI** — improved responsive CSS with breakpoints at 768 px and 480 px; toolbar, sidebar, and event blocks all adapt to narrow screens.
- **Updated i18n** — all new strings available in English, Swedish, and French.

## What's New in v2.2.0

- **Language flags** in the toolbar — switch EN 🇬🇧 / SV 🇸🇪 / FR 🇫🇷 with a single click
- **Layer quick-toggle** — 🗂 Layers button opens a popover to show/hide any layer instantly
- **Alarm ACK** — alarm notifications include an **ACK** button; unacknowledged alarms escalate every 60 s (pulsing red) until acknowledged
- **Attachment on create** — file attachment input added directly to the Add / Edit Event modal
- **10-minute resolution** — new "10 min" slot granularity
- **Drag-to-zoom** — click-and-drag on the time column to scale slot heights; double-click to reset

## What's New in v2.1.0

- **Group member management** UI — 👥 button per group in the sidebar
- **Layer group checkboxes** — named checkboxes replace the raw ID text input
- **Event search** — live search bar in the toolbar filters event blocks
- **ICS export** — 📅 Export ICS downloads an iCalendar file of the current view

---

## Features

### Timeline Visualization
- **Graphical grid view** — days left to right, time-of-day top to bottom (24-hour)
- **Configurable resolution** — 10-minute, 15-minute, hourly, or full-day slots
- **Drag-to-zoom** — drag on the time column to scale slot heights; double-click to reset
- **Drag-to-reschedule** — drag event blocks to move them to a new time
- **Configurable display range** — Day, 2–4 Days, Week, Month, 2–3 Months
- **Live current-time indicator** — red line across the grid updated every 30 s
- **Synthetic exercise time** — optional "Day N / T+Xh" display with admin-configurable epoch
- **Event search** — live filter by title, description, or creator

### Event Management & Status Workflow
Six built-in event types (plus custom types):

| Type | Description | Default Color |
|---|---|---|
| **Event** | General occurrence | Blue |
| **Decision** | Decision point | Orange |
| **Deadline** | Hard deadline | Red |
| **Activity** | Planned work | Green |
| **Repeated** | Recurring activity | Purple |
| **Reporting** | Report / briefing | Teal |

Each event carries:
- Title, description, type, custom color
- Start time and optional end time; optional recurrence
- Layer assignment (master timeline or named layer)
- **Status** — planned / active / completed / submitted / verified / rejected / cancelled
- Verification record (verified by, verified at) or rejection reason
- File attachments (up to 25 MB)

Status progression (who can act):
| Transition | Who |
|---|---|
| Any → any (except verify/reject) | Creator / Team Lead+ |
| Submitted → Verified | Team Lead+ (records verified_by, verified_at) |
| Submitted → Rejected | Team Lead+ (requires rejection_reason) |

### Layers
Named overlays on top of the master timeline:
- **Private** — owner only
- **Groups** — shared with specific user groups (read or read/write)
- **Public** — visible to all authenticated users

Events on a layer show a colored left border. Toggle layers on/off via the 🗂 toolbar button or the Layers sidebar tab.

### Access Control

| Role | Capabilities |
|---|---|
| **Read** | View timeline, events, layers; set personal alarms |
| **Read/Write** | + Create/edit own events on accessible layers; create event types and layers |
| **Team Lead** | + Create groups and layers; verify/reject submitted events; view audit log |
| **Operations Lead** | + Create/edit/delete master-timeline events |
| **Admin** | Full access — manage users, roles, locks, exercise settings |

A `can_lock` flag can also be granted to non-admin users.

### Personal Alarms & Webhooks
- Per-user reminder on any event (lead times: at time, 5/10/15/30/60 min before)
- Delivered via **SSE** in real time; optional browser push notification
- ACK button on notifications — unacknowledged alarms escalate (orange → pulsing red)
- **Webhook integration** — per-user webhook URL fires on alarm trigger
  - Supports Mattermost, Slack (`{"text":"..."}`) or generic JSON POST

### Audit Log
- Every create, update, delete, verify, and reject action is logged
- Records: timestamp, user, action type, entity type/ID, summary
- Accessible by Team Leads and above in the **Audit** sidebar tab
- Capped at 10,000 most-recent entries

### Synthetic / Exercise Time
- Admin sets an **exercise epoch** (real datetime = Day 1 T+0) and an optional exercise name
- Users toggle "exercise time mode" with the 🕐 T+ toolbar button
- Day headers display "Day N" (Day -1, Day 0, Day 1 … all supported)
- Exercise name badge displayed in the header when active

### File Attachments
- Attach files to any event (up to 25 MB)
- Attachment added during event creation or from the detail view
- Download or delete from the event detail view

### Time Slot Locking
- Admin and `can_lock` users can lock any time range
- Locked slots shown with a red hatched overlay; reason and creator recorded

### Per-User Preferences (persisted server-side)
| Preference | Options |
|---|---|
| Theme | Dark / Light |
| Display size | Small / Normal / Large / Huge |
| Language | English / Svenska / Français |
| Day start hour | 0–23 |
| Day end hour | 1–24 |
| Hidden event types | Toggle per type |
| Active layers | Toggle per layer |
| Webhook URL | Any HTTP(S) endpoint |
| Webhook type | Mattermost / Slack / Generic |

---

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Go 1.21+ (standard library + `golang.org/x/crypto`) |
| Persistence | JSON file store (no external database required) |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript — no frameworks |
| Auth | Cookie-based sessions, bcrypt passwords |
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

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | TCP port |
| `DATA_DIR` | `data` | Directory for JSON data files and attachments |

```bash
PORT=9000 DATA_DIR=/var/lib/tidslinjal ./tidslinjal
```

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
└── attachments/       # Uploaded files
```

Back up by copying the `data/` directory.

---

## Usage Guide

### Navigating the Timeline
- **‹ / ›** — step back/forward by the current display range
- **Today** — jump to current date
- **⏱** — scroll to current time
- **Show** dropdown — select date range
- **Resolution** dropdown — select slot granularity
- **🕐 T+** button (when exercise is enabled) — toggle synthetic time display

### Adding Events
1. Click any empty cell in the grid, or use **+ Add Event**
2. Choose type, times, status, layer, and optional recurrence
3. Attach a file if needed, then click **Save**

### Rescheduling Events
Click and drag any event block to a new time slot; release to confirm.

### Event Status Workflow
1. Creator sets status to `submitted` when ready for review
2. Team Lead opens the event detail view; clicks **Verify** or **Reject**
3. Rejections require a reason; verifications are timestamped

### Layers
1. Open the **Layers** sidebar tab or click **🗂** in the toolbar
2. Click **+ New Layer**; set name, color, visibility, and permissions
3. Toggle layers on/off from the toolbar popover or sidebar

### Audit Log (Team Lead+)
Open the **Audit** sidebar tab to see a timestamped list of all actions.

### Webhook Notifications
1. Open the **Settings** sidebar tab
2. Enter a webhook URL (Mattermost incoming webhook, Slack, or any HTTP endpoint)
3. Select the format type and click **Test** to verify
4. Alarms will now also POST to the webhook when they fire

### Exercise / Synthetic Time (Admin)
1. Open the **Settings** sidebar tab (Admin only section)
2. Enter the exercise name and epoch (the real datetime that equals Day 1 T+0)
3. Check **Enable synthetic time display** and click **Save**
4. Users see the 🕐 T+ button appear in the toolbar; click to toggle

---

## Architecture

```
tidslinjal/
├── main.go          # Server, routing, all HTTP handlers, SSE, alarm scheduler
├── models.go        # All data types, roles, event status, audit, exercise
├── store.go         # Thread-safe JSON file store; audit + exercise methods
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
| `GET` | `/api/version` | Public | App version |
| `GET/PUT` | `/api/preferences` | Any | User preferences |
| `GET` | `/api/event-types` | Public | List event types |
| `POST` | `/api/event-types` | RW+ | Create event type |
| `PUT` | `/api/event-types/:id` | Owner/Admin | Update event type |
| `DELETE` | `/api/event-types/:id` | Owner/Admin | Delete event type |
| `GET` | `/api/events?from=&to=` | Any | List events in range |
| `POST` | `/api/events` | RW+ | Create event |
| `PUT` | `/api/events/:id` | Creator/RW+ | Update event |
| `PATCH` | `/api/events/:id/status` | TeamLead+ | Verify / reject / change status |
| `DELETE` | `/api/events/:id` | Creator/Admin | Delete event |
| `GET/POST` | `/api/events/:id/attachments` | Any/Auth | List / upload attachment |
| `GET` | `/api/attachments/:id` | Any | Download attachment |
| `DELETE` | `/api/attachments/:id` | Owner/Admin | Delete attachment |
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
| `GET/POST` | `/api/users` | Admin | List / create users |
| `PUT` | `/api/users/:id` | Admin/Self | Update user |
| `DELETE` | `/api/users/:id` | Admin | Delete user |
| `GET` | `/api/audit` | TeamLead+ | Audit log (newest first) |
| `GET` | `/api/exercise` | Any | Exercise settings |
| `PUT` | `/api/exercise` | Admin | Update exercise settings |

---

## License

See [LICENSE](LICENSE).
