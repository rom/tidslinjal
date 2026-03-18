/* ── Bulk Actions ── */
// ── Bulk Event Actions (Tools panel, admin) ────────────────────────────────

function openBulkActionsModal() {
  // Populate event type dropdown
  const sel = document.getElementById('baNewType');
  if (sel) {
    sel.innerHTML = (state.eventTypes || []).map(et =>
      `<option value="${escHtml(et.key)}">${escHtml(et.label || et.key)}</option>`
    ).join('');
  }
  // Reset result
  const res = document.getElementById('baResult');
  if (res) { res.style.display = 'none'; res.textContent = ''; }
  const delConf = document.getElementById('baDeleteConfirm');
  if (delConf) delConf.value = '';
  updateBulkActionUI();
  openModal('bulkActionsModal');
}

function switchBulkTab(tab, btn) {
  document.querySelectorAll('.ba-pane').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.ba-tab-btn').forEach(b => b.classList.remove('active'));
  const pane = document.getElementById('baPane_' + tab);
  if (pane) pane.style.display = '';
  if (btn) btn.classList.add('active');
}

function updateBulkActionUI() {
  const f = document.getElementById('baFilter')?.value || 'all';
  const hints = {
    all:    'Applies to ALL events (use time range to narrow down)',
    type:   'Event type key, e.g. "event", "decision", "activity"',
    user:   'Username or display name (autocomplete available)',
    group:  'Group name or numeric ID',
    role:   'Role: observer, read, reporter, teammember, teamlead, oplead, admin',
    status: 'Current status: planned, active, completed, cancelled…',
    layer:  'Layer numeric ID (see Layers tab)',
  };
  const hintEl = document.getElementById('baFilterHint');
  if (hintEl) hintEl.textContent = hints[f] || '';
  const vg = document.getElementById('baValueGroup');
  if (vg) vg.style.display = f === 'all' ? 'none' : '';
}

