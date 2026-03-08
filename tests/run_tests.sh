#!/usr/bin/env bash
# tests/run_tests.sh — Master test runner for Tidslinjal.
# Runs: Go unit tests, Go API integration tests, JS unit tests, live API tests, Playwright E2E.
#
# Usage:
#   ./tests/run_tests.sh           — run all suites
#   ./tests/run_tests.sh go        — Go tests only
#   ./tests/run_tests.sh js        — JS unit tests only
#   ./tests/run_tests.sh api       — live API shell tests only
#   ./tests/run_tests.sh e2e       — Playwright E2E tests only

set -euo pipefail
cd "$(dirname "$0")/.."

# ── Colors / formatting ───────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'
SECTION="═══════════════════════════════════════════════════════════"

pass_suite() { echo -e "${GREEN}${BOLD}  ✓ $1 PASSED${RESET}"; }
fail_suite() { echo -e "${RED}${BOLD}  ✗ $1 FAILED${RESET}"; }
skip_suite() { echo -e "${YELLOW}  ⊘ $1 SKIPPED${RESET}"; }

TOTAL_PASS=0
TOTAL_FAIL=0

run_suite() {
  local name="$1"; shift
  echo ""
  echo -e "${BOLD}${SECTION}${RESET}"
  echo -e "${BOLD}  Suite: ${name}${RESET}"
  echo -e "${BOLD}${SECTION}${RESET}"
  if "$@"; then
    pass_suite "$name"
    TOTAL_PASS=$((TOTAL_PASS+1))
  else
    fail_suite "$name"
    TOTAL_FAIL=$((TOTAL_FAIL+1))
  fi
}

SUITE="${1:-all}"

# ── Go tests ──────────────────────────────────────────────────────────────────
run_go_tests() {
  echo "Running: go test ./... -v -count=1 -timeout 120s"
  go test ./... -v -count=1 -timeout 120s 2>&1 | \
    grep -E "^=== RUN|^--- PASS|^--- FAIL|^PASS|^FAIL|^ok|FAIL\t" || true
  # Re-run to capture exit code
  go test ./... -count=1 -timeout 120s
}

# ── JS unit tests ─────────────────────────────────────────────────────────────
run_js_tests() {
  echo "Running: node tests/js/test_utils.js"
  node tests/js/test_utils.js
}

# ── Live API tests ────────────────────────────────────────────────────────────
run_api_tests() {
  echo "Running: tests/run_api.sh"
  bash tests/run_api.sh
}

# ── Playwright E2E tests ──────────────────────────────────────────────────────
run_e2e_tests() {
  local e2e_dir="tests/e2e"
  echo "Installing Playwright dependencies..."
  cd "$e2e_dir"
  npm install --silent 2>&1 | tail -3

  # Build binary if not present
  if [[ ! -f "../../tidslinjal" ]]; then
    echo "Building tidslinjal binary..."
    cd ../..
    go build -o tidslinjal .
    cd "$e2e_dir"
  fi

  echo "Running: npx playwright test"
  npx playwright test --reporter=list 2>&1
  local status=$?
  cd ../..
  return $status
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║         Tidslinjal Test Suite                            ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo "Suite: ${SUITE}"
echo "Working dir: $(pwd)"

case "$SUITE" in
  go)
    run_suite "Go Tests" run_go_tests
    ;;
  js)
    run_suite "JavaScript Unit Tests" run_js_tests
    ;;
  api)
    run_suite "Live API Tests" run_api_tests
    ;;
  e2e)
    run_suite "Playwright E2E Tests" run_e2e_tests
    ;;
  all)
    run_suite "Go Tests" run_go_tests
    run_suite "JavaScript Unit Tests" run_js_tests
    run_suite "Live API Tests" run_api_tests
    run_suite "Playwright E2E Tests" run_e2e_tests
    ;;
  *)
    echo "Unknown suite: $SUITE"
    echo "Usage: $0 [go|js|api|e2e|all]"
    exit 1
    ;;
esac

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${SECTION}${RESET}"
echo -e "${BOLD}  FINAL RESULTS${RESET}"
echo -e "${BOLD}${SECTION}${RESET}"
echo "  Suites passed: ${TOTAL_PASS}"
echo "  Suites failed: ${TOTAL_FAIL}"
echo ""

if [[ "${TOTAL_FAIL}" -gt 0 ]]; then
  echo -e "${RED}${BOLD}  ✗ Some test suites FAILED${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}  ✓ All test suites PASSED${RESET}"
fi
