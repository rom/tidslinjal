/* ── Key Terrain Board ──────────────────────────────────────────────────── */
'use strict';

let _ktState = {
  entries: [],
  access: { can_write: false },
  editingId: null,
  showTimestamps: false,  // collapsed by default
  showArchived: false,    // show archived entries
  filter: {},             // active filters
  settings: {},           // persisted settings from server
  columnSort: null,       // {col:'priority', dir:'asc'} for per-column sorting
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
  const showTs = _ktState.showTimestamps;
  const ghostStyle = _ktGhostStyle();
  const f = _ktState.filter || {};
  const hasFilter = Object.values(f).some(v => v);

  // Separate active vs archived; hide ghosted if ghost_style === 'remove'
  const activeEntries = allEntries.filter(e => !e.archived && !(e.ghosted && ghostStyle === 'remove'));
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
      return true;
    });
  }

  // Sort using settings
  const sorted = _ktSortEntries(filtered);
  const totalCols = 8 + (showTs ? 3 : 0) + (canWrite ? 1 : 0);

  let html = `<div style="max-width:${showTs ? '1400' : '1100'}px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">\u{1F3D4}\uFE0F ${t('kt_title')||'Key Terrain Board'}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${!canWrite ? `<span style="font-size:var(--fs-xs);color:var(--text-dim);background:var(--bg3);padding:2px 8px;border-radius:var(--radius)">\u{1F512} ${t('kt_read_only')||'Read Only'}</span>` : ''}
        <button class="btn btn-sm ${hasFilter ? 'btn-primary' : 'btn-secondary'}" data-action="_ktOpenFilter">\u{1F50D} ${t('kt_filter')||'Filter'}${hasFilter ? ' \u2713' : ''}</button>
        <button class="btn btn-sm btn-secondary" data-action="_ktToggleTimestamps">\u{1F552} ${showTs ? t('kt_hide_ts')||'Hide Dates' : t('kt_show_ts')||'Show Dates'}</button>
        <button class="btn btn-sm btn-secondary" data-action="_ktOpenHistoryLog">\u{1F4DC} ${t('kt_history_log')||'History'}</button>
        ${canWrite ? `<button class="btn btn-sm btn-secondary" data-action="_ktOpenVersions">\u{1F4CB} ${t('kt_versions')||'Versions'}</button>` : ''}
        ${canWrite ? `<button class="btn btn-sm btn-secondary" data-action="_ktOpenSettings">\u2699 ${t('kt_settings')||'Settings'}</button>` : ''}
        ${canWrite ? `<button class="btn btn-sm btn-primary" data-action="_ktAddEntry">+ ${t('kt_add')||'Add Entry'}</button>` : ''}
      </div>
    </div>

    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:12px">${t('kt_desc')||'Cyber key terrain overview \u2014 tracks critical functions, their status, threats, and response actions.'}</p>

    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
        <thead>
          <tr style="background:var(--bg3);border-bottom:2px solid var(--border)">
            ${_ktSortTh('priority', '\u26A1 '+(t('kt_priority')||'Pri'), 'left', 'white-space:nowrap')}
            ${_ktSortTh('function', '\u{1F3AF} '+(t('kt_function')||'Function'), 'left', 'min-width:140px')}
            ${_ktSortTh('status', '\u{1F4CA} '+(t('kt_status')||'Status'), 'center', '')}
            ${_ktSortTh('trend', '\u{1F4C8} '+(t('kt_trend')||'Trend'), 'center', '')}
            ${_ktSortTh('threat', '\u2694\uFE0F '+(t('kt_threat')||'Threat'), 'left', 'min-width:120px')}
            ${_ktSortTh('external', '\u{1F517} '+(t('kt_external')||'External'), 'left', 'min-width:120px')}
            ${_ktSortTh('responsible', '\u{1F464} '+(t('kt_responsible')||'Responsible'), 'left', 'min-width:100px')}
            ${_ktSortTh('actions', '\u{1F527} '+(t('kt_actions')||'Actions'), 'left', 'min-width:140px')}
            ${showTs ? `
            <th style="padding:8px;text-align:center;white-space:nowrap;background:var(--bg2)">\u{1F4C5} ${t('kt_added')||'Added'}</th>
            <th style="padding:8px;text-align:center;white-space:nowrap;background:var(--bg2)">\u{1F504} ${t('kt_updated')||'Updated'}</th>
            <th style="padding:8px;text-align:center;white-space:nowrap;background:var(--bg2)">\u2705 ${t('kt_finished')||'Finished'}</th>
            ` : ''}
            ${canWrite ? `<th style="padding:8px;width:140px"></th>` : ''}
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

    html += `<tr style="background:${rowBg};border-bottom:1px solid var(--border);transition:background .15s;${rowStyle}" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='${rowBg}'">
      <td style="padding:8px;text-align:center;font-weight:700;font-size:14px;${priColor ? 'color:' + priColor : ''}">${e.priority || '\u2014'}</td>
      <td style="padding:8px;font-weight:600">${escHtml(e.function)}${e.ghosted ? ' <span style="font-size:9px;color:var(--text-dim);font-weight:normal">(ghosted)</span>' : ''}</td>
      <td style="padding:8px;text-align:center">
        <span style="padding:2px 8px;border-radius:10px;font-weight:600;white-space:nowrap" title="${statusOpt.label}">${sIcon} ${statusOpt.label}</span>
      </td>
      <td style="padding:8px;text-align:center">
        <span title="${trendOpt.label}">${trIcon} ${trendOpt.label}</span>
      </td>
      <td style="padding:8px">${escHtml(e.threat || '\u2014')}</td>
      <td style="padding:8px">${escHtml(e.external || '\u2014')}</td>
      <td style="padding:8px">${e.responsible_name ? escHtml(e.responsible_name) : '<span style="color:var(--text-dim)">\u2014</span>'}</td>
      <td style="padding:8px">${escHtml(e.actions || '\u2014')}</td>
      ${showTs ? `
      <td style="padding:8px;text-align:center;font-size:10px;color:var(--text-dim);background:var(--bg2);white-space:nowrap" title="${e.created_at || ''}">${fmtDate(e.created_at)}</td>
      <td style="padding:8px;text-align:center;font-size:10px;color:var(--text-dim);background:var(--bg2);white-space:nowrap" title="${e.updated_at || ''}">${fmtDateTime(e.updated_at)}</td>
      <td style="padding:8px;text-align:center;font-size:10px;background:var(--bg2);white-space:nowrap">${e.finished_at ? `<span style="color:var(--success,#27ae60)" title="${e.finished_at}">${fmtDate(e.finished_at)}</span>` : '<span style="color:var(--text-dim)">\u2014</span>'}</td>
      ` : ''}
      ${canWrite ? `<td style="padding:8px;text-align:center;white-space:nowrap">
        <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_ktMoveEntry" data-args='[${e.id},-1]' title="${t('kt_move_up')||'Move up'}">\u25B2</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_ktMoveEntry" data-args='[${e.id},1]' title="${t('kt_move_down')||'Move down'}">\u25BC</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktEditEntry" data-arg="${e.id}" title="${t('kt_edit')||'Edit'}">\u270F\uFE0F</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktShowHistory" data-arg="${e.id}" title="${t('kt_history')||'History'}">\u{1F4DC}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktToggleGhost" data-arg="${e.id}" title="${e.ghosted ? (t('kt_unghost')||'Unghost') : (t('kt_ghost')||'Ghost')}">${e.ghosted ? '\u{1F47B}\u2713' : '\u{1F47B}'}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px" data-action="_ktArchiveEntry" data-arg="${e.id}" title="${t('kt_archive')||'Archive'}">\u{1F4E6}</button>
        <button class="btn btn-sm" style="font-size:10px;padding:1px 5px;color:var(--danger)" data-action="_ktDeleteEntry" data-arg="${e.id}" title="${t('kt_remove')||'Remove'}">\u{1F5D1}</button>
      </td>` : ''}
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
    _boardModal('keyTerrainModal', html, (showTs ? '1400' : '1100') + 'px');
  } else {
    let el = document.getElementById('keyTerrainModal');
    if (el) el.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay" id="keyTerrainModal"><div class="modal" style="width:${showTs?1400:1100}px;max-width:96vw;max-height:94vh;overflow:auto;padding:20px;position:relative;resize:both">${html}</div></div>`);
    if (typeof openModal === 'function') openModal('keyTerrainModal');
    if (typeof _bindActions === 'function') _bindActions(document.getElementById('keyTerrainModal'));
  }
}

