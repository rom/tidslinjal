/* ── Personal Notifications ── */
// ── Personal Notifications ─────────────────────────────────────────────────
let _notifUnreadCount = 0;
let _notifPanelOpen = false;
let _notifCache = [];

function _playNotifBellSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    // Two-tone bell chime
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1100;
      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.31);
    }
    setTimeout(() => ctx.close(), 2000);
  } catch {}
}

function _updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (_notifUnreadCount > 0) {
    badge.textContent = _notifUnreadCount > 99 ? '99+' : _notifUnreadCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

async function _loadNotifications() {
  try {
    const data = await apiGet('/api/personal-notifications');
    if (data) {
      _notifCache = data;
      _notifUnreadCount = data.filter(n => !n.read).length;
      _updateNotifBadge();
    }
  } catch {}
}

function _formatNotifTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _renderNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;

  const typeIcons = { event: '📋', prc: '✅', alarm: '⏰', timer: '⏱', system: '🔧' };

  let html = '<div class="notif-panel-header"><span>Notifications</span></div>';
  if (_notifCache.length === 0) {
    html += '<div class="notif-empty">No notifications</div>';
  } else {
    for (const n of _notifCache) {
      const icon = typeIcons[n.type] || '🔔';
      const unreadClass = n.read ? '' : ' unread';
      const ackBtn = n.acknowledged ? '' :
        `<div class="notif-item-actions"><button class="notif-ack-btn" data-action="_ackNotification" data-arg="${n.id}" data-stop-prop>Acknowledge</button></div>`;
      html += `<div class="notif-item${unreadClass}" data-notif-id="${n.id}">
        <div class="notif-item-title">${icon} ${escHtml(n.title)}</div>
        <div class="notif-item-body">${escHtml(n.body)}</div>
        <div class="notif-item-time">${_formatNotifTime(n.created_at)}</div>
        ${ackBtn}
      </div>`;
    }
  }
  panel.innerHTML = html;
  _bindActions(panel);
}

function _toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  _notifPanelOpen = !_notifPanelOpen;
  if (_notifPanelOpen) {
    _loadNotifications().then(() => _renderNotifPanel());
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

async function _ackNotification(id) {
  try {
    await apiPost(`/api/personal-notifications/${id}/ack`, {});
    // Update cache
    for (const n of _notifCache) {
      if (n.id === id) {
        n.acknowledged = true;
        n.read = true;
        break;
      }
    }
    _notifUnreadCount = _notifCache.filter(n => !n.read).length;
    _updateNotifBadge();
    _renderNotifPanel();
  } catch {}
}

// Init: wire up button click and load initial data
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnNotifications');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleNotifPanel();
    });
  }
  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (_notifPanelOpen) {
      const panel = document.getElementById('notifPanel');
      const btn = document.getElementById('btnNotifications');
      if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
        _notifPanelOpen = false;
        panel.style.display = 'none';
      }
    }
  });
  // Load notifications on page load (after a short delay to let auth settle)
  setTimeout(() => _loadNotifications(), 1500);
});
