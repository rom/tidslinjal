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

