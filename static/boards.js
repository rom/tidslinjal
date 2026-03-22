/* ── Boards (Kanban) UI ─────────────────────────────────────────────────── */
'use strict';

// Build role <option> elements dynamically (includes custom roles from role editor)
function _boardRoleOptions(selectedKey) {
  const builtinRoles = [
    {key:'observer', label:'Observer'}, {key:'read', label:'Read'},
    {key:'reporter', label:'Reporter'}, {key:'teammember', label:'Team Member'},
    {key:'teamlead', label:'Team Lead'}, {key:'deputy_teamlead', label:'Deputy Team Lead'},
    {key:'oplead', label:'Operations Lead'}, {key:'deputy_oplead', label:'Deputy Operations Lead'},
    {key:'staffofficer', label:'Staff Officer'}, {key:'staff_assistant', label:'Staff Assistant'},
    {key:'staffofficer_full', label:'Staff Officer (Full)'}, {key:'admin', label:'Admin'},
  ];
  const allRoles = [...builtinRoles];
  (state.roleConfigs || []).forEach(rc => {
    if (!allRoles.find(r => r.key === rc.key) && rc.key !== 'admin') {
      allRoles.push({key: rc.key, label: rc.display_name || rc.key});
    }
  });
  return allRoles.map(r => {
    const label = (typeof getRoleDisplayName === 'function' ? getRoleDisplayName(r.key) : null) || r.label;
    return `<option value="${r.key}" ${r.key===selectedKey?'selected':''}>${escHtml(label)}</option>`;
  }).join('');
}

// ── State ──
let _boardsState = {
  boards: [],
  activeBoard: null,
  items: [],
  dragItem: null,
  dragOverCol: null,
  zoom: 1.0,
};

// ── Close board modal helper ──
function _closeBoardModal(id) {
  closeModal(id);
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Translate well-known column names ──
// Board columns are user-defined, but default/template column names can be translated
function _tColName(name) {
  const key = {
    'open': 'board_col_open',
    'in progress': 'board_col_in_progress',
    'closed': 'board_col_closed',
    'done': 'board_col_closed',
    'archived': 'board_col_archived',
    'reported': 'board_col_reported',
    'triaging': 'board_col_triaging',
    'resolved': 'board_col_resolved',
    'planned': 'board_col_planned',
    'preparing': 'board_col_preparing',
    'completed': 'board_col_completed',
    'requested': 'board_col_requested',
    'approved': 'board_col_approved',
    'deployed': 'board_col_deployed',
  }[name.toLowerCase()];
  return key ? (t(key) || name) : name;
}

// ── Modal helper (creates dynamic overlay modals) ──
function _boardModal(id, content, width) {
  let el = document.getElementById(id);
  if (el) el.remove();
  const html = `<div class="modal-overlay" id="${id}">
    <div class="modal" style="width:${width||'800px'};max-width:96vw;max-height:94vh;overflow:auto;padding:20px;position:relative;resize:both;min-width:320px;min-height:200px;box-sizing:border-box">
      <button class="modal-close" data-action="_closeBoardModal" data-arg="${id}" style="position:absolute;top:6px;right:6px;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-size:16px;cursor:pointer;border-radius:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;z-index:10">&#x2715;</button>
      ${content}
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(id);
  void modalEl.offsetHeight;
  modalEl.classList.add('open');
  if (typeof _bindActions === 'function') _bindActions(modalEl);
}

// ── API helpers ──
function _boardGetCSRF() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? m[1] : '';
}
async function _boardApi(method, path, body) {
  const csrf = _boardGetCSRF();
  const opts = { method, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' } };
  if (csrf) opts.headers['X-CSRF-Token'] = csrf;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return res.json();
}

// ── Open Boards Modal ──
async function openBoardsModal() {
  try {
    const [boards, templates] = await Promise.all([
      _boardApi('GET', '/boards').catch(() => []),
      _boardApi('GET', '/boards/templates').catch(() => []),
    ]);
    _boardsState.boards = boards;
    window._boardTemplates = templates;
  } catch { _boardsState.boards = []; }
  _boardsState.activeBoard = null;
  _boardsState.items = [];
  _renderBoardListModal();
}

function _renderBoardListModal() {
  const boards = _boardsState.boards;
  let html = `<div style="max-width:900px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">📌 ${t('board_title')||'Boards'}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-primary" data-action="_openCreateBoardDialog">+ ${t('board_new')||'New Board'}</button>
        <div style="position:relative;display:inline-block" id="boardListImpExpDropdown">
          <button class="btn btn-sm btn-secondary" data-action="_toggleBoardListImpExpMenu">⬆⬇ ${t('board_import_export')||'Import / Export'}</button>
          <div id="boardListImpExpMenu" style="display:none;position:absolute;top:100%;right:0;z-index:100;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 4px 12px rgba(0,0,0,.3);min-width:160px;margin-top:4px">
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_importBoardAs" data-arg="json">⬆ ${t('board_import_json')||'Import JSON'}</button>
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_importBoardAs" data-arg="csv">⬆ ${t('board_import_csv')||'Import CSV'}</button>
            <hr style="margin:2px 0;border:0;border-top:1px solid var(--border)">
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_exportAllBoardsJson">⬇ ${t('board_export_all')||'Export All (JSON)'}</button>
          </div>
        </div>
      </div>
    </div>`;

  if (boards.length === 0) {
    html += `<p style="color:var(--text-dim)">${t('board_empty')||'No boards yet. Create one or use a template.'}</p>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">`;
    for (const b of boards) {
      const vis = { private: '🔒', group: '👥', role: '🎭', global: '🌐' }[b.visibility] || '';
      const cardBg = b.color ? `background:${b.color}22;border:1px solid ${b.color}44;` : 'background:var(--bg2);border:1px solid var(--border);';
      const itemCount = b.item_count != null ? b.item_count : 0;
      html += `<div class="card" style="cursor:pointer;padding:14px;border-radius:var(--radius);${cardBg};position:relative" data-action="_openBoard" data-arg="${b.id}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${escHtml(b.name)}</strong>
          <div style="display:flex;align-items:center;gap:4px">
            <span title="${b.visibility}">${vis}</span>
            <button class="btn btn-sm" style="font-size:12px;padding:2px 5px;background:none;border:none;opacity:0.6" data-action="_editBoardFromList" data-arg="${b.id}" data-stop-prop title="${t('board_edit_board')||'Edit Board'}">✏️</button>
          </div>
        </div>
        ${b.color ? `<div style="height:3px;background:${b.color};border-radius:2px;margin-top:6px"></div>` : ''}
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${escHtml(b.description||'')}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:8px">${itemCount} ${t('board_items_count')||'items'} · ${b.columns ? b.columns.length : 3} ${t('board_columns')||'columns'} · ${escHtml(b.owner_name||'')}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Templates section (collapsed by default)
  const tmplCount = (window._boardTemplates || []).length;
  html += `<details style="margin-top:24px">
    <summary style="cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px"><h3 style="display:inline;margin:0">📋 ${t('board_templates')||'Templates'}</h3> <span style="font-size:var(--fs-xs);color:var(--text-dim)">(${tmplCount})</span></summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">`;
  for (const tmpl of (window._boardTemplates || [])) {
    html += `<div class="card" style="padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);cursor:pointer" data-action="_createFromTemplate" data-arg="${tmpl.id}">
      <strong style="font-size:var(--fs-sm)">${escHtml(tmpl.name)}</strong>
      <div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(tmpl.description||'')}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${tmpl.columns.length} ${t('board_columns')||'columns'}</div>
    </div>`;
  }
  html += `</div></details></div>`;

  _boardModal('boardsModal', html, '960px');
}

// ── Edit Board from list view ──
async function _editBoardFromList(boardId) {
  // Use cached data if available (for column add/remove/move), otherwise fetch
  let board;
  if (window._editBoardListData && window._editBoardListData.id === boardId) {
    board = window._editBoardListData;
  } else {
    try {
      board = await _boardApi('GET', '/boards/' + boardId);
    } catch (e) { alert('Failed to load board: ' + e.message); return; }
  }

  let groups = state.groups || [];
  try { groups = await apiGet('/api/groups?all=true') || groups; } catch {}

  const colColorPresets = [
    {label:'None',value:''},
    {label:'🟠 Orange',value:'rgba(230,126,34,0.15)'},
    {label:'🟡 Yellow',value:'rgba(241,196,15,0.15)'},
    {label:'🟢 Green',value:'rgba(39,174,96,0.15)'},
    {label:'🔵 Blue',value:'rgba(52,152,219,0.15)'},
    {label:'🔴 Red',value:'rgba(231,76,60,0.15)'},
    {label:'🟣 Purple',value:'rgba(155,89,182,0.15)'}
  ];

  let colsHtml = '';
  for (let i = 0; i < (board.columns || []).length; i++) {
    const col = board.columns[i];
    colsHtml += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <input class="input editBoardCol" data-idx="${i}" value="${escHtml(col.name)}" style="flex:1">
      <select class="input editBoardColColor" data-idx="${i}" style="width:100px;font-size:var(--fs-xs)">
        ${colColorPresets.map(p => `<option value="${p.value}" ${col.color===p.value?'selected':''}>${p.label}</option>`).join('')}
      </select>
      <button class="btn btn-sm" data-action="_moveEditBoardCol" data-args="[${i},-1]" ${i===0?'disabled':''}>↑</button>
      <button class="btn btn-sm" data-action="_moveEditBoardCol" data-args="[${i},1]" ${i===(board.columns||[]).length-1?'disabled':''}>↓</button>
      <button class="btn btn-sm" style="color:var(--danger)" data-action="_removeEditBoardCol" data-arg="${i}">✖</button>
    </div>`;
  }

  let html = `<div style="max-width:540px">
    <h3 style="margin-bottom:12px">✏️ ${t('board_edit_board')||'Edit Board'}</h3>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('board_name')||'Board Name'}</label>
        <input id="editBoardName" class="input" style="width:100%" value="${escHtml(board.name)}">
      </div>
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('board_color')||'Board Color'}</label>
        <div style="display:flex;align-items:center;gap:6px">
          <input id="editBoardColor" type="color" value="${board.color||'#1a1a2e'}" style="width:48px;height:28px;cursor:pointer;border:none;padding:0">
          ${board.color ? `<button class="btn btn-sm btn-secondary" style="font-size:var(--fs-xs);padding:1px 6px" id="editBoardColorClear">✖ ${t('board_color_clear')||'Clear'}</button>` : ''}
        </div>
      </div>
    </div>

    <div style="margin-bottom:12px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('board_description')||'Description'}</label>
      <input id="editBoardDesc" class="input" style="width:100%" value="${escHtml(board.description||'')}" placeholder="${t('board_desc_placeholder')||'Optional description'}">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div>
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('board_visibility')||'Visibility'}</label>
        <select id="editBoardVis" class="input" style="width:100%">
          <option value="private" ${board.visibility==='private'?'selected':''}>🔒 ${t('board_vis_private')||'Private'}</option>
          <option value="group" ${board.visibility==='group'?'selected':''}>👥 ${t('board_vis_group')||'Group'}</option>
          <option value="role" ${board.visibility==='role'?'selected':''}>🎭 ${t('board_vis_role')||'Role'}</option>
          <option value="global" ${board.visibility==='global'?'selected':''}>🌐 ${t('board_vis_global')||'Global'}</option>
        </select>
      </div>
      <div id="editBoardGroupDiv" style="display:${board.visibility==='group'?'':'none'}">
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('board_group')||'Group'}</label>
        <select id="editBoardGroup" class="input" style="width:100%">
          ${groups.map(g => `<option value="${g.id}" ${g.id===board.group_id?'selected':''}>${escHtml(g.name)}</option>`).join('')}
        </select>
      </div>
      <div id="editBoardRoleDiv" style="display:${board.visibility==='role'?'':'none'}">
        <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('board_role')||'Role'}</label>
        <select id="editBoardRole" class="input" style="width:100%">
          ${_boardRoleOptions(board.role_key || '')}
        </select>
      </div>
    </div>

    <div style="margin-bottom:12px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('board_columns')||'Columns'}</label>
      <div id="editBoardCols">${colsHtml}</div>
      <button class="btn btn-sm btn-secondary" data-action="_addEditBoardCol" style="margin-top:4px">+ ${t('board_add_col')||'Add Column'}</button>
    </div>

    <div style="margin-bottom:12px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px;font-size:var(--fs-sm)">${t('board_display_options')||'Display Options'}</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer;margin-bottom:4px">
        <input type="checkbox" id="editBoardShowIcons" ${board.show_icons !== false ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('board_show_icons')||'Show type icons on cards'}
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer;margin-bottom:4px">
        <input type="checkbox" id="editBoardPriorityBg" ${board.priority_background !== false ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('board_priority_background')||'Color card background by priority'}
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer">
        <input type="checkbox" id="editBoardShowArchival" ${board.show_archival !== false ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('board_show_archival')||'Show archive controls on column headers'}
      </label>
    </div>

    <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:10px">
      <button class="btn btn-sm" style="color:var(--danger);background:none;border:1px solid var(--danger);opacity:0.7;font-size:var(--fs-xs)" data-action="_removeBoardFromList" data-arg="${board.id}">🗑 ${t('board_delete')||'Delete Board'}</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" data-action="_saveEditBoardFromList" data-arg="${board.id}">${t('btn_save')||'Save'}</button>
        <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="editBoardListModal">${t('btn_cancel')||'Cancel'}</button>
      </div>
    </div>
  </div>`;

  _boardModal('editBoardListModal', html, '560px');

  // Store board data for save
  window._editBoardListData = board;

  // Wire visibility toggle
  const visSel = document.getElementById('editBoardVis');
  if (visSel) {
    visSel.addEventListener('change', function() {
      const v = visSel.value;
      const gd = document.getElementById('editBoardGroupDiv');
      const rd = document.getElementById('editBoardRoleDiv');
      if (gd) gd.style.display = v === 'group' ? '' : 'none';
      if (rd) rd.style.display = v === 'role' ? '' : 'none';
    });
  }
  // Wire color clear
  const clearBtn = document.getElementById('editBoardColorClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      const colorEl = document.getElementById('editBoardColor');
      if (colorEl) colorEl.value = '#1a1a2e';
      clearBtn.remove();
    });
  }
}

// Column management helpers for edit-from-list modal
function _addEditBoardCol() {
  const board = window._editBoardListData;
  if (!board) return;
  const id = 'col_' + Date.now();
  board.columns.push({ id, name: 'New Column', collapsed: false, color: '' });
  _editBoardFromList(board.id);
}

function _removeEditBoardCol(idx) {
  const board = window._editBoardListData;
  if (!board || board.columns.length <= 1) return;
  // Sync names/colors from DOM before removing
  _syncEditBoardColsFromDOM(board);
  board.columns.splice(parseInt(idx), 1);
  _editBoardFromList(board.id);
}

function _moveEditBoardCol(args) {
  const board = window._editBoardListData;
  if (!board) return;
  const [idx, dir] = args;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= board.columns.length) return;
  _syncEditBoardColsFromDOM(board);
  const tmp = board.columns[idx];
  board.columns[idx] = board.columns[newIdx];
  board.columns[newIdx] = tmp;
  _editBoardFromList(board.id);
}

function _syncEditBoardColsFromDOM(board) {
  document.querySelectorAll('.editBoardCol').forEach(inp => {
    const i = parseInt(inp.dataset.idx);
    if (board.columns[i]) board.columns[i].name = inp.value.trim() || board.columns[i].name;
  });
  document.querySelectorAll('.editBoardColColor').forEach(sel => {
    const i = parseInt(sel.dataset.idx);
    if (board.columns[i]) board.columns[i].color = sel.value;
  });
}

async function _saveEditBoardFromList(boardId) {
  const board = window._editBoardListData;
  if (!board) return;
  // Sync latest column names/colors from DOM
  _syncEditBoardColsFromDOM(board);
  const boardColor = document.getElementById('editBoardColor')?.value || '';
  try {
    await _boardApi('PUT', '/boards/' + boardId, {
      name: document.getElementById('editBoardName')?.value?.trim() || board.name,
      description: document.getElementById('editBoardDesc')?.value?.trim() || '',
      visibility: document.getElementById('editBoardVis')?.value || board.visibility,
      group_id: parseInt(document.getElementById('editBoardGroup')?.value) || 0,
      role_key: document.getElementById('editBoardRole')?.value || '',
      columns: board.columns,
      color: boardColor === '#1a1a2e' ? '' : boardColor,
      show_icons: document.getElementById('editBoardShowIcons')?.checked !== false,
      priority_background: document.getElementById('editBoardPriorityBg')?.checked !== false,
      show_archival: document.getElementById('editBoardShowArchival')?.checked !== false,
    });
    _closeBoardModal('editBoardListModal');
    // Refresh the board list
    const boards = await _boardApi('GET', '/boards').catch(() => []);
    _boardsState.boards = boards;
    _renderBoardListModal();
    if (typeof showNotification === 'function') showNotification('success', 'Board settings saved');
  } catch (e) { alert('Failed to save: ' + e.message); }
}

// ── Create Board Dialog ──
async function _openCreateBoardDialog() {
  // Fetch all groups (not just user's own) for board sharing
  let groups = state.groups || [];
  try { groups = await apiGet('/api/groups?all=true') || groups; } catch(e) {}
  let html = `<div style="max-width:500px">
    <h3>${t('board_new')||'New Board'}</h3>
    <label>${t('board_name')||'Name'}</label>
    <input id="newBoardName" class="input" style="width:100%;margin-bottom:8px" placeholder="${t('board_name_placeholder')||'Board name'}">
    <label>${t('board_description')||'Description'}</label>
    <input id="newBoardDesc" class="input" style="width:100%;margin-bottom:8px" placeholder="${t('board_desc_placeholder')||'Optional description'}">
    <label>${t('board_visibility')||'Visibility'}</label>
    <select id="newBoardVis" class="input" style="width:100%;margin-bottom:8px" data-action="_toggleBoardVisFields" data-event="change">
      <option value="private">🔒 ${t('board_vis_private')||'Private'}</option>
      <option value="group">👥 ${t('board_vis_group')||'Group'}</option>
      <option value="role">🎭 ${t('board_vis_role')||'Role'}</option>
      <option value="global">🌐 ${t('board_vis_global')||'Global'}</option>
    </select>
    <div id="newBoardGroupDiv" style="display:none;margin-bottom:8px">
      <label>${t('board_group')||'Group'}</label>
      <select id="newBoardGroup" class="input" style="width:100%">
        ${groups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('')}
      </select>
    </div>
    <div id="newBoardRoleDiv" style="display:none;margin-bottom:8px">
      <label>${t('board_role')||'Role'}</label>
      <select id="newBoardRole" class="input" style="width:100%">
        ${_boardRoleOptions('')}
      </select>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary" data-action="_doCreateBoard">✔ ${t('btn_create')||'Create'}</button>
      <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="boardCreateModal">✖ ${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('boardCreateModal', html, '520px');
  // Ensure the select dropdown is not clipped by overflow
  const createModalDiv = document.querySelector('#boardCreateModal .modal');
  if (createModalDiv) createModalDiv.style.overflow = 'visible';
}

