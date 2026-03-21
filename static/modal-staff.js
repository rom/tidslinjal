/* ============================================================
   Staff Toolbox — On duty, Staff manning, Areas of responsibility,
   tool references, detachable window support.
   ============================================================ */
'use strict';

let _staffPopout = null;
let _staffPopoutMonitor = null;

// ── Open / Close ────────────────────────────────────────────────────────────

async function openStaffToolbox() {
  // Remove existing if any
  const prev = document.getElementById('staffToolboxModal');
  if (prev) prev.remove();

  const users = (state.users || []).filter(u => u.active !== false);

  const html = `
    <div class="modal-overlay" id="staffToolboxModal">
      <div class="modal" style="max-width:750px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center">
          <h2>\u{1F396} ${t('staff_toolbox_title')||'Staff Toolbox'}</h2>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="detachStaffToolbox" title="${t('btn_detach')||'Detach to window'}">\u29C9 ${t('btn_detach')||'Detach'}</button>
            <button class="modal-close" data-action="closeStaffToolbox">\u2715</button>
          </div>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px" id="staffToolboxBody">
          ${_staffToolboxContent(users)}
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('staffToolboxModal');
  void modal.offsetHeight;
  modal.classList.add('open');
  _bindActions(modal);
  _loadStaffData();
}

function closeStaffToolbox() {
  const el = document.getElementById('staffToolboxModal');
  if (el) el.remove();
}

// ── Content builder ─────────────────────────────────────────────────────────

function _staffToolboxContent(users) {
  const userOpts = users.map(u => `<option value="${u.id}">${escHtml(u.display_name || u.username)}</option>`).join('');

  return `
    <!-- On Duty -->
    <div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">\u{1F6A8} ${t('staff_on_duty')||'On Duty'}</h3>
        <button class="btn btn-secondary btn-sm" data-action="staffAddDuty">\u002B ${t('staff_add')||'Add'}</button>
      </div>
      <div id="staffDutyList" style="display:flex;flex-direction:column;gap:6px">
        <em style="color:var(--text-muted)">${t('loading')||'Loading...'}</em>
      </div>
    </div>

    <!-- Staff Manning -->
    <div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">\u{1F465} ${t('staff_manning')||'Staff Manning'}</h3>
        <button class="btn btn-secondary btn-sm" data-action="staffAddMember">\u002B ${t('staff_add')||'Add'}</button>
      </div>
      <div id="staffMemberList" style="display:flex;flex-direction:column;gap:6px">
        <em style="color:var(--text-muted)">${t('loading')||'Loading...'}</em>
      </div>
    </div>

    <!-- Areas of Responsibility -->
    <div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">\u{1F4CB} ${t('staff_areas')||'Areas of Responsibility'}</h3>
        <button class="btn btn-secondary btn-sm" data-action="staffAddArea">\u002B ${t('staff_add')||'Add'}</button>
      </div>
      <div id="staffAreaList" style="display:flex;flex-direction:column;gap:6px">
        <em style="color:var(--text-muted)">${t('loading')||'Loading...'}</em>
      </div>
    </div>

    <!-- Tool References -->
    <div style="background:var(--bg3);border-radius:var(--radius);padding:12px">
      <h3 style="margin:0 0 8px 0">\u{1F4DA} ${t('staff_infomanagement')||'Information Management'}</h3>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="openDecisionLogModal">\u2696 ${t('decisions_title')||'Decisions'}</button>
        <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="openLogBookModal">\u{1F4D6} ${t('tab_log_book')||'Log Book'}</button>
        <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="openBoardsModal">\u{1F4CC} ${t('board_title')||'Boards'}</button>
        <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="openDetachedReferences">\u{1F4DA} ${t('references_title')||'Information Management'}</button>
      </div>
    </div>`;
}

// ── Load data from API ──────────────────────────────────────────────────────

async function _loadStaffData() {
  try {
    const [duties, members, areas] = await Promise.all([
      apiGet('/api/staff/duties'),
      apiGet('/api/staff/members'),
      apiGet('/api/staff/areas')
    ]);
    _renderStaffDuties(duties || []);
    _renderStaffMembers(members || []);
    _renderStaffAreas(areas || []);
  } catch (e) {
    console.error('Staff data load error:', e);
  }
}

// ── Render helpers ──────────────────────────────────────────────────────────

function _staffMattermostLink(userId) {
  const mmBase = (state.exercise || {}).mattermost_dm_url;
  if (!mmBase) return '';
  const user = (state.users || []).find(u => u.id === userId);
  const handle = user ? (user.mattermost_handle || user.username) : '';
  if (!handle) return '';
  const cleanHandle = handle.replace(/^@/, '');
  return `<a href="${escHtml(mmBase)}/@${escHtml(cleanHandle)}" target="_blank" rel="noopener" class="btn btn-sm" style="padding:2px 6px;font-size:11px;text-decoration:none" title="${t('staff_mm_dm')||'Mattermost DM'}">💬</a>`;
}

function _renderStaffDuties(duties) {
  const el = document.getElementById('staffDutyList');
  if (!el) return;
  if (duties.length === 0) {
    el.innerHTML = `<em style="color:var(--text-muted)">${t('staff_none')||'No entries yet.'}</em>`;
    return;
  }
  el.innerHTML = duties.map(d => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg2);border-radius:var(--radius)">
      <strong style="min-width:120px">${escHtml(d.role)}</strong>
      <span style="flex:1">${escHtml(d.user_name || '-')}</span>
      ${d.start_time ? `<span style="font-size:11px;color:var(--text-muted)">${escHtml(d.start_time)} \u2013 ${escHtml(d.end_time||'')}</span>` : ''}
      ${d.note ? `<span style="font-size:11px;color:var(--text-muted)" title="${escHtml(d.note)}">\u{1F4DD}</span>` : ''}
      ${_staffMattermostLink(d.user_id)}
      <button class="btn btn-sm" style="padding:2px 6px;font-size:11px" data-action="staffDeleteDuty" data-arg="${d.id}" title="${t('btn_delete')||'Delete'}">\u2715</button>
    </div>`).join('');
  _bindActions(el);
}

