/* ── Key Terrain Board ──────────────────────────────────────────────────── */
'use strict';

let _ktState = {
  entries: [],
  access: { can_write: false },
  editingId: null,
  showArchived: false,    // show archived entries
  filter: {},             // active filters
  settings: {},           // persisted settings from server
  columnSort: null,       // {col:'priority', dir:'asc'} for per-column sorting
  columnOrder: ['seq_num','zone','priority','rounds','function','status','trend','threat','external','responsible','owner','actions','comments','created_at','updated_at','finished_at','management'],
  hiddenColumns: { created_at: true, updated_at: true, finished_at: true, rounds: true, owner: true }, // hidden by default
  // Per-browser zoom level for the board — persists in localStorage so
  // each operator can size the board to their screen without polluting
  // the shared KeyTerrainSettings. Valid levels: xs, sm, md, lg, xl.
  zoom: (() => { try { return localStorage.getItem('ktZoom') || 'md'; } catch { return 'md'; } })(),
};

const _ktZoomLevels = ['xxs','xs','sm','md','lg','xl','xxl','xxxl'];

function _ktSetZoom(level) {
  if (!_ktZoomLevels.includes(level)) return;
  _ktState.zoom = level;
  try { localStorage.setItem('ktZoom', level); } catch {}
  const root = document.getElementById('ktBoardContent');
  if (root) root.setAttribute('data-kt-zoom', level);
}
function _ktZoomIn() {
  const i = _ktZoomLevels.indexOf(_ktState.zoom);
  if (i < _ktZoomLevels.length - 1) _ktSetZoom(_ktZoomLevels[i+1]);
}
function _ktZoomOut() {
  const i = _ktZoomLevels.indexOf(_ktState.zoom);
  if (i > 0) _ktSetZoom(_ktZoomLevels[i-1]);
}
function _ktZoomReset() { _ktSetZoom('md'); }

const _ktStatusOptions = [
  { value: 'working',  label: 'Working',  icon: '🟢', color: 'rgba(39,174,96,0.15)' },
  { value: 'degraded', label: 'Degraded', icon: '🟡', color: 'rgba(241,196,15,0.15)' },
  { value: 'down',     label: 'Down',     icon: '🔴', color: 'rgba(231,76,60,0.15)' },
  { value: 'unknown',  label: 'Unknown',  icon: '⚪', color: 'rgba(150,150,150,0.1)' },
];

const _ktTrendOptions = [
  { value: 'improving', label: 'Improving', icon: '📈' },
  { value: 'stable',    label: 'Stable',    icon: '➡️' },
  { value: 'worsening', label: 'Worsening', icon: '📉' },
];

// Prevent keyboard events inside a modal from leaking to the parent app
function _ktTrapModalKeys(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  const stop = (e) => e.stopPropagation();
  el.addEventListener('keydown', stop);
  el.addEventListener('keyup', stop);
  el.addEventListener('keypress', stop);
}

