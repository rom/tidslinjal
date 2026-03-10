# 01 — Getting Started with Tidslinjal

## What Is Tidslinjal?

Tidslinjal is a **collaborative operational timeline** tool designed for exercise planning, incident response coordination, and operational activity tracking. Multiple users can view and update the same timeline in real time.

The name comes from the Swedish word for "timeline."

---

## 1. Logging In

1. Open your browser and navigate to the Tidslinjal server URL (e.g., `https://timeline.example.org`).
2. Enter your **username** and **password**.
3. Click **Login**.

> **Tip:** If your organisation uses Single Sign-On (SSO/OIDC), you may see a **Login with SSO** button. Use that if available.

---

## 2. The Interface at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  ◄ Today ► [Date] [Filter] [View] [Layers]    🕐 14:32:01   │  ← Toolbar & Clock
├──────────┬──────────────────────────────────────────────────┤
│  SIDEBAR │                  TIMELINE                        │
│          │  Mon 10 Mar    Tue 11 Mar    Wed 12 Mar           │
│ Legend   │  ─────────────────────────────────────────────── │
│ Tools    │  ██ Event ████████████                           │
│ Alarms   │     ▲ Instant event                              │
│ Layers   │  ░░░░░░░░░░ Locked slot                         │
│ Settings │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### Key Areas

| Area | Purpose |
|------|---------|
| **Toolbar** | Navigate time, filter, add events, change view |
| **Clock** | Real-time clock (click to toggle Local/UTC). Click ⧉ to detach to a separate window |
| **Sidebar** | Legend, Tools, Settings, user-specific content |
| **Timeline** | Main canvas — events displayed as bars or markers |

---

## 3. Navigating the Timeline

| Action | Method |
|--------|--------|
| Move forward/backward | Click **◄ ►** arrows or scroll horizontally |
| Jump to today | Click **📍 Today** |
| Jump to a date | Click **📅** (calendar picker) |
| Zoom in/out | Use the **Resolution** selector (hour/day/week) |
| Jump to now | Click **Zoom to Now** in the toolbar |

---

## 4. Creating Your First Event

1. Click the **➕ Add Event** button in the toolbar (visible when you have write access).
2. Fill in the form:
   - **Title** — short descriptive name
   - **Event type** — see the legend for types (activity, instant event, decision, etc.)
   - **Start time** and **Duration**
   - **Description** — optional but recommended
   - **Layer** — which timeline layer this event belongs to
3. Click **Save**.

> **Keyboard shortcut:** `Ctrl+Click` anywhere on the timeline to create an event at that exact time.

---

## 5. Event Types

The **Legend** tab (sidebar) shows all event types. Key ones:

| Type | Icon | Colour | Use |
|------|------|--------|-----|
| Activity | Bar | Green | Ongoing work, tasks |
| Instant Event | Triangle ▲ | Various | Point-in-time events |
| Physical Meeting | Grey bar | Grey | Face-to-face meetings |
| Reporting / SITREP | Cyan marker | Cyan | Reports and situation reports |
| Decision | Diamond | Various | Decision points |
| Deadline | Red marker | Red | Hard deadlines |
| Assigned Task | Orange bar | Orange | Work assigned to specific person/team |
| Standup / Check-in | Cyan | Cyan | Short coordination calls |
| Locked Slot | Hatched | — | Blocked period (no scheduling) |

---

## 6. Editing and Deleting Events

- **Right-click** an event for the context menu (Edit, Duplicate, Delete, Set Alarm).
- **Click** an event to open its detail panel on the right.
- **Drag** an event left or right to reschedule it (if you have write permission).
- **Resize** an event by dragging its right edge.

---

## 7. The Sidebar

Click the **☰** button (top right) to show/hide the sidebar. The sidebar has tabs:

| Tab | Contents |
|-----|----------|
| **Legend** | Event type key, phase legend, system status |
| **Tools** | Quick access to Export, Import, Report, Templates, etc. |
| **Alarms** | Active alarms and reminders |
| **Layers** | Toggle visibility of timeline layers |
| **Settings** | Display preferences (theme, language, date/time format, etc.) |

---

## 8. Real-Time Clock

The clock in the top-right shows the current time:
- **Click the clock** to toggle between **local time** and **UTC/Zulu**.
- Click **+** next to the clock to add **additional timezone clocks** (useful for distributed teams).
- Click **⧉** to **detach the clock to a separate browser window** — useful for secondary monitors.

---

## 9. Getting Help

- Click the **?** button (top right) to open the full built-in help documentation.
- Each section of the help covers a specific feature in detail.

---

## Next Steps

- [02 — Working with Templates](02-working-with-templates.md) — load an exercise or incident template
- [03 — Exercise Planning Guide](03-exercise-planning-guide.md) — plan your first exercise
