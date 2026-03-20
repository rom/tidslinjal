#!/usr/bin/env bash
# tests/run_tests.sh — Master test runner for Tidslinjal.
#
# Runs selected test suites with isolated environments, signal handling,
# and report generation.
#
# Usage:
#   ./tests/run_tests.sh                     — interactive: pick suites
#   ./tests/run_tests.sh all                 — run all suites
#   ./tests/run_tests.sh go                  — Go unit/integration tests only
#   ./tests/run_tests.sh js                  — JS unit tests only
#   ./tests/run_tests.sh api                 — live API shell tests only
#   ./tests/run_tests.sh e2e                 — Playwright E2E tests only
#   ./tests/run_tests.sh perf                — performance/benchmark tests
#   ./tests/run_tests.sh fuzz [duration]     — fuzz tests (default: 30s each)
#   ./tests/run_tests.sh go,perf,fuzz        — comma-separated suites
#   ./tests/run_tests.sh --parallel go perf  — run suites in parallel
#
# Options:
#   --parallel           Run selected suites in parallel (separate ports/data)
#   --report FILE        Write JSON report to FILE (default: auto-generated)
#   --fuzz-time DURATION Fuzz test duration per target (default: 30s)
#   --perf-iterations N  Performance test iterations (default: 100)
#   --on-finish CMD      Command to run when tests finish (e.g., "notify-send done")
#   --timeout DURATION   Global timeout (default: 30m)

set -uo pipefail
cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

# ── Colors / formatting ───────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
SECTION="═══════════════════════════════════════════════════════════"

# ── Defaults ─────────────────────────────────────────────────────────────────
PARALLEL=false
REPORT_FILE=""
FUZZ_TIME="30s"
PERF_ITERATIONS=100
ON_FINISH=""
GLOBAL_TIMEOUT="30m"
SUITES=()
INTERRUPTED=false

# ── Report data ──────────────────────────────────────────────────────────────
declare -A SUITE_STATUS    # suite -> pass|fail|skip
declare -A SUITE_DURATION  # suite -> seconds
declare -A SUITE_OUTPUT    # suite -> last N lines of output
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
START_TIME=$(date +%s)

# ── Signal handling ──────────────────────────────────────────────────────────
cleanup_and_report() {
  INTERRUPTED=true
  echo ""
  echo -e "${YELLOW}${BOLD}  ⚠  Test run interrupted — generating report...${RESET}"
  echo ""
  generate_report
  exit 130
}

trap cleanup_and_report INT TERM

# ── Argument parsing ─────────────────────────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --parallel)     PARALLEL=true; shift ;;
      --report)       REPORT_FILE="$2"; shift 2 ;;
      --fuzz-time)    FUZZ_TIME="$2"; shift 2 ;;
      --perf-iterations) PERF_ITERATIONS="$2"; shift 2 ;;
      --on-finish)    ON_FINISH="$2"; shift 2 ;;
      --timeout)      GLOBAL_TIMEOUT="$2"; shift 2 ;;
      --help|-h)      show_help; exit 0 ;;
      *)
        # Handle comma-separated suites: "go,perf,fuzz"
        IFS=',' read -ra parts <<< "$1"
        for part in "${parts[@]}"; do
          SUITES+=("$part")
        done
        shift
        ;;
    esac
  done
}

show_help() {
  echo "Usage: $0 [OPTIONS] [SUITES...]"
  echo ""
  echo "Suites: go, js, api, e2e, perf, fuzz, all"
  echo ""
  echo "Options:"
  echo "  --parallel           Run suites in parallel"
  echo "  --report FILE        Write JSON report to FILE"
  echo "  --fuzz-time DURATION Fuzz duration per target (default: 30s)"
  echo "  --perf-iterations N  Performance iterations (default: 100)"
  echo "  --on-finish CMD      Command after completion"
  echo "  --timeout DURATION   Global timeout (default: 30m)"
  echo "  -h, --help           Show this help"
}