async function _ktApi(method, path, body) {
  const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const opts = { method, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' } };
  if (csrf) opts.headers['X-CSRF-Token'] = csrf[1];
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return res.json();
}

async function openKeyTerrainBoard() {
  try {
    const [entries, access, settings, attachments] = await Promise.all([
      _ktApi('GET', '/key-terrain'),
      _ktApi('GET', '/key-terrain/access'),
      _ktApi('GET', '/key-terrain/settings').catch(() => ({})),
      _ktApi('GET', '/key-terrain-attachments').catch(() => []),
    ]);
    _ktState.entries = entries;
    _ktState.access = access;
    _ktState.settings = settings || {};
    _ktState.attachments = Array.isArray(attachments) ? attachments : [];
  } catch (e) {
    _ktState.entries = [];
    _ktState.access = { can_write: false };
    _ktState.attachments = [];
  }
  _renderKeyTerrainBoard();
  _ktSubscribeSSE();
  // Start the live battle rhythm ticker if the function is defined
  // (it's defined later in this same file so it's always available here).
  if (typeof _ktBrStartTicker === 'function') _ktBrStartTicker();
  _ktRenderBoardAttachments();
}

// ── SSE auto-refresh ──────────────────────────────────────────────────────
let _ktSSEBound = false;
function _ktSubscribeSSE() {
  if (_ktSSEBound) return;
  _ktSSEBound = true;
  // Listen for key_terrain_change events from the SSE notification stream.
  // The app's SSE handler dispatches custom events on document.
  if (typeof EventSource !== 'undefined') {
    // The main app stores the EventSource — hook into it via a document-level custom event
    document.addEventListener('sse:key_terrain_change', _ktHandleSSE);
  }
}

let _ktSSETimer = null;
function _ktHandleSSE(ev) {
  // Branch on the action type in the SSE payload. Battle rhythm control
  // actions (start, pause, resume, reset, backward, forward,
  // fast_forward) only affect the clock widget — a full board re-render
  // is unnecessary and visibly wipes the table (the "flash" bug). For
  // those events we just poll the battle rhythm state and let the
  // ticker redraw the widget in place.
  const action = (ev && ev.detail && ev.detail.action) || '';
  if (action && action.indexOf('battle_rhythm_') === 0) {
    if (typeof _ktBrPoll === 'function') _ktBrPoll();
    return;
  }
  // Board-level attachment add/remove: just refetch the list; the entry
  // table and battle-rhythm widget are not affected.
  if (action === 'attachment_added' || action === 'attachment_removed') {
    if (typeof _ktLoadBoardAttachments === 'function') _ktLoadBoardAttachments();
    return;
  }
  // While in wayback mode any live entry refresh would overwrite the
  // historical snapshot the operator is viewing. Skip the refresh; when
  // they exit wayback the board re-renders from the stashed live state.
  if (_ktState._waybackInfo) return;
  // Cycle rollover: the Rounds field on every entry has been bumped on
  // the server, so we do need to refresh entries — but we can skip the
  // settings fetch because the only setting that changed is
  // LastCycleIdx, which the widget doesn't care about between ticks.
  if (action === 'cycle_rollover') {
    if (_ktSSETimer) return;
    _ktSSETimer = setTimeout(async () => {
      _ktSSETimer = null;
      try {
        _ktState.entries = await _ktApi('GET', '/key-terrain');
        _renderKeyTerrainBoard();
        if (typeof _ktBrPoll === 'function') _ktBrPoll();
      } catch {}
    }, 200);
    return;
  }
  // Everything else (entry_created, entry_updated, entry_deleted,
  // settings_updated) goes through the full refresh. Debounced so
  // bursty changes don't cause multiple re-renders within a second.
  if (_ktSSETimer) return;
  _ktSSETimer = setTimeout(async () => {
    _ktSSETimer = null;
    try {
      const [entries, settings] = await Promise.all([
        _ktApi('GET', '/key-terrain'),
        _ktApi('GET', '/key-terrain/settings').catch(() => ({})),
      ]);
      _ktState.entries = entries;
      _ktState.settings = settings || {};
      _renderKeyTerrainBoard();
    } catch { /* ignore refresh failures */ }
  }, 500);
}

// ── Settings helpers ──
function _ktGetStatusIcon(value) {
  const override = (_ktState.settings.status_icons || {})[value];
  if (override) return override;
  const opt = _ktStatusOptions.find(s => s.value === value);
  return opt ? opt.icon : '\u26AA';
}
function _ktGetTrendIcon(value) {
  const override = (_ktState.settings.trend_icons || {})[value];
  if (override) return override;
  const opt = _ktTrendOptions.find(tr => tr.value === value);
  return opt ? opt.icon : '\u27A1\uFE0F';
}
function _ktGetPriorityColor(pri) {
  const colors = _ktState.settings.priority_colors || {};
  return colors[String(pri)] || '';
}
function _ktGhostStyle() {
  return _ktState.settings.ghost_style || 'grey';
}
// _ktColLabel returns the display label for a column, preferring a
// teamlead-configured override from settings.column_labels, then the
// localized default from the i18n dictionary, then a hardcoded fallback.
function _ktColLabel(col, fallback) {
  const overrides = _ktState.settings.column_labels || {};
  if (overrides[col]) return overrides[col];
  const key = 'kt_' + col;
  const tr = t(key);
  if (tr && tr !== key) return tr;
  return fallback || col;
}
function _ktSortEntries(entries) {
  // Column sort (from clicking headers) takes precedence over settings sort
  const cs = _ktState.columnSort;
  const sortBy = cs ? cs.col : (_ktState.settings.sort_by || 'priority');
  const dir = cs ? (cs.dir === 'desc' ? -1 : 1) : 1;
  const sorted = [...entries];
  const cmp = (a, b) => {
    switch (sortBy) {
      case 'function': return (a.function || '').localeCompare(b.function || '');
      case 'status': {
        const order = { working: 0, degraded: 1, down: 2, unknown: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      }
      case 'trend': {
        const order = { worsening: 0, stable: 1, improving: 2 };
        return (order[a.trend] ?? 9) - (order[b.trend] ?? 9);
      }
      case 'threat': return (a.threat || '').localeCompare(b.threat || '');
      case 'external': return (a.external || '').localeCompare(b.external || '');
      case 'responsible': return (a.responsible_name || '').localeCompare(b.responsible_name || '');
      case 'owner': return (a.owner_name || '').localeCompare(b.owner_name || '');
      case 'actions': return (a.actions || '').localeCompare(b.actions || '');
      case 'comments': return (a.comments || '').localeCompare(b.comments || '');
      case 'zone': return (a.zone || '').localeCompare(b.zone || '');
      case 'seq_num': return (a.seq_num || 0) - (b.seq_num || 0);
      case 'entry_order': return a.id - b.id;
      default: return (a.priority || 999) - (b.priority || 999);
    }
  };
  sorted.sort((a, b) => cmp(a, b) * dir);
  return sorted;
}
function _ktSortByColumn(col) {
  const cs = _ktState.columnSort;
  if (cs && cs.col === col) {
    // Toggle direction, or clear on third click
    if (cs.dir === 'asc') _ktState.columnSort = { col, dir: 'desc' };
    else _ktState.columnSort = null; // clear
  } else {
    _ktState.columnSort = { col, dir: 'asc' };
  }
  _renderKeyTerrainBoard();
}

function _renderKeyTerrainBoard() {
  const allEntries = _ktState.entries;
  // Wayback mode: operators are viewing a frozen historical snapshot of
  // the board. Every edit affordance must be suppressed so the read-only
  // guarantee holds; the "Return to live" banner gets them back to the
  // current state.
  const waybackMode = !!_ktState._waybackInfo;
  const canWrite = waybackMode ? false : _ktState.access.can_write;
  const hidden = _ktState.hiddenColumns || {};
  const ghostStyle = _ktGhostStyle();
  const f = _ktState.filter || {};
  const hasFilter = Object.values(f).some(v => Array.isArray(v) ? v.length > 0 : !!v);

  // Merge settings hidden columns with local hidden columns
  const settingsHidden = _ktState.settings.hidden_columns || {};
  for (const [col, val] of Object.entries(settingsHidden)) {
    if (val && !(col in hidden)) hidden[col] = true;
  }

  // Show/hide entries without priority (settings: show_no_priority, default true)
  const showNoPriority = _ktState.settings.show_no_priority !== false;

  // Separate active vs archived; hide ghosted if ghost_style === 'remove'
  const activeEntries = allEntries.filter(e => {
    if (e.archived) return false;
    if (e.ghosted && ghostStyle === 'remove') return false;
    if (!showNoPriority && (!e.priority || e.priority === 0)) return false;
    return true;
  });
  const archivedEntries = allEntries.filter(e => e.archived);

  // Filter active entries
  let filtered = [...activeEntries];
  if (hasFilter) {
    const q = (v) => (v || '').trim().toLowerCase();
    filtered = filtered.filter(e => {
      if (f.function && !q(e.function).includes(q(f.function))) return false;
      if (f.functionChecks && f.functionChecks.length > 0) {
        // Case- and whitespace-insensitive match so a function name with
        // trailing whitespace or differing capitalisation still hits the
        // checkbox the operator picked.
        const target = q(e.function);
        const hit = f.functionChecks.some(c => q(c) === target);
        if (!hit) return false;
      }
      if (f.priority && e.priority !== parseInt(f.priority)) return false;
      if (f.priorityChecks && f.priorityChecks.length > 0 && !f.priorityChecks.includes(e.priority)) return false;
      if (f.statusChecks && f.statusChecks.length > 0) {
        if (!f.statusChecks.includes(e.status)) return false;
      } else if (f.status && e.status !== f.status) return false;
      if (f.trendChecks && f.trendChecks.length > 0) {
        if (!f.trendChecks.includes(e.trend)) return false;
      } else if (f.trend && e.trend !== f.trend) return false;
      if (f.threat && !q(e.threat).includes(q(f.threat))) return false;
      if (f.responsible && !q(e.responsible_name).includes(q(f.responsible))) return false;
      if (f.actions && !q(e.actions).includes(q(f.actions))) return false;
      if (f.comments && !q(e.comments).includes(q(f.comments))) return false;
      if (f.zone && !q(e.zone).includes(q(f.zone))) return false;
      return true;
    });
  }

  // Sort using settings, then reorder so each root-cause entry is
  // immediately followed by its consequences (entries whose parent_id
  // points at it). Consequences are rendered with an "indent level"
  // marker — e.indent — attached on a non-persisted property so the
  // row renderer knows how far to tab them in. Orphan children
  // (parent_id references an entry not in the filtered set — archived,
  // filtered out, or deleted) render as standalone rows at the normal
  // indent level so they don't silently disappear.
  const sortedFlat = _ktSortEntries(filtered);
  const byID = new Map(sortedFlat.map(e => [e.id, e]));
  const childrenOf = new Map();
  for (const e of sortedFlat) {
    const pid = e.parent_id || 0;
    if (pid && byID.has(pid)) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(e);
    }
  }
  const sorted = [];
  const pushed = new Set();
  const pushWithKids = (e, indent) => {
    if (pushed.has(e.id)) return;
    pushed.add(e.id);
    sorted.push({ ...e, _indent: indent });
    const kids = childrenOf.get(e.id) || [];
    for (const k of kids) pushWithKids(k, indent + 1);
  };
  for (const e of sortedFlat) {
    const pid = e.parent_id || 0;
    // Start a cluster only from roots (no parent, or parent not in this view).
    if (!pid || !byID.has(pid)) pushWithKids(e, 0);
  }
  // Safety net: anything still unvisited (shouldn't happen — a cycle would
  // trigger this) is appended at the end as a standalone row.
  for (const e of sortedFlat) if (!pushed.has(e.id)) sorted.push({ ...e, _indent: 0 });

  const cols = _ktState.columnOrder.filter(c => !hidden[c] && (c !== 'management' || canWrite));
  const hasHidden = Object.values(hidden).some(v => v);
  const totalCols = cols.length;

  // Custom status labels from settings
  const _statusLabels = _ktState.settings.status_labels || {};

  // Column definitions. Labels flow through _ktColLabel so teamlead+ users
  // can override any header text via the Settings → Column Labels panel.
  const colDef = {
    seq_num:     { icon: '#', label: _ktColLabel('seq_num', 'Seq'), align: 'center', extra: 'white-space:nowrap;width:40px' },
    zone:        { icon: '\u{1F310}', label: _ktColLabel('zone', 'Zone'), align: 'left', extra: 'min-width:80px' },
    priority:    { icon: '\u26A1', label: _ktColLabel('priority', 'Pri'), align: 'left', extra: 'white-space:nowrap' },
    function:    { icon: '\u{1F3AF}', label: _ktColLabel('function', 'Function'), align: 'left', extra: 'min-width:140px' },
    status:      { icon: '\u{1F4CA}', label: _ktColLabel('status', 'Status'), align: 'center', extra: '' },
    trend:       { icon: '\u{1F4C8}', label: _ktColLabel('trend', 'Trend'), align: 'center', extra: '' },
    threat:      { icon: '\u2694\uFE0F', label: _ktColLabel('threat', 'Threat'), align: 'left', extra: 'min-width:120px' },
    external:    { icon: '\u{1F517}', label: _ktColLabel('external', 'External'), align: 'left', extra: 'min-width:120px' },
    responsible: { icon: '\u{1F464}', label: _ktColLabel('responsible', 'Responsible'), align: 'left', extra: 'min-width:100px' },
    owner:       { icon: '\u{1F451}', label: _ktColLabel('owner', 'Owner'), align: 'left', extra: 'min-width:100px' },
    actions:     { icon: '\u{1F527}', label: _ktColLabel('actions', 'Actions'), align: 'left', extra: 'min-width:140px' },
    comments:    { icon: '\u{1F4AC}', label: _ktColLabel('comments', 'Comments'), align: 'left', extra: 'min-width:150px' },
    created_at:  { icon: '\u{1F4C5}', label: _ktColLabel('created_at', 'Created'), align: 'center', extra: 'white-space:nowrap;background:var(--bg2)' },
    updated_at:  { icon: '\u{1F504}', label: _ktColLabel('updated_at', 'Updated'), align: 'center', extra: 'white-space:nowrap;background:var(--bg2)' },
    finished_at: { icon: '\u2705', label: _ktColLabel('finished_at', 'Finished'), align: 'center', extra: 'white-space:nowrap;background:var(--bg2)' },
    rounds:      { icon: '\u{1F504}', label: _ktColLabel('rounds', '# Cycles'), align: 'center', extra: 'white-space:nowrap' },
    management:  { icon: '\u2699', label: _ktColLabel('management', 'Management'), align: 'center', extra: 'width:160px' },
  };

  let html = `<div style="width:100%;max-width:none;margin:0 auto" id="ktBoardContent" data-kt-zoom="${escHtml(_ktState.zoom)}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;padding-right:44px" class="kt-no-print">
      <h2 style="margin:0">\u{1F3D4}\uFE0F ${t('kt_title')||'Key Terrain Board'}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${!canWrite ? `<span style="font-size:var(--fs-xs);color:var(--text-dim);background:var(--bg3);padding:2px 8px;border-radius:var(--radius)">\u{1F512} ${t('kt_read_only')||'Read Only'}</span>` : ''}
        <div class="kt-zoom-group" role="group" aria-label="Zoom" style="display:inline-flex;gap:0;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
          <button class="btn btn-sm btn-secondary" style="border-radius:0;border:none" data-action="_ktZoomOut" title="${t('kt_zoom_out')||'Smaller text'}">A\u2013</button>
          <button class="btn btn-sm btn-secondary" style="border-radius:0;border:none;border-left:1px solid var(--border);font-size:10px;min-width:26px" data-action="_ktZoomReset" title="${t('kt_zoom_reset')||'Reset zoom'}">${escHtml(_ktState.zoom.toUpperCase())}</button>
          <button class="btn btn-sm btn-secondary" style="border-radius:0;border:none;border-left:1px solid var(--border)" data-action="_ktZoomIn" title="${t('kt_zoom_in')||'Larger text'}">A+</button>
        </div>
        <button class="btn btn-sm ${hasFilter ? 'btn-primary' : 'btn-secondary'}" data-action="_ktOpenFilter">\u{1F50D} ${t('kt_filter')||'Filter'}${hasFilter ? ' \u2713' : ''}</button>
        <button class="btn btn-sm ${hasHidden ? 'btn-secondary' : 'btn-secondary'}" data-action="_ktOpenColumnVisibility">\u{1F441} ${t('kt_columns_vis')||'Columns'}${hasHidden ? ' ('+Object.values(hidden).filter(v=>v).length+' hidden)' : ''}</button>
        ${canWrite ? `<button class="btn btn-sm btn-secondary" data-action="_ktOpenSettings">\u2699 ${t('kt_settings')||'Settings'}</button>` : ''}
        <button class="btn btn-sm btn-secondary" data-action="_ktPrint" title="${t('kt_print_title')||'Print Key Terrain Board'}">\u{1F5A8} ${t('btn_print')||'Print'}</button>
        <button class="btn btn-sm btn-secondary" data-action="_ktOpenManagePanel">\u{1F4CB} ${t('kt_manage')||'Manage & Export'}</button>
        ${canWrite ? `<button class="btn btn-sm btn-primary" data-action="_ktAddEntry">+ ${t('kt_add')||'Add Entry'}</button>` : ''}
        <button class="btn btn-sm btn-secondary" data-action="_ktShowHelp" title="${t('kt_help')||'Help'}">\u2753</button>
        <button class="btn btn-sm btn-secondary" data-action="_ktDetach" title="${t('kt_detach')||'Detach to window'}">\u29C9</button>
      </div>
    </div>

    <div id="ktBattleRhythmWidget" class="kt-no-print" style="display:none;margin-bottom:8px"></div>
    ${_ktRenderWaybackBanner()}
    <div id="ktBoardAttachments" class="kt-no-print" style="display:none;margin-bottom:12px"></div>

    <h2 class="kt-print-only" style="display:none;margin-bottom:8px">\u{1F3D4}\uFE0F ${t('kt_title')||'Key Terrain Board'}</h2>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:12px">${t('kt_desc')||'Cyber key terrain overview \u2014 tracks critical functions, their status, threats, and response actions.'}</p>

    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)" id="ktBoardTable">
        <thead>
          <tr style="background:var(--bg3);border-bottom:2px solid var(--border)">
            ${cols.map(c => { const d = colDef[c]; if (!d) return ''; return _ktSortTh(c, d.icon+' '+d.label, d.align, d.extra); }).join('')}
          </tr>
        </thead>
        <tbody>`;

  if (sorted.length === 0) {
    html += `<tr><td colspan="${totalCols}" style="padding:20px;text-align:center;color:var(--text-dim)">${hasFilter ? (t('kt_no_match')||'No entries match the current filter.') : (t('kt_empty')||'No key terrain entries. Add one to get started.')}</td></tr>`;
  }

  const fmtDate = (d) => { if (!d) return '\u2014'; try { return new Date(d).toLocaleDateString(undefined, {year:'2-digit',month:'short',day:'numeric'}); } catch { return '\u2014'; } };
  const fmtDateTime = (d) => { if (!d) return '\u2014'; try { return new Date(d).toLocaleString(undefined, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); } catch { return '\u2014'; } };

  for (const e of sorted) {
    const statusOpt = _ktStatusOptions.find(s => s.value === e.status) || _ktStatusOptions[3];
    const trendOpt = _ktTrendOptions.find(tr => tr.value === e.trend) || _ktTrendOptions[1];
    const sIcon = _ktGetStatusIcon(e.status);
    const trIcon = _ktGetTrendIcon(e.trend);
    const priColor = _ktGetPriorityColor(e.priority);

    // Ghosting styles. An entry is visually ghosted when either:
    //   - the operator explicitly ghosted it (e.ghosted == true), or
    //   - Priority is 0 / unset → treated as "inactive" and excluded
    //     from the battle-rhythm cycle counter.
    // Both conditions use the same style the operator configured
    // under Settings → Ghosting Style so the whole board stays
    // visually consistent.
    const isInactive = !e.priority || e.priority === 0;
    const showAsGhost = e.ghosted || isInactive;
    let rowBg = statusOpt.color;
    let rowStyle = '';
    if (showAsGhost) {
      if (ghostStyle === 'grey') {
        rowBg = 'rgba(150,150,150,0.08)';
        rowStyle = 'opacity:0.5;';
      } else if (ghostStyle === 'strikethrough') {
        rowStyle = 'text-decoration:line-through;opacity:0.6;';
      }
    }

    // Cell renderers per column
    const statusLabel = _statusLabels[e.status] || statusOpt.label;
    const cellHtml = {
      seq_num: `<td style="padding:8px;text-align:center;font-weight:600;font-size:11px;color:var(--text-dim)">${e.seq_num || '\u2014'}</td>`,
      zone: `<td style="padding:8px">${e.zone ? escHtml(e.zone) : '<span style="color:var(--text-dim)">\u2014</span>'}</td>`,
      priority: `<td style="padding:8px;text-align:center;font-weight:700;font-size:14px;${priColor ? 'color:' + priColor : ''}">${e.priority || '\u2014'}</td>`,
      function: (() => {
        // Indent + prefix for consequence rows; root-cause badge on parents
        // so they are identifiable at a glance. The "indent" is expressed
        // in ems so it scales with the board-zoom level (A- / A+).
        const indent = e._indent || 0;
        const indentStyle = indent > 0 ? `padding-left:${8 + indent * 20}px;border-left:4px solid var(--accent);` : 'padding-left:8px;';
        // Chunky arrow: larger, bold, with a pale accent background so the
        // "connected" relationship is obvious even at dense board zoom.
        const prefix = indent > 0
          ? `<span style="display:inline-block;color:var(--accent);font-weight:700;font-size:1.25em;line-height:1;margin-right:6px;padding:0 4px;border-radius:3px;background:rgba(74,144,217,0.15)" title="${t('kt_consequence_of')||'Consequence of root cause'}">↳</span>`
          : '';
        const isRoot = (childrenOf.get(e.id) || []).length > 0;
        const rootBadge = isRoot && indent === 0
          ? ` <span style="display:inline-block;font-size:9px;color:#fff;background:var(--accent);border:1px solid var(--accent);border-radius:8px;padding:1px 6px;margin-left:6px;font-weight:600;vertical-align:baseline;white-space:nowrap" title="${t('kt_root_cause_badge_h')||'Root cause for one or more consequences below'}">\u{1F333} ${t('kt_root_cause_badge')||'Root cause'}</span>`
          : '';
        const ghostedTag = e.ghosted ? ' <span style="font-size:9px;color:var(--text-dim);font-weight:normal">(ghosted)</span>' : (isInactive ? ' <span style="font-size:9px;color:var(--text-dim);font-weight:normal">(' + (t('kt_inactive')||'inactive') + ')</span>' : '');
        // white-space:nowrap keeps the root-cause badge on the same row
        // as the function name — letting the column widen naturally
        // instead of wrapping the badge below the text.
        return `<td style="padding:8px 8px 8px 0;${indentStyle}font-weight:600;white-space:nowrap">${prefix}${escHtml(e.function)}${rootBadge}${ghostedTag}</td>`;
      })(),
      status: `<td style="padding:8px;text-align:center"><span style="padding:2px 8px;border-radius:10px;font-weight:600;white-space:nowrap" title="${statusLabel}">${sIcon} ${statusLabel}</span></td>`,
      trend: `<td style="padding:8px;text-align:center"><span title="${trendOpt.label}">${trIcon} ${trendOpt.label}</span></td>`,
      threat: `<td style="padding:8px">${e.threat ? _ktRenderRich(e.threat) : '\u2014'}</td>`,
      external: `<td style="padding:8px">${e.external ? _ktRenderRich(e.external) : '\u2014'}</td>`,
      responsible: `<td style="padding:8px">${e.responsible_name ? escHtml(e.responsible_name) : '<span style="color:var(--text-dim)">\u2014</span>'}</td>`,
      owner: `<td style="padding:8px">${e.owner_name ? escHtml(e.owner_name) : '<span style="color:var(--text-dim)">\u2014</span>'}</td>`,
      actions: `<td style="padding:8px">${e.actions ? _ktRenderRich(e.actions) : '\u2014'}</td>`,
      comments: `<td style="padding:8px;font-size:11px;white-space:pre-wrap;color:var(--text)">${e.comments ? escHtml(e.comments) : '<span style="color:var(--text-dim)">\u2014</span>'}</td>`,
      created_at: `<td style="padding:8px;text-align:center;font-size:10px;color:var(--text-dim);background:var(--bg2);white-space:nowrap" title="${e.created_at || ''}">${fmtDate(e.created_at)}</td>`,
      updated_at: `<td style="padding:8px;text-align:center;font-size:10px;color:var(--text-dim);background:var(--bg2);white-space:nowrap" title="${e.updated_at || ''}">${fmtDateTime(e.updated_at)}</td>`,
      finished_at: `<td style="padding:8px;text-align:center;font-size:10px;background:var(--bg2);white-space:nowrap">${e.finished_at ? `<span style="color:var(--success,#27ae60)" title="${e.finished_at}">${fmtDate(e.finished_at)}</span>` : '<span style="color:var(--text-dim)">\u2014</span>'}</td>`,
      rounds: `<td style="padding:8px;text-align:center;font-weight:600">${e.rounds || 0}</td>`,
      management: canWrite ? `<td style="padding:8px;text-align:center;white-space:nowrap" data-stop-prop>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_ktMoveEntry" data-args='[${e.id},-1]' data-stop-prop title="${t('kt_move_up')||'Move up'}">\u25B2</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_ktMoveEntry" data-args='[${e.id},1]' data-stop-prop title="${t('kt_move_down')||'Move down'}">\u25BC</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktEditEntry" data-arg="${e.id}" data-stop-prop title="${t('kt_edit')||'Edit'}">\u270F\uFE0F</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktShowHistory" data-arg="${e.id}" data-stop-prop title="${t('kt_history')||'History'}">\u{1F4DC}</button>
        <button class="btn btn-sm${e.finished_at ? '' : ' btn-secondary'}" style="font-size:10px;padding:1px 5px;${e.finished_at ? 'color:var(--success,#27ae60)' : ''}" data-action="_ktHandleEntry" data-arg="${e.id}" data-stop-prop title="${e.finished_at ? (t('kt_unhandle')||'Mark as unhandled') : (t('kt_handle')||'Mark as handled')}">${e.finished_at ? '\u2705' : '\u2611'}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktToggleGhost" data-arg="${e.id}" data-stop-prop title="${e.ghosted ? (t('kt_unghost')||'Unghost') : (t('kt_ghost')||'Ghost')}">${e.ghosted ? '\u{1F47B}\u2713' : '\u{1F47B}'}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktCloneEntry" data-arg="${e.id}" data-stop-prop title="${t('kt_clone')||'Clone'}">\u{1F4CB}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktArchiveEntry" data-arg="${e.id}" data-stop-prop title="${t('kt_archive')||'Archive'}">\u{1F4E6}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px;color:var(--danger)" data-action="_ktDeleteEntry" data-arg="${e.id}" data-stop-prop title="${t('kt_remove')||'Remove'}">\u{1F5D1}</button>
      </td>` : `<td></td>`,
    };

    html += `<tr style="background:${rowBg};border-bottom:1px solid var(--border);transition:background .15s;${rowStyle}${canWrite?';cursor:pointer':''}" data-row-bg="${rowBg}" ${canWrite ? `data-action="_ktEditEntry" data-arg="${e.id}"` : ''}>
      ${cols.map(c => {
        let cell = cellHtml[c] || '';
        // Inject the column's native tooltip into the cell's <td>
        // opening tag when ShowColumnResponsibles is enabled and a
        // responsible is assigned. Keeps the existing cell HTML
        // untouched except for the one new attribute.
        const title = _ktColResponsibleTitle(c);
        if (title && cell.indexOf('<td') === 0) {
          cell = '<td title="' + escHtml(title) + '"' + cell.substring(3);
        }
        return cell;
      }).join('')}
    </tr>`;
  }

  html += `</tbody></table></div>`;

  // ── Archived entries section ──
  if (archivedEntries.length > 0) {
    html += `<details style="margin-top:16px" ${_ktState.showArchived ? 'open' : ''}>
      <summary style="cursor:pointer;font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:8px">\u{1F4E6} ${t('kt_archived')||'Archived'} (${archivedEntries.length})</summary>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs);opacity:0.7">
          <tbody>`;
    for (const e of archivedEntries) {
      const statusOpt = _ktStatusOptions.find(s => s.value === e.status) || _ktStatusOptions[3];
      html += `<tr style="background:var(--bg2);border-bottom:1px solid var(--border)">
        <td style="padding:6px 8px;text-align:center;font-weight:700">${e.priority || '\u2014'}</td>
        <td style="padding:6px 8px">${escHtml(e.function)}</td>
        <td style="padding:6px 8px;text-align:center">${_ktGetStatusIcon(e.status)} ${statusOpt.label}</td>
        <td style="padding:6px 8px">${escHtml(e.responsible_name || '\u2014')}</td>
        ${canWrite ? `<td style="padding:6px 8px;text-align:center;white-space:nowrap">
          <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktUnarchiveEntry" data-arg="${e.id}" title="${t('kt_unarchive')||'Restore'}">\u21A9</button>
          <button class="btn btn-sm" style="font-size:10px;padding:1px 5px;color:var(--danger)" data-action="_ktDeleteEntry" data-arg="${e.id}" title="${t('kt_remove')||'Remove'}">\u{1F5D1}</button>
        </td>` : ''}
      </tr>`;
    }
    html += `</tbody></table></div></details>`;
  }

  html += `
    <div style="margin-top:16px;font-size:var(--fs-xs);color:var(--text-dim)">
      <strong>${t('kt_legend')||'Legend'}:</strong>
      ${_ktStatusOptions.map(s => `${_ktGetStatusIcon(s.value)} ${s.label}`).join(' \u00B7 ')} &nbsp;|&nbsp;
      ${_ktTrendOptions.map(tr => `${_ktGetTrendIcon(tr.value)} ${tr.label}`).join(' \u00B7 ')}
      ${hasFilter ? ` &nbsp;|&nbsp; <em>${t('kt_filter_active')||'Filter active'} (${sorted.length}/${activeEntries.length})</em>` : ''}
    </div>
  </div>`;

  if (typeof _boardModal === 'function') {
    _boardModal('keyTerrainModal', html, '96vw');
  } else {
    let el = document.getElementById('keyTerrainModal');
    if (el) el.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay" id="keyTerrainModal"><div class="modal" style="width:96vw;max-width:96vw;max-height:94vh;overflow:auto;padding:20px;position:relative;resize:both">${html}</div></div>`);
    if (typeof openModal === 'function') openModal('keyTerrainModal');
    if (typeof _bindActions === 'function') _bindActions(document.getElementById('keyTerrainModal'));
  }
  // Wire row hover via event delegation (CSP-safe, no inline handlers)
  _ktBindRowHover();
  // Rehydrate the board-level attachments panel — a full board re-render
  // wipes the host div's content but leaves the element in place.
  if (typeof _ktRenderBoardAttachments === 'function') _ktRenderBoardAttachments();
}

// CSP-safe row hover: attach mouseover/mouseout listeners via delegation
function _ktBindRowHover() {
  const table = document.getElementById('ktBoardTable');
  if (!table) return;
  table.addEventListener('mouseover', (e) => {
    const tr = e.target.closest('tr[data-row-bg]');
    if (tr) tr.style.background = 'var(--bg3)';
  });
  table.addEventListener('mouseout', (e) => {
    const tr = e.target.closest('tr[data-row-bg]');
    if (tr) tr.style.background = tr.dataset.rowBg;
  });
}

function _ktAddEntry() {
  _ktEditEntry(null);
}

async function _ktEditEntry(entryId) {
  let entry = { function: '', status: 'unknown', trend: 'stable', threat: '', external: '', priority: (_ktState.entries.length + 1), responsible_name: '', actions: '', zone: '' };
  if (entryId) {
    const found = _ktState.entries.find(e => e.id === parseInt(entryId));
    if (found) entry = { ...found };
  }

  // Load capabilities for the "from capability" picker
  let capabilities = [];
  try {
    const res = await fetch('/api/rooms', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (res.ok) capabilities = ((await res.json()) || []).filter(r => r.type === 'capability');
  } catch {}

  const isNew = !entryId;

  let html = `<div style="max-width:540px">
    <h3>${isNew ? '➕' : '✏️'} ${isNew ? (t('kt_add')||'Add Entry') : (t('kt_edit')||'Edit Entry')}</h3>

    ${capabilities.length > 0 ? `<div style="margin-bottom:10px;padding:8px;background:var(--bg3);border-radius:var(--radius)">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F3AF} ${t('kt_from_capability')||'Load from Function'}</label>
      <select id="ktFromCapability" class="input" style="width:100%;font-size:var(--fs-xs)">
        <option value="">— ${t('kt_select_capability')||'Select a function...'} —</option>
        ${capabilities.map(c => `<option value="${c.id}" ${entry.capability_id === c.id ? 'selected' : ''}>${escHtml(c.name)}${c.zone ? ' [\u{1F310}'+escHtml(c.zone)+']' : ''}</option>`).join('')}
      </select>
      ${entry.capability_id ? `<div style="font-size:10px;color:var(--accent);margin-top:4px">\u{1F517} ${t('kt_linked_capability')||'Linked to function — name, zone, status, and responsible sync automatically'}</div>` : ''}
    </div>` : ''}

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F3AF} ${t('kt_function')||'Function'} *</label>
      <input id="ktFunction" class="input" style="width:100%" value="${escHtml(entry.function)}" placeholder="${t('kt_function_ph')||'Name of the function'}">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F4CA} ${t('kt_status')||'Status'}</label>
        <select id="ktStatus" class="input" style="width:100%;font-size:var(--fs-xs)">
          ${_ktStatusOptions.map(s => `<option value="${s.value}" ${entry.status===s.value?'selected':''}>${s.icon} ${s.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">📈 ${t('kt_trend')||'Trend'}</label>
        <select id="ktTrend" class="input" style="width:100%;font-size:var(--fs-xs)">
          ${_ktTrendOptions.map(tr => `<option value="${tr.value}" ${entry.trend===tr.value?'selected':''}>${tr.icon} ${tr.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">⚡ ${t('kt_priority')||'Priority'}</label>
        <input id="ktPriority" type="number" class="input" style="width:100%" value="${entry.priority || ''}" min="0" placeholder="1">
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F310} ${t('kt_zone')||'Zone'}</label>
        <input id="ktZone" class="input" style="width:100%;font-size:var(--fs-xs)" value="${escHtml(entry.zone || '')}" placeholder="${t('kt_zone_ph')||'e.g. North, HQ, DMZ'}">
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F504} ${t('kt_rounds')||'# Cycles'}</label>
        <input id="ktRounds" type="number" class="input" style="width:100%" value="${entry.rounds || 0}" min="0" placeholder="0">
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u2694\uFE0F ${t('kt_threat')||'Threat'} <span style="color:var(--accent);font-weight:normal">*</span></label>
      <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">${t('kt_threat_example')||'e.g. "APT group targeting DNS infrastructure", "DDoS on external gateway", "Insider threat to SCADA"'}</div>
      ${_ktRichField('ktThreat', entry.threat || '', t('kt_threat_ph')||'Describe current hostile pressure on this function', '50px')}
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F517} ${t('kt_external')||'External Dependencies'}</label>
      ${_ktRichField('ktExternal', entry.external || '', t('kt_external_ph')||'External dependencies and peer effects', '50px')}
    </div>

    <div style="margin-bottom:10px;position:relative">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F464} ${t('kt_responsible')||'Responsible'} <span style="color:var(--accent);font-weight:normal">*</span></label>
      <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">${t('kt_responsible_example')||'e.g. "@john.doe", "J6 Cyber Ops", "CISO", "Network Defense Team"'}</div>
      <input id="ktResponsible" class="input" style="width:100%" value="${escHtml(entry.responsible_name || '')}" placeholder="${t('kt_responsible_ph')||'@name, role, or team'}" autocomplete="off">
      <input id="ktResponsibleId" type="hidden" value="${entry.responsible_id || 0}">
      <div id="ktResponsibleDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 4px 12px rgba(0,0,0,.3);max-height:160px;overflow-y:auto"></div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F527} ${t('kt_actions')||'Actions'} <span style="color:var(--accent);font-weight:normal">*</span></label>
      <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">${t('kt_actions_example')||'e.g. "Deploying additional IDS sensors", "Patching CVE-2025-1234", "Rerouting traffic via backup link"'}</div>
      ${_ktRichField('ktActions', entry.actions || '', t('kt_actions_ph')||'Describe what is being done to achieve effects', '60px')}
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F333} ${t('kt_root_cause')||'Root cause (this entry is a consequence of…)'}</label>
      <select id="ktParent" class="input" style="width:100%;font-size:var(--fs-xs)">
        <option value="0">${t('kt_root_cause_none')||'— None (this is a root cause itself or standalone) —'}</option>
        ${(_ktState.entries || [])
          .filter(x => !x.archived && x.id !== (entry.id || 0))
          .sort((a, b) => (a.function || '').localeCompare(b.function || ''))
          .map(x => `<option value="${x.id}"${entry.parent_id === x.id ? ' selected' : ''}>${escHtml('#' + (x.seq_num || x.id) + ' ' + (x.function || ''))}</option>`)
          .join('')}
      </select>
      <div style="font-size:10px;color:var(--text-dim);margin-top:3px">${t('kt_root_cause_hint')||'Consequences are indented under their root cause on the board.'}</div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F4AC} ${_ktColLabel('comments', t('kt_comments')||'Comments')}</label>
      <textarea id="ktComments" class="input" style="width:100%;min-height:48px;resize:vertical;font-size:var(--fs-xs)" placeholder="${t('kt_comments_ph')||'Notes, remarks, flags…'}">${escHtml(entry.comments || '')}</textarea>
    </div>

    ${_ktRenderEntryHistorySection(entry, isNew)}

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktSaveEntry" data-arg="${entryId || 0}">✔ ${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_ktCancelEdit">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;

  _boardModal('ktEditModal', html, '560px');
  _ktTrapModalKeys('ktEditModal');
  _ktBindRichToolbars(document.getElementById('ktEditModal'));

  // Wire "from capability" dropdown to auto-fill fields
  const capSelect = document.getElementById('ktFromCapability');
  if (capSelect) {
    capSelect.addEventListener('change', () => {
      const capId = parseInt(capSelect.value);
      if (!capId) return;
      const cap = capabilities.find(c => c.id === capId);
      if (!cap) return;
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      setVal('ktFunction', cap.name);
      setVal('ktZone', cap.zone || '');
      setVal('ktResponsible', cap.responsibility || '');
      // Map capability status to KT status dropdown
      const statusMap = {'working':'working','degraded':'degraded','down':'down','unknown':'unknown'};
      const statusSel = document.getElementById('ktStatus');
      if (statusSel && statusMap[cap.status]) statusSel.value = cap.status;
    });
  }

  // Wire autocomplete for responsible
  const respInput = document.getElementById('ktResponsible');
  const respDropdown = document.getElementById('ktResponsibleDropdown');
  const respIdInput = document.getElementById('ktResponsibleId');
  if (respInput && respDropdown) {
    let debounceTimer = null;
    respInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const val = respInput.value.trim();
      if (val.length < 1) { respDropdown.style.display = 'none'; return; }
      debounceTimer = setTimeout(async () => {
        try {
          const users = await _ktApi('GET', '/key-terrain/users?q=' + encodeURIComponent(val));
          if (users.length === 0) { respDropdown.style.display = 'none'; return; }
          respDropdown.innerHTML = users.map(u =>
            `<div style="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:var(--fs-xs)" data-uid="${u.id}" data-name="${escHtml(u.display_name)}">${escHtml(u.display_name)} <span style="color:var(--text-dim)">(${escHtml(u.username)})</span></div>`
          ).join('');
          respDropdown.style.display = '';
          respDropdown.querySelectorAll('[data-uid]').forEach(el => {
            el.addEventListener('click', () => {
              respInput.value = el.dataset.name;
              respIdInput.value = el.dataset.uid;
              respDropdown.style.display = 'none';
            });
          });
        } catch { respDropdown.style.display = 'none'; }
      }, 250);
    });
    respInput.addEventListener('blur', () => {
      setTimeout(() => { respDropdown.style.display = 'none'; }, 200);
    });
  }
}

// _ktRenderEntryHistorySection shows the entry's revision history
// inline inside the edit modal so operators don't have to close the
// popup and hit the 📜 button to see WHO changed WHAT and WHEN. New
// entries (no history yet) show a "no history yet" placeholder.
function _ktRenderEntryHistorySection(entry, isNew) {
  if (isNew) {
    return `<div style="margin:14px 0 6px;padding-top:10px;border-top:1px dashed var(--border)">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim)">\u{1F4DC} ${t('kt_entry_history')||'Revision history'}</div>
      <div style="font-size:10px;color:var(--text-dim);margin-top:4px;font-style:italic">${t('kt_entry_history_new')||'History is recorded from the first save onwards.'}</div>
    </div>`;
  }
  const hist = Array.isArray(entry.history) ? [...entry.history].reverse() : [];
  const rows = hist.length
    ? hist.map(h => {
        let ts = '';
        try { ts = new Date(h.timestamp).toLocaleString(); } catch {}
        const oldNew = h.old_value
          ? `<span style="text-decoration:line-through;color:var(--text-dim)">${escHtml(h.old_value)}</span> → <span>${escHtml(h.new_value)}</span>`
          : (h.new_value ? escHtml(h.new_value) : `<span style="color:var(--text-dim)">${t('kt_history_cleared')||'cleared'}</span>`);
        return `<div style="padding:4px 6px;border-bottom:1px solid var(--border);font-size:11px;line-height:1.4">
          <div style="display:flex;justify-content:space-between;color:var(--text-dim);font-size:10px">
            <span>${escHtml(h.user_name || '')}</span>
            <span>${escHtml(ts)}</span>
          </div>
          <div><strong>${escHtml(h.field)}</strong>: ${oldNew}</div>
        </div>`;
      }).join('')
    : `<div style="padding:8px;font-size:10px;color:var(--text-dim);font-style:italic">${t('kt_no_history')||'No history for this entry.'}</div>`;
  return `<div style="margin:14px 0 6px;padding-top:10px;border-top:1px dashed var(--border)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="font-size:var(--fs-xs);font-weight:600">\u{1F4DC} ${t('kt_entry_history')||'Revision history'}</div>
      <span style="font-size:10px;color:var(--text-dim)">${hist.length} ${hist.length === 1 ? (t('kt_entry_singular')||'entry') : (t('kt_entry_plural')||'entries')}</span>
    </div>
    <div style="max-height:180px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius)">${rows}</div>
  </div>`;
}

async function _ktSaveEntry(entryId) {
  const fn = document.getElementById('ktFunction')?.value?.trim();
  if (!fn) { alert(t('kt_function_required')||'Function is required'); return; }

  const capId = parseInt(document.getElementById('ktFromCapability')?.value) || 0;
  const data = {
    function: fn,
    status: document.getElementById('ktStatus')?.value || 'unknown',
    trend: document.getElementById('ktTrend')?.value || 'stable',
    threat: _ktGetRichValue('ktThreat'),
    external: _ktGetRichValue('ktExternal'),
    priority: parseInt(document.getElementById('ktPriority')?.value) || 0,
    zone: document.getElementById('ktZone')?.value?.trim() || '',
    capability_id: capId,
    rounds: parseInt(document.getElementById('ktRounds')?.value) || 0,
    actions: _ktGetRichValue('ktActions'),
    comments: document.getElementById('ktComments')?.value || '',
    parent_id: parseInt(document.getElementById('ktParent')?.value) || 0,
  };

  const respId = parseInt(document.getElementById('ktResponsibleId')?.value);
  const respName = document.getElementById('ktResponsible')?.value?.trim() || '';
  if (respId) {
    data.responsible_id = respId;
  } else if (respName) {
    data.responsible = respName;
  }

  try {
    if (entryId && parseInt(entryId) > 0) {
      await _ktApi('PUT', '/key-terrain/' + entryId, data);
    } else {
      await _ktApi('POST', '/key-terrain', data);
    }
    if (typeof _closeBoardModal === 'function') _closeBoardModal('ktEditModal');
    await openKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_saved')||'Entry saved');
  } catch (e) { alert('Error: ' + e.message); }
}

function _ktCancelEdit() {
  if (typeof _closeBoardModal === 'function') _closeBoardModal('ktEditModal');
}

// ── Board-level Attachments (meeting protocols across battle cycles) ──────
// Live next to the Battle Rhythm widget, not on individual entries, so
// operators can keep a running log of per-cycle protocols on one board.
function _ktCurrentCycle() {
  const st = typeof _ktBrLastState !== 'undefined' ? _ktBrLastState : null;
  return (st && Number.isFinite(st.cycles_completed)) ? st.cycles_completed : 0;
}

function _ktFmtBytes(n) {
  if (!n || n < 1024) return (n||0) + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/(1024*1024)).toFixed(1) + ' MB';
}

function _ktDefaultAttachComment(cycle) {
  const tpl = t('kt_attach_comment_default') || 'Battle cycle {n} — meeting protocol';
  return tpl.replace('{n}', String(cycle));
}

// Parses the host out of a URL and returns "(host)" for display next
// to a URL-style attachment. Empty string on parse error.
function _ktAttachmentHostHint(u) {
  try {
    const h = new URL(u).host;
    if (!h) return '';
    return ' <span style="color:var(--text-dim);font-weight:normal">(' + escHtml(h) + ')</span>';
  } catch { return ''; }
}

function _ktAttachmentRow(a) {
  const isURL = !!a.url;
  const href = isURL ? a.url : `/api/key-terrain-attachments/${encodeURIComponent(a.stored_name)}`;
  const icon = isURL ? '\u{1F517}' : '\u{1F4CE}'; // 🔗 for link, 📎 for file
  const meta = [];
  if (a.cycle != null) meta.push((t('kt_current_cycle')||'Cycle') + ' ' + a.cycle);
  if (a.size) meta.push(_ktFmtBytes(a.size));
  if (a.uploader_name) meta.push(a.uploader_name);
  if (a.created_at) { try { meta.push(new Date(a.created_at).toLocaleString()); } catch {} }
  const canDelete = _ktState.access && _ktState.access.can_write;
  const delBtn = canDelete
    ? `<button class="btn btn-sm btn-secondary" style="font-size:10px;padding:2px 6px;flex:0 0 auto" data-action="_ktDeleteBoardAttachment" data-arg-el data-stored="${escHtml(a.stored_name)}" title="${t('btn_delete')||'Delete'}">\u{1F5D1}</button>`
    : '';
  return `<div style="display:flex;gap:6px;align-items:center;padding:4px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);font-size:var(--fs-xs)">
    <a href="${escHtml(href)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;flex:0 0 auto" title="${escHtml(isURL ? a.url : (a.filename||''))}">${icon} ${escHtml(a.filename||'')}${isURL ? _ktAttachmentHostHint(a.url) : ''}</a>
    <span style="flex:1;min-width:0;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(a.comment||'')}</span>
    <span style="color:var(--text-dim);font-size:10px;flex:0 0 auto">${escHtml(meta.join(' \u00B7 '))}</span>
    ${delBtn}
  </div>`;
}

// Tracks whether the protocols pane is expanded. Persisted to
// localStorage so the operator's preference survives reloads. Default
// false: the pane starts collapsed and the operator opens it on demand.
function _ktProtocolsPaneOpen() {
  try { return localStorage.getItem('kt_protocols_open') === '1'; } catch { return false; }
}
function _ktSetProtocolsPaneOpen(v) {
  try { localStorage.setItem('kt_protocols_open', v ? '1' : '0'); } catch {}
}
function _ktToggleProtocolsPane() {
  _ktSetProtocolsPaneOpen(!_ktProtocolsPaneOpen());
  _ktRenderBoardAttachments();
}

// Renders the board-level attachments panel. Sits in #ktBoardAttachments
// directly below the Battle Rhythm widget. Hidden by default behind a
// summary button; clicking expands the panel with a scrollable list and
// (for write-access users) an uploader row.
function _ktRenderBoardAttachments() {
  const host = document.getElementById('ktBoardAttachments');
  if (!host) return;
  const cfg = (_ktState.settings && _ktState.settings.battle_rhythm) || {};
  if (!cfg.enabled || !cfg.show_clock) { host.style.display = 'none'; return; }
  host.style.display = '';
  const cycle = _ktCurrentCycle();
  const canWrite = _ktState.access && _ktState.access.can_write && !_ktState._waybackInfo;
  const list = Array.isArray(_ktState.attachments) ? [..._ktState.attachments] : [];
  list.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
  const open = _ktProtocolsPaneOpen();
  const count = list.length;
  const summaryRight = `${count} ${count === 1 ? (t('kt_file_singular')||'file') : (t('kt_file_plural')||'files')}${cycle ? ' \u00B7 ' + (t('kt_current_cycle')||'Cycle') + ' ' + cycle : ''}`;
  // Collapsed: render only a button-like summary header. Expanded: also
  // render the list and (optional) uploader row below.
  const summaryRow = `<button type="button" data-action="_ktToggleProtocolsPane"
      style="width:100%;text-align:left;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font:inherit;color:var(--text)"
      title="${t(open ? 'kt_protocols_hide' : 'kt_protocols_show')||(open?'Hide protocols':'Show protocols')}">
      <span style="font-size:14px">${open ? '\u25BC' : '\u25B6'}</span>
      <span style="font-weight:600;font-size:var(--fs-sm)">\u{1F4CE} ${t('kt_board_protocols')||'Battle cycle protocols'}</span>
      <span style="margin-left:auto;font-size:10px;color:var(--text-dim)">${summaryRight}</span>
    </button>`;
  if (!open) {
    host.innerHTML = summaryRow;
    if (typeof _bindActions === 'function') _bindActions(host);
    return;
  }
  const listHtml = count
    ? `<div id="ktBoardAttachList" style="display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;padding:4px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius)">${list.map(_ktAttachmentRow).join('')}</div>`
    : `<div id="ktBoardAttachList" style="font-size:10px;color:var(--text-dim);padding:8px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius);text-align:center">${t('kt_no_attachments')||'No protocols uploaded yet.'}</div>`;
  const urlMode = _ktProtocolModeIsURL();
  const uploader = canWrite ? `
    <div style="display:flex;gap:4px;margin-top:8px;margin-bottom:4px">
      <button class="btn btn-sm ${!urlMode ? 'btn-primary' : 'btn-secondary'}" style="font-size:10px;padding:3px 10px" data-action="_ktSetProtocolModeFile">\u{1F4CE} ${t('kt_attach_mode_file')||'Upload file'}</button>
      <button class="btn btn-sm ${urlMode ? 'btn-primary' : 'btn-secondary'}" style="font-size:10px;padding:3px 10px" data-action="_ktSetProtocolModeURL">\u{1F517} ${t('kt_attach_mode_url')||'Save URL'}</button>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:var(--bg3);padding:6px;border-radius:var(--radius)">
      ${urlMode
        ? `<input type="url" id="ktBoardAttachURL" class="input" style="flex:2;min-width:220px;font-size:var(--fs-xs)" placeholder="${t('kt_attach_url_ph')||'https://cloud.example.com/s/…'}">
           <input type="text" id="ktBoardAttachLabel" class="input" style="flex:1;min-width:140px;font-size:var(--fs-xs)" placeholder="${t('kt_attach_label_ph')||'Label (optional)'}">`
        : `<input type="file" id="ktBoardAttachFile" style="font-size:10px;flex:1;min-width:160px">`}
      <input type="text" id="ktBoardAttachComment" class="input" style="flex:2;min-width:200px;font-size:var(--fs-xs)"
        placeholder="${t('kt_attach_comment_ph')||'Protocol / note'}"
        value="${escHtml(_ktDefaultAttachComment(cycle))}">
      <button class="btn btn-primary btn-sm" style="font-size:var(--fs-xs)" data-action="_ktUploadBoardAttachment">${urlMode ? '\u{1F4CC} ' + (t('kt_save_link')||'Save link') : '\u{2B06} ' + (t('kt_upload')||'Upload')}</button>
    </div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:3px">${urlMode ? (t('kt_attach_url_hint')||'Paste an http(s) link (Nextcloud, Google Drive, SharePoint, …). Comment is pre-filled with the current battle cycle number — adjust before saving if needed.') : (t('kt_attach_hint')||'Comment is pre-filled with the current battle cycle number — adjust before uploading if needed.')}</div>` : '';
  host.innerHTML = `
    ${summaryRow}
    <div style="padding:10px 12px;margin-top:-1px;border-radius:0 0 var(--radius) var(--radius);background:var(--bg2);border:1px solid var(--border);border-top:none">
      ${listHtml}
      ${uploader}
    </div>`;
  if (typeof _bindActions === 'function') _bindActions(host);
}

async function _ktLoadBoardAttachments() {
  try {
    _ktState.attachments = await _ktApi('GET', '/key-terrain-attachments') || [];
  } catch {
    _ktState.attachments = [];
  }
  _ktRenderBoardAttachments();
}

// Protocol uploader mode: 'file' (default) or 'url'. Persisted to
// localStorage so the operator's preference survives reloads.
function _ktProtocolModeIsURL() {
  try { return localStorage.getItem('kt_protocol_mode') === 'url'; } catch { return false; }
}
function _ktSetProtocolModeFile() {
  try { localStorage.setItem('kt_protocol_mode', 'file'); } catch {}
  _ktRenderBoardAttachments();
}
function _ktSetProtocolModeURL() {
  try { localStorage.setItem('kt_protocol_mode', 'url'); } catch {}
  _ktRenderBoardAttachments();
}

async function _ktUploadBoardAttachment() {
  const ci = document.getElementById('ktBoardAttachComment');
  const cycle = _ktCurrentCycle();
  const comment = ci?.value || '';
  const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (csrf) headers['X-CSRF-Token'] = csrf[1];

  // URL mode: send a JSON body — no file. The server validates the
  // scheme (http/https only) and stores the link alongside file-backed
  // protocols in the same list.
  if (_ktProtocolModeIsURL()) {
    const urlEl = document.getElementById('ktBoardAttachURL');
    const labelEl = document.getElementById('ktBoardAttachLabel');
    const url = (urlEl?.value || '').trim();
    if (!url) { alert(t('kt_attach_url_required')||'Paste a URL first.'); return; }
    headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch('/api/key-terrain-attachments', {
        method: 'POST', headers,
        body: JSON.stringify({ url, filename: (labelEl?.value || '').trim(), comment, cycle }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || res.statusText);
      }
      const att = await res.json();
      _ktState.attachments = _ktState.attachments || [];
      _ktState.attachments.push(att);
      _ktRenderBoardAttachments();
      if (typeof showNotification === 'function') showNotification('success', t('kt_attach_url_saved')||'Link saved');
    } catch (err) { alert('Error: ' + err.message); }
    return;
  }

  // File mode: multipart form with a "file" field.
  const fi = document.getElementById('ktBoardAttachFile');
  if (!fi || !fi.files || !fi.files.length) {
    alert(t('kt_attach_pick_file')||'Pick a file to upload first.');
    return;
  }
  const fd = new FormData();
  fd.append('file', fi.files[0]);
  fd.append('comment', comment);
  fd.append('cycle', String(cycle));
  try {
    const res = await fetch('/api/key-terrain-attachments', { method: 'POST', headers, body: fd });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || res.statusText);
    }
    const att = await res.json();
    _ktState.attachments = _ktState.attachments || [];
    _ktState.attachments.push(att);
    _ktRenderBoardAttachments();
    if (typeof showNotification === 'function') showNotification('success', t('kt_attach_uploaded')||'Attachment uploaded');
  } catch (err) { alert('Error: ' + err.message); }
}

// ── Cycle History Viewer ──────────────────────────────────────────────────
// Lists automatic battle-rhythm snapshots (written to disk by
// runDueBattleRhythmSnapshots) and lets the operator replay the Key
// Terrain Board state from any earlier cycle. Only JSON snapshots can
// be replayed in-browser; CSV/XML/SVG fall back to a raw download.
async function _ktOpenCycleHistory() {
  let cycles = [];
  try {
    cycles = await _ktApi('GET', '/key-terrain/battle-rhythm/snapshots') || [];
  } catch (e) {
    alert('Error: ' + e.message);
    return;
  }
  const cfg = (_ktState.settings && _ktState.settings.battle_rhythm) || {};
  const cycleMin = parseInt(cfg.cycle_minutes) || 0;
  const startedAt = cfg.started_at ? new Date(cfg.started_at) : null;
  const cycleIdxFor = (cycleDir) => {
    if (!startedAt || !cycleMin) return null;
    const parsed = _ktParseSafeTimestamp(cycleDir);
    if (!parsed) return null;
    const diffMin = (parsed.getTime() - startedAt.getTime()) / 60000;
    if (diffMin < 0) return null;
    return Math.round(diffMin / cycleMin);
  };
  const rows = cycles.map(c => {
    const idx = cycleIdxFor(c.cycle_dir);
    const when = _ktParseSafeTimestamp(c.cycle_dir);
    const label = (idx != null ? `${t('kt_current_cycle')||'Cycle'} ${idx}` : c.cycle_dir)
                + (when ? ' · ' + when.toLocaleString() : '');
    const files = (c.files || []).slice().sort((a, b) => (a.offset_min||0) - (b.offset_min||0));
    const fileLinks = files.map(f => {
      const href = `/api/key-terrain/battle-rhythm/snapshots/${encodeURIComponent(c.cycle_dir)}/${encodeURIComponent(f.name)}`;
      const isJson = (f.format || '').toLowerCase() === 'json';
      const offsetTxt = 'H' + (f.offset_min >= 0 ? '+' : '') + f.offset_min;
      const fmt = (f.format || '').toUpperCase();
      if (isJson) {
        return `<button class="btn btn-sm btn-primary" style="font-size:10px;padding:2px 8px" data-action="_ktLoadHistoricalKTB" data-arg-el data-cycle="${escHtml(c.cycle_dir)}" data-name="${escHtml(f.name)}" data-label="${escHtml(label + ' · ' + offsetTxt)}" data-cycle-idx="${idx != null ? idx : ''}" data-offset="${f.offset_min}" data-taken="${escHtml(f.taken_at || '')}" title="${t('kt_br_wayback_load_h')||'Load this board state into the main view'}">\u23EA ${offsetTxt} ${fmt}</button>`;
      }
      return `<a class="btn btn-sm btn-secondary" style="font-size:10px;padding:2px 8px;text-decoration:none" href="${href}" target="_blank" rel="noopener" title="${t('kt_br_history_download')||'Download'}">${offsetTxt} ${fmt}</a>`;
    }).join(' ');
    return `<div style="padding:6px 8px;border-bottom:1px solid var(--border)">
      <div style="font-size:var(--fs-xs);font-weight:600;margin-bottom:4px">${escHtml(label)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${fileLinks || `<span style="color:var(--text-dim);font-size:10px">${t('kt_br_history_no_files')||'No snapshots'}</span>`}</div>
    </div>`;
  }).join('');
  const empty = !cycles.length
    ? `<p style="color:var(--text-dim);padding:12px">${t('kt_br_history_empty')||'No snapshots recorded yet. Configure snapshot offsets in the Battle Rhythm settings.'}</p>`
    : '';
  const html = `<div style="width:min(92vw,720px);max-width:92vw">
    <h3 style="margin:0 0 6px">\u23EA ${t('kt_br_wayback_title')||'Wayback Machine'}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('kt_br_wayback_desc')||'Load the Key Terrain Board as it stood in an earlier battle-rhythm cycle. Click a JSON marker to load that snapshot into the main view; you can return to live at any time. CSV/XML/SVG markers download the raw file.'}</p>
    <div style="max-height:55vh;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg)">${rows}${empty}</div>
    <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:6px">
      <button class="btn btn-secondary btn-sm" data-action="_ktCloseCycleHistory">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('ktCycleHistoryModal', html, '720px');
  _ktTrapModalKeys('ktCycleHistoryModal');
}

function _ktCloseCycleHistory() {
  if (typeof _closeBoardModal === 'function') _closeBoardModal('ktCycleHistoryModal');
}

// Parses the safeTimestamp() format ("2026-04-13T09-00-00Z") back into
// a Date. safeTimestamp replaces the colons in RFC3339 with dashes, so
// we only need to put them back in the time part.
function _ktParseSafeTimestamp(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(Z|[+-]\d{2}-\d{2})?$/);
  if (!m) return null;
  const tz = (m[5] || '').replace('-', ':'); // the dash in the TZ offset also needs reversing
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}${tz || 'Z'}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// _ktLoadHistoricalKTB swaps the live entries for a snapshot from disk so
// the main board re-renders showing the KTB as it stood at that cycle.
// Live state is stashed in _ktState._liveEntries; the wayback banner's
// Return-to-live action restores it. SSE / cycle-rollover refreshes are
// suppressed while in wayback mode so the historical view stays put.
async function _ktLoadHistoricalKTB(el) {
  const cycleDir = el?.dataset?.cycle;
  const name = el?.dataset?.name;
  const label = el?.dataset?.label || '';
  if (!cycleDir || !name) return;
  try {
    const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (csrf) headers['X-CSRF-Token'] = csrf[1];
    const res = await fetch(`/api/key-terrain/battle-rhythm/snapshots/${encodeURIComponent(cycleDir)}/${encodeURIComponent(name)}`, { headers });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || res.statusText);
    }
    const data = JSON.parse(await res.text());
    if (!Array.isArray(data && data.entries)) throw new Error('Snapshot has no entries array');
    if (!_ktState._liveEntries) _ktState._liveEntries = _ktState.entries;
    _ktState.entries = data.entries;
    _ktState._waybackInfo = {
      label,
      cycleDir,
      cycleIdx: el.dataset.cycleIdx ? parseInt(el.dataset.cycleIdx, 10) : null,
      offsetMin: Number.isFinite(parseInt(el.dataset.offset, 10)) ? parseInt(el.dataset.offset, 10) : (data.offset_min || 0),
      takenAt: data.taken_at || el.dataset.taken || '',
      cycleStart: data.cycle_start || '',
    };
    _ktCloseCycleHistory();
    _renderKeyTerrainBoard();
  } catch (err) {
    alert('Error: ' + (err.message || String(err)));
  }
}

// _ktExitWayback restores the live board state and re-renders.
function _ktExitWayback() {
  if (!_ktState._waybackInfo) return;
  if (_ktState._liveEntries) {
    _ktState.entries = _ktState._liveEntries;
    delete _ktState._liveEntries;
  }
  delete _ktState._waybackInfo;
  _renderKeyTerrainBoard();
}

// _ktRenderWaybackBanner returns the HTML for the prominent banner shown
// at the top of the board while in wayback mode. Empty string if live.
function _ktRenderWaybackBanner() {
  const w = _ktState._waybackInfo;
  if (!w) return '';
  const offset = Number.isFinite(w.offsetMin) ? ('H' + (w.offsetMin >= 0 ? '+' : '') + w.offsetMin) : '';
  const takenStr = w.takenAt ? (() => { try { return new Date(w.takenAt).toLocaleString(); } catch { return w.takenAt; } })() : '';
  const cycleStr = w.cycleIdx != null ? (t('kt_current_cycle')||'Cycle') + ' ' + w.cycleIdx : (w.cycleDir || '');
  return `<div class="kt-no-print" style="padding:10px 14px;margin-bottom:10px;background:#FFF4C2;color:#222;border:1px solid #E0C200;border-radius:var(--radius);display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="font-size:20px">\u23EA</div>
    <div style="flex:1;min-width:240px">
      <div style="font-weight:700">${t('kt_br_wayback_banner')||'Wayback mode — viewing a frozen historical snapshot'}</div>
      <div style="font-size:var(--fs-xs);opacity:.8">${escHtml(cycleStr)}${offset ? ' \u00B7 ' + escHtml(offset) : ''}${takenStr ? ' \u00B7 ' + (t('kt_br_history_taken_at')||'Taken') + ': ' + escHtml(takenStr) : ''}</div>
    </div>
    <button class="btn btn-sm btn-primary" data-action="_ktExitWayback" style="background:#222;color:#fff">\u23E9 ${t('kt_br_wayback_return')||'Return to live'}</button>
  </div>`;
}

async function _ktDeleteBoardAttachment(el) {
  const storedName = el?.dataset?.stored;
  if (!storedName) return;
  if (!confirm(t('kt_attach_delete_confirm')||'Delete this attachment?')) return;
  const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (csrf) headers['X-CSRF-Token'] = csrf[1];
  try {
    const res = await fetch(`/api/key-terrain-attachments/${encodeURIComponent(storedName)}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || res.statusText);
    }
    if (Array.isArray(_ktState.attachments)) {
      _ktState.attachments = _ktState.attachments.filter(a => a.stored_name !== storedName);
    }
    _ktRenderBoardAttachments();
    if (typeof showNotification === 'function') showNotification('success', t('kt_attach_deleted')||'Attachment deleted');
  } catch (err) { alert('Error: ' + err.message); }
}