function _toggleBoardVisFields() {
  const vis = document.getElementById('newBoardVis').value;
  document.getElementById('newBoardGroupDiv').style.display = vis === 'group' ? '' : 'none';
  document.getElementById('newBoardRoleDiv').style.display = vis === 'role' ? '' : 'none';
}

async function _doCreateBoard() {
  const name = document.getElementById('newBoardName').value.trim();
  if (!name) return;
  const body = {
    name,
    description: document.getElementById('newBoardDesc').value.trim(),
    visibility: document.getElementById('newBoardVis').value,
    group_id: parseInt(document.getElementById('newBoardGroup')?.value) || 0,
    role_key: document.getElementById('newBoardRole')?.value || '',
  };
  try {
    await _boardApi('POST', '/boards', body);
    closeModal('boardCreateModal');
    openBoardsModal();
  } catch (e) { alert(e.message); }
}

async function _createFromTemplate(templateId) {
  const name = prompt(t('board_name_placeholder')||'Board name:');
  if (!name) return;
  try {
    await _boardApi('POST', '/boards', { name, template_id: templateId, visibility: 'private' });
    openBoardsModal();
  } catch (e) { alert(e.message); }
}

// ── Open single board (Kanban view) ──
async function _openBoard(boardId) {
  try {
    const [board, items] = await Promise.all([
      _boardApi('GET', '/boards/' + boardId),
      _boardApi('GET', '/boards/' + boardId + '/items'),
    ]);
    _boardsState.activeBoard = board;
    _boardsState.items = items;
    _renderKanbanBoard();
  } catch (e) { alert(e.message); }
}

