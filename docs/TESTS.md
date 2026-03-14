# Tidslinjal — Test Documentation

## Overview

The test suite is written in Go's standard `testing` package and covers the storage layer (`store_test.go`), the HTTP API layer (`api_test.go`), extended API features (`api_extended_test.go`), ICS/iCalendar export (`ics_test.go`), and JavaScript utility functions (`tests/js/test_utils.js`). There are **157 Go tests** and **123 JavaScript unit tests** in total.

Run the full suite:

```bash
go test ./...
```

Run with verbose output:

```bash
go test -v ./...
```

Run in **short mode** (skips the slow audit-cap test):

```bash
go test -short ./...
```

Run a specific test:

```bash
go test -run TestAPI_Login_Success ./...
```

## Test files

| File | Description |
|---|---|
| `store_test.go` | Unit tests for the `Store` data layer — CRUD, concurrency, role logic |
| `api_test.go` | Integration tests for all HTTP API endpoints including integrations |
| `api_extended_test.go` | Integration tests for extended features — rooms, decision log, log book, ready checks, templates, map locations, and data validation |
| `ics_test.go` | Unit tests for ICS/iCalendar export formatting |
| `tests/js/test_utils.js` | Node.js unit tests for pure JS utility functions (no DOM required) |

Run JS unit tests:

```bash
node tests/js/test_utils.js
```

---

## Store Tests (`store_test.go`)

### Store Initialization

| Test | Description |
|---|---|
| `TestNewStore_EmptyDir` | A new store created in an empty directory initialises cleanly with default event types |
| `TestNewStore_BadDir` | Creating a store in a non-existent (unwritable) directory returns an error |
| `TestSeedEventTypes` | The default seed event types are populated on first run and are marked as system types |

### Event Types

| Test | Description |
|---|---|
| `TestDeleteSystemEventType_Rejected` | Attempting to delete a built-in system event type returns an error |

### Users

| Test | Description |
|---|---|
| `TestUserCRUD` | Create, read, update, delete a user; verify ID auto-increment and retrieval by username/ID |
| `TestUserGetByUsername_NotFound` | `GetUserByUsername` returns `false` for an unknown username |
| `TestUser_AutoIncrementIDs` | IDs are unique and monotonically increasing across multiple created users |
| `TestUser_Public` | `User.Public()` returns a `UserPublic` that omits sensitive fields (`PasswordHash`, `PasswordResetToken`) |

### Preferences

| Test | Description |
|---|---|
| `TestPreferences_DefaultsForUnknownUser` | `GetPreferences` returns sensible defaults for a user with no saved preferences |
| `TestPreferences_SaveAndRetrieve` | Saved preferences are persisted and can be retrieved |
| `TestPreferences_Update` | Updating preferences overwrites the previous value |

### Groups & Memberships

| Test | Description |
|---|---|
| `TestGroupCRUD` | Create, read, update, delete groups |
| `TestGroupMembership` | Add and remove group members; `GetGroupMembers` returns the correct set |
| `TestGroupMembership_NoDuplicates` | Adding the same member twice does not create duplicate entries |

### Layers

| Test | Description |
|---|---|
| `TestLayerCRUD` | Create, read, update, delete layers |
| `TestLayerVisibility` | Visibility rules: private layers are only visible to the owner; group layers only to group members; public layers to all |

### Events

| Test | Description |
|---|---|
| `TestEventCRUD` | Create, read, update, delete events; verify field persistence |
| `TestEventGetEvents_MultipleEvents` | `GetEvents` returns all events within the given time range |
| `TestEventStatus_Constants` | Status constants are correct string values |

### Audit Log

| Test | Description |
|---|---|
| `TestAuditLog_LogAndRetrieve` | Logged entries can be retrieved in reverse-chronological order |
| `TestAuditLog_LimitParam` | `GetAudit(limit)` returns at most `limit` entries |
| `TestAuditLog_Cap` | *(slow — skipped in short mode)* The audit log is capped at 10 000 entries; writing 10 005 entries results in ≤ 10 000 |

### Exercise Settings

| Test | Description |
|---|---|
| `TestExerciseSettings` | Save and retrieve exercise settings (name, STARTEX epoch, ENDEX, enabled flag) |

### Alarms

