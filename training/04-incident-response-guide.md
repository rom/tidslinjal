# 04 — Incident Response Guide

This guide covers how to use Tidslinjal during a **live incident** — cyber attack, physical disaster, or any emergency requiring coordinated response.

---

## Why Use Tidslinjal During an Incident?

During an incident, teams need to:
- **Maintain a shared operational picture** — what has happened, what is happening, what needs to happen
- **Track tasks and ownership** — who is doing what, are deadlines being met
- **Record everything** — for regulatory reporting, post-incident review, and legal evidence
- **Coordinate across teams** — SOC, IT, Legal, Management, PR often work in parallel

Tidslinjal provides a real-time collaborative timeline for all of this.

---

## Setting Up for an Incident

### Option A: Start from scratch
1. Log in and set the timeline to **Incident mode** (Settings → Operation Mode → Incident).
2. Set T=0 to the **time the incident was detected**.
3. Create your first event: `Incident Detected` (instant event, T=0).
4. Begin adding events as the incident unfolds.

### Option B: Load an incident template
Pre-built templates provide a complete planned response timeline. Adjust as the incident evolves.

1. **Tools → Templates → Load template file**.
2. Choose the template closest to your incident type:

| Template | Use when... |
|----------|------------|
| `inc01-ddos-attack-2day.json` | DDoS attack on internet services |
| `inc02-hacker-attack-4day.json` | Targeted intrusion / hacker attack |
| `inc03-large-hacker-attack-8day.json` | APT / nation-state intrusion |
| `inc04-ransomware-2week.json` | Ransomware encryption attack |
| `inc05-wiper-attack-4week.json` | Destructive wiper malware |
| `inc06-datacenter-fire-12week.json` | Physical disaster / DC fire |
| `inc07-supply-chain-attack-3week.json` | Supply chain compromise |
| `inc08-insider-threat-2week.json` | Insider threat / data exfiltration |
| `inc09-phishing-campaign-1week.json` | Phishing / BEC attack |
| `inc10-ot-ics-attack-10day.json` | OT/ICS / SCADA attack |
| `inc11-cloud-breach-5day.json` | Cloud infrastructure breach |

3. Set T=0 to the **incident detection time**.
4. Click **Load Template**.

---

## The Incident Timeline Pattern

All incident response templates follow a common pattern:

```
T=0  → Detection / Alert
T+Xh → Triage & Initial Assessment
T+Xh → Containment Actions
T+Xh → Investigation / Forensics
T+Xh → Eradication & Remediation
T+Xh → Recovery
T+Xh → Post-Incident Report
```

Load a template and the pre-populated events guide your response team through each phase.

---

## During the Incident: Real-Time Updates

### Recording what happens
As the incident evolves, **add actual events** to the timeline:
- When you discover something new, add an `instant event` with the finding
- When you complete a task, mark it `completed` or add a comment
- When a decision is made, add a `decision` event with the rationale

### Using comments for evidence
Every event has a **comments thread**. Use this to:
- Record detailed findings and timestamps
- Note who made which decisions and why
- Attach log files, screenshots, and evidence (file attachments)
- Tag colleagues with **@username** to ensure they see critical updates

### Tracking regulatory deadlines
Many incidents have mandatory notification timelines:
- **GDPR Article 33**: 72 hours to notify the supervisory authority after becoming aware of a breach
- **NIS Directive**: Sector-specific notification timelines for critical infrastructure
- **Financial regulators**: Various sector-specific timelines

Use the **deadline** event type (red) for these. Set an **alarm lead time** (e.g., 120 minutes before the deadline) so you get a reminder.

---

## Layers for Incident Response

Set up layers to separate activities:

| Layer | Contents | Access |
|-------|----------|--------|
| SOC Operations | Detection, monitoring, containment actions | SOC team — readwrite |
| Forensics | Investigation findings, evidence chain | Forensics team — readwrite |
| IT Remediation | Patching, system changes, recovery | IT Ops — readwrite |
| Legal & Compliance | Notifications, regulatory comms | Legal — readwrite |
| Management | Decisions, communications | Management — read-only |

Management sees the full picture without being able to accidentally modify technical events.

---

## Key Features for Incident Response

### Alarms
Set alarms on critical events so responders are notified before they happen:
- 15 minutes before a shift handover
- 60 minutes before a regulatory deadline
- 30 minutes before a management briefing

Right-click any event → **Set Alarm** → choose lead time.

### @username Mentions
In event comments, type `@` followed by a username to notify a colleague. This is useful for:
- Alerting a team member that their task is ready
- Escalating a finding to the Incident Commander
- Requesting a decision from Legal or Management

### Audit Log
Every change to the timeline is recorded in the **Audit Log** (Sidebar → Audit). During an incident, the audit log provides:
- A tamper-evident record of who changed what and when
- Evidence of decision-making for regulatory submissions
- Timeline of actions for the post-incident report

### Export for Reporting
After containment, export the timeline for your incident report:
1. **Tools → Export** → JSON (full data) or CSV (summary)
2. **Tools → Report** → Generate HTML report for management distribution

---

## Shift Handovers

For 24/7 incidents, proper shift handovers are critical. Use Tidslinjal to:

1. Add a **standup** event at each handover time.
2. In the event description: document what the outgoing shift achieved, what is outstanding, and what the incoming shift must do.
3. Add a **comment** to the handover event confirming the handover was completed and who the incoming shift commander is.

The template shifts (in `inc01`, `inc03`, etc.) demonstrate this pattern with pre-populated handover events.

---

## Post-Incident: Generating the Report

### Using the Report feature
1. **Tools → 📄 Report**
2. Select the full incident date range
3. Choose "Include all event types" and "Include comments"
4. Generate and download

The report includes:
- Phase overview
- Chronological event list with times, descriptions, and comments
- Decision log
- Task completion summary

### Using the timeline in the post-incident review
During the review meeting:
- Display the timeline on a shared screen
- Walk through the timeline chronologically
- Compare planned (template) events with actual events added during the incident
- Identify gaps, delays, and successes

---

## Operational Security

> **Important:** The incident timeline may contain sensitive forensic information, attacker IoCs, and details of vulnerabilities. Ensure:
> - Access is restricted to authorised incident responders (use roles and groups)
> - The instance is accessible only via VPN if the incident involves an active attacker
> - Sensitive forensic details are on restricted layers (not visible to all users)
> - Export and backup are performed at end of incident for evidence preservation

---

## Reference: All Incident Templates

See [06 — Template Reference](06-template-reference.md) for a complete listing of all 11 incident response templates with descriptions.
