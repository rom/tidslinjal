'use strict';
const opener = window.opener;
let _t = {};

const typeIcons = {
  event_started: '📌', decision_requested: '❓', decision_approved: '✅',
  decision_rejected: '❌', decision_: '⚖', audit_created: '➕',
  audit_updated: '✏', audit_deleted: '🗑', audit_status_changed: '🔄',
  audit_login: '🔑', audit_co_signed: '👁',
};
const severityColors = {info:'var(--text-dim)', warning:'#E67E22', critical:'#E74C3C'};

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function t(key) {
  return _t[key] || key;
}

async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    // Show inline error instead of redirect so popup stays visible
    const el = document.getElementById('narrativeEntries');
    if (el) el.innerHTML = '<div class="nr-empty">Session expired. Please <a href="/login" target="_top">log in</a> again.</div>';
    throw new Error('unauth');
  }
  return res;
}

function getOpener() {
  try { return window.opener && !window.opener.closed ? window.opener : null; } catch(e) { return null; }
}

function initFromOpener() {
  var op = getOpener();
  if (!op || !op.state) return false;
  try {
    const s = op.state;
    if (op.TRANSLATIONS) {
      const lang = s.preferences?.language || 'en';
      _t = op.TRANSLATIONS[lang] || op.TRANSLATIONS.en || {};
    }
    const theme = s.preferences?.theme || 'dark';
    document.body.className = 'theme-' + theme;
    return true;
  } catch(e) {
    return false;
  }
}

async function initFromAPI() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      console.warn('Narrative popup: auth check failed, status', res.status);
      // Still try to apply defaults
      if (typeof TRANSLATIONS !== 'undefined') {
        _t = TRANSLATIONS.en || {};
      }
      return false;
    }
    const prefRes = await fetch('/api/preferences').catch(() => null);
    if (prefRes && prefRes.ok) {
      const prefs = await prefRes.json();
      if (prefs) {
        const theme = prefs.theme || 'dark';
        document.body.className = 'theme-' + theme;
        const lang = prefs.language || 'en';
        if (typeof TRANSLATIONS !== 'undefined') {
          _t = TRANSLATIONS[lang] || TRANSLATIONS.en || {};
        }
      }
    } else if (typeof TRANSLATIONS !== 'undefined') {
      _t = TRANSLATIONS.en || {};
    }
    return true;
  } catch(e) {
    console.warn('Narrative popup initFromAPI error:', e);
    if (typeof TRANSLATIONS !== 'undefined') {
      _t = TRANSLATIONS.en || {};
    }
    return false;
  }
}

