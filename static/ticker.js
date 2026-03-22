/* ── Narrative Ticker ─────────────────────────────────────────────────────── */
'use strict';

let _tickerTimer = null;
let _tickerEntries = [];

function initTicker() {
  const p = state.preferences || {};
  const enabled = p.ticker_enabled;
  const tickerEl = document.getElementById('narrativeTicker');
  if (!tickerEl) return;
  if (!enabled) {
    tickerEl.style.display = 'none';
    document.body.classList.remove('ticker-active');
    if (_tickerTimer) { clearInterval(_tickerTimer); _tickerTimer = null; }
    return;
  }
  tickerEl.style.display = '';
  document.body.classList.add('ticker-active');
  _refreshTicker();
  // Refresh every 30 seconds
  if (_tickerTimer) clearInterval(_tickerTimer);
  _tickerTimer = setInterval(_refreshTicker, 30000);
  // Also refresh on SSE events
  if (typeof _sseConnection !== 'undefined' && _sseConnection) {
    ['event_change', 'decision_new', 'decision_update', 'poll_new', 'poll_update'].forEach(function(evName) {
      _sseConnection.addEventListener(evName, _refreshTicker);
    });
  }
}

async function _refreshTicker() {
  const p = state.preferences || {};
  const count = p.ticker_count || 10;
  const tickerEl = document.getElementById('narrativeTicker');
  const trackEl = document.getElementById('narrativeTickerTrack');
  if (!tickerEl || !trackEl) return;
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const entries = await apiGet('/api/narrative?from=' + from.toISOString() + '&to=' + now.toISOString() + '&limit=' + count) || [];
    if (entries.length === 0) {
      trackEl.innerHTML = '<span class="ticker-item" style="color:var(--text-dim)">No recent events</span>';
      return;
    }
    _tickerEntries = entries;
    // Sort newest first
    entries.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    const typeIcons = {
      event_started: '\u{1F4CC}', decision_requested: '\u2753', decision_approved: '\u2705',
      decision_rejected: '\u274C', decision_: '\u2696', audit_created: '\u2795',
      audit_updated: '\u270F', audit_deleted: '\u{1F5D1}', audit_status_changed: '\u{1F504}',
      audit_login: '\u{1F511}', audit_co_signed: '\u{1F441}',
    };
    const severityColors = { info: 'var(--text-dim)', warning: '#E67E22', critical: '#E74C3C' };
    // Build ticker items (duplicate them for seamless loop)
    var items = entries.map(function(e) {
      var d = new Date(e.timestamp);
      var timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      var icon = '\u2022';
      for (var prefix in typeIcons) {
        if (e.type && e.type.startsWith(prefix)) { icon = typeIcons[prefix]; break; }
      }
      var col = severityColors[e.severity] || 'var(--text-dim)';
      var isCrit = e.severity === 'critical';
      var sumText = escHtml(e.summary || '');
      if (isCrit) sumText = '<strong style="text-transform:uppercase">' + sumText + '</strong>';
      return '<span class="ticker-item"' + (isCrit ? ' style="font-weight:700"' : '') + '>' +
        '<span class="ticker-time" style="color:' + col + '">' + timeStr + '</span>' +
        '<span class="ticker-icon">' + icon + '</span>' +
        '<span>' + sumText + '</span>' +
        (e.user_name ? '<span style="color:var(--text-dim)">— ' + escHtml(e.user_name) + '</span>' : '') +
        '</span><span class="ticker-sep">|</span>';
    }).join('');
    // Duplicate for seamless scroll loop
    trackEl.innerHTML = items + items;
    // Adjust animation speed based on content width
    var totalWidth = trackEl.scrollWidth / 2;
    var speed = Math.max(30, totalWidth / 80); // ~80px per second
    trackEl.style.animationDuration = speed + 's';
  } catch (e) {
    // Silent fail
  }
}

// Pause ticker on hover
document.addEventListener('DOMContentLoaded', function() {
  var tickerEl = document.getElementById('narrativeTicker');
  if (tickerEl) {
    tickerEl.addEventListener('mouseenter', function() {
      var track = document.getElementById('narrativeTickerTrack');
      if (track) track.style.animationPlayState = 'paused';
    });
    tickerEl.addEventListener('mouseleave', function() {
      var track = document.getElementById('narrativeTickerTrack');
      if (track) track.style.animationPlayState = 'running';
    });
  }
});