| Test | Description |
|---|---|
| `TestAlarmCRUD` | Create, read, delete alarms |
| `TestAlarm_GetActive` | `GetActiveAlarms` returns only unfired alarms before their trigger time |

### Phases

| Test | Description |
|---|---|
| `TestPhaseCRUD` | Create, read, update, delete exercise phases |

### Templates

| Test | Description |
|---|---|
| `TestTemplateCRUD` | Save and retrieve event templates; delete removes the template |

### Sessions

| Test | Description |
|---|---|
| `TestSessionCRUD` | Create, retrieve, delete sessions |
| `TestSession_Expired` | An expired session is not returned by `GetSession` |
| `TestSession_CleanExpired` | `CleanExpiredSessions` removes all sessions past their expiry |

### Locks

| Test | Description |
|---|---|
| `TestLockCRUD` | Create, retrieve, delete time-slot locks |
| `TestLockAuthorized_NonOwnerRejected` | A non-admin user who did not create a lock cannot delete it |

### Comments

| Test | Description |
|---|---|
| `TestCommentCRUD` | Create, retrieve, delete comments on events |

### Role Logic

| Test | Description |
|---|---|
| `TestHasRole` | `hasRole(role, required)` returns `true` when `role` meets or exceeds `required` for all role pairs, including the new `observer` and `staffofficer` roles |

### Concurrency

| Test | Description |
|---|---|
| `TestStore_ConcurrentReads` | Many goroutines reading simultaneously do not cause data races |
| `TestStore_ConcurrentWrites` | Many goroutines writing simultaneously do not cause data races or corruption |

---

## API Tests (`api_test.go`)

### Test Helpers

The `api_test.go` file uses a shared `newTestApp` helper that creates an in-memory store, seeds the admin user, and starts a `httptest.Server`. Individual tests call `loginAs(t, srv, username, password)` to obtain a session cookie, then make HTTP requests against the test server.

### Authentication

| Test | Description |
|---|---|
| `TestAPI_Login_Success` | `POST /api/auth/login` with valid credentials returns 200 and sets a session cookie |
| `TestAPI_Login_InvalidCredentials` | Wrong password returns 401 |
| `TestAPI_Login_UnknownUser` | Unknown username returns 401 |
| `TestAPI_Login_SessionCookieSet` | Successful login sets a `session` cookie |
| `TestAPI_Logout` | `POST /api/auth/logout` clears the session |
| `TestAPI_Me` | `GET /api/me` returns the authenticated user's info |
| `TestAPI_Me_Unauthenticated` | `GET /api/me` without a session returns 401 |

### System

| Test | Description |
|---|---|
| `TestAPI_Version` | `GET /api/version` returns a JSON body with `version` and `github` fields |

### Users

| Test | Description |
|---|---|
| `TestAPI_GetUsers` | `GET /api/users` returns the full user list (admin only) |
| `TestAPI_GetUsers_Unauthenticated` | Returns 401 without auth |
| `TestAPI_CreateUser` | `POST /api/users` creates a new user (admin only) |
| `TestAPI_CreateUser_NonAdmin_Forbidden` | Non-admin user receives 403 |
| `TestAPI_UpdateUser` | `PUT /api/users/:id` updates display name / role |
| `TestAPI_DeleteUser` | `DELETE /api/users/:id` removes a user |

### Event Types

| Test | Description |
|---|---|
| `TestAPI_GetEventTypes` | `GET /api/event-types` returns the default system types |
| `TestAPI_CreateEventType_RequiresReadWrite` | A `read`-role user cannot create new event types |

### Events

| Test | Description |
|---|---|
| `TestAPI_CreateEvent` | `POST /api/events` creates an event and returns it (fields at top level, compatible with old clients) |
| `TestAPI_CreateEvent_Unauthenticated` | Returns 401 without auth |
| `TestAPI_GetEvents` | `GET /api/events` returns events in range |
| `TestAPI_UpdateEvent` | `PUT /api/events/:id` updates event fields |
| `TestAPI_DeleteEvent` | `DELETE /api/events/:id` removes an event |
| `TestAPI_PatchEventStatus` | `PATCH /api/events/:id/status` advances the event status |

### Layers

| Test | Description |
|---|---|
| `TestAPI_CreateAndGetLayers` | Create a layer and retrieve it via `GET /api/layers` |

