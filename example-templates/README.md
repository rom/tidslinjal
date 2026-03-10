# Example Templates

Ready-to-use starter templates for the Tidslinjal collaborative timeline tool. These templates are simple, practical starting points — load one, set your start date, and customise it for your situation.

## Three Classes of Templates

Tidslinjal templates fall into three categories of actions:

| Class | Prefix | Purpose |
|-------|--------|---------|
| **Exercises** | `exercise-` | Training events — tabletops, drills, and rehearsals where participants practise responses to simulated scenarios |
| **Incidents** | `incident-` | Real-world (or simulated) incident response — managing an ongoing crisis from detection through resolution |
| **Operations** | `operations-` | Day-to-day or recurring operational activities — shift management, project delivery, event coordination |

## Templates in This Directory

### Exercises (3 templates)

| File | Duration | Description |
|------|----------|-------------|
| `exercise-tabletop-halfday.json` | 3 hours | Half-day tabletop discussion exercise. No live systems — participants discuss responses to scenario injects around a table. Includes facilitator role, three inject rounds, and lessons capture. |
| `exercise-fire-drill-2h.json` | 2 hours | Building evacuation / fire drill. Covers alarm activation, evacuation, assembly point head count, all-clear, and debrief. Uses Safety Officer, Floor Warden, and Observer roles. |
| `exercise-comms-check-1h.json` | 1 hour | Communications verification exercise. Tests primary and secondary channels (radio, phone, email, chat) plus alert notifications. Confirms contact lists are current. |

### Incidents (3 templates)

| File | Duration | Description |
|------|----------|-------------|
| `incident-it-outage-4h.json` | 4 hours | Basic IT service outage response: detection, diagnosis, fix, verification, and user communication. Starting point for any technical service disruption. |
| `incident-security-breach-3day.json` | 3 days | Security breach (unauthorized access / data leak): containment, forensic investigation, remediation, stakeholder notification, and post-incident review. Includes IC, Lead Investigator, and Communications Lead roles. |
| `incident-natural-disaster-1week.json` | 1 week | Natural disaster (storm, flood, earthquake) emergency response: immediate response, sustained field operations, stabilisation, and transition to recovery. Uses ICS-style roles (IC, Operations Chief, Logistics Chief, PIO). |

### Operations (3 templates)

| File | Duration | Description |
|------|----------|-------------|
| `operations-event-management-1day.json` | 1 day | Conference or event management: venue setup, registration, keynote, session blocks, breaks, closing, teardown, and staff debrief. |
| `operations-project-sprint-2week.json` | 2 weeks | Agile project sprint: sprint planning, daily standups, mid-sprint review, final push, demo, retrospective. Uses Product Owner, Team, and Scrum Master groups. |
| `operations-shift-handover-12h.json` | 12 hours | Single 12-hour shift for operations centres or control rooms: incoming handover, system checks, monitoring, reporting, and outgoing handover. Use as a repeating daily pattern. |

## How to Use These Templates

1. Open Tidslinjal and click the **Templates** toolbar button.
2. Click **Import from file**.
3. Select one or more `.json` files from this directory.
4. Click **Apply** next to the template you want to use.
5. Set the **start date and time** (T=0) — all events are scheduled relative to this moment.
6. Optionally select a target layer.
7. Click **Load Template**.

After loading, customise freely:
- Drag events to adjust timings
- Add, remove, or rename events for your scenario
- Edit phases and groups to match your organisation
- Save your modified version as a new template

## Template Structure

Each template JSON file contains:

- **name** and **description** — what the template is for
- **phases** — colour-coded timeline segments (e.g., "Detection", "Response", "Recovery")
- **groups** — organisational groups or teams involved
- **roles** (optional) — named roles with descriptions
- **events** — the timeline events, each with a type, time offset, duration, and responsible group

All time offsets are in minutes from T=0 (the start time you set when loading).

## Advanced Templates in the Training Directory

The `training/` directory contains a larger library of **37 templates** with comprehensive documentation and step-by-step training guides:

- **20 exercise templates** (`ex01`–`ex20`) — from 1-day QRF drills to 5-day NATO coalition exercises, covering military, civilian, and specialist domains
- **11 incident response templates** (`inc01`–`inc11`) — cybersecurity scenarios from DDoS attacks to nation-state intrusions
- **6 starter templates** (`tpl-*`) — basic exercise, incident, and operations frameworks

If you need more complex or domain-specific templates, see the [`training/` directory](../training/).