function _renderStaffMembers(members) {
  const el = document.getElementById('staffMemberList');
  if (!el) return;
  if (members.length === 0) {
    el.innerHTML = `<em style="color:var(--text-muted)">${t('staff_none')||'No entries yet.'}</em>`;
    return;
  }
  el.innerHTML = members.map(m => {
    const posLabel = (_staffPositions.find(p => p.value === m.position) || {}).label || m.position;
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg2);border-radius:var(--radius)">
      <strong style="min-width:140px">${escHtml(posLabel)}</strong>
      <span style="flex:1">${escHtml(m.user_name || '-')}</span>
      ${m.note ? `<span style="font-size:11px;color:var(--text-muted)" title="${escHtml(m.note)}">\u{1F4DD}</span>` : ''}
      ${_staffMattermostLink(m.user_id)}
      <button class="btn btn-sm" style="padding:2px 6px;font-size:11px" data-action="staffDeleteMember" data-arg="${m.id}" title="${t('btn_delete')||'Delete'}">\u2715</button>
    </div>`;
  }).join('');
  _bindActions(el);
}

function _renderStaffAreas(areas) {
  const el = document.getElementById('staffAreaList');
  if (!el) return;
  if (areas.length === 0) {
    el.innerHTML = `<em style="color:var(--text-muted)">${t('staff_none')||'No entries yet.'}</em>`;
    return;
  }
  el.innerHTML = areas.map(a => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg2);border-radius:var(--radius)">
      <strong style="min-width:140px">${escHtml(a.name)}</strong>
      <span style="flex:1">${escHtml(a.assigned_name || '-')}</span>
      ${a.description ? `<span style="font-size:11px;color:var(--text-muted)" title="${escHtml(a.description)}">\u{1F4C4}</span>` : ''}
      ${_staffMattermostLink(a.assigned_to)}
      <button class="btn btn-sm" style="padding:2px 6px;font-size:11px" data-action="staffEditArea" data-arg="${a.id}" title="${t('btn_edit')||'Edit'}">\u270E</button>
      <button class="btn btn-sm" style="padding:2px 6px;font-size:11px" data-action="staffDeleteArea" data-arg="${a.id}" title="${t('btn_delete')||'Delete'}">\u2715</button>
    </div>`).join('');
  _bindActions(el);
}

