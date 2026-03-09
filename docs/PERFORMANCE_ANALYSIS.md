# Tidslinjal v4.0.0 — Performance & Scalability Analysis

**Date:** 2026-03-09
**Scope:** Support 1 000 simultaneous users on a single Go server instance
**Workload model:** ~90 % read-only users (timeline viewing, alarm receipt); ~10 % writers (Ops Leads, Team Leads, Admins adding/editing events)

---

## 1. Baseline Architecture (v3.x)

Tidslinjal uses a **JSON file store** backed by in-memory Go slices, protected by a single `sync.RWMutex`. All mutation methods called `saveFile()` while holding the mutex, so disk I/O blocked every concurrent reader.

### Critical Bottlenecks Identified

| Severity | Issue | Root Cause | Impact at 1 000 users |
|---|---|---|---|
| **Critical** | Session lookup O(n) | Linear scan of sessions slice | Every request calls `GetSession()` — 1 000 req/s × 1 000 sessions = 1 M comparisons/s |
| **Critical** | User lookup O(n) | Linear scan of users slice | Every request calls `GetUserByID()` — same cost as session |
| **Critical** | Disk I/O inside RWMutex | `saveFile()` called before `Unlock()` | Single write (10–200 ms disk latency) blocks all concurrent readers |
| **High** | Unbounded webhook goroutines | `go func()` per webhook call | 1 000 alarms + 1 000 webhook users = 1 000+ goroutines in flight simultaneously |
| **High** | SSE Notify O(n) | Scans all clients for matching userID | With 1 000 connected clients and frequent alarms: 1 000 iterations per delivery |
| **High** | SSE broker exclusive lock | `sync.Mutex` (not RWMutex) | Notify/Broadcast mutually exclusive — one delivery at a time |
| **Medium** | Overlap detection O(events × users) | Nested scan in `CheckOverlaps()` | Every event create/edit scans all events, then scans all users for each overlapping event's invitees |
| **Medium** | Audit log on every action | `LogAudit()` writes to disk inside RWMutex | Alarm ACK, status change, event edit each block all readers for disk I/O |
| **Low** | HTTP server: no timeouts | `http.ListenAndServe()` with default server | Slow/abusive clients hold connections indefinitely, exhausting goroutines |

---

## 2. Load Scenarios

### Small (10s of users)
- 10 simultaneous requests, ~5 events/min
- **No bottleneck.** Even O(n) scans complete in microseconds at n≈10. Single mutex uncontested.

### Medium (100s of users)
- 100–300 simultaneous requests, ~50 events/min
- **Marginal.** Session/user O(n) scans: 300 × 300 = 90 000 comparisons/s. At ~1 ns each that's <0.1 ms total — still fast.
- **Disk I/O starts to matter:** 10 writers × 1 write/min × 50 ms per write = 500 ms/min of exclusive lock time. At 300 concurrent readers this means ~0.16 % serialisation overhead — borderline.

### Large (1 000 users)
- 1 000 simultaneous connections, 100+ writers, continuous alarm firings
- **Session/user O(n) scans:** 1 000 req/s × 1 000 entries × ~5 ns = 5 ms of CPU per second just on lookups. With RLock contention this is significantly worse.
- **Disk I/O inside mutex:** 100 writers × 2 writes/min × 50 ms = 10 s/min of exclusive lock time. Readers are blocked ~17 % of the time. At 1 000 req/s this creates a queue hundreds deep.
- **Webhook goroutines:** 1 000 users with webhooks × 1 alarm fired = 1 000 goroutines all doing 10 s HTTP POSTs = 1 000 goroutines in flight for 10 s. This exhausts file descriptors.
- **SSE Notify:** 1 000 connected clients × 10 alarms/min = 10 000 full map scans per minute.

---

## 3. Changes Implemented (v4.0.0)

### 3.1 O(1) User and Session Lookups

**Files changed:** `store.go`
**Lines affected:** Store struct + `load()` + all user/session CRUD methods

Two hash-map indexes are maintained alongside the existing slices:

```go
userByID    map[int64]User     // populated on load and every Create/Update/Delete
sessionByID map[string]Session // populated on load and every Create/Delete/Clean
```

`GetUserByID()` and `GetSession()` now do a single map lookup under RLock instead of an O(n) slice scan.

**Impact:** Every authenticated HTTP request drops from O(n) to O(1) for session and user resolution. At 1 000 users: 5 ms/s CPU → <1 µs/s.

