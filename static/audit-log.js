/* ── Audit Log Display, Export ── */
// ── Audit Log ─────────────────────────────────────────────────────────────
async function refreshAuditLog() {
  const container = document.getElementById('auditLog');
  if (!container) return;
  const search     = document.getElementById('auditSearch')?.value?.trim() || '';
  const action     = document.getElementById('auditFilterAction')?.value || '';
  const dateFrom   = document.getElementById('auditDateFrom')?.value || '';
  const dateTo     = document.getElementById('auditDateTo')?.value || '';
  let url = '/api/audit?limit=500';
  if (search)   url += `&search=${encodeURIComponent(search)}`;
  if (action)   url += `&action=${encodeURIComponent(action)}`;
  if (dateFrom) url += `&date_from=${encodeURIComponent(dateFrom)}`;
  if (dateTo)   url += `&date_to=${encodeURIComponent(dateTo)}`;
  container.innerHTML = `<em style="color:var(--text-dim)">Loading…</em>`;
  const entries = await apiGet(url);
  if (!entries || entries.length === 0) {
    container.innerHTML = `<em style="color:var(--text-dim)">${t('audit_empty')||'No entries found.'}</em>`;
    return;
  }
  const _auditActionLabels = {
    created: t('audit_created')||'Created', updated: t('audit_updated')||'Updated',
    deleted: t('audit_deleted')||'Deleted', status_changed: t('audit_status_changed')||'Status Changed',
    login: t('audit_login')||'Login', login_failed: t('audit_login_failed')||'Login Failed',
    login_blocked: t('audit_login_blocked')||'Login Blocked', reset: t('audit_reset')||'Reset',
    verified: t('audit_verified')||'Verified', rejected: t('audit_rejected')||'Rejected',
    blocked: t('audit_user_blocked')||'User Blocked', unblocked: t('audit_user_unblocked')||'User Unblocked',
    acknowledged: t('audit_acknowledged')||'Acknowledged',
  };
  container.innerHTML = `<div class="audit-list">${entries.map(e => `
    <div class="audit-item">
      <span class="audit-ts">${fmtDateTime(new Date(e.timestamp))}</span>
      <span class="audit-user">${escHtml(e.user_name)}</span>
      <span class="audit-action audit-action-${e.action}">${escHtml(_auditActionLabels[e.action] || e.action)}</span>
      <span class="audit-summary">${escHtml(e.summary)}</span>
    </div>`).join('')}
  </div>`;
}

function exportAuditLog(format) {
  format = format || 'csv';
  const search     = document.getElementById('auditSearch')?.value?.trim() || '';
  const action     = document.getElementById('auditFilterAction')?.value || '';
  const dateFrom   = document.getElementById('auditDateFrom')?.value || '';
  const dateTo     = document.getElementById('auditDateTo')?.value || '';
  let url = `/api/audit?limit=5000&format=${encodeURIComponent(format)}`;
  if (search)   url += `&search=${encodeURIComponent(search)}`;
  if (action)   url += `&action=${encodeURIComponent(action)}`;
  if (dateFrom) url += `&date_from=${encodeURIComponent(dateFrom)}`;
  if (dateTo)   url += `&date_to=${encodeURIComponent(dateTo)}`;
  const ext = format === 'docx' ? 'docx' : format;
  const a = document.createElement('a');
  a.href = url;
  const _auditTs = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const _auditHost = window.location.hostname || 'localhost';
  a.download = `${_auditTs}-${_auditHost}-audit-log.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Push Notification Permission ──────────────────────────────────────────
async function requestPushPermission() {
  if (!('Notification' in window)) {
    showError('Browser notifications are not supported in this browser.', 'Push Notifications');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    showNotification('success', 'Browser notifications enabled');
    // Re-render settings to update status display
    if (state.sidebarTab === 'settings') renderSidebar();
  } else if (result === 'denied') {
    showError('Notifications blocked. Please allow them in your browser settings and reload.', 'Push Notifications');
  }
}

