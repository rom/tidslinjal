/* ── Alarm Acknowledgement ── */
// ── Alarm ACK ──────────────────────────────────────────────────────────────
const unackedAlarms = new Map(); // alarmID → {data, level, timerID, element}

function showAlarmNotification(data, level) {
  // Clear any existing notification for this alarm
  const existing = unackedAlarms.get(data.alarm_id);
  if (existing) {
    clearTimeout(existing.timerID);
    clearInterval(existing.counterID);
    if (existing.element && existing.element.parentNode) existing.element.remove();
  }

  const area = document.getElementById('notification-area');
  const el   = document.createElement('div');
  el.className = `notification alarm alarm-level-${Math.min(level, 2)}`;

  const warnings = level > 0 ? ' ' + '⚠️'.repeat(Math.min(level, 3)) : '';
  const shownAt  = Date.now();
  // Check if event has a meeting URL
  const meetingURL = data.meeting_url || data.contact_url || '';
  const hasMeeting = meetingURL && (meetingURL.startsWith('http://') || meetingURL.startsWith('https://') || meetingURL.startsWith('sip:') || meetingURL.startsWith('tel:'));
  el.innerHTML = `
    <div class="notification-title">${t('notif_alarm_title')}${escHtml(warnings)}</div>
    <div class="notification-msg">${escHtml(data.message)}</div>
    <div class="alarm-since" style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">⏱ 0s ago</div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm notification-close-btn alarm-dismiss-btn">${t('alarm_dismiss')||'Dismiss'}</button>
      <button class="btn btn-secondary btn-sm alarm-show-event-btn">📋 Show event</button>
      ${hasMeeting ? `<a href="${escHtml(meetingURL)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none">${t('alarm_enter_meeting')}</a>` : ''}
      <button class="btn btn-primary btn-sm alarm-ack-btn">✓ ${t('alarm_ack')}</button>
    </div>
  `;
  el.querySelector('.alarm-dismiss-btn').addEventListener('click', () => dismissAlarmNotif(data.alarm_id));
  el.querySelector('.alarm-show-event-btn').addEventListener('click', () => openAlarmEvent(data.event_id));
  el.querySelector('.alarm-ack-btn').addEventListener('click', () => ackAlarm(data.alarm_id, el));
  area.appendChild(el);

  // Update "X seconds/minutes ago" counter every second
  const sinceEl = el.querySelector('.alarm-since');
  const counterID = setInterval(() => {
    if (!el.parentNode) { clearInterval(counterID); return; }
    const secs = Math.floor((Date.now() - shownAt) / 1000);
    if (secs < 60) {
      sinceEl.textContent = `⏱ ${secs}s ago`;
    } else {
      const mins = Math.floor(secs / 60);
      const rem  = secs % 60;
      sinceEl.textContent = `⏱ ${mins}m ${rem}s ago`;
    }
  }, 1000);

  // Browser notification on first fire
  if (level === 0 && Notification.permission === 'granted' && state.preferences.push_alarms !== false) {
    try { new Notification('Tidslinjal — ' + t('notif_alarm_title'), { body: data.message, icon: '/static/favicon.ico', tag: 'alarm-' + data.alarm_id }); } catch { /* ignore */ }
  }

  // Escalate after 60 s if not acked, as long as we're before the event time
  const eventTime = new Date(data.event_time);
  const timerID = (new Date() < eventTime)
    ? setTimeout(() => showAlarmNotification(data, level + 1), 60000)
    : null;

  unackedAlarms.set(data.alarm_id, {data, level, timerID, counterID, element: el});
}

function dismissAlarmNotif(alarmID) {
  const entry = unackedAlarms.get(alarmID);
  if (entry) {
    clearTimeout(entry.timerID);
    clearInterval(entry.counterID);
    unackedAlarms.delete(alarmID);
    if (entry.element && entry.element.parentNode) entry.element.remove();
  }
}

async function openAlarmEvent(eventId) {
  let ev = state.events.find(x => x.id === eventId);
  if (!ev) {
    // Event might not be in current view — fetch it
    const data = await apiGet(`/api/events/${eventId}`);
    if (data && data.id) ev = data;
  }
  if (ev) showEventDetail(ev);
}

async function ackAlarm(alarmID, notifEl) {
  try {
    const res = await apiPost(`/api/alarms/${alarmID}/ack`, {});
    if (res.ok) {
      dismissAlarmNotif(alarmID);
      if (notifEl && notifEl.parentNode) notifEl.remove();
      await fetchAlarms();
      renderSidebar();
      showNotification('success', t('alarm_acked')||'Alarm acknowledged');
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to acknowledge alarm');
    }
  } catch (e) {
    showError(e.message || 'Failed to acknowledge alarm');
  }
}

