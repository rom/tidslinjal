# Tidslinjal v2.2.0

**Tidslinjal** ("timeline" in Swedish) is a collaborative operational timeline web tool designed for geographically dispersed groups. It provides a shared, visual chronology and battle rhythm for operations planning, event coordination, and situational awareness.

---

## What's New in v2.2.0

- **Language flags** in the toolbar — switch EN 🇬🇧 / SV 🇸🇪 / FR 🇫🇷 with a single click without opening settings
- **Layer quick-toggle** — 🗂 Layers button in the toolbar opens a popover to show/hide any layer instantly
- **Alarm ACK** — alarm notifications now include an **ACK** button; unacknowledged alarms escalate every 60 seconds (pulsing animation) until acknowledged or the event time passes; `POST /api/alarms/:id/ack` backend endpoint persists the acknowledgement
- **Attachment on create** — file attachment input added directly to the Add / Edit Event modal; file is uploaded immediately after the event is saved
- **10-minute resolution** — new "10 min" slot granularity added alongside 15 min / Hour / Day
- **Drag-to-zoom** — click-and-drag up/down on the time column (the sticky hour labels on the left) to scale slot heights in real time; double-click to reset to 1 ×
- **Group member management** — Groups tab now has a 👥 button per group; members can be listed, added (with role), and removed without leaving the page
- **Layer group selection** — layer editor now shows named checkboxes instead of a raw ID text field; group panel auto-hides when visibility ≠ Groups

## What's New in v2.1.0

- **Group member management** UI — 👥 button per group in the sidebar
- **Layer group checkboxes** — named checkboxes replace the raw ID text input
- **Event search** — live search bar in the toolbar filters event blocks by title, description, or creator
- **ICS export** — 📅 Export ICS downloads an iCalendar file of the current view

## What's New in v2.0.0

- **Dark / Light mode** toggle per user
- **Display size** selector — Small, Normal, Large, Huge
- **Language support** — English, Swedish, French
- **Configurable day hours** — show only the hours you care about (e.g. 06:00–22:00)
- **Additional range options** — 2 Days, 3 Days, 4 Days views
- **Zoom to current time** button — scroll the timeline to "now"
- **Dynamic event types** — admins and Read/Write users can create, edit and delete custom event types with per-language labels
- **User groups** — users can belong to multiple groups; used for layer sharing
- **Layers** — personal or shared overlay timelines on top of the master timeline; visibility and write permissions are controlled per layer
- **File attachments** on events (up to 25 MB per file)
- **Event type visibility** — toggle individual types on/off from the legend

---

## Features

### Timeline Visualization
- **Graphical grid view** — days left to right, time-of-day top to bottom in 24-hour format
- **Configurable resolution** — 10-minute, 15-minute, hourly, or full-day slots
- **Drag-to-zoom** — click-and-drag on the time column to scale slot heights; double-click to reset
- **Configurable display range** — Day, 2 Days, 3 Days, 4 Days, Week, Month, 2 Months, 3 Months
- **Configurable day hours** — per-user setting for the visible hour window (e.g. 08:00–20:00)
- **Live current-time indicator** — red line tracking "now" across the grid
- **Zoom to now** — ⏱ button in the toolbar scrolls/navigates to the current moment
- **Day navigation** — ‹ / › buttons and "Today" shortcut; view auto-scrolls to current hour on load
- **Event search** — live search bar filters visible events by title, description, or creator

### Event & Activity Management
Six built-in event types (all editable by admins):

| Type | Description | Default Color |
|---|---|---|
| **Event** | General occurrence | Blue |
| **Decision** | Decision point / gate | Orange |
| **Deadline** | Hard deadline | Red |
| **Activity** | Planned work | Green |
| **Repeated** | Recurring activity | Purple |
| **Reporting** | Report / briefing | Teal |

Read/Write users can also create **custom event types** with per-language labels (EN/SV/FR) and custom colors.

Each event stores:
- Title, description, type, custom color
- Start time and optional end time
- Optional recurrence (daily / weekly / monthly with end date)
- Layer assignment (master timeline or a named layer)
- Creator and creation timestamp
- File attachments (can be added during creation or from the detail view)

### Layers
Layers are named overlays that sit on top of the master timeline:

- **Private** — visible only to the owner
- **Groups** — shared with specific user groups (read or read/write)
- **Public** — visible to all authenticated users

