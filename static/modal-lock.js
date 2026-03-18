/* ── Lock Modal ── */
// ── Lock Modal ─────────────────────────────────────────────────────────────
document.getElementById('btnAddLock').addEventListener('click', () => {
  const now = new Date();
  document.getElementById('lockStart').value = fmtDateInput(now);
  document.getElementById('lockEnd').value   = fmtDateInput(addHours(now, 1));
  document.getElementById('lockReason').value = '';
  openLockModal();
});

// Show/hide layer selector in lock modal based on scope
function onLockScopeChange() {
  const scope = document.getElementById('lockScope').value;
  document.getElementById('lockLayerGroup').style.display = scope === 'layer' ? '' : 'none';
}

// Populate layer select when opening lock modal
function openLockModal(startDate, endDate) {
  const sel = document.getElementById('lockLayerSelect');
  if (sel) {
    sel.innerHTML = state.layers.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
  }
  document.getElementById('lockScope').value = 'all';
  document.getElementById('lockLayerGroup').style.display = 'none';

  if (startDate) document.getElementById('lockStart').value = fmtDateInput(startDate);
  if (endDate) document.getElementById('lockEnd').value = fmtDateInput(endDate);
  renderExistingLocks();
  openModal('lockModal');
}

function renderExistingLocks() {
  const listEl = document.getElementById('existingLocksList');
  if (!listEl) return;
  const locks = state.locks || [];
  if (locks.length === 0) {
    listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);margin-bottom:4px">No active locks.</div>`;
    return;
  }
  const isAdmin = state.user && state.user.role === 'admin';
  listEl.innerHTML = locks.map(l => {
    const canUnlock = isAdmin || (state.user && l.locked_by === state.user.id);
    const scopeLabel = {all:'All', master:'Master', layer:'Layer'}[l.scope||'all']||l.scope;
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px;font-size:var(--fs-sm)">
      <span style="flex:1;min-width:0">
        <span style="color:var(--text-dim)">${scopeLabel}:</span>
        <span style="color:var(--text-bright)">${fmtDateTime(new Date(l.start_time))} – ${fmtDateTime(new Date(l.end_time))}</span>
        ${l.reason ? `<span style="color:var(--text-dim);margin-left:4px">"${escHtml(l.reason)}"</span>` : ''}
        <span style="color:var(--text-dim);font-size:var(--fs-xs);display:block">by ${escHtml(l.locked_by_name||'')}</span>
      </span>
      ${canUnlock ? `<button class="btn btn-danger btn-sm" data-unlock="${l.id}">🔓 Unlock</button>` : ''}
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-unlock]').forEach(btn => {
    btn.addEventListener('click', () => unlockFromModal(parseInt(btn.dataset.unlock,10)));
  });
}

async function unlockFromModal(id) {
  if (!confirm(t('confirm_delete_lock')||'Remove this lock?')) return;
  const lockToRemove = (state.locks || []).find(l => l.id === id);
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) {
    if (lockToRemove) pushUndo('delete_lock', { ...lockToRemove });
    await fetchLocks();
    renderTimeline();
    renderExistingLocks();
    showNotification('success', t('notif_unlocked')||'Lock removed');
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

document.getElementById('btnSaveLock').addEventListener('click', async () => {
  const sv = document.getElementById('lockStart').value;
  const ev = document.getElementById('lockEnd').value;
  if (!sv||!ev) { showError('Start and end required', 'Validation'); return; }
  const scope = document.getElementById('lockScope').value;
  let layerID = null;
  if (scope === 'layer') {
    const lv = document.getElementById('lockLayerSelect').value;
    if (!lv) { showError('Please select a layer', 'Validation'); return; }
    layerID = parseInt(lv, 10);
  }
  const lockPayload = {
    start_time: new Date(sv).toISOString(),
    end_time:   new Date(ev).toISOString(),
    reason:     document.getElementById('lockReason').value,
    scope,
    layer_id:   layerID,
  };
  const res = await apiPost('/api/locks', lockPayload);
  if (res.ok) {
    const created = await res.json();
    pushUndo('create_lock', { id: created.id });
    closeModal('lockModal'); await fetchLocks(); renderTimeline();
    showNotification('success', t('notif_locked'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteLock(id) {
  if (!confirm(t('confirm_delete_lock'))) return;
  const lockToRemove = (state.locks || []).find(l => l.id === id);
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) {
    if (lockToRemove) pushUndo('delete_lock', { ...lockToRemove });
    await fetchLocks(); renderTimeline(); showNotification('success', t('notif_unlocked'));
  }
}
