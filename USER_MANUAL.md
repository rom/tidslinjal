# Tidslinjal User Manual

**Version 3.1.0**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [The Interface](#3-the-interface)
4. [Navigating the Timeline](#4-navigating-the-timeline)
5. [Events](#5-events)
6. [Event Status Workflow](#6-event-status-workflow)
7. [Comments](#7-comments)
8. [Layers](#8-layers)
9. [Alarms & Notifications](#9-alarms--notifications)
10. [Exercise / Synthetic Time](#10-exercise--synthetic-time)
11. [Exercise Phases](#11-exercise-phases)
12. [Time Slot Locking](#12-time-slot-locking)
13. [Roles & Permissions](#13-roles--permissions)
14. [Settings](#14-settings)
15. [Export & Reports](#15-export--reports)
16. [Admin View](#16-admin-view)
17. [Keyboard & Mouse Shortcuts](#17-keyboard--mouse-shortcuts)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. Overview

**Tidslinjal** ("timeline" in Swedish) is a collaborative web-based operational timeline tool for geographically dispersed teams. It provides a shared, visual chronology of events for operations planning, coordination, and situational awareness — including support for military and emergency exercises with synthetic time.

Key capabilities:
- Multi-user shared timeline with role-based access
- Event lifecycle management with approval workflow
- Named layers to separate activity streams
- Exercise support with STARTEX/ENDEX and synthetic "Day N / T+H" time
- Real-time alarm notifications via Server-Sent Events
- Export to ICS, JSON, and CSV

---

## 2. Getting Started

### Logging In

Navigate to `http://<server>:<port>` (default: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Username: [admin            ]  │
│  Password: [••••••••••••••••]  │
│                                 │
│         [ Log in ]              │
└─────────────────────────────────┘
```

Default credentials: `admin` / `admin`

> **Security note:** Change the admin password immediately after first login using the 🔑 button in the top-right header.

### Changing Your Password

Click the **🔑** button in the header. Enter your current password, then your new password twice.

---

## 3. The Interface

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [Today] [›] [⏱]  Show: [Week▼]  Res: [Hour▼]      │
│             [🔍 Search…] [🗂 Layers] [⬇ Export] [📄 Report]          │
│                          [👤 Name  role] [?][🔑][☰] [Logout]         │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  SIDEBAR        │
│                  TIMELINE GRID                     │                 │
│  Time │  Mon 01  │  Tue 02  │  Wed 03  │  ...      │  [Legend]       │
│ ──────┼──────────┼──────────┼──────────┤           │  [Alarms]       │
│ 08:00 │          │ ▓▓▓▓▓▓▓▓ │          │           │  [Layers]       │
│ 09:00 │          │ Brief    │          │           │  [Settings]     │
│ 10:00 │ ████████ │          │          │           │                 │
│       │ Stand-up │          │          │           │                 │
│ 11:00 │          │          │ ████████ │           │                 │
│       │          │          │ ENDEX    │           │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**Header** — navigation, view selection, search, and user controls.

**Timeline grid** — days left-to-right, time top-to-bottom. Events appear as colored blocks.

**Sidebar** — Legend, Alarms, Layers, Users (admin), Groups (admin), Audit (Team Lead+), Phases (Team Lead+), Settings tabs. Toggle with the ☰ button.

---

## 4. Navigating the Timeline

### Date Navigation

| Control | Action |
|---|---|
| **‹** / **›** buttons | Step back / forward one display range |
| **Today** button | Jump to today |
| **⏱** button | Scroll the grid to current time |

### Display Range

Use the **Show** dropdown in the toolbar:

```
Show: [Day ▼]
       Day
       2 Days
       3 Days
       4 Days
     ▶ Week
       Month
       2 Months
       3 Months
```

### Resolution (Slot Size)

Use the **Resolution** dropdown:

```
Resolution: [Hour ▼]
             10 min
             15 min
           ▶ Hour
             Day
```

### Zoom

**Drag-to-zoom** — click and drag up/down on the time column (left edge) to increase or decrease the slot height. Drag **up** to zoom in, **down** to zoom out. Event text and icons scale with zoom.

**Double-click** the time column to reset zoom to 1×.

Keyboard: **+** / **-** to zoom in/out in increments.

### Horizontal Pan

Middle-click and drag on the timeline area to pan left/right. Drag more than 40% of the visible width to jump to the next/previous date range.

---

## 5. Events

### Creating an Event

Click any empty cell in the timeline grid, or click **+ Add Event** in the header.

```
┌─────────────────────── Add Event ────────────────────────────────┐
│ Title *  [                                                    ]   │
│                                                                   │
│ Type     [Activity        ▼]   Color  [■]                        │
│                                                                   │
│ Start *  [2025-06-01T10:00]    End    [2025-06-01T11:00]          │
│                                                                   │
│ Layer    [Master Timeline  ▼]  Status [Planned            ▼]     │
│                                                                   │
│ Description                                                       │
│ [                                                             ]   │
│                                                                   │
│ Participant  [—  ▼]   ☐ Day-only (no specific time)               │
│                                                                   │
│ ☐ Recurring    Pattern [Weekly ▼]                                 │
│ Recurrence end [                ]                                 │
│                                                                   │
│ Attachment 📎 [Choose file]                                       │
│                                                                   │
│              [Cancel]   [Save]                                    │
└───────────────────────────────────────────────────────────────────┘
```

### Event Types

| Type | Icon color | Notes |
|---|---|---|
| **Event** | Blue | General occurrence |
| **Instant** | Orange | Single point in time — no end time. Renders as a ◆ diamond marker. |
| **Meeting (Möte)** | Blue | Scheduled meeting |
| **Decision** | Orange | Decision point |
| **Deadline** | Red | Hard deadline |
| **Activity** | Green | Work block |
| **Repeated** | Purple | Recurring activity |
| **Reporting** | Teal | Report or briefing |

Custom types can be added by Read/Write+ users from the Settings sidebar.

### Instant Events

When **Instant** is selected as the type:
- The **End** time field is hidden (no duration)
- The event renders as a narrow vertical marker with a ◆ diamond at the top
- It cannot be set as recurring

### Day-Only Events

Check **Day-only (no specific time)** to mark an event that spans the whole day without a specific time:
- Start/end time fields are hidden
- The event appears in the out-of-hours (ghosted) area of the day column
- Recurrence is not available for day-only events

### Participant

The **Participant** field marks whether the activity involves internal or external parties:

| Value | Badge | Color |
|---|---|---|
| — | none | — |
| **Intern** | `INTERN` | Teal |
| **Extern** | `EXTERN` | Red |

The badge appears on the event block in the timeline.

### Recurring Events

Check **Recurring**, then choose a pattern:

| Pattern | Interval |
|---|---|
| Every 30 min | 30 minutes |
| Hourly | 1 hour |
| Every 2 / 3 / 4 hours | 2 / 3 / 4 hours |
| Daily | 1 day |
| Weekly | 7 days |
| Monthly | ~1 month |
| Quarterly | ~3 months |

Set an optional **Recurrence end** date to stop the series. Clicking any occurrence opens the master event for editing.

### Editing & Deleting Events

Click an event block to open the detail view. Click **Edit** to modify. Click **Delete** (visible to creator and admins) to remove.

---

## 6. Event Status Workflow

Every event carries a status that progresses through a lifecycle:

```
planned ──► active ──► responded_to ──► completed ──► submitted
                                                          │
                                               ┌──────────┤
                                               ▼          ▼
                                           verified    rejected
                                                          │
                                                      (reason required)
```

`cancelled` is available at any stage.

### Transitions

| From → To | Who can act |
|---|---|
| Any → any (except verify/reject) | Creator, Team Lead+ |
| responded_to | Reporter, Creator, Team Lead+ |
| submitted → verified | Team Lead+ (records who & when) |
| submitted → rejected | Team Lead+ (requires rejection reason) |

Status buttons appear in the event detail view footer.

### Reporter Role

Users with the **Reporter** role can:
- Post comments on events
- Set status to `responded_to` or `completed` (requires Team Lead approval)

Reporter status-changing comments appear as **pending** until a Team Lead or above approves them.

---

## 7. Comments

Click any event block to open the detail view. Scroll down to **Comments**.

- Any authenticated user can read comments
- Read/Write+ users can post comments
- Reporters can post comments; status-changing comments require approval
- Team Lead+ can approve or delete pending comments

---

## 8. Layers

Layers are named overlays on top of the master timeline. They allow different teams or workstreams to maintain separate event tracks while sharing a common view.

### Creating a Layer

1. Open the **Layers** sidebar tab or click **🗂 Layers** in the toolbar
2. Click **+ New Layer**
3. Set name, color, description, visibility, and permissions

```
┌──────── New Layer ────────────┐
│ Name *   [Cyber Team       ]  │
│ Color    [■ #9B59B6         ]  │
│ Description [                ]│
│                               │
│ Visibility  [Groups      ▼]   │
│ Permission  [Read/Write  ▼]   │
│ Groups      ☐ Alpha  ☐ Bravo  │
│                               │
│         [Cancel]  [Save]      │
└───────────────────────────────┘
```

### Visibility

| Setting | Who can see the layer |
|---|---|
| **Private** | Owner only |
| **Groups** | Owner + members of selected groups |
| **Public** | All authenticated users |

### Toggling Layers

Click **🗂 Layers** in the toolbar to open the quick-toggle popover:

```
┌──────────────────────┐
│ 🗂 Layers             │
│ ✓ Master Timeline    │
│ ✓ Alpha Ops          │
│   Cyber Team         │
│   Logistics          │
└──────────────────────┘
```

Click an item to toggle it. When the Master Timeline is selected (all layers visible), all events show. When specific layers are selected, only those layer's events are shown.

---

## 9. Alarms & Notifications

### Setting an Alarm

1. Click an event block to open its detail view
2. Click **🔔 Set Alarm**
3. Choose a lead time (at time, 5/10/15/30 min, or 1 hour before)

### Alarm Notifications

When an alarm fires, a notification bar appears at the top of the screen:

```
┌──────────────────────────────────────────────────────────┐
│ 🔔 Alarm — "ENDEX Brief" in 15 minutes (10:45)     [ACK] │
└──────────────────────────────────────────────────────────┘
```

Click **ACK** to acknowledge. Unacknowledged alarms escalate — they turn orange, then pulse red every 60 seconds.

### Webhook Notifications

Configure a webhook URL in **Settings** to also receive alarm notifications via HTTP POST to Mattermost, Slack, or any HTTP endpoint.

### Alarms Sidebar Tab

View and manage all your active alarms from the **Alarms** sidebar tab.

---

## 10. Exercise / Synthetic Time

For training exercises, Tidslinjal supports a "synthetic time" mode that replaces real calendar dates with exercise day/hour labels.

### Configuration (Admin only)

1. Open the **Settings** sidebar tab
2. Scroll to **Exercise Settings**
3. Fill in:
   - **Exercise name** — displayed as a badge in the header
   - **STARTEX** — the real datetime that maps to "Day 1 T+0"
   - **ENDEX** — the real datetime for end of exercise
4. Check **Enable synthetic time display**
5. Click **Save**

### Activating Synthetic Time

The **🕐 T+** button appears in the toolbar once exercise mode is configured. Click it to toggle between real and synthetic time display.

When active, day headers show:
```
Day -1   |   Day 0   |   Day 1   |   Day 2   |   Day 3
```

The clock shows both real time and the exercise time offset (e.g., `T+06:30`).

### Timeline Freeze

In the **Settings** sidebar, use **Freeze/Pause Timeline** to stop the synthetic clock at a specific moment — useful for reviewing events during an exercise pause. Click **Resume** to unfreeze.

---

## 11. Exercise Phases

Team Leads and above can define named, colored blocks that overlay the full timeline to show exercise phases.

1. Open the **Phases** sidebar tab
2. Click **+ New Phase**
3. Set name, color, start time, end time, and display order (0–9)

Phases appear as translucent color bands across the top of the timeline grid.

---

## 12. Time Slot Locking

Admins and users with the `can_lock` flag can lock time ranges to prevent event creation.

1. Click **🔒 Lock Slot** in the header (visible to admin/can_lock users)
2. Set start time, end time, and reason

Locked slots appear as a red hatched overlay. Events cannot be created in locked slots. Locks appear in the **Locks** info panel and can be removed from the detail view (admin/can_lock only).

---

## 13. Roles & Permissions

| Role | Abbreviated | Capabilities |
|---|---|---|
| **Read** | `read` | View timeline, events, layers; set personal alarms |
| **Reporter** | `reporter` | + Post comments; set responded_to / completed (with approval) |
| **Read/Write** | `readwrite` | + Create/edit own events; create event types and layers |
| **Team Lead** | `teamlead` | + Create groups; verify/reject submitted events; view audit log; manage phases |
| **Operations Lead** | `oplead` | + Create/edit/delete master-timeline events |
| **Admin** | `admin` | Full access — manage all users, roles, locks, exercise settings |

The `can_lock` flag can be granted to any user regardless of role.

---

## 14. Settings

Open the **Settings** sidebar tab to configure your preferences.

### Theme & Display

| Setting | Options |
|---|---|
| **Theme** | Dark / Light |
| **Display size** | Small / Normal / Large / Huge |
| **Language** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français |
| **Date/time format** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) |

Language can also be changed instantly using the flag buttons (🇬🇧 🇸🇪 🇫🇷) in the toolbar.

### Day Hours

Set **Start hour** and **End hour** to define your "working day" window. Slots outside this window appear grayed/striped. Toggle **Show time outside day hours** to show or hide those slots.

### Default View

Click one of the range buttons (Day / 2 Days / 3 Days / 4 Days / Week) to set your preferred default. Changing this also switches the current view immediately.

### Event Type Visibility

Toggle individual event types on/off. Hidden types are dimmed in the timeline. Custom types can be created with the **+ New Type** button (Read/Write+).

### Current-Time Red Line

| Setting | Description |
|---|---|
| Show / Hide | Toggle the red line |
| Color | Line color (default red) |
| Width | Line thickness in pixels |
| Style | Solid / Dashed / Dotted |
| H+N label | Show exercise-hour label on the line |

### Webhook / Notifications

Enter a webhook URL to receive alarm notifications as HTTP POST requests:
- **Mattermost** — `{"text": "..."}` payload
- **Slack** — `{"text": "..."}` payload
- **Generic** — full alarm JSON payload

Click **Test** to send a test notification.

### Exercise Settings (Admin)

See [Section 10](#10-exercise--synthetic-time).

---

## 15. Export & Reports

### Export

Click **⬇ Export** in the toolbar to open the export modal:

```
┌──────────────────── Export ───────────────────────────┐
│ Select export format for the current view.            │
│                                                       │
│ ┌───────────────────────────────────────────────────┐ │
│ │ 📅 ICS / iCalendar                                │ │
│ │ Import into Google Calendar, Outlook, etc.        │ │
│ └───────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────┐ │
│ │ { } JSON                                          │ │
│ │ Full data export for backup or API integration.   │ │
│ └───────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────┐ │
│ │ 📊 CSV                                            │ │
│ │ Open in Excel, LibreOffice Calc, etc.             │ │
│ └───────────────────────────────────────────────────┘ │
│                               [Cancel]               │
└───────────────────────────────────────────────────────┘
```

| Format | Contents |
|---|---|
| **ICS** | Events in the current view as iCalendar; import into any calendar app |
| **JSON** | Complete system export (all events, users, groups, layers, settings) — admin only |
| **CSV** | Events in the current view as comma-separated spreadsheet |

### Reports

Click **📄 Report** to open the report generator:

| Report type | Description |
|---|---|
| **After Action Report (AAR)** | Summary of events grouped by status |
| **Timeline Snapshot** | Chronological listing of all events in range |
| **Per-Layer Activity** | Events broken down by layer |

Choose **HTML** to view in the browser, or **Print/PDF** to print or save as PDF.

---

## 16. Admin View

Navigate to `/admin-view` (requires **Admin** role) for a dedicated administration dashboard.

```
┌───────────────────────── Admin View ───────────────────────────────┐
│ ⚙ Admin View                                                       │
│                                                                    │
│ ┌─ System Information ──────────────────────────────────────────┐  │
│ │ Version          3.1.0                                        │  │
│ │ Data directory   data/                                        │  │
│ │ Logged in as     admin (admin)                                │  │
│ │                       [⬇ Download Full Export (JSON)]        │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ ┌─ Statistics ──────────────────────────────────────────────────┐  │
│ │  12 Users    4 Groups    37 Events    5 Layers                 │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ ┌─ Exercise Settings ───────────────────────────────────────────┐  │
│ │ Exercise name   EXALPHA-25                                    │  │
│ │ STARTEX         2025-06-01 08:00                              │  │
│ │ ENDEX           2025-06-05 18:00                              │  │
│ │ Enabled         ✓ Yes                                         │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ ┌─ Users ───────────────────────────────────────────────────────┐  │
│ │ ID  Username  Display Name  Role       Can Lock  Created      │  │
│ │  1  admin     Admin User    [admin]    ✓         2025-01-01   │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ ┌─ Audit Log (last 50) ─────────────────────────────────────────┐  │
│ │ Time           User   Action   Entity     Summary             │  │
│ │ 2025-06-01 ...  admin  created  event #42  "ENDEX Brief"      │  │
│ └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 17. Keyboard & Mouse Shortcuts

### Mouse

| Action | Result |
|---|---|
| Click empty time slot | Open Add Event at that time |
| Click event block | Open event detail |
| Drag event block | Reschedule to target slot |
| Drag time column | Zoom slot height (up = zoom in) |
| Double-click time column | Reset zoom to 1× |
| Middle-drag timeline | Pan horizontally |

### Keyboard

| Key | Action |
|---|---|
| `←` / `→` | Navigate back / forward one range |
| `T` | Jump to today |
| `N` | Scroll to current time |
| `E` | Open Add Event dialog |
| `?` or `H` | Open in-app help |
| `Esc` | Close current modal |
| `+` / `-` | Zoom slot height in/out |
| `F` | Freeze / resume synthetic time |

---

## 18. Troubleshooting

### Cannot log in
- Check username and password (default: `admin` / `admin`)
- Ensure the server is running: `./tidslinjal --port 8080`
- Check the server log for errors

### Events not appearing
- Check the **Show** date range — you may be viewing a range that doesn't include your events
- Check **Layer** filters — click 🗂 and ensure the correct layers are active
- Check **Event type visibility** in Settings — hidden types won't appear

### Alarm not firing
- SSE requires a persistent browser connection — ensure the page is open
- Check that browser notifications are allowed for the site
- Verify the alarm's lead time: at 0 min, the alarm fires at exactly the event start time

### Layer toggle not working
- Click **🗂 Layers** in the toolbar
- Select **Master Timeline** to show all layers
- Or select individual layers to filter

### Export produces empty file
- Ensure there are events in the current view range
- Adjust the **Show** range to include the desired events

### Data directory not writable
- Ensure the `data/` directory exists and is writable by the server process
- Use `--data /path/to/writable/dir` or set `DATA_DIR` environment variable

---

*Tidslinjal v3.1.0 — Collaborative Operational Timeline*
