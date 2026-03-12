# 02 — Working with Templates

Templates let you start a new timeline pre-populated with phases, groups, layers, locks, and events. Tidslinjal comes with 31 example templates covering exercises and cyber/physical incident response.

---

## What a Template Contains

A template is a JSON file that bundles:

| Component | Description |
|-----------|-------------|
| **Name & description** | Template title and summary |
| **Phases** | Colour-coded timeline segments (e.g., "Phase 1 — Detection") |
| **Groups** | Teams or roles who participate |
| **Layers** | Timeline tracks (one per group or role) |
| **Locks** | Pre-blocked time slots (breaks, maintenance windows) |
| **Events** | Pre-populated activities, meetings, reports, injects |

All events use **time offsets** (minutes from T=0). When you load a template, you choose the T=0 start time and everything is scheduled relative to it.

---

## Loading a Template

### From the built-in template library

1. Click **Tools** in the sidebar, then click **📋 Templates**.
2. The Templates panel shows all saved templates.
3. Click **▶ Apply** next to a template.
4. Set the **T=0 start date and time** (STARTEX / incident start).
5. **Multi-layer loading:** If the template defines layers, the "Use template layers" checkbox is checked by default. This creates separate layers (e.g., *injects*, *sitreps*, *decisions*) and assigns events to them automatically. Uncheck to load everything into a single layer.
6. Click **Load Template**.

### From a file (importing)

1. Click **Tools → 📋 Templates**.
2. Click **📂 Load from file…**
3. Select one or more `.json` template files (e.g., from the `example-templates/` directory).
4. The templates are added to your library.
5. Apply as above.

> **Tip:** You can import multiple files at once by selecting them all in the file picker.

---

## T=0 — Setting the Start Time

When you click **▶ Apply** on a template, you are asked for a **base date and time**. This is **T=0** (STARTEX for exercises, incident start for incident response).

**Example:** If the template has an event at `offset 480 minutes` and you set T=0 to `2025-03-10 08:00`, the event will appear at `2025-03-10 16:00`.

For exercises: set T=0 to your **STARTEX date and time** (typically `Day 1 08:00`).
For incidents: set T=0 to the **time the incident was detected**.

---

## Understanding Offsets in Templates

All templates use minutes-from-zero offsets. Key reference points:

| Offset | Meaning (if T=0 = 08:00) |
|--------|--------------------------|
| 0 min | 08:00 Day 1 |
| 60 min | 09:00 Day 1 |
| 480 min | 16:00 Day 1 |
| 600 min | 18:00 Day 1 |
| 720 min | 20:00 Day 1 |
| 1440 min | 08:00 Day 2 |
| 2880 min | 08:00 Day 3 |

For incident templates (T=0 = detection time), offsets represent hours/days after detection.

---

## Example: Loading the DDoS Template

1. Open **Tools → Templates**.
2. Import `inc01-ddos-attack-2day.json` from `example-templates/`.
3. Click **▶ Apply**.
4. Set T=0 to the **time the DDoS was detected**: e.g., `2025-03-10 02:00`.
5. Click **Load Template**.

Result: The timeline now shows 20+ pre-planned events across 48 hours, starting from your detection time. The SOC triage event appears at T+0, the ISP contact at T+30min, the management briefing at T+2h, etc.

---

## Customising a Loaded Template

After loading, you can:

| Action | How |
|--------|-----|
| Move an event | Drag left/right on timeline |
| Edit event details | Click event → edit in detail panel |
| Delete an event | Right-click → Delete, or open detail panel → Delete |
| Add new events | ➕ Add Event button |
| Change phase colours | Sidebar → Phases tab → click phase colour |
| Add/remove locks | Sidebar → Phases tab → lock controls |
| Rename groups | Admin → Groups management |

---

## Saving a Modified Template

After customising a template for your organisation, save it for reuse:

1. Click **Tools → 📋 Templates**.
2. Click **💾 Save current events as template…**
3. Enter a name and description.
4. Choose the **date range to capture** (events outside this range are excluded).
5. Click **Save Template**.

The template is saved to the server and available to all users.

---

## Exporting Templates to File

To share a template with another team or back up your templates:

1. Click **Tools → 📋 Templates**.
2. Click **⬇ Save to file…**
3. A JSON file downloads containing all your templates.

---

## Template File Format

For advanced users creating templates from scratch, see the existing files in `example-templates/` as reference. Key fields:

```json
{
  "name": "Template Display Name",
  "description": "What this template covers",
  "operation_mode": "exercise",
  "day_start_hour": 8,
  "day_end_hour": 17,
  "phases": [ ... ],
  "groups": [ ... ],
  "layers": [ ... ],
  "locks": [ ... ],
  "items": [
    {
      "title": "Event Title",
      "event_type": "activity",
      "color": "#27AE60",
      "description": "...",
      "start_offset_min": 60,
      "duration_min": 120,
      "alarm_lead_time": 15,
      "layer": "injects"
    }
  ]
}
```

For `operation_mode`, use `"exercise"` for exercises or `"incident"` for incident response.

### Per-item layer assignment

Each item can include a `"layer"` field whose value matches a layer name from the template's `"layers"` array. When loaded with multi-layer mode (default), events are automatically placed into their assigned layers:

```json
{
  "layers": [
    { "name": "injects", "color": "#C0392B", "visibility": "shared", "permission": "readwrite" },
    { "name": "sitreps", "color": "#1ABC9C", "visibility": "shared", "permission": "readwrite" }
  ],
  "items": [
    { "title": "INJECT: Port Scan", "layer": "injects", "start_offset_min": 60, ... },
    { "title": "SITREP 1", "layer": "sitreps", "start_offset_min": 120, ... },
    { "title": "Briefing", "start_offset_min": 0, ... }
  ]
}
```

Events without a `"layer"` field go to the master timeline (no layer). See `ex02-cyber-defence-sprint.json` for a complete example.

---

## Next Steps

- [03 — Exercise Planning Guide](03-exercise-planning-guide.md)
- [04 — Incident Response Guide](04-incident-response-guide.md)
- [06 — Template Reference](06-template-reference.md)