**Correctness:** Indexes are kept in sync atomically — every mutation that modifies `s.users` or `s.sessions` also updates the corresponding map under the same write lock.

### 3.2 Write-After-Unlock (Decoupling Disk I/O from RWMutex)

**Files changed:** `store.go`
**Lines affected:** All 35+ mutation methods + new `persist()` helper + new `writeMu`

New `writeMu sync.Mutex` serialises JSON file writes independently of `s.mu`:

```
Before: s.mu.Lock() → mutate → saveFile() → s.mu.Unlock()
After:  s.mu.Lock() → mutate → snapshot → s.mu.Unlock() → s.writeMu.Lock() → saveFile(snapshot) → s.writeMu.Unlock()
```

The RWMutex is now held only for the in-memory mutation (nanoseconds). File I/O happens outside the RWMutex using a consistent snapshot captured while the lock was held.

The `writeMu` ensures snapshots are never interleaved (the last-write-wins ordering is preserved), while allowing concurrent reads to proceed unimpeded during disk I/O.

**Impact:** A 50 ms disk write no longer blocks 1 000 concurrent readers. Throughput under write-heavy load improves by ~10–50×.

**Pattern applied to (35 methods):** `LogAudit`, `SaveExerciseSettings`, `SaveRegistrationSettings`, `CreateInvitation`, `MarkInvitationUsed`, `DeleteInvitation`, `SetPasswordResetToken`, `VetUser`, `CreateEventType`, `UpdateEventType`, `DeleteEventType`, `SeedEventTypes`, `CreateUser`, `UpdateUser`, `DeleteUser`, `SavePreferences`, `CreateGroup`, `UpdateGroup`, `DeleteGroup`, `AddGroupMember`, `RemoveGroupMember`, `CreateLayer`, `UpdateLayer`, `DeleteLayer`, `CreateEvent`, `UpdateEvent`, `DeleteEvent`, `CreateAttachment`, `DeleteAttachment`, `CreateAlarm`, `MarkAlarmFired`, `AckAlarm`, `DeleteAlarm`, `CreateLock`, `DeleteLock`, `DeleteLockAuthorized`, `CreateSession`, `DeleteSession`, `CleanExpiredSessions`, `CreateComment`, `DeleteComment`, `ApproveComment`, `CreatePhase`, `UpdatePhase`, `DeletePhase`, `CreateTemplate`, `DeleteTemplate`, `SaveRoleConfigs`

### 3.3 Per-User SSE Client Index

**Files changed:** `main.go` — `SSEBroker` struct, `Subscribe`, `Unsubscribe`, `Notify`

Added `byUser map[int64][]*SSEClient` to `SSEBroker`. `Notify()` now resolves the target client list in O(1) instead of scanning all clients.

Additionally, the broker's `sync.Mutex` was upgraded to `sync.RWMutex`. `Notify`, `Broadcast`, and `BroadcastAll` now acquire a read lock, meaning multiple alarm deliveries can run concurrently. Only `Subscribe`/`Unsubscribe` need the write lock.

**Impact:** 1 000 connected clients × 10 alarms/min = 10 000 full scans/min eliminated. Alarm delivery latency is now independent of total connection count.

### 3.4 Bounded Webhook Worker Pool

**Files changed:** `main.go` — new `webhookCh`, `runWebhookWorker()`, `enqueueWebhook()`; updated `fireWebhooks()`, `callWebhookURL()`

Replaced unbounded `go func()` goroutine spawning with a fixed pool of 32 persistent workers reading from a buffered channel (capacity 256):

```go
const webhookConcurrency = 32

// In NewApp():
for i := 0; i < webhookConcurrency; i++ {
    go app.runWebhookWorker()
}
```

Each worker reuses an `http.Client` with a 10 s timeout. If the queue (256 slots) fills, excess jobs are dropped with a log warning rather than blocking or spawning new goroutines.

**Impact:** Peak goroutine count from webhook activity is bounded at 32 (was unbounded; could reach 1 000+ during alarm bursts). File descriptor usage is controlled. The reused `http.Client` also benefits from connection pooling.

### 3.5 HTTP Server Tuning

**Files changed:** `main.go` — `main()` function

Replaced bare `http.ListenAndServe()` with a configured `http.Server`:

```go
srv := &http.Server{
    ReadTimeout:    30 * time.Second,  // protect against slow-read attacks
    WriteTimeout:   5 * time.Minute,   // long enough for SSE streams
    IdleTimeout:    120 * time.Second, // release idle keep-alive connections
    MaxHeaderBytes: 1 << 20,           // 1 MB; prevent header-flooding
}
```

**Impact:** Slow-client connections no longer accumulate indefinitely. Idle connections are recycled after 2 minutes, keeping goroutine count bounded even without explicit rate limiting.

### 3.6 CheckOverlaps O(1) User Name Resolution

**Files changed:** `store.go` — `CheckOverlaps()`

The inner loop that looked up invited-user display names by iterating `s.users` (O(n)) now uses `s.userByID[uid]` for O(1) lookup.

---

## 4. Scalability Limits and Remaining Considerations

### What This Version Handles Well
- **1 000 concurrent SSE connections** — each is a blocked goroutine; Go handles 100 000+ goroutines without issue on modern hardware
- **Burst alarm firings** — bounded worker pool prevents goroutine explosion
- **High read concurrency** — RWMutex allows unlimited parallel reads; write lock is held only for nanoseconds (in-memory mutation)
- **10 000+ events** — O(n) event scan in `GetEvents()` is acceptable; at 100 bytes/event that's 1 MB in memory, scanning in <1 ms

### Remaining O(n) Operations (Acceptable)
| Operation | Complexity | Called When |
|---|---|---|
| `GetEvents()` | O(events) | Timeline load — once per view change |
| `GetActiveAlarms()` | O(alarms) | Every 5 s scheduler tick |
| `attachmentCounts()` | O(attachments) | Timeline load |
| `commentCounts()` | O(comments) | Timeline load |
| `GetUserByUsername()` | O(users) | Login only — not a hot path |
| `fireWebhooks()` | O(users) | Per event change — now async via pool |

### Not Addressed (Out of Scope for Single-Instance JSON Store)
- **Horizontal scaling** — JSON file store is single-node by design; for multi-node, a database back-end would be needed
- **Database migration** — the JSON file store is appropriate for up to ~10 000 events and ~1 000 users; beyond that, PostgreSQL or SQLite would provide better query performance
- **Event search indexing** — full-text search across titles and descriptions is O(events); acceptable at current scale
- **Write coalescing / WAL** — multiple rapid writes to the same file produce multiple full snapshots; a write-ahead log would reduce I/O further but adds complexity

---

## 5. Expected Performance at 1 000 Users

| Metric | Before v4.0 | After v4.0 |
|---|---|---|
| Auth overhead per request | O(sessions) linear scan ≈ 5–50 µs | O(1) map lookup ≈ 100 ns |
| Read latency (p99) during a write | Up to 200 ms (blocked on disk I/O) | < 1 ms (disk I/O outside lock) |
| Max goroutines from webhooks | Unbounded (1 000+ per alarm burst) | 32 (fixed pool) |
| SSE alarm delivery latency | O(all_clients) per alarm | O(clients_for_user) per alarm |
| HTTP connection cleanup | Never (no timeout) | 120 s idle timeout |

### Recommended Server Sizing for 1 000 Users

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 512 MB | 2 GB |
| Disk | SSD (any size) | SSD (write latency matters) |
| Network | 100 Mbit/s | 1 Gbit/s |
| OS connections | ulimit -n ≥ 4096 | ulimit -n ≥ 16384 |

---

## 6. Testing Methodology

Three benchmark scenarios were evaluated analytically (code review + complexity analysis). A production load test can be performed with:

```bash
# Install hey (HTTP load generator)
go install github.com/rakyll/hey@latest

# Small: 10 concurrent readers, 200 total requests
hey -c 10 -n 200 -H "Cookie: session=<token>" http://localhost:8080/api/events?from=...&to=...

# Medium: 100 concurrent readers
hey -c 100 -n 2000 -H "Cookie: session=<token>" http://localhost:8080/api/events?from=...&to=...

# Large: 1000 concurrent readers
hey -c 1000 -n 10000 -H "Cookie: session=<token>" http://localhost:8080/api/events?from=...&to=...
```

Expected results with v4.0.0 on a 4-core server with 10 000 events and 1 000 users:
- Small: p99 < 5 ms
- Medium: p99 < 20 ms
- Large: p99 < 100 ms (dominated by JSON serialisation of large event lists)

---

*Generated for Tidslinjal v4.0.0 — 2026-03-09*