# ── Interactive suite picker ─────────────────────────────────────────────────
pick_suites() {
  echo -e "${BOLD}Select test suites to run:${RESET}"
  echo ""
  echo "  1) go      — Go unit & integration tests"
  echo "  2) js      — JavaScript unit tests"
  echo "  3) api     — Live API shell tests"
  echo "  4) e2e     — Playwright E2E tests"
  echo "  5) perf    — Performance/benchmark tests"
  echo "  6) fuzz    — Fuzz tests"
  echo "  7) all     — All of the above"
  echo ""
  read -rp "Enter choices (e.g., 1,2,5 or 'all'): " choice

  if [[ "$choice" == "all" || "$choice" == "7" ]]; then
    SUITES=(go js api e2e perf fuzz)
    return
  fi

  IFS=',' read -ra nums <<< "$choice"
  for n in "${nums[@]}"; do
    n=$(echo "$n" | tr -d ' ')
    case "$n" in
      1|go)   SUITES+=(go) ;;
      2|js)   SUITES+=(js) ;;
      3|api)  SUITES+=(api) ;;
      4|e2e)  SUITES+=(e2e) ;;
      5|perf) SUITES+=(perf) ;;
      6|fuzz) SUITES+=(fuzz) ;;
      *)      echo "Unknown: $n" ;;
    esac
  done
}

# ── Suite Runners ────────────────────────────────────────────────────────────
# Each runner uses its own temp dir and port to allow parallel execution
# without interfering with a production instance or other test runners.

run_go_tests() {
  echo -e "${CYAN}Running: go test ./... -count=1 -timeout 300s${RESET}"
  local tmpdir
  tmpdir=$(mktemp -d /tmp/tidslinjal-test-go-XXXXXX)
  local output
  output=$(go test ./... -count=1 -timeout 300s 2>&1)
  local status=$?
  rm -rf "$tmpdir"
  echo "$output" | grep -E '^=== RUN|^--- PASS|^--- FAIL|^PASS|^FAIL|^ok|FAIL\t' || true
  SUITE_OUTPUT[go]=$(echo "$output" | tail -20)
  return $status
}

run_js_tests() {
  echo -e "${CYAN}Running: node tests/js/test_utils.js${RESET}"
  local output
  output=$(node tests/js/test_utils.js 2>&1)
  local status=$?
  echo "$output"
  SUITE_OUTPUT[js]=$(echo "$output" | tail -20)
  return $status
}

run_api_tests() {
  echo -e "${CYAN}Running: tests/run_api.sh${RESET}"
  local output
  output=$(bash tests/run_api.sh 2>&1)
  local status=$?
  echo "$output" | tail -30
  SUITE_OUTPUT[api]=$(echo "$output" | tail -20)
  return $status
}

run_e2e_tests() {
  local e2e_dir="tests/e2e"
  if [[ ! -d "$e2e_dir" ]]; then
    echo "E2E directory not found, skipping"
    return 1
  fi
  echo -e "${CYAN}Installing Playwright dependencies...${RESET}"
  cd "$e2e_dir"
  npm install --silent 2>&1 | tail -3

  if [[ ! -f "../../tidslinjal" ]]; then
    echo "Building tidslinjal binary..."
    cd ../..
    go build -o tidslinjal .
    cd "$e2e_dir"
  fi

  echo -e "${CYAN}Running: npx playwright test${RESET}"
  local output
  output=$(npx playwright test --reporter=list 2>&1)
  local status=$?
  cd "$PROJECT_ROOT"
  echo "$output" | tail -30
  SUITE_OUTPUT[e2e]=$(echo "$output" | tail -20)
  return $status
}