function _renderKanbanBoard() {
  const board = _boardsState.activeBoard;
  const items = _boardsState.items;
  if (!board) return;

  const archivedItems = items.filter(i => i.archived);
  const activeItems = items.filter(i => !i.archived);
  const colItems = {};
  for (const col of board.columns) colItems[String(col.id)] = [];
  for (const item of activeItems) {
    const cid = String(item.column_id);
    if (!colItems[cid]) colItems[cid] = [];
    colItems[cid].push(item);
  }
  // Sort by sort_order
  for (const k of Object.keys(colItems)) colItems[k].sort((a, b) => a.sort_order - b.sort_order);

  const boardBg = board.color ? `background:${board.color}22;border:1px solid ${board.color}44;border-radius:var(--radius);padding:12px;` : '';
  const btnStyle = 'min-width:32px;height:28px;padding:4px 8px;font-size:13px;display:inline-flex;align-items:center;justify-content:center;';
  let html = `<div style="width:100%;overflow-x:auto;box-sizing:border-box;${boardBg}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-sm btn-secondary" data-action="openBoardsModal" title="${t('board_back')||'Back to boards'}" style="${btnStyle}">← ${t('board_back_short')||'Boards'}</button>
        ${board.color ? `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${board.color}"></span>` : ''}
        <h2 style="margin:0">${escHtml(board.name)}</h2>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-right:28px">
        <button class="btn btn-sm btn-secondary" data-action="_showBoardHelp" title="${t('board_help')||'Help'}" style="${btnStyle}">❓</button>
        <button class="btn btn-sm btn-secondary" data-action="_shareBoardLink" title="${t('board_share')||'Share link'}" style="${btnStyle}">🔗</button>
        <button class="btn btn-sm btn-secondary" data-action="_openBoardSettings" title="${t('board_settings')||'Settings'}" style="${btnStyle}">⚙</button>
        <button class="btn btn-sm btn-secondary" data-action="_detachBoard" title="${t('board_detach')||'Detach window'}" style="${btnStyle}">⧉</button>
        <button class="btn btn-sm btn-secondary" data-action="_printBoard" title="${t('board_print')||'Print'}" style="${btnStyle}">🖨</button>
        <div style="position:relative;display:inline-block" id="boardExportDropdown">
          <button class="btn btn-sm btn-secondary" data-action="_toggleBoardExportMenu" style="${btnStyle}">⬇ ${t('btn_export')||'Export'}</button>
          <div id="boardExportMenu" style="display:none;position:absolute;top:100%;right:0;z-index:100;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 4px 12px rgba(0,0,0,.3);min-width:120px;margin-top:4px">
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_exportBoard" data-arg="json">JSON</button>
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_exportBoard" data-arg="csv">CSV</button>
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_exportBoard" data-arg="svg">SVG</button>
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_exportBoard" data-arg="pdf">PDF</button>
          </div>
        </div>
        <div style="position:relative;display:inline-block" id="boardImportDropdown">
          <button class="btn btn-sm btn-secondary" data-action="_toggleBoardImportMenu" style="${btnStyle}">⬆ ${t('btn_import')||'Import'}</button>
          <div id="boardImportMenu" style="display:none;position:absolute;top:100%;right:0;z-index:100;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 4px 12px rgba(0,0,0,.3);min-width:120px;margin-top:4px">
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_importBoardAs" data-arg="json">JSON</button>
            <button class="btn btn-sm" style="width:100%;text-align:left;border:none;border-radius:0;padding:6px 12px" data-action="_importBoardAs" data-arg="csv">CSV</button>
          </div>
        </div>
        <span style="border-left:1px solid var(--border);height:20px;margin:0 2px"></span>
        <button class="btn btn-sm btn-secondary" style="color:var(--danger);${btnStyle}" data-action="_deleteBoardConfirm" title="${t('board_delete')||'Delete board'}">🗑</button>
        <span style="border-left:1px solid var(--border);height:20px;margin:0 2px"></span>
        <button class="btn btn-sm btn-secondary" data-action="_boardUndo" title="${t('btn_undo')||'Undo'}" style="${btnStyle}" id="boardUndoBtn" ${state.undoStack.length===0?'disabled':''}>↩ ${t('btn_undo')||'Undo'}</button>
        <span style="border-left:1px solid var(--border);height:20px;margin:0 2px"></span>
        <button class="btn btn-sm btn-secondary" data-action="_boardZoomOut" title="${t('board_zoom_out')||'Zoom out'}" style="${btnStyle}">−</button>
        <span id="boardZoomLevel" style="font-size:var(--fs-xs);min-width:36px;text-align:center">${Math.round(_boardsState.zoom * 100)}%</span>
        <button class="btn btn-sm btn-secondary" data-action="_boardZoomIn" title="${t('board_zoom_in')||'Zoom in'}" style="${btnStyle}">+</button>
        <button class="btn btn-sm btn-secondary" data-action="_boardZoomReset" title="${t('board_zoom_reset')||'Reset zoom'}" style="${btnStyle}font-size:var(--fs-xs);">100%</button>
      </div>
    </div>
    <div class="kanban-col-tabs" style="display:none">
      ${board.columns.map((col, i) => {
        const cnt = (colItems[String(col.id)] || []).length;
        return `<button class="kanban-col-tab${i===0?' active':''}" data-col-tab="${col.id}">${escHtml(_tColName(col.name))} (${cnt})</button>`;
      }).join('')}
      ${archivedItems.length > 0 ? `<button class="kanban-col-tab" data-col-tab="_archived">📦 (${archivedItems.length})</button>` : ''}
    </div>
    <div class="kanban-columns" style="display:flex;gap:12px;min-height:400px;align-items:flex-start;width:100%;box-sizing:border-box;transform:scale(${_boardsState.zoom});transform-origin:top left;${_boardsState.zoom !== 1 ? 'width:' + (100 / _boardsState.zoom) + '%;' : ''}">`;

  for (const col of board.columns) {
    const collapsed = col.collapsed;
    const cItems = colItems[String(col.id)] || [];
    if (collapsed) {
      html += `<div class="kanban-col kanban-col-collapsed" style="min-width:40px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:8px;cursor:pointer;writing-mode:vertical-rl;text-orientation:mixed" data-action="_toggleColCollapse" data-arg="${col.id}">
        <strong>${escHtml(_tColName(col.name))} (${cItems.length})</strong>
      </div>`;
    } else {
      const colBg = col.color ? col.color : 'var(--bg2)';
      const colBorder = col.color ? `border:1px solid ${col.color};` : 'border:1px solid var(--border);';
      html += `<div class="kanban-col" data-col="${col.id}" data-drop-col="${col.id}" style="min-width:240px;max-width:320px;flex:1;background:${colBg};${colBorder}border-radius:var(--radius);padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong style="cursor:pointer" data-dblclick-rename="${col.id}" data-col-name="${escHtml(col.name)}">${escHtml(_tColName(col.name))} (${cItems.length})</strong>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_addItemToCol" data-arg="${col.id}" title="${t('board_add_item')||'Add item'}">+</button>
            ${board.show_archival !== false && cItems.length > 0 ? `<button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_archiveColumnItems" data-arg="${col.id}" title="${t('board_archive_col')||'Archive all items in this column'}">📦</button>` : ''}
            <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_toggleColCollapse" data-arg="${col.id}" title="${t('board_collapse')||'Collapse'}">−</button>
          </div>
        </div>
        <div class="kanban-items" style="display:flex;flex-direction:column;gap:6px;min-height:40px">`;

      for (const item of cItems) {
        const showIcons = board.show_icons !== false;
        const priorityBg = board.priority_background !== false;
        const bgColor = priorityBg && item.priority && item.priority !== 'normal' && item.priority !== 'low'
          ? (item.priority === 'critical' ? 'rgba(231,76,60,0.12)' : item.priority === 'high' ? 'rgba(230,126,34,0.12)' : (item.color || 'var(--bg3)'))
          : (item.color || 'var(--bg3)');
        const typeIcon = showIcons ? (_itemTypeIcons[item.item_type] || '') : '';
        const priorityBadge = item.priority && item.priority !== 'normal' ? ({low:'🔵',high:'🟠',critical:'🔴'}[item.priority]||'') : '';
        // Due date display and urgency
        let dueDateHtml = '';
        if (item.due_date) {
          const due = new Date(item.due_date + 'T23:59:59');
          const now = new Date();
          const daysLeft = Math.ceil((due - now) / 86400000);
          const dueColor = daysLeft < 0 ? 'var(--danger)' : daysLeft <= 2 ? '#e67e22' : 'var(--text-dim)';
          dueDateHtml = `<span title="${t('board_due_date')||'Due'}: ${item.due_date}" style="color:${dueColor};font-weight:${daysLeft<=0?'bold':'normal'}">📅 ${item.due_date.slice(5)}</span>`;
        }
        html += `<div class="kanban-card" draggable="true" data-item-id="${item.id}" data-drag-item="${item.id}"
          style="background:${bgColor};border:1px solid var(--border);border-radius:var(--radius);padding:8px;cursor:grab;position:relative"
          data-action="_openBoardItem" data-arg="${item.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <strong style="font-size:var(--fs-sm)">${priorityBadge ? priorityBadge + ' ' : ''}${typeIcon ? typeIcon + ' ' : ''}${escHtml(item.subject)}</strong>
            <span style="font-size:var(--fs-xs);color:var(--text-dim);white-space:nowrap">#${item.id}</span>
          </div>
          ${item.note ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px;max-height:40px;overflow:hidden">${escHtml(item.note).substring(0, 100)}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:var(--fs-xs)">
            <span style="color:var(--text-dim)">${item.responsible_name ? escHtml(item.responsible_name) : escHtml(item.creator_name||'')}</span>
            <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
              ${item.tags ? item.tags.map(tag => `<span style="background:var(--accent);color:#fff;padding:0 4px;border-radius:3px;font-size:9px">${escHtml(tag)}</span>`).join('') : ''}
              ${dueDateHtml}
              ${item.attachments && item.attachments.length ? `<span title="${item.attachments.length} attachment(s)">📎${item.attachments.length}</span>` : ''}
              ${item.links && item.links.length ? `<span title="${item.links.length} link(s)">🔗${item.links.length}</span>` : ''}
              ${item.comments && item.comments.length ? `<span title="${item.comments.length} comment(s)">💬${item.comments.length}</span>` : ''}
              ${item.checklist_id ? '<span title="Linked checklist">📋</span>' : ''}
              ${item.event_id ? '<span title="Linked event">📅</span>' : ''}
              ${item.related_item_ids && item.related_item_ids.length ? `<span title="${item.related_item_ids.length} related item(s)">🔗${item.related_item_ids.length}</span>` : ''}
            </div>
          </div>
        </div>`;
      }
      html += `</div></div>`;
    }
  }
  // Archived column to the right (inline with other columns)
  if (archivedItems.length > 0) {
    html += `<div class="kanban-col" style="min-width:180px;max-width:220px;flex-shrink:0;background:var(--bg2);border:1px dashed var(--border);border-radius:var(--radius);padding:10px;opacity:0.8">
      <div style="font-weight:700;margin-bottom:8px;color:var(--text-dim)">📦 ${t('board_archived')||'Archived'} (${archivedItems.length})</div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:500px;overflow-y:auto">`;
    for (const item of archivedItems) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;background:var(--bg3);border-radius:var(--radius);font-size:10px">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(item.subject)}">${escHtml(item.subject)}</span>
        <div style="display:flex;gap:2px;flex-shrink:0;margin-left:4px">
          <button class="btn btn-sm" style="font-size:9px;padding:0 4px" data-action="_unarchiveBoardItem" data-arg="${item.id}" title="${t('board_unarchive')||'Restore'}">↩</button>
          <button class="btn btn-sm" style="font-size:9px;padding:0 4px;color:var(--danger)" data-action="_deleteBoardItem" data-arg="${item.id}" title="${t('board_delete_item')||'Delete'}">🗑</button>
        </div>
      </div>`;
    }
    html += `</div></div>`;
  }

  html += `</div>`; // close kanban-columns

  html += `</div>`; // close outer wrapper

  // Adjust width to number of columns: ~280px per column + padding, capped at 95vw
  const visibleCols = board.columns.filter(c => !c.collapsed).length;
  const collapsedCols = board.columns.length - visibleCols;
  const archiveColWidth = archivedItems.length > 0 ? 220 : 0;
  const calcWidth = visibleCols * 300 + collapsedCols * 60 + archiveColWidth + 80;
  const boardWidth = Math.min(calcWidth, window.innerWidth * 0.95);
  _boardModal('boardsModal', html, boardWidth + 'px');
  _bindKanbanEvents();
  _setupKanbanDragScroll();

  // Watch modal resize and adjust inner pane to fill available space
  const boardModalEl = document.querySelector('#boardsModal .modal');
  if (boardModalEl && typeof ResizeObserver !== 'undefined') {
    const kanbanCols = boardModalEl.querySelector('.kanban-columns');
    const outerWrap = kanbanCols ? kanbanCols.parentElement : null;
    new ResizeObserver(() => {
      if (!kanbanCols) return;
      const zoom = _boardsState.zoom || 1;
      const avail = boardModalEl.clientWidth - 40; // 20px padding each side
      if (avail > 0) {
        // The outer scrollable wrapper should match modal width
        if (outerWrap) outerWrap.style.width = avail + 'px';
        // Kanban columns need width adjusted for zoom transform
        kanbanCols.style.width = (avail / zoom) + 'px';
        // Update column max-widths to fill space evenly
        const cols = kanbanCols.querySelectorAll('.kanban-col:not(.kanban-col-collapsed)');
        if (cols.length > 0) {
          const colGap = 12;
          const collapseWidth = kanbanCols.querySelectorAll('.kanban-col-collapsed').length * 52;
          const colAvail = (avail / zoom) - collapseWidth - (cols.length - 1) * colGap - 20;
          const perCol = Math.max(240, Math.floor(colAvail / cols.length));
          cols.forEach(c => { c.style.maxWidth = perCol + 'px'; c.style.flex = '1 1 ' + perCol + 'px'; });
        }
      }
    }).observe(boardModalEl);
  }
}

// ── Bind drag/drop and dblclick events for kanban board ──
function _bindKanbanEvents() {
  const modal = document.getElementById('boardsModal');
  if (!modal) return;

  // Drag & drop on columns
  modal.querySelectorAll('[data-drop-col]').forEach(col => {
    const colId = col.dataset.dropCol;
    col.addEventListener('dragover', e => _kanbanDragOver(e, colId));
    col.addEventListener('drop', e => _kanbanDrop(e, colId));
    col.addEventListener('dragleave', e => _kanbanDragLeave(e));
  });

  // Drag start/end on cards
  modal.querySelectorAll('[data-drag-item]').forEach(card => {
    const itemId = parseInt(card.dataset.dragItem);
    card.addEventListener('dragstart', e => _kanbanDragStart(e, itemId));
    card.addEventListener('dragend', e => _kanbanDragEnd(e));
  });

  // Dblclick rename on column headers
  modal.querySelectorAll('[data-dblclick-rename]').forEach(el => {
    const colId = el.dataset.dblclickRename;
    const colName = el.dataset.colName;
    el.addEventListener('dblclick', () => _renameCol(colId, colName));
  });

  // Mobile column tab navigation
  _setupMobileKanbanTabs(modal);
}

function _setupMobileKanbanTabs(modal) {
  const isMobile = window.innerWidth <= 768;
  const tabBar = modal.querySelector('.kanban-col-tabs');
  if (!tabBar) return;
  // Show tab bar only on mobile
  tabBar.style.display = isMobile ? 'flex' : 'none';
  if (!isMobile) return;

  const kanbanCols = modal.querySelector('.kanban-columns');
  if (!kanbanCols) return;

  tabBar.querySelectorAll('.kanban-col-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabBar.querySelectorAll('.kanban-col-tab').forEach(t2 => t2.classList.remove('active'));
      tab.classList.add('active');
      const colId = tab.dataset.colTab;
      let target;
      if (colId === '_archived') {
        // Last column is the archive
        const cols = kanbanCols.querySelectorAll('.kanban-col');
        target = cols[cols.length - 1];
      } else {
        target = kanbanCols.querySelector('[data-col="' + colId + '"]');
      }
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  // Highlight active tab on scroll
  let scrollTimer;
  kanbanCols.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const cols = kanbanCols.querySelectorAll('.kanban-col:not(.kanban-col-collapsed)');
      const center = kanbanCols.scrollLeft + kanbanCols.clientWidth / 2;
      let closest = null, closestDist = Infinity;
      cols.forEach(c => {
        const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
        if (dist < closestDist) { closestDist = dist; closest = c; }
      });
      if (closest) {
        const activeColId = closest.dataset.col || '_archived';
        tabBar.querySelectorAll('.kanban-col-tab').forEach(t2 => {
          t2.classList.toggle('active', t2.dataset.colTab === activeColId);
        });
      }
    }, 100);
  });
}

// ── Drag-to-scroll on the kanban board container ──
function _setupKanbanDragScroll() {
  const modal = document.getElementById('boardsModal');
  if (!modal) return;
  // The scrollable wrapper is the first child inside .modal-body
  const body = modal.querySelector('.modal-body');
  if (!body) return;
  const container = body.querySelector('[style*="overflow-x"]') || body.firstElementChild;
  if (!container) return;

  let dragging = false, startX = 0, startScrollLeft = 0;

  container.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    // Don't interfere with card drag, buttons, inputs, or interactive elements
    if (e.target.closest('.kanban-card, button, input, select, textarea, a, [data-action]')) return;
    dragging = true;
    startX = e.clientX;
    startScrollLeft = container.scrollLeft;
    container.style.cursor = 'grabbing';
    container.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  container.addEventListener('pointermove', e => {
    if (!dragging) return;
    container.scrollLeft = startScrollLeft - (e.clientX - startX);
  });

  container.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    container.style.cursor = '';
  });
}

// ── Drag & Drop ──
function _kanbanDragStart(e, itemId) {
  _boardsState.dragItem = itemId;
  _boardsState.justDragged = true;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', itemId);
  e.target.style.opacity = '0.5';
}
function _kanbanDragEnd(e) {
  e.target.style.opacity = '1';
  _boardsState.dragItem = null;
  _boardsState.dragOverCol = null;
  document.querySelectorAll('.kanban-col').forEach(c => c.style.outline = '');
  document.querySelectorAll('.kanban-drop-indicator').forEach(el => el.remove());
  // Clear justDragged after click event has fired
  setTimeout(() => { _boardsState.justDragged = false; }, 100);
}
function _kanbanDragOver(e, colId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  _boardsState.dragOverCol = colId;
  const col = e.currentTarget;
  col.style.outline = '2px solid var(--accent)';

  // Show drop position indicator between cards
  const itemsContainer = col.querySelector('.kanban-items');
  if (!itemsContainer) return;
  const cards = [...itemsContainer.querySelectorAll('.kanban-card')];
  // Remove old indicators
  col.querySelectorAll('.kanban-drop-indicator').forEach(el => el.remove());
  // Find insertion position based on mouse Y
  let insertBefore = null;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      insertBefore = card;
      break;
    }
  }
  const indicator = document.createElement('div');
  indicator.className = 'kanban-drop-indicator';
  indicator.style.cssText = 'height:3px;background:var(--accent);border-radius:2px;margin:2px 0;';
  if (insertBefore) {
    itemsContainer.insertBefore(indicator, insertBefore);
  } else {
    itemsContainer.appendChild(indicator);
  }
}
function _kanbanDragLeave(e) {
  e.currentTarget.style.outline = '';
  e.currentTarget.querySelectorAll('.kanban-drop-indicator').forEach(el => el.remove());
}
async function _kanbanDrop(e, colId) {
  e.preventDefault();
  e.currentTarget.style.outline = '';
  e.currentTarget.querySelectorAll('.kanban-drop-indicator').forEach(el => el.remove());
  const itemId = _boardsState.dragItem;
  if (!itemId) return;

  // Determine drop position based on mouse Y relative to cards
  const col = e.currentTarget;
  const itemsContainer = col.querySelector('.kanban-items');
  const cards = itemsContainer ? [...itemsContainer.querySelectorAll('.kanban-card')] : [];
  const colItems = _boardsState.items
    .filter(i => String(i.column_id) === String(colId))
    .sort((a, b) => a.sort_order - b.sort_order);

  let dropIndex = colItems.length; // default: append to end
  for (let ci = 0; ci < cards.length; ci++) {
    const rect = cards[ci].getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      dropIndex = ci;
      break;
    }
  }

  // Recompute sort orders: assign sequential values with the dragged item inserted at dropIndex
  const draggedItem = _boardsState.items.find(i => i.id === itemId);
  const otherItems = colItems.filter(i => i.id !== itemId);
  otherItems.splice(dropIndex > otherItems.length ? otherItems.length : dropIndex, 0, draggedItem || {id: itemId});

  // The new sort_order for the dragged item
  const sortOrder = dropIndex;

  try {
    await _boardApi('POST', '/board-items/' + itemId + '/move', { column_id: colId, sort_order: sortOrder });
    // Update local state: reassign sort orders for all items in the column
    if (draggedItem) {
      draggedItem.column_id = colId;
    }
    // Reorder all items in this column
    const updatedColItems = _boardsState.items
      .filter(i => String(i.column_id) === String(colId))
      .sort((a, b) => a.sort_order - b.sort_order);
    // Remove dragged item from its current position
    const withoutDragged = updatedColItems.filter(i => i.id !== itemId);
    // Insert at drop position
    const insertIdx = Math.min(dropIndex, withoutDragged.length);
    withoutDragged.splice(insertIdx, 0, draggedItem || updatedColItems.find(i => i.id === itemId));
    // Reassign sort_order values
    withoutDragged.forEach((item, idx) => { if (item) item.sort_order = idx; });

    _renderKanbanBoard();
  } catch (e2) { alert(e2.message); }
}

// ── Column operations ──
async function _toggleColCollapse(colId) {
  const board = _boardsState.activeBoard;
  if (!board) return;
  const cols = board.columns.map(c => c.id === colId ? { ...c, collapsed: !c.collapsed } : c);
  try {
    await _boardApi('PUT', '/boards/' + board.id, { columns: cols });
    board.columns = cols;
    _renderKanbanBoard();
  } catch (e) { alert(e.message); }
}

async function _renameCol(colId, oldName) {
  const newName = prompt(t('board_rename_col')||'Column name:', oldName);
  if (!newName || newName === oldName) return;
  const board = _boardsState.activeBoard;
  const cols = board.columns.map(c => c.id === colId ? { ...c, name: newName } : c);
  try {
    await _boardApi('PUT', '/boards/' + board.id, { columns: cols });
    board.columns = cols;
    _renderKanbanBoard();
  } catch (e) { alert(e.message); }
}

// ── Add item to column ──
async function _addItemToCol(colId) {
  const board = _boardsState.activeBoard;
  const colItems = _boardsState.items.filter(i => String(i.column_id) === String(colId));
  const sortOrder = colItems.length > 0 ? Math.max(...colItems.map(i => i.sort_order)) + 1 : 0;
  try {
    const created = await _boardApi('POST', '/boards/' + board.id + '/items', {
      column_id: colId, subject: '', sort_order: sortOrder
    });
    _boardsState.items.push(created);
    _renderKanbanBoard();
    // Open the newly created item for editing and focus the subject field
    _openBoardItem(created.id);
    setTimeout(() => {
      const subjectEl = document.getElementById('inlineItemSubject');
      if (subjectEl) { subjectEl.value = ''; subjectEl.focus(); subjectEl.style.borderColor='var(--accent)'; subjectEl.style.background='var(--bg3)'; }
    }, 100);
  } catch (e) { alert(e.message); }
}

// ── Item type icons ──
const _itemTypeIcons = { task: '✅', meeting: '🤝', checklist: '📋', issue: '⚠️', note: '📝', other: '🔹' };
const _itemTypeLabels = { task: 'Task', meeting: 'Meeting', checklist: 'Checklist', issue: 'Issue', note: 'Note', other: 'Other' };

// ── Open item detail ──
function _openBoardItem(itemId) {
  if (_boardsState.justDragged) return;
  const item = _boardsState.items.find(i => i.id === itemId);
  if (!item) return;
  const board = _boardsState.activeBoard;
  const colName = (board.columns.find(c => c.id === item.column_id) || {}).name || item.column_id;

  // Track item ID for auto-save on close
  _boardsState._editingItemId = itemId;

  const typeIcon = _itemTypeIcons[item.item_type] || '';

  let html = `<div style="max-width:720px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;flex:1;min-width:0">#${item.id}
        <input id="inlineItemSubject" class="input" style="font-size:inherit;font-weight:bold;border:1px solid transparent;background:transparent;padding:2px 6px;width:80%;border-radius:var(--radius)" value="${escHtml(item.subject)}">
      </h3>
      <div style="display:flex;gap:6px;align-items:center;margin-right:32px;flex-shrink:0">
        <button class="btn btn-sm btn-secondary" data-action="_showMoveToBoardDialog" data-arg="${item.id}" title="Move to another board" style="min-width:32px;height:28px;padding:4px 8px">↗️</button>
        <button class="btn btn-sm btn-secondary" data-action="_archiveBoardItem" data-arg="${item.id}" title="${t('board_archive')||'Archive'}" style="min-width:32px;height:28px;padding:4px 8px">📦</button>
        <button class="btn btn-sm btn-secondary" data-action="_showBoardItemHelp" title="${t('board_item_help')||'Help'}" style="min-width:32px;height:28px;padding:4px 8px">❓</button>
        <button class="btn btn-sm btn-secondary" data-action="_shareBoardItemLink" data-arg="${item.id}" title="${t('board_share_item')||'Share link'}" style="min-width:32px;height:28px;padding:4px 8px">🔗</button>
        <span style="border-left:1px solid var(--border);height:20px;margin:0 2px"></span>
        <button class="btn btn-sm btn-secondary" style="color:var(--danger);min-width:32px;height:28px;padding:4px 8px" data-action="_deleteBoardItem" data-arg="${item.id}" title="${t('board_delete_item')||'Delete item'}">🗑</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:var(--fs-sm);margin-bottom:14px">
      <div><strong>${t('board_column')||'Column'}:</strong> ${escHtml(_tColName(colName))}</div>
      <div><strong>${t('board_created')||'Created'}:</strong> ${new Date(item.created_at).toLocaleString()}</div>

      <div style="display:flex;align-items:center;gap:6px">
        <strong>${t('board_type')||'Type'}:</strong>
        <select id="inlineItemType" class="input" style="font-size:var(--fs-sm);padding:4px 8px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius);cursor:pointer;min-width:140px;appearance:auto">
          <option value="" ${!item.item_type?'selected':''}>— ${t('board_select_type')||'Select type'} —</option>
          <option value="task" ${item.item_type==='task'?'selected':''}>✅ ${t('board_type_task')||'Task'}</option>
          <option value="meeting" ${item.item_type==='meeting'?'selected':''}>🤝 ${t('board_type_meeting')||'Meeting'}</option>
          <option value="checklist" ${item.item_type==='checklist'?'selected':''}>📋 ${t('board_type_checklist')||'Checklist'}</option>
          <option value="issue" ${item.item_type==='issue'?'selected':''}>⚠️ ${t('board_type_issue')||'Issue'}</option>
          <option value="note" ${item.item_type==='note'?'selected':''}>📝 ${t('board_type_note')||'Note'}</option>
          <option value="other" ${item.item_type==='other'?'selected':''}>🔹 ${t('board_type_other')||'Other'}</option>
        </select>
      </div>

      <div><strong>${t('board_creator')||'Creator'}:</strong> ${escHtml(item.creator_name)}</div>

      <div style="display:flex;align-items:center;gap:6px">
        <strong>${t('board_responsible')||'Responsible'}:</strong>
        <select id="inlineItemResponsible" class="input" style="font-size:var(--fs-sm);padding:4px 8px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius);cursor:pointer;min-width:140px;appearance:auto">
          <option value="0" data-name="">— ${t('board_none')||'None'} —</option>
          ${(state.users||[]).map(u => `<option value="${u.id}" data-name="${escHtml(u.display_name||u.username)}" ${item.responsible_id===u.id?'selected':''}>${escHtml(u.display_name||u.username)}</option>`).join('')}
        </select>
      </div>

      <div style="display:flex;align-items:center;gap:6px">
        <strong>📅 ${t('board_due_date')||'Due Date'}:</strong>
        <input id="inlineItemDueDate" type="date" class="input" value="${escHtml(item.due_date||'')}" style="font-size:var(--fs-sm);padding:3px 6px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius);cursor:pointer">
        ${item.due_date ? `<button class="btn btn-sm" style="font-size:var(--fs-xs);padding:1px 6px" data-action="_clearBoardItemDueDate" data-arg="${item.id}">✖</button>` : ''}
      </div>

      <div style="display:flex;align-items:center;gap:6px">
        <strong>${t('board_priority')||'Priority'}:</strong>
        <select id="inlineItemPriority" class="input" style="font-size:var(--fs-sm);padding:4px 8px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius);cursor:pointer;min-width:140px;appearance:auto">
          <option value="normal" ${!item.priority||item.priority==='normal'?'selected':''}>⚪ ${t('board_priority_normal')||'Normal'}</option>
          <option value="low" ${item.priority==='low'?'selected':''} style="color:#3498db">🔵 ${t('board_priority_low')||'Low'}</option>
          <option value="high" ${item.priority==='high'?'selected':''} style="color:#e67e22">🟠 ${t('board_priority_high')||'High'}</option>
          <option value="critical" ${item.priority==='critical'?'selected':''} style="color:#e74c3c">🔴 ${t('board_priority_critical')||'Critical'}</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <strong>${t('board_color')||'Color'}:</strong>
        <input id="inlineItemColor" type="color" value="${item.color||'#1a1a2e'}" style="width:32px;height:22px;cursor:pointer;border:none;padding:0" data-board-item-id="${item.id}">
        ${item.color ? `<button class="btn btn-sm" style="font-size:var(--fs-xs);padding:1px 6px" data-action="_clearBoardItemColor" data-arg="${item.id}">✖</button>` : ''}
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <strong style="font-size:var(--fs-sm);white-space:nowrap">🏷️ ${t('tags_title')||'Tags'}:</strong>
      <div id="inlineItemTagChips" style="display:flex;flex-wrap:wrap;gap:4px">
        ${(item.tags||[]).map(tag => `<span class="board-tag-chip" data-tag="${escHtml(tag)}" style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:${typeof _tagColor==='function'?_tagColor(tag):'var(--accent)'};cursor:default">${escHtml(tag)}<span class="board-tag-remove" style="cursor:pointer;font-weight:bold;margin-left:2px">×</span></span>`).join('')}
      </div>
      <div style="position:relative;flex:1;min-width:150px">
        <input id="inlineItemTags" class="input" style="width:100%;font-size:var(--fs-sm);padding:6px 10px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius)" value="" placeholder="${t('tags_placeholder')||'Type a tag and press comma to add...'}">
      </div>
    </div>

    <div style="margin-bottom:12px">
      <strong style="font-size:var(--fs-sm)">📝 ${t('board_note')||'Note'}:</strong>
      <textarea id="inlineItemNote" class="input" style="width:100%;min-height:160px;margin-top:4px;padding:8px;border-radius:var(--radius);font-size:var(--fs-sm);resize:vertical;border:1px solid var(--border);background:var(--bg3)">${escHtml(item.note||'')}</textarea>
    </div>`;

  // Activities section (user-entered timestamped log)
  html += `<div style="margin-bottom:12px">
    <strong style="font-size:var(--fs-sm)">📋 ${t('board_activities_title')||'Activity Log'}</strong>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin:2px 0 6px">${t('board_activities_desc')||'Record actions taken on this item. Each entry is timestamped with your name.'}</p>
    <div id="boardItemActivities" style="max-height:180px;overflow-y:auto;margin-top:4px">`;
  for (const a of (item.activities || []).slice().reverse()) {
    html += `<div style="padding:4px 8px;margin-bottom:3px;background:var(--bg2);border-radius:var(--radius);font-size:var(--fs-xs);border-left:3px solid var(--accent)">
      <span style="color:var(--text-dim)">${new Date(a.created_at).toLocaleString()}</span>
      <strong style="margin-left:4px">${escHtml(a.user_name)}</strong>:
      <span>${escHtml(a.text)}</span>
    </div>`;
  }
  html += `</div>
    <div style="display:flex;gap:4px;margin-top:6px">
      <input id="newActivityText" class="input" style="flex:1;font-size:var(--fs-xs);padding:6px 8px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius)" placeholder="${t('board_activity_placeholder')||'What did you do? (use @name to mention people)'}">
      <button class="btn btn-sm btn-primary" data-action="_addBoardItemActivity" data-arg="${item.id}" style="padding:6px 12px">${t('board_activity_log')||'Log Activity'}</button>
    </div>
  </div>`;

  // Comments (moved before links)
  html += `<div style="margin-bottom:12px">
    <strong style="font-size:var(--fs-sm)">💬 ${t('board_comments')||'Comments'} (${(item.comments||[]).length})</strong>
    <div id="boardItemComments" style="max-height:200px;overflow-y:auto;margin-top:4px">`;
  for (const c of (item.comments || [])) {
    html += `<div style="padding:6px 8px;margin-bottom:4px;background:var(--bg2);border-radius:var(--radius);font-size:var(--fs-xs)">
      <div style="display:flex;justify-content:space-between">
        <strong>${escHtml(c.user_name)}</strong>
        <span style="color:var(--text-dim)">${new Date(c.created_at).toLocaleString()}</span>
      </div>
      <div style="margin-top:2px;white-space:pre-wrap">${escHtml(c.text)}</div>
    </div>`;
  }
  html += `</div>
    <div style="display:flex;gap:4px;margin-top:6px">
      <textarea id="newCommentText" class="input" style="flex:1;font-size:var(--fs-xs);padding:6px 8px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius);resize:vertical;min-height:36px" placeholder="${t('board_add_comment')||'Write a comment...'}"></textarea>
      <button class="btn btn-sm btn-primary" data-action="_postBoardItemComment" data-arg="${item.id}" style="align-self:flex-end;padding:6px 12px">${t('board_comment_send')||'Send'}</button>
    </div>
  </div>`;

  // Links section
  html += `<div style="margin-bottom:12px">
    <strong style="font-size:var(--fs-sm)">🔗 ${t('board_links')||'Links'}</strong>
    <div id="boardItemLinks" style="margin-top:4px">`;
  for (let li = 0; li < (item.links || []).length; li++) {
    const link = item.links[li];
    html += `<div class="board-link-row" style="display:flex;gap:4px;align-items:center;margin-bottom:4px;font-size:var(--fs-xs)">
      <a href="${escHtml(link.url)}" target="_blank" rel="noopener" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(link.label || link.url)}</a>
      <button class="btn btn-sm board-link-remove" style="font-size:9px;padding:1px 4px;color:var(--danger)">✖</button>
    </div>`;
  }
  html += `</div>
    <div style="display:flex;gap:4px;margin-top:4px">
      <input id="newLinkUrl" class="input" style="flex:2;font-size:var(--fs-xs);padding:4px 6px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius)" placeholder="https://...">
      <input id="newLinkLabel" class="input" style="flex:1;font-size:var(--fs-xs);padding:4px 6px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius)" placeholder="${t('board_link_label')||'Label (optional)'}">
      <button class="btn btn-sm btn-secondary" data-action="_addBoardItemLink" style="padding:4px 8px">+ ${t('board_link_add')||'Add'}</button>
    </div>
  </div>`;

  // Related Items
  const relatedIds = item.related_item_ids || [];
  const allItems = _boardsState.items || [];
  html += `<div style="margin-bottom:12px">
    <strong style="font-size:var(--fs-sm)">🔗 ${t('board_related_items')||'Related Items'} (${relatedIds.length})</strong>
    <div id="boardRelatedItems" style="margin-top:4px">`;
  for (const rid of relatedIds) {
    const rel = allItems.find(i => i.id === rid);
    if (rel) {
      const relIcon = _itemTypeIcons[rel.item_type] || '🔹';
      html += `<div class="board-related-row" data-related-id="${rid}" style="display:flex;gap:6px;align-items:center;margin-bottom:3px;font-size:var(--fs-xs);padding:3px 6px;background:var(--bg2);border-radius:var(--radius);cursor:pointer">
        <span>${relIcon}</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" data-action="_openBoardItem" data-arg="${rid}">#${rid} ${escHtml(rel.subject)}</span>
        <span style="color:var(--text-dim)">${escHtml((rel.column_id && _boardsState.activeBoard.columns.find(c=>c.id===rel.column_id)||{}).name||'')}</span>
        <button class="btn btn-sm board-related-remove" style="font-size:9px;padding:0 4px;color:var(--danger)" title="${t('board_remove')||'Remove'}">✖</button>
      </div>`;
    }
  }
  html += `</div>
    <div style="display:flex;gap:4px;margin-top:4px">
      <select id="newRelatedItem" class="input" style="flex:1;font-size:var(--fs-xs);padding:4px 6px;border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius)">
        <option value="">— ${t('board_select_related')||'Select an item to link'} —</option>
        ${allItems.filter(i => i.id !== item.id && !relatedIds.includes(i.id) && !i.archived).map(i => `<option value="${i.id}">${(_itemTypeIcons[i.item_type]||'')} #${i.id} ${escHtml(i.subject)}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-secondary" data-action="_addRelatedItem" data-arg="${item.id}" style="padding:4px 8px">+ ${t('board_link_add')||'Add'}</button>
    </div>
  </div>`;

  // Attachments
  html += `<div style="margin-bottom:12px">
    <strong style="font-size:var(--fs-sm)">📎 ${t('board_attachments')||'Attachments'} (${(item.attachments||[]).length})</strong>
    <div style="margin-top:4px">`;
  for (const att of (item.attachments || [])) {
    html += `<div style="font-size:var(--fs-xs);margin-bottom:2px"><a href="/api/board-items/${item.id}/attachments/${encodeURIComponent(att.stored_name || att.id)}" target="_blank">${escHtml(att.filename)}</a> (${_formatSize(att.size)})</div>`;
  }
  html += `<form id="boardAttUploadForm" style="margin-top:6px;display:flex;align-items:center;gap:6px">
    <input type="file" id="boardAttFile" style="font-size:var(--fs-xs)">
    <button type="button" class="btn btn-sm btn-secondary" data-action="_uploadBoardAttachment" data-arg="${item.id}" style="min-width:32px;height:28px;padding:4px 8px">⬆ ${t('btn_upload')||'Upload'}</button>
  </form></div></div>`;

  // History
  html += `<details style="margin-bottom:8px">
    <summary style="font-size:var(--fs-sm);cursor:pointer"><strong>📜 ${t('board_history')||'History'}</strong></summary>
    <div style="max-height:200px;overflow-y:auto;margin-top:4px;font-size:var(--fs-xs)">`;
  for (const h of (item.history || []).slice().reverse()) {
    html += `<div style="padding:3px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-dim)">${new Date(h.timestamp).toLocaleString()}</span>
      <strong>${escHtml(h.user_name)}</strong>: ${escHtml(h.action)} ${h.detail ? '— ' + escHtml(h.detail) : ''}
    </div>`;
  }
  html += `</div></details>

    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:12px">
      <button class="btn btn-primary" data-action="_saveBoardItemAndClose" data-arg="${item.id}">✔ ${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary" data-action="_cancelBoardItem">✖ ${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;

  _boardModal('boardItemModal', html, '720px');

  // Bind events for elements that used to have inline handlers (CSP compliance)
  const subjectEl = document.getElementById('inlineItemSubject');
  if (subjectEl) {
    subjectEl.addEventListener('focus', function() { this.style.borderColor='var(--accent)'; this.style.background='var(--bg3)'; });
    subjectEl.addEventListener('blur', function() { this.style.borderColor='transparent'; this.style.background='transparent'; });
  }
  const colorEl = document.getElementById('inlineItemColor');
  if (colorEl) {
    colorEl.addEventListener('change', function() { _inlineSaveBoardItem(parseInt(this.dataset.boardItemId)); });
  }
  // Bind link remove buttons
  document.querySelectorAll('#boardItemLinks .board-link-remove').forEach(function(btn) {
    btn.addEventListener('click', function() { btn.parentElement.remove(); });
  });

  // Bind related item remove buttons
  document.querySelectorAll('#boardRelatedItems .board-related-remove').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const row = btn.closest('.board-related-row');
      const relId = parseInt(row?.dataset.relatedId);
      if (relId) _removeRelatedItem(itemId, relId);
    });
  });

  // ── Tag chip behavior (comma creates chip, × removes) ──
  const tagInput = document.getElementById('inlineItemTags');
  const tagChipsEl = document.getElementById('inlineItemTagChips');
  if (tagInput && tagChipsEl) {
    // Bind remove on existing chips
    tagChipsEl.querySelectorAll('.board-tag-remove').forEach(function(x) {
      x.addEventListener('click', function() { x.parentElement.remove(); });
    });
    // Comma or Enter creates a new chip
    tagInput.addEventListener('keydown', function(e) {
      if (e.key === ',' || e.key === 'Enter') {
        e.preventDefault();
        const val = tagInput.value.replace(/,/g, '').trim();
        if (!val) return;
        // Don't add duplicates
        const existing = Array.from(tagChipsEl.querySelectorAll('.board-tag-chip')).map(c => c.dataset.tag.toLowerCase());
        if (existing.includes(val.toLowerCase())) { tagInput.value = ''; return; }
        const chip = document.createElement('span');
        chip.className = 'board-tag-chip';
        chip.dataset.tag = val;
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:' + (typeof _tagColor === 'function' ? _tagColor(val) : 'var(--accent)') + ';cursor:default';
        chip.textContent = val;
        const x = document.createElement('span');
        x.className = 'board-tag-remove';
        x.style.cssText = 'cursor:pointer;font-weight:bold;margin-left:2px';
        x.textContent = '×';
        x.addEventListener('click', function() { chip.remove(); });
        chip.appendChild(x);
        tagChipsEl.appendChild(chip);
        tagInput.value = '';
      }
    });
    // Also add on blur
    tagInput.addEventListener('blur', function() {
      const val = tagInput.value.replace(/,/g, '').trim();
      if (!val) return;
      const existing = Array.from(tagChipsEl.querySelectorAll('.board-tag-chip')).map(c => c.dataset.tag.toLowerCase());
      if (existing.includes(val.toLowerCase())) { tagInput.value = ''; return; }
      const chip = document.createElement('span');
      chip.className = 'board-tag-chip';
      chip.dataset.tag = val;
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:' + (typeof _tagColor === 'function' ? _tagColor(val) : 'var(--accent)') + ';cursor:default';
      chip.textContent = val;
      const x = document.createElement('span');
      x.className = 'board-tag-remove';
      x.style.cssText = 'cursor:pointer;font-weight:bold;margin-left:2px';
      x.textContent = '×';
      x.addEventListener('click', function() { chip.remove(); });
      chip.appendChild(x);
      tagChipsEl.appendChild(chip);
      tagInput.value = '';
    });
  }

  // Setup tag autocomplete on inline tags input
  _loadBoardTags().then(() => {
    if (tagInput) _setupTagAutocomplete(tagInput);
  });

  // Setup @mention autocomplete on note, comment, and activity inputs
  const noteTA = document.getElementById('inlineItemNote');
  if (noteTA) _setupBoardMentionAutocomplete(noteTA);
  const commentTA = document.getElementById('newCommentText');
  if (commentTA) _setupBoardMentionAutocomplete(commentTA);
  const activityInput = document.getElementById('newActivityText');
  if (activityInput) _setupBoardMentionAutocomplete(activityInput);

  // Auto-save when modal is closed
  const modalOverlay = document.getElementById('boardItemModal');
  if (modalOverlay) {
    const closeBtn = modalOverlay.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => _saveAndCloseBoardItem(itemId), { once: true });
    }
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) _saveAndCloseBoardItem(itemId);
    }, { once: true });
  }
}

// Add a link row to the edit modal
function _addBoardItemLink() {
  const urlEl = document.getElementById('newLinkUrl');
  const labelEl = document.getElementById('newLinkLabel');
  const url = (urlEl?.value || '').trim();
  if (!url) return;
  const label = (labelEl?.value || '').trim();
  const container = document.getElementById('boardItemLinks');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'board-link-row';
  row.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:4px;font-size:var(--fs-xs)';
  row.innerHTML = `<a href="${escHtml(url)}" target="_blank" rel="noopener" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(label || url)}</a>
    <button class="btn btn-sm board-link-remove" style="font-size:9px;padding:1px 4px;color:var(--danger)">✖</button>`;
  row.querySelector('.board-link-remove').addEventListener('click', function() { row.remove(); });
  row.dataset.url = url;
  row.dataset.label = label;
  container.appendChild(row);
  urlEl.value = '';
  labelEl.value = '';
}

// Post a comment on a board item
async function _addBoardItemActivity(itemId) {
  const textEl = document.getElementById('newActivityText');
  const text = (textEl?.value || '').trim();
  if (!text) return;
  const item = _boardsState.items.find(i => i.id === itemId);
  if (!item) return;
  const activities = (item.activities || []).slice();
  const u = state.user || {};
  activities.push({
    text,
    user_id: u.id || 0,
    user_name: u.display_name || u.username || '',
    created_at: new Date().toISOString()
  });
  try {
    await _boardApi('PUT', '/board-items/' + itemId, { activities });
    textEl.value = '';
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
    _openBoardItem(itemId);
  } catch (e) { alert(e.message); }
}

// ── Related items management ──
async function _addRelatedItem(itemId) {
  const sel = document.getElementById('newRelatedItem');
  const relId = parseInt(sel?.value);
  if (!relId) return;
  const item = _boardsState.items.find(i => i.id === itemId);
  if (!item) return;
  const ids = (item.related_item_ids || []).slice();
  if (ids.includes(relId)) return;
  ids.push(relId);
  try {
    await _boardApi('PUT', '/board-items/' + itemId, { related_item_ids: ids });
    // Also add reverse link on the related item
    const relItem = _boardsState.items.find(i => i.id === relId);
    if (relItem) {
      const reverseIds = (relItem.related_item_ids || []).slice();
      if (!reverseIds.includes(itemId)) {
        reverseIds.push(itemId);
        await _boardApi('PUT', '/board-items/' + relId, { related_item_ids: reverseIds });
      }
    }
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
    _openBoardItem(itemId);
  } catch (e) { alert(e.message); }
}

async function _removeRelatedItem(itemId, relId) {
  const item = _boardsState.items.find(i => i.id === itemId);
  if (!item) return;
  const ids = (item.related_item_ids || []).filter(id => id !== relId);
  try {
    await _boardApi('PUT', '/board-items/' + itemId, { related_item_ids: ids });
    // Also remove reverse link
    const relItem = _boardsState.items.find(i => i.id === relId);
    if (relItem) {
      const reverseIds = (relItem.related_item_ids || []).filter(id => id !== itemId);
      await _boardApi('PUT', '/board-items/' + relId, { related_item_ids: reverseIds });
    }
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
    _openBoardItem(itemId);
  } catch (e) { alert(e.message); }
}

async function _postBoardItemComment(itemId) {
  const textEl = document.getElementById('newCommentText');
  const text = (textEl?.value || '').trim();
  if (!text) return;
  try {
    await _boardApi('POST', '/board-items/' + itemId + '/comments', { text });
    textEl.value = '';
    // Refresh item and re-open
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
    _openBoardItem(itemId);
  } catch (e) { alert(e.message); }
}

// Save and close board item modal
async function _saveAndCloseBoardItem(itemId) {
  await _inlineSaveBoardItemNow(itemId);
  // Re-render board to reflect changes
  _renderKanbanBoard();
}

// Save and close via button
async function _saveBoardItemAndClose(itemId) {
  try {
    await _saveBoardItemExplicit(itemId);
    _closeBoardModal('boardItemModal');
    _renderKanbanBoard();
  } catch (e) {
    showError('Failed to save item: ' + e.message);
  }
}

// Explicit save (throws on error, unlike inline which is silent)
async function _saveBoardItemExplicit(itemId) {
  const subject = (document.getElementById('inlineItemSubject') || {}).value;
  if (!subject || !subject.trim()) throw new Error('Subject is required');
  const note = (document.getElementById('inlineItemNote') || {}).value || '';
  const itemType = (document.getElementById('inlineItemType') || {}).value || '';
  const colorVal = (document.getElementById('inlineItemColor') || {}).value || '';
  // Collect tags from chips + any pending input text
  const tags = [];
  document.querySelectorAll('#inlineItemTagChips .board-tag-chip').forEach(c => { if (c.dataset.tag) tags.push(c.dataset.tag); });
  const pendingTag = (document.getElementById('inlineItemTags') || {}).value.replace(/,/g, '').trim();
  if (pendingTag && !tags.includes(pendingTag)) tags.push(pendingTag);
  const color = colorVal === '#1a1a2e' ? '' : colorVal;
  const dueDate = (document.getElementById('inlineItemDueDate') || {}).value || '';
  const priority = (document.getElementById('inlineItemPriority') || {}).value || '';
  const respEl = document.getElementById('inlineItemResponsible');
  const responsibleId = respEl ? parseInt(respEl.value) || 0 : 0;
  const responsibleName = respEl ? (respEl.selectedOptions[0]?.dataset.name || '') : '';
  const links = [];
  document.querySelectorAll('#boardItemLinks .board-link-row').forEach(row => {
    const a = row.querySelector('a');
    if (a) links.push({ url: row.dataset.url || a.href, label: row.dataset.label || a.textContent });
  });
  // Collect related item IDs from DOM
  const related_item_ids = [];
  document.querySelectorAll('#boardRelatedItems .board-related-row').forEach(row => {
    const rid = parseInt(row.dataset.relatedId);
    if (rid) related_item_ids.push(rid);
  });
  await _boardApi('PUT', '/board-items/' + itemId, {
    subject: subject.trim(), note, item_type: itemType, color, tags,
    links, due_date: dueDate, responsible_id: responsibleId, responsible_name: responsibleName,
    priority, related_item_ids
  });
  const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
  _boardsState.items = items;
}

// Cancel without saving
function _cancelBoardItem() {
  _closeBoardModal('boardItemModal');
}

// Help dialog for board item editing
function _showBoardItemHelp() {
  const helpHtml = `<div style="max-width:540px">
    <h3 style="margin-bottom:10px">${t('board_item_help_title')||'How to Edit Items'}</h3>
    <div style="font-size:var(--fs-sm);line-height:1.6">
      <p><strong>${t('board_item_subject')||'Subject'}:</strong> ${t('board_help_subject_text')||'Click the title field at the top to edit the item name. This is what appears on the card.'}</p>
      <p><strong>${t('board_type')||'Type'}:</strong> ${t('board_help_type_text')||'Categorize the item as Task, Meeting, Checklist, Issue, Note, or Other. An icon appears on the card to help identify it visually.'}</p>
      <p><strong>${t('board_responsible')||'Responsible'}:</strong> ${t('board_help_responsible_text')||'Assign who is responsible for this item. Defaults to the person who created it. The name is shown on the card.'}</p>
      <p><strong>${t('board_priority')||'Priority'}:</strong> ${t('board_help_priority_text')||'Set Normal (default), Low (blue), High (orange), or Critical (red). The card color changes automatically to indicate urgency.'}</p>
      <p><strong>${t('board_due_date')||'Due Date'}:</strong> ${t('board_help_due_text')||'Set a deadline. Cards show the date — overdue items turn red, items due within 2 days show orange.'}</p>
      <p><strong>${t('board_help_tags_label')||'Tags'}:</strong> ${t('board_help_tags_text')||'Type a tag and press comma or Enter to create it. Tags appear as colored chips. Click the × to remove. Previously used tags are suggested as you type.'}</p>
      <p><strong>${t('board_note')||'Note'}:</strong> ${t('board_help_notes_text')||'Free-text area for detailed information. Supports @mentions.'}</p>
      <p><strong>${t('board_activities_title')||'Activity Log'}:</strong> ${t('board_help_activity_text')||'Record timestamped actions. Each entry shows who did what and when. Great for tracking progress. Supports @mentions.'}</p>
      <p><strong>${t('board_comments')||'Comments'}:</strong> ${t('board_help_comments_text')||'Discussion thread on the item. Saved immediately when you click Send.'}</p>
      <p><strong>${t('board_related_items')||'Related Items'}:</strong> ${t('board_help_related_text')||'Link to other items on the same board. Relationships go both ways — linking A to B also links B to A.'}</p>
      <p><strong>${t('board_links')||'Links'}:</strong> ${t('board_help_links_text')||'Attach external URLs with optional labels.'}</p>
      <p><strong>${t('board_attachments')||'Attachments'}:</strong> ${t('board_help_attachments_text')||'Upload and download files attached to this item.'}</p>
      <p><strong>${t('board_help_mentions_label')||'@Mentions'}:</strong> ${t('board_help_mentions_text')||'Type @ followed by a name in notes, comments, or activities. Use arrow keys and Enter/Tab to select, or click a name from the dropdown.'}</p>
      <p><strong>${t('board_help_saving_label')||'Saving'}:</strong> ${t('board_help_saving_text')||'Click Save to save all changes, or Cancel to discard. Comments and activities are saved immediately when submitted.'}</p>
      <p><strong>${t('board_archive')||'Archive'}:</strong> ${t('board_help_archive_text')||'Use the 📦 button to archive this item. It moves to the Archived column and can be restored later.'}</p>
    </div>
    <div style="margin-top:12px;text-align:right;border-top:1px solid var(--border);padding-top:8px">
      <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="boardItemHelpModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('boardItemHelpModal', helpHtml, '560px');
}

// Help dialog for the board view
function _showBoardHelp() {
  const helpHtml = `<div style="max-width:640px">
    <h3 style="margin-bottom:12px">${t('board_guide_title')||'Kanban Board — User Guide'}</h3>
    <div style="font-size:var(--fs-sm);line-height:1.7">

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_guide_getting_started')||'Getting Started'}</h4>
      <p>${t('board_guide_getting_started_text')||'Boards are Kanban-style task trackers for organizing work. Each board has columns that represent stages in your workflow (e.g. To Do, In Progress, Done). Cards in these columns represent individual tasks or items.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_guide_columns')||'Working with Columns'}</h4>
      <p>${t('board_guide_columns_text')||'<strong>Rename:</strong> Double-click any column header to rename it.<br><strong>Collapse:</strong> Click the <strong>−</strong> button to collapse a column and save space. Click the collapsed column to expand it again.<br><strong>Add/remove columns:</strong> Open Board Settings (⚙) to add, remove, or reorder columns.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_guide_items')||'Creating and Editing Items'}</h4>
      <p>${t('board_guide_items_text')||'Click <strong>+</strong> at the top of any column to create a new item. Click any card to open the detail editor where you can set subject, type, responsible, priority, due date, tags, and notes.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_activities_title')||'Activity Log'}</h4>
      <p>${t('board_guide_activity_text')||'Record what was done on an item. Each entry is automatically timestamped with your name. Use <strong>@username</strong> to mention team members. This creates an audit trail of actions taken.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_comments')||'Comments'}</h4>
      <p>${t('board_guide_comments_text')||'Add discussion comments to items. Comments are displayed chronologically and can also use @mentions.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_related_items')||'Related Items'}</h4>
      <p>${t('board_guide_related_text')||'Link items that are related to each other. Relationships are bidirectional — linking item A to item B also links B back to A. Useful for tracking dependencies or grouping related tasks.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_guide_mentions')||'@Mentions'}</h4>
      <p>${t('board_guide_mentions_text')||'In Notes, Comments, and Activities, type <strong>@</strong> followed by a username. A dropdown appears — use arrow keys and <strong>Enter</strong> or <strong>Tab</strong> to select, or click a name directly.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_guide_dragdrop')||'Drag and Drop'}</h4>
      <p>${t('board_guide_dragdrop_text')||'Drag cards between columns to move them through the workflow. You can also reorder cards within the same column by dragging up or down. Hold and drag the board background to scroll horizontally.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_guide_archiving')||'Archiving'}</h4>
      <p>${t('board_guide_archiving_text')||'Click 📦 Archive on an item to archive it, or use the 📦 button on a column header to archive all items in that column. Archived items appear in a separate column on the right and can be restored or permanently deleted.'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_guide_toolbar')||'Toolbar'}</h4>
      <p>${t('board_guide_toolbar_text')||'<strong>🔗 Share</strong> — generate a shareable link. <strong>⧉ Detach</strong> — open in a separate window. <strong>🖨 Print</strong> — print the board. <strong>⬇ Export</strong> — export as JSON, CSV, SVG, or PDF. <strong>⬆ Import</strong> — import from JSON or CSV. <strong>Zoom +/−</strong> — scale the view (25%–200%).'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_visibility')||'Visibility'}</h4>
      <p>${t('board_guide_visibility_text')||'Boards can be Private (only you), Group (shared with a group), Role-based (shared with a role), or Global (visible to everyone). Set visibility in Board Settings (⚙).'}</p>

      <h4 style="margin:14px 0 6px;color:var(--accent)">${t('board_help_saving_label')||'Saving'}</h4>
      <p>${t('board_guide_saving_text')||'Click Save to save changes and close the item editor. Click Cancel to discard unsaved changes. Comments and activities are saved immediately when you submit them.'}</p>
    </div>
    <div style="margin-top:14px;text-align:right;border-top:1px solid var(--border);padding-top:10px">
      <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="boardHelpModal">${t('btn_close')||'Close'}</button>
    </div>
  </div>`;
  _boardModal('boardHelpModal', helpHtml, '660px');
}

// ── Inline save for board item (auto-save on blur/change) ──
let _inlineSaveTimer = null;
async function _inlineSaveBoardItem(itemId) {
  clearTimeout(_inlineSaveTimer);
  _inlineSaveTimer = setTimeout(() => _inlineSaveBoardItemNow(itemId), 400);
}

async function _inlineSaveBoardItemNow(itemId) {
  clearTimeout(_inlineSaveTimer);
  const subject = (document.getElementById('inlineItemSubject') || {}).value;
  if (!subject || !subject.trim()) return;
  const note = (document.getElementById('inlineItemNote') || {}).value || '';
  const itemType = (document.getElementById('inlineItemType') || {}).value || '';
  const colorVal = (document.getElementById('inlineItemColor') || {}).value || '';
  // Collect tags from chips + any pending input text
  const tags = [];
  document.querySelectorAll('#inlineItemTagChips .board-tag-chip').forEach(c => { if (c.dataset.tag) tags.push(c.dataset.tag); });
  const pendingTag = (document.getElementById('inlineItemTags') || {}).value.replace(/,/g, '').trim();
  if (pendingTag && !tags.includes(pendingTag)) tags.push(pendingTag);
  const color = colorVal === '#1a1a2e' ? '' : colorVal;
  const dueDate = (document.getElementById('inlineItemDueDate') || {}).value || '';
  const priority = (document.getElementById('inlineItemPriority') || {}).value || '';

  // Responsible
  const respEl = document.getElementById('inlineItemResponsible');
  const responsibleId = respEl ? parseInt(respEl.value) || 0 : 0;
  const responsibleName = respEl ? (respEl.selectedOptions[0]?.dataset.name || '') : '';

  // Collect links from DOM
  const links = [];
  document.querySelectorAll('#boardItemLinks .board-link-row').forEach(row => {
    const a = row.querySelector('a');
    if (a) links.push({ url: row.dataset.url || a.href, label: row.dataset.label || a.textContent });
  });

  try {
    await _boardApi('PUT', '/board-items/' + itemId, {
      subject: subject.trim(), note, item_type: itemType, color, tags,
      links, due_date: dueDate, responsible_id: responsibleId, responsible_name: responsibleName,
      priority
    });
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
  } catch (e) { /* silent - inline save */ }
}

function _formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// CSP-compliant action handlers for board item detail
function _clearBoardItemDueDate(itemId) {
  const el = document.getElementById('inlineItemDueDate');
  if (el) el.value = '';
  _inlineSaveBoardItem(itemId);
}

function _clearBoardItemColor(itemId) {
  const el = document.getElementById('inlineItemColor');
  if (el) el.value = '#1a1a2e';
  _inlineSaveBoardItem(itemId);
}

async function _doEditBoardItem(itemId) {
  const subject = document.getElementById('editItemSubject').value.trim();
  if (!subject) return;
  const tags = document.getElementById('editItemTags').value.split(',').map(s => s.trim()).filter(Boolean);
  const color = document.getElementById('editItemColor').value;
  try {
    await _boardApi('PUT', '/board-items/' + itemId, {
      subject,
      note: document.getElementById('editItemNote').value,
      item_type: document.getElementById('editItemType').value,
      color: color === '#1a1a2e' ? '' : color,
      tags,
    });
    closeModal('boardItemEditModal');
    closeModal('boardItemModal');
    await _openBoard(_boardsState.activeBoard.id);
  } catch (e) { alert(e.message); }
}

async function _deleteBoardItem(itemId) {
  if (!confirm(t('board_delete_item_confirm')||'Delete this item?')) return;
  try {
    // Save item data for undo before deleting
    const item = _boardsState.items.find(i => i.id === itemId);
    await _boardApi('DELETE', '/board-items/' + itemId);
    closeModal('boardItemModal');
    _boardsState.items = _boardsState.items.filter(i => i.id !== itemId);
    _renderKanbanBoard();
    if (item && typeof pushUndo === 'function') {
      pushUndo('delete_board_item', { ...item, _boardId: _boardsState.activeBoard?.id });
    }
  } catch (e) { alert(e.message); }
}

// ── Upload attachment ──
async function _uploadBoardAttachment(itemId) {
  const fileInput = document.getElementById('boardAttFile');
  if (!fileInput || !fileInput.files.length) return;
  const form = new FormData();
  form.append('file', fileInput.files[0]);
  try {
    const _csrfAtt = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const _hdrsAtt = { 'X-Requested-With': 'XMLHttpRequest' };
    if (_csrfAtt) _hdrsAtt['X-CSRF-Token'] = _csrfAtt[1];
    const res = await fetch('/api/board-items/' + itemId + '/attachments', {
      method: 'POST', headers: _hdrsAtt, body: form
    });
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || res.statusText);
    closeModal('boardItemModal');
    await _openBoard(_boardsState.activeBoard.id);
    _openBoardItem(itemId);
  } catch (e) { alert(e.message); }
}