### Preferences

| Test | Description |
|---|---|
| `TestAPI_GetAndSavePreferences` | `GET`/`PUT /api/preferences` round-trips user preferences |

### Groups

| Test | Description |
|---|---|
| `TestAPI_CreateAndGetGroups` | Create a group and retrieve it; add a member |

### Comments

| Test | Description |
|---|---|
| `TestAPI_CreateAndGetComments` | Post a comment on an event; retrieve it via `GET /api/events/:id/comments` |

### Alarms

| Test | Description |
|---|---|
| `TestAPI_CreateAndGetAlarms` | Set an alarm for an event; retrieve it from `GET /api/alarms` |

### Phases

| Test | Description |
|---|---|
| `TestAPI_CreateAndGetPhases` | Create an exercise phase; retrieve it |

### Exercise Settings

| Test | Description |
|---|---|
| `TestAPI_GetExercise` | `GET /api/exercise` returns current exercise settings |
| `TestAPI_SaveExercise_RequiresOpLead` | Saving exercise settings requires `oplead` role or higher |

### Export

| Test | Description |
|---|---|
| `TestAPI_Export` | `GET /api/export` returns a valid JSON export blob |

### Audit

| Test | Description |
|---|---|
| `TestAPI_GetAudit` | `GET /api/audit` returns audit entries for admin/teamlead+ users |
| `TestAPI_GetAudit_ReadOnlyForbidden` | `read`-role user receives 403 |

### Password Management

| Test | Description |
|---|---|
| `TestAPI_ChangePassword` | `POST /api/auth/change-password` changes the password; old password no longer works |

### HTTP Infrastructure

| Test | Description |
|---|---|
| `TestAPI_MethodNotAllowed` | Unknown HTTP methods return 405 |
| `TestAPI_ResponseContentType` | All JSON responses include `Content-Type: application/json` |
| `TestAPI_StaticFiles` | Static assets are served from the embedded filesystem |

### Locks

| Test | Description |
|---|---|
| `TestAPI_Locks_ReadRequiresAuth` | `GET /api/locks` requires authentication |
| `TestAPI_CreateLock_RequiresCanLock` | Creating a lock requires the `can_lock` flag or admin role |

### Integration Status

| Test | Description |
|---|---|
| `TestAPI_Status_AdminOnly` | `GET /api/status` returns all integration keys (sso, tls, syslog, smtp, mattermost, api_keys) for admin |
| `TestAPI_Status_RequiresAdmin` | Non-admin users receive 403 |
| `TestAPI_Status_Unauthenticated` | Unauthenticated request returns 401 |
| `TestAPI_IntegrationStatus_ReflectsMailConfig` | Status smtp.enabled reflects live mail config changes |
| `TestAPI_IntegrationStatus_ReflectsAPIKeyCount` | Status api_keys.count increments when a key is created |

### OIDC / SSO Settings

| Test | Description |
|---|---|
| `TestAPI_OIDCSettings_GetDefault` | `GET /api/admin/oidc` returns default settings with `enabled` field |
| `TestAPI_OIDCSettings_RequiresAdmin` | Non-admin users receive 403 |
| `TestAPI_OIDCSettings_SaveAndRetrieve` | PUT persists issuer and client_id; client_secret is redacted on retrieval |

### Mail / SMTP

| Test | Description |
|---|---|
| `TestAPI_MailConfig_GetDefault` | `GET /api/integrations/mail` returns config with `enabled` field |
| `TestAPI_MailConfig_SaveAndRetrieve` | PUT persists host, port, tls_mode; password is redacted |
| `TestAPI_MailConfig_RequiresAdmin` | Non-admin users receive 403 |

### Syslog

| Test | Description |
|---|---|
| `TestAPI_SyslogConfig_GetDefault` | `GET /api/integrations/syslog` returns config with `enabled` field |
| `TestAPI_SyslogConfig_SaveAndRetrieve` | PUT persists host and transport |
| `TestAPI_SyslogConfig_RequiresAdmin` | Non-admin users receive 403 |

### TLS Config

| Test | Description |
|---|---|
| `TestAPI_TLSConfig_GetDefault` | `GET /api/integrations/tls` returns config; cert_file is empty on fresh store |
| `TestAPI_TLSConfig_SaveAndRetrieve` | PUT with accessible cert/key paths persists the paths |
| `TestAPI_TLSConfig_RequiresAdmin` | Non-admin users receive 403 |

