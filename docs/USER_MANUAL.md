# Tidslinjal User Manual

**Version 8.2.0**

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
17. [Clocks, Countdowns & Timers](#17-clocks-countdowns--timers)
18. [Decision Log](#18-decision-log)
19. [Log Book](#19-log-book)
20. [Resource Management](#20-resource-management)
21. [Map Projection](#21-map-projection)
22. [Detachable Windows](#22-detachable-windows)
23. [Integrations & Connectors](#23-integrations--connectors)
24. [Templates](#24-templates)
25. [Keyboard & Mouse Shortcuts](#25-keyboard--mouse-shortcuts)
26. [Troubleshooting](#26-troubleshooting)
27. [References & Document Library](#27-references--document-library)
28. [Accessibility](#28-accessibility)
29. [Workspace Presets](#29-workspace-presets)

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
- Countdown timers and stopwatch timers with progress bars and alarms
- Decision log with status workflow and attachments
- Log book for chronological operational records
- Resource management (rooms, buildings, IT services, data centers)
- Interactive map projection with resource overlays and address search
- Detachable windows for clocks, sidebar, decision log, and map
- Integration framework with STIX/TAXII and syslog connectors
- VCR seven-segment digital clock display with color customization
- Artificial time system for exercise time offsets
- DTG (Date-Time Group) military date format
- High-contrast and color-blind accessibility modes
- Full i18n support (19 languages)
- Reference document management with checksums
- Workspace presets
- Offline sync mode and federation support

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
│         [ Sign In ]             │
│                                 │
│  Forgot password?               │
│  Don't have an account? Register│
└─────────────────────────────────┘
```

Default credentials: `admin` / `admin`

> **Security note:** Change the admin password immediately after first login using the 🔑 button in the top-right header.

### Self-Registration

If the admin has enabled self-registration, a **"Don't have an account? Register"** link appears on the login page. There are four registration modes:

| Mode | Description |
|---|---|
| **Open** | Anyone can register; accounts are immediately active |
| **Vetted** | Anyone can register; admin must approve the account before login is allowed |
| **Generic Invitation** | Registration requires a shared invitation code provided by the admin |
| **Personal Invitation** | Registration requires a personal single-use code that the admin generates per user |

When registration requires approval (vetted mode), you will see a confirmation message after submitting. Your account will be activated by an admin.

### Password Reset

If you have registered an email address on your profile:

1. Click **Forgot password?** on the login page
2. Enter your username or email address
3. A reset token is generated (shown on-screen if no email server is configured, or sent to your address)
4. Click **Reset password**, paste the token, and choose a new password

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

**Sidebar** — Legend, Tools, Alarms, Layers, Resources, Logs, Users (admin), Groups (admin), Audit (Team Lead+), Phases (Team Lead+), Integrations (Admin/Ops Lead), Settings tabs. Toggle with the ☰ button. The sidebar can be detached to a separate window.

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

#### Scheduling Conflict Warnings

If an event's **Responsible** person or any **Invited** person is already scheduled in another overlapping event, a warning is shown after saving. The event is saved regardless — the warning is informational only:

```
⚠ Scheduling Conflict
Warning: the following persons are already scheduled in overlapping events:
  • Alice is also in "Alpha Brief" (10:00–11:00)
```

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

Each event type has a coloured block and an icon displayed to the **left** of the event title for quick visual identification.

| Icon | Type | Colour | Notes |
|---|---|---|---|
| — | **Event** | Blue | General occurrence |
| ⚡ | **Instant** | Orange | Single point in time — no end time. Renders as a ◆ diamond marker. |
| 🤝 | **Meeting** | Grey-blue | Scheduled meeting or coordination session |
| 🏢 | **Physical Meeting** | Burnt orange | In-person meeting at a specific venue |
| ⚖️ | **Decision** | Green | Decision point requiring action |
| ⏰ | **Deadline** | Red | Hard deadline / due date |
| — | **Activity** | Green | General work block |
| 🔄 | **Repeated** | Purple | Template for recurring activities |
| 📊 | **Reporting** | Teal | Situation report or briefing |
| 📌 | **Assigned Task** | Orange | Task assigned to a specific person or team |
| 🧍 | **Standup** | Cyan | Short daily standup meeting |

The ↻ icon (to the left of the title) indicates that the event is part of a **recurring series**, regardless of its type. Custom event types can have their own emoji icon set via **Settings → Event Types → Edit**.

Toggle all icons on or off globally in **Settings → Event Icons**.

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
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Alarm — "ENDEX Brief" in 15 minutes (10:45)                       │
│                         [Dismiss] [📋 Show event] [✓ ACK]           │
└──────────────────────────────────────────────────────────────────────┘
```

- **Dismiss** — removes the notification without acknowledging.
- **📋 Show event** — opens the full event detail view directly from the alarm.
- **Enter Meeting** — if the event is a meeting with a URL (Teams/Zoom), this button appears in the alarm popup to join the meeting directly.
- **✓ ACK** — acknowledges the alarm and stops escalation.

Unacknowledged alarms escalate — they turn orange, then pulse red every 60 seconds.

### Alarm Audit Trail

Every alarm acknowledgement is recorded in the **Audit** log (accessible by Team Lead and above). Each entry includes:
- Who acknowledged the alarm (user name and ID)
- When it was acknowledged (timestamp)
- The IP address from which the system was accessed at the time

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
| **Observer** | `observer` | Read-only access to timeline and events — cannot edit, comment, or lock |
| **Read** | `read` | View timeline, events, layers; set personal alarms |
| **Reporter** | `reporter` | + Post comments; set responded_to / completed (with approval) |
| **Read/Write** | `readwrite` | + Create/edit own events; create event types and layers |
| **Team Lead** | `teamlead` | + Create groups; verify/reject submitted events; view audit log; manage phases |
| **Operations Lead** | `oplead` | + Create/edit/delete master-timeline events |
| **Staff Officer Assistant** | `staffofficer` | Same rights as Operations Lead — alternative command-staff designation for specialist staff |
| **Staff Officer** | `staffofficer_full` | Full staff officer — same rights as Operations Lead plus J-designation assignment |
| **Admin** | `admin` | Full access — manage all users, roles, locks, activity settings, registration |

The `can_lock` flag can be granted to any user regardless of role.

### Observer vs Read

**Observer** accounts are intended for passive monitoring — stakeholders, liaison officers, or external parties who should only see the timeline. Unlike **Read**, they cannot set alarms or post comments.

### Staff Officer Assistant vs Staff Officer

- **Staff Officer Assistant** (`staffofficer`) — functionally identical to Operations Lead. Used for staff who share the same authority as operations staff.
- **Staff Officer** (`staffofficer_full`) — same capabilities as Staff Officer Assistant, but additionally requires at least one **J-designation** to be assigned (see below).

### J-Designations

J-designations are NATO-standard staff branch codes assigned to **Staff Officer** (`staffofficer_full`) users. They describe which branch of the joint staff a user belongs to:

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

J-designations are assigned in the **Users** tab (Admin or Operations Lead). A Staff Officer user must have at least one J-designation assigned before the role can be saved. Designations appear on the user badge and in the user list.

---

## 14. Settings

Open the **Settings** sidebar tab to configure your preferences.

### Theme & Display

| Setting | Options |
|---|---|
| **Theme** | Dark / Light / City Camo / Urban Camo / Sand / Matrix / Sunset / Light Blue Sky / Ocean / Forest / Accessible / Crimson |
| **Display size** | Small / Normal / Large / Huge |
| **Language** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français / 🇩🇪 Deutsch / 🇳🇱 Nederlands / 🇫🇮 Suomi / 🇮🇸 Íslenska / 🇩🇰 Dansk / 🇳🇴 Norsk / 🇪🇪 Eesti / 🇱🇻 Latviešu / 🇱🇹 Lietuvių / 🇮🇹 Italiano / 🇪🇸 Español / 🇵🇹 Português / 🇵🇱 Polski / 🇺🇦 Українська / 🇯🇵 日本語 / 🇰🇷 한국어 |
| **Date/time format** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) / DTG (141200ZMAR26) |
| **Time format** | 24h / 12h |
| **High-contrast mode** | On / Off (overlay that boosts grid lines, time markers, phase bands, locks, selections) |
| **Color-blind palette** | Off / Protanopia / Deuteranopia / Tritanopia |
| **Default landing view** | Grid / List / Log Book / Decisions / Map / Reports |
| **Auto-follow now** | On / Off (keeps current time centered in view) |
| **Default range** | Day / 3 Days / Week / 2 Weeks / Month |
| **Default resolution** | 10 min / 15 min / Hour / Day |
| **Week starts on** | Monday / Sunday |
| **Tooltip delay** | Instant / 200 ms / 500 ms |
| **Confirm drag-move** | On / Off (ask before drag-reschedule) |
| **Default event type** | any configured type |
| **Welcome banner** | first login overlay with description, URLs, version, server uptime |

Language can also be changed instantly using the flag buttons in the toolbar.

### Date/Time Format & Day Hours

The **Date/Time Format** section groups both format selection and day-hours configuration:

| Setting | Description |
|---|---|
| **Date format** | ISO 8601 / UK / FR / SV |
| **Day Start** | First hour of the working day |
| **Day End** | Last hour of the working day |

Slots outside the Day Start–End window appear grayed/striped. Toggle **Show time outside day hours** to show or hide those slots.

### Multi-Timezone Clocks

The header displays the primary real-time clock showing your local or UTC/Zulu time. You can add any number of additional timezone clocks for parallel visibility — useful for geographically distributed teams.

**Adding a clock:**
1. Click the **+** button to the left of the main clock in the header.
2. Enter a short label (e.g. *Tallinn*, *Kyiv*, *Kabul*).
3. Select the IANA timezone from the dropdown (all world time zones are supported).
4. Click **Add**. The clock appears immediately left of the main clock.

**Removing a clock:**
Click **×** on the clock widget, or go to **Settings → Date/Time Format → Additional timezone clocks → Remove**.

Extra clocks are saved per user and persist across sessions and browser restarts.

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

### Users

The users table shows each user's email address, role, `can_lock` flag, and whether the account is **Vetted** (approved) or **Pending** (awaiting approval). Click **Approve** to vet a pending account.

To edit a user, click the username. The user form includes:
- Display name
- Email address (used for password reset)
- Role
- Can lock flag
- Group assignments

### Registration Settings

The **Registration Settings** section lets you control how new users can self-register:

| Mode | Behaviour |
|---|---|
| **Off** (default) | Registration link hidden; no self-registration |
| **Open** | Anyone can register; immediately active |
| **Vetted** | Anyone can register; admin must approve before login |
| **Generic Invitation** | Set a single shared invitation code; all registrants must enter it |
| **Personal Invitation** | Generate per-user single-use codes; each code can only be used once |

For **Personal Invitation**, use the invitation table to create codes (with an optional note, e.g. the invitee's name) and delete unused codes.

### Reset to Empty

The **Reset to empty** action clears all events, layers, groups, and users (except the admin). By default, **Keep templates (recommended)** is checked — this preserves any saved template events so you can quickly repopulate a new exercise from the same templates.

---

## 17. Clocks, Countdowns & Timers

### Multi-Timezone Clocks

The header displays a primary real-time clock. Click **+** to add extra timezone clocks for parallel visibility across distributed teams. Each clock shows a label, live time, and timezone abbreviation.

Click the **⧉** button to detach all clocks into a separate browser window — useful for displaying on a secondary monitor during exercises.

### VCR Seven-Segment Display

The clock display uses a retro VCR-style seven-segment digital display. Segment colors and thickness are configurable. A text display mode is also available for showing exercise labels.

### Countdown Timers

Create countdown timers that count down to a specific target time:

1. Click **+ Countdown** in the clock toolbar
2. Set the target time or select from an event's start/end time
3. The countdown displays remaining time with a **progress bar** showing percentage complete
4. When the countdown reaches zero, an alarm notification fires
5. Click **ACK** to acknowledge the expired countdown

Countdown timers show a visual progress bar that fills as time progresses. When the countdown expires, the progress bar turns red (overtime styling).

### Stopwatch Timers

Create stopwatch timers that count up from zero:

1. Click **+ Timer** in the clock toolbar
2. Configure the timer:
   - **Duration** — set target hours, minutes, and seconds, or use preset buttons (5/10/15/30/60 min)
   - **Continue after target** — choose whether the timer stops or continues counting when the target is reached
   - **Sound alarm** — enable an audible alarm at target time with selectable sound type
3. Click **Start** to begin the timer

Timers display a **progress bar** showing elapsed time vs. target duration. If "continue after target" is enabled, the progress bar switches to an overtime indicator when the target is exceeded.

### Color Pickers

The clock toolbar includes color picker inputs for customizing the display:

| Picker | Controls |
|---|---|
| **BG** | Background color of the clock display |
| **CD** | Countdown timer accent color |
| **TM** | Stopwatch timer accent color |

Color changes apply immediately and are saved per session.

### Detaching Timers

Each countdown and timer can be detached to its own standalone browser window by clicking the **⧉** button on the timer card. The detached window shows the timer with its progress bar, controls, and live updates.

---

## 18. Decision Log

The decision log provides structured tracking of decisions made during operations or exercises.

### Accessing the Decision Log

Open the **Decision Log** from the sidebar or the Tools menu. It can also be detached to a standalone browser window.

### Creating a Decision

1. Click **+ New Decision**
2. Fill in the decision details:
   - **Title** — short description of the decision
   - **Description** — detailed context and rationale
   - **Status** — Proposed, Approved, or Rejected
   - **Responsible** — person or role accountable
3. Optionally attach files
4. Click **Save**

### Decision Status Workflow

| Status | Description |
|---|---|
| **Proposed** | Decision has been raised for consideration |
| **Approved** | Decision has been approved and is in effect |
| **Rejected** | Decision was rejected with documented reason |

### Decision Log Permissions

- All authenticated users can view decisions
- Read/Write+ users can create and edit decisions
- Team Lead+ can approve or reject decisions

---

## 19. Log Book

The log book provides a chronological record of operational events, observations, and notes.

### Using the Log Book

1. Open the **Log Book** from the sidebar Logs tab
2. Click **+ New Entry** to add a log entry
3. Enter the log text and optionally tag it with a category
4. Entries are timestamped and attributed to the creating user

Log entries are displayed in reverse chronological order. The log book is useful for maintaining a running record during exercises or live incidents.

---

## 20. Resource Management

Manage operational resources (rooms, buildings, IT services, data centers) from the sidebar.

### Resource Types

| Type | Description |
|---|---|
| **Rooms** | Meeting rooms, operations centers, command posts |
| **Buildings** | Physical buildings and facilities |
| **Computer Services** | IT infrastructure, servers, networks |
| **Data Centers** | Data center facilities |

### Creating a Resource

1. Open the **Resources** tab in the sidebar
2. Select the resource type tab (Rooms / Buildings / IT / DC)
3. Click **+ Add**
4. Fill in details:
   - **Name** and **Description**
   - **Location** — latitude/longitude (for map display)
   - **Image** — upload a photo or diagram
   - **Symbol/Icon** — select a map marker icon
5. Click **Save**

### Resource Map Integration

Resources with location coordinates appear as markers on the Map Projection (see [Section 21](#21-map-projection)). Each resource type has its own layer that can be toggled on/off.

---

## 21. Map Projection

The map projection provides an interactive geographic view of meetings, users, and resources.

### Opening the Map

Click **Map** in the toolbar or detach it to a separate window for use on a secondary monitor.

### Map Features

- **Tile layers** — switch between OpenStreetMap, Topographic, Satellite, and Dark themes
- **Resource overlays** — toggle layers for Rooms, Buildings, IT Services, and Data Centers
- **Meeting markers** — physical meetings with coordinates are shown on the map
- **User markers** — user locations are plotted when available
- **Address search** — type an address to geocode and zoom to the location
- **GeoJSON/KML import** — load external geographic data files as overlays
- **Symbol picker** — when using the draw-symbol tool, a floating panel with search and symbol grid appears for selecting an icon
- **Fit All** — auto-zoom to show all visible markers
- **Legend** — color-coded legend showing marker types

### Overlay Layers

Click **Layers** in the map toolbar to toggle individual resource layers:

| Layer | Markers |
|---|---|
| **Meetings** | Physical meeting locations |
| **Users** | User locations (from geolocation) |
| **Rooms** | Room resources |
| **Buildings** | Building resources |
| **IT** | Computer service resources |
| **DC** | Data center resources |

---

## 22. Detachable Windows

Several views can be detached to standalone browser windows for multi-monitor setups:

| Window | Detach From | Description |
|---|---|---|
| **Clocks** | ⧉ button in header | All clocks, countdowns, and timers |
| **Sidebar** | ⧉ button on sidebar | Full sidebar with all tabs |
| **Decision Log** | Tools menu or sidebar | Decision log view |
| **Map Projection** | Map toolbar | Interactive map with all overlays |

### Cross-Window Synchronization

Detached windows stay synchronized with the main window:

- **Theme** — changes propagate via BroadcastChannel API
- **Language** — translations update across all windows
- **Data** — countdowns, timers, and other data sync with the main window
- **Fallback** — if the main window is closed or navigated away, detached windows fall back to API-based data loading

---

## 23. Integrations & Connectors

### Integration Framework

The Integrations sidebar tab (Admin/Ops Lead) provides:

- **OIDC SSO** — configure Single Sign-On with any OIDC provider
- **SMTP Mail** — outgoing email for alarms, reports, invitations, password reset
- **Microsoft Teams** — webhook integration for meeting deep-links
- **Zoom** — meeting link integration
- **API Keys** — generate bearer tokens for external tool integration

### Event Connectors

| Connector | Description |
|---|---|
| **STIX/TAXII** | Ingest cyber threat intelligence feeds as timeline events |
| **Syslog** | Receive syslog messages and convert to timeline events |

Connectors are configured in the Integrations tab and process incoming data through the event bus, which routes events to the timeline with configurable mapping rules.

### Ingestion API

External systems can push events via the REST ingestion API endpoint. Events are validated, mapped to timeline event types, and created automatically.

---

## 24. Templates

Save and reuse sets of events, phases, locks, groups, and layers:

- **Save** — choose a date range; events, phases, and locks within that range are stored with relative offsets; groups, layers, roles, theme, language, operation mode, and terminology labels are optionally saved
- **Apply** — enter the STARTEX/T=0 datetime; all events recreated with offsets; per-item layer assignment supported; multi-layer default when applying
- **Import from file** — load `.json` template files from disk or from `example-templates/`
- **Scope** — Private (your eyes only) or Public (visible to all users)

31 example templates are included: 20 exercise templates (EX-01 through EX-20) and 11 incident response templates (INC-01 through INC-11).

---

## 25. Keyboard & Mouse Shortcuts

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

## 26. Troubleshooting

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

## 27. References & Document Library

The References section provides a centralized document library for managing operational reference materials.

### Uploading References

Add references in three ways:
- **File upload** — upload a document from your computer (bulk upload of multiple files is supported)
- **URL** — link to an external document or resource
- **Local text** — create a reference from inline text

Automated file type detection identifies the document format on upload.

### Reference Metadata

Each reference includes the following metadata:

| Field | Description |
|---|---|
| **Title** | Display name of the reference |
| **Description** | Summary or notes about the content |
| **Category** | Classification of the document (see below) |
| **Tags** | Free-form tags for search and filtering |
| **Language** | Language of the document |
| **Owner** | Person or organization that owns the document |
| **Custodian** | Person responsible for maintaining the document |
| **Copy mode** | How the document is stored (see below) |

### Categories

| Category | Description |
|---|---|
| **Handbook** | Operational handbooks and guides |
| **SOP** | Standard operating procedures |
| **Policy** | Organizational policies |
| **Map** | Geographic or situational maps |
| **Reference** | General reference material |
| **Checklist** | Operational checklists |
| **FAQ** | Frequently asked questions |
| **Objectives** | Mission or exercise objectives |
| **Other** | Uncategorized documents |

### Copy Modes

| Mode | Description |
|---|---|
| **Central copy** | File is uploaded and stored on the server |
| **Local copy** | File is stored locally on the user's machine |
| **Show link** | Only the URL is stored; the document is accessed externally |

### Editing References

Click a reference to open the **reference edit modal** where you can update any metadata field.

### Cryptographic Checksums

Each uploaded file has cryptographic checksums computed automatically. Open the **checksum viewer modal** to see:
- **MD5**
- **SHA-1**
- **SHA-256**
- **SHA-512**

Checksums can be used to verify document integrity and detect unauthorized modifications.

### Search and Filtering

Use the search bar to find references by title, description, or tags. Filter by category using the category dropdown.

### Actions

- **Download** — download the reference file to your computer
- **Delete** — remove the reference from the library (requires appropriate permissions)

---

## 28. Accessibility

Tidslinjal provides accessibility features to ensure usability for users with visual impairments or color vision deficiencies.

### High-Contrast Mode

High-contrast mode is a visual overlay that can be layered on top of any theme (Dark, Light, City Camo, Urban Camo). When enabled, it boosts the visibility of:
- Grid lines
- Time markers
- Phase bands
- Lock overlays
- Selected events

### Color-Blind Palettes

Three color-blind palettes are available, each remapping accent and status colors to distinguishable alternatives:

| Palette | Condition | Description |
|---|---|---|
| **Protanopia** | Red-green color blindness | Remaps red-green distinctions to distinguishable alternatives |
| **Deuteranopia** | Green-red color blindness | Remaps green-red distinctions to distinguishable alternatives |
| **Tritanopia** | Blue-yellow color blindness | Remaps blue-yellow distinctions to distinguishable alternatives |

### Combining Modes

High-contrast mode and color-blind palettes can be enabled simultaneously for maximum accessibility.

### Configuration

Both settings are located in the **Settings** sidebar tab under Theme & Display.

---

## 29. Workspace Presets

Workspace presets let you save and restore complete working configurations with one click.

### Saving a Preset

1. Configure your workspace (view, range, resolution, zoom, layers, sidebar tab)
2. Open **Settings** and navigate to **Workspace Presets**
3. Click **Save Preset** and enter a name
4. The preset captures:
   - Current view
   - Range
   - Resolution
   - Zoom level
   - Hidden layers
   - Sidebar tab

### Loading a Preset

Click any saved preset to restore the complete working posture in one action.

### Deleting a Preset

Remove presets that are no longer needed from the preset list.

### Feature Toggle

The workspace presets feature can be enabled or disabled in **Settings**.

---

### Legend — System Info & GitHub Link

The **Legend** sidebar tab includes a **System** info panel showing language, user count, group count, active layers, synthetic time state, last template, and version number. Server uptime and start time are also shown in the legend panel. If the server is built with a GitHub link configured, a direct link to the repository appears at the bottom of the legend.

---

## Diary

The **Diary** module (📔 in Tools menu) provides a personal paper trail for each user. Diary entries support **rich text editing** with bold, italic, underline, strikethrough, bullet/numbered lists, inline links, and inline images.

### Features
- **Private entries** — mark an entry as private so only you can see it; public entries are visible to all users
- **Tags and mood** — organize entries with comma-separated tags and optional mood indicators
- **File attachments** — upload files to diary entries
- **Filter and search** — filter by author, tag, visibility, or free-text search
- **Export** — JSON, XML, CSV, XLSX, ODS, TXT, RTF, Markdown
- **Import** — JSON or XML
- **Print** — print a single entry or the full diary
- **Reports** — "Diary Entry" and "Full Diary" report types available in the Reports module

### Permissions
All users have diary read and write access by default. Admins can restrict access via the `diary_read` and `diary_write` capabilities in the Role Editor.

---

## User Labels

**Labels** are colored tags that can be attached to user profiles by TeamLead+ roles. Labels are visible to everyone in the Resources > Users list and in the user edit modal.

- Click a user in **Resources > Users**, then use the label input at the bottom to add a label with custom text and color
- Click × on a label to remove it
- All label additions and removals are **audit-logged** (who set/removed which label on whom)

---

## Capabilities

**Capabilities** (🎯 in Resources) represent operational capabilities that can be tracked. Each capability has:
- **Name** — the name of the capability
- **Zone** — optional geographic/area placement
- **Description** — free-text description
- **Ownership** — who owns/operates this capability
- **Status** — Working, Degraded, Down, or Unknown

Capabilities are **reactive objects**: when linked to a Key Terrain Board entry, changes to the capability's name, zone, status, ownership, and owner automatically propagate to the board.

---

## Key Terrain Board Enhancements (v8.2.0)

- **Seq # column** — auto-assigned unique number per entry
- **Zone column** — sortable text field for area classification
- **Customizable status labels** — change "Working" to "Normal" etc. in Settings
- **Column visibility** — show/hide any column including the Management column
- **Column order** — reorder columns directly in the Settings panel
- **Manage & Export panel** — History, Versions, Print, and Export consolidated under one button
- **Load from Capability** — populate entry fields from an existing capability resource

## Key Terrain Board Enhancements (v8.3.0)

- **Owner column** — displays the owner of each linked capability; hidden by default (toggle via Columns visibility); sortable
- **Owner field on capabilities** — new "Owner" field in the capability resource form, separate from Ownership/Responsible; synced automatically to Key Terrain Board entries
- **Capability checkbox filter** — checkboxes for all capability names in entries, complementing the existing text search
- **Priority checkbox filter** — checkboxes for values 0–10, complementing the number input
- **Status checkbox filter** — checkboxes for Working/Degraded/Down/Unknown, complementing the dropdown
- **Trend checkbox filter** — checkboxes for Improving/Stable/Worsening, complementing the dropdown
- All checkbox filters are unset by default; checked values filter as OR within a group, AND across groups

---

*Tidslinjal v8.3.0 — Collaborative Operational Timeline*