function updateBulkUserAutocomplete() {
  const f = document.getElementById('baFilter')?.value || '';
  if (f !== 'user') { _closeBulkDrop(); return; }
  const q = (document.getElementById('baValue')?.value || '').toLowerCase();
  if (!q) { _closeBulkDrop(); return; }
  const users = (state.users || []).filter(u =>
    (u.username && u.username.toLowerCase().includes(q)) ||
    (u.display_name && u.display_name.toLowerCase().includes(q))
  ).slice(0, 8);
  const drop = document.getElementById('baMentionDrop');
  if (!drop) return;
  if (!users.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = users.map(u =>
    `<div class="mention-item" data-action="_selectBulkUser" data-arg="${escHtml(u.username)}" style="padding:6px 10px;cursor:pointer;font-size:var(--fs-sm)">${escHtml(u.display_name||u.username)} <span style="color:var(--text-dim);font-size:var(--fs-xs)">@${escHtml(u.username)}</span></div>`
  ).join('');
  _bindActions(drop);
  drop.style.display = '';
}

function _selectBulkUser(username) {
  const inp = document.getElementById('baValue');
  if (inp) inp.value = username;
  _closeBulkDrop();
}

function _closeBulkDrop() {
  const drop = document.getElementById('baMentionDrop');
  if (drop) drop.style.display = 'none';
}

function _getBulkFilterParams() {
  const filter = document.getElementById('baFilter')?.value || 'all';
  const value  = document.getElementById('baValue')?.value?.trim() || '';
  const from   = document.getElementById('baTimeFrom')?.value || '';
  const to     = document.getElementById('baTimeTo')?.value   || '';
  const payload = { filter, value };
  if (from) payload.time_from = new Date(from).toISOString();
  if (to)   payload.time_to   = new Date(to).toISOString();
  return payload;
}

function _showBulkResult(el, ok, text) {
  if (!el) return;
  el.style.display = '';
  el.style.color = ok ? 'var(--green)' : 'var(--danger)';
  el.style.background = ok ? 'rgba(39,174,96,.1)' : 'rgba(231,76,60,.1)';
  el.style.border = `1px solid ${ok ? 'rgba(39,174,96,.3)' : 'rgba(231,76,60,.3)'}`;
  el.textContent = text;
}

async function executeBulkStatus() {
  const params = _getBulkFilterParams();
  const status = document.getElementById('baNewStatus')?.value;
  if (!status) return;
  if (!confirm(`Set all matching events to status "${status}"?`)) return;
  const res = document.getElementById('baResult');
  try {
    const r = await api('POST', '/api/admin/bulk/status', { ...params, status });
    if (r.ok) {
      const d = await r.json();
      _showBulkResult(res, true, `✓ Updated ${d.updated} event(s) to status "${status}".`);
      await refreshAll();
    } else {
      const d = await r.json().catch(()=>({}));
      _showBulkResult(res, false, `✗ ${d.error||'Error'}`);
    }
  } catch(e) { _showBulkResult(res, false, '✗ ' + e.message); }
}

async function executeBulkType() {
  const params = _getBulkFilterParams();
  const eventType = document.getElementById('baNewType')?.value;
  if (!eventType) return;
  if (!confirm(`Change event type of all matching events to "${eventType}"?`)) return;
  const res = document.getElementById('baResult');
  try {
    const r = await api('POST', '/api/admin/bulk/type', { ...params, event_type: eventType });
    if (r.ok) {
      const d = await r.json();
      _showBulkResult(res, true, `✓ Changed type of ${d.updated} event(s) to "${eventType}".`);
      await refreshAll();
    } else {
      const d = await r.json().catch(()=>({}));
      _showBulkResult(res, false, `✗ ${d.error||'Error'}`);
    }
  } catch(e) { _showBulkResult(res, false, '✗ ' + e.message); }
}

async function executeBulkDelete() {
  const params = _getBulkFilterParams();
  const conf = document.getElementById('baDeleteConfirm')?.value;
  if (conf !== 'DELETE') { showError('Type DELETE to confirm deletion.'); return; }
  const res = document.getElementById('baResult');
  try {
    const r = await api('POST', '/api/admin/bulk/delete', { ...params, confirm: 'DELETE' });
    if (r.ok) {
      const d = await r.json();
      _showBulkResult(res, true, `✓ Deleted ${d.deleted} event(s).`);
      document.getElementById('baDeleteConfirm').value = '';
      await refreshAll();
    } else {
      const d = await r.json().catch(()=>({}));
      _showBulkResult(res, false, `✗ ${d.error||'Error'}`);
    }
  } catch(e) { _showBulkResult(res, false, '✗ ' + e.message); }
}

// ── Bulk Operations (legacy selection-based) ──────────────────────────────

function openBulkStatusDialog() {
  const count = (state.selectedEventIds || []).length;
  if (!count) return;
  const countEl = document.getElementById('bulkStatusCount');
  if (countEl) countEl.textContent = `${count} event${count !== 1 ? 's' : ''} selected`;
  openModal('bulkStatusModal');
}

async function confirmBulkStatus() {
  const newStatus = document.getElementById('bulkStatusSelect')?.value;
  if (!newStatus) return;
  const ids = state.selectedEventIds || [];
  if (!ids.length) { closeModal('bulkStatusModal'); return; }
  const selectedEvs = state.events.filter(e => ids.includes(e.id));
  try {
    await Promise.all(selectedEvs.map(ev => {
      pushUndo('update_event', { id: ev.id, old: { ...ev } });
      return api('PATCH', `/api/events/${ev.id}/status`, { status: newStatus });
    }));
    closeModal('bulkStatusModal');
    clearSelection();
    await refreshAll();
    showNotification('success', `Status changed to ${newStatus} for ${selectedEvs.length} event${selectedEvs.length !== 1 ? 's' : ''}`);
  } catch {
    showError('Failed to change status for some events.', 'Bulk Status');
  }
}

async function bulkDeleteSelected() {
  const ids = state.selectedEventIds || [];
  if (!ids.length) return;
  const selectedEvs = state.events.filter(e => ids.includes(e.id));
  if (!confirm(`Delete ${selectedEvs.length} selected event${selectedEvs.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  try {
    await Promise.all(selectedEvs.map(ev => apiDel(`/api/events/${ev.id}`)));
    clearSelection();
    await refreshAll();
    showNotification('success', `Deleted ${selectedEvs.length} event${selectedEvs.length !== 1 ? 's' : ''}`);
  } catch {
    showError('Failed to delete some events.', 'Bulk Delete');
  }
}
