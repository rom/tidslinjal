/* ── SSE Connection ── */
// ── SSE ────────────────────────────────────────────────────────────────────

// ── SSE, Alarm ACK: connectSSE, unackedAlarms, showAlarmNotification, dismissAlarmNotif, ackAlarm ──
// ── SSE ────────────────────────────────────────────────────────────────────
let _sseConnection = null;
let _sseReconnectAttempts = 0;
function connectSSE() {
  if (_sseConnection) {
    _sseConnection.close();
    _sseConnection = null;
  }
  const es = new EventSource('/api/notifications/stream');
  _sseConnection = es;
  es.addEventListener('alarm', e => {
    const data = JSON.parse(e.data);
    playAlarmSound(data.sound || 'klaxon');
    showAlarmNotification(data, 0);
  });
  // Listen for event changes from other users
  let _sseRefreshTimer = null;
  es.addEventListener('event_change', e => {
    const data = JSON.parse(e.data);
    if (data.action === 'deleted' || data.action === 'created' || data.action === 'updated' || data.action === 'status_changed') {
      // Debounce SSE-triggered refreshes: batch rapid events into one refresh
      if (_sseRefreshTimer) clearTimeout(_sseRefreshTimer);
      _sseRefreshTimer = setTimeout(() => { _sseRefreshTimer = null; refreshAll(); }, 300);
      // Record to event log
      _eventLogEntries.push({ timestamp: new Date().toISOString(), source: 'sse', message: `${data.action}: ${data.title||'event #'+data.id}`, summary: data.user_name ? `by ${data.user_name}` : '' });
      // Browser push notification for event changes by others
      if (Notification.permission === 'granted' && state.preferences.push_event_changes !== false && data.user_id !== (state.user && state.user.id)) {
        const actionLabel = { created: 'New event', updated: 'Event updated', deleted: 'Event deleted', status_changed: 'Event status changed' }[data.action] || data.action;
        const title = data.title ? `${actionLabel}: ${data.title}` : actionLabel;
        const body  = data.user_name ? `by ${data.user_name}` : '';
        try { new Notification('Tidslinjal', { body: body ? `${title}\n${body}` : title, icon: '/static/favicon.ico', tag: `event-${data.id}-${data.action}` }); } catch { /* ignore */ }
      }
    }
  });
  // Listen for collaborative editing lock events
  es.addEventListener('editing_lock', e => {
    try {
      const data = JSON.parse(e.data);
      if (window._handleEditingLockEvent) window._handleEditingLockEvent(data);
    } catch { /* ignore parse errors */ }
  });
  // Listen for user changes (role updates, vetting, block/unblock)
  es.addEventListener('user_change', async e => {
    try {
      const data = JSON.parse(e.data);
      // Refresh current user info if it was the affected user
      if (state.user && data.user_id === state.user.id) {
        try {
          const me = await apiGet('/api/auth/me');
          if (me) {
            state.user = me;
            if (typeof applyRoleGatedUI === 'function') applyRoleGatedUI();
          }
        } catch { /* ignore — may have been blocked */ }
      }
      // Refresh user list for everyone
      try {
        const users = await apiGet('/api/users');
        if (users) state.users = users;
      } catch { /* ignore */ }
      renderSidebar();
    } catch { /* ignore parse errors */ }
  });
  // Key Terrain Board changes — dispatch custom event for key-terrain.js to handle
  es.addEventListener('key_terrain_change', () => {
    document.dispatchEvent(new CustomEvent('sse:key_terrain_change'));
  });
  // Log changes (log_book, event_log, checklist_log, audit_log, pollster_log)
  es.addEventListener('log_change', (e) => {
    try {
      const data = JSON.parse(e.data);
      document.dispatchEvent(new CustomEvent('sse:log_change', { detail: data }));
      // Auto-refresh the log views if they're currently displayed
      if (data.type === 'log_book' && typeof _loadLogBook === 'function') _loadLogBook();
      if (data.type === 'event_log' && typeof _loadEventLog === 'function') _loadEventLog();
      if (data.type === 'checklist_log' && typeof _loadChecklistLog === 'function') _loadChecklistLog();
      if (data.type === 'audit_log' && typeof renderSidebar === 'function') renderSidebar();
    } catch {}
  });
  // Day labels change
  es.addEventListener('day_labels_change', async () => {
    await fetchDayLabels();
    renderTimeline();
  });
  // Personal notification
  es.addEventListener('personal_notification', e => {
    try {
      const data = JSON.parse(e.data);
      // Play bell sound
      _playNotifBellSound();
      // Browser notification
      if (Notification.permission === 'granted') {
        try { new Notification('Tidslinjal', { body: `${data.title}\n${data.body}`, icon: '/static/favicon.ico', tag: `notif-${data.id}` }); } catch {}
      }
      // Toast — for polls, make it clickable to open the poll modal
      if (data.type === 'poll') {
        showNotification('info', `📊 ${data.title}: ${data.body}`, 8000);
        // Auto-open poll modal so the user can respond immediately
        setTimeout(() => { if (typeof openPollModal === 'function') openPollModal({hideCreate: true}); }, 500);
      } else {
        showNotification('info', `${data.title}: ${data.body}`);
      }
      // Update badge
      _notifUnreadCount++;
      _updateNotifBadge();
      // If panel is open, re-render
      if (_notifPanelOpen) _renderNotifPanel();
    } catch {}
  });
  // Person Ready Check popup — show modal for participants
  es.addEventListener('prc_new_check', e => {
    try {
      const data = JSON.parse(e.data);
      if (!state.user) return;
      const me = (data.participants || []).find(p => p.user_id === state.user.id);
      if (!me || me.status !== 'pending') return;
      _showPRCPopup(data);
    } catch {}
  });
  es.addEventListener('prc_update', e => {
    try {
      const data = JSON.parse(e.data);
      // If there's an open PRC popup for this check, refresh it
      const popup = document.getElementById('prcPopup_' + data.id);
      if (popup) {
        const me = (data.participants || []).find(p => p.user_id === state.user.id);
        if (me && me.status !== 'pending') {
          popup.remove(); // Already responded
        }
      }
      // If the person ready check modal is open, live-update it
      const prcModal = document.getElementById('personReadyCheckBody');
      if (prcModal) {
        const container = prcModal.querySelector('#prcActiveChecks');
        if (container) {
          // Re-load and re-render the active checks
          _loadPersonReadyChecks(prcModal.closest('.modal-overlay'));
        }
      }
    } catch {}
  });
  // Poll response/update — live-refresh the poll modal if it's open
  es.addEventListener('poll_update', e => {
    try {
      const pollModal = document.querySelector('.poll-respond-form, .poll-close-btn, #pollActiveList');
      if (pollModal) {
        const modal = pollModal.closest('.modal-overlay');
        if (modal) _loadPolls(modal);
      }
    } catch {}
  });
  es.addEventListener('poll_closed', e => {
    try {
      const pollModal = document.querySelector('.poll-respond-form, .poll-close-btn, #pollActiveList');
      if (pollModal) {
        const modal = pollModal.closest('.modal-overlay');
        if (modal) _loadPolls(modal);
      }
    } catch {}
  });
  es.addEventListener('poll_new', e => {
    try {
      const pollModal = document.querySelector('#pollActiveList');
      if (pollModal) {
        const modal = pollModal.closest('.modal-overlay');
        if (modal) _loadPolls(modal);
      }
    } catch {}
  });
  // Decision assignment notification
  es.addEventListener('decision_assigned', e => {
    try {
      const data = JSON.parse(e.data);
      if (data.executor_id === state.user?.id) {
        showNotification('info', `${t('decision_executor')||'Decision assigned'}: ${data.title || data.sequence_number} (${t('lb_action')||'by'} ${data.assigned_by})`);
        if (Notification.permission === 'granted') {
          try { new Notification('Tidslinjal', { body: `${data.title || data.sequence_number}\n${t('decision_executor')||'Assigned by'}: ${data.assigned_by}`, icon: '/static/favicon.ico' }); } catch {}
        }
      }
      _refreshDecisionLogIfOpen();
    } catch {}
  });
  // Quick response from TeamLead — show flash notification
  es.addEventListener('teamlead_quick_response', e => {
    try {
      const data = JSON.parse(e.data);
      _showFlashAlert(data);
    } catch {}
  });
  // Decision escalated — show flash notification + live-update decision log modal
  es.addEventListener('decision_escalated', e => {
    try {
      const data = JSON.parse(e.data);
      _showFlashAlert(data);
      _refreshDecisionLogIfOpen();
    } catch {}
  });
  // Decision outcome (approved/denied) — live-update decision log modal + teamlead toolbox
  es.addEventListener('decision_outcome', e => {
    try {
      const data = JSON.parse(e.data);
      _refreshDecisionLogIfOpen();
      // If I am the original requester, refresh my escalated decisions panel
      if (data.requester_id === state.user?.id) {
        if (typeof _refreshTlEscalationsIfOpen === 'function') _refreshTlEscalationsIfOpen();
        // Show a notification about the outcome
        const outcomeText = data.outcome === 'approved'
          ? (data.approval_type === 'approved_with_condition' ? (t('decision_approved_condition_label')||'Approved with condition')
            : data.approval_type === 'approved_with_modification' ? (t('decision_approved_modification_label')||'Approved with modification')
            : (t('decision_approved_label')||'Approved'))
          : (t('decision_filter_denied')||'Denied');
        const msg = `${t('tl_decision_outcome_received')||'Decision outcome'}: ${data.title || data.sequence_number} — ${outcomeText} (${data.decided_by})`;
        showNotification(data.outcome === 'approved' ? 'success' : 'error', msg);
      }
    } catch {}
  });
  // Quick report received
  es.addEventListener('quick_report', e => {
    try {
      const data = JSON.parse(e.data);
      _showFlashAlert(data);
    } catch {}
  });
  es.onopen = () => { _sseReconnectAttempts = 0; };
  es.onerror = () => {
    if (_sseConnection === es) {
      _sseConnection = null;
      es.close();
    }
    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, max 30s
    const baseDelay = Math.min(1000 * Math.pow(2, _sseReconnectAttempts), 30000);
    const jitter = Math.random() * 1000;
    _sseReconnectAttempts++;
    setTimeout(connectSSE, baseDelay + jitter);
  };
}

