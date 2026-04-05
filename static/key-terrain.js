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
  columnOrder: ['seq_num','zone','priority','function','status','trend','threat','external','responsible','actions','created_at','updated_at','finished_at','rounds','management'],
  hiddenColumns: { created_at: true, updated_at: true, finished_at: true, rounds: true }, // hidden by default
};

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
    const [entries, access, settings] = await Promise.all([
      _ktApi('GET', '/key-terrain'),
      _ktApi('GET', '/key-terrain/access'),
      _ktApi('GET', '/key-terrain/settings').catch(() => ({})),
    ]);
    _ktState.entries = entries;
    _ktState.access = access;
    _ktState.settings = settings || {};
  } catch (e) {
    _ktState.entries = [];
    _ktState.access = { can_write: false };
  }
  _renderKeyTerrainBoard();
  _ktSubscribeSSE();
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
function _ktHandleSSE() {
  // Debounce: don't refresh more than once per second
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
      case 'actions': return (a.actions || '').localeCompare(b.actions || '');
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
  const canWrite = _ktState.access.can_write;
  const hidden = _ktState.hiddenColumns || {};
  const ghostStyle = _ktGhostStyle();
  const f = _ktState.filter || {};
  const hasFilter = Object.values(f).some(v => v);

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
    const q = (v) => (v || '').toLowerCase();
    filtered = filtered.filter(e => {
      if (f.function && !q(e.function).includes(q(f.function))) return false;
      if (f.priority && e.priority !== parseInt(f.priority)) return false;
      if (f.status && e.status !== f.status) return false;
      if (f.trend && e.trend !== f.trend) return false;
      if (f.threat && !q(e.threat).includes(q(f.threat))) return false;
      if (f.responsible && !q(e.responsible_name).includes(q(f.responsible))) return false;
      if (f.actions && !q(e.actions).includes(q(f.actions))) return false;
      if (f.zone && !q(e.zone).includes(q(f.zone))) return false;
      return true;
    });
  }

  // Sort using settings
  const sorted = _ktSortEntries(filtered);
  const cols = _ktState.columnOrder.filter(c => !hidden[c] && (c !== 'management' || canWrite));
  const hasHidden = Object.values(hidden).some(v => v);
  const totalCols = cols.length;

  // Custom status labels from settings
  const _statusLabels = _ktState.settings.status_labels || {};

  // Column definitions
  const colDef = {
    seq_num:     { icon: '#', label: t('kt_seq_num')||'Seq', align: 'center', extra: 'white-space:nowrap;width:40px' },
    zone:        { icon: '\u{1F310}', label: t('kt_zone')||'Zone', align: 'left', extra: 'min-width:80px' },
    priority:    { icon: '\u26A1', label: t('kt_priority')||'Pri', align: 'left', extra: 'white-space:nowrap' },
    function:    { icon: '\u{1F3AF}', label: t('kt_function')||'Capability', align: 'left', extra: 'min-width:140px' },
    status:      { icon: '\u{1F4CA}', label: t('kt_status')||'Status', align: 'center', extra: '' },
    trend:       { icon: '\u{1F4C8}', label: t('kt_trend')||'Trend', align: 'center', extra: '' },
    threat:      { icon: '\u2694\uFE0F', label: t('kt_threat')||'Threat', align: 'left', extra: 'min-width:120px' },
    external:    { icon: '\u{1F517}', label: t('kt_external')||'External', align: 'left', extra: 'min-width:120px' },
    responsible: { icon: '\u{1F464}', label: t('kt_responsible')||'Responsible', align: 'left', extra: 'min-width:100px' },
    actions:     { icon: '\u{1F527}', label: t('kt_actions')||'Actions', align: 'left', extra: 'min-width:140px' },
    created_at:  { icon: '\u{1F4C5}', label: t('kt_created')||'Created', align: 'center', extra: 'white-space:nowrap;background:var(--bg2)' },
    updated_at:  { icon: '\u{1F504}', label: t('kt_updated')||'Updated', align: 'center', extra: 'white-space:nowrap;background:var(--bg2)' },
    finished_at: { icon: '\u2705', label: t('kt_finished')||'Finished', align: 'center', extra: 'white-space:nowrap;background:var(--bg2)' },
    rounds:      { icon: '\u{1F504}', label: t('kt_rounds')||'# Rounds', align: 'center', extra: 'white-space:nowrap' },
    management:  { icon: '\u2699', label: t('kt_mgmt_label')||'Management', align: 'center', extra: 'width:160px' },
  };

  let html = `<div style="max-width:98vw;margin:0 auto" id="ktBoardContent">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px" class="kt-no-print">
      <h2 style="margin:0">\u{1F3D4}\uFE0F ${t('kt_title')||'Key Terrain Board'}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${!canWrite ? `<span style="font-size:var(--fs-xs);color:var(--text-dim);background:var(--bg3);padding:2px 8px;border-radius:var(--radius)">\u{1F512} ${t('kt_read_only')||'Read Only'}</span>` : ''}
        <button class="btn btn-sm ${hasFilter ? 'btn-primary' : 'btn-secondary'}" data-action="_ktOpenFilter">\u{1F50D} ${t('kt_filter')||'Filter'}${hasFilter ? ' \u2713' : ''}</button>
        <button class="btn btn-sm ${hasHidden ? 'btn-secondary' : 'btn-secondary'}" data-action="_ktOpenColumnVisibility">\u{1F441} ${t('kt_columns_vis')||'Columns'}${hasHidden ? ' ('+Object.values(hidden).filter(v=>v).length+' hidden)' : ''}</button>
        ${canWrite ? `<button class="btn btn-sm btn-secondary" data-action="_ktOpenSettings">\u2699 ${t('kt_settings')||'Settings'}</button>` : ''}
        <button class="btn btn-sm btn-secondary" data-action="_ktOpenManagePanel">\u{1F4CB} ${t('kt_manage')||'Manage & Export'}</button>
        ${canWrite ? `<button class="btn btn-sm btn-primary" data-action="_ktAddEntry">+ ${t('kt_add')||'Add Entry'}</button>` : ''}
        <button class="btn btn-sm btn-secondary" data-action="_ktShowHelp" title="${t('kt_help')||'Help'}">\u2753</button>
        <button class="btn btn-sm btn-secondary" data-action="_ktDetach" title="${t('kt_detach')||'Detach to window'}">\u29C9</button>
      </div>
    </div>

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

    // Ghosting styles
    let rowBg = statusOpt.color;
    let rowStyle = '';
    if (e.ghosted) {
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
      function: `<td style="padding:8px;font-weight:600">${escHtml(e.function)}${e.ghosted ? ' <span style="font-size:9px;color:var(--text-dim);font-weight:normal">(ghosted)</span>' : ''}</td>`,
      status: `<td style="padding:8px;text-align:center"><span style="padding:2px 8px;border-radius:10px;font-weight:600;white-space:nowrap" title="${statusLabel}">${sIcon} ${statusLabel}</span></td>`,
      trend: `<td style="padding:8px;text-align:center"><span title="${trendOpt.label}">${trIcon} ${trendOpt.label}</span></td>`,
      threat: `<td style="padding:8px">${e.threat ? _ktRenderRich(e.threat) : '\u2014'}</td>`,
      external: `<td style="padding:8px">${e.external ? _ktRenderRich(e.external) : '\u2014'}</td>`,
      responsible: `<td style="padding:8px">${e.responsible_name ? escHtml(e.responsible_name) : '<span style="color:var(--text-dim)">\u2014</span>'}</td>`,
      actions: `<td style="padding:8px">${e.actions ? _ktRenderRich(e.actions) : '\u2014'}</td>`,
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
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktArchiveEntry" data-arg="${e.id}" data-stop-prop title="${t('kt_archive')||'Archive'}">\u{1F4E6}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px;color:var(--danger)" data-action="_ktDeleteEntry" data-arg="${e.id}" data-stop-prop title="${t('kt_remove')||'Remove'}">\u{1F5D1}</button>
      </td>` : `<td></td>`,
    };

    html += `<tr style="background:${rowBg};border-bottom:1px solid var(--border);transition:background .15s;${rowStyle}${canWrite?';cursor:pointer':''}" data-row-bg="${rowBg}" ${canWrite ? `data-action="_ktEditEntry" data-arg="${e.id}"` : ''}>
      ${cols.map(c => cellHtml[c] || '').join('')}
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
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F3AF} ${t('kt_from_capability')||'Link to Capability'}</label>
      <select id="ktFromCapability" class="input" style="width:100%;font-size:var(--fs-xs)">
        <option value="">— ${t('kt_select_capability')||'Select a capability...'} —</option>
        ${capabilities.map(c => `<option value="${c.id}" ${entry.capability_id === c.id ? 'selected' : ''}>${escHtml(c.name)}${c.zone ? ' [\u{1F310}'+escHtml(c.zone)+']' : ''}</option>`).join('')}
      </select>
      ${entry.capability_id ? `<div style="font-size:10px;color:var(--accent);margin-top:4px">\u{1F517} ${t('kt_linked_capability')||'Linked to capability — name, zone, status, and responsible sync automatically'}</div>` : ''}
    </div>` : ''}

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F3AF} ${t('kt_function')||'Capability'} *</label>
      <input id="ktFunction" class="input" style="width:100%" value="${escHtml(entry.function)}" placeholder="${t('kt_function_ph')||'Name of the capability'}">
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
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F504} ${t('kt_rounds')||'# Rounds'}</label>
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