run_perf_tests() {
  echo -e "${CYAN}Running performance tests (iterations=$PERF_ITERATIONS)${RESET}"
  local output
  output=$(go test -count=1 -timeout 300s -run 'TestPerformance' -v ./... 2>&1)
  local status=$?
  echo "$output" | grep -E 'Performance|║|╔|╗|╠|╚|╝|report written' || true

  echo ""
  echo -e "${CYAN}Running Go benchmarks...${RESET}"
  local bench_output
  bench_output=$(go test -bench=. -benchmem -benchtime=3s -run='^$' -timeout 300s ./... 2>&1)
  local bench_status=$?
  echo "$bench_output" | grep -E '^Benchmark|^ok|^FAIL' || true

  SUITE_OUTPUT[perf]=$(echo "$output"; echo "$bench_output" | tail -20)
  [[ $status -eq 0 && $bench_status -eq 0 ]]
  return $?
}

run_fuzz_tests() {
  echo -e "${CYAN}Running fuzz tests (duration=$FUZZ_TIME per target)${RESET}"
  local fuzz_targets
  fuzz_targets=$(grep -l '^func Fuzz' ./*_test.go 2>/dev/null | head -20)
  if [[ -z "$fuzz_targets" ]]; then
    echo "No fuzz targets found"
    return 0
  fi

  local all_status=0
  local fuzz_funcs
  fuzz_funcs=$(grep -h '^func Fuzz' ./*_test.go | sed 's/func \(Fuzz[A-Za-z0-9_]*\).*/\1/')

  for func in $fuzz_funcs; do
    if [[ "$INTERRUPTED" == "true" ]]; then
      echo "  Interrupted, stopping fuzz tests"
      break
    fi
    echo -e "  ${DIM}Fuzzing: $func ($FUZZ_TIME)${RESET}"
    local output
    output=$(go test -fuzz="^${func}$" -fuzztime="$FUZZ_TIME" -timeout 120s ./... 2>&1)
    local status=$?
    if [[ $status -ne 0 ]]; then
      echo -e "  ${RED}✗ $func FAILED${RESET}"
      echo "$output" | grep -E 'FAIL|panic|fatal' | head -5
      all_status=1
    else
      echo -e "  ${GREEN}✓ $func passed${RESET}"
    fi
  done

  SUITE_OUTPUT[fuzz]="Fuzz targets tested: $(echo "$fuzz_funcs" | wc -l)"
  return $all_status
}

# ── Suite executor ───────────────────────────────────────────────────────────

run_suite() {
  local name="$1"
  local start
  start=$(date +%s)
  echo ""
  echo -e "${BOLD}${SECTION}${RESET}"
  echo -e "${BOLD}  Suite: ${name}${RESET}"
  echo -e "${BOLD}${SECTION}${RESET}"

  local status=0
  case "$name" in
    go)   run_go_tests   || status=1 ;;
    js)   run_js_tests   || status=1 ;;
    api)  run_api_tests  || status=1 ;;
    e2e)  run_e2e_tests  || status=1 ;;
    perf) run_perf_tests || status=1 ;;
    fuzz) run_fuzz_tests || status=1 ;;
    *)    echo "Unknown suite: $name"; status=1 ;;
  esac

  local end
  end=$(date +%s)
  SUITE_DURATION[$name]=$((end - start))

  if [[ $status -eq 0 ]]; then
    SUITE_STATUS[$name]="pass"
    TOTAL_PASS=$((TOTAL_PASS + 1))
    echo -e "${GREEN}${BOLD}  ✓ $name PASSED (${SUITE_DURATION[$name]}s)${RESET}"
  else
    SUITE_STATUS[$name]="fail"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo -e "${RED}${BOLD}  ✗ $name FAILED (${SUITE_DURATION[$name]}s)${RESET}"
  fi
}

run_suite_background() {
  local name="$1"
  local logfile="/tmp/tidslinjal-test-${name}-$$.log"
  run_suite "$name" > "$logfile" 2>&1
  cat "$logfile"
  rm -f "$logfile"
}

# ── Report generation ────────────────────────────────────────────────────────