### API Keys

| Test | Description |
|---|---|
| `TestAPI_APIKeys_ListEmpty` | Fresh app returns an empty API key list |
| `TestAPI_APIKeys_CreateAndList` | POST creates a key; plain key appears only on creation, not in list |
| `TestAPI_APIKeys_Delete` | DELETE removes the key; subsequent list is empty |
| `TestAPI_APIKeys_RequiresAdmin` | Non-admin users receive 403 |

---

## Extended API Tests (`api_extended_test.go`)

The `api_extended_test.go` file uses the same `newTestApp` and `login` helpers as `api_test.go`. It covers features added after the initial API surface: resource management, decision log, log book, ready checks, person ready checks, notifications, templates, filter presets, custom resource types, roles, event duplication, map locations, and data validation edge cases.

### Rooms

| Test | Description |
|---|---|
| `TestAPI_Rooms_ListEmpty` | `GET /api/rooms` returns an empty list on a fresh store |
| `TestAPI_Rooms_CreateAndList` | `PUT /api/rooms` creates a room; `GET /api/rooms` returns it |
| `TestAPI_Rooms_Delete` | `DELETE /api/rooms/:id` removes a room; list is empty afterward |
| `TestAPI_Rooms_RequiresTeamLead` | A `read`-role user receives 403 when creating a room |

### Decision Log

| Test | Description |
|---|---|
| `TestAPI_DecisionLog_ListEmpty` | `GET /api/decision-log` returns an empty list on a fresh store |
| `TestAPI_DecisionLog_CreateAndList` | `POST /api/decision-log` creates a decision entry; list returns it |
| `TestAPI_DecisionLog_Delete` | `DELETE /api/decision-log/:id` removes an entry (admin only) |
| `TestAPI_DecisionLog_ReviewWorkflow` | `PUT /api/decision-log/:id/review` approves a decision with a comment |
| `TestAPI_DecisionLog_CoSign` | `PUT /api/decision-log/:id/cosign` co-signs a decision by a different user |

### Log Book

| Test | Description |
|---|---|
| `TestAPI_LogBook_ListEmpty` | `GET /api/log-book` returns an empty list on a fresh store |
| `TestAPI_LogBook_CreateAndList` | `POST /api/log-book` creates a log entry with category and subject; list returns it |
| `TestAPI_LogBook_Delete` | `DELETE /api/log-book/:id` removes a log entry (Team Lead+ required) |

### Ready Check

| Test | Description |
|---|---|
| `TestAPI_ReadyCheck` | `GET /api/ready-check` returns a response with `ready` and `total` fields |
| `TestAPI_ReadyCheck_Unauthenticated` | Returns 401 without authentication |
| `TestAPI_ReadyCheck_AuditLogged` | A ready check generates an audit entry with action `ready_check` |

### Person Ready Check (PRC)

| Test | Description |
|---|---|
| `TestAPI_PersonReadyCheck_ListEmpty` | `GET /api/person-ready-check` returns an empty list on a fresh store |
| `TestAPI_PersonReadyCheck_CreateAndRespond` | Create a PRC targeting a user; the participant responds with `ready` status |
| `TestAPI_PersonReadyCheck_AuditIncludesParticipants` | PRC creation audit entry includes participant names in summary |
| `TestAPI_PersonReadyCheck_RespondAudit` | PRC response generates an audit entry with action `respond_prc` |
| `TestAPI_PersonReadyCheck_RequiresTeamLead` | A `read`-role user receives 403 when creating a PRC |
| `TestAPI_PersonReadyCheck_InvalidResponse` | Responding with an invalid status string returns 400 |

### Personal Notifications

| Test | Description |
|---|---|
| `TestAPI_Notifications_ListEmpty` | `GET /api/personal-notifications` returns an empty list on a fresh store |
| `TestAPI_Notifications_ReceivedOnPRC` | A PRC targeting a user generates a notification for that user |

### Templates

| Test | Description |
|---|---|
| `TestAPI_Templates_ListEmpty` | `GET /api/templates` returns an empty list on a fresh store |
| `TestAPI_Templates_CreateAndList` | `POST /api/templates` creates a template; list returns it |
| `TestAPI_Templates_Delete` | `DELETE /api/templates/:id` removes a template |

