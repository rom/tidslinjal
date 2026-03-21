/* ── Boards (Kanban) UI ─────────────────────────────────────────────────── */
'use strict';

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

// ── Modal helper (creates dynamic overlay modals) ──
function _boardModal(id, content, width) {
  let el = document.getElementById(id);
  if (el) el.remove();
  const html = `<div class="modal-overlay" id="${id}">
    <div class="modal" style="max-width:${width||'800px'};width:96vw;max-height:94vh;overflow:auto;padding:20px;position:relative;resize:both;min-width:320px;min-height:200px">
      <button class="modal-close" data-action="_closeBoardModal" data-arg="${id}" style="position:absolute;top:8px;right:12px;background:none;border:none;color:var(--text);font-size:20px;cursor:pointer">&#x2715;</button>
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
async function _boardApi(method, path, body) {
  const opts = { method, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' } };
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
        <button class="btn btn-sm btn-secondary" data-action="_openImportBoardDialog">⬆ ${t('btn_import')||'Import'}</button>
      </div>
    </div>`;

  if (boards.length === 0) {
    html += `<p style="color:var(--text-dim)">${t('board_empty')||'No boards yet. Create one or use a template.'}</p>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">`;
    for (const b of boards) {
      const vis = { private: '🔒', group: '👥', role: '🎭', global: '🌐' }[b.visibility] || '';
      const cardBg = b.color ? `background:${b.color}22;border:1px solid ${b.color}44;` : 'background:var(--bg2);border:1px solid var(--border);';
      html += `<div class="card" style="cursor:pointer;padding:14px;border-radius:var(--radius);${cardBg}" data-action="_openBoard" data-arg="${b.id}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${escHtml(b.name)}</strong> <span title="${b.visibility}">${vis}</span>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${escHtml(b.description||'')}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:8px">${b.columns ? b.columns.length : 3} columns · by ${escHtml(b.owner_name||'')}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Templates section
  html += `<div style="margin-top:24px"><h3>📋 ${t('board_templates')||'Templates'}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">`;
  for (const tmpl of (window._boardTemplates || [])) {
    html += `<div class="card" style="padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);cursor:pointer" data-action="_createFromTemplate" data-arg="${tmpl.id}">
      <strong style="font-size:var(--fs-sm)">${escHtml(tmpl.name)}</strong>
      <div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(tmpl.description||'')}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${tmpl.columns.length} columns</div>
    </div>`;
  }
  html += `</div></div></div>`;

  _boardModal('boardsModal', html, '960px');
}

// ── Create Board Dialog ──
function _openCreateBoardDialog() {
  const groups = state.groups || [];
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
        <option value="teammember">Team Member</option>
        <option value="teamlead">Team Lead</option>
        <option value="deputy_teamlead">Deputy Team Lead</option>
        <option value="oplead">Operations Lead</option>
        <option value="deputy_oplead">Deputy Operations Lead</option>
        <option value="staffofficer">Staff Officer</option>
        <option value="admin">Admin</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary" data-action="_doCreateBoard">✔ ${t('btn_create')||'Create'}</button>
      <button class="btn btn-secondary" data-action="_closeBoardModal" data-arg="boardCreateModal">✖ ${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  _boardModal('boardCreateModal', html, '520px');
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

  const colItems = {};
  for (const col of board.columns) colItems[String(col.id)] = [];
  for (const item of items) {
    const cid = String(item.column_id);
    if (!colItems[cid]) colItems[cid] = [];
    colItems[cid].push(item);
  }
  // Sort by sort_order
  for (const k of Object.keys(colItems)) colItems[k].sort((a, b) => a.sort_order - b.sort_order);

  const boardBg = board.color ? `background:${board.color}22;border:1px solid ${board.color}44;border-radius:var(--radius);padding:12px;` : '';
  const btnStyle = 'min-width:32px;height:28px;padding:4px 8px;font-size:13px;display:inline-flex;align-items:center;justify-content:center;';
  let html = `<div style="max-width:100%;overflow-x:auto;${boardBg}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-sm btn-secondary" data-action="openBoardsModal" title="${t('board_back')||'Back to boards'}" style="${btnStyle}">← ${t('board_back_short')||'Boards'}</button>
        ${board.color ? `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${board.color}"></span>` : ''}
        <h2 style="margin:0">${escHtml(board.name)}</h2>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-right:28px">
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
        <button class="btn btn-sm btn-secondary" data-action="_boardZoomOut" title="${t('board_zoom_out')||'Zoom out'}" style="${btnStyle}">−</button>
        <span id="boardZoomLevel" style="font-size:var(--fs-xs);min-width:36px;text-align:center">${Math.round(_boardsState.zoom * 100)}%</span>
        <button class="btn btn-sm btn-secondary" data-action="_boardZoomIn" title="${t('board_zoom_in')||'Zoom in'}" style="${btnStyle}">+</button>
        <button class="btn btn-sm btn-secondary" data-action="_boardZoomReset" title="${t('board_zoom_reset')||'Reset zoom'}" style="${btnStyle}font-size:var(--fs-xs);">100%</button>
      </div>
    </div>
    <div class="kanban-columns" style="display:flex;gap:12px;min-height:400px;align-items:flex-start;transform:scale(${_boardsState.zoom});transform-origin:top left;${_boardsState.zoom !== 1 ? 'width:' + (100 / _boardsState.zoom) + '%;' : ''}">`;

  for (const col of board.columns) {
    const collapsed = col.collapsed;
    const cItems = colItems[String(col.id)] || [];
    if (collapsed) {
      html += `<div class="kanban-col kanban-col-collapsed" style="min-width:40px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:8px;cursor:pointer;writing-mode:vertical-rl;text-orientation:mixed" data-action="_toggleColCollapse" data-arg="${col.id}">
        <strong>${escHtml(col.name)} (${cItems.length})</strong>
      </div>`;
    } else {
      const colBg = col.color ? col.color : 'var(--bg2)';
      const colBorder = col.color ? `border:1px solid ${col.color};` : 'border:1px solid var(--border);';
      html += `<div class="kanban-col" data-col="${col.id}" data-drop-col="${col.id}" style="min-width:240px;max-width:320px;flex:1;background:${colBg};${colBorder}border-radius:var(--radius);padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong style="cursor:pointer" data-dblclick-rename="${col.id}" data-col-name="${escHtml(col.name)}">${escHtml(col.name)} (${cItems.length})</strong>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_addItemToCol" data-arg="${col.id}" title="${t('board_add_item')||'Add item'}">+</button>
            <button class="btn btn-sm" style="font-size:10px;padding:1px 4px" data-action="_toggleColCollapse" data-arg="${col.id}" title="${t('board_collapse')||'Collapse'}">−</button>
          </div>
        </div>
        <div class="kanban-items" style="display:flex;flex-direction:column;gap:6px;min-height:40px">`;

      for (const item of cItems) {
        const bgColor = item.color || 'var(--bg3)';
        html += `<div class="kanban-card" draggable="true" data-item-id="${item.id}" data-drag-item="${item.id}"
          style="background:${bgColor};border:1px solid var(--border);border-radius:var(--radius);padding:8px;cursor:grab;position:relative"
          data-action="_openBoardItem" data-arg="${item.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <strong style="font-size:var(--fs-sm)">${escHtml(item.subject)}</strong>
            <span style="font-size:var(--fs-xs);color:var(--text-dim);white-space:nowrap">#${item.id}</span>
          </div>
          ${item.note ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px;max-height:40px;overflow:hidden">${escHtml(item.note).substring(0, 100)}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:var(--fs-xs)">
            <span style="color:var(--text-dim)">${escHtml(item.creator_name||'')}</span>
            <div style="display:flex;gap:4px">
              ${item.tags ? item.tags.map(tag => `<span style="background:var(--accent);color:#fff;padding:0 4px;border-radius:3px;font-size:9px">${escHtml(tag)}</span>`).join('') : ''}
              ${item.attachments && item.attachments.length ? `<span title="${item.attachments.length} attachment(s)">📎${item.attachments.length}</span>` : ''}
              ${item.checklist_id ? '<span title="Linked checklist">📋</span>' : ''}
              ${item.event_id ? '<span title="Linked event">📅</span>' : ''}
            </div>
          </div>
        </div>`;
      }
      html += `</div></div>`;
    }
  }
  html += `</div></div>`;

  // Adjust width to number of columns: ~280px per column + padding, capped at 95vw
  const visibleCols = board.columns.filter(c => !c.collapsed).length;
  const collapsedCols = board.columns.length - visibleCols;
  const calcWidth = visibleCols * 300 + collapsedCols * 60 + 80;
  const boardWidth = Math.min(calcWidth, window.innerWidth * 0.95);
  _boardModal('boardsModal', html, boardWidth + 'px');
  _bindKanbanEvents();
  _setupKanbanDragScroll();
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
  const subject = prompt(t('board_item_subject')||'Subject:');
  if (!subject) return;
  const board = _boardsState.activeBoard;
  const colItems = _boardsState.items.filter(i => String(i.column_id) === String(colId));
  const sortOrder = colItems.length > 0 ? Math.max(...colItems.map(i => i.sort_order)) + 1 : 0;
  try {
    const created = await _boardApi('POST', '/boards/' + board.id + '/items', {
      column_id: colId, subject, sort_order: sortOrder
    });
    _boardsState.items.push(created);
    _renderKanbanBoard();
  } catch (e) { alert(e.message); }
}

// ── Open item detail ──
function _openBoardItem(itemId) {
  if (_boardsState.justDragged) return;
  const item = _boardsState.items.find(i => i.id === itemId);
  if (!item) return;
  const board = _boardsState.activeBoard;
  const colName = (board.columns.find(c => c.id === item.column_id) || {}).name || item.column_id;

  let html = `<div style="max-width:700px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">#${item.id}
        <input id="inlineItemSubject" class="input" style="font-size:inherit;font-weight:bold;border:1px solid transparent;background:transparent;padding:2px 6px;width:60%;border-radius:var(--radius)" value="${escHtml(item.subject)}" onfocus="this.style.borderColor='var(--accent)';this.style.background='var(--bg3)'" onblur="this.style.borderColor='transparent';this.style.background='transparent';_inlineSaveBoardItem(${item.id})">
      </h3>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-sm btn-secondary" data-action="_shareBoardItemLink" data-arg="${item.id}" title="${t('board_share_item')||'Share link'}" style="min-width:32px;height:28px;padding:4px 8px">🔗</button>
        <span style="border-left:1px solid var(--border);height:20px;margin:0 2px"></span>
        <button class="btn btn-sm btn-secondary" style="color:var(--danger);min-width:32px;height:28px;padding:4px 8px" data-action="_deleteBoardItem" data-arg="${item.id}" title="${t('board_delete_item')||'Delete item'}">🗑</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:var(--fs-sm);margin-bottom:12px">
      <div><strong>${t('board_column')||'Column'}:</strong> ${escHtml(colName)}</div>
      <div><strong>${t('board_type')||'Type'}:</strong>
        <select id="inlineItemType" class="input" style="font-size:var(--fs-sm);padding:1px 4px;border:1px solid transparent;background:transparent;border-radius:var(--radius)" onchange="_inlineSaveBoardItem(${item.id})" onfocus="this.style.borderColor='var(--accent)';this.style.background='var(--bg3)'" onblur="this.style.borderColor='transparent';this.style.background='transparent'">
          <option value="" ${!item.item_type?'selected':''}>—</option>
          <option value="task" ${item.item_type==='task'?'selected':''}>Task</option>
          <option value="meeting" ${item.item_type==='meeting'?'selected':''}>Meeting</option>
          <option value="checklist" ${item.item_type==='checklist'?'selected':''}>Checklist</option>
          <option value="issue" ${item.item_type==='issue'?'selected':''}>Issue</option>
          <option value="note" ${item.item_type==='note'?'selected':''}>Note</option>
        </select>
      </div>
      <div><strong>${t('board_creator')||'Creator'}:</strong> ${escHtml(item.creator_name)}</div>
      <div><strong>${t('board_created')||'Created'}:</strong> ${new Date(item.created_at).toLocaleString()}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <strong style="font-size:var(--fs-sm)">${t('board_color')||'Color'}:</strong>
      <input id="inlineItemColor" type="color" value="${item.color||'#1a1a2e'}" style="width:32px;height:22px;cursor:pointer;border:none;padding:0" onchange="_inlineSaveBoardItem(${item.id})">
      ${item.color ? `<button class="btn btn-sm" style="font-size:var(--fs-xs);padding:1px 6px" onclick="document.getElementById('inlineItemColor').value='#1a1a2e';_inlineSaveBoardItem(${item.id})">✖</button>` : ''}
    </div>
    <div style="margin-bottom:8px;font-size:var(--fs-sm)">
      <strong>${t('tags_title')||'Tags'}:</strong>
      <input id="inlineItemTags" class="input" style="width:calc(100% - 50px);font-size:var(--fs-sm);padding:2px 6px;border:1px solid transparent;background:transparent;border-radius:var(--radius);margin-left:4px" value="${escHtml((item.tags||[]).join(', '))}" placeholder="${t('tags_placeholder')||'comma-separated'}" onfocus="this.style.borderColor='var(--accent)';this.style.background='var(--bg3)'" onblur="this.style.borderColor='transparent';this.style.background='transparent';_inlineSaveBoardItem(${item.id})">
    </div>
    <div style="margin-bottom:12px">
      <strong style="font-size:var(--fs-sm)">${t('board_note')||'Note'}:</strong>
      <textarea id="inlineItemNote" class="input" style="width:100%;min-height:80px;margin-top:4px;padding:8px;border-radius:var(--radius);font-size:var(--fs-sm);resize:vertical;border:1px solid var(--border);background:var(--bg3)" onblur="_inlineSaveBoardItem(${item.id})">${escHtml(item.note||'')}</textarea>
    </div>`;

  // Attachments
  html += `<div style="margin-bottom:12px">
    <strong style="font-size:var(--fs-sm)">📎 ${t('board_attachments')||'Attachments'} (${(item.attachments||[]).length})</strong>
    <div style="margin-top:4px">`;
  for (const att of (item.attachments || [])) {
    html += `<div style="font-size:var(--fs-xs);margin-bottom:2px"><a href="/api/board-items/${item.id}/attachments/${att.id}" target="_blank">${escHtml(att.filename)}</a> (${_formatSize(att.size)})</div>`;
  }
  html += `<form id="boardAttUploadForm" style="margin-top:6px;display:flex;align-items:center;gap:6px">
    <input type="file" id="boardAttFile" style="font-size:var(--fs-xs)">
    <button type="button" class="btn btn-sm btn-secondary" data-action="_uploadBoardAttachment" data-arg="${item.id}" style="min-width:32px;height:28px;padding:4px 8px">⬆ Upload</button>
  </form></div></div>`;

  // History
  html += `<div><strong style="font-size:var(--fs-sm)">📜 ${t('board_history')||'History'}</strong>
    <div style="max-height:200px;overflow-y:auto;margin-top:4px;font-size:var(--fs-xs)">`;
  for (const h of (item.history || []).slice().reverse()) {
    html += `<div style="padding:3px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-dim)">${new Date(h.timestamp).toLocaleString()}</span>
      <strong>${escHtml(h.user_name)}</strong>: ${escHtml(h.action)} ${h.detail ? '— ' + escHtml(h.detail) : ''}
    </div>`;
  }
  html += `</div></div></div>`;

  _boardModal('boardItemModal', html, '720px');
  // Setup tag autocomplete on inline tags input
  _loadBoardTags().then(() => {
    const tagInput = document.getElementById('inlineItemTags');
    if (tagInput) _setupTagAutocomplete(tagInput);
  });
}

// ── Inline save for board item (auto-save on blur/change) ──
let _inlineSaveTimer = null;
async function _inlineSaveBoardItem(itemId) {
  clearTimeout(_inlineSaveTimer);
  _inlineSaveTimer = setTimeout(async () => {
    const subject = (document.getElementById('inlineItemSubject') || {}).value;
    if (!subject || !subject.trim()) return;
    const note = (document.getElementById('inlineItemNote') || {}).value || '';
    const itemType = (document.getElementById('inlineItemType') || {}).value || '';
    const colorVal = (document.getElementById('inlineItemColor') || {}).value || '';
    const tagsVal = (document.getElementById('inlineItemTags') || {}).value || '';
    const tags = tagsVal.split(',').map(s => s.trim()).filter(Boolean);
    const color = colorVal === '#1a1a2e' ? '' : colorVal;
    try {
      await _boardApi('PUT', '/board-items/' + itemId, { subject: subject.trim(), note, item_type: itemType, color, tags });
      // Refresh items in state
      const items = await _boardApi('GET', '/boards/' + _boardsState.activeBoard.id + '/items');
      _boardsState.items = items;
    } catch (e) { /* silent - inline save */ }
  }, 400);
}

function _formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
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
    await _boardApi('DELETE', '/board-items/' + itemId);
    closeModal('boardItemModal');
    _boardsState.items = _boardsState.items.filter(i => i.id !== itemId);
    _renderKanbanBoard();
  } catch (e) { alert(e.message); }
}

// ── Upload attachment ──
async function _uploadBoardAttachment(itemId) {
  const fileInput = document.getElementById('boardAttFile');
  if (!fileInput || !fileInput.files.length) return;
  const form = new FormData();
  form.append('file', fileInput.files[0]);
  try {
    const res = await fetch('/api/board-items/' + itemId + '/attachments', {
      method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: form
    });
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || res.statusText);
    closeModal('boardItemModal');
    await _openBoard(_boardsState.activeBoard.id);
    _openBoardItem(itemId);
  } catch (e) { alert(e.message); }
}

// ── Board Settings ──
function _openBoardSettings() {
  const board = _boardsState.activeBoard;
  if (!board) return;
  const groups = state.groups || [];

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
    <label>${t('board_columns')||'Columns'}</label>
    <div id="settBoardCols">${colsHtml}</div>
    <button class="btn btn-sm btn-secondary" data-action="_addBoardCol" style="margin-top:4px;margin-bottom:12px">+ ${t('board_add_col')||'Add Column'}</button>
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
      columns: cols,
      color: boardColor === '#1a1a2e' ? '' : boardColor,
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

// ── Print ──
function _printBoard() {
  window.print();
}

// ── Detach board into a new window ──
function _detachBoard() {
  const board = _boardsState.activeBoard;
  if (!board) return;
  const w = window.open('', '_blank', 'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no');
  if (!w) { alert('Popup blocked. Please allow popups for this site.'); return; }
  const modalEl = document.querySelector('#boardsModal .modal');
  const content = modalEl ? modalEl.innerHTML : '';
  w.document.write(`<!DOCTYPE html><html><head><title>${escHtml(board.name)} — Board</title>
    <link rel="stylesheet" href="/static/style.css">
    <style>body{padding:20px;background:var(--bg1);color:var(--text);font-family:inherit;overflow:auto}
    .modal-close{display:none}</style></head>
    <body>${content}
    <script src="/static/i18n.js"><\/script>
    <script src="/static/boards.js"><\/script>
    <script>
      window.state = window.opener && window.opener.state ? window.opener.state : {};
      function escHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
    <\/script></body></html>`);
  w.document.close();
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
      <input class="input" style="width:100%;margin-bottom:8px" value="${escHtml(url)}" readonly onclick="this.select()">
      <p style="font-size:var(--fs-xs);color:var(--text-dim)">${t('board_share_access_note')||'Access is checked: the user must be authenticated and have visibility rights to this board.'}</p>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="boardShareModal">✖ ${t('btn_close')||'Close'}</button>
    </div>`, '520px');
  } catch (e) { alert(e.message); }
}

async function _shareBoardItemLink(itemId) {
  try {
    const res = await _boardApi('POST', '/board-items/' + itemId + '/share');
    const url = window.location.origin + '/#board-item-share=' + res.share_token;
    await navigator.clipboard.writeText(url).catch(() => {});
    _boardModal('boardItemShareModal', `<div style="max-width:500px">
      <h3>🔗 ${t('board_share_item')||'Share Item Link'}</h3>
      <p style="font-size:var(--fs-sm);color:var(--text-dim)">${t('board_share_item_desc')||'Anyone with an account and access to this board can use this link to view the item.'}</p>
      <input class="input" style="width:100%;margin-bottom:8px" value="${escHtml(url)}" readonly onclick="this.select()">
      <p style="font-size:var(--fs-xs);color:var(--text-dim)">${t('board_share_access_note')||'Access is checked: the user must be authenticated and have visibility rights to this board.'}</p>
      <button class="btn btn-secondary btn-sm" data-action="_closeBoardModal" data-arg="boardItemShareModal">✖ ${t('btn_close')||'Close'}</button>
    </div>`, '520px');
  } catch (e) { alert(e.message); }
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

  function showSuggestions() {
    const val = inputEl.value;
    const parts = val.split(',');
    const current = (parts[parts.length - 1] || '').trim().toLowerCase();
    if (!current || _boardTagsCache.length === 0) { hideSuggestions(); return; }
    const existingTags = parts.slice(0, -1).map(s => s.trim().toLowerCase());
    const matches = _boardTagsCache.filter(tag =>
      tag.toLowerCase().includes(current) && !existingTags.includes(tag.toLowerCase())
    );
    if (matches.length === 0) { hideSuggestions(); return; }
    if (!acDiv) {
      acDiv = document.createElement('div');
      acDiv.style.cssText = 'position:absolute;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);max-height:150px;overflow-y:auto;width:' + inputEl.offsetWidth + 'px;box-shadow:0 4px 12px rgba(0,0,0,.3)';
      inputEl.parentNode.style.position = 'relative';
      inputEl.parentNode.appendChild(acDiv);
    }
    acDiv.innerHTML = matches.map(tag =>
      `<div style="padding:4px 8px;cursor:pointer;font-size:var(--fs-xs)" onmousedown="_selectTag(this,'${escHtml(tag)}')">${escHtml(tag)}</div>`
    ).join('');
  }

  function hideSuggestions() {
    if (acDiv) { acDiv.remove(); acDiv = null; }
  }

  inputEl.addEventListener('input', showSuggestions);
  inputEl.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideSuggestions();
  });
}

// Global function for tag selection from autocomplete dropdown
window._selectTag = function(el, tag) {
  const inputEl = document.getElementById('editItemTags');
  if (!inputEl) return;
  const parts = inputEl.value.split(',').map(s => s.trim()).filter(Boolean);
  parts[parts.length - 1] = tag;
  inputEl.value = parts.join(', ') + ', ';
  inputEl.focus();
};

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
  }
}

// Check share links on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _handleBoardShareLinks);
} else {
  setTimeout(_handleBoardShareLinks, 500);
}

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