async function _ktDeleteEntry(entryId) {
  if (!confirm(t('kt_delete_confirm')||'Delete this key terrain entry?')) return;
  try {
    await _ktApi('DELETE', '/key-terrain/' + entryId);
    await openKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_deleted')||'Entry deleted');
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
          const lbl = {seq_num:'#',zone:'Zone',priority:'Priority',function:'Capability',status:'Status',trend:'Trend',threat:'Threat',external:'External',responsible:'Responsible',actions:'Actions',created_at:'Created',updated_at:'Updated',finished_at:'Finished',rounds:'Rounds',management:'Management'}[c] || c;
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
          const colLabels = {seq_num:'# Seq',zone:'\u{1F310} Zone',priority:'\u26A1 Priority',function:'\u{1F3AF} Capability',status:'\u{1F4CA} Status',trend:'\u{1F4C8} Trend',threat:'\u2694\uFE0F Threat',external:'\u{1F517} External',responsible:'\u{1F464} Responsible',actions:'\u{1F527} Actions',created_at:'\u{1F4C5} Created',updated_at:'\u{1F504} Updated',finished_at:'\u2705 Finished',rounds:'\u{1F504} Rounds',management:'\u2699 Management'};
          return `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:var(--bg2);border-radius:var(--radius);border:1px solid var(--border)">
            <button type="button" class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktSettMoveCol" data-args='[${i},-1]' ${i===0?'disabled':''}>\u25B2</button>
            <button type="button" class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktSettMoveCol" data-args='[${i},1]' ${i===_ktState.columnOrder.length-1?'disabled':''}>\u25BC</button>
            <span style="flex:1;font-size:var(--fs-xs)">${colLabels[c] || c}</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktSaveSettings">\u2714 ${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktSettingsModal">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('ktSettingsModal', html, '560px');
  _ktTrapModalKeys('ktSettingsModal');
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
  const settings = {
    priority_colors: pc,
    status_icons: si,
    trend_icons: ti,
    sort_by: document.getElementById('ktSettSortBy')?.value || 'priority',
    ghost_style: document.getElementById('ktSettGhostStyle')?.value || 'grey',
    show_no_priority: document.getElementById('ktSettShowNoPriority')?.checked !== false,
    status_labels: slOut,
    hidden_columns: hcOut,
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
    function: '\u{1F3AF} ' + (t('kt_function')||'Capability'),
    status: '\u{1F4CA} ' + (t('kt_status')||'Status'),
    trend: '\u{1F4C8} ' + (t('kt_trend')||'Trend'),
    threat: '\u2694\uFE0F ' + (t('kt_threat')||'Threat'),
    external: '\u{1F517} ' + (t('kt_external')||'External'),
    responsible: '\u{1F464} ' + (t('kt_responsible')||'Responsible'),
    actions: '\u{1F527} ' + (t('kt_actions')||'Actions'),
    created_at: '\u{1F4C5} ' + (t('kt_created')||'Created'),
    updated_at: '\u{1F504} ' + (t('kt_updated')||'Updated'),
    finished_at: '\u2705 ' + (t('kt_finished')||'Finished'),
    rounds: '\u{1F504} ' + (t('kt_rounds')||'# Rounds'),
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
function _ktPrint() {
  const table = document.getElementById('ktBoardTable');
  if (!table) return;
  const w = window.open('', '_blank', 'width=1100,height=800');
  w.document.write(`<!DOCTYPE html><html><head><title>${t('kt_title')||'Key Terrain Board'}</title>
    <style>body{font-family:system-ui,sans-serif;padding:20px;font-size:12px}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #ccc;text-align:left}
    th{background:#eee;font-weight:700}tr:nth-child(even){background:#f9f9f9}
    h2{margin-bottom:8px}p{color:#666;margin-bottom:12px;font-size:11px}
    @media print{button{display:none!important}}</style></head><body>`);
  w.document.write(`<h2>\u{1F3D4}\uFE0F ${t('kt_title')||'Key Terrain Board'}</h2>`);
  w.document.write(`<p>${t('kt_desc')||'Cyber key terrain overview'} \u2014 ${new Date().toLocaleString()}</p>`);
  w.document.write(table.outerHTML);
  w.document.write(`<br><button id="ktPrintBtn">Print</button></body></html>`);
  w.document.close();
  setTimeout(() => {
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
  const colLabels = { priority:'Priority', function:'Function', status:'Status', trend:'Trend', threat:'Threat', external:'External', responsible:'Responsible', actions:'Actions' };

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
  return `<th style="padding:8px;text-align:${align};cursor:pointer;user-select:none;${extra}" data-action="_ktSortByColumn" data-arg="${col}">${label}${arrow}</th>`;
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
  const colLabels = {
    priority: '\u26A1 Priority', function: '\u{1F3AF} Function', status: '\u{1F4CA} Status',
    trend: '\u{1F4C8} Trend', threat: '\u2694\uFE0F Threat', external: '\u{1F517} External',
    responsible: '\u{1F464} Responsible', actions: '\u{1F527} Actions',
    created_at: '\u{1F4C5} Created', updated_at: '\u{1F504} Updated',
    finished_at: '\u2705 Finished', rounds: '\u{1F504} # Rounds',
  };
  let html = `<div style="max-width:400px">
    <h3>\u{1F441} ${t('kt_columns_vis')||'Show / Hide Columns'}</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">${t('kt_columns_vis_desc')||'Toggle which columns are visible in the table.'}</p>
    <div style="display:flex;flex-direction:column;gap:4px">`;
  for (const c of allCols) {
    const isHidden = !!hidden[c];
    html += `<label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-xs);cursor:pointer;padding:4px 6px;background:var(--bg3);border-radius:var(--radius)">
      <input type="checkbox" ${!isHidden ? 'checked' : ''} data-col="${c}" class="ktVisCheck" style="accent-color:var(--accent)">
      ${colLabels[c] || c}
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
  let html = `<div style="max-width:500px">
    <h3>\u{1F50D} ${t('kt_filter')||'Filter Key Terrain'}</h3>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F3AF} ${t('kt_function')||'Function'}</label>
      <input id="ktFilterFunction" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.function||'')}">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u26A1 ${t('kt_priority')||'Priority'}</label>
        <input id="ktFilterPriority" type="number" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_any')||'Any'}" value="${f.priority||''}" min="0">
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F4CA} ${t('kt_status')||'Status'}</label>
        <select id="ktFilterStatus" class="input" style="width:100%;font-size:var(--fs-xs)">
          <option value="">\u2014 ${t('kt_filter_any')||'Any'} \u2014</option>
          ${_ktStatusOptions.map(s => `<option value="${s.value}" ${f.status===s.value?'selected':''}>${s.icon} ${s.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F4C8} ${t('kt_trend')||'Trend'}</label>
        <select id="ktFilterTrend" class="input" style="width:100%;font-size:var(--fs-xs)">
          <option value="">\u2014 ${t('kt_filter_any')||'Any'} \u2014</option>
          ${_ktTrendOptions.map(tr => `<option value="${tr.value}" ${f.trend===tr.value?'selected':''}>${tr.icon} ${tr.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u2694\uFE0F ${t('kt_threat')||'Threat'}</label>
      <input id="ktFilterThreat" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.threat||'')}">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F464} ${t('kt_responsible')||'Responsible'}</label>
        <input id="ktFilterResponsible" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.responsible||'')}">
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">\u{1F527} ${t('kt_actions')||'Actions'}</label>
        <input id="ktFilterActions" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_text_ph')||'Contains text...'}" value="${escHtml(f.actions||'')}">
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktApplyFilter">\u2714 ${t('kt_filter_apply')||'Apply'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_ktClearFilter">\u2716 ${t('kt_filter_clear')||'Clear'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktFilterModal">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('ktFilterModal', html, '500px');
  _ktTrapModalKeys('ktFilterModal');
}

function _ktApplyFilter() {
  _ktState.filter = {
    function: document.getElementById('ktFilterFunction')?.value?.trim() || '',
    priority: document.getElementById('ktFilterPriority')?.value?.trim() || '',
    status: document.getElementById('ktFilterStatus')?.value || '',
    trend: document.getElementById('ktFilterTrend')?.value || '',
    threat: document.getElementById('ktFilterThreat')?.value?.trim() || '',
    responsible: document.getElementById('ktFilterResponsible')?.value?.trim() || '',
    actions: document.getElementById('ktFilterActions')?.value?.trim() || '',
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
    <h3>📜 ${t('kt_history')||'History'}: ${escHtml(entry.function)}</h3>
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
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;font-weight:700" data-kt-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;font-style:italic" data-kt-cmd="italic" title="Italic"><i>I</i></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;text-decoration:underline" data-kt-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px;text-decoration:line-through" data-kt-cmd="strikethrough" title="Strikethrough"><s>S</s></button>
    <button type="button" class="btn btn-sm" style="font-size:11px;padding:1px 5px" data-kt-link="${id}" title="Insert link">\u{1F517}</button>
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
  const w = window.open('', '_blank', 'width=1200,height=800,menubar=no,toolbar=no');
  if (!w) { alert('Popup blocked. Please allow popups for this site.'); return; }

  // Copy relevant styles
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(el => el.outerHTML).join('\n');

  // Determine theme before writing HTML so the document starts with correct theme
  const _detachTheme = window.state?.preferences?.theme || 'dark';
  const _detachThemeClass = _detachTheme === 'light' ? 'light-mode' : _detachTheme === 'city-camo' ? 'city-camo' : _detachTheme === 'urban-camo' ? 'urban-camo' : '';
  const _detachDataSize = document.documentElement.getAttribute('data-size') || 'normal';

  w.document.write(`<!DOCTYPE html><html data-theme="${_detachTheme}" data-size="${_detachDataSize}"><head><title>${t('kt_title')||'Key Terrain Board'}</title>${styles}
    <style>body{padding:16px;background:var(--bg1);color:var(--text);font-family:system-ui,sans-serif}
    .modal-overlay{position:static!important;background:none!important}.modal{box-shadow:none!important;max-width:100%!important;width:100%!important;max-height:100%!important;padding:0!important;border:none!important}</style>
    </head><body class="${_detachThemeClass}"></body></html>`);
  w.document.close();

  // Copy scripts needed
  const scriptSrcs = ['/static/i18n.js', '/static/lang/en.js', '/static/utils.js', '/static/state.js', '/static/api.js', '/static/modals.js', '/static/key-terrain.js'];
  let loaded = 0;
  const onAllLoaded = () => {
    // Sync theme from parent window
    const theme = window.state?.preferences?.theme || 'dark';
    const themeClasses = ['light-mode', 'city-camo', 'urban-camo'];
    const wantClass = theme === 'light' ? 'light-mode' : theme === 'city-camo' ? 'city-camo' : theme === 'urban-camo' ? 'urban-camo' : '';
    themeClasses.forEach(c => w.document.body.classList.remove(c));
    if (wantClass) w.document.body.classList.add(wantClass);
    w.document.documentElement.setAttribute('data-theme', theme);

    // Copy state
    w.state = window.state;
    w.TRANSLATIONS = window.TRANSLATIONS;
    w._ktState = JSON.parse(JSON.stringify(_ktState));
    // Store theme class to re-apply after body innerHTML changes
    const _detachBodyClass = _detachThemeClass;
    w._boardModal = function(id, content, width) {
      let el = w.document.getElementById(id);
      if (el) el.remove();
      w.document.body.innerHTML = `<div style="padding:16px;max-width:${width||'1100px'};margin:0 auto">${content}</div>`;
      // Re-apply theme class after innerHTML replacement
      if (_detachBodyClass) w.document.body.classList.add(_detachBodyClass);
      if (typeof w._bindActions === 'function') w._bindActions(w.document.body);
    };
    w._closeBoardModal = function(id) {
      const el = w.document.getElementById(id);
      if (el) el.remove();
      // Re-render the board after closing a sub-modal
      if (typeof w.openKeyTerrainBoard === 'function') w.openKeyTerrainBoard();
    };
    // Set up SSE forwarding from parent to detached window
    const _ktDetachedSSEHandler = () => {
      if (w.closed) { document.removeEventListener('sse:key_terrain_change', _ktDetachedSSEHandler); return; }
      if (typeof w._ktHandleSSE === 'function') w._ktHandleSSE();
    };
    document.addEventListener('sse:key_terrain_change', _ktDetachedSSEHandler);
    if (typeof w.openKeyTerrainBoard === 'function') w.openKeyTerrainBoard();
  };
  scriptSrcs.forEach(src => {
    const s = w.document.createElement('script');
    s.src = src;
    s.onload = () => { loaded++; if (loaded === scriptSrcs.length) setTimeout(onAllLoaded, 100); };
    w.document.head.appendChild(s);
  });
}
