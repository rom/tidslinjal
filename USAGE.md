# Tidslinjal — Usage Guide

This document covers practical usage of Tidslinjal features. For installation, configuration, and API reference, see the main [README.md](README.md).

## Table of Contents

- [Navigating the Timeline](#navigating-the-timeline)
- [Adding & Editing Events](#adding--editing-events)
- [Event Dependencies](#event-dependencies)
- [Multi-Select & Bulk Move](#multi-select--bulk-move)
- [Templates](#templates)
- [Layers](#layers)
- [Filter Presets](#filter-presets)
- [Reports](#reports)
- [Map View](#map-view)
- [Exercise / Synthetic Time](#exercise--synthetic-time)
- [Decision Log](#decision-log)
- [TeamLead Toolbox](#teamlead-toolbox)
- [Checklists](#checklists)
- [Polls & Ready Checks](#polls--ready-checks)
- [Security Administration](#security-administration)
- [IP Blacklist / Deny List](#ip-blacklist--deny-list)
- [Backup & Restore](#backup--restore)
- [API Keys](#api-keys)
- [WebCal Subscription](#webcal-subscription)
- [Debug Mode](#debug-mode)

---

## Navigating the Timeline

- **‹ / ›** — short click: step back/forward by current view span; long press (>400 ms): choose jump size (1 day / 2 days / 3 days / 1 week / 2 weeks)
- **Today** — jump to current date
- **⊙ Center** — center today in the view so dates before and after are visible
- **Show** dropdown — select date range (Day through 3 Months, plus 2-week and 3-week options)
- **Resolution** dropdown — select slot granularity (10 min / 15 min / 1 hr / Full day)
- **🕐 T+** button — toggle synthetic exercise time display (visible when an exercise is configured)
- **List view** button — switch between grid and table/list view

## Adding & Editing Events

1. Click any empty cell in the grid, or click **+ Add Event** in the toolbar
2. Fill in type, times, status, layer, responsible user, and optional invited persons
3. Enable **🔔 Set alarm** if you want a reminder; choose lead time and notify scope
4. Optionally add file attachments, event dependencies, or map coordinates
5. Click **Save**

To edit: click an existing event to open the Detail view, then click **Edit**. Collaborative editing awareness shows if another user is already editing the event.

## Event Dependencies

In the Edit modal, use the **Dependencies** field to link events. When you reschedule a parent event, a cascade dialog offers to shift all dependent events by the same offset (BFS traversal). The **Critical Path** report highlights the longest chain.

## Multi-Select & Bulk Move

- **Ctrl+click** events to add to selection
- A floating action bar shows the count; click **Move** to reposition all selected events by a chosen offset, or **Clear** to deselect

## Templates

1. Navigate to the date range with the events you want to template
2. Click **📋 Templates** → **💾 Save current events as template…**
3. Choose the date range, name the template, optionally add a description, choose Private or Public
4. To apply: click **▶ Apply** next to any template, choose a STARTEX base date/time, and click **Create Events**
5. To import from file: click **📂 Import from file** and select a `.json` template file

## Layers

1. Click **🗂 Layers** in the toolbar — popover shows all layers with checkboxes
2. Click any layer to instantly show/hide it on the timeline
3. Manage layers (create, edit, share with groups) in the **Layers** sidebar tab

## Filter Presets

1. Apply filters using the filter bar (event type, status, layer, responsible user, search text)
2. Click **💾 Save preset** to name and save the combination
3. Load any preset from the preset dropdown — presets are stored per user on the server

## Reports

1. Click **Reports** in the toolbar
2. Select the report type from the dropdown
3. Choose date range and any filters
4. Click **Generate** to view; use the print/export button to save

## Map View

Events of type "Physical Meeting" show a **🗺 Map** button in the Detail view. Click it to open a Leaflet map modal where you can view or set the event's latitude/longitude.

## Exercise / Synthetic Time

Available to Ops Lead+ roles:

1. Open the **Settings** sidebar tab → Exercise Settings section
2. Enter the operation name, STARTEX (epoch), optional ENDEX, operation mode, and terminology labels
3. Check **Enable synthetic time display** and optionally configure day hours and weekend exclusion
4. Click **Save** — users see the **🕐 T+** button appear; click to toggle
5. Use **⏸ Pause** to freeze progression during planning reviews

## Decision Log

A structured decision-tracking system accessible from the sidebar:

- Decisions with title, description, rationale, status, and responsible person
- Status workflow: Proposed → Approved / Rejected
- Co-signature support for four-eyes principle
- Confidentiality levels for restricted visibility
- File attachments on decisions
- Shareable links via token
- Detachable to a standalone browser window

## TeamLead Toolbox

The TeamLead Toolbox (accessible to Team Lead+ roles) provides operational coordination tools:

### Quick Response
Send an urgent message to Operations Lead, OpLead + Deputies, or custom recipients. Choose priority level (High / Critical).

### Quick Report
Send an instant situation report to Operations Lead and InfoHandler with subject, body, category (Situation / Incident / Resource / Progress / Other), and priority.

### TeamLead Decisions
Record decisions made at the Team Lead level. The "My Decisions" panel below the form shows all your previously recorded decisions with title, text, reason, sequence number, and timestamp. Sortable by newest or oldest first.

### Escalate to OpLead
Escalate a decision that requires Operations Lead authority. Choose urgency level (Normal / Urgent / Critical). The "My Escalated Decisions" panel tracks the status of your escalations (Pending / Approved / Denied) with reviewer comments.

### Team Ready Check
Send a readiness query to a group with an optional custom message.

### Team Poll
Create quick polls with a question and comma-separated options. Sent to a specific group.

### Checklists
Quick access to the checklist system — start a checklist, open the editor, or view active checklists.

The toolbox can be **detached** to a separate browser window using the ⧉ button.

## Checklists

Tidslinjal includes 26 built-in checklist templates organized into 5 categories:

- **Generic** — Meeting Preparation, Project Kickoff, Weekly Review, etc.
- **Exercise** — Battle Rhythm Prep, Shift Handover, Team Status Assessment, etc.
- **Incident** — Initial Response, Escalation, Communication, etc.
- **Operations** — various operational checklists
- **Tidslinjal** — system-specific checklists

You can also create custom templates. Each checklist instance tracks per-item check/skip states with user attribution and progress bars.

## Polls & Ready Checks

### Multipoll
Send a poll with one or more questions to users, groups, or roles. Question types: scale (0–3), yes/no, and free text. Includes standard stress-assessment questions.

### Person Ready Check
Request participants to confirm readiness with a traffic-light display (green/red/yellow). Individual, group, and role-based selection. Supports timed/scheduled checks.

## Security Administration

The **Security** admin panel (accessible to Admin users) contains:

### TLS / HTTPS
Configure certificate and key file paths. Changes require a server restart.

### SSO (OIDC)
Configure single sign-on with an OpenID Connect provider.

### Rate Limiting
Set per-IP rate limits for login, registration, and password reset endpoints (requests per minute per IP).

### Geoblocking
Restrict access by geographic location. Choose allowlist or blocklist mode and enter ISO 3166-1 country codes.

### IP Blacklist / Deny List
Block specific IP addresses or CIDR ranges from connecting to the server:

1. **Enable** the blacklist using the toggle
2. **Add entries** — enter an IP address (e.g., `192.168.1.1`) or CIDR range (e.g., `10.0.0.0/8`) with an optional reason
3. **Remove entries** — click the × button next to any entry
4. **Save** — persist the enabled/disabled state
5. **Export JSON** — download the blacklist as a `ip_blacklist.json` file for sharing between instances
6. **Import JSON** — upload a JSON file to merge entries into the current blacklist (duplicates are skipped)

Blocked IPs receive a `403 Forbidden` response. All blocked connections are logged to the audit log.

The import endpoint supports two modes via the `mode` query parameter:
- `merge` (default) — adds new entries without removing existing ones
- `replace` — replaces the entire blacklist with the imported data

The IP blacklist is stored in `ip_blacklist.json` and is included in backups and snapshots.

### Password Policy
Configure minimum password length and character requirements (uppercase, lowercase, numbers, symbols).

### Session Management
Set maximum session duration, idle timeout, auto-logoff on password change, and session rotation on role change.

### Backup Encryption
Enable/disable AES-256-GCM encryption for backup files.

## Backup & Restore

- **Backup**: Admin → ⬇ Download backup — downloads a ZIP of all JSON data files
- **Restore**: Admin → ⬆ Restore from backup — upload a ZIP to overwrite all data (confirmation required)
- **Gradual Backup**: Configure automatic periodic snapshots with configurable interval and retention

Snapshots include all configuration files (security settings, rate limits, geoblocking, IP blacklist, encryption settings) alongside data files.

## API Keys

1. Open the **Integrations** sidebar tab
2. Click **Generate new API key**
3. Copy the token and use it as `Authorization: Bearer <token>` in HTTP requests

## WebCal Subscription

1. Open your **Profile** modal (click your name in the header)
2. Click **Generate WebCal token**
3. Copy the subscription URL and add it to your external calendar client

## Debug Mode

Start the server with `--debug` to enable verbose diagnostic logging. Debug output includes:

- **Limit enforcement** — all rate limit hits and quota exceeded events log with `[DEBUG] limits:` prefix, showing the specific limit type, IP address, and user involved
- **IP blacklist blocks** — blocked connections log with `[DEBUG] IP <addr> has been blocked — blacklisted IP <entry>` including CIDR match details
- **SMTP operations** — mail sending debug information
- **Event lifecycle** — creation, update, deletion of events and related objects
- **Authentication flow** — OIDC token exchange and validation details

Debug messages are also forwarded to a remote syslog server (if configured) at severity level 7.

```bash
# Enable debug mode
./tidslinjal --debug

# Debug mode implies verbose logging
./tidslinjal --debug --port 8080
```
