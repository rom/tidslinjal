# 03 — Exercise Planning Guide

This guide explains how to use Tidslinjal to plan, execute, and review military and civilian exercises.

---

## The Exercise Planning Workflow

```
1. Choose a template  →  2. Set STARTEX  →  3. Customise events
       ↓
4. Invite participants  →  5. Assign layers  →  6. Run the exercise
       ↓
7. Record actuals  →  8. Generate AAR report
```

---

## Step 1: Choose or Create a Template

Tidslinjal includes 20 exercise templates (EX-01 through EX-20). Use the **Template Reference** to pick the closest match to your exercise type.

**Quick selection guide:**

| If your exercise is... | Start with |
|------------------------|-----------|
| 1-day, co-located, rapid response | EX-01 |
| 1-day, cyber defence / blue vs red | EX-02 |
| 2-day, 24/7, co-located | EX-03 |
| 2-day, working hours, co-located | EX-04 |
| 2-day, virtual/distributed | EX-05 or EX-06 |
| 3-day, military field exercise | EX-07 |
| 3-day, civil crisis management | EX-08 |
| 5-day, NATO/coalition | EX-09 |
| 5-day, full spectrum | EX-10 |
| Border security / patrol | EX-11 |
| Maritime patrol | EX-12 |
| Civil-military cooperation | EX-13 |
| Logistics / sustainment | EX-14 |
| Special operations / hostage rescue | EX-15 |
| CBRN / NBC response | EX-16 |
| Information operations | EX-17 |
| Air defence | EX-18 |
| Peacekeeping / stabilisation | EX-19 |
| Electronic warfare | EX-20 |

---

## Step 2: Set STARTEX (T=0)

STARTEX is the moment the exercise begins. All template events are scheduled relative to this point.

**Convention used in all templates:**
- T=0 = 0800 Day 1 (unless the template uses a different `day_start_hour`)
- For 24/7 exercises: T=0 = 0000 Day 1

When loading the template, set the base date/time to your desired STARTEX.

---

## Step 3: Customise Events

After loading, review all pre-populated events and adjust to your exercise design:

### Add your injects
Exercise injects are the unscripted (to participants) events that drive the scenario. They appear as **event** type (triangle marker).

Best practice for injects:
- Set clear **descriptions** — who does what, what information is given to participants
- Set **alarm lead times** — alert the Exercise Control team before the inject fires
- Use a distinct **colour** (red/orange) for adversary or emergency injects

### Set your deadlines
Use the **deadline** event type for hard cut-off times (reporting deadlines, decision windows, phase transitions).

### Define your locks
Add **locked slots** for:
- Lunch breaks (e.g., 1200–1300 each day)
- Overnight recesses (e.g., 1800–0800 next day)
- Safety windows (fire support, maintenance)
- Admin time (briefings, equipment checks)

---

## Step 4: Set Up Layers and Groups

### Groups
Groups represent teams or roles in the exercise. Examples:
- For a military exercise: Alpha Company, Bravo Company, Intelligence Cell, HQ
- For a crisis management exercise: Police, Fire Brigade, Medical, EOC

### Layers
Each group should have one or more timeline layers. Layers control:
- **Visibility** — who can see this layer (all users, specific groups)
- **Permission** — who can add/edit events on this layer (read-only vs read-write)

Recommended layer setup:
- One **readwrite** layer per group for their own events
- One **shared read** layer for cross-agency awareness events

---

## Step 5: Invite Participants

1. Go to **Sidebar → Users** (admin only).
2. Create user accounts for all exercise participants.
3. Assign each user to the appropriate **group** and **role**.
4. Participants log in with their credentials and see only the layers relevant to their group.

For distributed/virtual exercises, test login access at least 24 hours before STARTEX.

---

## Step 6: Running the Exercise

### Exercise Control (EXCON) tasks during the exercise:
- Monitor the timeline for missed events or delays
- Fire injects at the scheduled times (or based on participant actions)
- Use the **Alarm** feature to get notified before each inject
- Record actual actions in comments or new events

### Synthetic Time (T+ Clock)
For exercises where you want a synthetic exercise clock:
1. Toolbar → **⏱ T+** button
2. Set the T=0 epoch
3. The timeline displays synthetic time (D+1, T+2h, etc.) alongside real time

### During the exercise:
- Participants add events to their layers showing what they've done
- EXCON adds inject events as the scenario evolves
- Comments on events can record observations and decisions
- Use **@username** in comments to notify specific team members

---

## Step 7: Recording Actuals

Encourage participants to:
- **Add actual events** showing what they did (not just what was planned)
- **Comment** on planned events with what actually happened and when
- **Set event status** to reflect completion (`completed`, `in_progress`, `pending`)

This creates an as-executed timeline alongside the planned timeline — the foundation for the AAR.

---

## Step 8: After Action Review (AAR)

### Generate a report
1. Click **Tools → 📄 Report**
2. Select the date range of the exercise
3. Choose format (HTML / PDF)
4. Download and distribute

### Using the timeline in the AAR
The AAR facilitator can:
- Display the timeline on a shared screen during the AAR session
- Show planned vs actual timings side by side (using different layers)
- Click events to show details and trigger discussion
- Export to CSV for quantitative analysis (response times, event frequency)

---

## Exercise Design Tips

### Use the colour convention
Consistent colour coding helps participants read the timeline at a glance:
- 🔴 Red — threats, adversary actions, emergencies
- 🟠 Orange — assigned tasks and responsibilities
- 🟢 Green — activities, completed actions
- 🔵 Blue — planning activities, meetings
- 🩶 Grey — admin, rest, recesses

### Use event types consistently
- `physical_meeting` for scheduled face-to-face meetings (include room in description)
- `standup` for brief check-ins and syncs
- `reporting` for SITREP and reporting events
- `decision` for key decision points
- `deadline` for hard cut-offs

### Plan for failure
Add contingency events (hidden from participants) for common failure modes:
- Inject delayed because participants are still handling previous inject
- Technical failure events (comms down, system failure)

---

## Reference: All Exercise Templates

See [06 — Template Reference](06-template-reference.md) for a complete listing of all 20 exercise templates with descriptions and usage notes.
