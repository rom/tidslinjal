/* ── Backup Settings, Gradual Backup, Backup Modal ── */
// ── Gradual Backup Settings (admin) ───────────────────────────────────────────

async function openGradualBackupModal() {
  openModal('gradualBackupModal');
  await loadGradualBackupData();
}

async function loadGradualBackupData() {
  const data = await apiGet('/api/admin/gradual-backup').catch(() => null);
  if (!data) return;
  const cfg = data.settings || {};
  const snaps = data.snapshots || [];

  const en = document.getElementById('gbEnabled');
  const interval = document.getElementById('gbInterval');
  const maxSnaps = document.getElementById('gbMaxSnapshots');
  if (en) en.checked = cfg.enabled !== false;
  if (interval) interval.value = cfg.interval_minutes || 15;
  if (maxSnaps) maxSnaps.value = cfg.max_snapshots || 480;
  renderGradualBackupSnapshots(snaps);
}

function renderGradualBackupSnapshots(snaps) {
  const el = document.getElementById('gbSnapshotsList');
  if (!el) return;
  if (!snaps || !snaps.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No snapshots yet. They will be created automatically once the feature is enabled.</p>';
    return;
  }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
    <thead><tr style="background:var(--bg3)">
      <th style="padding:4px 8px;text-align:left">Snapshot</th>
      <th style="padding:4px 8px;text-align:right">Size</th>
      <th style="padding:4px 8px;text-align:right">Actions</th>
    </tr></thead><tbody>
    ${snaps.map(s => `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 8px;font-family:monospace">${escHtml(s.filename)}<br>
        <span style="color:var(--text-dim)">${new Date(s.created_at).toLocaleString()}</span></td>
      <td style="padding:4px 8px;text-align:right;white-space:nowrap">${fmtFileSize(s.size_bytes||0)}</td>
      <td style="padding:4px 8px;text-align:right;white-space:nowrap">
        <button class="btn btn-secondary btn-sm" data-action="downloadGradualSnapshot" data-arg="${escHtml(s.filename)}" title="Download this snapshot as a ZIP file">⬇</button>
        <button class="btn btn-secondary btn-sm" data-action="restoreGradualSnapshot" data-arg="${escHtml(s.filename)}" title="Restore data from this snapshot" style="color:var(--warning,#f39c12)">↩ Restore</button>
        <button class="btn btn-secondary btn-sm" data-action="deleteGradualSnapshot" data-arg="${escHtml(s.filename)}" title="Delete this snapshot" style="color:var(--danger)">🗑</button>
      </td>
    </tr>`).join('')}
    </tbody></table>`;
  _bindActions(el);
}

async function saveGradualBackupSettings() {
  const enabled = document.getElementById('gbEnabled')?.checked ?? true;
  const interval = parseInt(document.getElementById('gbInterval')?.value||'15', 10);
  const max = parseInt(document.getElementById('gbMaxSnapshots')?.value||'480', 10);
  const res = await api('PUT', '/api/admin/gradual-backup', {
    enabled, interval_minutes: interval, max_snapshots: max
  });
  if (res.ok) {
    showNotification('success', 'Gradual backup settings saved');
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Failed to save settings');
  }
}

async function createGradualSnapshotNow() {
  const btn = document.getElementById('btnSnapshotNow');
  if (btn) btn.disabled = true;
  const res = await api('POST', '/api/admin/gradual-backup/snapshot', {});
  if (btn) btn.disabled = false;
  if (res.ok) {
    const d = await res.json().catch(()=>({}));
    showNotification('success', `Snapshot created: ${d.filename||''}`);
    renderGradualBackupSnapshots(d.snapshots || []);
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Failed to create snapshot');
  }
}

function downloadGradualSnapshot(filename) {
  window.location.href = `/api/admin/gradual-backup/download/${encodeURIComponent(filename)}`;
}

async function restoreGradualSnapshot(filename) {
  // Show area selection dialog
  const areaOptions = [
    {value:'calendars', label:'Calendars & Events'},
    {value:'boards', label:'Boards'},
    {value:'resources', label:'Resources & Maps'},
    {value:'users', label:'Users & Groups'},
    {value:'logs', label:'Logs & Audit'},
    {value:'checklists', label:'Checklists'},
    {value:'other', label:'Other'}
  ];
  let html = `<div style="max-width:500px">
    <h3>↩ Restore from Snapshot</h3>
    <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:10px">Restoring: <strong>${escHtml(filename)}</strong></p>
    <p style="font-size:var(--fs-sm);margin-bottom:8px">Select areas to restore <span style="color:var(--text-dim)">(leave all unchecked to restore everything)</span>:</p>
    <div class="group-picker" style="margin-bottom:12px">
      ${areaOptions.map(a => `<label class="group-chip"><input type="checkbox" class="gb-restore-area-cb" value="${a.value}" style="margin-right:4px"> ${a.label}</label>`).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" id="btnConfirmGbRestore">↩ Restore</button>
      <button class="btn btn-secondary" onclick="closeModal('gbRestoreModal')">Cancel</button>
    </div>
  </div>`;
  // Use a simple modal approach - inject into DOM
  let overlay = document.getElementById('gbRestoreModal');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'gbRestoreModal';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="max-width:520px;padding:20px">${html}</div>`;
  document.body.appendChild(overlay);
  if (typeof _bindActions === 'function') _bindActions(overlay);
  // Toggle chip style
  overlay.querySelectorAll('.gb-restore-area-cb').forEach(cb => {
    cb.onchange = () => cb.closest('.group-chip').classList.toggle('selected', cb.checked);
  });

  document.getElementById('btnConfirmGbRestore').onclick = async () => {
    const areas = [...overlay.querySelectorAll('.gb-restore-area-cb:checked')].map(cb => cb.value);
    const areaDesc = areas.length ? areas.join(', ') : 'all areas';
    if (!confirm(`Restore ${areaDesc} from snapshot "${filename}"?\n\nThis will overwrite current data. A server restart is recommended after restore.`)) return;
    overlay.remove();
    const res = await api('POST', `/api/admin/gradual-backup/restore/${encodeURIComponent(filename)}`, {areas});
    if (res.ok) {
      const d = await res.json().catch(()=>({}));
      showNotification('success', d.message || 'Restored successfully');
    } else {
      const e = await res.json().catch(()=>({}));
      showError(e.error || 'Restore failed');
    }
  };
}

async function deleteGradualSnapshot(filename) {
  if (!confirm(`Delete snapshot "${filename}"? This cannot be undone.`)) return;
  const res = await apiDel(`/api/admin/gradual-backup/snapshots/${encodeURIComponent(filename)}`);
  if (res.ok) {
    showNotification('success', 'Snapshot deleted');
    await loadGradualBackupData();
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Delete failed');
  }
}

// ── Backup & Restore ──────────────────────────────────────────────────────────

function openBackupModal() {
  openModal('backupModal');
  const status = document.getElementById('restoreStatus');
  if (status) status.textContent = '';
}

function downloadBackup() {
  window.location.href = '/api/backup';
}

async function uploadRestore() {
  const fileEl = document.getElementById('restoreFile');
  const statusEl = document.getElementById('restoreStatus');
  if (!fileEl || !fileEl.files.length) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)">Please select a backup ZIP file first.</span>';
    return;
  }
  const areas = [...document.querySelectorAll('.restore-area-cb:checked')].map(cb => cb.value);
  const areaDesc = areas.length ? areas.join(', ') : 'all areas';
  if (!confirm(`Are you sure you want to restore ${areaDesc} from this backup? Current data will be overwritten. A server restart is required after restore.`)) return;

  const formData = new FormData();
  formData.append('backup', fileEl.files[0]);
  if (areas.length) formData.append('areas', areas.join(','));

  try {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-dim)">Uploading and restoring…</span>';
    const res = await fetch('/api/restore', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--success,#2ecc71)">✅ ${escHtml(data.message || 'Restored successfully')}</span>`;
      showNotification('success', 'Backup restored. Please restart the server.');
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--danger)">❌ ${escHtml(data.error || 'Restore failed')}</span>`;
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)">❌ Upload failed. Check server connection.</span>';
  }
}

// ── Planned vs. Actual Modal ──────────────────────────────────────────────────