Users toggle layers on/off in the Layers sidebar panel. Events created on a layer are shown with a colored left border matching the layer color.

### User Groups
- Admins create and manage groups
- Users can be members of multiple groups
- Groups are the sharing unit for layers

### Personal Alarms
- Any logged-in user can set a personal reminder on any event
- Lead-time options: at event time, 5 / 10 / 15 / 30 / 60 minutes before
- Delivered in real-time via **Server-Sent Events (SSE)** — no page refresh needed
- Browser push notifications (when user grants permission)
- Active alarms listed in the Alarms sidebar tab
- **ACK button** — alarm notifications include a mandatory acknowledgement button; if not ACK'd within 60 seconds the notification escalates (orange → pulsing red) and repeats every minute until the event time passes or the user acknowledges

### File Attachments
- Attach files to any event (up to 25 MB)
- Attachment can be added **during event creation** or from the event detail view
- Download or delete attachments from the event detail view
- Files stored on disk; metadata in JSON

### Time Slot Locking
- Admin and designated (`can_lock`) users can lock any time range
- Locked slots shown with a red hatched overlay
- Lock reason and creator recorded

### Access Control

| Role | Capabilities |
|---|---|
| **Read** | View timeline, events, layers; set personal alarms |
| **Read/Write** | All above + create/edit own events, create event types and layers |
| **Admin** | All above + manage all events, users, groups, locks, event types |

A `can_lock` flag can be granted to non-admin users.

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

### Real-Time Clock
Digital clock (HH:MM:SS) and current date in the header, updated every second.

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
└── attachments/       # Uploaded files
```

Back up by copying the `data/` directory.

---

## Usage Guide

### Navigating the Timeline
- **‹ / ›** — step back/forward by the current display range
- **Today** — jump to current date
- **⏱** — scroll to current time (or navigate to today if out of view)
- **Show** dropdown — select date range
- **Resolution** dropdown — select slot granularity

### Adding Events
1. Click any empty cell in the grid, **or** use **+ Add Event**
2. Choose type, times, layer, and optional recurrence
3. Click **Save**

### Layers
1. Open **Layers** tab in the sidebar
2. Click **+ New Layer**; set name, color, visibility, and group permissions
3. Toggle layers on/off by clicking them in the list
4. When creating an event, choose a layer in the **Layer** dropdown

### Event Types
1. Open **Legend** tab in the sidebar
2. **Read/Write+** users: click **+ New Type**
3. **Admins**: also edit system types (labels and color)
4. Click the 👁 icon next to any type to hide/show it on the timeline

### Groups (Admin)
1. Open **Groups** sidebar tab
2. Create groups; then add members via the API or from the group edit panel

### File Attachments
1. Click an event to open its detail view
2. Click **📎 Attach file** and select a file
3. Attachments are listed with download and delete buttons

### Settings (per user)
Open the **Settings** sidebar tab to change:
- Dark / Light theme
- Display size (Small → Huge)
- Language (EN / SV / FR)
- Day start / end hours

---

## Architecture

```
tidslinjal/
├── main.go          # Server, routing, all HTTP handlers, SSE, alarm scheduler
├── models.go        # All data types + system event type definitions
├── store.go         # Thread-safe JSON file store with in-memory cache
├── go.mod / go.sum
├── data/            # Runtime data (auto-created)
└── static/
    ├── index.html   # App shell with all modals
    ├── login.html   # Login page
    ├── i18n.js      # EN / SV / FR translation strings + locale helpers
    ├── app.js       # Timeline engine, all UI logic
    └── style.css    # Dark + light themes, 4 size variants
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
| `DELETE` | `/api/events/:id` | Creator/Admin | Delete event |
| `GET/POST` | `/api/events/:id/attachments` | Any/Auth | List / upload attachment |
| `GET` | `/api/attachments/:id` | Any | Download attachment |
| `DELETE` | `/api/attachments/:id` | Owner/Admin | Delete attachment |
| `GET` | `/api/layers` | Any | Visible layers |
| `POST` | `/api/layers` | Any | Create layer |
| `PUT` | `/api/layers/:id` | Owner/Admin | Update layer |
| `DELETE` | `/api/layers/:id` | Owner/Admin | Delete layer |
| `GET/POST` | `/api/groups` | Admin | List / create groups |
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

---

## License

See [LICENSE](LICENSE).