// ── Board Settings ──
async function _openBoardSettings() {
  const board = _boardsState.activeBoard;
  if (!board) return;
  // Fetch all groups (not just user's own) for board sharing
  let groups = state.groups || [];
  try { groups = await apiGet('/api/groups?all=true') || groups; } catch(e) {}

  const colColorPresets = [
    {label:'None',value:''},
    {label:'🟠 Orange',value:'rgba(230,126,34,0.15)'},
    {label:'🟡 Yellow',value:'rgba(241,196,15,0.15)'},
    {label:'🟢 Green',value:'rgba(39,174,96,0.15)'},
    {label:'🔵 Blue',value:'rgba(52,152,219,0.15)'},
    {label:'🔴 Red',value:'rgba(231,76,60,0.15)'},
    {label:'🟣 Purple',value:'rgba(155,89,182,0.15)'}
  ];
  let colsHtml = '';
  for (let i = 0; i < board.columns.length; i++) {
    const col = board.columns[i];
    colsHtml += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <input class="input boardSettCol" data-idx="${i}" value="${escHtml(col.name)}" style="flex:1">
      <select class="input boardSettColColor" data-idx="${i}" style="width:100px;font-size:var(--fs-xs)">
        ${colColorPresets.map(p => `<option value="${p.value}" ${col.color===p.value?'selected':''}>${p.label}</option>`).join('')}
      </select>
      <button class="btn btn-sm" data-action="_moveBoardCol" data-args="[${i},-1]" ${i===0?'disabled':''}>↑</button>
      <button class="btn btn-sm" data-action="_moveBoardCol" data-args="[${i},1]" ${i===board.columns.length-1?'disabled':''}>↓</button>
      <button class="btn btn-sm" style="color:var(--danger)" data-action="_removeBoardCol" data-arg="${i}">✖</button>
    </div>`;
  }

  let html = `<div style="max-width:500px">
    <h3>⚙ ${t('board_settings')||'Board Settings'}</h3>
    <label>${t('board_name')||'Name'}</label>
    <input id="settBoardName" class="input" style="width:100%;margin-bottom:8px" value="${escHtml(board.name)}">
    <label>${t('board_description')||'Description'}</label>
    <input id="settBoardDesc" class="input" style="width:100%;margin-bottom:8px" value="${escHtml(board.description||'')}">
    <label>${t('board_color')||'Board Color'}</label>
    <input id="settBoardColor" type="color" value="${board.color||'#1a1a2e'}" style="margin-bottom:8px;width:48px;height:28px;cursor:pointer">
    <button class="btn btn-sm btn-secondary" data-action="_clearBoardColor" style="margin-left:6px;margin-bottom:8px;font-size:var(--fs-xs)">✖ ${t('board_color_clear')||'Clear'}</button>
    <label>${t('board_visibility')||'Visibility'}</label>
    <select id="settBoardVis" class="input" style="width:100%;margin-bottom:8px" data-action="_toggleSettVisFields" data-event="change">
      <option value="private" ${board.visibility==='private'?'selected':''}>🔒 ${t('board_vis_private')||'Private'}</option>
      <option value="group" ${board.visibility==='group'?'selected':''}>👥 ${t('board_vis_group')||'Group'}</option>
      <option value="role" ${board.visibility==='role'?'selected':''}>🎭 ${t('board_vis_role')||'Role'}</option>
      <option value="global" ${board.visibility==='global'?'selected':''}>🌐 ${t('board_vis_global')||'Global'}</option>
    </select>
    <div id="settBoardGroupDiv" style="display:${board.visibility==='group'?'':'none'};margin-bottom:8px">
      <label>${t('board_group')||'Group'}</label>
      <select id="settBoardGroup" class="input" style="width:100%">
        ${groups.map(g => `<option value="${g.id}" ${g.id===board.group_id?'selected':''}>${escHtml(g.name)}</option>`).join('')}
      </select>
    </div>
    <div id="settBoardRoleDiv" style="display:${board.visibility==='role'?'':'none'};margin-bottom:8px">
      <label>${t('board_role')||'Role'}</label>
      <select id="settBoardRole" class="input" style="width:100%">
        ${_boardRoleOptions(board.role_key || '')}
      </select>
    </div>
    <label>${t('board_columns')||'Columns'}</label>
    <div id="settBoardCols">${colsHtml}</div>
    <button class="btn btn-sm btn-secondary" data-action="_addBoardCol" style="margin-top:4px;margin-bottom:12px">+ ${t('board_add_col')||'Add Column'}</button>

    <div style="margin-bottom:12px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:600;margin-bottom:8px">${t('board_display_options')||'Display Options'}</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer;margin-bottom:4px">
        <input type="checkbox" id="settBoardShowIcons" ${board.show_icons !== false ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('board_show_icons')||'Show icons in subject'}
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer;margin-bottom:4px">
        <input type="checkbox" id="settBoardPriorityBg" ${board.priority_background !== false ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('board_priority_background')||'Color background by priority (otherwise show colored dot only)'}
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer">
        <input type="checkbox" id="settBoardShowArchival" ${board.show_archival !== false ? 'checked' : ''} style="accent-color:var(--accent)">
        ${t('board_show_archival')||'Show archival controls on columns'}
      </label>
    </div>

    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" data-action="_saveBoardSettings">✔ ${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="boardSettingsModal">✖ ${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('boardSettingsModal', html, '540px');
}

function _toggleSettVisFields() {
  const vis = document.getElementById('settBoardVis').value;
  document.getElementById('settBoardGroupDiv').style.display = vis === 'group' ? '' : 'none';
  document.getElementById('settBoardRoleDiv').style.display = vis === 'role' ? '' : 'none';
}

window._settCols = null;
function _addBoardCol() {
  const board = _boardsState.activeBoard;
  const id = 'col_' + Date.now();
  board.columns.push({ id, name: 'New Column' });
  _openBoardSettings();
}
function _removeBoardCol(idx) {
  const board = _boardsState.activeBoard;
  board.columns.splice(idx, 1);
  _openBoardSettings();
}
function _moveBoardCol(idx, dir) {
  const board = _boardsState.activeBoard;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= board.columns.length) return;
  const tmp = board.columns[idx];
  board.columns[idx] = board.columns[newIdx];
  board.columns[newIdx] = tmp;
  _openBoardSettings();
}

