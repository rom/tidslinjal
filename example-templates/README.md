# Example Templates for Tidslinjal

This directory contains **10 ready-made exercise templates** for the Tidslinjal collaborative timeline tool. They serve as both working starting points for real exercise planning and as learning material for understanding how to structure exercises of different types and durations.

---

## How to Load These Templates

1. Open Tidslinjal and click the **📋 Templates** toolbar button.
2. Click **Import from file**.
3. Select one or more `.json` files from this directory.
4. The template(s) will appear in the Templates list.
5. Click **▶ Apply** next to a template.
6. In the dialog, enter the **Exercise start date & time (STARTEX / T=0)**. All events, phases, and locks will be scheduled relative to this moment.
7. Optionally select a target layer.
8. Click **Load Template**.

You can import all 10 templates at once by selecting multiple files.

---

## Template Overview

| # | File | Duration | Hours | Location | Key Theme |
|---|------|----------|-------|----------|-----------|
| 01 | `ex01-quick-reaction-force.json` | 1 day | 0800–1700 | Co-located | Rapid response, escalation |
| 02 | `ex02-cyber-defence-sprint.json` | 1 day | 0800–1700 | Co-located | Blue/Red cyber defence |
| 03 | `ex03-joint-command-post-collocated-24h.json` | 2 days | Around the clock | Co-located | Battle rhythm, night ops |
| 04 | `ex04-urban-defence-collocated-hours.json` | 2 days | 0800–1700 | Co-located | Urban tactics, planning |
| 05 | `ex05-distributed-command-virtual-24h.json` | 2 days | Around the clock | Virtual/Distributed | Remote ops via Teams/Mattermost |
| 06 | `ex06-staff-training-virtual-hours.json` | 2 days | 0800–1700 | Virtual/Distributed | Staff procedures training |
| 07 | `ex07-combined-arms-manoeuvre-3day.json` | 3 days | 24h × 2, then working hours | Co-located | Multi-domain manoeuvre |
| 08 | `ex08-crisis-management-3day-hours.json` | 3 days | 0800–1800 | Multi-agency | Civil crisis response |
| 09 | `ex09-nato-integration-5day-24h.json` | 5 days | Around the clock (D1–D4) + working hours D5 | Coalition | Multinational operations |
| 10 | `ex10-full-spectrum-warfare-5day.json` | 5 days | Working hours D1–D2, 24h D3–D4, working hours D5 | Mixed | Full spectrum, all phases |

---

## Detailed Template Descriptions

---

### EX-01: Quick Reaction Force
**File:** `ex01-quick-reaction-force.json`
**Duration:** 1 day · 0800–1700 (9 hours)
**Location:** Co-located

A single-day rapid response exercise where a QRF unit responds to two sequential security incidents. Designed to develop rapid decision-making under pressure, escalation authority, and after-action review skills.

**Structure:**
- **INITEX & Preparation** (0800–0900): Commander's brief, initial threat report, team readiness checks
- **Initial Response** (0900–1200): Two exercise injects (perimeter breach + hostile vehicle), parallel team deployments, SITREP discipline
- **Resolution** (1200–1600): Incident resolution, situation reports, post-incident assessment
- **ENDEX & AAR** (1600–1700): Structured after action review

**Special features:**
- **Time lock** on the lunch period (1200–1300) — demonstrates mandatory rest/admin time in templates
- 4 exercise phases with distinct colours
- Uses all four SITREP-type events (instant, reporting, standup, assigned_task)

**Best for:** New exercise planners learning template structure; teams new to SITREP discipline; exercises with a simple single-location scenario.

---

### EX-02: Cyber Defence Sprint
**File:** `ex02-cyber-defence-sprint.json`
**Duration:** 1 day · 0800–1700 (9 hours)
**Location:** Co-located (but could be virtual)

A single-day cyber defence exercise where a blue team defends infrastructure against a simulated red team. The red/blue dynamic is demonstrated through sequential exercise injects (red actions) followed by blue response tasks.

**Structure:**
- **Setup & Reconnaissance** (0800–0900): Baseline assessment, network briefing
- **Initial Attack Wave** (0900–1100): Port scan, phishing, blue response, patch sprint
- **Defence & Recovery** (1100–1500): Log analysis, lateral movement response, incident report
- **Advanced Threat** (1500–1600): Data exfiltration attempt, network segmentation decision
- **Debrief** (1600–1700): Technical AAR with red team reveal

