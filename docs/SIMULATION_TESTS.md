# Tidslinjal Long-Running Simulation Test Framework

The simulation test framework lets you run Tidslinjal under sustained, realistic load for
2, 4, 6, or 10 days to verify that the application is stable under real-world conditions:
no hangs, freezes, panics, or crashes.

---

## What It Does

The framework:

1. **Builds the binary** (if not already built).
2. **Starts an isolated server** on a dedicated test port using a temporary data directory.
3. **Spawns N concurrent virtual users** — each has their own HTTP session and performs a
   random mix of realistic operations in a continuous loop.
4. **Logs every event** — actions, errors, crashes, restarts, and hourly checkpoints — to a
   structured JSON file.
5. **Auto-restarts the server** if it crashes, recording the crash and restart in the log.
6. **Prints a final summary** with error/crash counts and a per-action breakdown.

---

## Quick Start

```bash
# 2-day run with default settings (5 users)
./tests/run_simulation.sh

# 4-day run
./tests/run_simulation.sh --days 4

# 10-day run with 8 users, verbose output
./tests/run_simulation.sh --days 10 --users 8 --verbose

# Run in the background (recommended for multi-day runs)
nohup ./tests/run_simulation.sh --days 4 > sim-output.txt 2>&1 &
echo $! > sim.pid
```

Stop early with Ctrl+C — a summary is printed before exit.

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--days N` / `-d N` | `2` | Number of days to run |
| `--users N` / `-u N` | `5` | Concurrent virtual users |
| `--port PORT` / `-p PORT` | `19090` | TCP port for test server |
| `--log FILE` / `-l FILE` | `simulation-<timestamp>.log.json` | JSON log output file |
| `--verbose` / `-v` | off | Print every action to stdout (noisy) |
| `--no-restart` | off | Stop instead of restarting after a crash |
| `--help` / `-h` | — | Show help |

---

## Advanced Usage (Go directly)

You can also invoke the Go program directly with a full Go duration string:

```bash
go run ./tests/simulation \
  --duration 48h \
  --users 10 \
  --port 19090 \
  --binary ./tidslinjal \
  --log my-run.log.json \
  --verbose
```

Duration formats accepted:
- `2d`, `4d`, `6d`, `10d` — days
- `48h`, `168h` — hours
- `30m` — minutes (useful for quick smoke tests)

---

## Virtual User Actions

Each virtual user performs the following operations in a random, weighted loop:

| Action | Relative Frequency | Description |
|--------|--------------------|-------------|
| `get_events` | 5 | List events for the next 30 days |
| `create_event` | 3 | Create a randomly-typed event |
| `add_comment` | 3 | Add a comment to an existing event |
| `get_layers` | 3 | Fetch timeline layers |
| `get_preferences` | 2 | Read user preferences |
| `update_event` | 2 | Update a previously created event |
| `get_version` | 2 | GET /api/version (health check) |
| `get_alarms` | 2 | Fetch alarms |
| `login` | 1 | Re-authenticate (session refresh) |
| `delete_event` | 1 | Delete an owned event |
| `create_layer` | 1 | Create a new timeline layer |
| `get_users` | 1 | List users (403 expected for non-admin) |
| `get_audit` | 1 | Fetch audit log (403 expected for non-admin) |
| `get_exercise` | 1 | Fetch exercise settings |
| `export_json` | 1 | Full JSON export |
| `change_preference` | 1 | Update theme/language preference |

Users also periodically re-login automatically when sessions expire or become invalid.

---

## Log Format

Every event is written as one JSON object per line (NDJSON). Example:

```jsonc
// Normal action
{"time":"2026-03-09T10:00:01Z","kind":"action","user":"simuser0","action":"get_events","http_status":200,"duration_ms":12,"message":"get_events → ok (12ms)"}

// Error
{"time":"2026-03-09T10:00:05Z","kind":"error","user":"simuser2","action":"create_event","message":"action create_event failed: connection refused"}