async function _saveBoardSettings() {
  const board = _boardsState.activeBoard;
  const inputs = document.querySelectorAll('.boardSettCol');
  const colorInputs = document.querySelectorAll('.boardSettColColor');
  const cols = [];
  inputs.forEach(inp => {
    const idx = parseInt(inp.dataset.idx);
    const colColor = colorInputs[idx]?.value || '';
    cols.push({ id: board.columns[idx].id, name: inp.value.trim() || board.columns[idx].name, collapsed: board.columns[idx].collapsed, color: colColor });
  });
  const boardColor = document.getElementById('settBoardColor')?.value || '';
  try {
    await _boardApi('PUT', '/boards/' + board.id, {
      name: document.getElementById('settBoardName').value.trim(),
      description: document.getElementById('settBoardDesc').value.trim(),
      visibility: document.getElementById('settBoardVis').value,
      group_id: parseInt(document.getElementById('settBoardGroup')?.value) || 0,
      role_key: document.getElementById('settBoardRole')?.value || '',
      columns: cols,
      color: boardColor === '#1a1a2e' ? '' : boardColor,
      show_icons: document.getElementById('settBoardShowIcons')?.checked !== false,
      priority_background: document.getElementById('settBoardPriorityBg')?.checked !== false,
      show_archival: document.getElementById('settBoardShowArchival')?.checked !== false,
    });
    closeModal('boardSettingsModal');
    await _openBoard(board.id);
  } catch (e) { alert(e.message); }
}