// ── Add duty ────────────────────────────────────────────────────────────────

function staffAddDuty() {
  const users = (state.users || []).filter(u => u.active !== false);
  const userOpts = users.map(u => `<option value="${u.id}">${escHtml(u.display_name || u.username)}</option>`).join('');
  const formHtml = `
    <div id="staffDutyForm" style="background:var(--bg2);border-radius:var(--radius);padding:10px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:end">
      <label style="flex:1;min-width:120px">${t('staff_role')||'Role'}
        <input id="staffDutyRole" class="input" placeholder="${t('staff_role_placeholder')||'e.g. Chief of Staff'}" style="width:100%">
      </label>
      <label style="flex:1;min-width:120px">${t('staff_person')||'Person'}
        <select id="staffDutyUser" class="input" style="width:100%">
          <option value="">--</option>
          ${userOpts}
        </select>
      </label>
      <label style="min-width:80px">${t('staff_note')||'Note'}
        <input id="staffDutyNote" class="input" style="width:100%">
      </label>
      <button class="btn btn-primary btn-sm" data-action="staffSaveDuty">${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="staffCancelDutyForm">${t('btn_cancel')||'Cancel'}</button>
    </div>`;
  const list = document.getElementById('staffDutyList');
  if (list) {
    list.insertAdjacentHTML('afterbegin', formHtml);
    _bindActions(list);
  }
}

function staffCancelDutyForm() {
  const f = document.getElementById('staffDutyForm');
  if (f) f.remove();
}

async function staffSaveDuty() {
  const role = (document.getElementById('staffDutyRole') || {}).value || '';
  const userId = parseInt((document.getElementById('staffDutyUser') || {}).value) || 0;
  const note = (document.getElementById('staffDutyNote') || {}).value || '';
  if (!role) return;
  const selEl = document.getElementById('staffDutyUser');
  const userName = selEl && selEl.selectedIndex > 0 ? selEl.options[selEl.selectedIndex].text : '';
  try {
    await apiPost('/api/staff/duties', { role, user_id: userId, user_name: userName, note });
    staffCancelDutyForm();
    _loadStaffData();
  } catch (e) { console.error(e); }
}

async function staffDeleteDuty(id) {
  if (!confirm(t('confirm_delete')||'Delete this entry?')) return;
  try {
    await apiDel('/api/staff/duties/' + id);
    _loadStaffData();
  } catch (e) { console.error(e); }
}

// ── Add member ──────────────────────────────────────────────────────────────

// Standard J-designations and staff positions
const _staffPositions = [
  { value: 'chief_of_staff', label: 'Chief of Staff' },
  { value: 'J1', label: 'J1 \u2013 Personnel' },
  { value: 'J2', label: 'J2 \u2013 Intelligence' },
  { value: 'J3', label: 'J3 \u2013 Operations' },
  { value: 'J4', label: 'J4 \u2013 Logistics' },
  { value: 'J5', label: 'J5 \u2013 Plans' },
  { value: 'J6', label: 'J6 \u2013 Communications' },
  { value: 'J7', label: 'J7 \u2013 Training' },
  { value: 'J8', label: 'J8 \u2013 Finance' },
  { value: 'J9', label: 'J9 \u2013 CIMIC' },
  { value: 'planning', label: 'Planning' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'tools_responsible', label: 'Tools Responsible' },
  { value: 'external_contacts', label: 'External Contacts' },
];

