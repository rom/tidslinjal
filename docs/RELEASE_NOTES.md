# Release Notes — Tidslinjal v8.2.0

**Release Date:** 2026-04-05

---

## New Features

### Diary Module
- Personal diary with rich text editor (bold, italic, underline, strikethrough, lists, inline links, inline images)
- Per-user diary entries with public/private visibility
- Tags, mood indicator, and file attachments
- Export: JSON, XML, CSV, XLSX, ODS, TXT, RTF, Markdown
- Import: JSON, XML
- Filter by author, tag, visibility, and full-text search
- Print single entry or full diary
- Added to Reports module: "Diary Entry" and "Full Diary" report types
- i18n: 40 diary keys translated in all 17 languages

### User Labels
- Colored labels that can be attached to user profiles
- Labels are visible to everyone in the user list
- Setting and removing labels are audit-logged events
- Requires TeamLead+ role to add/remove labels

### Capabilities (Resources)
- Fixed "Capabilities" button in Resources — was not working
- Added capability-specific form fields: Zone, Ownership, Status
- Capabilities are now reactive objects: changes propagate to Key Terrain Board entries linked via capability_id
- "Load from Capability" dropdown in Key Terrain entry form

### Key Terrain Board Enhancements
- **New columns:** `#` (sequence number, auto-assigned), `Zone` (sortable string)
- **New settings:** "Show Functions Without Priority" (hide priority-0 entries), customizable status labels, column visibility toggles, column order reorder
- **"Management" column** is now a proper column that can be shown/hidden and reordered
- **"Manage & Export" button** — consolidated History, Versions, Print, and Export into one panel (decluttered toolbar)
- Column order moved into Settings panel
- Detached window now inherits the parent's theme/colors
- Renamed "Function" to "Capability" in all 17 languages

### Export/Import Format Additions
- **Markdown (MD):** Reports, Diary, Stats, Key Terrain
- **XLSX/ODS:** Boards, Stats, Key Terrain, Reports, Diary
- **JPEG/TIFF/BMP:** Boards, Key Terrain
- **XML export:** Boards
- **XML import:** Diary, Boards

### Online Help
- Added Release Notes, README, and User Manual sections to the help modal
- Fixed text height/readability in help sections (increased line-height and padding)

---

## Backend Improvements

### Missing Feature Implementations
- **LDAP Authentication:** Full go-ldap/ldap/v3 implementation replacing the stub (service account bind → user search → user bind → group mapping)
- **XLSX Stats Export:** Proper XLSX generation with Events and Decisions sheets (was silently falling back to JSON)
- **Git References Endpoints:** POST /api/references/git/save and /load for version-controlled reference export
- **Meeting Config Persistence:** Now properly saved to meeting.json (was stub returning hardcoded data)
- **Dashboard Config Persistence:** Widget configuration stored server-side per user (was localStorage only)
- **Sidebar Security Endpoints:** /api/tls/status, /api/oidc/config, /api/security/policy
- **Board CSV Import:** POST /api/boards/import/csv with flexible column mapping
- **Decision Co-Sign Target:** co_sign_target_id and co_sign_target_name fields now persisted

### Offline Mode Improvements
- Deduplication of queued offline actions (PUT/DELETE on same path keeps latest)
- Exponential backoff retry (up to 3 attempts: 1s, 2s, 4s)
- Smart error handling: 4xx client errors discarded, 409 conflicts treated as applied

---

## Security Fixes

- **CRITICAL:** Diary export authorization bypass via user_id parameter — now restricted to own diary or admin
- **CRITICAL:** User label authorization escalation — now requires TeamLead+ role
- **CRITICAL:** Stored XSS in diary body — added `sanitizeRichHTML()` that strips dangerous tags while preserving formatting
- **HIGH:** XXE injection in diary XML import — replaced with strict XML decoder
- **HIGH:** Path traversal in diary attachment download — added filepath validation
- **HIGH:** LDAP filter validation — validates %s placeholder and parentheses syntax
- **MEDIUM:** Diary import body size reduced from 10MB to 2MB

---

## i18n

- Board filter: 21 keys × 17 languages
- Board search: 10 keys × 17 languages
- Diary: 40 keys × 17 languages
- Key Terrain (zone, seq_num, capability, manage, settings): 20+ keys × 17 languages
- Capability form: 7 keys × 17 languages

---

## Bug Fixes

- Fixed CSP violations in diary module (replaced all inline event handlers with addEventListener)
- Fixed CSP violations in key-terrain.js (row hover, rich text toolbar, print button)
- Fixed diary editor losing focus and leaking keystrokes to timeline shortcuts
- Fixed timeline.js global shortcut handler to check for contenteditable elements
- Fixed column move in Key Terrain Settings (function signature mismatch with _bindActions spread args)
- Fixed Key Terrain _ktMoveEntry and _ktMoveCol argument handling
- Fixed capability dropdown URL (was using broken relative path)
- Removed unused escapeLDAPFilter function (replaced by ldaplib.EscapeFilter)