function _loadI18nScript() {
  return new Promise(function(resolve) {
    if (typeof TRANSLATIONS !== 'undefined') { resolve(); return; }
    var s = document.createElement('script');
    s.src = '/static/i18n.js';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}

function applyI18n() {
  const el = (id, key, fallback) => {
    const e = document.getElementById(id);
    if (e) e.textContent = _t[key] || fallback || key;
  };
  el('nrHeaderTitle', 'narrative_title', '📰 Tidslinjal — Narrative');
  const hdr = document.getElementById('nrHeaderTitle');
  if (hdr && _t.narrative_title) hdr.textContent = '📰 Tidslinjal — ' + _t.narrative_title;
  el('lblRefresh', 'btn_refresh', 'Refresh');
  el('lblRefresh2', 'btn_refresh', 'Refresh');
  el('lblFrom', 'from', 'From');
  el('lblTo', 'to', 'To');
  el('lblDetail', 'detail_level', 'Detail level');
  el('lblAutoscroll', 'autoscroll', 'Autoscroll');
  el('lblSortOrder', 'narrative_sort_order', 'Order');
  el('optNewest', 'narrative_sort_newest', 'Newest first');
  el('optOldest', 'narrative_sort_oldest', 'Oldest first');
}

// Set default date range (last 24h)
function initDateRange() {
  const now = new Date();
  const from = new Date(now.getTime() - 24*60*60*1000);
  document.getElementById('nrFrom').value = from.toISOString().slice(0,16);
  document.getElementById('nrTo').value = now.toISOString().slice(0,16);
}

async function loadEntries() {
  const fromEl = document.getElementById('nrFrom');
  const toEl = document.getElementById('nrTo');
  const catEl = document.getElementById('nrCategory');
  const from = fromEl.value ? new Date(fromEl.value).toISOString() : new Date(Date.now()-24*60*60*1000).toISOString();
  const to = toEl.value ? new Date(toEl.value).toISOString() : new Date().toISOString();
  const category = catEl.value || 'all';
  let url = '/api/narrative?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&limit=200';
  if (category !== 'all') url += '&category=' + encodeURIComponent(category);
  try {
    const res = await api('GET', url);
    if (res.ok) {
      const entries = await res.json() || [];
      render(entries);
    }
  } catch(e) {
    console.warn('Narrative fetch error', e);
  }
}

function render(entries) {
  const el = document.getElementById('narrativeEntries');
  if (!entries || !entries.length) {
    el.innerHTML = '<div class="nr-empty">' + escHtml(_t.narrative_empty || 'No events in this time range.') + '</div>';
    return;
  }
  const sortEl = document.getElementById('nrSortOrder');
  const newestFirst = sortEl ? sortEl.value === 'newest' : true;
  const sorted = entries.slice().sort(function(a, b) {
    var ta = new Date(a.timestamp).getTime();
    var tb = new Date(b.timestamp).getTime();
    return newestFirst ? (tb - ta) : (ta - tb);
  });
  el.innerHTML = sorted.map(e => {
    const timeStr = new Date(e.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
    const severityColor = severityColors[e.severity] || 'var(--text-dim)';
    let icon = '•';
    for (const [prefix, ic] of Object.entries(typeIcons)) {
      if (e.type && e.type.startsWith(prefix)) { icon = ic; break; }
    }
    return '<div class="nr-entry">' +
      '<span class="nr-entry-time" style="color:' + severityColor + '">' + timeStr + '</span>' +
      '<span class="nr-entry-icon">' + icon + '</span>' +
      '<div class="nr-entry-body">' +
        '<span style="color:var(--text)">' + escHtml(e.summary || '') + '</span>' +
        (e.user_name ? '<span class="nr-entry-user">— ' + escHtml(e.user_name) + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  // Autoscroll — stay at top
  if (document.getElementById('nrAutoscroll').checked) {
    el.scrollTop = 0;
  }
}

// Bind refresh buttons
document.getElementById('btnToolbarRefresh').onclick = loadEntries;
document.getElementById('btnFilterRefresh').onclick = loadEntries;
document.getElementById('nrSortOrder').onchange = loadEntries;

// Listen for theme changes from parent (validate origin to prevent cross-origin attacks)
window.addEventListener('message', function(e) {
  if (e.origin !== window.location.origin) return;
  if (e.data && e.data.type === 'theme') {
    document.body.className = 'theme-' + (e.data.theme || 'dark');
  }
});

// BroadcastChannel theme sync (works even if opener is lost)
try {
  var _nrBC = new BroadcastChannel('tidslinjal-sync');
  _nrBC.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      document.body.className = 'theme-' + (e.data.theme || 'dark');
    }
  };
} catch(e) {}

// Auto-refresh every 10 seconds
setInterval(loadEntries, 10000);

// Periodic theme sync from opener
setInterval(function() {
  var op = getOpener();
  if (op && op.state && op.state.preferences) {
    var theme = op.state.preferences.theme || 'dark';
    if (document.body.className !== 'theme-' + theme) {
      document.body.className = 'theme-' + theme;
    }
  }
}, 3000);

// SSE: listen for relevant events and re-fetch
try {
  var _nrSSE = new EventSource('/api/events');
  _nrSSE.onmessage = function(ev) {
    try {
      var data = JSON.parse(ev.data);
      if (data.type && (
        data.type.startsWith('event_') ||
        data.type.startsWith('decision_') ||
        data.type.startsWith('audit_') ||
        data.type === 'narrative_update' ||
        data.type === 'refresh'
      )) {
        loadEntries();
      }
    } catch(e) {}
  };
  _nrSSE.onerror = function() {
    // EventSource will auto-reconnect
  };
} catch(e) {}

// Init: try opener first, always fall back to API for auth if needed
(async () => {
  initDateRange();
  // Always load i18n script first so translations are available
  await _loadI18nScript();
  var gotOpener = initFromOpener();
  if (!gotOpener) {
    await initFromAPI();
  }
  // Apply translations after everything is loaded
  if (typeof TRANSLATIONS !== 'undefined' && Object.keys(_t).length === 0) {
    // If _t is still empty, pick a default language
    _t = TRANSLATIONS.en || {};
  }
  applyI18n();
  // Always try to load entries
  try {
    await loadEntries();
  } catch(e) {
    console.warn('Initial narrative load failed:', e);
    // Show a message instead of blank screen
    const el = document.getElementById('narrativeEntries');
    if (el && !el.innerHTML.trim()) {
      el.innerHTML = '<div class="nr-empty">Unable to load narrative entries. Please ensure you are logged in.</div>';
    }
  }
})();