function staffAddMember() {
  const users = (state.users || []).filter(u => u.active !== false);
  const userOpts = users.map(u => `<option value="${u.id}">${escHtml(u.display_name || u.username)}</option>`).join('');
  const posOpts = _staffPositions.map(p => `<option value="${p.value}">${escHtml(p.label)}</option>`).join('');
  const formHtml = `
    <div id="staffMemberForm" style="background:var(--bg2);border-radius:var(--radius);padding:10px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:end">
      <label style="flex:1;min-width:150px">${t('staff_position')||'Position'}
        <select id="staffMemberPositionSelect" class="input" style="width:100%" data-action="staffPositionChanged" data-event="change">
          <option value="">-- ${t('staff_select_position')||'Select position'} --</option>
          ${posOpts}
          <option value="__custom__">\u270E ${t('staff_custom_position')||'Custom...'}</option>
        </select>
        <input id="staffMemberPositionCustom" class="input" placeholder="${t('staff_position_placeholder')||'e.g. Planning'}" style="width:100%;display:none;margin-top:4px">
      </label>
      <label style="flex:1;min-width:120px">${t('staff_person')||'Person'}
        <select id="staffMemberUser" class="input" style="width:100%">
          <option value="">--</option>
          ${userOpts}
        </select>
      </label>
      <label style="min-width:80px">${t('staff_note')||'Note'}
        <input id="staffMemberNote" class="input" style="width:100%">
      </label>
      <button class="btn btn-primary btn-sm" data-action="staffSaveMember">${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="staffCancelMemberForm">${t('btn_cancel')||'Cancel'}</button>
    </div>`;
  const list = document.getElementById('staffMemberList');
  if (list) {
    list.insertAdjacentHTML('afterbegin', formHtml);
    _bindActions(list);
  }
}

function staffPositionChanged() {
  const sel = document.getElementById('staffMemberPositionSelect');
  const custom = document.getElementById('staffMemberPositionCustom');
  if (sel && custom) {
    custom.style.display = sel.value === '__custom__' ? '' : 'none';
    if (sel.value === '__custom__') custom.focus();
  }
}

function staffCancelMemberForm() {
  const f = document.getElementById('staffMemberForm');
  if (f) f.remove();
}

async function staffSaveMember() {
  const selVal = (document.getElementById('staffMemberPositionSelect') || {}).value || '';
  const customVal = (document.getElementById('staffMemberPositionCustom') || {}).value || '';
  const position = selVal === '__custom__' ? customVal : selVal;
  const userId = parseInt((document.getElementById('staffMemberUser') || {}).value) || 0;
  const note = (document.getElementById('staffMemberNote') || {}).value || '';
  if (!position) return;
  const selEl = document.getElementById('staffMemberUser');
  const userName = selEl && selEl.selectedIndex > 0 ? selEl.options[selEl.selectedIndex].text : '';
  try {
    await apiPost('/api/staff/members', { position, user_id: userId, user_name: userName, note });
    staffCancelMemberForm();
    _loadStaffData();
  } catch (e) { console.error(e); }
}

async function staffDeleteMember(id) {
  if (!confirm(t('confirm_delete')||'Delete this entry?')) return;
  try {
    await apiDel('/api/staff/members/' + id);
    _loadStaffData();
  } catch (e) { console.error(e); }
}

// ── Add / edit area ─────────────────────────────────────────────────────────

function staffAddArea() {
  _showAreaForm(null);
}

function staffEditArea(id) {
  // Find existing area data from the rendered list
  _showAreaForm(id);
}

function _showAreaForm(editId) {
  const users = (state.users || []).filter(u => u.active !== false);
  const userOpts = users.map(u => `<option value="${u.id}">${escHtml(u.display_name || u.username)}</option>`).join('');
  const formHtml = `
    <div id="staffAreaForm" style="background:var(--bg2);border-radius:var(--radius);padding:10px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:end">
      <input type="hidden" id="staffAreaEditId" value="${editId || ''}">
      <label style="flex:1;min-width:120px">${t('staff_area_name')||'Name'}
        <input id="staffAreaName" class="input" placeholder="${t('staff_area_name_placeholder')||'e.g. Communications'}" style="width:100%">
      </label>
      <label style="flex:1;min-width:120px">${t('staff_area_desc')||'Description'}
        <input id="staffAreaDesc" class="input" style="width:100%">
      </label>
      <label style="flex:1;min-width:120px">${t('staff_assigned_to')||'Assigned to'}
        <select id="staffAreaUser" class="input" style="width:100%">
          <option value="">--</option>
          ${userOpts}
        </select>
      </label>
      <button class="btn btn-primary btn-sm" data-action="staffSaveArea">${t('btn_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="staffCancelAreaForm">${t('btn_cancel')||'Cancel'}</button>
    </div>`;
  const list = document.getElementById('staffAreaList');
  if (list) {
    list.insertAdjacentHTML('afterbegin', formHtml);
    _bindActions(list);
  }
}