function _ktAddEntry() {
  _ktEditEntry(null);
}

async function _ktEditEntry(entryId) {
  let entry = { function: '', status: 'unknown', trend: 'stable', threat: '', external: '', priority: (_ktState.entries.length + 1), responsible_name: '', actions: '' };
  if (entryId) {
    const found = _ktState.entries.find(e => e.id === parseInt(entryId));
    if (found) entry = { ...found };
  }

  const isNew = !entryId;

  let html = `<div style="max-width:540px">
    <h3>${isNew ? '➕' : '✏️'} ${isNew ? (t('kt_add')||'Add Entry') : (t('kt_edit')||'Edit Entry')}</h3>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">🎯 ${t('kt_function')||'Function'} *</label>
      <input id="ktFunction" class="input" style="width:100%" value="${escHtml(entry.function)}" placeholder="${t('kt_function_ph')||'What matters / critical function'}">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">📊 ${t('kt_status')||'Status'}</label>
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
        <input id="ktPriority" type="number" class="input" style="width:100%" value="${entry.priority || ''}" min="1" placeholder="1">
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">⚔️ ${t('kt_threat')||'Threat'}</label>
      <textarea id="ktThreat" class="input" style="width:100%;height:50px;resize:vertical" placeholder="${t('kt_threat_ph')||'Current hostile pressure'}">${escHtml(entry.threat || '')}</textarea>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">🔗 ${t('kt_external')||'External Dependencies'}</label>
      <textarea id="ktExternal" class="input" style="width:100%;height:50px;resize:vertical" placeholder="${t('kt_external_ph')||'External dependencies and peer effects'}">${escHtml(entry.external || '')}</textarea>
    </div>

    <div style="margin-bottom:10px;position:relative">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">👤 ${t('kt_responsible')||'Responsible'}</label>
      <input id="ktResponsible" class="input" style="width:100%" value="${escHtml(entry.responsible_name || '')}" placeholder="${t('kt_responsible_ph')||'@name or display name'}" autocomplete="off">
      <input id="ktResponsibleId" type="hidden" value="${entry.responsible_id || 0}">
      <div id="ktResponsibleDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 4px 12px rgba(0,0,0,.3);max-height:160px;overflow-y:auto"></div>
    </div>

    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">🔧 ${t('kt_actions')||'Actions'}</label>
      <textarea id="ktActions" class="input" style="width:100%;height:60px;resize:vertical" placeholder="${t('kt_actions_ph')||'What is being done to achieve effects'}">${escHtml(entry.actions || '')}</textarea>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktSaveEntry" data-arg="${entryId || 0}">✔ ${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_ktCancelEdit">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;

  _boardModal('ktEditModal', html, '560px');

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

  const data = {
    function: fn,
    status: document.getElementById('ktStatus')?.value || 'unknown',
    trend: document.getElementById('ktTrend')?.value || 'stable',
    threat: document.getElementById('ktThreat')?.value?.trim() || '',
    external: document.getElementById('ktExternal')?.value?.trim() || '',
    priority: parseInt(document.getElementById('ktPriority')?.value) || 0,
    actions: document.getElementById('ktActions')?.value?.trim() || '',
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
  const sortBy = s.sort_by || 'priority';
  const gs = s.ghost_style || 'grey';

  let html = `<div style="max-width:540px">
    <h3>\u2699 ${t('kt_settings')||'Key Terrain Settings'}</h3>

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

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_ktSaveSettings">\u2714 ${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="ktSettingsModal">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('ktSettingsModal', html, '560px');
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
  const settings = {
    priority_colors: pc,
    status_icons: si,
    trend_icons: ti,
    sort_by: document.getElementById('ktSettSortBy')?.value || 'priority',
    ghost_style: document.getElementById('ktSettGhostStyle')?.value || 'grey',
  };
  try {
    await _ktApi('PUT', '/key-terrain/settings', settings);
    _ktState.settings = settings;
    if (typeof _closeBoardModal === 'function') _closeBoardModal('ktSettingsModal');
    _renderKeyTerrainBoard();
    if (typeof showNotification === 'function') showNotification('success', t('kt_settings_saved')||'Settings saved');
  } catch (e) { alert('Error: ' + e.message); }
}

// ── Sortable column header helper ──
function _ktSortTh(col, label, align, extra) {
  const cs = _ktState.columnSort;
  const arrow = cs && cs.col === col ? (cs.dir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  return `<th style="padding:8px;text-align:${align};cursor:pointer;user-select:none;${extra}" data-action="_ktSortByColumn" data-arg="${col}">${label}${arrow}</th>`;
}

// ── Move row up/down ──
async function _ktMoveEntry(args) {
  const [id, direction] = args;
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

// ── Toggle timestamp columns ──
function _ktToggleTimestamps() {
  _ktState.showTimestamps = !_ktState.showTimestamps;
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
        <input id="ktFilterPriority" type="number" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="${t('kt_filter_any')||'Any'}" value="${f.priority||''}" min="1">
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