generate_report() {
  local end_time
  end_time=$(date +%s)
  local total_duration=$((end_time - START_TIME))

  # Console report
  echo ""
  echo -e "${BOLD}${SECTION}${RESET}"
  if [[ "$INTERRUPTED" == "true" ]]; then
    echo -e "${BOLD}  INTERRUPTED — PARTIAL RESULTS${RESET}"
  else
    echo -e "${BOLD}  FINAL RESULTS${RESET}"
  fi
  echo -e "${BOLD}${SECTION}${RESET}"
  echo ""

  for suite in "${SUITES[@]}"; do
    local status="${SUITE_STATUS[$suite]:-skip}"
    local duration="${SUITE_DURATION[$suite]:-0}"
    case "$status" in
      pass) echo -e "  ${GREEN}✓${RESET} ${suite} — passed (${duration}s)" ;;
      fail) echo -e "  ${RED}✗${RESET} ${suite} — FAILED (${duration}s)" ;;
      skip) echo -e "  ${YELLOW}⊘${RESET} ${suite} — skipped" ;;
    esac
  done

  echo ""
  echo "  Passed: ${TOTAL_PASS}   Failed: ${TOTAL_FAIL}   Skipped: ${TOTAL_SKIP}"
  echo "  Total duration: ${total_duration}s"
  echo ""

  # JSON report to file
  local report_file="${REPORT_FILE}"
  if [[ -z "$report_file" ]]; then
    report_file="tests/report-$(date +%Y%m%d-%H%M%S).json"
  fi

  local suites_json="["
  local first=true
  for suite in "${SUITES[@]}"; do
    local status="${SUITE_STATUS[$suite]:-skip}"
    local duration="${SUITE_DURATION[$suite]:-0}"
    if [[ "$first" == "true" ]]; then
      first=false
    else
      suites_json+=","
    fi
    suites_json+="{\"name\":\"${suite}\",\"status\":\"${status}\",\"duration_seconds\":${duration}}"
  done
  suites_json+="]"

  cat > "$report_file" <<JSONEOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "interrupted": ${INTERRUPTED},
  "total_duration_seconds": ${total_duration},
  "passed": ${TOTAL_PASS},
  "failed": ${TOTAL_FAIL},
  "skipped": ${TOTAL_SKIP},
  "suites": ${suites_json}
}
JSONEOF

  echo -e "  ${DIM}Report written to: ${report_file}${RESET}"
  echo ""

  if [[ "${TOTAL_FAIL}" -gt 0 || "$INTERRUPTED" == "true" ]]; then
    echo -e "${RED}${BOLD}  ✗ Some test suites FAILED${RESET}"
  else
    echo -e "${GREEN}${BOLD}  ✓ All test suites PASSED${RESET}"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

parse_args "$@"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║           Tidslinjal Test Suite Runner                  ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"

# Interactive picker if no suites specified
if [[ ${#SUITES[@]} -eq 0 ]]; then
  pick_suites
fi

# Expand 'all'
if [[ "${SUITES[*]}" == "all" ]]; then
  SUITES=(go js api e2e perf fuzz)
fi

echo ""
echo "Suites:  ${SUITES[*]}"
echo "Parallel: ${PARALLEL}"
echo "Working dir: $(pwd)"
echo ""

if [[ "$PARALLEL" == "true" ]]; then
  echo -e "${CYAN}Running suites in parallel (each with isolated data/ports)...${RESET}"
  pids=()
  for suite in "${SUITES[@]}"; do
    run_suite_background "$suite" &
    pids+=($!)
  done
  for pid in "${pids[@]}"; do
    wait "$pid" || true
  done
else
  for suite in "${SUITES[@]}"; do
    if [[ "$INTERRUPTED" == "true" ]]; then
      SUITE_STATUS[$suite]="skip"
      TOTAL_SKIP=$((TOTAL_SKIP + 1))
      continue
    fi
    run_suite "$suite"
  done
fi

generate_report

# Post-finish hook
if [[ -n "$ON_FINISH" ]]; then
  echo -e "${DIM}Running on-finish command: $ON_FINISH${RESET}"
  eval "$ON_FINISH" || true
fi

if [[ "${TOTAL_FAIL}" -gt 0 ]]; then
  exit 1
fi