function staffCancelAreaForm() {
  const f = document.getElementById('staffAreaForm');
  if (f) f.remove();
}

async function staffSaveArea() {
  const editId = (document.getElementById('staffAreaEditId') || {}).value;
  const name = (document.getElementById('staffAreaName') || {}).value || '';
  const desc = (document.getElementById('staffAreaDesc') || {}).value || '';
  const assignedTo = parseInt((document.getElementById('staffAreaUser') || {}).value) || 0;
  if (!name && !editId) return;
  const selEl = document.getElementById('staffAreaUser');
  const assignedName = selEl && selEl.selectedIndex > 0 ? selEl.options[selEl.selectedIndex].text : '';
  try {
    if (editId) {
      await apiPut('/api/staff/areas/' + editId, { name, description: desc, assigned_to: assignedTo, assigned_name: assignedName });
    } else {
      await apiPost('/api/staff/areas', { name, description: desc, assigned_to: assignedTo, assigned_name: assignedName });
    }
    staffCancelAreaForm();
    _loadStaffData();
  } catch (e) { console.error(e); }
}

async function staffDeleteArea(id) {
  if (!confirm(t('confirm_delete')||'Delete this entry?')) return;
  try {
    await apiDel('/api/staff/areas/' + id);
    _loadStaffData();
  } catch (e) { console.error(e); }
}

// ── Detach ──────────────────────────────────────────────────────────────────

function detachStaffToolbox() {
  closeStaffToolbox();

  if (_staffPopout && !_staffPopout.closed) {
    _staffPopout.focus();
    return;
  }

  const users = (state.users || []).filter(u => u.active !== false);
  const content = _staffToolboxContent(users);
  const theme = document.body.className || '';
  const w = Math.min(window.screen.availWidth, 500);
  const h = Math.min(window.screen.availHeight - 100, 700);

  _staffPopout = window.open('', 'tidslinjal-staff',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_staffPopout) return;

  _staffPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Staff Toolbox</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:16px;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    'h2{margin:0 0 12px 0}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<h2>\u{1F396} ' + escHtml(t('staff_toolbox_title')||'Staff Toolbox') + '</h2>' +
    '<div id="staffDetachedWrap">' + content + '</div>' +
    '<script src="/static/i18n.js"><\/script>' +
    '<script src="/static/utils.js"><\/script>' +
    '</body></html>');
  _staffPopout.document.close();

  // Bind actions in the popout to opener (main window) functions
  function rebindPopoutActions() {
    if (!_staffPopout || _staffPopout.closed) return;
    const wrap = _staffPopout.document.getElementById('staffDetachedWrap');
    if (!wrap) return;
    wrap.querySelectorAll('[data-action]').forEach(el => {
      el.onclick = function() {
        try {
          window.focus();
          const fn = el.dataset.action;
          const arg = el.dataset.arg;
          if (typeof window[fn] === 'function') {
            arg ? window[fn](arg) : window[fn]();
          }
        } catch(e) { console.error(e); }
      };
    });
  }
  rebindPopoutActions();

  // Load data into the popout
  _loadStaffData();

  if (_staffPopoutMonitor) clearInterval(_staffPopoutMonitor);
  _staffPopoutMonitor = setInterval(() => {
    if (!_staffPopout || _staffPopout.closed) {
      clearInterval(_staffPopoutMonitor);
      _staffPopoutMonitor = null;
      _staffPopout = null;
    }
  }, 1000);
}

// apiPost, apiPut, apiDel are provided by api.js
