# Tidslinjal Test Framework

## Quick Start

```bash
# Run all Go unit + JS tests (fast)
make test

# Run everything: Go, JS, API, E2E, performance, fuzz
make test-all

# Interactive: pick which suites to run
./tests/run_tests.sh

# Run specific suites
./tests/run_tests.sh go
./tests/run_tests.sh go,perf,fuzz
./tests/run_tests.sh perf
./tests/run_tests.sh fuzz
```

## Test Suites

### 1. Go Unit & Integration Tests (`go`)

**Files:** `*_test.go` in project root
**Run:** `go test ./...` or `./tests/run_tests.sh go`

Tests are organized by domain:

| File | Tests | Coverage |
|------|-------|----------|
| `api_test.go` | ~45 | Auth, users, events, layers, groups, exercise, export, API keys, OIDC/mail/syslog/TLS config |
| `api_extended_test.go` | ~50 | Rooms, decision log, ready checks, templates, filter presets, custom resource types, event duplication, XSS validation |
| `api_stats_test.go` | ~16 | All statistics endpoints: overview, timeline, status, type, heatmap, workload, decisions, slip histogram, op tempo, analytics, dependency graph, leadership dashboard, personnel, usage |
| `api_features_test.go` | ~35 | Tags, checklists, polls, questionnaires, references, resource notes/stars, auto-report schedules, map resources, geo items, narrative, startup text, day labels, languages, activity, free-busy, exports (ICS/STIX/settings/logs) |
| `api_admin_test.go` | ~25 | Admin sessions, registration settings, security settings, rate limits, geoblocking, encryption, SSO toggle, gradual backup, invitations, bulk operations, auth profile/register/forgot-password, federation, team lead, integrations |
| `store_test.go` | ~50 | Store CRUD, persistence, sessions, locks, concurrency safety |
| `connector_test.go` | ~13 | STIX and ADatP-3 (NATO) message format conversion |
| `eventbus_test.go` | 3 | Pub/sub event bus |
| `ingest_test.go` | ~8 | Format detection, data normalization |
| `ics_test.go` | ~15 | ICS/iCalendar parsing and import |
| `routing_test.go` | ~14 | Routing rules, ingest endpoint, metrics |

**Parallel-safe:** Each test creates an isolated App with its own temp directory via `newTestApp(t)`. Tests use `httptest.Server` (random ports), so they never conflict with a running production instance or other test suites.

### 2. JavaScript Unit Tests (`js`)

**File:** `tests/js/test_utils.js`
**Run:** `node tests/js/test_utils.js` or `./tests/run_tests.sh js`

Tests pure utility functions: HTML escaping, date formatting, role hierarchy, duration formatting, file size formatting, ICS utilities, recurrence calculations. 170+ test cases.

### 3. Live API Tests (`api`)

**File:** `tests/run_api.sh`
**Run:** `./tests/run_tests.sh api`

Shell-based HTTP smoke tests. Builds the binary, starts a server on port 18080 with a temp data directory, runs 100+ assertions via curl, then cleans up. Safe to run alongside production (different port).

### 4. Playwright E2E Tests (`e2e`)

**Dir:** `tests/e2e/`
**Run:** `./tests/run_tests.sh e2e` or `make e2e`

Browser-level tests with Playwright (Chromium). Auto-starts a test server on a random port with temp data. Tests login, timeline rendering, event CRUD, API regression.

### 5. Performance & Benchmark Tests (`perf`)

**File:** `perf_test.go`
**Run:** `make test-perf` or `./tests/run_tests.sh perf`

Two types of performance tests:

**Go Benchmarks** (`go test -bench`):
- `BenchmarkAPI_Login` — authentication throughput
- `BenchmarkAPI_GetEvents` — event query latency
- `BenchmarkAPI_CreateEvent` — event creation throughput
- `BenchmarkAPI_StatsOverview` — statistics computation with 50 events
- `BenchmarkAPI_Export` — full data export
- `BenchmarkStore_CreateEvent` — raw store write performance
- `BenchmarkStore_GetEvents` — store query with 1000 events
- `BenchmarkStore_ConcurrentReadWrite` — parallel read/write throughput

