#!/bin/bash
# Move events matching patterns to dedicated layers in Tidslinjal
# Usage: ./move-events-to-layers.sh
#
# Prerequisites: Login first to get a session cookie:
#   curl -c cookies.txt -X POST -H "Content-Type: application/json" \
#     -d '{"username":"YOUR_USER","password":"YOUR_PASS"}' \
#     https://tidslinjal.cyberladan.se/api/auth/login

BASE="https://tidslinjal.cyberladan.se"
COOKIES="cookies.txt"

if [ ! -f "$COOKIES" ]; then
  echo "ERROR: $COOKIES not found. Login first:"
  echo '  curl -c cookies.txt -X POST -H "Content-Type: application/json" \'
  echo '    -d '\''{"username":"admin","password":"YOUR_PASS"}'\'' \'
  echo "    $BASE/api/auth/login"
  exit 1
fi

api() {
  curl -s -b "$COOKIES" -H "Content-Type: application/json" "$@"
}

echo "=== Fetching existing layers ==="
LAYERS=$(api "$BASE/api/layers")
echo "$LAYERS" | python3 -m json.tool 2>/dev/null | head -30

# Create layers if they don't exist
create_layer() {
  local name="$1"
  local existing
  existing=$(echo "$LAYERS" | python3 -c "
import json,sys
layers = json.load(sys.stdin)
for l in layers:
    if l['name'] == '$name':
        print(l['id'])
        break
" 2>/dev/null)
  if [ -n "$existing" ]; then
    echo "Layer '$name' already exists with ID=$existing"
    echo "$existing"
  else
    echo "Creating layer '$name'..."
    local result
    result=$(api -X POST "$BASE/api/layers" \
      -d "{\"name\":\"$name\",\"visibility\":\"shared\",\"permission\":\"readwrite\"}")
    local id
    id=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" 2>/dev/null)
    echo "Created layer '$name' with ID=$id"
    echo "$id"
  fi
}

INJECT_LAYER_ID=$(create_layer "injects")
SITREP_LAYER_ID=$(create_layer "sitreps")
DECISION_LAYER_ID=$(create_layer "decisions")

echo ""
echo "Layer IDs: injects=$INJECT_LAYER_ID, sitreps=$SITREP_LAYER_ID, decisions=$DECISION_LAYER_ID"
echo ""

# Fetch all events
echo "=== Fetching events ==="
EVENTS=$(api "$BASE/api/events")

# Move events matching patterns
echo "=== Moving events ==="
echo "$EVENTS" | python3 -c "
import json, sys, subprocess

events = json.load(sys.stdin)
inject_id = int('${INJECT_LAYER_ID}') if '${INJECT_LAYER_ID}'.isdigit() else 0
sitrep_id = int('${SITREP_LAYER_ID}') if '${SITREP_LAYER_ID}'.isdigit() else 0
decision_id = int('${DECISION_LAYER_ID}') if '${DECISION_LAYER_ID}'.isdigit() else 0

moves = []
for ev in events:
    title = ev.get('title', '')
    eid = ev['id']
    current_layer = ev.get('layer_id')

    target = None
    target_name = None
    if 'INJECT:' in title or 'INJECT :' in title:
        target = inject_id
        target_name = 'injects'
    elif 'SITREP' in title.upper():
        target = sitrep_id
        target_name = 'sitreps'
    elif 'Decision:' in title or 'DECISION:' in title:
        target = decision_id
        target_name = 'decisions'

    if target and target != current_layer:
        moves.append((eid, title, target, target_name))

print(f'Found {len(moves)} events to move')
for eid, title, target, tname in moves:
    print(f'  -> [{tname}] {title[:60]}')

# Output move commands
for eid, title, target, tname in moves:
    print(f'MOVE:{eid}:{target}:{title[:80]}')
" 2>/dev/null | while IFS= read -r line; do
  if [[ "$line" == MOVE:* ]]; then
    IFS=':' read -r _ eid target_id title <<< "$line"
    echo "Moving event $eid to layer $target_id: $title"

    # Fetch the full event first
    full_event=$(api "$BASE/api/events/$eid")

    # Update layer_id
    updated=$(echo "$full_event" | python3 -c "
import json, sys
ev = json.load(sys.stdin)
ev['layer_id'] = int($target_id)
print(json.dumps(ev))
" 2>/dev/null)

    result=$(api -X PUT "$BASE/api/events/$eid" -d "$updated")
    echo "  Done: $(echo "$result" | python3 -c "import json,sys; e=json.load(sys.stdin); print(f'id={e.get(\"id\")}, layer_id={e.get(\"layer_id\")}')" 2>/dev/null)"
  else
    echo "$line"
  fi
done

echo ""
echo "=== Complete ==="
