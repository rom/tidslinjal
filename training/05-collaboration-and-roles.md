# 05 — Collaboration, Roles, and Access Control

Tidslinjal is designed for teams. This guide explains how to configure multi-user access, roles, groups, and layers.

---

## User Roles

Every user has a **role** that determines what they can do.

| Role | Can do |
|------|--------|
| **Admin** | Everything — user management, system configuration, all events |
| **Operations Lead (oplead)** | Manage templates, groups, layers; approve users; full event access |
| **Team Lead (teamlead)** | View audit log, manage layers and groups, approve comments/changes |
| **Team Member** | Create and edit events on permitted layers |
| **Reporter** | Read events; propose status changes (requires Team Lead approval) |
| **Read-Only** | View events only |

### Custom Roles
Admins can create custom roles with fine-grained capability permissions using the **Role Editor** (Admin → Users → Role Editor). Capabilities include:
- `view_events` — see the timeline
- `create_events` — add new events
- `edit_own` / `edit_all` — edit events
- `delete_events` — delete events
- `manage_layers` — create and configure layers
- `manage_groups` — manage groups
- `report` — generate reports
- `auto_report` — schedule automatic reports
- `view_audit` — access the audit log

---

## Groups

**Groups** represent teams, units, or organisations. Examples:
- SOC Team, IT Operations, Management (for incident response)
- Alpha Company, Bravo Company, HQ Element (for military exercises)
- Police, Fire, Medical, EOC (for civil crisis management)

### Creating Groups (Admin)
1. Sidebar → **Groups** tab
2. Click **+ Add Group**
3. Enter group name and description
4. Assign users to the group

---

## Layers

**Layers** are the horizontal tracks on the timeline. Each layer controls:
- **Who can see** events on it (visibility)
- **Who can add/edit** events on it (permission)
- **Which groups** it belongs to

### Layer Permission Levels

| Permission | Effect |
|-----------|--------|
| `read` | All users can see events, but only layer members can edit |
| `readwrite` | Layer members can add and edit events |

### Layer Visibility Levels

| Visibility | Who sees it |
|-----------|-------------|
| `public` | All users |
| `groups` | Only users in the assigned group(s) |
| `private` | Only the layer owner and admins |

### Example Layer Setup for Incident Response

| Layer | Groups | Permission | Visibility |
|-------|--------|-----------|------------|
| SOC Timeline | SOC Team | readwrite | groups |
| Forensics | Forensics Team | readwrite | groups |
| Management View | Management, Legal | read | groups |
| Shared Awareness | All groups | read | public |

With this setup:
- SOC can see and edit only their layer + Shared Awareness
- Management can see all layers but cannot edit any
- Everyone sees the Shared Awareness layer

---

## Inviting Users

### Manual user creation (Admin)
1. Sidebar → **Users** tab → **Add User**
2. Enter username, display name, email
3. Set role and group membership
4. User receives credentials (or sets their own password on first login)

### Self-registration
If enabled in settings, users can register themselves. Their accounts are in "pending approval" state until an admin or team lead approves them.

### SSO / OIDC
If your organisation uses Single Sign-On (Azure AD, Google Workspace, Keycloak, etc.), Tidslinjal supports OIDC-based authentication. Contact your Tidslinjal administrator to configure OIDC.

---

## Collaboration Features

### Real-time Updates
All changes to the timeline are visible to all logged-in users in real time (Server-Sent Events stream). No manual refresh needed.

### Comments and @mentions
- Every event has a **comment thread**
- Type `@username` in a comment to notify a specific user — the dropdown will show matching usernames as you type
- Mentioned users see the comment highlighted in their interface

### Event History
Click an event → **🕐 History** to see a full changelog of who changed what and when.

### Audit Log
Sidebar → **Audit** (team leads and admins): complete tamper-evident log of all timeline changes, user logins, and administrative actions.

---

## Webhooks (Integrations)

Users can configure personal webhooks to receive notifications when:
- A new event is created
- An alarm fires
- A comment is added that mentions them

Common integrations:
- **Slack / Mattermost**: Post timeline events to a channel
- **PagerDuty / Opsgenie**: Trigger incident escalations
- **Microsoft Teams**: Send notifications to a channel

Configure via Sidebar → **Settings → Integrations** (user) or the admin Integrations panel.

---

## API Access

Tidslinjal has a REST API for integration with external tools. Generate an API key:
1. Sidebar → **Settings → API Keys**
2. Click **Generate New Key**
3. Copy the key (it is shown only once)

Use the key in the `Authorization: Bearer <key>` HTTP header.

See the built-in **API Documentation** (Help → API) for endpoint reference.

---

## Tips for Large Exercises

For exercises with many participants across multiple groups:

1. **Create one layer per group** — gives each team their own timeline track
2. **Create one shared awareness layer** — visible to all, used for cross-team events
3. **Use the Layers tab** to toggle individual layers on/off for display clarity
4. **Assign Team Leads** per group — they manage their own group's events
5. **Use phases** to colour-code the timeline — everyone sees the same exercise arc

For distributed exercises:
- Test connectivity and access 24h before exercise start
- Confirm all participants can log in and see their layer
- Ensure admin is available for troubleshooting during the exercise
