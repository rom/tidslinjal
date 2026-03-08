/* ============================================================
   Tidslinjal — Application State
   ============================================================ */
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
window.state = {
  user:        null,
  events:      [],
  locks:       [],
  alarms:      [],
  layers:      [],
  groups:      [],
  users:       [],
  eventTypes:  [],
  phases:      [],
  preferences: {
    theme:           'dark',
    size:            'small',
    language:        'en',
    day_start_hour:  0,
    day_end_hour:    24,
    hidden_types:    [],
    active_layers:   [],
    hidden_layers:   [],
    default_view:    'week',
    show_out_of_hours: true,
    red_line_enabled: true,
    red_line_color:  '#E74C3C',
    red_line_width:  2,
    red_line_style:  'solid',
    synth_label:     false,
  },
  resolution:    'hour',
  range:         'week',
  startDate:     startOfDay(new Date()),
  sidebarTab:    'legend',
  search:        '',
  zoomFactor:    1.0,
  exercise:      { enabled: false, epoch: '', label: '', paused: false, paused_at: '' },
  syntheticOn:   false, // user's local toggle (independent of exercise.enabled)
  timelinePaused: false, // local freeze state
  pausedAt:      null,   // Date when frozen
  // Undo stack
  undoStack:     [],     // array of {action, data} for undo
  // Filters
  filters: {
    status:        [],     // array of status strings to show (empty = all)
    responsibleId: null,   // filter by responsible user ID
    layerId:       null,   // filter by layer ID (separate from hidden_layers)
  },
  // Swimlane mode
  swimlaneMode:  false,   // toggle swimlane/resource row view
  // Timezone
  timezone:      '',       // IANA timezone string (empty = browser default)
  // Context menu state
  _ctxEventId:   null,
  _ctxSlotDay:   null,
  _ctxSlotMin:   null,
};

// ── UI state helpers ────────────────────────────────────────────────────────
let _invitedFilter = 'both'; // current invited list filter (both | users | groups)

// ── Preference state helpers ────────────────────────────────────────────────
function isTypeHidden(key) {
  return (state.preferences.hidden_types || []).includes(key);
}
function isLayerActive(id) {
  // A layer is active (visible) when it is NOT in the hidden_layers exclusion list
  return !(state.preferences.hidden_layers || []).includes(id);
}
function isLayerHidden(id) {
  return (state.preferences.hidden_layers || []).includes(id);
}
