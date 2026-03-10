# Tidslinjal Training Materials

This directory contains training instructions, reference materials, and a comprehensive library of example templates for the Tidslinjal collaborative timeline tool.

## Three Classes of Example Actions

All templates in Tidslinjal are built around three classes of actions:

| Class | Description | Templates |
|-------|-------------|-----------|
| **Exercises** | Simulated training events — tabletops, drills, command post exercises, and field exercises where participants practise responses to scenarios | 20 detailed scenarios (`ex01`–`ex20`) + 2 starter templates (`tpl-exercise-*`) |
| **Incidents** | Real-world or simulated incident response — managing a crisis from detection through containment, eradication, recovery, and lessons learned | 11 detailed scenarios (`inc01`–`inc11`) + 2 starter templates (`tpl-incident-*`) |
| **Operations** | Day-to-day or recurring operational activities — battle rhythm, shift management, weekly planning cycles, and sustained operations | 2 starter templates (`tpl-operations-*`) |

These templates were originally located in the `example-templates/` directory and have been moved here alongside the training guides. The `example-templates/` directory now contains a separate set of **9 simple, basic templates** designed as quick starting points for new users.

## Training Guides

| File | Description |
|------|-------------|
| [01-getting-started.md](01-getting-started.md) | First steps: login, navigation, creating your first event |
| [02-working-with-templates.md](02-working-with-templates.md) | Loading, customising, and saving templates |
| [03-exercise-planning-guide.md](03-exercise-planning-guide.md) | How to plan and run exercises with Tidslinjal |
| [04-incident-response-guide.md](04-incident-response-guide.md) | How to use Tidslinjal for cyber/physical incident response |
| [05-collaboration-and-roles.md](05-collaboration-and-roles.md) | Multi-user collaboration, roles, layers, and groups |
| [06-template-reference.md](06-template-reference.md) | Reference card for all 37 templates in this directory |
| [07-quick-reference.md](07-quick-reference.md) | One-page cheat sheet for experienced users |

## Template Library

### Starter Templates (6)

Basic frameworks to build your own timelines from scratch:

| File | Class | Duration | Description |
|------|-------|----------|-------------|
| `tpl-exercise-1day.json` | Exercise | 1 day | Simple single-day exercise: INITEX, injects, decision point, ENDEX, AAR |
| `tpl-exercise-3day.json` | Exercise | 3 days | Standard three-day exercise: preparation, execution, evaluation |
| `tpl-incident-1day.json` | Incident | 1 day | Basic incident response: detection, triage, containment, recovery |
| `tpl-incident-1week.json` | Incident | 1 week | Extended incident lifecycle: detection through post-incident review |
| `tpl-operations-daily.json` | Operations | 24 hours | Daily battle rhythm: morning brief, active ops, reporting, handover |
| `tpl-operations-weekly.json` | Operations | 1 week | Weekly cycle: Monday kick-off, standups, mid-week review, Friday wrap |

### Exercise Scenarios (20)

Detailed exercise templates ranging from 1-day drills to 5-day multinational operations:

| # | File | Duration | Key Theme |
|---|------|----------|-----------|
| 01 | `ex01-quick-reaction-force.json` | 1 day | Rapid response, escalation |
| 02 | `ex02-cyber-defence-sprint.json` | 1 day | Blue/Red cyber defence |
| 03 | `ex03-joint-command-post-collocated-24h.json` | 2 days (24h) | Battle rhythm, night ops |
| 04 | `ex04-urban-defence-collocated-hours.json` | 2 days | Urban tactics, planning |
| 05 | `ex05-distributed-command-virtual-24h.json` | 2 days (24h) | Remote ops via Teams/Mattermost |
| 06 | `ex06-staff-training-virtual-hours.json` | 2 days | Staff procedures training |
| 07 | `ex07-combined-arms-manoeuvre-3day.json` | 3 days | Multi-domain manoeuvre |
| 08 | `ex08-crisis-management-3day-hours.json` | 3 days | Civil crisis response |
| 09 | `ex09-nato-integration-5day-24h.json` | 5 days | Multinational operations |
| 10 | `ex10-full-spectrum-warfare-5day.json` | 5 days | Full spectrum, all phases |
| 11 | `ex11-border-security-operation-2day.json` | 2 days | Border interdiction, customs |
| 12 | `ex12-maritime-patrol-3day.json` | 3 days | Patrol, boarding, SAR |
| 13 | `ex13-civil-military-cooperation-4day.json` | 4 days | CIMIC, flood response |
| 14 | `ex14-logistics-sustainment-5day.json` | 5 days | Supply chain, MEDEVAC |
| 15 | `ex15-hostage-rescue-operation-1day.json` | 1 day | HRO, assault, exploitation |
| 16 | `ex16-nbc-cbrn-response-2day.json` | 2 days | CBRN detection, decon |
| 17 | `ex17-information-operations-3day.json` | 3 days | Counter-disinfo, PSYOPS |
| 18 | `ex18-air-defence-exercise-2day.json` | 2 days | SAM batteries, radar |
| 19 | `ex19-peacekeeping-stabilisation-5day.json` | 5 days | Peacekeeping, CIMIC, ROE |
| 20 | `ex20-electronic-warfare-3day.json` | 3 days | SIGINT, jamming, spectrum |

### Incident Scenarios (11)

Real-world cybersecurity and physical disaster response plans:

| # | File | Duration | Scenario |
|---|------|----------|----------|
| 01 | `inc01-ddos-attack-2day.json` | 2 days | DDoS attack |
| 02 | `inc02-hacker-attack-4day.json` | 4 days | Targeted cyber intrusion |
| 03 | `inc03-large-hacker-attack-8day.json` | 8 days | APT / nation-state intrusion |
| 04 | `inc04-ransomware-2week.json` | 2 weeks | Ransomware attack |
| 05 | `inc05-wiper-attack-4week.json` | 4 weeks | Destructive wiper malware |
| 06 | `inc06-datacenter-fire-12week.json` | 12 weeks | Datacenter fire / physical disaster |
| 07 | `inc07-supply-chain-attack-3week.json` | 3 weeks | Software supply chain compromise |
| 08 | `inc08-insider-threat-2week.json` | 2 weeks | Insider threat / data exfiltration |
| 09 | `inc09-phishing-campaign-1week.json` | 1 week | Targeted phishing / BEC |
| 10 | `inc10-ot-ics-attack-10day.json` | 10 days | OT/ICS / SCADA cyber attack |
| 11 | `inc11-cloud-breach-5day.json` | 5 days | Cloud infrastructure breach |

## Who Is This For?

These materials are designed for:
- **New users** starting with Tidslinjal for the first time
- **Exercise planners** building timelines for military and civilian exercises
- **Incident response teams** using Tidslinjal during live cyber or physical incidents
- **Operations managers** running daily or weekly operational cycles
- **Administrators** configuring Tidslinjal for their organisation
- **Trainers** running Tidslinjal training sessions

## Recommended Learning Path

```
New user          → 01-getting-started → 02-working-with-templates
Exercise planner  → 01 → 02 → 03 → 06 (template reference)
Incident responder → 01 → 02 → 04 → 06 (template reference)
Operations user   → 01 → 02 → 05 → tpl-operations-daily / tpl-operations-weekly
Admin             → 01 → 05 → main README.md
```

## Quick-Start Templates

If you just need a simple starting point without the full training material, see the [`example-templates/`](../example-templates/) directory which contains 9 basic templates across all three action classes (exercises, incidents, operations).