async function _ktDeleteEntry(entryId) {
  if (!confirm(t('kt_delete_confirm')||'Delete this key terrain entry?')) return;
  try {
    await _ktApi('DELETE', '/key-terrain/' + entryId);
    await openKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_deleted')||'Entry deleted');
  } catch (e) { alert('Error: ' + e.message); }
}

async function _ktCloneEntry(entryId) {
  const orig = _ktState.entries.find(e => e.id === parseInt(entryId));
  if (!orig) return;
  const data = {
    function: (t('kt_clone_prefix')||'Clone') + ' ' + orig.function,
    status: orig.status,
    trend: orig.trend,
    threat: orig.threat,
    external: orig.external,
    priority: (orig.priority || 0) + 1,
    zone: orig.zone || '',
    actions: orig.actions,
    capability_id: orig.capability_id || 0,
  };
  if (orig.responsible_name) data.responsible = orig.responsible_name;
  try {
    await _ktApi('POST', '/key-terrain', data);
    await openKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_cloned')||'Entry cloned');
  } catch (e) { alert('Error: ' + e.message); }
}

// ── Ghost / Archive / Unarchive ──
async function _ktHandleEntry(entryId) {
  const entry = _ktState.entries.find(e => e.id === parseInt(entryId));
  if (!entry) return;
  try {
    await _ktApi('PUT', '/key-terrain/' + entryId, { finished: !entry.finished_at });
    await openKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', entry.finished_at ? (t('kt_unhandled_msg')||'Marked as unhandled') : (t('kt_handled_msg')||'Marked as handled'));
  } catch (e) { alert('Error: ' + e.message); }
}