**Special features:**
- Red team events use `event` type with red (#C0392B) colouring — visually distinguishable injects
- No locks — cyber exercises run dynamically without scheduled breaks
- Shows how to structure an adversarial exercise with action-reaction pairs

**Best for:** IT security teams; cyber incident response practice; exercises with a red team/blue team structure.

---

### EX-03: Joint Command Post — Co-located, 48h
**File:** `ex03-joint-command-post-collocated-24h.json`
**Duration:** 2 days · Around the clock (48 hours)
**Location:** Co-located (same physical site)

A 48-hour around-the-clock command post exercise. All participants are at the same physical location. The template demonstrates:
- **Battle rhythm** across day and night periods
- **Shift handover** pattern (day/night/day)
- **Physical meeting locations** identified in event descriptions
- **Night watch** with reduced activity and watchkeeper reporting

**Structure:**
- 5 phases spanning day 1, night 1, day 2, night 2, and consolidation
- Two time locks for overnight admin windows
- Heavy use of `physical_meeting` event type

**Compare with EX-05** (same duration but distributed/virtual).

**Best for:** Command post exercise (CPX) training; developing battle rhythm procedures; multi-shift operations.

---

### EX-04: Urban Defence — Co-located, Working Hours
**File:** `ex04-urban-defence-collocated-hours.json`
**Duration:** 2 days · 0800–1700 (working hours only)
**Location:** Co-located (shared training facility)

A 2-day working-hours-only exercise at a physical training facility. Day 1 is planning-focused; Day 2 is execution. Demonstrates how to design an exercise that:
- Stops at 1700 each day (overnight recess lock)
- Has explicit lunch breaks (locked time)
- Uses physical meeting locations throughout
- Transitions from planning (D1) to execution (D2)

**Special features:**
- 3 time locks: D1 lunch, D1 overnight recess, D2 lunch
- Overnight recess lock ensures nothing is scheduled in the gap
- `physical_meeting` events with room names specified in descriptions

**Compare with EX-03** (same 2-day concept but 24/7 co-located) and **EX-06** (same working-hours concept but virtual).

**Best for:** Training facilities with defined working hours; exercises where participants go home at night; planning and execution phases across two days.

---

### EX-05: Distributed Command — Virtual, 48h
**File:** `ex05-distributed-command-virtual-24h.json`
**Duration:** 2 days · Around the clock (48 hours)
**Location:** Distributed (different locations, all virtual)

The virtual counterpart to EX-03. Same 48-hour duration, same overall structure — but all coordination is conducted via **Mattermost channels** and **MS Teams calls**. Demonstrates:
- Virtual meeting rhythms (named channels referenced in descriptions)
- Remote connectivity verification as a key event
- Digital information management (shared drives, forms, dashboard monitoring)
- How distance creates coordination overhead (more standups, more sitreps)

**Special features:**
- All meetings tagged as "Virtual: …" with tool name (Teams/Mattermost)
- Two system maintenance windows (locks) for virtual platform restarts
- Night operations show reduced staffing with duty officers monitoring dashboards

**Compare with EX-03** (same schedule but physical co-location).

**Best for:** Distributed teams; remote exercise planning; exercises where participants are in different cities or countries.

---

### EX-06: Staff Training — Virtual, Working Hours
**File:** `ex06-staff-training-virtual-hours.json`
**Duration:** 2 days · 0800–1700 (working hours only)
**Location:** Distributed (virtual via MS Teams)

The virtual counterpart to EX-04. Training-focused: Day 1 delivers three structured training modules on staff procedures; Day 2 applies them in a live scenario. Demonstrates:
- Module-based training structure
- Standup-heavy rhythm (check-ins after each module)
- Assignment distribution (`assigned_task` type with overnight deadline)
- Applied exercise with assessed outputs (SITREP form, lessons observed report)

**Special features:**
- `standup` type used throughout for lightweight check-ins
- Overnight assignment between D1 and D2 builds in preparation time
- D2 is fully assessed: participants submit SITREPs, decisions, and lessons reports

**Best for:** Staff officer training at distance; professional military education; exercises with assessed deliverables.

---

### EX-07: Combined Arms Manoeuvre — 3 Days
**File:** `ex07-combined-arms-manoeuvre-3day.json`
**Duration:** 3 days · 24h for D1–D2, working hours for D3 (consolidation)
**Location:** Co-located / field exercise

A 3-day field-style combined arms manoeuvre exercise covering find-fix-finish-exploit. The most military-realistic template, showing:
- **Fire support coordination** as a distinct event type
- **Night navigation** and night operations
- **Breach and exploitation** phases with colour-coded injects
- **Physical meetings** at the Command Post for key decisions
- **Safety locks** on fire support windows during night

**Structure:**
- Phase 1: INITEX, fire plan, advance to contact (D1)
- Phase 2: Breach and exploitation (D1 night — D2)
- Phase 3: Consolidation and AAR (D3, working hours)

**Special features:**
- 2 fire support exclusion locks (red safety windows at night)
- Mix of `physical_meeting`, `event` (injects), `decision`, `assigned_task`
- 35+ events showing a realistic exercise density

**Best for:** Military manoeuvre exercises; combined arms integration training; exercises with fire support coordination.

---

### EX-08: Crisis Management Simulation — 3 Days
**File:** `ex08-crisis-management-3day-hours.json`
**Duration:** 3 days · 0800–1800 (working hours with overnight recess)
**Location:** Multi-agency (EOC activation)

A civilian-style crisis management simulation, fundamentally different from military exercises. This template demonstrates:
- **Multi-agency coordination** (Police, Fire, Health, Utilities, Transport)
- **Public information management** (PIO events, deadline events for press statements)
- **Escalation through the 3 days** (initial response → escalation → stabilization → recovery)
- **Working-hours rhythm** with overnight recess locks

**Special features:**
- Uses `deadline` event type (red) for time-critical public communication requirements
- 5 time locks including two overnight recesses and three lunch breaks
- D3 is dedicated to recovery and lessons — deliberately lower tempo
- No physical meetings (could be virtual or co-located EOC)

**Best for:** Civil emergency planning; multi-agency coordination exercises; public safety organisations; exercises covering the full crisis cycle.

---

### EX-09: NATO Integration Exercise — 5 Days
**File:** `ex09-nato-integration-5day-24h.json`
**Duration:** 5 days · Around the clock D1–D4, working hours D5
**Location:** Coalition (multinational, co-located HQ)

The most complex continuously-running template. 5-day NATO-style coalition exercise with:
- **Multinational coordination** (coalition HQ, liaison officers, national contingents)
- **4 distinct operational phases** (Force Laydown → Shaping → Decision → Exploitation)
- **LOGREP reporting** alongside SITREPs (4 logistics reports)
- **Decision gateways** between phases
- **Physical closing ceremony** on D5
- **5 admin locks** (one per night)

**Structure:**
- D1: INITEX, force laydown, Phase 1 initiating
- D2: Phase 1 continuation, Decision Point Alpha → Phase 2 transition
- D3: Phase 2 operations
- D4: Phase 3 exploitation
- D5: Working hours — multinational AAR, closing ceremony

**Special features:**
- Uses `physical_meeting` for the closing ceremony
- LOGREPs show how logistics reporting works alongside tactical reporting
- 5 overnight admin locks ensure no injections during maintenance windows

**Best for:** Large multinational exercises; NATO/coalition interoperability training; exercises requiring sustained multi-phase operations.

---

### EX-10: Full Spectrum Warfare — 5 Days
**File:** `ex10-full-spectrum-warfare-5day.json`
**Duration:** 5 days · Mixed (D1–D2 working hours, D3–D4 24/7, D5 working hours)
**Location:** Mixed

The most varied-intensity template. Demonstrates how exercise tempo deliberately changes across phases:
- **D1 (working hours):** Pure planning — mission analysis, COA development, wargame
- **D2 (working hours):** Orders production, rehearsal, pre-deployment silence lock
- **D3–D4 (24/7):** Full-intensity combat operations with day and night activities
- **D5 (working hours):** Transition to stability, multi-agency reconstruction conference, AAR

**Special features:**
- Pre-deployment operational security lock (D2 evening → D3 start)
- **Information operations** and **cyber operations** as distinct event types (not just ground manoeuvre)
- Transition from combat to stability operations modelled explicitly
- Progression: `activity` (planning) → `event` (combat injects) → `activity` (stability)
- 7 time locks of different types

**Compare with EX-09:** EX-09 is continuously running (no working-hours limitation); EX-10 has deliberate intensity variation to model a realistic pre/during/post combat cycle.

**Best for:** Advanced exercise planners; full-spectrum operations training; exercises covering the compete–contest–conflict–stabilise cycle.

---

## Design Principles Behind These Templates

### 1. Synthetic Time
All templates are designed for use with Tidslinjal's **synthetic time** feature. Set STARTEX as T=0 and the synthetic clock will advance Day N / T+Xh relative to that epoch. The event names and descriptions use synthetic time references (e.g., "Day 1", "D2", "H+4").

### 2. T=0 = STARTEX = 0800 Day 1
All offsets in these templates assume T=0 equals 08:00 on the first day. When loading a template, set the base date/time to your desired 0800 Day 1 to get the correct schedule.

### 3. Event Type Colour Coding
Across all templates, consistent colour logic is applied:
- 🔴 Red (`#E74C3C`, `#C0392B`) — STARTEX, ENDEX, combat injects, crises
- 🟠 Orange (`#E67E22`) — Assigned tasks and responsibility
- 🟢 Green (`#2ECC71`, `#27AE60`) — Activities, decisions (positive)
- 🔵 Blue (`#3498DB`) — Planning phases
- 🔵 Cyan (`#00ACC1`) — Standups and check-ins
- 🟣 Purple (`#9B59B6`, `#8E44AD`) — Advanced threats, multi-domain operations
- ⚫ Dark (`#2C3E50`) — Night operations
- 🩶 Grey (`#7F8C8D`, `#95A5A6`) — Meetings, recesses

### 4. Phases
Each template includes **exercise phases** that colour the timeline background:
- Phases help participants visually locate themselves in the exercise arc
- Phase colours are deliberately different from event colours
- Night periods use dark (`#2C3E50`) phase colour

### 5. Time Locks
Templates include **locked time slots** for:
- Mandatory lunch breaks (prevent scheduling over food)
- Overnight recesses (prevent scheduling while exercise is paused)
- Safety windows (fire support, system maintenance)
- Operational security holds (pre-deployment silence)

These locks appear as blocked/hatched slots on the timeline and prevent new events being dropped into them.

### 6. Progression of Complexity
The 10 templates follow a deliberate learning progression:
```
EX-01  →  Simple, 1-day, single location
EX-02  →  1-day, adversarial (red/blue) structure
EX-03  →  2-day, 24/7, co-located
EX-04  →  2-day, working hours only, co-located
EX-05  →  2-day, 24/7, virtual/distributed
EX-06  →  2-day, working hours, virtual
EX-07  →  3-day, mixed hours, military
EX-08  →  3-day, working hours, multi-agency
EX-09  →  5-day, 24/7 coalition, complex
EX-10  →  5-day, variable intensity, full spectrum
```

### 7. Same-vs-Different Locations (EX-03/05 and EX-04/06)
Four templates are paired to highlight the difference between **co-located** and **virtual/distributed** exercises of the same duration and hour type:

| Days | Hours | Co-located | Virtual |
|------|-------|-----------|---------|
| 2 | 24/7 | EX-03 | EX-05 |
| 2 | Working hours | EX-04 | EX-06 |

Comparing EX-03 with EX-05 shows: virtual exercises require more structured standups, explicit channel references, connectivity checks, and system maintenance windows. Co-located exercises rely on physical meeting rooms and face-to-face orders.

---

## Customising Templates

After loading a template, you can:

1. **Adjust event timings** — drag events to new times or right-click → Move to new time/date.
2. **Add exercise-specific events** — use the **+** button or Ctrl+click to select and move groups.
3. **Update phase colours** — edit phases from the sidebar Phases tab.
4. **Set STARTEX in exercise settings** — configure the synthetic time epoch to match your loaded base time.
5. **Save a modified version** — use **💾 Save as Template** to save your customised exercise as a new template (specify the date range to capture when saving).

---

## Roles

These templates do not include role configurations (each organisation will have different role names). Configure roles using the **🛡 Role Editor** in the Users tab of the sidebar, then save them with your templates.

---

## Questions and Contributions

Raise issues or suggest improvements at the project repository.