// ── Flash Alert for quick response / escalation / quick report ──
function _showFlashAlert(data) {
  const type = data.type || 'notification';
  const priority = data.priority || 'high';
  const from = data.from_user || '';
  const role = data.from_role || '';
  const message = data.message || data.title || data.subject || '';
  const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}) : '';

  // Color based on type/priority
  const colors = {
    quick_response: { bg: '#E74C3C', border: '#C0392B', icon: '🚨' },
    escalate_decision: { bg: '#E67E22', border: '#D35400', icon: '⬆' },
    quick_report: { bg: '#3498DB', border: '#2980B9', icon: '📋' },
  };
  const c = colors[type] || colors.quick_response;
  const isCritical = priority === 'critical';
  if (isCritical) { c.bg = '#8B0000'; c.border = '#5C0000'; c.icon = '🚨🔴🚨'; }

  const typeLabels = {
    quick_response: t('tl_quick_response') || 'Quick Response needed!',
    escalate_decision: t('tl_escalate_decision') || 'Decision needed — Escalated',
    quick_report: t('tl_quick_report') || 'Quick Report',
  };
  const typeLabel = typeLabels[type] || type;
  const modalWidth = isCritical ? 'max-width:620px' : 'max-width:500px';
  const modalPadding = isCritical ? 'padding:32px 40px' : 'padding:24px 32px';
  const iconSize = isCritical ? 'font-size:48px;margin-bottom:12px' : 'font-size:32px;margin-bottom:8px';
  const titleSize = isCritical ? 'font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:2px' : 'font-size:18px;font-weight:700';
  const borderWidth = isCritical ? '4px' : '3px';
  const priorityBadge = isCritical
    ? `<div style="display:inline-block;background:#fff;color:#8B0000;font-size:11px;font-weight:900;padding:2px 10px;border-radius:4px;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">CRITICAL PRIORITY</div>`
    : '';

  // Create flash overlay
  const overlay = document.createElement('div');
  overlay.className = 'flash-alert-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,' + (isCritical ? '.7' : '.5') + ');z-index:99999;display:flex;align-items:center;justify-content:center;animation:flashPulse 0.5s ease-in-out';

  overlay.innerHTML = `
    <div style="background:${c.bg};color:#fff;border:${borderWidth} solid ${c.border};border-radius:12px;${modalPadding};${modalWidth};width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:flashBounce 0.4s ease-out">
      <div style="${iconSize}">${c.icon}</div>
      ${priorityBadge}
      <div style="${titleSize};margin-bottom:8px">${escHtml(typeLabel)}</div>
      <div style="font-size:14px;margin-bottom:12px;line-height:1.6">${escHtml(message)}</div>
      <div style="font-size:12px;opacity:.8;margin-bottom:16px">${t('from')||'From'}: <strong>${escHtml(from)}</strong>${role ? ' (' + escHtml(role) + ')' : ''} ${timestamp ? '· ' + timestamp : ''}</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        ${type === 'escalate_decision' ? `<button style="background:rgba(255,255,255,.9);color:#333;border:2px solid rgba(255,255,255,.8);padding:8px 24px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600" class="flash-decision-tool-btn">📋 ${t('decision_tool')||'Decision Tool'}</button>` : ''}
        <button style="background:rgba(255,255,255,.25);color:#fff;border:2px solid rgba(255,255,255,.5);padding:8px 24px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600" class="flash-dismiss-btn">${t('flash_acknowledge')||'Acknowledge'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Play different sound based on priority
  if (isCritical) {
    playAlarmSound('klaxon');
  } else {
    playAlarmSound('alert');
  }

  // Auto-dismiss after 15 seconds
  const timer = setTimeout(() => overlay.remove(), 15000);
  overlay.querySelector('.flash-dismiss-btn').addEventListener('click', () => {
    clearTimeout(timer);
    overlay.remove();
  });
  const decisionToolBtn = overlay.querySelector('.flash-decision-tool-btn');
  if (decisionToolBtn) {
    decisionToolBtn.addEventListener('click', () => {
      clearTimeout(timer);
      overlay.remove();
      if (typeof openDecisionLogModal === 'function') openDecisionLogModal();
    });
  }
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { clearTimeout(timer); overlay.remove(); }
  });

  // Browser notification
  if (Notification.permission === 'granted') {
    try { new Notification('Tidslinjal — ' + typeLabel, { body: message + (from ? '\n' + (t('from')||'From') + ': ' + from : ''), icon: '/static/favicon.ico' }); } catch {}
  }

  // Add CSS animation if not present
  if (!document.getElementById('flashAlertStyles')) {
    const style = document.createElement('style');
    style.id = 'flashAlertStyles';
    style.textContent = `@keyframes flashPulse { 0% { opacity:0 } 100% { opacity:1 } }
      @keyframes flashBounce { 0% { transform:scale(.8);opacity:0 } 50% { transform:scale(1.05) } 100% { transform:scale(1);opacity:1 } }`;
    document.head.appendChild(style);
  }
}

