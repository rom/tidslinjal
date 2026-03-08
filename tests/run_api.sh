#!/usr/bin/env bash
# tests/run_api.sh — Live API smoke tests against a running Tidslinjal server.
# Builds the binary, starts the server, runs tests, then cleans up.

set -euo pipefail
cd "$(dirname "$0")/.."

# ── Config ────────────────────────────────────────────────────────────────────
PORT=18080
BASE="http://localhost:${PORT}"
DATA_DIR="$(mktemp -d /tmp/tidslinjal-test-XXXXXX)"
SERVER_PID=""
PASS=0
FAIL=0

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${DATA_DIR}"
}
trap cleanup EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────
PASS_CHAR="✓"
FAIL_CHAR="✗"

ok() {
  PASS=$((PASS+1))
  echo "  ${PASS_CHAR} $1"
}

fail() {
  FAIL=$((FAIL+1))
  echo "  ${FAIL_CHAR} $1"
  [[ -n "${2:-}" ]] && echo "    → $2"
}

assert_status() {
  local name="$1" expected="$2" actual="$3"
  # Allow 200 or 201 when expected is 200 (server uses 201 for creation)
  if [[ "$actual" == "$expected" ]] || [[ "$expected" == "200" && "$actual" == "201" ]]; then
    ok "$name"
  else
    fail "$name" "expected HTTP $expected, got $actual"
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    ok "$name"
  else
    fail "$name" "expected to find '${needle}' in response"
  fi
}

assert_not_contains() {
  local name="$1" needle="$2" haystack="$3"
  if ! echo "$haystack" | grep -q "$needle"; then
    ok "$name"
  else
    fail "$name" "'${needle}' should NOT be in response"
  fi
}

# api_call METHOD PATH [BODY] — returns "STATUS|BODY"
api_call() {
  local method="$1" path="$2" body="${3:-}"
  local curl_args=(-s -w "\n%{http_code}" -X "$method" -H "Accept: application/json")
  [[ -n "$body" ]] && curl_args+=(-H "Content-Type: application/json" -d "$body")
  [[ -n "${COOKIE_FILE:-}" ]] && curl_args+=(--cookie-jar "${COOKIE_FILE}" --cookie "${COOKIE_FILE}")
  local response
  response=$(curl "${curl_args[@]}" "${BASE}${path}")
  local status="${response##*$'\n'}"
  local body="${response%$'\n'*}"
  echo "${status}|${body}"
}

# login sets COOKIE_FILE (global) and LOGIN_STATUS
do_login() {
  local user="${1:-admin}" pass="${2:-admin}"
  COOKIE_FILE=$(mktemp /tmp/tidslinjal-cookies-XXXXXX)
  LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "{\"username\":\"${user}\",\"password\":\"${pass}\"}" \
    --cookie-jar "${COOKIE_FILE}" \
    "${BASE}/api/auth/login")
}

# ── Build ─────────────────────────────────────────────────────────────────────
echo "Building tidslinjal..."
go build -o /tmp/tidslinjal-test-bin . 2>&1

# ── Start server ──────────────────────────────────────────────────────────────
echo "Starting server (port ${PORT}, data=${DATA_DIR})..."
/tmp/tidslinjal-test-bin --port "${PORT}" --data "${DATA_DIR}" &
SERVER_PID=$!

# Wait for server to be ready (up to 10s)
for i in $(seq 1 20); do
  if curl -sf "${BASE}/api/version" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
echo "Server ready."
echo ""

# ── Test Suite ────────────────────────────────────────────────────────────────

echo "=== Version ==="
result=$(api_call GET /api/version)
status="${result%%|*}" body="${result#*|}"
assert_status "GET /api/version → 200" "200" "$status"
assert_contains "version field present" '"version"' "$body"
assert_contains "correct version" "3.5.0" "$body"

echo ""
echo "=== Authentication ==="

# Unauthenticated access
result=$(api_call GET /api/auth/me)
assert_status "GET /api/auth/me without auth → 401" "401" "${result%%|*}"

result=$(api_call GET /api/events)
assert_status "GET /api/events without auth → 401" "401" "${result%%|*}"

# Bad login
result=$(api_call POST /api/auth/login '{"username":"admin","password":"wrong"}')
assert_status "Login with wrong password → 401" "401" "${result%%|*}"

