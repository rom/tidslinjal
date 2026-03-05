# Tidslinjal

**Tidslinjal** ("timeline" in Swedish) is a collaborative operational timeline web tool designed for geographically dispersed groups. It provides a shared, visual chronology and battle rhythm for operations planning, event coordination, and situational awareness.

---

## Features

### Timeline Visualization
- **Graphical grid view** — days run left to right; time-of-day runs top to bottom in 24-hour format
- **Configurable resolution** — switch between 15-minute, hourly, or full-day granularity
- **Configurable display range** — show a single day, one week, one month, two months, or three months at a time
- **Live current-time indicator** — a red line shows exactly where "now" is on the grid
- **Day navigation** — previous/next buttons and a "Today" shortcut; the view auto-scrolls to the current hour on load

### Event & Activity Management
Events can be any operational activity, including:

| Type | Description | Default Color |
|---|---|---|
| **Event** | General occurrence | Blue |
| **Decision** | A decision point or gate | Orange |
| **Deadline** | Hard deadline | Red |
| **Activity** | Planned work or task | Green |
| **Repeated** | Recurring activity | Purple |
| **Reporting** | Report submission / briefing | Teal |

Each event stores:
- Title, description, type
- Start time and (optional) end time
- Custom color override
- Recurrence pattern (daily / weekly / monthly) with optional end date
- Creator name and creation timestamp

### Personal Alarms
- Any logged-in user can set a personal reminder on any event
- Lead-time options: at event time, 5 / 10 / 15 / 30 / 60 minutes before
- Alarm notifications are delivered in real-time via **Server-Sent Events (SSE)** — no page refresh needed
- In-page toast notifications appear with the alarm message
- Browser push notifications are requested (when the user grants permission)
- Active alarms are listed in the sidebar panel

### Time Slot Locking
- Administrators and designated users can lock any time range
- Locked slots are shown with a hatched red overlay
- Other users cannot book events in locked slots
- Lock reason and creator are recorded for audit purposes

### Access Control
Three roles with layered permissions:

| Role | Capabilities |
|---|---|
| **Read** | View timeline and events; set personal alarms |
| **Read/Write** | All of the above, plus create, edit, and delete own events |
| **Admin** | All of the above, plus manage all events, lock time slots, and manage users |

A designated `can_lock` flag can be assigned to non-admin users, allowing them to lock and unlock time slots without full admin rights.

### Real-Time Clock
The header displays a **live digital clock** (HH:MM:SS) and the full current date, updated every second.

---

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Go (standard library + `golang.org/x/crypto` for bcrypt) |
| Persistence | JSON file store (no external database required) |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (no frameworks) |
| Auth | Cookie-based sessions with bcrypt password hashing |
| Real-time | Server-Sent Events (SSE) |

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

The server starts on port **8080** by default. Open `http://localhost:8080` in your browser.

### Default Credentials

```
Username: admin
Password: admin
```

**Change the admin password immediately after first login** via the Users panel (Admin → sidebar → Users tab → edit admin user).

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | TCP port to listen on |
| `DATA_DIR` | `data` | Directory for persistent JSON data files |

Example:
```bash
PORT=9000 DATA_DIR=/var/lib/tidslinjal ./tidslinjal
```

---

## Data Files

All data is stored as JSON files in the `DATA_DIR` directory:

| File | Contents |
|---|---|
| `users.json` | User accounts and roles |
| `events.json` | Timeline events and activities |
| `alarms.json` | Personal alarms |
| `locks.json` | Locked time slots |
| `sessions.json` | Active login sessions |

Backups can be made by simply copying this directory.

---

## Usage Guide

### Navigating the Timeline

- **Previous / Next** buttons step back or forward by the current display range
- **Today** jumps to the current date
- The **Show** dropdown sets the visible time range (day / week / month / 2 months / 3 months)
- The **Resolution** dropdown sets the vertical granularity (15 min / hour / day)

### Adding Events

1. Users with **Read/Write** or **Admin** role will see the **+ Add Event** button in the header
2. Alternatively, click any empty cell on the timeline grid to open the new-event dialog pre-filled with that time
3. Fill in title, type, start/end times, and (optionally) description, custom color, and recurrence
4. Click **Save**

### Editing / Deleting Events

- Click an event block to open the detail view, then choose **Edit** or **Delete**
- Admins can edit or delete any event; Read/Write users can only edit/delete their own events

### Setting an Alarm

1. Click an event block to open its detail view
2. Click **Set Alarm**
3. Choose how far in advance you want to be reminded
4. The alarm fires automatically at the calculated time and shows a notification

### Locking a Time Slot

1. Users with **Admin** or `can_lock` permission see the **Lock Slot** button
2. Set the start/end time range and an optional reason
3. The locked period appears with a red hatched overlay
4. Click the unlock button on the timeline to remove it

### Managing Users (Admin only)

1. Open the **Users** tab in the right sidebar
2. Click **+ Add** to create a new user, or the pencil icon to edit
3. Set the username, password, display name, role, and whether they can lock time slots

---

## Architecture

```
tidslinjal/
├── main.go          # HTTP server, routing, SSE broker, alarm scheduler
├── models.go        # Data models (User, Event, Alarm, LockedSlot, Session)
├── store.go         # Thread-safe JSON file store with in-memory cache
├── go.mod / go.sum  # Go module definition
├── data/            # Runtime data directory (auto-created)
│   ├── users.json
│   ├── events.json
│   ├── alarms.json
│   ├── locks.json
│   └── sessions.json
└── static/
    ├── index.html   # Main app shell
    ├── login.html   # Login page
    ├── app.js       # Timeline engine (vanilla JS)
    └── style.css    # Dark-theme styles
```

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Log in |
| `POST` | `/api/auth/logout` | Any | Log out |
| `GET` | `/api/auth/me` | Any | Current user |
| `GET` | `/api/event-types` | Public | List event type definitions |
| `GET` | `/api/events?from=&to=` | Read+ | List events in range |
| `POST` | `/api/events` | ReadWrite+ | Create event |
| `PUT` | `/api/events/:id` | ReadWrite+ / creator | Update event |
| `DELETE` | `/api/events/:id` | Creator / Admin | Delete event |
| `GET` | `/api/alarms` | Any | My alarms |
| `POST` | `/api/alarms` | Any | Create alarm |
| `DELETE` | `/api/alarms/:id` | Owner | Delete alarm |
| `GET` | `/api/locks` | Any | List locks |
| `POST` | `/api/locks` | Admin / canLock | Create lock |
| `DELETE` | `/api/locks/:id` | Admin / canLock | Remove lock |
| `GET` | `/api/users` | Admin | List users |
| `POST` | `/api/users` | Admin | Create user |
| `PUT` | `/api/users/:id` | Admin / self | Update user |
| `DELETE` | `/api/users/:id` | Admin | Delete user |
| `GET` | `/api/notifications/stream` | Any | SSE alarm stream |

---

## License

See [LICENSE](LICENSE).