**Integration Performance Tests** (`go test -run TestPerformance`):
- `TestPerformance_APILatency` — measures p50/p95/p99 latency for 9 API endpoints across 100 iterations
- `TestPerformance_ConcurrentLoad` — 10 concurrent workers × 50 requests each

Performance results are:
- Printed to test output in a table
- Written as JSON to `/tmp/tidslinjal-perf-YYYYMMDD-HHMMSS.json`

### 6. Fuzz Tests (`fuzz`)

**File:** `fuzz_test.go`
**Run:** `make test-fuzz` or `./tests/run_tests.sh fuzz`

Fuzz testing uses Go's built-in fuzzing framework to find crashes, panics, and unexpected behavior with random inputs.

**Fuzz targets:**

| Target | What It Tests |
|--------|---------------|
| `FuzzLogin` | Login endpoint with arbitrary username/password — tests auth resilience |
| `FuzzCreateEvent` | Event creation with arbitrary titles, dates, descriptions — tests input validation |
| `FuzzCreateUser` | User creation with arbitrary data — tests user management |
| `FuzzAPIEndpoints` | Arbitrary JSON payloads to 11 POST endpoints — tests JSON parsing |
| `FuzzURLPaths` | Path traversal and unusual URL patterns — tests routing safety |
| `FuzzStripHTMLTags` | HTML sanitizer with XSS payloads — verifies no dangerous content passes |
| `FuzzIsDangerousFilename` | Filename validation with arbitrary extensions |
| `FuzzIngest` | Ingest endpoint with arbitrary data formats |
| `FuzzStoreEventCRUD` | Store layer with arbitrary event data — tests data integrity |

**What fuzz tests verify:**
- Server never crashes (no panics)
- HTTP status codes are always valid (200-599)
- HTML sanitizer never passes `<script>`, `javascript:`, or `vbscript:` content
- Store operations maintain data integrity

**Adjusting fuzz duration:**
```bash
# Short (CI)
./tests/run_tests.sh --fuzz-time 10s fuzz

# Thorough (overnight)
./tests/run_tests.sh --fuzz-time 5m fuzz

# Single target, long duration
go test -fuzz=FuzzStripHTMLTags -fuzztime=1h ./...
```

Fuzz corpus files (interesting inputs found by the fuzzer) are stored in `testdata/fuzz/` and are automatically reused in future runs.

## Running Tests in Parallel

### Parallel suites (isolated from each other)

```bash
./tests/run_tests.sh --parallel go,perf,fuzz
```

Each suite runs in its own process with:
- Its own temp data directory
- Its own port (via `httptest.Server`)
- No shared state

### Parallel with production server

All test suites are safe to run alongside a production Tidslinjal instance because:
- Go tests use `httptest.NewServer()` which binds to random ports
- API shell tests use port 18080 (production defaults to 8080)
- E2E tests use their own port (configurable via `TEST_PORT`)
- No tests modify global state outside their temp directories

### Multiple concurrent test runners

You can start multiple `./tests/run_tests.sh` processes simultaneously. Each creates isolated temp directories and uses random ports. Example:

```bash
# Terminal 1: unit tests
./tests/run_tests.sh go &

# Terminal 2: performance tests
./tests/run_tests.sh perf &

# Terminal 3: fuzz tests
./tests/run_tests.sh fuzz &

wait  # Wait for all to finish
```

## Signal Handling & Reports

### Interruption (Ctrl+C)

If you press Ctrl+C or send SIGTERM/SIGINT during a test run:

1. The current suite is stopped
2. A summary report is printed to the console
3. A JSON report is written to `tests/report-YYYYMMDD-HHMMSS.json`
4. The report includes which suites passed, failed, or were skipped

### Report output

Every test run produces a JSON report:

```json
{
  "timestamp": "2026-03-20T06:30:00Z",
  "interrupted": false,
  "total_duration_seconds": 185,
  "passed": 4,
  "failed": 0,
  "skipped": 0,
  "suites": [
    {"name": "go", "status": "pass", "duration_seconds": 170},
    {"name": "js", "status": "pass", "duration_seconds": 2},
    {"name": "perf", "status": "pass", "duration_seconds": 12},
    {"name": "fuzz", "status": "pass", "duration_seconds": 60}
  ]
}
```

Custom report location: `./tests/run_tests.sh --report /path/to/report.json all`

### Post-test hook

Run a command when tests finish:

```bash
# Desktop notification
./tests/run_tests.sh --on-finish "notify-send 'Tests done'" all

# Email (example)
./tests/run_tests.sh --on-finish "mail -s 'Tests done' admin@example.com < /dev/null" all
```

## Makefile Targets

```bash
make test        # Quick: Go unit tests + JS tests
make test-all    # Full: all suites
make test-perf   # Performance benchmarks
make test-fuzz   # Fuzz testing (30s per target)
make vet         # Go vet
make lint        # golangci-lint + eslint
make e2e         # Playwright E2E
```

## Test Architecture

```
tests/
├── run_tests.sh          # Master test runner (CLI, signal handling, reports)
├── run_api.sh            # Live API smoke tests
├── run_simulation.sh     # Long-running stress test (2-10 days)
├── TESTING.md            # This documentation
├── e2e/
│   ├── playwright.config.js
│   ├── package.json
│   └── specs/
│       ├── timeline.spec.js
│       └── auth.spec.js
├── js/
│   └── test_utils.js     # JavaScript unit tests
├── simulation/
│   └── main.go           # Multi-day stress test
└── report-*.json         # Auto-generated test reports

Root test files:
├── api_test.go           # Core API tests
├── api_extended_test.go  # Extended API tests
├── api_stats_test.go     # Statistics API tests
├── api_features_test.go  # Feature API tests (tags, polls, checklists, etc.)
├── api_admin_test.go     # Admin & auth extended tests
├── store_test.go         # Store/persistence tests
├── connector_test.go     # Format conversion tests
├── eventbus_test.go      # Event bus tests
├── ingest_test.go        # Ingestion tests
├── ics_test.go           # Calendar import tests
├── routing_test.go       # Routing rule tests
├── perf_test.go          # Performance & benchmark tests
└── fuzz_test.go          # Fuzz tests
```

## Writing New Tests

### Adding an API test

```go
func TestAPI_NewFeature(t *testing.T) {
    t.Parallel()                              // Enable parallel execution
    _, srv := newTestApp(t)                   // Isolated app + httptest server
    cookies := login(t, srv, "admin", "admin") // Authenticate

    resp := apiDo(t, srv, http.MethodGet, "/api/new-endpoint", nil, cookies)
    defer resp.Body.Close()
    if resp.StatusCode != http.StatusOK {
        t.Fatalf("expected 200, got %d", resp.StatusCode)
    }
}
```

### Adding a fuzz test

```go
func FuzzNewEndpoint(f *testing.F) {
    _, srv := newFuzzApp(f)
    cookies := fuzzLogin(f, srv)

    f.Add("normal input")
    f.Add("<script>alert(1)</script>")
    f.Add(strings.Repeat("A", 10000))

    f.Fuzz(func(t *testing.T, input string) {
        resp, err := fuzzRequest(srv, http.MethodPost, "/api/endpoint",
            `{"field":"`+input+`"}`, cookies)
        if err != nil { return }
        resp.Body.Close()
        if resp.StatusCode < 200 || resp.StatusCode >= 600 {
            t.Errorf("bad status: %d", resp.StatusCode)
        }
    })
}
```

### Adding a benchmark

```go
func BenchmarkNewOperation(b *testing.B) {
    app, _ := NewApp(b.TempDir())
    defer app.Stop()
    resetAdminPassword(b, app)
    srv := httptest.NewServer(app.routes())
    defer srv.Close()
    cookies := benchLogin(b, srv)

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        resp := benchDo(b, srv, http.MethodGet, "/api/endpoint", "", cookies)
        resp.Body.Close()
    }
}
```