# Unknown user
result=$(api_call POST /api/auth/login '{"username":"nobody","password":"x"}')
assert_status "Login unknown user → 401" "401" "${result%%|*}"

# Good login (do_login sets COOKIE_FILE and LOGIN_STATUS globals)
do_login admin admin
assert_status "Login admin/admin → 200" "200" "$LOGIN_STATUS"
assert_not_contains "Login response omits password_hash" "password_hash" "$(api_call GET /api/auth/me | cut -d'|' -f2)"

# Me endpoint
result=$(api_call GET /api/auth/me)
assert_status "GET /api/auth/me (authenticated) → 200" "200" "${result%%|*}"
assert_contains "me response has username" '"admin"' "${result#*|}"

echo ""
echo "=== Users ==="

result=$(api_call GET /api/users)
assert_status "GET /api/users → 200" "200" "${result%%|*}"
assert_contains "users list has admin" '"admin"' "${result#*|}"
assert_not_contains "users list omits password_hash" '"password_hash"' "${result#*|}"

# Create user
result=$(api_call POST /api/users '{"username":"apitest","password":"pass123","display_name":"API Test","role":"read"}')
assert_status "POST /api/users (admin) → 200" "200" "${result%%|*}"
assert_contains "created user username" '"apitest"' "${result#*|}"
API_USER_ID=$(echo "${result#*|}" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['id']))" 2>/dev/null || echo "0")

# Update user
if [[ "$API_USER_ID" != "0" ]]; then
  result=$(api_call PUT "/api/users/${API_USER_ID}" '{"username":"apitest","display_name":"API Test Updated","role":"readwrite"}')
  assert_status "PUT /api/users/:id → 200" "200" "${result%%|*}"
fi

echo ""
echo "=== Event Types ==="

result=$(api_call GET /api/event-types)
assert_status "GET /api/event-types → 200" "200" "${result%%|*}"
assert_contains "event types has 'event'" '"event"' "${result#*|}"
assert_contains "event types has 'mote'" '"mote"' "${result#*|}"
assert_contains "event types has 'decision'" '"decision"' "${result#*|}"

echo ""
echo "=== Events ==="

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
END=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")
EVENT_BODY="{\"title\":\"API Test Event\",\"event_type\":\"event\",\"status\":\"planned\",\"start_time\":\"${NOW}\",\"end_time\":\"${END}\"}"

result=$(api_call POST /api/events "$EVENT_BODY")
assert_status "POST /api/events → 200" "200" "${result%%|*}"
assert_contains "created event title" '"API Test Event"' "${result#*|}"
EVENT_ID=$(echo "${result#*|}" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['id']))" 2>/dev/null || echo "0")

# GET events
FROM=$(date -u -d "-1 minute" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1M +"%Y-%m-%dT%H:%M:%SZ")
TO=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")
result=$(api_call GET "/api/events?from=${FROM}&to=${TO}")
assert_status "GET /api/events?from=&to= → 200" "200" "${result%%|*}"
assert_contains "events list includes created event" '"API Test Event"' "${result#*|}"

# Update event
if [[ "$EVENT_ID" != "0" ]]; then
  UPDATE_BODY="{\"title\":\"Updated API Event\",\"event_type\":\"event\",\"status\":\"active\",\"start_time\":\"${NOW}\",\"end_time\":\"${END}\"}"
  result=$(api_call PUT "/api/events/${EVENT_ID}" "$UPDATE_BODY")
  assert_status "PUT /api/events/:id → 200" "200" "${result%%|*}"
  assert_contains "updated event title" '"Updated API Event"' "${result#*|}"

  # PATCH status
  result=$(api_call PATCH "/api/events/${EVENT_ID}/status" '{"status":"active"}')
  assert_status "PATCH /api/events/:id/status → 200" "200" "${result%%|*}"

  # Comments
  result=$(api_call POST "/api/events/${EVENT_ID}/comments" '{"content":"Test comment from API"}')
  assert_status "POST /api/events/:id/comments → 200" "200" "${result%%|*}"
  assert_contains "comment content" '"Test comment from API"' "${result#*|}"

  result=$(api_call GET "/api/events/${EVENT_ID}/comments")
  assert_status "GET /api/events/:id/comments → 200" "200" "${result%%|*}"
  assert_contains "comments list" '"Test comment from API"' "${result#*|}"

  # Alarms
  result=$(api_call POST /api/alarms "{\"event_id\":${EVENT_ID},\"lead_time\":15}")
  assert_status "POST /api/alarms → 200" "200" "${result%%|*}"
  ALARM_ID=$(echo "${result#*|}" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['id']))" 2>/dev/null || echo "0")

  result=$(api_call GET /api/alarms)
  assert_status "GET /api/alarms → 200" "200" "${result%%|*}"

  # Delete event
  result=$(api_call DELETE "/api/events/${EVENT_ID}")
  assert_status "DELETE /api/events/:id → 200" "200" "${result%%|*}"
