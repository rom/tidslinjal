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
  dayLabels:   [],
  preferences: {
    theme:           'light',
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
    red_line_width:  5,
    red_line_style:  'dashed',
    synth_label:     false,
    // v6.1.0
    time_format:         '24h',
    high_contrast:       true,
    color_blind_mode:    'off',
    default_landing_view:'grid',
    auto_follow_now:     false,
    default_range:       'week',
    default_resolution:  'hour',
    week_start_day:      'monday',
    tooltip_delay:       0,
    confirm_drag_move:   false,
    link_event_times:    false,
    default_event_type:  '',
    workspace_presets_enabled: false,
    workspace_presets:   [],
    welcome_url:         '',
    help_url:            '',
    training_url:        '',
    demo_url:            '',
    time_separator:      'colon',
    show_lang_flags:     true,
    country_code_format: 'alpha2',
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
  // Multi-select
  selectedEventIds: [],
  // Role configs (loaded from /api/roles)
  roleConfigs:   [],
  // Saved filter presets
  filterPresets: [],
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

// ── Color-blind safe color remapping for event types ────────────────────────
const _cbColorMap = {
  protanopia: {
    '#C0392B': '#D55E00', '#E74C3C': '#D55E00',
    '#27AE60': '#009E73', '#2ECC71': '#009E73',
    '#F39C12': '#E69F00', '#E67E22': '#E69F00',
    '#4A90D9': '#0072B2',
    '#9B59B6': '#CC79A7',
    '#1ABC9C': '#56B4E9', '#00ACC1': '#56B4E9',
    '#D35400': '#D55E00',
    '#95A5A6': '#95A5A6', '#7F8C8D': '#7F8C8D',
  },
  tritanopia: {
    '#C0392B': '#E74C3C', '#E74C3C': '#E74C3C',
    '#27AE60': '#2ECC71', '#2ECC71': '#2ECC71',
    '#F39C12': '#D55E00', '#E67E22': '#D55E00',
    '#4A90D9': '#CC79A7',
    '#9B59B6': '#009E73',
    '#1ABC9C': '#E69F00', '#00ACC1': '#E69F00',
    '#D35400': '#D55E00',
    '#95A5A6': '#95A5A6', '#7F8C8D': '#7F8C8D',
  }
};
_cbColorMap.deuteranopia = _cbColorMap.protanopia;

function cbSafeColor(color) {
  const mode = (state.preferences || {}).color_blind_mode || 'off';
  if (mode === 'off' || !color) return color;
  const map = _cbColorMap[mode];
  if (!map) return color;
  const upper = color.toUpperCase();
  for (const [from, to] of Object.entries(map)) {
    if (upper === from.toUpperCase()) return to;
  }
  return color;
}