async function _ktToggleGhost(entryId) {
  const entry = _ktState.entries.find(e => e.id === parseInt(entryId));
  if (!entry) return;
  try {
    await _ktApi('PUT', '/key-terrain/' + entryId, { ghosted: !entry.ghosted });
    await openKeyTerrainBoard();
  } catch (e) { alert('Error: ' + e.message); }
}

async function _ktArchiveEntry(entryId) {
  try {
    await _ktApi('PUT', '/key-terrain/' + entryId, { archived: true });
    await openKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_archived_msg')||'Entry archived');
  } catch (e) { alert('Error: ' + e.message); }
}

async function _ktUnarchiveEntry(entryId) {
  try {
    await _ktApi('PUT', '/key-terrain/' + entryId, { archived: false });
    await openKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_unarchived_msg')||'Entry restored');
  } catch (e) { alert('Error: ' + e.message); }
}

// ── Settings Panel ──
function _ktOpenSettings() {
  const s = _ktState.settings || {};
  const pc = s.priority_colors || {};
  const si = s.status_icons || {};
  const ti = s.trend_icons || {};
  const sl = s.status_labels || {};
  const hc = s.hidden_columns || {};
  const sortBy = s.sort_by || 'priority';
  const gs = s.ghost_style || 'grey';
  const showNoPri = s.show_no_priority !== false;
  const br = s.battle_rhythm || {};
  const brSteps = Array.isArray(br.steps) ? br.steps : [];
  const brSnapOffsets = Array.isArray(br.snapshot_offsets) ? br.snapshot_offsets : [];
  const brSnapFormats = Array.isArray(br.snapshot_formats) ? br.snapshot_formats : [];

  let html = `<div style="max-width:540px;max-height:80vh;overflow-y:auto">
    <h3>\u2699 ${t('kt_settings')||'Key Terrain Settings'}</h3>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F441} ${t('kt_show_no_priority')||'Show Functions Without Priority'}</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer">
        <input type="checkbox" id="ktSettShowNoPriority" ${showNoPri ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('kt_show_no_priority_desc')||'Show entries with priority 0 or no priority set (enabled by default)'}
      </label>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F6AB} ${t('kt_hidden_columns')||'Hide Columns'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_hidden_columns_desc')||'Select columns to hide from the board view.'}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
        ${_ktState.columnOrder.map(c => {
          const defLbl = {seq_num:'#',zone:'Zone',priority:'Priority',function:'Function',status:'Status',trend:'Trend',threat:'Threat',external:'External',responsible:'Responsible',owner:'Owner',actions:'Actions',comments:'Comments',created_at:'Created',updated_at:'Updated',finished_at:'Finished',rounds:'Cycles',management:'Management'}[c] || c;
          const lbl = _ktColLabel(c, defLbl);
          return `<label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);cursor:pointer">
            <input type="checkbox" class="ktSettHiddenCol" data-col="${c}" ${hc[c] ? 'checked' : ''} style="accent-color:var(--accent)"> ${lbl}
          </label>`;
        }).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F3A8} ${t('kt_priority_colors')||'Priority Color Coding'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_priority_colors_desc')||'Assign a color to each priority level (shown on the priority number).'}</p>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
        ${[1,2,3,4,5].map(n => `<div style="text-align:center">
          <div style="font-weight:700;font-size:12px;margin-bottom:2px">${n}</div>
          <input type="color" id="ktSettPriColor${n}" value="${pc[String(n)] || '#888888'}" style="width:36px;height:24px;cursor:pointer;border:none;padding:0">
        </div>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F4CA} ${t('kt_status_icons')||'Status Icons'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${_ktStatusOptions.map(st => `<div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:var(--fs-xs);min-width:60px">${st.label}:</span>
          <input id="ktSettStatusIcon_${st.value}" class="input" style="width:50px;font-size:14px;text-align:center;padding:2px" value="${escHtml(si[st.value] || st.icon)}" maxlength="4">
        </div>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F3F7} ${t('kt_status_labels')||'Status Labels'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_status_labels_desc')||'Customize the display labels for each status value.'}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${_ktStatusOptions.map(st => `<div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:var(--fs-xs);min-width:60px">${st.icon} ${st.value}:</span>
          <input id="ktSettStatusLabel_${st.value}" class="input" style="flex:1;font-size:var(--fs-xs);padding:3px 6px" value="${escHtml(sl[st.value] || st.label)}" placeholder="${st.label}">
        </div>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F4C8} ${t('kt_trend_icons')||'Trend Icons'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
        ${_ktTrendOptions.map(tr => `<div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:var(--fs-xs);min-width:70px">${tr.label}:</span>
          <input id="ktSettTrendIcon_${tr.value}" class="input" style="width:50px;font-size:14px;text-align:center;padding:2px" value="${escHtml(ti[tr.value] || tr.icon)}" maxlength="4">
        </div>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F3F7}\uFE0F ${t('kt_col_labels')||'Column Labels'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_col_labels_desc')||'Rename any column heading. Leave empty to use the default translation.'}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px">
        ${_ktState.columnOrder.map(c => {
          const defaultLabel = {seq_num:'Seq',zone:'Zone',priority:'Priority',function:'Function',status:'Status',trend:'Trend',threat:'Threat',external:'External',responsible:'Responsible',owner:'Owner',actions:'Actions',comments:'Comments',created_at:'Created',updated_at:'Updated',finished_at:'Finished',rounds:'# Cycles',management:'Management'}[c] || c;
          const current = (s.column_labels||{})[c] || '';
          return `<div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:10px;color:var(--text-dim);min-width:70px;white-space:nowrap">${defaultLabel}:</span>
            <input class="ktSettColLabel input" data-col="${c}" value="${escHtml(current)}" placeholder="${escHtml(defaultLabel)}" style="flex:1;font-size:var(--fs-xs);padding:3px 6px">
          </div>`;
        }).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F464} ${t('kt_col_responsibles')||'Column Responsibles'}</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);margin-bottom:6px;cursor:pointer">
        <input type="checkbox" id="ktSettShowColResp" ${s.show_column_responsibles ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('kt_col_responsibles_show')||'Show responsible on mouseover of column header / cells'}
      </label>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_col_responsibles_desc')||'Assign who is responsible for each column. The name appears as a native tooltip when hovering the column header or any cell in that column.'}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px">
        ${_ktState.columnOrder.filter(c => c !== 'management').map(c => {
          const defaultLabel = {seq_num:'Seq',zone:'Zone',priority:'Priority',function:'Function',status:'Status',trend:'Trend',threat:'Threat',external:'External',responsible:'Responsible',owner:'Owner',actions:'Actions',comments:'Comments',created_at:'Created',updated_at:'Updated',finished_at:'Finished',rounds:'# Cycles'}[c] || c;
          const current = (s.column_responsibles||{})[c] || '';
          return `<div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:10px;color:var(--text-dim);min-width:70px;white-space:nowrap">${escHtml(_ktColLabel(c, defaultLabel))}:</span>
            <input class="ktSettColResp input" data-col="${c}" value="${escHtml(current)}" placeholder="${t('kt_col_responsible_ph')||'@name or role'}" style="flex:1;font-size:var(--fs-xs);padding:3px 6px">
          </div>`;
        }).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F522} ${t('kt_sort_order')||'Sort Order'}</div>
      <select id="ktSettSortBy" class="input" style="width:100%;font-size:var(--fs-xs)">
        <option value="priority" ${sortBy==='priority'?'selected':''}>\u26A1 Priority</option>
        <option value="entry_order" ${sortBy==='entry_order'?'selected':''}>\u{1F4CB} Entry order (added)</option>
        <option value="function" ${sortBy==='function'?'selected':''}>\u{1F3AF} Function (A\u2013Z)</option>
        <option value="status" ${sortBy==='status'?'selected':''}>\u{1F4CA} Status</option>
        <option value="trend" ${sortBy==='trend'?'selected':''}>\u{1F4C8} Trend</option>
        <option value="responsible" ${sortBy==='responsible'?'selected':''}>\u{1F464} Responsible (A\u2013Z)</option>
        <option value="zone" ${sortBy==='zone'?'selected':''}>\u{1F310} Zone (A\u2013Z)</option>
        <option value="seq_num" ${sortBy==='seq_num'?'selected':''}># Seq Number</option>
      </select>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u{1F47B} ${t('kt_ghost_options')||'Ghosting Style'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_ghost_desc')||'How ghosted entries appear in the table.'}</p>
      <select id="ktSettGhostStyle" class="input" style="width:100%;font-size:var(--fs-xs)">
        <option value="grey" ${gs==='grey'?'selected':''}>\u{1F9CA} ${t('kt_ghost_grey')||'Grey out (reduced opacity + grey background)'}</option>
        <option value="strikethrough" ${gs==='strikethrough'?'selected':''}>\u{1F5D9} ${t('kt_ghost_strike')||'Strikethrough text'}</option>
        <option value="remove" ${gs==='remove'?'selected':''}>\u274C ${t('kt_ghost_remove')||'Hide from view completely'}</option>
      </select>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u2B80 ${t('kt_col_order')||'Column Order'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_col_order_desc')||'Use arrows to reorder columns.'}</p>
      <div id="ktSettColOrderList">
        ${_ktState.columnOrder.map((c, i) => {
          const colIcons = {seq_num:'#',zone:'\u{1F310}',priority:'\u26A1',function:'\u{1F3AF}',status:'\u{1F4CA}',trend:'\u{1F4C8}',threat:'\u2694\uFE0F',external:'\u{1F517}',responsible:'\u{1F464}',owner:'\u{1F451}',actions:'\u{1F527}',comments:'\u{1F4AC}',created_at:'\u{1F4C5}',updated_at:'\u{1F504}',finished_at:'\u2705',rounds:'\u{1F504}',management:'\u2699'};
          const defLabels = {seq_num:'Seq',zone:'Zone',priority:'Priority',function:'Function',status:'Status',trend:'Trend',threat:'Threat',external:'External',responsible:'Responsible',owner:'Owner',actions:'Actions',comments:'Comments',created_at:'Created',updated_at:'Updated',finished_at:'Finished',rounds:'# Cycles',management:'Management'};
          const label = (colIcons[c] || '') + ' ' + _ktColLabel(c, defLabels[c] || c);
          return `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:var(--bg2);border-radius:var(--radius);border:1px solid var(--border)">
            <button type="button" class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktSettMoveCol" data-args='[${i},-1]' ${i===0?'disabled':''}>\u25B2</button>
            <button type="button" class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktSettMoveCol" data-args='[${i},1]' ${i===_ktState.columnOrder.length-1?'disabled':''}>\u25BC</button>
            <span style="flex:1;font-size:var(--fs-xs)">${label}</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">\u23F1\uFE0F ${t('kt_battle_rhythm')||'Battle Rhythm'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:8px">${t('kt_battle_rhythm_desc')||'Shared exercise clock with cyclic steps. Every client sees the same H0.'}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-bottom:10px">
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer">
          <input type="checkbox" id="ktBrEnabled" ${br.enabled ? 'checked' : ''} style="accent-color:var(--accent)">
          ${t('kt_br_enabled')||'Enable battle rhythm'}
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer">
          <input type="checkbox" id="ktBrShowClock" ${br.show_clock !== false ? 'checked' : ''} style="accent-color:var(--accent)">
          ${t('kt_br_show_clock')||'Show clock widget on toolbar'}
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs)">
          ${t('kt_br_cycle_min')||'Cycle length (minutes)'}
          <input type="number" id="ktBrCycleMin" class="input" min="1" max="1440" value="${br.cycle_minutes || 120}" style="width:70px;font-size:var(--fs-xs);padding:3px 6px">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer">
          <input type="checkbox" id="ktBrShowSeconds" ${s.battle_rhythm_show_seconds ? 'checked' : ''} style="accent-color:var(--accent)">
          ${t('kt_br_show_seconds')||'Show seconds in H-offset (H+00:00 instead of H+00)'}
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer" title="${t('kt_br_step_end_sound_h')||'Play a short audio chime in the browser 60 seconds before the current step ends.'}">
          <input type="checkbox" id="ktBrStepEndSound" ${s.battle_rhythm_step_end_sound ? 'checked' : ''} style="accent-color:var(--accent)">
          \u{1F514} ${t('kt_br_step_end_sound')||'1-minute warning sound before a step ends'}
        </label>
      </div>
      <div style="margin-bottom:10px">
        <button type="button" class="btn btn-sm btn-secondary" data-action="_ktResetCyclesConfirm" style="font-size:10px">\u{1F504} ${t('kt_reset_cycles')||'Reset # Cycles counter on all rows'}</button>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${t('kt_reset_cycles_desc')||'Zero the # Cycles column for every non-archived entry. Use this to wipe the counter between exercises without rebuilding the board.'}</div>
      </div>
      <div style="font-weight:600;font-size:var(--fs-xs);margin:8px 0 4px">${t('kt_br_steps')||'Steps in one cycle'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_br_steps_desc')||'Offsets are in minutes from H0. Negative values schedule a step before H0. Leave End blank for an instant step.'}</p>
      <div id="ktBrStepList" style="margin-bottom:6px"></div>
      <button type="button" class="btn btn-sm btn-secondary" data-action="_ktBrAddStep" style="font-size:10px">+ ${t('kt_br_add_step')||'Add step'}</button>
      <div style="font-weight:600;font-size:var(--fs-xs);margin:12px 0 4px">${t('kt_br_snap_offsets')||'Snapshot offsets (minutes from H0)'}</div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_br_snap_offsets_desc')||'Comma-separated list, e.g. "0, 15, 60". A board snapshot is captured in each selected format when the clock reaches each offset, every cycle.'}</p>
      <input type="text" id="ktBrSnapOffsets" class="input" value="${escHtml(brSnapOffsets.join(', '))}" placeholder="0, 15, 60" style="width:100%;font-size:var(--fs-xs);padding:4px 6px">
      <div style="font-weight:600;font-size:var(--fs-xs);margin:12px 0 4px">${t('kt_br_snap_formats')||'Snapshot formats'}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${['csv','json','xml','svg'].map(f => `<label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);cursor:pointer">
          <input type="checkbox" class="ktBrSnapFmt" data-fmt="${f}" ${brSnapFormats.includes(f) ? 'checked' : ''} style="accent-color:var(--accent)">
          ${f.toUpperCase()}
        </label>`).join('')}
      </div>
      <div style="font-weight:600;font-size:var(--fs-xs);margin:14px 0 4px;display:flex;align-items:center;justify-content:space-between">
        <span>${t('kt_br_snap_files')||'Snapshot files on server'}</span>
        <button type="button" class="btn btn-sm btn-secondary" style="font-size:10px;padding:2px 8px" data-action="_ktBrReloadSnapFiles">\u21BB ${t('kt_br_snap_refresh')||'Reload'}</button>
      </div>
      <p style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${t('kt_br_snap_files_desc')||'Files previously written by the snapshot scheduler. Click a file to download it.'}</p>
      <div id="ktBrSnapFilesHost" style="max-height:160px;overflow-y:auto;font-size:10px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:4px">
        <div style="color:var(--text-dim);font-style:italic;padding:4px">${t('kt_br_snap_loading')||'Loading…'}</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktSaveSettings">\u2714 ${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktSettingsModal">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('ktSettingsModal', html, '620px');
  _ktTrapModalKeys('ktSettingsModal');
  _ktBrRenderStepList(brSteps);
  _ktBrReloadSnapFiles();
}

// _ktBrReloadSnapFiles populates the #ktBrSnapFilesHost panel inside
// the Key Terrain settings modal with the list of snapshot files the
// server-side battle-rhythm scheduler has written. The list groups
// files under the cycle-start directory and links each file to its
// download endpoint so teamlead+ can retrieve past snapshots.
async function _ktBrReloadSnapFiles() {
  const host = document.getElementById('ktBrSnapFilesHost');
  if (!host) return;
  host.textContent = t('kt_br_snap_loading') || 'Loading…';
  try {
    const groups = await _ktApi('GET', '/key-terrain/battle-rhythm/snapshots');
    if (!Array.isArray(groups) || groups.length === 0) {
      host.innerHTML = `<div style="color:var(--text-dim);font-style:italic;padding:4px">${escHtml(t('kt_br_snap_empty')||'No snapshots yet.')}</div>`;
      return;
    }
    const fmtSize = (n) => {
      if (n < 1024) return n + ' B';
      if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
      return (n/1048576).toFixed(1) + ' MB';
    };
    // Each group has a cycle_dir and files[]. The cycle_dir is the RFC3339
    // timestamp of when the cycle started (with colons replaced by dashes);
    // display it as a friendly title.
    host.innerHTML = groups.map(g => {
      // Try to parse back the cycle timestamp.
      let title = g.cycle_dir;
      const pretty = g.cycle_dir.replace(/-/g, ':').replace(/:(\d{2}):(\d{2})Z/, ':$1:$2Z');
      try {
        const d = new Date(pretty);
        if (!isNaN(d.getTime())) {
          title = d.toLocaleString();
        }
      } catch {}
      const files = (g.files || []).slice().sort((a, b) => (a.offset_min - b.offset_min) || a.name.localeCompare(b.name));
      // Convert a safe-timestamp like "2026-04-13T09-30-00Z" back to
      // a locale-formatted human-readable string. The time portion
      // has dashes instead of colons so the filename is portable;
      // we restore the colons before parsing.
      const fmtTakenAt = (stamp) => {
        if (!stamp) return '';
        // Replace only the dashes between the time components, not
        // the ones in the date. Pattern: YYYY-MM-DD T HH - MM - SS Z.
        const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
        try {
          const d = new Date(iso);
          if (!isNaN(d.getTime())) return d.toLocaleString();
        } catch {}
        return stamp;
      };
      return `<div style="margin-bottom:6px">
        <div style="font-weight:600;font-size:10px;color:var(--accent);margin-bottom:2px">\u{1F552} ${escHtml(title)}</div>
        ${files.map(f => {
          const url = '/api/key-terrain/battle-rhythm/snapshots/' + encodeURIComponent(g.cycle_dir) + '/' + encodeURIComponent(f.name);
          const takenAt = fmtTakenAt(f.taken_at || '');
          return `<div style="display:flex;align-items:center;gap:6px;padding:2px 4px">
            <a href="${url}" download="${escHtml(f.name)}" style="flex:1;color:var(--text);text-decoration:none;min-width:0" title="${escHtml(f.name)}">
              <span style="font-family:monospace;font-size:10px">H${f.offset_min >= 0 ? '+' : ''}${f.offset_min} ${escHtml((f.format || '').toUpperCase())}</span>
              ${takenAt ? `<span style="color:var(--text-dim);margin-left:6px;font-size:10px">${escHtml(takenAt)}</span>` : ''}
              <span style="color:var(--text-dim);margin-left:6px;font-size:10px">${fmtSize(f.size)}</span>
            </a>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  } catch (e) {
    host.innerHTML = `<div style="color:var(--status-down);padding:4px">${escHtml((t('kt_br_snap_error')||'Failed to load: ') + e.message)}</div>`;
  }
}

// ── Battle rhythm: step editor helpers ──
let _ktBrWorkingSteps = [];
function _ktBrRenderStepList(initial) {
  if (Array.isArray(initial)) _ktBrWorkingSteps = initial.map(s => Object.assign({}, s));
  const host = document.getElementById('ktBrStepList');
  if (!host) return;
  if (_ktBrWorkingSteps.length === 0) {
    host.innerHTML = `<div style="font-size:10px;color:var(--text-dim);padding:4px 0">${t('kt_br_no_steps')||'No steps defined yet.'}</div>`;
    return;
  }
  host.innerHTML = _ktBrWorkingSteps.map((step, i) => {
    const fallback = _ktBrPalette[i % _ktBrPalette.length];
    const colorVal = (step.color && /^#[0-9a-fA-F]{3,8}$/.test(step.color)) ? step.color : fallback;
    return `
    <div style="display:grid;grid-template-columns:1fr 70px 70px 34px auto;gap:4px;align-items:center;margin-bottom:4px;padding:4px;background:var(--bg2);border-radius:var(--radius);border-left:4px solid ${colorVal}">
      <input class="input ktBrStepName" data-idx="${i}" value="${escHtml(step.name||'')}" placeholder="${t('kt_br_step_name')||'Step name'}" style="font-size:var(--fs-xs);padding:3px 6px">
      <input class="input ktBrStepStart" data-idx="${i}" type="number" value="${step.start_offset_min ?? 0}" placeholder="Start" style="font-size:var(--fs-xs);padding:3px 6px" title="${t('kt_br_step_start_h')||'Start offset (minutes from H0)'}">
      <input class="input ktBrStepEnd" data-idx="${i}" type="number" value="${step.end_offset_min != null ? step.end_offset_min : ''}" placeholder="End" style="font-size:var(--fs-xs);padding:3px 6px" title="${t('kt_br_step_end_h')||'End offset or blank for instant'}">
      <input type="color" class="ktBrStepColor" data-idx="${i}" value="${colorVal}" title="${t('kt_br_step_color_h')||'Border colour while this step is active'}" style="width:30px;height:24px;border:none;cursor:pointer;padding:0;background:transparent">
      <button type="button" class="btn btn-sm btn-secondary" data-action="_ktBrRemoveStep" data-arg="${i}" style="font-size:10px;padding:2px 6px">\u2716</button>
      <input class="input ktBrStepDesc" data-idx="${i}" value="${escHtml(step.description||'')}" placeholder="${t('kt_br_step_desc')||'Description (optional)'}" style="grid-column:1/-1;font-size:10px;padding:2px 6px">
    </div>
  `;}).join('');
  // Re-bind the remove-step buttons we just injected; _bindActions from
  // the initial settings-modal open only processed the DOM present at
  // that moment.
  if (typeof _bindActions === 'function') _bindActions(host);
}
function _ktBrAddStep() {
  _ktBrFlushStepInputs();
  _ktBrWorkingSteps.push({ name: '', start_offset_min: 0, end_offset_min: null, description: '' });
  _ktBrRenderStepList();
}
function _ktBrRemoveStep(idx) {
  _ktBrFlushStepInputs();
  _ktBrWorkingSteps.splice(idx, 1);
  _ktBrRenderStepList();
}
function _ktBrFlushStepInputs() {
  // Copy the current DOM values back into _ktBrWorkingSteps before a re-render.
  document.querySelectorAll('.ktBrStepName').forEach(inp => {
    const i = parseInt(inp.dataset.idx, 10);
    if (_ktBrWorkingSteps[i]) _ktBrWorkingSteps[i].name = inp.value;
  });
  document.querySelectorAll('.ktBrStepStart').forEach(inp => {
    const i = parseInt(inp.dataset.idx, 10);
    if (_ktBrWorkingSteps[i]) _ktBrWorkingSteps[i].start_offset_min = parseInt(inp.value, 10) || 0;
  });
  document.querySelectorAll('.ktBrStepEnd').forEach(inp => {
    const i = parseInt(inp.dataset.idx, 10);
    if (_ktBrWorkingSteps[i]) {
      const v = inp.value.trim();
      _ktBrWorkingSteps[i].end_offset_min = v === '' ? null : parseInt(v, 10);
    }
  });
  document.querySelectorAll('.ktBrStepColor').forEach(inp => {
    const i = parseInt(inp.dataset.idx, 10);
    if (_ktBrWorkingSteps[i]) _ktBrWorkingSteps[i].color = inp.value;
  });
  document.querySelectorAll('.ktBrStepDesc').forEach(inp => {
    const i = parseInt(inp.dataset.idx, 10);
    if (_ktBrWorkingSteps[i]) _ktBrWorkingSteps[i].description = inp.value;
  });
}

async function _ktSaveSettings() {
  const pc = {};
  for (let n = 1; n <= 5; n++) {
    const v = document.getElementById('ktSettPriColor' + n)?.value;
    if (v && v !== '#888888') pc[String(n)] = v;
  }
  const si = {};
  _ktStatusOptions.forEach(st => {
    const v = document.getElementById('ktSettStatusIcon_' + st.value)?.value?.trim();
    if (v && v !== st.icon) si[st.value] = v;
  });
  const ti = {};
  _ktTrendOptions.forEach(tr => {
    const v = document.getElementById('ktSettTrendIcon_' + tr.value)?.value?.trim();
    if (v && v !== tr.icon) ti[tr.value] = v;
  });
  // Status labels
  const slOut = {};
  _ktStatusOptions.forEach(st => {
    const v = document.getElementById('ktSettStatusLabel_' + st.value)?.value?.trim();
    if (v && v !== st.label) slOut[st.value] = v;
  });
  // Hidden columns
  const hcOut = {};
  document.querySelectorAll('.ktSettHiddenCol').forEach(cb => {
    if (cb.checked) hcOut[cb.dataset.col] = true;
  });
  // Column label overrides — only persist non-empty values so unset entries
  // continue to use the localised default.
  const clOut = {};
  document.querySelectorAll('.ktSettColLabel').forEach(inp => {
    const v = inp.value.trim();
    if (v) clOut[inp.dataset.col] = v;
  });
  // Column responsibles — one name per column, assigned globally.
  // Empty entries are dropped.
  const crOut = {};
  document.querySelectorAll('.ktSettColResp').forEach(inp => {
    const v = inp.value.trim();
    if (v) crOut[inp.dataset.col] = v;
  });
  const showColResp = document.getElementById('ktSettShowColResp')?.checked || false;
  // Battle rhythm: collect config from the step editor and the snapshot
  // controls. Preserve StartedAt/PausedAt from the server-side settings so
  // saving the config while the clock is running does not stop the clock.
  _ktBrFlushStepInputs();
  const existingBr = _ktState.settings.battle_rhythm || {};
  const snapOffsetsRaw = (document.getElementById('ktBrSnapOffsets')?.value || '').trim();
  const snapOffsets = snapOffsetsRaw
    ? snapOffsetsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const snapFormats = Array.from(document.querySelectorAll('.ktBrSnapFmt:checked')).map(cb => cb.dataset.fmt);
  const battleRhythm = {
    enabled: document.getElementById('ktBrEnabled')?.checked || false,
    show_clock: document.getElementById('ktBrShowClock')?.checked !== false,
    cycle_minutes: parseInt(document.getElementById('ktBrCycleMin')?.value, 10) || 120,
    started_at: existingBr.started_at || null,
    paused_at: existingBr.paused_at || null,
    steps: _ktBrWorkingSteps.filter(st => (st.name || '').trim() !== ''),
    snapshot_offsets: snapOffsets,
    snapshot_formats: snapFormats,
  };
  const settings = {
    priority_colors: pc,
    status_icons: si,
    trend_icons: ti,
    sort_by: document.getElementById('ktSettSortBy')?.value || 'priority',
    ghost_style: document.getElementById('ktSettGhostStyle')?.value || 'grey',
    show_no_priority: document.getElementById('ktSettShowNoPriority')?.checked !== false,
    status_labels: slOut,
    hidden_columns: hcOut,
    column_labels: clOut,
    column_responsibles: crOut,
    show_column_responsibles: showColResp,
    battle_rhythm_show_seconds: document.getElementById('ktBrShowSeconds')?.checked || false,
    battle_rhythm_step_end_sound: document.getElementById('ktBrStepEndSound')?.checked || false,
    battle_rhythm: battleRhythm,
  };
  try {
    await _ktApi('PUT', '/key-terrain/settings', settings);
    _ktState.settings = settings;
    if (typeof _closeBoardModal === 'function') _closeBoardModal('ktSettingsModal');
    _renderKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_settings_saved')||'Settings saved');
  } catch (e) { alert('Error: ' + e.message); }
}

// ── Column Reorder ──
function _ktOpenColumnOrder() {
  const cols = _ktState.columnOrder;
  const colLabels = {
    seq_num: '# ' + (t('kt_seq_num')||'Seq'),
    zone: '\u{1F310} ' + (t('kt_zone')||'Zone'),
    priority: '\u26A1 ' + (t('kt_priority')||'Priority'),
    function: '\u{1F3AF} ' + (t('kt_function')||'Function'),
    status: '\u{1F4CA} ' + (t('kt_status')||'Status'),
    trend: '\u{1F4C8} ' + (t('kt_trend')||'Trend'),
    threat: '\u2694\uFE0F ' + (t('kt_threat')||'Threat'),
    external: '\u{1F517} ' + (t('kt_external')||'External'),
    responsible: '\u{1F464} ' + (t('kt_responsible')||'Responsible'),
    actions: '\u{1F527} ' + (t('kt_actions')||'Actions'),
    comments: '\u{1F4AC} ' + (t('kt_comments')||'Comments'),
    created_at: '\u{1F4C5} ' + (t('kt_created')||'Created'),
    updated_at: '\u{1F504} ' + (t('kt_updated')||'Updated'),
    finished_at: '\u2705 ' + (t('kt_finished')||'Finished'),
    rounds: '\u{1F504} ' + (t('kt_rounds')||'# Cycles'),
    management: '\u2699 ' + (t('kt_mgmt_label')||'Management'),
  };
  let html = `<div style="max-width:400px">
    <h3>\u2B80 ${t('kt_col_order')||'Column Order'}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">Drag or use arrows to reorder columns.</p>
    <div id="ktColOrderList">`;
  cols.forEach((c, i) => {
    html += `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:4px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border)">
      <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktMoveCol" data-args='[${i},-1]' ${i===0?'disabled':''}>\u25C0</button>
      <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktMoveCol" data-args='[${i},1]' ${i===cols.length-1?'disabled':''}>\u25B6</button>
      <span style="flex:1;font-size:var(--fs-xs)">${colLabels[c] || c}</span>
    </div>`;
  });
  html += `</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktColOrderModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('ktColOrderModal', html, '420px');
}
function _ktMoveCol(idx, dir) {
  const cols = _ktState.columnOrder;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= cols.length) return;
  const tmp = cols[idx];
  cols[idx] = cols[newIdx];
  cols[newIdx] = tmp;
  _ktOpenColumnOrder(); // re-render dialog
  _renderKeyTerrainBoard(); // re-render table behind
}
function _ktSettMoveCol(idx, dir) {
  const cols = _ktState.columnOrder;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= cols.length) return;
  const tmp = cols[idx];
  cols[idx] = cols[newIdx];
  cols[newIdx] = tmp;
  // Re-open settings to reflect new order
  _closeBoardModal('ktSettingsModal');
  _ktOpenSettings();
}

// ── Manage Panel (History, Versions, Print, Export) ──
function _ktOpenManagePanel() {
  const canWrite = _ktState.access.can_write;
  let html = `<div style="max-width:400px">
    <h3>\u{1F4CB} ${t('kt_manage')||'Manage & Export'}</h3>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-secondary" style="text-align:left;padding:8px 12px" data-action="_ktOpenHistoryLog">\u{1F4DC} ${t('kt_history_log')||'History Log'}</button>
      ${canWrite ? `<button class="btn btn-secondary" style="text-align:left;padding:8px 12px" data-action="_ktOpenVersions">\u{1F4CB} ${t('kt_versions')||'Versions / Snapshots'}</button>` : ''}
      <hr style="margin:4px 0;border:none;border-top:1px solid var(--border)">
      <button class="btn btn-secondary" style="text-align:left;padding:8px 12px" data-action="_ktPrint">\u{1F5A8} ${t('kt_print')||'Print'}</button>
      <div style="font-weight:600;font-size:var(--fs-xs);margin-top:4px">\u2B07 ${t('kt_export')||'Export'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="json">JSON</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="xml">XML</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="csv">CSV</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="xlsx">XLSX</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="ods">ODS</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="md">Markdown</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="pdf">PDF</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="svg">SVG</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="jpeg">JPEG</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="tiff">TIFF</button>
        <button class="btn btn-secondary btn-sm" data-action="_ktExport" data-arg="bmp">BMP</button>
      </div>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktManageModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('ktManageModal', html, '420px');
}

// ── Print ──
// _ktPrint opens a column-selection dialog, then builds a filtered
// print view of the currently-displayed KT board. The dialog lets the
// operator tick/untick which columns should be included so the printout
// can be tailored for a briefing (e.g. drop internal fields like Owner
// or the timestamp columns). Selection is remembered per browser via
// localStorage so repeated prints don't require re-picking.
function _ktPrint() {
  // Default selection: current visible columns on the board. Operator
  // choices made in a previous print session override the defaults via
  // localStorage['ktPrintCols'] (set after Print is clicked).
  const hidden = _ktState.hiddenColumns || {};
  const canWrite = _ktState.access && _ktState.access.can_write;
  const allCols = _ktState.columnOrder.filter(c => c !== 'management'); // management is interactive, never printed
  let saved = [];
  try {
    const raw = localStorage.getItem('ktPrintCols');
    if (raw) saved = JSON.parse(raw);
  } catch {}
  const selected = new Set(
    Array.isArray(saved) && saved.length > 0
      ? saved.filter(c => allCols.includes(c))
      : allCols.filter(c => !hidden[c])
  );
  const colMeta = {
    seq_num:     { icon: '#',         dflt: 'Seq' },
    zone:        { icon: '\u{1F310}', dflt: 'Zone' },
    priority:    { icon: '\u26A1',    dflt: 'Priority' },
    function:    { icon: '\u{1F3AF}', dflt: 'Function' },
    status:      { icon: '\u{1F4CA}', dflt: 'Status' },
    trend:       { icon: '\u{1F4C8}', dflt: 'Trend' },
    threat:      { icon: '\u2694\uFE0F', dflt: 'Threat' },
    external:    { icon: '\u{1F517}', dflt: 'External' },
    responsible: { icon: '\u{1F464}', dflt: 'Responsible' },
    owner:       { icon: '\u{1F451}', dflt: 'Owner' },
    actions:     { icon: '\u{1F527}', dflt: 'Actions' },
    comments:    { icon: '\u{1F4AC}', dflt: 'Comments' },
    created_at:  { icon: '\u{1F4C5}', dflt: 'Created' },
    updated_at:  { icon: '\u{1F504}', dflt: 'Updated' },
    finished_at: { icon: '\u2705',    dflt: 'Finished' },
    rounds:      { icon: '\u{1F504}', dflt: '# Cycles' },
  };
  const rows = allCols.map(c => {
    const meta = colMeta[c] || { icon: '', dflt: c };
    const label = (meta.icon ? meta.icon + ' ' : '') + _ktColLabel(c, meta.dflt);
    return `<label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-xs);cursor:pointer;padding:4px 6px;background:var(--bg3);border-radius:var(--radius)">
      <input type="checkbox" class="ktPrintCb" data-col="${c}" ${selected.has(c) ? 'checked' : ''} style="accent-color:var(--accent)">
      ${escHtml(label)}
    </label>`;
  }).join('');
  const html = `<div style="max-width:460px">
    <h3>\u{1F5A8} ${t('kt_print_title')||'Print Key Terrain Board'}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">${t('kt_print_desc')||'Select which columns should appear in the printout.'}</p>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button type="button" class="btn btn-sm btn-secondary" data-action="_ktPrintSelectAll">${t('kt_print_all')||'Select all'}</button>
      <button type="button" class="btn btn-sm btn-secondary" data-action="_ktPrintSelectNone">${t('kt_print_none')||'Select none'}</button>
      <button type="button" class="btn btn-sm btn-secondary" data-action="_ktPrintSelectVisible">${t('kt_print_visible')||'Currently visible'}</button>
    </div>
    <div id="ktPrintColList" style="display:flex;flex-direction:column;gap:4px;max-height:360px;overflow-y:auto;margin-bottom:12px">${rows}</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" data-action="_ktDoPrint">\u{1F5A8} ${t('btn_print')||'Print'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktPrintModal">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('ktPrintModal', html, '480px');
}

function _ktPrintSelectAll() {
  document.querySelectorAll('.ktPrintCb').forEach(cb => { cb.checked = true; });
}
function _ktPrintSelectNone() {
  document.querySelectorAll('.ktPrintCb').forEach(cb => { cb.checked = false; });
}
function _ktPrintSelectVisible() {
  const hidden = _ktState.hiddenColumns || {};
  document.querySelectorAll('.ktPrintCb').forEach(cb => {
    cb.checked = !hidden[cb.dataset.col];
  });
}

function _ktDoPrint() {
  const chosen = Array.from(document.querySelectorAll('.ktPrintCb:checked')).map(cb => cb.dataset.col);
  if (chosen.length === 0) {
    if (typeof showError === 'function') showError(t('kt_print_empty')||'Select at least one column to print.');
    else alert(t('kt_print_empty')||'Select at least one column to print.');
    return;
  }
  try { localStorage.setItem('ktPrintCols', JSON.stringify(chosen)); } catch {}
  // Build a fresh print window with a filtered table so the printout
  // shows ONLY the selected columns in the operator's current column
  // order. We walk the live entries rather than cloning DOM rows so
  // the cell contents are plain text (stripped of rich-HTML) and the
  // print layout isn't affected by the board's current zoom level.
  const entries = _ktState.entries.filter(e => !e.archived);
  const sorted = _ktSortEntries(entries);
  const cols = _ktState.columnOrder.filter(c => chosen.includes(c));
  const colMeta = {
    seq_num:     { icon: '#',         dflt: 'Seq' },
    zone:        { icon: '\u{1F310}', dflt: 'Zone' },
    priority:    { icon: '\u26A1',    dflt: 'Priority' },
    function:    { icon: '\u{1F3AF}', dflt: 'Function' },
    status:      { icon: '\u{1F4CA}', dflt: 'Status' },
    trend:       { icon: '\u{1F4C8}', dflt: 'Trend' },
    threat:      { icon: '\u2694\uFE0F', dflt: 'Threat' },
    external:    { icon: '\u{1F517}', dflt: 'External' },
    responsible: { icon: '\u{1F464}', dflt: 'Responsible' },
    owner:       { icon: '\u{1F451}', dflt: 'Owner' },
    actions:     { icon: '\u{1F527}', dflt: 'Actions' },
    comments:    { icon: '\u{1F4AC}', dflt: 'Comments' },
    created_at:  { icon: '\u{1F4C5}', dflt: 'Created' },
    updated_at:  { icon: '\u{1F504}', dflt: 'Updated' },
    finished_at: { icon: '\u2705',    dflt: 'Finished' },
    rounds:      { icon: '\u{1F504}', dflt: '# Cycles' },
  };
  const headers = cols.map(c => {
    const meta = colMeta[c] || { icon: '', dflt: c };
    return (meta.icon ? meta.icon + ' ' : '') + _ktColLabel(c, meta.dflt);
  });
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const rowsHtml = sorted.map(e => {
    return '<tr>' + cols.map(c => {
      const txt = _ktCellText(e, c);
      return '<td>' + esc(txt).replace(/\n/g, '<br>') + '</td>';
    }).join('') + '</tr>';
  }).join('');
  const _ts = new Date().toISOString().slice(0, 10);
  const docTitle = `tidslinjal-key-terrain-board-${_ts}`;
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) {
    alert('Popup blocked — please allow popups for this site so the print window can open.');
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(docTitle)}</title>
    <style>
    @page { size: landscape; margin: 1cm; }
    body { font-family: system-ui, sans-serif; padding: 20px; font-size: 11px; }
    h2 { margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 12px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 5px 7px; border: 1px solid #ccc; text-align: left; vertical-align: top; }
    th { background: #eee; font-weight: 700; }
    tr:nth-child(even) { background: #f9f9f9; }
    @media print {
      button { display: none !important; }
      .subtitle { font-size: 10px; }
    }
    </style></head><body>
    <h2>\u{1F3D4}\uFE0F ${esc(t('kt_title') || 'Key Terrain Board')}</h2>
    <div class="subtitle">${esc(new Date().toLocaleString())} — ${sorted.length} entries, ${cols.length} columns</div>
    <table>
      <thead><tr>${headers.map(h => '<th>' + esc(h) + '</th>').join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <br><button id="ktPrintBtn">\u{1F5A8} Print</button>
    </body></html>`);
  w.document.title = docTitle;
  w.document.close();
  if (typeof _closeBoardModal === 'function') _closeBoardModal('ktPrintModal');
  setTimeout(() => {
    w.document.title = docTitle;
    const btn = w.document.getElementById('ktPrintBtn');
    if (btn) btn.addEventListener('click', () => w.print());
    w.print();
  }, 300);
}

// ── Export ──
function _ktToggleExportMenu() {
  const menu = document.getElementById('ktExportMenu');
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}
function _ktExport(format) {
  const menu = document.getElementById('ktExportMenu');
  if (menu) menu.style.display = 'none';
  const entries = _ktState.entries.filter(e => !e.archived);
  const sorted = _ktSortEntries(entries);
  const cols = _ktState.columnOrder;

  if (format === 'json') {
    const data = JSON.stringify(sorted, null, 2);
    _ktDownload(data, 'key-terrain.json', 'application/json');
  } else if (format === 'csv') {
    const headers = cols.map(c => c).join(',');
    const rows = sorted.map(e => cols.map(c => {
      let v = _ktCellText(e, c);
      return '"' + v.replace(/"/g, '""') + '"';
    }).join(','));
    _ktDownload(headers + '\n' + rows.join('\n'), 'key-terrain.csv', 'text/csv');
  } else if (format === 'xml') {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<key_terrain>\n';
    for (const e of sorted) {
      xml += '  <entry>\n';
      cols.forEach(c => { xml += `    <${c}>${_ktXmlEsc(_ktCellText(e, c))}</${c}>\n`; });
      xml += '  </entry>\n';
    }
    xml += '</key_terrain>';
    _ktDownload(xml, 'key-terrain.xml', 'application/xml');
  } else if (format === 'md') {
    let md = '# Key Terrain Board\n\n';
    md += '| ' + cols.filter(c => c !== 'management').map(c => c).join(' | ') + ' |\n';
    md += '| ' + cols.filter(c => c !== 'management').map(() => '---').join(' | ') + ' |\n';
    for (const e of sorted) {
      md += '| ' + cols.filter(c => c !== 'management').map(c => _ktCellText(e, c).replace(/\|/g, '\\|')).join(' | ') + ' |\n';
    }
    _ktDownload(md, 'key-terrain.md', 'text/markdown');
  } else if (format === 'xlsx' || format === 'ods') {
    // For spreadsheet formats, download CSV and let user convert, or use CSV as fallback
    const headers = cols.filter(c => c !== 'management').map(c => c).join(',');
    const rows = sorted.map(e => cols.filter(c => c !== 'management').map(c => {
      let v = _ktCellText(e, c);
      return '"' + v.replace(/"/g, '""') + '"';
    }).join(','));
    _ktDownload(headers + '\n' + rows.join('\n'), 'key-terrain.' + format + '.csv', 'text/csv');
  } else if (format === 'pdf' || format === 'svg' || format === 'jpeg' || format === 'tiff' || format === 'bmp') {
    _ktExportImage(format);
  }
}
function _ktCellText(e, col) {
  switch (col) {
    case 'seq_num': return String(e.seq_num || '');
    case 'zone': return e.zone || '';
    case 'priority': return String(e.priority || '');
    case 'function': return e.function || '';
    case 'status': return e.status || '';
    case 'trend': return e.trend || '';
    case 'threat': return (e.threat || '').replace(/<[^>]*>/g, '');
    case 'external': return (e.external || '').replace(/<[^>]*>/g, '');
    case 'responsible': return e.responsible_name || '';
    case 'actions': return (e.actions || '').replace(/<[^>]*>/g, '');
    case 'comments': return e.comments || '';
    case 'created_at': return e.created_at ? new Date(e.created_at).toLocaleDateString() : '';
    case 'updated_at': return e.updated_at ? new Date(e.updated_at).toLocaleString() : '';
    case 'finished_at': return e.finished_at ? new Date(e.finished_at).toLocaleDateString() : '';
    case 'rounds': return String(e.rounds || 0);
    case 'management': return '';
    default: return '';
  }
}
function _ktXmlEsc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _ktDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function _ktExportImage(format) {
  // Build an HTML table, render to a new window for printing/saving
  const entries = _ktState.entries.filter(e => !e.archived);
  const sorted = _ktSortEntries(entries);
  const cols = _ktState.columnOrder;
  const colLabels = { priority:'Priority', function:'Function', status:'Status', trend:'Trend', threat:'Threat', external:'External', responsible:'Responsible', actions:'Actions', comments:'Comments' };

  let tableHtml = '<table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;font-size:12px"><thead><tr>';
  cols.forEach(c => { tableHtml += `<th style="padding:6px 8px;border:1px solid #ccc;background:#eee">${colLabels[c]||c}</th>`; });
  tableHtml += '</tr></thead><tbody>';
  for (const e of sorted) {
    tableHtml += '<tr>';
    cols.forEach(c => { tableHtml += `<td style="padding:6px 8px;border:1px solid #ccc">${_ktXmlEsc(_ktCellText(e, c))}</td>`; });
    tableHtml += '</tr>';
  }
  tableHtml += '</tbody></table>';

  if (format === 'svg') {
    // Wrap as SVG foreignObject
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${60 + sorted.length * 32}">
      <foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="padding:10px">
        <h3 style="font-family:system-ui;margin:0 0 8px">\u{1F3D4}\uFE0F Key Terrain Board</h3>
        ${tableHtml}</div></foreignObject></svg>`;
    _ktDownload(svg, 'key-terrain.svg', 'image/svg+xml');
  } else {
    // PDF / JPEG: open in new window for browser print-to-PDF or screenshot
    const w = window.open('', '_blank', 'width=1100,height=800');
    w.document.write(`<!DOCTYPE html><html><head><title>Key Terrain Board</title>
      <style>body{font-family:system-ui,sans-serif;padding:20px;font-size:12px;background:#fff}
      table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #ccc;text-align:left}
      th{background:#eee;font-weight:700}</style></head><body>`);
    w.document.write(`<h2>\u{1F3D4}\uFE0F Key Terrain Board</h2><p style="color:#666;font-size:11px">${new Date().toLocaleString()}</p>`);
    w.document.write(tableHtml);
    if (format === 'pdf') {
      w.document.write('<p style="margin-top:12px;font-size:10px;color:#999">Use your browser\'s "Save as PDF" option in the print dialog.</p>');
    } else {
      w.document.write('<p style="margin-top:12px;font-size:10px;color:#999">Right-click the page and choose "Save image" or take a screenshot.</p>');
    }
    w.document.close();
    if (format === 'pdf') setTimeout(() => w.print(), 300);
  }
}

// ── Sortable column header helper ──
function _ktSortTh(col, label, align, extra) {
  const cs = _ktState.columnSort;
  const arrow = cs && cs.col === col ? (cs.dir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  // Optional native title tooltip showing "who is responsible for
  // this column" when the operator has configured ColumnResponsibles
  // and enabled ShowColumnResponsibles in Settings → Column Responsibles.
  const title = _ktColResponsibleTitle(col);
  const titleAttr = title ? ` title="${escHtml(title)}"` : '';
  return `<th style="padding:8px;text-align:${align};cursor:pointer;user-select:none;${extra}" data-action="_ktSortByColumn" data-arg="${col}"${titleAttr}>${label}${arrow}</th>`;
}

// _ktColResponsibleTitle returns the native-title text for a given
// column, or an empty string if the feature is disabled or no
// responsible is assigned. The returned text is plain ASCII + a
// single Unicode separator so it renders correctly in browser
// native tooltips on every platform.
function _ktColResponsibleTitle(col) {
  const s = _ktState.settings || {};
  if (!s.show_column_responsibles) return '';
  const who = (s.column_responsibles || {})[col];
  if (!who) return '';
  return (t('kt_col_responsible_prefix')||'Responsible:') + ' ' + who;
}

// ── Move row up/down ──
async function _ktMoveEntry(id, direction) {
  const active = _ktState.entries.filter(e => !e.archived);
  const sorted = _ktSortEntries(active);
  const idx = sorted.findIndex(e => e.id === id);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= sorted.length) return;
  // Swap priorities to swap positions
  const myPri = sorted[idx].priority || idx + 1;
  const otherPri = sorted[newIdx].priority || newIdx + 1;
  try {
    await Promise.all([
      _ktApi('PUT', '/key-terrain/' + sorted[idx].id, { priority: otherPri }),
      _ktApi('PUT', '/key-terrain/' + sorted[newIdx].id, { priority: myPri }),
    ]);
    await openKeyTerrainBoard();
  } catch (e) { alert('Error: ' + e.message); }
}

// ── Board-level History Log ──
function _ktOpenHistoryLog() {
  // Aggregate all history from all entries, sorted newest first
  const all = [];
  for (const e of _ktState.entries) {
    if (e.history) {
      for (const h of e.history) {
        all.push({ ...h, entryFunction: e.function, entryId: e.id });
      }
    }
  }
  all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  let html = `<div style="max-width:600px">
    <h3>\u{1F4DC} ${t('kt_history_log')||'Key Terrain History Log'}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">${t('kt_history_log_desc')||'All changes across every entry, sorted by time.'}</p>`;

  if (all.length === 0) {
    html += `<p style="color:var(--text-dim)">${t('kt_no_history')||'No history yet.'}</p>`;
  } else {
    html += `<div style="max-height:450px;overflow-y:auto">`;
    for (const h of all) {
      const ts = new Date(h.timestamp).toLocaleString();
      html += `<div style="padding:8px;border-bottom:1px solid var(--border);font-size:var(--fs-xs)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:600">${escHtml(h.entryFunction)}</span>
          <span style="color:var(--text-dim);font-size:10px">${ts}</span>
        </div>
        <div style="margin-top:2px">
          <span style="color:var(--text-dim)">${escHtml(h.user_name)}</span> changed <strong>${escHtml(h.field)}</strong>${h.old_value ? `: <span style="text-decoration:line-through;color:var(--danger)">${escHtml(h.old_value)}</span> \u2192 ` : ': '}${escHtml(h.new_value)}
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div style="margin-top:12px">
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktHistLogModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('ktHistLogModal', html, '620px');
}

// ── Version Control (Snapshots) ──
async function _ktOpenVersions() {
  let snapshots = [];
  try { snapshots = await _ktApi('GET', '/key-terrain/snapshots'); } catch {}

  let html = `<div style="max-width:600px">
    <h3>\u{1F4CB} ${t('kt_versions')||'Key Terrain Versions'}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">${t('kt_versions_desc')||'Save snapshots of the board to track how it looked at different points in time.'}</p>

    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input id="ktSnapshotLabel" class="input" style="flex:1;font-size:var(--fs-xs)" placeholder="${t('kt_snapshot_label')||'Optional label (e.g. "Before exercise")'}">
      <button class="btn btn-primary btn-sm" data-action="_ktCreateSnapshot">\u{1F4F8} ${t('kt_snapshot_save')||'Save Snapshot'}</button>
    </div>`;

  if (snapshots.length === 0) {
    html += `<p style="color:var(--text-dim);font-size:var(--fs-xs)">${t('kt_no_versions')||'No snapshots saved yet.'}</p>`;
  } else {
    html += `<div style="max-height:350px;overflow-y:auto">`;
    for (const s of [...snapshots].reverse()) {
      const ts = new Date(s.timestamp).toLocaleString();
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);font-size:var(--fs-xs)">
        <div>
          <div style="font-weight:600">${s.label ? escHtml(s.label) : `Snapshot #${s.id}`}</div>
          <div style="color:var(--text-dim)">${ts} \u00B7 ${escHtml(s.user_name)} \u00B7 ${s.entry_count} entries</div>
        </div>
        <button class="btn btn-sm btn-secondary" style="font-size:10px" data-action="_ktViewSnapshot" data-arg="${s.id}">\u{1F441} ${t('kt_view')||'View'}</button>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div style="margin-top:12px">
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktVersionsModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('ktVersionsModal', html, '620px');
  _ktTrapModalKeys('ktVersionsModal');
}

async function _ktCreateSnapshot() {
  const label = document.getElementById('ktSnapshotLabel')?.value?.trim() || '';
  try {
    await _ktApi('POST', '/key-terrain/snapshots', { label });
    if (typeof showNotification === 'function') showNotification('success', t('kt_snapshot_created')||'Snapshot saved');
    await _ktOpenVersions(); // refresh list
  } catch (e) { alert('Error: ' + e.message); }
}

async function _ktViewSnapshot(snapId) {
  let snap;
  try { snap = await _ktApi('GET', '/key-terrain/snapshots/' + snapId); } catch (e) { alert('Error: ' + e.message); return; }

  const entries = snap.entries || [];
  const ts = new Date(snap.timestamp).toLocaleString();
  const sorted = [...entries].sort((a, b) => (a.priority || 999) - (b.priority || 999));

  let html = `<div style="max-width:900px">
    <h3>\u{1F441} ${snap.label ? escHtml(snap.label) : 'Snapshot #' + snap.id}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">${ts} \u00B7 ${escHtml(snap.user_name)} \u00B7 ${entries.length} entries</p>

    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
        <thead>
          <tr style="background:var(--bg3);border-bottom:2px solid var(--border)">
            <th style="padding:6px 8px;text-align:left">Pri</th>
            <th style="padding:6px 8px;text-align:left">Function</th>
            <th style="padding:6px 8px;text-align:center">Status</th>
            <th style="padding:6px 8px;text-align:center">Trend</th>
            <th style="padding:6px 8px;text-align:left">Threat</th>
            <th style="padding:6px 8px;text-align:left">External</th>
            <th style="padding:6px 8px;text-align:left">Responsible</th>
            <th style="padding:6px 8px;text-align:left">Actions</th>
          </tr>
        </thead>
        <tbody>`;

  for (const e of sorted) {
    const statusOpt = _ktStatusOptions.find(s => s.value === e.status) || _ktStatusOptions[3];
    const trendOpt = _ktTrendOptions.find(tr => tr.value === e.trend) || _ktTrendOptions[1];
    html += `<tr style="background:${statusOpt.color};border-bottom:1px solid var(--border)${e.ghosted ? ';opacity:0.5' : ''}${e.archived ? ';text-decoration:line-through' : ''}">
      <td style="padding:6px 8px;font-weight:700;text-align:center">${e.priority || '\u2014'}</td>
      <td style="padding:6px 8px;font-weight:600">${escHtml(e.function)}</td>
      <td style="padding:6px 8px;text-align:center">${statusOpt.icon} ${statusOpt.label}</td>
      <td style="padding:6px 8px;text-align:center">${trendOpt.icon} ${trendOpt.label}</td>
      <td style="padding:6px 8px">${escHtml(e.threat || '\u2014')}</td>
      <td style="padding:6px 8px">${escHtml(e.external || '\u2014')}</td>
      <td style="padding:6px 8px">${escHtml(e.responsible_name || '\u2014')}</td>
      <td style="padding:6px 8px">${escHtml(e.actions || '\u2014')}</td>
    </tr>`;
  }

  html += `</tbody></table></div>
    <div style="margin-top:12px">
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktSnapshotViewModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('ktSnapshotViewModal', html, '940px');
}

// ── Column Visibility (hide/unhide) ──
function _ktOpenColumnVisibility() {
  const allCols = _ktState.columnOrder;
  const hidden = _ktState.hiddenColumns || {};
  // Icon + default label per column. The default label is only used
  // if the operator hasn't overridden the heading under Settings →
  // Column Labels and the current language has no translation. This
  // list MUST cover every column in columnOrder — otherwise a newly
  // added column (like "comments") shows up as a bare column id in
  // the show/hide dialog.
  const colMeta = {
    seq_num:     { icon: '#',          dflt: 'Seq' },
    zone:        { icon: '\u{1F310}',  dflt: 'Zone' },
    priority:    { icon: '\u26A1',     dflt: 'Priority' },
    function:    { icon: '\u{1F3AF}',  dflt: 'Function' },
    status:      { icon: '\u{1F4CA}',  dflt: 'Status' },
    trend:       { icon: '\u{1F4C8}',  dflt: 'Trend' },
    threat:      { icon: '\u2694\uFE0F', dflt: 'Threat' },
    external:    { icon: '\u{1F517}',  dflt: 'External' },
    responsible: { icon: '\u{1F464}',  dflt: 'Responsible' },
    owner:       { icon: '\u{1F451}',  dflt: 'Owner' },
    actions:     { icon: '\u{1F527}',  dflt: 'Actions' },
    comments:    { icon: '\u{1F4AC}',  dflt: 'Comments' },
    created_at:  { icon: '\u{1F4C5}',  dflt: 'Created' },
    updated_at:  { icon: '\u{1F504}',  dflt: 'Updated' },
    finished_at: { icon: '\u2705',     dflt: 'Finished' },
    rounds:      { icon: '\u{1F504}',  dflt: '# Cycles' },
    management:  { icon: '\u2699',     dflt: 'Management' },
  };
  let html = `<div style="max-width:400px">
    <h3>\u{1F441} ${t('kt_columns_vis')||'Show / Hide Columns'}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">${t('kt_columns_vis_desc')||'Toggle which columns are visible in the table.'}</p>
    <div style="display:flex;flex-direction:column;gap:4px">`;
  for (const c of allCols) {
    const isHidden = !!hidden[c];
    const meta = colMeta[c] || { icon: '', dflt: c };
    // _ktColLabel resolves the custom override → localized default →
    // hardcoded fallback, so the show/hide list uses the same labels
    // the operator sees in the table header.
    const label = (meta.icon ? meta.icon + ' ' : '') + _ktColLabel(c, meta.dflt);
    html += `<label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-xs);cursor:pointer;padding:4px 6px;background:var(--bg3);border-radius:var(--radius)">
      <input type="checkbox" ${!isHidden ? 'checked' : ''} data-col="${c}" class="ktVisCheck" style="accent-color:var(--accent)">
      ${escHtml(label)}
    </label>`;
  }
  html += `</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktApplyColumnVisibility">\u2714 ${t('kt_apply')||'Apply'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktColVisModal">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('ktColVisModal', html, '400px');
}

function _ktApplyColumnVisibility() {
  const checks = document.querySelectorAll('.ktVisCheck');
  const hidden = {};
  checks.forEach(chk => {
    if (!chk.checked) hidden[chk.dataset.col] = true;
  });
  _ktState.hiddenColumns = hidden;
  if (typeof _closeBoardModal === 'function') _closeBoardModal('ktColVisModal');
  _renderKeyTerrainBoard();
}

// ── Filter Panel ──
function _ktOpenFilter() {
  const f = _ktState.filter || {};

  // Collect unique function names from the CURRENT live entries. This
  // is recomputed each time the filter modal opens, so any function
  // added to the board since last time appears in the checkbox list.
  // Trim whitespace + dedupe case-insensitively so "Power" and "power "
  // don't show up as separate entries.
  const seen = new Set();
  const capNames = [];
  (_ktState.entries || []).forEach(e => {
    const fn = (e.function || '').trim();
    if (!fn) return;
    const key = fn.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    capNames.push(fn);
  });
  capNames.sort((a, b) => a.localeCompare(b));
  const checkedCaps = f.functionChecks || [];

  // Priority checkboxes 0-10
  const checkedPris = f.priorityChecks || [];

  // Status checkboxes
  const checkedStatuses = f.statusChecks || [];

  // Trend checkboxes
  const checkedTrends = f.trendChecks || [];

  const cbStyle = 'font-size:var(--fs-xs);display:flex;align-items:center;gap:4px;cursor:pointer';

  // Use the custom column labels (_ktColLabel) so the filter panel shows
  // the same headings the operator configured under Settings → Column
  // Labels. Falls back to the localized defaults when no override is set.
  const lblFunction    = _ktColLabel('function',    t('kt_function')||'Function');
  const lblPriority    = _ktColLabel('priority',    t('kt_priority')||'Priority');
  const lblStatus      = _ktColLabel('status',      t('kt_status')||'Status');
  const lblTrend       = _ktColLabel('trend',       t('kt_trend')||'Trend');
  const lblThreat      = _ktColLabel('threat',      t('kt_threat')||'Threat');
  const lblResponsible = _ktColLabel('responsible', t('kt_responsible')||'Responsible');
  const lblActions     = _ktColLabel('actions',     t('kt_actions')||'Actions');
  const lblComments    = _ktColLabel('comments',    t('kt_comments')||'Comments');

  let html = `<div style="max-width:540px">
    <h3>\u{1F50D} ${t('kt_filter')||'Filter Key Terrain'}</h3>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F3AF} ${escHtml(lblFunction)}</label>
      <input id="ktFilterFunction" class="input" style="width:100%;font-size:var(--fs-xs);margin-bottom:6px" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.function||'')}">
      ${capNames.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px 12px;max-height:120px;overflow-y:auto;padding:4px;background:var(--bg2);border-radius:var(--radius)">
        ${capNames.map(c => `<label style="${cbStyle}"><input type="checkbox" class="ktFilterCapCb" value="${escHtml(c)}" ${checkedCaps.includes(c)?'checked':''}> ${escHtml(c)}</label>`).join('')}
      </div>` : `<div style="font-size:10px;color:var(--text-dim);font-style:italic">${t('kt_filter_no_functions')||'No functions added to the board yet.'}</div>`}
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u26A1 ${escHtml(lblPriority)}</label>
      <input id="ktFilterPriority" type="number" class="input" style="width:100%;font-size:var(--fs-xs);margin-bottom:6px" placeholder="${t('kt_filter_any')||'Any'}" value="${f.priority||''}" min="0">
      <div style="display:flex;flex-wrap:wrap;gap:4px 12px;padding:4px;background:var(--bg2);border-radius:var(--radius)">
        ${Array.from({length:11},(_,i)=>i).map(i => `<label style="${cbStyle}"><input type="checkbox" class="ktFilterPriCb" value="${i}" ${checkedPris.includes(i)?'checked':''}> ${i}</label>`).join('')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F4CA} ${escHtml(lblStatus)}</label>
        <select id="ktFilterStatus" class="input" style="width:100%;font-size:var(--fs-xs);margin-bottom:6px">
          <option value="">\u2014 ${t('kt_filter_any')||'Any'} \u2014</option>
          ${_ktStatusOptions.map(s => `<option value="${s.value}" ${f.status===s.value?'selected':''}>${s.icon} ${s.label}</option>`).join('')}
        </select>
        <div style="display:flex;flex-direction:column;gap:4px;padding:4px;background:var(--bg2);border-radius:var(--radius)">
          ${_ktStatusOptions.map(s => `<label style="${cbStyle}"><input type="checkbox" class="ktFilterStatusCb" value="${s.value}" ${checkedStatuses.includes(s.value)?'checked':''}> ${s.icon} ${s.label}</label>`).join('')}
        </div>
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F4C8} ${escHtml(lblTrend)}</label>
        <select id="ktFilterTrend" class="input" style="width:100%;font-size:var(--fs-xs);margin-bottom:6px">
          <option value="">\u2014 ${t('kt_filter_any')||'Any'} \u2014</option>
          ${_ktTrendOptions.map(tr => `<option value="${tr.value}" ${f.trend===tr.value?'selected':''}>${tr.icon} ${tr.label}</option>`).join('')}
        </select>
        <div style="display:flex;flex-direction:column;gap:4px;padding:4px;background:var(--bg2);border-radius:var(--radius)">
          ${_ktTrendOptions.map(tr => `<label style="${cbStyle}"><input type="checkbox" class="ktFilterTrendCb" value="${tr.value}" ${checkedTrends.includes(tr.value)?'checked':''}> ${tr.icon} ${tr.label}</label>`).join('')}
        </div>
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u2694\uFE0F ${escHtml(lblThreat)}</label>
      <input id="ktFilterThreat" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.threat||'')}">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F464} ${escHtml(lblResponsible)}</label>
        <input id="ktFilterResponsible" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.responsible||'')}">
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F527} ${escHtml(lblActions)}</label>
        <input id="ktFilterActions" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.actions||'')}">
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F4AC} ${escHtml(lblComments)}</label>
      <input id="ktFilterComments" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.comments||'')}">
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktApplyFilter">\u2714 ${t('kt_filter_apply')||'Apply'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_ktClearFilter">\u2716 ${t('kt_filter_clear')||'Clear'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktFilterModal">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('ktFilterModal', html, '540px');
  _ktTrapModalKeys('ktFilterModal');
}

function _ktApplyFilter() {
  // Collect checked checkboxes
  const capChecks = [...document.querySelectorAll('.ktFilterCapCb:checked')].map(cb => cb.value);
  const priChecks = [...document.querySelectorAll('.ktFilterPriCb:checked')].map(cb => parseInt(cb.value));
  const statusChecks = [...document.querySelectorAll('.ktFilterStatusCb:checked')].map(cb => cb.value);
  const trendChecks = [...document.querySelectorAll('.ktFilterTrendCb:checked')].map(cb => cb.value);

  _ktState.filter = {
    function: document.getElementById('ktFilterFunction')?.value?.trim() || '',
    priority: document.getElementById('ktFilterPriority')?.value?.trim() || '',
    status: document.getElementById('ktFilterStatus')?.value || '',
    trend: document.getElementById('ktFilterTrend')?.value || '',
    threat: document.getElementById('ktFilterThreat')?.value?.trim() || '',
    responsible: document.getElementById('ktFilterResponsible')?.value?.trim() || '',
    actions: document.getElementById('ktFilterActions')?.value?.trim() || '',
    comments: document.getElementById('ktFilterComments')?.value?.trim() || '',
    functionChecks: capChecks,
    priorityChecks: priChecks,
    statusChecks: statusChecks,
    trendChecks: trendChecks,
  };
  if (typeof _closeBoardModal === 'function') _closeBoardModal('ktFilterModal');
  _renderKeyTerrainBoard();
}

function _ktClearFilter() {
  _ktState.filter = {};
  if (typeof _closeBoardModal === 'function') _closeBoardModal('ktFilterModal');
  _renderKeyTerrainBoard();
}

function _ktShowHistory(entryId) {
  const entry = _ktState.entries.find(e => e.id === parseInt(entryId));
  if (!entry || !entry.history || entry.history.length === 0) {
    alert(t('kt_no_history')||'No history for this entry.');
    return;
  }

  const hist = [...entry.history].reverse();
  let html = `<div style="max-width:500px">
    <h3>📜 ${t('kt_history')||'History'}: #${entry.seq_num || entry.id} ${escHtml(entry.function)}</h3>
    <div style="max-height:400px;overflow-y:auto">`;

  for (const h of hist) {
    const ts = new Date(h.timestamp).toLocaleString();
    html += `<div style="padding:6px;border-bottom:1px solid var(--border);font-size:var(--fs-xs)">
      <div style="display:flex;justify-content:space-between;color:var(--text-dim)">
        <span>${escHtml(h.user_name)}</span>
        <span>${ts}</span>
      </div>
      <div><strong>${escHtml(h.field)}</strong>: ${h.old_value ? `<span style="text-decoration:line-through;color:var(--danger)">${escHtml(h.old_value)}</span> → ` : ''}${escHtml(h.new_value)}</div>
    </div>`;
  }

  html += `</div>
    <div style="margin-top:12px">
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktHistoryModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;

  _boardModal('ktHistoryModal', html, '520px');
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Rich Text Field helpers ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _ktRichField(id, value, placeholder, height) {
  const toolbar = `<div style="display:flex;gap:2px;margin-bottom:4px;flex-wrap:wrap" class="kt-rich-toolbar" data-kt-editor="${id}">
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;font-weight:700" data-kt-cmd="bold" title="${t("btn_bold")||"Bold"}"><b>B</b></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;font-style:italic" data-kt-cmd="italic" title="${t("btn_italic")||"Italic"}"><i>I</i></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;text-decoration:underline" data-kt-cmd="underline" title="${t("btn_underline")||"Underline"}"><u>U</u></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;text-decoration:line-through" data-kt-cmd="strikethrough" title="${t("btn_strikethrough")||"Strikethrough"}"><s>S</s></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px" data-kt-link="${id}" title="${t("btn_insert_link")||"Insert link"}">\u{1F517}</button>
  </div>`;
  return `${toolbar}<div id="${id}" contenteditable="true" class="input" style="width:100%;min-height:${height};max-height:150px;overflow-y:auto;resize:vertical;padding:6px;font-size:var(--fs-xs);white-space:pre-wrap;word-break:break-word" data-placeholder="${escHtml(placeholder)}">${value}</div>`;
}

// Bind KT rich text toolbar buttons (CSP-safe) — call after modal is created
function _ktBindRichToolbars(container) {
  if (!container) return;
  container.querySelectorAll('[data-kt-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => document.execCommand(btn.dataset.ktCmd));
  });
  container.querySelectorAll('[data-kt-link]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => _ktRichInsertLink(btn.dataset.ktLink));
  });
}

function _ktRichInsertLink(fieldId) {
  const url = prompt('URL:');
  if (!url) return;
  const label = prompt('Link text (leave empty for URL):', '') || url;
  const el = document.getElementById(fieldId);
  if (el) { el.focus(); document.execCommand('insertHTML', false, `<a href="${escHtml(url)}" target="_blank" style="color:var(--accent)">${escHtml(label)}</a>`); }
}

function _ktGetRichValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return el.innerHTML.trim() || '';
}

function _ktRenderRich(html) {
  // If content looks like it has HTML tags, render as-is (trusted internal content)
  if (html.includes('<') && (html.includes('<b>') || html.includes('<i>') || html.includes('<u>') || html.includes('<a ') || html.includes('<s>') || html.includes('<br'))) {
    return `<span style="font-size:var(--fs-xs)">${html}</span>`;
  }
  return escHtml(html);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Help ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _ktShowHelp() {
  const html = `<div style="max-width:560px">
    <h3>\u2753 ${t('kt_help_title')||'Key Terrain Board \u2014 Help'}</h3>

    <div style="font-size:var(--fs-xs);line-height:1.6">
      <p><strong>${t('kt_help_what')||'What is a Key Terrain Board?'}</strong><br>
      A key terrain board tracks the critical functions (cyber key terrain) that matter most to operations. It provides a shared situational picture of what is working, what is degraded, what threats exist, and what actions are being taken.</p>

      <h4 style="margin:12px 0 4px">${t('kt_help_columns')||'Columns'}</h4>
      <ul style="margin:0;padding-left:18px">
        <li><strong>\u26A1 Priority</strong> \u2014 Explicit ranking of what matters most (1 = highest).</li>
        <li><strong>\u{1F3AF} Function</strong> \u2014 The critical function or capability being tracked.</li>
        <li><strong>\u{1F4CA} Status</strong> \u2014 Current operational state: Working, Degraded, Down, Unknown.</li>
        <li><strong>\u{1F4C8} Trend</strong> \u2014 Expected development next cycle: Improving, Stable, Worsening.</li>
        <li><strong>\u2694\uFE0F Threat</strong> \u2014 Current hostile pressure on the function. Supports rich text.</li>
        <li><strong>\u{1F517} External</strong> \u2014 External dependencies and peer effects. Supports rich text.</li>
        <li><strong>\u{1F464} Responsible</strong> \u2014 Who is accountable. Use @name for autocomplete.</li>
        <li><strong>\u{1F527} Actions</strong> \u2014 What is being done to achieve effects. Supports rich text.</li>
      </ul>

      <h4 style="margin:12px 0 4px">${t('kt_help_features')||'Features'}</h4>
      <ul style="margin:0;padding-left:18px">
        <li><strong>Click a row</strong> to edit the entry (write-access users).</li>
        <li><strong>\u{1F333} Root cause &amp; consequences</strong> — in the edit modal, pick another entry as the <em>Root cause</em> to mark the current entry as a consequence. Consequences cluster right under their root cause on the board and are indented with a ↳ marker plus a left border; the parent carries a \u{1F333} <em>Root cause</em> badge. Orphans (parent archived or filtered out) fall back to rendering standalone.</li>
        <li><strong>\u25B2 \u25BC</strong> moves a row up or down.</li>
        <li><strong>Click column headers</strong> to sort (click again to reverse, again to clear).</li>
        <li><strong>\u{1F50D} Filter</strong> narrows the view by any field.</li>
        <li><strong>\u{1F552} Show Dates</strong> reveals Added / Updated / Finished timestamps.</li>
        <li><strong>\u{1F47B} Ghost</strong> dims an entry without removing it. Style is configurable in Settings.</li>
        <li><strong>\u{1F4E6} Archive</strong> moves an entry to a collapsed section at the bottom.</li>
        <li><strong>\u{1F4DC} History</strong> shows a full audit trail of all changes.</li>
        <li><strong>\u{1F4CB} Versions</strong> lets you save and view point-in-time snapshots of the board.</li>
        <li><strong>\u2B80 Columns</strong> lets you reorder columns left/right.</li>
        <li><strong>\u2699 Settings</strong> configures priority colors, icons, sort order, and ghost style.</li>
        <li><strong>\u{1F5A8} Print</strong> opens a print-friendly version.</li>
        <li><strong>\u2B07 Export</strong> saves the board as JSON, CSV, XML, PDF, SVG, or JPEG.</li>
        <li><strong>\u29C9 Detach</strong> opens the board in its own window.</li>
      </ul>

      <h4 style="margin:12px 0 4px">${t('kt_help_access')||'Access Control'}</h4>
      <p>Operations Lead, Staff Officers, and Staff Assistants have <strong>write access</strong>. Everyone else has <strong>read-only</strong> access.</p>

      <h4 style="margin:14px 0 4px">\u23F1\uFE0F ${t('kt_help_br')||'Battle Rhythm'}</h4>
      <p>The <strong>battle rhythm</strong> is a shared exercise clock with cyclic steps. Every connected user sees the same <strong>H0</strong> (the start of the current cycle) and the same step progression.</p>
      <ul style="margin:0;padding-left:18px">
        <li>Configure under <strong>\u2699 Settings → Battle Rhythm</strong>: cycle length, named steps with start/end offsets relative to H0 (negative offsets allowed for pre-H0 steps), a colour picker per step, and an automatic snapshot schedule.</li>
        <li>The clock widget appears at the top of the board when <em>Show clock widget</em> is enabled. It shows the current H-offset, the cycle length, the number of cycles completed so far, the current step, and the next step with a countdown.</li>
        <li>The <strong>board's outer border</strong> changes colour while a step is active — it uses the colour you picked for that step, or an automatic palette if you left the picker at default.</li>
      </ul>

      <h5 style="margin:10px 0 4px">Controls</h5>
      <ul style="margin:0;padding-left:18px">
        <li><strong>\u25B6 Start</strong> \u2014 starts the clock at wall-clock <em>now</em>. Type a time in the HH:MM field beside Start to <em>arm</em> the clock for a future moment; the widget then shows a waiting state with a live countdown until H0.</li>
        <li><strong>\u23F8 Pause</strong> / <strong>\u25B6 Resume</strong> \u2014 freezes / restarts the clock. The elapsed position is preserved across the pause.</li>
        <li><strong>\u27F2 Reset</strong> \u2014 stops the clock and clears H0. Steps and cycle length are preserved.</li>
        <li><strong>\u23EA Backward</strong> \u2014 rewinds the apparent clock position to the start of the previous step (or to H+0, or one full cycle back if already at H+0). Wall clock unchanged.</li>
        <li><strong>\u23ED Forward</strong> \u2014 ends the current step <em>now</em>; the next step absorbs the leftover time and runs longer. The cycle length is unchanged. The mutation persists across cycles until you reconfigure the steps.</li>
        <li><strong>\u23E9 Fast-forward</strong> \u2014 jumps the clock forward to the next step's nominal start. The current step is cut short, wall clock continues, and the cycle ends sooner than its original wall-clock end.</li>
      </ul>

      <h5 style="margin:10px 0 4px">Cycle rollover and snapshots</h5>
      <ul style="margin:0;padding-left:18px">
        <li>Every time the clock rolls over into a new cycle, the <strong># Cycles</strong> counter on every active entry is incremented by one. The scheduler runs once per minute.</li>
        <li>Snapshot offsets (minutes from H0, comma-separated in Settings) auto-capture the full board in every selected format (<strong>CSV / JSON / XML / SVG</strong>) and write them under <code>data/key_terrain_battle_rhythm/&lt;cycle_start&gt;/</code> on the server.</li>
      </ul>

      <h5 style="margin:10px 0 4px">\u{1F4CE} Battle cycle protocols</h5>
      <p>Below the Battle Rhythm widget the board shows a collapsed <strong>Battle cycle protocols</strong> bar. Click it to expand a scrollable list of protocols. The bar's right side shows the count and the current cycle number. Click again to collapse — your open/closed preference is remembered between sessions.</p>
      <ul style="margin:0;padding-left:18px">
        <li>Protocols are <strong>board-level</strong> — they belong to the KTB as a whole and are visible to every operator regardless of which entry is in focus.</li>
        <li>Two save modes: <strong>\u{1F4CE} Upload file</strong> (stored on the server, up to 10 MB) or <strong>\u{1F517} Save URL</strong> — a link to where the protocol lives in Nextcloud, Google Drive, SharePoint, or any other http/https location. The mode toggle above the uploader row remembers your last choice.</li>
        <li>Each protocol carries a free-form <em>comment</em> pre-filled with <em>"Battle cycle N — meeting protocol"</em>; edit it before saving if you want a different label. URL records also accept an optional display label; otherwise the link's last path segment (or hostname) is used.</li>
        <li>Each row records who added the entry, when, the file size (for uploads) or hostname (for URLs), and the cycle number it belonged to at save time.</li>
        <li>Anyone with read access can open a protocol; only write-access users can add or delete. Only <code>http://</code> and <code>https://</code> URLs are accepted.</li>
      </ul>

      <h5 style="margin:10px 0 4px">\u23EA Wayback Machine</h5>
      <p>The <strong>\u{1F4DC} History</strong> button in the Battle Rhythm controls opens the <em>Wayback Machine</em>. It lists every cycle that has at least one snapshot on disk (newest first), with one button per recorded snapshot offset and format.</p>
      <ul style="margin:0;padding-left:18px">
        <li>Click a JSON marker (e.g. <code>\u23EA H+0 JSON</code>) to <strong>load that historical KTB into the main view</strong>. A yellow banner appears at the top of the board indicating the cycle and the moment the snapshot was taken.</li>
        <li>While in wayback mode the board is fully read-only — Add, Edit, drag, ghost, archive, and the Settings panel are suppressed; live SSE refreshes are paused so the historical view doesn't move.</li>
        <li>Click <strong>\u23E9 Return to live</strong> in the banner to restore the current state of the board. The unfiltered live entries are stashed locally — no server round trip is needed.</li>
        <li>CSV / XML / SVG markers download the raw snapshot file to your machine instead of loading it into the view.</li>
        <li>Wayback requires snapshot offsets and at least the JSON format to be configured under <em>\u2699 Settings \u2192 Battle Rhythm</em>; otherwise the list will be empty.</li>
      </ul>

      <h5 style="margin:10px 0 4px">Detached clock window</h5>
      <p>The <strong>Clocks</strong> popup (toolbar in the main app) has a <em>Battle Rhythm</em> button that adds a read-only clock card showing the same H-offset, current step, next-step countdown, and cycles-completed counter alongside the other clocks.</p>
    </div>

    <div style="margin-top:16px">
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktHelpModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('ktHelpModal', html, '580px');
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Detach to window ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _ktDetach() {
  // Open the standalone key terrain page at its own URL
  if (typeof openDetachedKeyTerrain === 'function') {
    openDetachedKeyTerrain();
  } else {
    // Fallback: open the URL directly
    const w = Math.min(window.screen.availWidth, 1200);
    const h = Math.min(window.screen.availHeight - 100, 800);
    window.open('/key-terrain', 'tidslinjal-key-terrain',
      'width=' + w + ',height=' + h + ',resizable=yes,scrollbars=yes');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Battle Rhythm widget ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// Pulls shared clock state from /api/key-terrain/battle-rhythm every 5s,
// then uses requestAnimationFrame (well, a 500ms setInterval) to advance a
// locally-extrapolated display so the operator sees smooth countdown.

let _ktBrTickTimer = null;
let _ktBrPollTimer = null;
let _ktBrLastState = null;     // last server snapshot
let _ktBrLastFetchAt = 0;      // ms since epoch
let _ktBrShellKey = '';        // last-rendered shell layout key; '' forces a shell rebuild
let _ktBrFireOnH0 = false;     // guards the immediate poll at H0 from firing repeatedly
let _ktBrPollFailures = 0;     // consecutive _ktBrPoll() failure counter; stops the loop at 3

// Palette used when a battle rhythm step doesn't specify its own color.
// Indices wrap modulo palette length so more than 8 steps still get a
// deterministic colour assignment.
const _ktBrPalette = [
  '#3498db', '#e67e22', '#9b59b6', '#27ae60',
  '#e74c3c', '#f39c12', '#1abc9c', '#34495e',
];
function _ktBrStepColor(step, idx) {
  if (!step) return '';
  if (step.color && /^#[0-9a-fA-F]{3,8}$/.test(step.color)) return step.color;
  if (idx < 0) return '';
  return _ktBrPalette[idx % _ktBrPalette.length];
}

function _ktBrStartTicker() {
  if (_ktBrTickTimer) return;
  // Reset the failure counter so a ticker restart (e.g. after closing
  // a sub-modal, or bootstrap re-running) gets a clean slate. Without
  // this, a previous run that hit the failure threshold leaves the
  // counter at 3+ and any single transient error on the next run
  // immediately kills the ticker again.
  _ktBrPollFailures = 0;
  _ktBrPoll();
  // Poll interval: 2 s so a Start/Pause/Reset from one operator propagates
  // to the rest of the Key Terrain Board users quickly. The SSE hook
  // (below) also forces an immediate poll on every battle_rhythm_* event,
  // so in practice the widget is usually in sync within one SSE round-trip.
  _ktBrPollTimer = setInterval(_ktBrPoll, 2000);
  _ktBrTickTimer = setInterval(_ktBrTick, 500);
  // Reset the shell key so the next tick rebuilds the DOM once.
  _ktBrShellKey = '';
  document.addEventListener('sse:key_terrain_change', _ktBrPoll);
  // Wire the step-list hover tooltip on the widget's left info block.
  _ktBrEnsureTipListeners();
}
function _ktBrStopTicker() {
  if (_ktBrTickTimer) { clearInterval(_ktBrTickTimer); _ktBrTickTimer = null; }
  if (_ktBrPollTimer) { clearInterval(_ktBrPollTimer); _ktBrPollTimer = null; }
  document.removeEventListener('sse:key_terrain_change', _ktBrPoll);
}
async function _ktBrPoll() {
  try {
    const st = await _ktApi('GET', '/key-terrain/battle-rhythm');
    _ktBrLastState = st;
    _ktBrLastFetchAt = Date.now();
    _ktBrPollFailures = 0;
    _ktBrTick();
  } catch (e) {
    // Auth failures stop the ticker (the session is gone; no amount of
    // retrying will bring it back, and spamming the console hides the
    // real problem). Everything else — network blips, server restart,
    // 5xx hiccups — is treated as transient: log the first failure,
    // keep the ticker alive, and let the next interval tick retry.
    // The ticker used to self-destruct after 3 consecutive failures,
    // which killed the clock permanently in the detached window after
    // any momentary connection issue because there was no UI path to
    // restart it without reloading the page.
    _ktBrPollFailures++;
    const msg = (e && e.message) || String(e);
    if (_ktBrPollFailures === 1) {
      console.warn('[battle-rhythm] poll failed (will keep retrying):', msg);
    }
    const authFailed = /401|403|unauthoriz|forbidden/i.test(msg);
    if (authFailed) {
      _ktBrStopTicker();
      console.warn('[battle-rhythm] stopped polling — session appears to be invalid. Reload the page or log in again.');
    }
  }
}

// Given the last-known server state and how many ms have passed locally
// since the fetch, advance the clock by that delta so the ticker runs
// smoothly between polls. Returns a shallow-cloned state object.
function _ktBrExtrapolate(st) {
  if (!st || !st.running || st.paused) return st;
  const deltaMs = Date.now() - _ktBrLastFetchAt;
  if (deltaMs <= 0) return st;
  const cycle = st.cycle_minutes || 0;
  if (cycle <= 0) return st;
  const deltaMin = deltaMs / 60000;
  const out = Object.assign({}, st);
  out.elapsed_minutes = (st.elapsed_minutes || 0) + deltaMin;
  out.position_min = ((st.position_min || 0) + deltaMin) % cycle;
  if (out.next_step_in_min != null) {
    out.next_step_in_min = Math.max(0, (st.next_step_in_min || 0) - deltaMin);
  }
  return out;
}

function _ktBrFormatHOffset(posMin, cycleMin) {
  // Prefer "H+NN" / "H-NN" where magnitude < cycle/2, so a clock at 115 min
  // into a 120-min cycle reads as "H-5" rather than "H+115". When the
  // "show seconds" option is on, renders the seconds component too:
  // H+15:30 instead of H+15 for positions with fractional minutes.
  if (!cycleMin) return 'H+' + Math.floor(posMin || 0);
  let m = posMin;
  if (m > cycleMin / 2) m = m - cycleMin;
  const sign = m < 0 ? '-' : '+';
  const absM = Math.abs(m);
  const showSeconds = !!(_ktState.settings && _ktState.settings.battle_rhythm_show_seconds);
  if (showSeconds) {
    // Convert to whole seconds, then to hh:mm:ss or mm:ss.
    const totalSec = Math.max(0, Math.round(absM * 60));
    const h = Math.floor(totalSec / 3600);
    const mRem = Math.floor((totalSec % 3600) / 60);
    const sRem = totalSec % 60;
    if (h > 0) {
      return 'H' + sign + h + 'h' + String(mRem).padStart(2,'0') + ':' + String(sRem).padStart(2,'0');
    }
    return 'H' + sign + String(mRem).padStart(2,'0') + ':' + String(sRem).padStart(2,'0');
  }
  const hh = Math.floor(absM / 60);
  const mm = Math.floor(absM % 60);
  if (hh > 0) return 'H' + sign + hh + 'h' + String(mm).padStart(2,'0');
  return 'H' + sign + String(Math.floor(absM)).padStart(2,'0');
}

// Reset # Cycles counter — prompts the operator, then calls the
// /api/key-terrain/reset-cycles endpoint. Broadcasted via SSE so all
// clients pick up the change.
async function _ktResetCyclesConfirm() {
  const msg = t('kt_reset_cycles_confirm') || 'Reset the # Cycles counter to 0 on every non-archived entry?\n\nThis cannot be undone — though individual entries will record the change in their history.';
  if (!confirm(msg)) return;
  try {
    const res = await _ktApi('POST', '/key-terrain/reset-cycles');
    if (typeof showNotification === 'function') {
      const count = (res && res.updated) || 0;
      showNotification('success', (t('kt_reset_cycles_done') || 'Reset # Cycles on ') + count + ' ' + (t('kt_reset_cycles_entries') || 'entries'));
    }
  } catch (e) {
    if (typeof showError === 'function') showError('Reset failed: ' + e.message);
    else alert('Reset failed: ' + e.message);
  }
}

// ── 1-minute step-end warning sound ─────────────────────────────────────
// When settings.battle_rhythm_step_end_sound is on, play a short chime
// exactly once when the current step has ≤60 s remaining until its end.
// We track the last-warned (step, cycle) tuple so each step only fires
// once per cycle, and we use the Web Audio API to generate a short
// two-tone beep — no audio file required.
let _ktBrAudioCtx = null;
let _ktBrLastWarned = ''; // "stepName|cycleIdx"

function _ktBrPlayStepEndWarning() {
  try {
    if (!_ktBrAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      _ktBrAudioCtx = new Ctx();
    }
    const ctx = _ktBrAudioCtx;
    // Two short beeps at 880 Hz — distinct from any ambient UI sounds
    // and short enough not to disrupt a briefing.
    const play = (startAt, freq, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + dur + 0.05);
    };
    play(0,    880, 0.18);
    play(0.22, 660, 0.28);
  } catch {}
}

// _ktBrCheckStepEndWarning is called from _ktBrTick on every tick.
// It compares the current step's remaining time to 60 seconds and
// fires the warning when we first cross that threshold for a given
// (step, cycle) tuple.
function _ktBrCheckStepEndWarning(st) {
  const s = _ktState.settings || {};
  if (!s.battle_rhythm_step_end_sound) return;
  if (!st || !st.running || st.paused) return;
  if (!st.current_step) return;
  const cycleMin = st.cycle_minutes || 0;
  if (!cycleMin) return;
  // Compute seconds remaining inside the active step. Handle wrap-
  // around steps whose normalised window spans the cycle boundary.
  const pos = st.position_min;
  const step = st.current_step;
  const start = step.start_offset_min || 0;
  const hasEnd = step.end_offset_min != null;
  if (!hasEnd) return; // instant steps don't have a "1 min before end"
  const endRaw = step.end_offset_min;
  const duration = endRaw - start; // can span negative into positive
  if (duration <= 0) return;
  // Minutes into the step, handling the possible lead-in (pos may be
  // signed negative for cycle-0 pre-H0 steps).
  let intoStep = pos - start;
  if (intoStep < 0) intoStep += cycleMin;
  if (intoStep > duration) return;
  const secRemaining = (duration - intoStep) * 60;
  if (secRemaining > 0 && secRemaining <= 60) {
    const key = step.name + '|' + (st.cycles_completed || 0);
    if (_ktBrLastWarned !== key) {
      _ktBrLastWarned = key;
      _ktBrPlayStepEndWarning();
    }
  }
}

// _ktBrTick runs every 500 ms. It either rebuilds the widget shell (once
// per layout transition) or updates only the text nodes inside the
// existing shell. CRITICAL: we must NOT replace the .innerHTML of the
// widget on every tick, because that would destroy any <input> or
// <button> the operator is currently interacting with — which is exactly
// the bug that made Start / the HH:MM time picker unusable.
let _ktBrPendingLayout = ''; // optimistic layout override while a control POST is in flight
function _ktBrTick() {
  const host = document.getElementById('ktBattleRhythmWidget');
  if (!host) return;
  const cfg = (_ktState.settings && _ktState.settings.battle_rhythm) || {};
  if (!cfg.enabled || !cfg.show_clock) {
    host.style.display = 'none';
    _ktBrShellKey = 'hidden';
    _ktBrApplyBorderColor('');
    return;
  }
  host.style.display = '';
  const st = _ktBrLastState ? _ktBrExtrapolate(_ktBrLastState) : null;
  const canWrite = _ktState.access.can_write;
  // Speculative H0 transition. When the server-reported scheduled
  // state has a started_at in the past (i.e. we crossed H0 between
  // polls), we locally flip the widget into 'running' so the layout
  // doesn't flicker on "⏳ 0s" while the next poll is in flight. The
  // authoritative state still comes from the backend on the next
  // poll; this is just eager UI.
  let effectiveScheduled = st && st.scheduled;
  if (effectiveScheduled && st && st.started_at) {
    const startedMs = new Date(st.started_at).getTime();
    if (!isNaN(startedMs) && startedMs <= Date.now()) {
      effectiveScheduled = false;
    }
  }
  // Layout classification:
  //   stopped:   no state / Running=false / Scheduled=false
  //   scheduled: StartedAt is in the future, waiting for H0
  //   paused:    StartedAt set, PausedAt set
  //   running:   StartedAt set, elapsed >= 0, not paused
  //   starting:  optimistic override set by _ktBrControl while waiting
  //              for the server confirmation
  let layout;
  if (_ktBrPendingLayout) {
    layout = _ktBrPendingLayout;
  } else if (!st) {
    layout = 'stopped';
  } else if (effectiveScheduled) {
    layout = 'scheduled';
  } else if (st.scheduled && !effectiveScheduled) {
    // Speculative transition: we were scheduled but wall clock has
    // passed H0. Show 'running' layout immediately; the next poll
    // fetches the real position and cycles-completed count.
    layout = 'running';
    if (!_ktBrFireOnH0) {
      _ktBrFireOnH0 = true;
      _ktBrPoll().finally(() => { _ktBrFireOnH0 = false; });
    }
  } else if (!st.running) {
    layout = 'stopped';
  } else if (st.paused) {
    layout = 'paused';
  } else {
    layout = 'running';
  }
  const shellKey = layout + '|' + (canWrite ? 'w' : 'r');
  // Self-healing: if the board was fully re-rendered (SSE, bulk move,
  // etc.) the host is an empty div. childElementCount === 0 means we
  // need to rebuild the shell even if the layout key hasn't changed.
  if (shellKey !== _ktBrShellKey || host.childElementCount === 0) {
    host.innerHTML = _ktBrBuildShell(layout, st, canWrite, cfg);
    _ktBrShellKey = shellKey;
    // CRITICAL: the shared _bindActions dispatcher only binds click
    // handlers once per modal open, so any element we inject via
    // innerHTML afterwards has no click handler. Re-bind here so the
    // Start / Pause / Resume / Reset buttons actually fire when the
    // operator clicks them. Without this, pressing Start does nothing
    // (the previous bug report).
    if (typeof _bindActions === 'function') _bindActions(host);
  }
  _ktBrUpdateValues(layout, cfg, st);
  // Play the 1-minute step-end warning once per (step, cycle) tuple
  // when the setting is on. Gated inside the helper; safe no-op when
  // disabled or when no current step is active.
  _ktBrCheckStepEndWarning(st);
  // Border colour: follow the current step's colour if a step is active.
  const border = (st && st.current_step && st.current_step_idx >= 0)
    ? _ktBrStepColor(st.current_step, st.current_step_idx)
    : '';
  _ktBrApplyBorderColor(border);
}

// _ktBrBuildShell returns the static HTML for the widget under the given
// layout state. Every dynamic value (H offset, current step, countdown,
// cycles completed, state badge) is wrapped in an element with a stable
// id so _ktBrUpdateValues can rewrite only the text nodes afterwards.
function _ktBrBuildShell(layout, st, canWrite, cfg) {
  let stateLabel, stateColor, bgStyle = 'background:var(--bg2);border:1px solid var(--border)';
  switch (layout) {
    case 'starting':
      stateLabel = (t('kt_br_starting')||'Starting…');
      stateColor = '#3498db';
      bgStyle = 'background:var(--bg2);border:2px dashed #3498db';
      break;
    case 'scheduled':
      stateLabel = (t('kt_br_waiting')||'Waiting for H0');
      stateColor = '#f39c12';
      bgStyle = 'background:var(--bg2);border:2px solid #f39c12;box-shadow:0 0 0 2px rgba(243,156,18,.15)';
      break;
    case 'paused':
      stateLabel = (t('kt_br_paused')||'Paused');
      stateColor = '#f1c40f';
      break;
    case 'running':
      stateLabel = (t('kt_br_running')||'Running');
      stateColor = '#27ae60';
      break;
    default:
      stateLabel = (t('kt_br_stopped')||'Stopped');
      stateColor = 'var(--text-dim)';
  }
  let controls = '';
  // "Cycle History" is visible for every layout (incl. stopped) so
  // operators can browse snapshots from prior exercises after a reset.
  const historyBtn = canWrite
    ? `<button class="btn btn-sm btn-secondary" data-action="_ktOpenCycleHistory" title="${t('kt_br_history_h')||'Browse saved snapshots from previous battle-rhythm cycles'}">\u{1F4DC} ${t('kt_br_history')||'History'}</button>`
    : '';
  if (canWrite) {
    // Step navigation buttons — shown whenever the clock is running or
    // paused. Forward / Fast Forward skip ahead to the start of the next
    // step; Backward rewinds to the start of the previous one. Only
    // disabled in stopped / scheduled / starting layouts where there's
    // no "current position" to navigate from yet.
    const navButtons = (layout === 'running' || layout === 'paused')
      ? `<button class="btn btn-sm btn-secondary" data-action="_ktBrControl" data-arg="backward" title="${t('kt_br_backward_h')||'Rewind to previous step'}">\u23EA</button>
         <button class="btn btn-sm btn-secondary" data-action="_ktBrControl" data-arg="forward" title="${t('kt_br_forward_h')||'End current step now; next step absorbs the leftover time and runs longer'}">\u23ED</button>
         <button class="btn btn-sm btn-secondary" data-action="_ktBrControl" data-arg="fast_forward" title="${t('kt_br_fforward_h')||'Jump the clock to the next step\'s nominal start (cycle ends sooner)'}">\u23E9</button>`
      : '';
    if (layout === 'stopped') {
      // Two plain number inputs for hour and minute — avoids the
      // native <input type="time"> picker which some browsers render
      // inconsistently or with unreliable keyboard handling. Leave
      // both blank to start "now"; fill in values to arm the clock
      // for that wall-clock moment (today if still in the future,
      // otherwise tomorrow).
      controls = `<div style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs)" title="${t('kt_br_start_at_h')||'Optional wall-clock start time (HH:MM). Leave blank to start immediately.'}">
          <span style="color:var(--text-dim);font-size:10px">${t('kt_br_start_at')||'Start at'}</span>
          <input type="number" id="ktBrStartH" class="input" min="0" max="23" placeholder="HH" style="width:44px;padding:3px 4px;text-align:center;font-size:var(--fs-xs)">
          <span style="font-weight:700">:</span>
          <input type="number" id="ktBrStartM" class="input" min="0" max="59" placeholder="MM" style="width:44px;padding:3px 4px;text-align:center;font-size:var(--fs-xs)">
        </div>
        <button class="btn btn-sm btn-primary" data-action="_ktBrControl" data-arg="start">\u25B6 ${t('kt_br_start')||'Start'}</button>
        ${historyBtn}`;
    } else if (layout === 'starting') {
      controls = `<button class="btn btn-sm btn-secondary" disabled style="opacity:.6">\u23F3 ${t('kt_br_starting')||'Starting…'}</button>${historyBtn}`;
    } else if (layout === 'scheduled') {
      controls = `<button class="btn btn-sm btn-secondary" data-action="_ktBrControl" data-arg="reset">\u27F2 ${t('kt_br_cancel')||'Cancel'}</button>${historyBtn}`;
    } else if (layout === 'paused') {
      controls = `${navButtons}
        <button class="btn btn-sm btn-primary" data-action="_ktBrControl" data-arg="resume">\u25B6 ${t('kt_br_resume')||'Resume'}</button>
        <button class="btn btn-sm btn-secondary" data-action="_ktBrControl" data-arg="reset">\u27F2 ${t('kt_br_reset')||'Reset'}</button>
        ${historyBtn}`;
    } else if (layout === 'running') {
      controls = `${navButtons}
        <button class="btn btn-sm btn-secondary" data-action="_ktBrControl" data-arg="pause">\u23F8 ${t('kt_br_pause')||'Pause'}</button>
        <button class="btn btn-sm btn-secondary" data-action="_ktBrControl" data-arg="reset">\u27F2 ${t('kt_br_reset')||'Reset'}</button>
        ${historyBtn}`;
    }
  }
  // In "scheduled" mode, the big headline shows the waiting time and the
  // target wall-clock time instead of an H-offset.
  let headline = 'H--';
  let subline = '';
  if (layout === 'scheduled' && st && st.started_at) {
    // The countdown text is updated on every tick; the target time is
    // stable so it can be baked into the shell once.
    const d = new Date(st.started_at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    subline = `<div style="font-size:12px;color:#f39c12;font-weight:600">${t('kt_br_waiting_for')||'Waiting for'} ${hh}:${mm}</div>`;
  }
  // Font sizing notes: the battle rhythm widget now renders noticeably
  // larger than the default --fs-xs used elsewhere on the board. The
  // label/state badge are 12px (was 10), the info column text is 14px
  // (was --fs-xs ≈ 12), and the H-offset headline is 28px (was 22).
  // That makes the widget scannable from across a briefing room
  // without interfering with the dense table below it.
  //
  // The left "info block" (label + H-offset + state) is hoverable via
  // a native HTML title attribute carrying a plain-text summary of
  // every configured step. Native browser tooltips render reliably
  // in every context including the detached Key Terrain window, and
  // avoid the duplicate-popup problem the previous custom floating
  // tooltip caused. The title text is refreshed on every 500 ms tick
  // is an enhancement, but this title= attribute is the reliable
  // fallback. Refreshed by _ktBrUpdateValues on every tick so the
  // active-step markers stay current.
  const titleSummary = _ktBrBuildStepsTitleText(cfg, st);
  return `
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:12px 16px;border-radius:var(--radius);${bgStyle};transition:background .3s, border-color .3s;font-size:14px">
      <div id="ktBrInfoBlock" data-kt-br-tip="1" title="${escHtml(titleSummary)}" style="display:flex;flex-direction:column;min-width:130px;cursor:help">
        <div style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;font-weight:600">${t('kt_br_clock')||'Battle Rhythm'}</div>
        <div style="font-family:monospace;font-size:28px;font-weight:700;color:var(--accent);line-height:1.05" id="ktBrHOffset">${headline}</div>
        <div style="font-size:12px;color:${stateColor}" id="ktBrState">● ${stateLabel}</div>
        ${subline}
      </div>
      <div style="display:flex;flex-direction:column;min-width:200px;font-size:14px;line-height:1.45">
        <div><span style="color:var(--text-dim)">${t('kt_br_cycle')||'Cycle'}:</span> <span id="ktBrCycleLen">\u2014</span></div>
        <div><span style="color:var(--text-dim)">${t('kt_br_cycles_done')||'Cycles completed'}:</span> <b id="ktBrCyclesDone">0</b></div>
        <div><span style="color:var(--text-dim)">${t('kt_br_current')||'Now'}:</span> <b id="ktBrCurrent">\u2014</b></div>
        <div><span style="color:var(--text-dim)">${t('kt_br_next')||'Next'}:</span> <span id="ktBrNext">\u2014</span></div>
      </div>
      ${controls ? `<div style="display:flex;gap:6px;margin-left:auto;align-items:center">${controls}</div>` : ''}
    </div>`;
}

// _ktBrUpdateValues rewrites the text-only content of the widget so the
// ticker animation runs without destroying any focus-holding input.
function _ktBrUpdateValues(layout, cfg, st) {
  const hEl = document.getElementById('ktBrHOffset');
  let hoffset = 'H--';
  if (layout === 'scheduled' && st && st.scheduled_seconds != null) {
    // Live countdown: Tm:SS until H0.
    const secs = Math.max(0, Math.round(st.scheduled_seconds - ((Date.now() - _ktBrLastFetchAt) / 1000)));
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    if (mm > 0) hoffset = '\u23F3 ' + mm + 'm ' + String(ss).padStart(2, '0') + 's';
    else hoffset = '\u23F3 ' + ss + 's';
    // When the countdown crosses zero, poll the backend immediately so
    // the widget transitions into the running layout within one round
    // trip instead of waiting up to 2s for the next tick. We guard the
    // trigger with a module-scope flag so the 500ms ticker doesn't fire
    // multiple polls while the poll is in flight.
    if (secs === 0 && !_ktBrFireOnH0) {
      _ktBrFireOnH0 = true;
      _ktBrPoll().finally(() => { _ktBrFireOnH0 = false; });
    }
  } else if (layout === 'running' || layout === 'paused') {
    hoffset = _ktBrFormatHOffset(st.position_min, st.cycle_minutes);
  } else if (layout === 'starting') {
    hoffset = '\u23F3';
  }
  if (hEl && hEl.textContent !== hoffset) hEl.textContent = hoffset;
  const cycleLen = (cfg.cycle_minutes || 0) + ' min';
  const cLen = document.getElementById('ktBrCycleLen');
  if (cLen && cLen.textContent !== cycleLen) cLen.textContent = cycleLen;
  const cyclesDone = st && st.cycles_completed != null ? String(st.cycles_completed) : '0';
  const cDoneEl = document.getElementById('ktBrCyclesDone');
  if (cDoneEl && cDoneEl.textContent !== cyclesDone) cDoneEl.textContent = cyclesDone;
  // "Now" field supports multiple simultaneously-active steps — when two
  // or more steps overlap we join their names with " + ". The backend
  // gives us current_steps (plural), and current_step stays as a
  // compatibility alias for the first active step.
  let cur = '\u2014';
  if (st && Array.isArray(st.current_steps) && st.current_steps.length > 0) {
    cur = st.current_steps.map(s => s.name).join(' + ');
  } else if (st && st.current_step) {
    cur = st.current_step.name;
  }
  const curEl = document.getElementById('ktBrCurrent');
  if (curEl && curEl.textContent !== cur) curEl.textContent = cur;
  let nxt = '\u2014';
  if (st && st.next_step) {
    const nxtIn = st.next_step_in_min != null ? Math.max(0, Math.round(st.next_step_in_min)) + ' min' : '';
    nxt = st.next_step.name + (nxtIn ? ' (' + (t('kt_br_in')||'in') + ' ' + nxtIn + ')' : '');
  }
  const nEl = document.getElementById('ktBrNext');
  if (nEl && nEl.textContent !== nxt) nEl.textContent = nxt;
  // Refresh the info block's native title so the browser tooltip
  // shows the latest steps-summary (including which step is active).
  const infoEl = document.getElementById('ktBrInfoBlock');
  if (infoEl) {
    const newTitle = _ktBrBuildStepsTitleText(cfg, st);
    if (infoEl.getAttribute('title') !== newTitle) infoEl.setAttribute('title', newTitle);
  }
}

// _ktBrBuildStepsTitleText produces a plain-text multi-line summary
// of the configured steps for the info block's native title attribute.
// Used as the reliable fallback tooltip when the custom floating
// popover isn't visible (different browsers, CSP quirks, etc).
function _ktBrBuildStepsTitleText(cfg, st) {
  const steps = (cfg && Array.isArray(cfg.steps)) ? cfg.steps : [];
  const cycleMin = cfg ? (cfg.cycle_minutes || 0) : 0;
  const lines = [];
  lines.push((t('kt_br_steps_tooltip_title') || 'Battle rhythm steps') + ' — ' + (cycleMin ? cycleMin + ' min cycle' : (t('kt_br_no_cycle') || 'cycle length not set')));
  if (steps.length === 0) {
    lines.push('');
    lines.push(t('kt_br_no_steps_tooltip') || 'No steps defined. Open Settings → Battle Rhythm to add steps.');
    return lines.join('\n');
  }
  const activeNames = new Set();
  if (st && Array.isArray(st.current_steps)) {
    st.current_steps.forEach(s => activeNames.add(s.name));
  } else if (st && st.current_step) {
    activeNames.add(st.current_step.name);
  }
  const fmt = (n) => {
    const sign = n < 0 ? '-' : '+';
    const abs = Math.abs(n);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    if (h > 0) return 'H' + sign + h + 'h' + String(m).padStart(2, '0');
    return 'H' + sign + String(m).padStart(2, '0');
  };
  steps.forEach((s) => {
    const start = typeof s.start_offset_min === 'number' ? s.start_offset_min : 0;
    const endVal = (s.end_offset_min === null || s.end_offset_min === undefined) ? null : s.end_offset_min;
    const range = endVal == null ? fmt(start) : fmt(start) + ' – ' + fmt(endVal);
    const active = activeNames.has(s.name) ? '  ← ' + (t('kt_br_active') || 'active') : '';
    let line = '• ' + (s.name || '(unnamed)') + '   ' + range + active;
    if (s.description) line += '\n    ' + s.description;
    lines.push(line);
  });
  return lines.join('\n');
}

// ── Battle rhythm step tooltip ─────────────────────────────────────────
// The step list is shown via the native HTML `title` attribute on
// #ktBrInfoBlock (set in _ktBrBuildShell and refreshed on every tick
// by _ktBrUpdateValues through _ktBrBuildStepsTitleText). Native
// browser tooltips are reliable across every environment — including
// the detached Key Terrain window — and don't require any event
// wiring. The previous implementation had a custom floating tooltip
// layered on top which ran in parallel with the native one, causing
// TWO popup panels in the detached window. That layer is gone now.
//
// _ktBrEnsureTipListeners is kept as a no-op shim so the ticker's
// call site doesn't need to branch.
function _ktBrEnsureTipListeners() { /* intentionally empty; native title handles hover */ }

// _ktBrApplyBorderColor toggles the step-border CSS variable on the main
// board container. Passing "" clears the border; a hex colour turns on an
// 8 px box-shadow ring in that colour (see style.css .kt-br-bordered).
function _ktBrApplyBorderColor(color) {
  const root = document.getElementById('ktBoardContent');
  if (!root) return;
  if (color) {
    root.style.setProperty('--kt-br-color', color);
    root.classList.add('kt-br-bordered');
  } else {
    root.classList.remove('kt-br-bordered');
    root.style.removeProperty('--kt-br-color');
  }
}

async function _ktBrControl(action) {
  // Immediate UI feedback: flip the widget into a "starting…" pending
  // layout right away so the operator sees that the click registered.
  // The pending state is cleared when the server responds (success) or
  // when the error alert fires (failure).
  //
  // Read the scheduled-start HH:MM BEFORE we flip the pending layout —
  // the shell rebuild on 'starting' removes the two inputs from the
  // DOM so a later read would come back empty.
  let startAtStr = '';
  if (action === 'start') {
    const hInp = document.getElementById('ktBrStartH');
    const mInp = document.getElementById('ktBrStartM');
    const hStr = hInp ? hInp.value.trim() : '';
    const mStr = mInp ? mInp.value.trim() : '';
    if (hStr !== '' || mStr !== '') {
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && h >= 0 && h <= 23 && !isNaN(m) && m >= 0 && m <= 59) {
        startAtStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      } else {
        if (typeof showError === 'function') {
          showError(t('kt_br_start_at_bad')||'Enter a valid HH:MM time (hour 0-23, minute 0-59) or leave both fields blank.');
        } else {
          alert('Enter a valid HH:MM time (hour 0-23, minute 0-59) or leave both fields blank.');
        }
        return;
      }
    }
    _ktBrPendingLayout = 'starting';
    _ktBrShellKey = ''; // force shell rebuild on next tick
    _ktBrTick();
  }
  try {
    const body = { action: action };
    if (action === 'start' && startAtStr) {
      body.start_at = startAtStr;
    }
    const st = await _ktApi('POST', '/key-terrain/battle-rhythm/control', body);
    _ktBrLastState = st;
    _ktBrLastFetchAt = Date.now();
    _ktBrPendingLayout = '';
    // Mirror the new started_at/paused_at onto the cached settings so
    // the widget's cfg.* lookup is coherent without a settings GET.
    // Fetching settings here used to trigger a board-level SSE roundtrip
    // in parallel with the server's own broadcast, which contributed to
    // the "flash" bug. Reading just the clock state is enough.
    if (_ktState.settings && _ktState.settings.battle_rhythm) {
      _ktState.settings.battle_rhythm.started_at = st.started_at || null;
      // Derive paused state from the computed state.
      _ktState.settings.battle_rhythm.paused_at = st.paused ? new Date().toISOString() : null;
    }
    _ktBrShellKey = ''; // force shell rebuild now that we have the real state
    _ktBrTick();
    // Light confirmation toast so the operator is sure something happened.
    if (typeof showNotification === 'function') {
      const label = { start: t('kt_br_toast_started')||'Battle rhythm started',
                      pause: t('kt_br_toast_paused')||'Battle rhythm paused',
                      resume: t('kt_br_toast_resumed')||'Battle rhythm resumed',
                      reset: t('kt_br_toast_reset')||'Battle rhythm reset',
                      forward: t('kt_br_toast_forward')||'Step ended early — leftover time donated to next step',
                      backward: t('kt_br_toast_backward')||'Rewound to previous step',
                      fast_forward: t('kt_br_toast_fforward')||'Fast-forwarded to next step' }[action] || action;
      showNotification('success', label);
    }
  } catch (e) {
    _ktBrPendingLayout = '';
    _ktBrShellKey = '';
    _ktBrTick();
    if (typeof showError === 'function') showError('Battle rhythm: ' + e.message);
    else alert('Error: ' + e.message);
  }
}


