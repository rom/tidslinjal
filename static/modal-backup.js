/* ── Backup Settings & Restore ── */
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
  if (maxSnaps) maxSnaps.value = cfg.max_snapshots || 48;
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
  const max = parseInt(document.getElementById('gbMaxSnapshots')?.value||'48', 10);
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
  if (!confirm(`Restore from snapshot "${filename}"?\n\nThis will overwrite current data. A server restart is recommended after restore.`)) return;
  const res = await api('POST', `/api/admin/gradual-backup/restore/${encodeURIComponent(filename)}`, {});
  if (res.ok) {
    const d = await res.json().catch(()=>({}));
    showNotification('success', d.message || 'Restored successfully');
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Restore failed');
  }
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
  if (!confirm('Are you sure you want to restore from this backup? Current data will be overwritten. A server restart is required after restore.')) return;

  const formData = new FormData();
  formData.append('backup', fileEl.files[0]);

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

