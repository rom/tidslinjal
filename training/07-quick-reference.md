# 07 — Quick Reference Card

One-page cheat sheet for experienced Tidslinjal users.

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Add event | `Ctrl+N` or click **➕ Add Event** |
| Undo last action | `Ctrl+Z` |
| Open help | `?` button |
| Submit comment | `Ctrl+Enter` (in comment box) |

---

## Event Types — Quick Colour Guide

| Colour | Type | Use |
|--------|------|-----|
| 🟢 Green `#27AE60` | activity | Ongoing work, patrols, operations |
| 🔴 Red `#E74C3C` | instant / event | Alerts, STARTEX, ENDEX, injects |
| 🟠 Orange `#E67E22` | assigned_task | Tasks with an owner |
| 🩵 Cyan `#00ACC1` | standup / reporting | Check-ins, SITREPs |
| 🔵 Blue `#3498DB` | planning / physical_meeting | Meetings, planning |
| 🟣 Purple `#8E44AD` | decision / advanced | Decisions, threats |
| ⚫ Dark `#2C3E50` | night | Night operations |
| 🩶 Grey `#7F8C8D` | admin | Recesses, admin |

---

## Template Loading

1. Tools → 📋 Templates → Load file OR Apply existing
2. Set **T=0** (STARTEX or incident detection time)
3. Click **Load Template**
4. Customise as needed

---

## Port Defaults

| TLS configured? | Default port |
|----------------|-------------|
| Yes | **443** |
| No | **8080** |

Override with `--port` flag or `PORT` environment variable.

---

## Default Offsets → Wall Clock (T=0 = 08:00)

| Offset | Time |
|--------|------|
| 0 | 08:00 Day 1 |
| 60 | 09:00 Day 1 |
| 240 | 12:00 Day 1 |
| 480 | 16:00 Day 1 |
| 720 | 20:00 Day 1 |
| 1440 | 08:00 Day 2 |
| 2880 | 08:00 Day 3 |

---

## Tools Panel Quick Access

| Button | Action |
|--------|--------|
| 📋 Templates | Manage and apply templates |
| ⬇ Export | Export timeline data (JSON/CSV/ICS) |
| ⬆ Import | Import events from file |
| 📄 Report | Generate HTML/PDF timeline report |
| ⏰ Auto reports | Schedule automatic report delivery |
| 📊 Plan vs Actual | Compare planned vs executed |
| 💾 Backup | Download full data backup (admin) |
| 🖨 Print | Print current timeline view |

---

## Regulatory Deadlines to Remember

| Regulation | Deadline | Template events |
|-----------|---------|----------------|
| GDPR Art. 33 | 72h after becoming aware | INC-07, INC-09, INC-11 |
| GDPR Art. 34 | Without undue delay (high risk) | INC-11 |
| NIS Directive | Sector-specific (varies) | INC-10 |
| Financial sector | Sector-specific | INC-09 |

---

## Clock Controls

| Action | How |
|--------|-----|
| Toggle Local/UTC | Click the clock |
| Add timezone clock | Click **+** next to clock |
| Detach to window | Click **⧉** next to clock |
| Remove extra clock | Click **×** on the clock widget |

---

## @mention Autocomplete

In any comment box, type `@` followed by the start of a username to trigger autocomplete. Arrow keys to select, Enter/Tab to insert.

---

## Common Admin Tasks

| Task | Location |
|------|---------|
| Create user | Sidebar → Users → Add User |
| Set roles/capabilities | Admin → Users → Role Editor |
| Configure TLS | Admin → System → TLS Settings |
| Set up SSO/OIDC | Admin → System → SSO |
| View audit log | Sidebar → Audit |
| Generate API key | Sidebar → Settings → API Keys |
| Configure webhooks | Sidebar → Settings → Integrations |

---

## Template Quick-Pick

| Duration | Co-located | Virtual/Distributed | Special |
|----------|-----------|--------------------|----|
| 1 day | EX-01 (QRF), EX-02 (Cyber) | EX-02 | EX-15 (SpecOps) |
| 2 days | EX-03 (24/7), EX-04 (WH) | EX-05 (24/7), EX-06 (WH) | EX-11 (Border), EX-16 (CBRN), EX-18 (AD) |
| 3 days | EX-07 (Military) | — | EX-08 (Crisis), EX-12 (Maritime), EX-17 (InfoOps), EX-20 (EW) |
| 4 days | EX-13 (CIMIC) | — | — |
| 5 days | EX-09 (NATO), EX-10 (FullSpectrum) | — | EX-14 (Log), EX-19 (Peace) |

---

## Incident Template Quick-Pick

| Incident Type | Template |
|--------------|---------|
| DDoS | INC-01 |
| Hacker intrusion | INC-02 / INC-03 |
| Ransomware | INC-04 |
| Wiper / destructive | INC-05 |
| DC fire / physical | INC-06 |
| Supply chain | INC-07 |
| Insider threat | INC-08 |
| Phishing / BEC | INC-09 |
| OT/ICS attack | INC-10 |
| Cloud breach | INC-11 |