fi

echo ""
echo "=== Layers ==="

result=$(api_call POST /api/layers '{"name":"Test Layer","color":"#FF0000","visibility":"private"}')
assert_status "POST /api/layers → 200" "200" "${result%%|*}"
assert_contains "layer name" '"Test Layer"' "${result#*|}"
LAYER_ID=$(echo "${result#*|}" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['id']))" 2>/dev/null || echo "0")

result=$(api_call GET /api/layers)
assert_status "GET /api/layers → 200" "200" "${result%%|*}"
assert_contains "layers list has created layer" '"Test Layer"' "${result#*|}"

echo ""
echo "=== Groups ==="

result=$(api_call POST /api/groups '{"name":"Test Group","description":"Test group for API"}')
assert_status "POST /api/groups → 200" "200" "${result%%|*}"
assert_contains "group name" '"Test Group"' "${result#*|}"

result=$(api_call GET /api/groups)
assert_status "GET /api/groups → 200" "200" "${result%%|*}"
assert_contains "groups list" '"Test Group"' "${result#*|}"

echo ""
echo "=== Preferences ==="

result=$(api_call GET /api/preferences)
assert_status "GET /api/preferences → 200" "200" "${result%%|*}"
assert_contains "preferences has theme" '"theme"' "${result#*|}"
assert_contains "preferences has language" '"language"' "${result#*|}"

result=$(api_call PUT /api/preferences '{"theme":"light","language":"sv","size":"large","day_start_hour":6,"day_end_hour":22}')
assert_status "PUT /api/preferences → 200" "200" "${result%%|*}"

result=$(api_call GET /api/preferences)
assert_contains "preferences updated theme" '"light"' "${result#*|}"
assert_contains "preferences updated language" '"sv"' "${result#*|}"

echo ""
echo "=== Exercise ==="

result=$(api_call GET /api/exercise)
assert_status "GET /api/exercise → 200" "200" "${result%%|*}"
assert_contains "exercise has enabled field" '"enabled"' "${result#*|}"

echo ""
echo "=== Export ==="

result=$(api_call GET /api/export)
assert_status "GET /api/export → 200" "200" "${result%%|*}"
assert_contains "export has events" '"events"' "${result#*|}"
assert_contains "export has users" '"users"' "${result#*|}"
assert_contains "export has layers" '"layers"' "${result#*|}"

echo ""
echo "=== Audit ==="

result=$(api_call GET /api/audit)
assert_status "GET /api/audit (admin) → 200" "200" "${result%%|*}"

echo ""
echo "=== Phases ==="

PHASE_START=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PHASE_END=$(date -u -d "+4 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+4H +"%Y-%m-%dT%H:%M:%SZ")
result=$(api_call POST /api/phases "{\"name\":\"Phase Alpha\",\"color\":\"#FF0000\",\"start_time\":\"${PHASE_START}\",\"end_time\":\"${PHASE_END}\",\"order\":0}")
assert_status "POST /api/phases → 200" "200" "${result%%|*}"
assert_contains "phase name" '"Phase Alpha"' "${result#*|}"

result=$(api_call GET /api/phases)
assert_status "GET /api/phases → 200" "200" "${result%%|*}"

echo ""
echo "=== Logout ==="

result=$(api_call POST /api/auth/logout)
assert_status "POST /api/auth/logout → 200" "200" "${result%%|*}"

# After logout, auth-required endpoints should fail
result=$(api_call GET /api/auth/me)
assert_status "GET /api/auth/me after logout → 401" "401" "${result%%|*}"

echo ""
echo "=== Method enforcement ==="
# GET on a POST-only sub-path
result=$(api_call DELETE /api/event-types)
assert_status "DELETE /api/event-types → 405" "405" "${result%%|*}"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "$(printf '─%.0s' {1..60})"
echo "Tests: $((PASS+FAIL)) | Passed: ${PASS} | Failed: ${FAIL}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