// ── Delete board (requires typing "delete") ──
function _deleteBoardConfirm() {
  const board = _boardsState.activeBoard;
  if (!board) return;
  const html = `<div style="max-width:400px;text-align:center">
    <h3 style="color:var(--danger);margin-bottom:12px">🗑 ${t('board_delete')||'Delete Board'}</h3>
    <p style="margin-bottom:8px">${t('board_delete_type_confirm')||'To delete this board and all its items, type'} <strong>delete</strong> ${t('board_delete_type_below')||'below'}:</p>
    <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">"${escHtml(board.name)}"</p>
    <input id="deleteBoardConfirmInput" class="input" style="width:100%;text-align:center;margin-bottom:12px" placeholder="delete" autocomplete="off">
    <div style="display:flex;gap:8px;justify-content:center">
      <button class="btn btn-sm" style="background:var(--danger);color:#fff;min-width:80px;height:28px;padding:4px 12px" id="deleteBoardConfirmBtn" disabled data-action="_doDeleteBoard">🗑 ${t('board_delete')||'Delete'}</button>
      <button class="btn btn-sm btn-secondary" data-action="_closeBoardModal" data-arg="boardDeleteConfirmModal" style="min-width:80px;height:28px;padding:4px 12px">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('boardDeleteConfirmModal', html, '440px');
  const inp = document.getElementById('deleteBoardConfirmInput');
  const btn = document.getElementById('deleteBoardConfirmBtn');
  if (inp && btn) {
    inp.addEventListener('input', function() {
      btn.disabled = inp.value.trim().toLowerCase() !== 'delete';
      btn.style.opacity = btn.disabled ? '0.5' : '1';
    });
    inp.focus();
  }
}

async function _doDeleteBoard() {
  const board = _boardsState.activeBoard;
  if (!board) return;
  const inp = document.getElementById('deleteBoardConfirmInput');
  if (!inp || inp.value.trim().toLowerCase() !== 'delete') return;
  try {
    await _boardApi('DELETE', '/boards/' + board.id);
    _closeBoardModal('boardDeleteConfirmModal');
    openBoardsModal();
  } catch (e) { alert(e.message); }
}

// ── Remove Board from List ──
async function _removeBoardFromList(boardId) {
  const board = _boardsState.boards.find(b => b.id === boardId);
  const name = board ? board.name : 'this board';
  if (!confirm((t('board_delete_confirm') || 'Delete board "%s" and all its items?').replace('%s', name))) return;
  try {
    await _boardApi('DELETE', '/boards/' + boardId);
    openBoardsModal();
  } catch (e) { alert(e.message); }
}

// ── Zoom ──
function _boardZoomIn() {
  _boardsState.zoom = Math.min(2.0, _boardsState.zoom + 0.1);
  _renderKanbanBoard();
}
function _boardZoomOut() {
  _boardsState.zoom = Math.max(0.4, _boardsState.zoom - 0.1);
  _renderKanbanBoard();
}
function _boardZoomReset() {
  _boardsState.zoom = 1.0;
  _renderKanbanBoard();
}

// ── Archive ──
// ── Move item to another board ──
async function _showMoveToBoardDialog(itemId) {
  const item = _boardsState.items.find(i => i.id === itemId);
  if (!item) return;

  // Fetch all boards the user can access
  let boards;
  try {
    boards = await _boardApi('GET', '/boards');
  } catch (e) { alert('Failed to load boards: ' + e.message); return; }

  // Filter out the current board
  const currentBoardId = _boardsState.activeBoard?.id;
  const otherBoards = boards.filter(b => b.id !== currentBoardId);
  if (!otherBoards.length) {
    alert('No other boards available to move this item to.');
    return;
  }

  // Check for related items on the same board
  const relatedIds = (item.related_item_ids || []).filter(rid => {
    const rel = _boardsState.items.find(i => i.id === rid);
    return rel && !rel.archived;
  });
  const hasRelated = relatedIds.length > 0;

  let html = `<div style="max-width:440px">
    <h3 style="margin-bottom:10px">Move Item to Another Board</h3>
    <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:10px">
      Moving <strong>#${item.id} ${escHtml(item.subject)}</strong> from <strong>${escHtml(_boardsState.activeBoard?.name || '')}</strong>
    </p>
    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-sm);font-weight:600;display:block;margin-bottom:4px">Target Board:</label>
      <select id="moveToBoardSelect" class="input" style="width:100%;padding:6px 8px;font-size:var(--fs-sm);border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius)">
        ${otherBoards.map(b => `<option value="${b.id}" data-cols='${JSON.stringify(b.columns||[])}'>${escHtml(b.name)}${b.description ? ' — ' + escHtml(b.description.substring(0, 40)) : ''}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-sm);font-weight:600;display:block;margin-bottom:4px">Target Column:</label>
      <select id="moveToColSelect" class="input" style="width:100%;padding:6px 8px;font-size:var(--fs-sm);border:1px solid var(--border);background:var(--bg3);border-radius:var(--radius)"></select>
    </div>`;

  if (hasRelated) {
    const relatedNames = relatedIds.map(rid => {
      const rel = _boardsState.items.find(i => i.id === rid);
      return rel ? `#${rid} ${escHtml(rel.subject)}` : `#${rid}`;
    });
    html += `<div style="margin-bottom:10px;padding:10px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid var(--accent)">
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
        <input type="checkbox" id="moveRelatedCheck" checked style="width:16px;height:16px;accent-color:var(--accent);margin-top:2px">
        <div>
          <strong>Also move ${relatedIds.length} related item(s)?</strong>
          <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">
            ${relatedNames.join('<br>')}
          </div>
        </div>
      </label>
    </div>`;
  }

  html += `<div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:10px;margin-top:12px">
      <button class="btn btn-primary" data-action="_executeMoveToBoard" data-arg="${itemId}">Move</button>
      <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="moveToBoardModal">Cancel</button>
    </div>
  </div>`;

  _boardModal('moveToBoardModal', html, '460px');

  // Populate columns when board selection changes
  const boardSel = document.getElementById('moveToBoardSelect');
  const colSel = document.getElementById('moveToColSelect');
  function updateColumns() {
    const opt = boardSel.selectedOptions[0];
    if (!opt) return;
    let cols = [];
    try { cols = JSON.parse(opt.dataset.cols || '[]'); } catch {}
    colSel.innerHTML = cols.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  }
  if (boardSel) {
    boardSel.addEventListener('change', updateColumns);
    updateColumns();
  }
}

async function _executeMoveToBoard(itemId) {
  const boardSel = document.getElementById('moveToBoardSelect');
  const colSel = document.getElementById('moveToColSelect');
  const relatedCheck = document.getElementById('moveRelatedCheck');
  if (!boardSel || !colSel) return;

  const targetBoardId = parseInt(boardSel.value);
  const targetColId = colSel.value;
  const moveRelated = relatedCheck ? relatedCheck.checked : false;

  if (!targetBoardId) return;

  try {
    const result = await _boardApi('POST', '/board-items/' + itemId + '/move-to-board', {
      target_board_id: targetBoardId,
      target_column_id: targetColId,
      move_related: moveRelated
    });
    const movedCount = (result.moved || []).length;
    _closeBoardModal('moveToBoardModal');
    _closeBoardModal('boardItemModal');
    // Refresh current board
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
    _renderKanbanBoard();
    const boardName = boardSel.selectedOptions[0]?.textContent?.split(' — ')[0] || 'target board';
    if (typeof showNotification === 'function') {
      showNotification('success', `Moved ${movedCount} item(s) to ${boardName}`);
    }
  } catch (e) { alert('Failed to move: ' + e.message); }
}

async function _archiveBoardItem(itemId) {
  try {
    await _boardApi('POST', '/board-items/' + itemId + '/archive', {});
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
    _renderKanbanBoard();
    if (typeof pushUndo === 'function') {
      pushUndo('archive_board_item', { boardId: _boardsState.activeBoard?.id, itemId: itemId });
    }
  } catch (e) { alert(e.message); }
}

async function _unarchiveBoardItem(itemId) {
  try {
    await _boardApi('POST', '/board-items/' + itemId + '/unarchive', {});
    const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
    _boardsState.items = items;
    _renderKanbanBoard();
  } catch (e) { alert(e.message); }
}

async function _archiveColumnItems(colId) {
  const board = _boardsState.activeBoard;
  if (!board) return;
  const colItems = _boardsState.items.filter(i => !i.archived && String(i.column_id) === String(colId));
  if (!colItems.length) return;
  const colName = (board.columns.find(c => String(c.id) === String(colId)) || {}).name || colId;
  if (!confirm((t('board_archive_col_confirm') || 'Archive all %n items in "%s"?').replace('%n', colItems.length).replace('%s', colName))) return;
  try {
    const archivedIds = [];
    for (const item of colItems) {
      await _boardApi('POST', '/board-items/' + item.id + '/archive', {});
      archivedIds.push(item.id);
    }
    const items = await _boardApi('GET', '/boards/' + board.id + '/items');
    _boardsState.items = items;
    _renderKanbanBoard();
    if (typeof pushUndo === 'function') {
      pushUndo('archive_column_items', { boardId: board.id, itemIds: archivedIds, colName: colName });
    }
  } catch (e) { alert(e.message); }
}

// ── Print ──
function _printBoard() {
  window.print();
}

// ── Undo action from board view ──
async function _boardUndo() {
  if (typeof performUndo === 'function') {
    await performUndo();
    // Refresh board view after undo
    if (_boardsState.activeBoard) {
      await _openBoard(_boardsState.activeBoard.id);
    }
  }
}

// ── Detach board into a new window ──
let _boardPopout = null;
let _boardPopoutMonitor = null;

function _detachBoard() {
  const board = _boardsState.activeBoard;
  if (!board) return;

  if (_boardPopout && !_boardPopout.closed) {
    _boardPopout.focus();
    return;
  }

  const w = Math.min(window.screen.availWidth, 1200);
  const h = Math.min(window.screen.availHeight - 100, 800);
  _boardPopout = window.open('', 'tidslinjal-board',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_boardPopout) { alert('Popup blocked. Please allow popups for this site.'); return; }

  const theme = document.body.className || '';

  // Get the full rendered kanban HTML from the existing modal
  const boardsModal = document.getElementById('boardsModal');
  const existingHtml = boardsModal ? boardsModal.querySelector('.modal').innerHTML : '';

  _boardPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + escHtml(board.name) + ' \u2014 Board</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:16px;font-family:"Segoe UI",system-ui,sans-serif;overflow:auto;background:var(--bg);color:var(--text)}' +
    '.modal-close{display:none}' +
    '.kanban-card{transition:transform 0.1s ease;cursor:pointer}' +
    '.kanban-card:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,0.2)}' +
    '#boardContainer{min-height:90vh}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<div id="boardContainer">' + existingHtml + '</div>' +
    '</body></html>');
  _boardPopout.document.close();

  // Bind all data-action buttons in the popout back to main window functions
  _bindBoardPopoutActions();

  if (_boardPopoutMonitor) clearInterval(_boardPopoutMonitor);
  _boardPopoutMonitor = setInterval(() => {
    if (!_boardPopout || _boardPopout.closed) {
      clearInterval(_boardPopoutMonitor);
      _boardPopoutMonitor = null;
      _boardPopout = null;
    }
  }, 1000);
}

