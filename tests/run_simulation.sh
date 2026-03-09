#!/usr/bin/env bash
# tests/run_simulation.sh — Easy launcher for the long-running simulation test framework.
#
# Usage:
#   ./tests/run_simulation.sh              # 2-day run, 5 users
#   ./tests/run_simulation.sh --days 4     # 4-day run
#   ./tests/run_simulation.sh --days 10 --users 8  # 10-day run, 8 users
#   ./tests/run_simulation.sh --help
#
# The simulation will:
#   • Build the tidslinjal binary if it doesn't exist
#   • Start an isolated server instance on a test port
#   • Run N virtual users performing random realistic operations continuously
#   • Log every event (actions, errors, crashes, restarts) to a JSON file
#   • Print an hourly checkpoint and a final summary
#
# If the server crashes, it is automatically restarted and the crash is logged.
# Use --no-restart to disable auto-restart.

set -euo pipefail
cd "$(dirname "$0")/.."

# ── Defaults ──────────────────────────────────────────────────────────────────
DAYS=2
USERS=5
PORT=19090
VERBOSE=""
NO_RESTART=""
LOG_FILE=""

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --days|-d)     DAYS="$2";      shift 2 ;;
    --users|-u)    USERS="$2";     shift 2 ;;
    --port|-p)     PORT="$2";      shift 2 ;;
    --log|-l)      LOG_FILE="$2";  shift 2 ;;
    --verbose|-v)  VERBOSE="--verbose"; shift ;;
    --no-restart)  NO_RESTART="--no-restart"; shift ;;
    --help|-h)
      sed -n '2,30p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Derived values ────────────────────────────────────────────────────────────
DURATION="${DAYS}d"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="${LOG_FILE:-simulation-${TIMESTAMP}.log.json}"
BINARY="./tidslinjal"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Tidslinjal Long-Running Simulation Test          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Duration : ${DAYS} day(s)"
echo "  Users    : ${USERS} concurrent virtual users"
echo "  Port     : ${PORT}"
echo "  Log file : ${LOG_FILE}"
echo "  Binary   : ${BINARY}"
echo ""
echo "Press Ctrl+C to stop early — a summary will still be printed."
echo ""

# ── Build binary if needed ────────────────────────────────────────────────────
if [[ ! -f "${BINARY}" ]]; then
  echo "Building tidslinjal binary…"
  go build -o "${BINARY}" .
fi

# ── Run simulation ────────────────────────────────────────────────────────────
go run ./tests/simulation \
  --duration "${DURATION}" \
  --users    "${USERS}" \
  --port     "${PORT}" \
  --binary   "${BINARY}" \
  --log      "${LOG_FILE}" \
  ${VERBOSE} \
  ${NO_RESTART}

echo ""
echo "Log file saved to: ${LOG_FILE}"
echo ""
echo "To view a summary of errors:"
echo "  jq 'select(.kind==\"error\" or .kind==\"crash\")' ${LOG_FILE}"
echo ""
echo "To view the final summary:"
echo "  jq 'select(.kind==\"summary\")' ${LOG_FILE}"