### Filter Presets

| Test | Description |
|---|---|
| `TestAPI_FilterPresets_ListEmpty` | `GET /api/filter-presets` returns an empty list on a fresh store |
| `TestAPI_FilterPresets_CreateAndList` | `POST /api/filter-presets` creates a preset; list returns it |

### Custom Resource Types

| Test | Description |
|---|---|
| `TestAPI_CustomResourceTypes_ListEmpty` | `GET /api/custom-resource-types` returns an empty list on a fresh store |
| `TestAPI_CustomResourceTypes_CreateAndDelete` | `PUT /api/custom-resource-types` creates a type; verify via list |
| `TestAPI_CustomResourceTypes_RequiresAdmin` | Non-admin user receives 403 when creating a custom resource type |

### Roles

| Test | Description |
|---|---|
| `TestAPI_Roles_GetList` | `GET /api/roles` returns the role configuration (admin) |
| `TestAPI_Roles_UpdateRequiresAdmin` | Non-admin user receives 403 when updating role configs |

### Event Types (Extended)

| Test | Description |
|---|---|
| `TestAPI_EventTypes_UpdateAndDelete` | Create, update (label/color), and delete a custom event type |

### Layers (Extended)

| Test | Description |
|---|---|
| `TestAPI_Layers_UpdateAndDelete` | Create and delete a layer; verify deletion |

### Event Log

| Test | Description |
|---|---|
| `TestAPI_EventLog_CreateAndGet` | `POST /api/event-log` creates an entry; `GET /api/event-log` returns it |

### Map Locations

| Test | Description |
|---|---|
| `TestAPI_MapLocations_ListEmpty` | `GET /api/map-locations` returns an empty list on a fresh store |
| `TestAPI_MapLocations_CreateAndList` | `POST /api/map-locations` creates a location with coordinates; list returns it |

### Event Duplication

| Test | Description |
|---|---|
| `TestAPI_EventDuplicate` | `POST /api/events-duplicate/:id` duplicates an event; event count increases |

### Data Validation Edge Cases

| Test | Description |
|---|---|
| `TestAPI_CreateEvent_MissingTitle` | Creating an event without a title does not cause a 500 error |
| `TestAPI_CreateEvent_SpecialCharacters` | Event with XSS payload and Unicode in title is stored correctly |
| `TestAPI_PRC_EmptyParticipants` | Creating a PRC with an empty participant list returns 400 |
| `TestAPI_PRC_NonParticipantCannotRespond` | A user not in the participant list receives 403 when responding |

---

## JavaScript Unit Tests (`tests/js/test_utils.js`)

Pure utility function tests that run under Node.js with no DOM or browser required.

| Section | Tests | Functions covered |
|---|---|---|
| `escHtml` | 8 | HTML entity escaping, falsy inputs, special chars |
| `fmtDuration` | 9 | Duration string formatting, zero/negative/multi-hour |
| `fmtFileSize` | 8 | Bytes/KB/MB formatting, boundary values |
| `hasRole2` | 12 | Role hierarchy comparison, unknown roles, edge cases |
| `recurStepMs` | 11 | Recurrence pattern to milliseconds, null/unknown patterns |
| Date utilities | 16 | `startOfDay`, `addDays`, `addMonths`, `addHours`, `isSameDay` |
| `fmtDateInput` | 6 | datetime-local input formatting |
| `daysInMonth` | 9 | Month length including leap years |
| `toICSDate` | 4 | ICS date formatting (UTC) |
| `escICS` | 9 | ICS special character escaping |

Run: `node tests/js/test_utils.js`

---

## Notes

- Tests use `t.TempDir()` for isolated on-disk stores — no shared state between tests.
- The test server uses `bcrypt.MinCost` for password hashing to keep tests fast.
- `TestAuditLog_Cap` requires 10 001 disk writes and is excluded from `-short` runs.
- All API tests go through the real HTTP handler stack including authentication middleware.
- The TLS config test creates temporary placeholder cert/key files since the handler validates file accessibility.
- A known Go testing cleanup warning (`TempDir RemoveAll: directory not empty`) can appear due to goroutine workers not stopping before cleanup — this is cosmetic and does not indicate test logic failures.