function _bindBoardPopoutActions() {
  if (!_boardPopout || _boardPopout.closed) return;
  const wrap = _boardPopout.document.getElementById('boardContainer');
  if (!wrap) return;
  wrap.querySelectorAll('[data-action]').forEach(el => {
    el.onclick = function(e) {
      try {
        if (el.hasAttribute('data-stop-prop')) e.stopPropagation();
        const fn = el.dataset.action;
        const rawArg = el.dataset.arg;
        const rawArgs = el.dataset.args;
        if (typeof window[fn] === 'function') {
          if (rawArgs) {
            window[fn](...JSON.parse(rawArgs));
          } else if (rawArg !== undefined && rawArg !== null) {
            let arg = rawArg;
            if (/^\d+$/.test(arg)) arg = parseInt(arg, 10);
            window[fn](arg);
          } else {
            window[fn]();
          }
        }
      } catch(e2) { console.error(e2); }
    };
  });
}

// ── Export ──
function _exportBoard(format) {
  const board = _boardsState.activeBoard;
  if (!board) return;
  const menu = document.getElementById('boardExportMenu');
  if (menu) menu.style.display = 'none';
  window.open('/api/boards/' + board.id + '/export/' + format, '_blank');
}

// ── Export/Import dropdown toggles ──
function _toggleBoardExportMenu() {
  const menu = document.getElementById('boardExportMenu');
  const importMenu = document.getElementById('boardImportMenu');
  if (importMenu) importMenu.style.display = 'none';
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

function _toggleBoardImportMenu() {
  const menu = document.getElementById('boardImportMenu');
  const exportMenu = document.getElementById('boardExportMenu');
  if (exportMenu) exportMenu.style.display = 'none';
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

// Close dropdown menus when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('#boardExportDropdown')) {
    const m = document.getElementById('boardExportMenu');
    if (m) m.style.display = 'none';
  }
  if (!e.target.closest('#boardImportDropdown')) {
    const m = document.getElementById('boardImportMenu');
    if (m) m.style.display = 'none';
  }
  if (!e.target.closest('#boardListImpExpDropdown')) {
    const m = document.getElementById('boardListImpExpMenu');
    if (m) m.style.display = 'none';
  }
});