// Server crash
{"time":"2026-03-09T11:32:18Z","kind":"crash","message":"Server process exited: code=2 err=signal: killed","extra":{"pid":"14321"}}

// Auto-restart
{"time":"2026-03-09T11:32:23Z","kind":"restart","message":"Restarting server…"}

// Hourly checkpoint
{"time":"2026-03-09T11:00:00Z","kind":"checkpoint","message":"Checkpoint at 1h0m0s: requests=12431 errors=0 crashes=0 restarts=0 hangs=0"}

// Final summary
{"time":"2026-03-09T14:00:00Z","kind":"summary","message":"Simulation complete. Duration=2h0m0s Requests=84231 Errors=2 Crashes=0 Restarts=0 Hangs=0"}
```

### Event Kinds

| Kind | Meaning |
|------|---------|
| `info` | Startup / teardown message |
| `action` | Normal request completed successfully |
| `error` | A request returned an unexpected error |
| `crash` | The server process exited unexpectedly |
| `restart` | The server was restarted after a crash |
| `hang` | A request took longer than the timeout threshold |
| `checkpoint` | Periodic (hourly) statistics snapshot |
| `summary` | Final statistics at the end of the run |

---

## Analysing Results

```bash
# Show all errors and crashes
jq 'select(.kind=="error" or .kind=="crash")' simulation.log.json

# Show only crashes
jq 'select(.kind=="crash")' simulation.log.json

# Show the final summary
jq 'select(.kind=="summary")' simulation.log.json

# Count errors by action
jq -r 'select(.kind=="error") | .action' simulation.log.json | sort | uniq -c | sort -rn

# Show hourly checkpoints
jq 'select(.kind=="checkpoint")' simulation.log.json

# Show all hangs
jq 'select(.kind=="hang")' simulation.log.json

# Plot request rate (requests per checkpoint period)
jq -r 'select(.kind=="checkpoint") | [.time, .message] | @tsv' simulation.log.json
```

---

## Interpreting Results

| Outcome | Meaning |
|---------|---------|
| 0 crashes, 0 errors | ✅ Excellent — full stability confirmed |
| 0 crashes, low errors (<0.1%) | ✅ Good — minor transient issues, likely harmless |
| 0 crashes, moderate errors | ⚠ Investigate — may indicate a race condition or resource leak |
| Crashes with auto-restart | ❌ Server is unstable — check server logs for panic/fatal output |
| Hangs recorded | ❌ Requests are blocking — check for deadlocks or resource exhaustion |

---

## Running as Part of CI

For shorter smoke tests (e.g. 30 minutes in CI):

```bash
go run ./tests/simulation --duration 30m --users 3 --log ci-sim.log.json
```

Check exit code: 0 = success (no crashes detected), non-zero = failures.

---

## Architecture Notes

The simulation framework lives in `tests/simulation/main.go`. Key components:

- **`Simulation`** — top-level state, log emitter, server lifecycle manager
- **`VirtualUser`** — one user with its own cookie jar and action history
- **`Stats`** — atomic counters (thread-safe, no locks needed for reads)
- **`emit()`** — writes a `LogEvent` to the JSON log; also prints to stdout if `--verbose`
- **`monitorServer()`** — goroutine that waits for the server process to exit and triggers restart
- **`checkpointLoop()`** — goroutine that emits a `checkpoint` event every hour
- **`parseFlags()`** — CLI flag handling, including shorthand `Nd` duration format

The server is started with `--verbose` so its own panic/fatal output goes to stderr and
can be captured by the OS process supervisor or a `tee` pipe.

---

## Tips

- **Multi-day runs**: Use `nohup` or `screen`/`tmux` so the process survives terminal disconnect.
- **Baseline before changes**: Run a 2-day simulation, then apply changes and run again to compare.
- **Memory leaks**: Compare server RSS over time using `ps` or `top`. A steadily growing process
  is a sign of a leak.
- **Log rotation**: For very long runs, the log file can grow large. Pipe through `logrotate` or
  pre-compress with `gzip` if needed.