// ── Import ──
function _importBoardAs(format) {
  const menu = document.getElementById('boardImportMenu');
  if (menu) menu.style.display = 'none';
  const accept = format === 'csv' ? '.csv' : '.json';
  const desc = format === 'csv'
    ? (t('board_import_csv_desc') || 'Upload a CSV file to import as board items.')
    : (t('board_import_desc') || 'Upload a JSON file exported from Boards.');
  let html = `<div style="max-width:500px">
    <h3>⬆ ${t('board_import')||'Import Board'} (${format.toUpperCase()})</h3>
    <p style="font-size:var(--fs-sm);color:var(--text-dim)">${desc}</p>
    <input type="file" id="boardImportFile" accept="${accept}" style="margin-bottom:12px">
    <input type="hidden" id="boardImportFormat" value="${format}">
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" data-action="_doImportBoard">⬆ ${t('btn_import')||'Import'}</button>
      <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="boardImportModal">✖ ${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('boardImportModal', html, '520px');
}

function _openImportBoardDialog() {
  _importBoardAs('json');
}

function _toggleBoardListImpExpMenu() {
  const menu = document.getElementById('boardListImpExpMenu');
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

async function _exportAllBoardsJson() {
  const menu = document.getElementById('boardListImpExpMenu');
  if (menu) menu.style.display = 'none';
  try {
    const boards = _boardsState.boards || [];
    const allData = [];
    for (const b of boards) {
      const items = await _boardApi('GET', '/boards/' + b.id + '/items').catch(() => []);
      allData.push({ board: b, items });
    }
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'boards-export-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { alert(e.message); }
}

async function _doImportBoard() {
  const file = document.getElementById('boardImportFile')?.files[0];
  if (!file) return;
  const format = document.getElementById('boardImportFormat')?.value || 'json';
  try {
    if (format === 'csv') {
      const text = await file.text();
      await _boardApi('POST', '/boards/import/csv', { csv: text });
    } else {
      const text = await file.text();
      const data = JSON.parse(text);
      await _boardApi('POST', '/boards/import', data);
    }
    closeModal('boardImportModal');
    openBoardsModal();
  } catch (e) { alert(e.message); }
}

// ── Share Link Functions ──
async function _shareBoardLink() {
  const board = _boardsState.activeBoard;
  if (!board) return;
  try {
    const res = await _boardApi('POST', '/boards/' + board.id + '/share');
    const url = window.location.origin + '/#board-share=' + res.share_token;
    await navigator.clipboard.writeText(url).catch(() => {});
    _boardModal('boardShareModal', `<div style="max-width:500px">
      <h3>🔗 ${t('board_share')||'Share Link'}</h3>
      <p style="font-size:var(--fs-sm);color:var(--text-dim)">${t('board_share_desc')||'Anyone with an account and appropriate access rights can use this link to view the board.'}</p>
      <input id="boardShareUrl" class="input" style="width:100%;margin-bottom:8px" value="${escHtml(url)}" readonly>
      <p style="font-size:var(--fs-xs);color:var(--text-dim)">${t('board_share_access_note')||'Access is checked: the user must be authenticated and have visibility rights to this board.'}</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-action="_copyShareUrl" data-arg="boardShareUrl">📋 ${t('btn_copy')||'Copy to clipboard'}</button>
        <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="boardShareModal">✖ ${t('btn_close')||'Close'}</button>
      </div>
    </div>`, '520px');
    _bindShareInput('boardShareUrl');
  } catch (e) { alert(e.message); }
}

async function _shareBoardItemLink(itemId) {
  try {
    const res = await _boardApi('POST', '/board-items/' + itemId + '/share');
    const externalUrl = window.location.origin + '/#board-item-share=' + res.share_token;
    const boardId = _boardsState.activeBoard?.id || '';
    const internalUrl = window.location.origin + '/#open-board-item=' + boardId + ':' + itemId;
    await navigator.clipboard.writeText(internalUrl).catch(() => {});
    _boardModal('boardItemShareModal', `<div style="max-width:500px">
      <h3>🔗 ${t('board_share_item')||'Share Item Link'}</h3>
      <p style="font-size:var(--fs-sm);color:var(--text-dim);font-weight:600;margin-bottom:4px">${t('board_internal_link')||'Internal link (within Tidslinjal)'}:</p>
      <input id="boardItemInternalUrl" class="input" style="width:100%;margin-bottom:8px" value="${escHtml(internalUrl)}" readonly>
      <p style="font-size:var(--fs-sm);color:var(--text-dim);font-weight:600;margin-bottom:4px">${t('board_external_link')||'External share link'}:</p>
      <input id="boardItemShareUrl" class="input" style="width:100%;margin-bottom:8px" value="${escHtml(externalUrl)}" readonly>
      <p style="font-size:var(--fs-xs);color:var(--text-dim)">${t('board_share_access_note')||'Access is checked: the user must be authenticated and have visibility rights to this board.'}</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-action="_copyShareUrl" data-arg="boardItemInternalUrl">📋 ${t('btn_copy_internal')||'Copy internal link'}</button>
        <button class="btn btn-secondary btn-sm" data-action="_copyShareUrl" data-arg="boardItemShareUrl">📋 ${t('btn_copy_external')||'Copy external link'}</button>
        <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="boardItemShareModal">✖ ${t('btn_close')||'Close'}</button>
      </div>
    </div>`, '560px');
    _bindShareInput('boardItemInternalUrl');
    _bindShareInput('boardItemShareUrl');
  } catch (e) { alert(e.message); }
}

// ── Share link helpers (CSP-safe) ──
function _bindShareInput(inputId) {
  const inp = document.getElementById(inputId);
  if (inp) inp.addEventListener('click', function() { this.select(); });
}

function _copyShareUrl(inputId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.select();
  navigator.clipboard.writeText(inp.value).then(() => {
    if (typeof showNotification === 'function') showNotification('success', t('link_copied') || 'Copied to clipboard');
  }).catch(() => {});
}

// ── Board Color ──
function _clearBoardColor() {
  const el = document.getElementById('settBoardColor');
  if (el) el.value = '#1a1a2e';
}

// ── Tag Autocomplete ──
let _boardTagsCache = [];
async function _loadBoardTags() {
  const board = _boardsState.activeBoard;
  if (!board) return;
  try {
    _boardTagsCache = await _boardApi('GET', '/boards/' + board.id + '/tags');
  } catch { _boardTagsCache = []; }
}

function _setupTagAutocomplete(inputEl) {
  if (!inputEl || inputEl._tagAcSetup) return;
  inputEl._tagAcSetup = true;
  let acDiv = null;
  let _tagMatches = [];

  function showSuggestions() {
    const val = inputEl.value;
    const parts = val.split(',');
    const current = (parts[parts.length - 1] || '').trim().toLowerCase();
    if (!current || _boardTagsCache.length === 0) { hideSuggestions(); return; }
    const existingTags = parts.slice(0, -1).map(s => s.trim().toLowerCase());
    _tagMatches = _boardTagsCache.filter(tag =>
      tag.toLowerCase().includes(current) && !existingTags.includes(tag.toLowerCase())
    );

    // Auto-expand: if exactly one match starts with the typed text, auto-complete it
    const prefixMatches = _tagMatches.filter(tag => tag.toLowerCase().startsWith(current));
    if (prefixMatches.length === 1 && prefixMatches[0].toLowerCase() !== current) {
      // Show suggestion but don't auto-fill yet — let user press Tab/Enter
    }

    if (_tagMatches.length === 0) { hideSuggestions(); return; }
    if (!acDiv) {
      acDiv = document.createElement('div');
      acDiv.style.cssText = 'position:absolute;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);max-height:150px;overflow-y:auto;width:' + inputEl.offsetWidth + 'px;box-shadow:0 4px 12px rgba(0,0,0,.3)';
      inputEl.parentNode.style.position = 'relative';
      inputEl.parentNode.appendChild(acDiv);
    }
    acDiv.innerHTML = _tagMatches.map((tag, i) =>
      `<div class="tag-ac-item${i===0?' active':''}" style="padding:4px 8px;cursor:pointer;font-size:var(--fs-xs)" data-tag="${escHtml(tag)}">${escHtml(tag)}</div>`
    ).join('');
    acDiv.querySelectorAll('.tag-ac-item').forEach(function(el) {
      el.addEventListener('mousedown', function(e) { e.preventDefault(); _doSelectTag(inputEl, el.dataset.tag); hideSuggestions(); });
    });
  }

  function hideSuggestions() {
    if (acDiv) { acDiv.remove(); acDiv = null; }
    _tagMatches = [];
  }

  function selectActiveTag() {
    if (!acDiv) return false;
    const active = acDiv.querySelector('.tag-ac-item.active');
    if (active) {
      const tag = active.textContent;
      _doSelectTag(inputEl, tag);
      hideSuggestions();
      return true;
    }
    if (_tagMatches.length === 1) {
      _doSelectTag(inputEl, _tagMatches[0]);
      hideSuggestions();
      return true;
    }
    return false;
  }

  inputEl.addEventListener('input', showSuggestions);
  inputEl.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideSuggestions(); return; }
    if (!acDiv) return;
    const items = acDiv.querySelectorAll('.tag-ac-item');
    const active = acDiv.querySelector('.tag-ac-item.active');
    let idx = Array.from(items).indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); items.forEach((it,i) => it.classList.toggle('active', i===idx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); items.forEach((it,i) => it.classList.toggle('active', i===idx)); }
    else if (e.key === 'Tab' || e.key === 'Enter') {
      if (selectActiveTag()) e.preventDefault();
    }
  });
}

function _doSelectTag(inputEl, tag) {
  // Add tag as a chip
  const chipsEl = document.getElementById('inlineItemTagChips');
  if (chipsEl) {
    const existing = Array.from(chipsEl.querySelectorAll('.board-tag-chip')).map(c => c.dataset.tag.toLowerCase());
    if (!existing.includes(tag.toLowerCase())) {
      const chip = document.createElement('span');
      chip.className = 'board-tag-chip';
      chip.dataset.tag = tag;
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:' + (typeof _tagColor === 'function' ? _tagColor(tag) : 'var(--accent)') + ';cursor:default';
      chip.textContent = tag;
      const x = document.createElement('span');
      x.className = 'board-tag-remove';
      x.style.cssText = 'cursor:pointer;font-weight:bold;margin-left:2px';
      x.textContent = '×';
      x.addEventListener('click', function() { chip.remove(); });
      chip.appendChild(x);
      chipsEl.appendChild(chip);
    }
    inputEl.value = '';
    inputEl.focus();
  } else {
    // Fallback to old behavior
    const parts = inputEl.value.split(',').map(s => s.trim()).filter(Boolean);
    parts[parts.length - 1] = tag;
    inputEl.value = parts.join(', ') + ', ';
    inputEl.focus();
  }
}

// Global function for tag selection from autocomplete dropdown
window._selectTag = function(el, tag) {
  const inputEl = document.getElementById('inlineItemTags') || document.getElementById('editItemTags');
  if (!inputEl) return;
  _doSelectTag(inputEl, tag);
};

// ── @Mention Autocomplete for board textareas and inputs ──
// ── @mention autocomplete — uses same pattern as tag autocomplete ──
function _setupBoardMentionAutocomplete(el) {
  if (!el || el._mentionAcSetup) return;
  el._mentionAcSetup = true;
  let acDiv = null;
  let mentionStart = -1;
  let matches = [];

  function getMentionContext() {
    const val = el.value;
    const pos = el.selectionStart;
    // Walk backwards from cursor to find @
    let i = pos - 1;
    while (i >= 0 && /[\w.]/.test(val[i])) i--;
    if (i < 0 || val[i] !== '@') return null;
    // @ must be at start or preceded by whitespace/punctuation
    if (i > 0 && /\w/.test(val[i - 1])) return null;
    return { start: i, query: val.slice(i + 1, pos).toLowerCase() };
  }

  async function showSuggestions() {
    const ctx = getMentionContext();
    if (!ctx) { hideSuggestions(); return; }
    mentionStart = ctx.start;
    // Ensure users are loaded
    if (!state.users || !state.users.length) {
      try {
        const users = await apiGet('/api/users');
        if (users && users.length) state.users = users;
      } catch { /* ignore */ }
    }
    matches = (state.users || []).filter(u =>
      (u.username && u.username.toLowerCase().includes(ctx.query)) ||
      (u.display_name && u.display_name.toLowerCase().includes(ctx.query))
    ).slice(0, 8);
    if (!matches.length) { hideSuggestions(); return; }
    if (!acDiv) {
      acDiv = document.createElement('div');
      acDiv.style.cssText = 'position:absolute;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);max-height:200px;overflow-y:auto;min-width:220px;width:' + el.offsetWidth + 'px;box-shadow:0 4px 16px rgba(0,0,0,.4)';
      el.parentNode.style.position = 'relative';
      el.parentNode.appendChild(acDiv);
    }
    acDiv.innerHTML = matches.map((u, idx) =>
      `<div class="mention-ac-item${idx===0?' active':''}" style="padding:6px 12px;cursor:pointer;font-size:var(--fs-sm);display:flex;gap:8px;align-items:center" data-username="${escHtml(u.username)}"><span style="font-weight:600;color:var(--accent)">@${escHtml(u.username)}</span><span style="color:var(--text-dim);font-size:var(--fs-xs)">${escHtml(u.display_name||'')}</span></div>`
    ).join('');
    acDiv.querySelectorAll('.mention-ac-item').forEach(function(item) {
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        doInsert(item.dataset.username);
        hideSuggestions();
      });
      item.addEventListener('mouseover', function() {
        acDiv.querySelectorAll('.mention-ac-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }

  function hideSuggestions() {
    if (acDiv) { acDiv.remove(); acDiv = null; }
    matches = [];
    mentionStart = -1;
  }

  function selectActive() {
    if (!acDiv) return false;
    const active = acDiv.querySelector('.mention-ac-item.active');
    if (active) {
      doInsert(active.dataset.username);
      hideSuggestions();
      return true;
    }
    if (matches.length === 1) {
      doInsert(matches[0].username);
      hideSuggestions();
      return true;
    }
    return false;
  }

  function doInsert(username) {
    const pos = el.selectionStart;
    const val = el.value;
    const before = val.slice(0, mentionStart);
    const after = val.slice(pos);
    const insert = '@' + username + ' ';
    el.value = before + insert + after;
    const newPos = before.length + insert.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
  }

  // Same event pattern as tag autocomplete
  el.addEventListener('input', showSuggestions);
  el.addEventListener('keyup', function(e) {
    // Also trigger on keyup as fallback for some keyboard layouts
    if (e.key === '@' || e.key === 'Backspace' || e.key === 'Delete') showSuggestions();
  });
  el.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideSuggestions(); return; }
    if (!acDiv) return;
    const items = acDiv.querySelectorAll('.mention-ac-item');
    const active = acDiv.querySelector('.mention-ac-item.active');
    let idx = Array.from(items).indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); items.forEach((it,i) => it.classList.toggle('active', i===idx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); items.forEach((it,i) => it.classList.toggle('active', i===idx)); }
    else if (e.key === 'Tab' || e.key === 'Enter') {
      if (selectActive()) { e.preventDefault(); e.stopPropagation(); }
    }
  });
  // Add styles once
  if (!document.getElementById('mentionAcStyles')) {
    const s = document.createElement('style');
    s.id = 'mentionAcStyles';
    s.textContent = '.mention-ac-item:hover,.mention-ac-item.active{background:var(--bg3)}';
    document.head.appendChild(s);
  }
}

// ── Handle Share Link on Page Load ──
function _handleBoardShareLinks() {
  const hash = window.location.hash;
  if (hash.startsWith('#board-share=')) {
    const token = hash.substring('#board-share='.length);
    window.location.hash = '';
    _boardApi('GET', '/boards/shared?token=' + token).then(data => {
      _boardsState.activeBoard = data.board;
      _boardsState.items = data.items || [];
      _renderKanbanBoard();
    }).catch(e => alert(e.message));
  } else if (hash.startsWith('#board-item-share=')) {
    const token = hash.substring('#board-item-share='.length);
    window.location.hash = '';
    _boardApi('GET', '/board-items/shared?token=' + token).then(data => {
      // Open the board, then show the item
      _boardApi('GET', '/boards/' + data.board_id).then(board => {
        _boardApi('GET', '/boards/' + data.board_id + '/items').then(items => {
          _boardsState.activeBoard = board;
          _boardsState.items = items;
          _renderKanbanBoard();
          setTimeout(() => _openBoardItem(data.item.id), 300);
        });
      });
    }).catch(e => alert(e.message));
  } else if (hash.startsWith('#open-board-item=')) {
    // Internal cross-reference: #open-board-item=boardId:itemId
    const ref = hash.substring('#open-board-item='.length);
    window.location.hash = '';
    const [boardIdStr, itemIdStr] = ref.split(':');
    const boardId = parseInt(boardIdStr, 10);
    const itemId = parseInt(itemIdStr, 10);
    if (boardId && itemId) {
      _boardApi('GET', '/boards/' + boardId).then(board => {
        _boardApi('GET', '/boards/' + boardId + '/items').then(items => {
          _boardsState.activeBoard = board;
          _boardsState.items = items;
          if (typeof openBoardsModal === 'function') openBoardsModal();
          setTimeout(() => {
            _renderKanbanBoard();
            setTimeout(() => _openBoardItem(itemId), 300);
          }, 300);
        });
      }).catch(e => { if (typeof showError === 'function') showError(e.message); });
    }
  } else if (hash.startsWith('#open-board=')) {
    // Internal cross-reference: #open-board=boardId
    const boardId = parseInt(hash.substring('#open-board='.length), 10);
    window.location.hash = '';
    if (boardId) {
      _boardApi('GET', '/boards/' + boardId).then(board => {
        _boardApi('GET', '/boards/' + boardId + '/items').then(items => {
          _boardsState.activeBoard = board;
          _boardsState.items = items;
          if (typeof openBoardsModal === 'function') openBoardsModal();
          setTimeout(() => _renderKanbanBoard(), 300);
        });
      }).catch(e => { if (typeof showError === 'function') showError(e.message); });
    }
  }
}

// Check share links on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _handleBoardShareLinks);
} else {
  setTimeout(_handleBoardShareLinks, 500);
}
// Listen for hash changes to handle cross-reference links in-app
window.addEventListener('hashchange', _handleBoardShareLinks);

// ── SSE listener ──
if (typeof window._boardSSESetup === 'undefined') {
  window._boardSSESetup = true;
  document.addEventListener('sse:board_change', async (e) => {
    try {
      const data = JSON.parse(e.detail);
      if (_boardsState.activeBoard && _boardsState.activeBoard.id === data.board_id) {
        // Refresh current board
        const [board, items] = await Promise.all([
          _boardApi('GET', '/boards/' + data.board_id),
          _boardApi('GET', '/boards/' + data.board_id + '/items'),
        ]);
        _boardsState.activeBoard = board;
        _boardsState.items = items;
        _renderKanbanBoard();
      }
    } catch { /* ignore */ }
  });
}
