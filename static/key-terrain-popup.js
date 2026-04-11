/* ── Key Terrain Board — Standalone Page Bootstrap ─────────────────────────── */
/* Makes key-terrain.js work as an independent page with its own URL,
   SSE connection, and theme sync — no dependency on window.opener. */
(function() {
'use strict';

// ── Theme sync via BroadcastChannel ────────────────────────────────────────
// Theme class names match main style.css:
//   dark  → no class (default, :root provides variables)
//   light → 'light-mode'
//   city-camo  → 'city-camo'
//   urban-camo → 'urban-camo'
var _themeClassMap = { 'light': 'light-mode', 'city-camo': 'city-camo', 'urban-camo': 'urban-camo' };
var _allThemeClasses = ['light-mode', 'city-camo', 'urban-camo'];

function applyTheme(theme) {
  var t = theme || 'dark';
  // Remove all theme classes, then add the correct one
  _allThemeClasses.forEach(function(c) { document.body.classList.remove(c); });
  var cls = _themeClassMap[t];
  if (cls) document.body.classList.add(cls);
  document.documentElement.setAttribute('data-theme', t);
}

// Try to read theme from opener, then default to dark (matches :root in style.css)
(function initTheme() {
  var theme = 'dark';
  try {
    var op = window.opener && !window.opener.closed ? window.opener : null;
    if (op && op.state && op.state.preferences) {
      theme = op.state.preferences.theme || 'dark';
    }
  } catch(e) {}
  applyTheme(theme);
})();

try {
  var _bc = new BroadcastChannel('tidslinjal-sync');
  _bc.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      applyTheme(e.data.theme);
      // Update state too so key-terrain.js sees the right theme
      if (window.state && window.state.preferences) {
        window.state.preferences.theme = e.data.theme;
      }
    }
  };
} catch(e) {}

// ── Override _boardModal for standalone rendering (no overlay) ──────────────
window._boardModal = function(id, content, width) {
  var root = document.getElementById('ktPageRoot');
  if (!root) return;
  var el = document.getElementById(id);
  if (el) el.remove();
  root.innerHTML = '<div id="' + id + '" style="max-width:' + (width||'100%') + ';margin:0 auto">' + content + '</div>';
  if (typeof _bindActions === 'function') _bindActions(root);
};

window._closeBoardModal = function(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
  // Re-render the board after closing a sub-modal
  if (typeof openKeyTerrainBoard === 'function') openKeyTerrainBoard();
};

// ── SSE connection (own connection, not forwarded from parent) ──────────────
var _sseConn = null;
var _sseReconnectTimer = null;
var _sseReconnectAttempts = 0;

function connectPopupSSE() {
  if (_sseConn) { _sseConn.close(); _sseConn = null; }
  try {
    _sseConn = new EventSource('/api/notifications/stream');
    _sseConn.addEventListener('key_terrain_change', function() {
      document.dispatchEvent(new CustomEvent('sse:key_terrain_change'));
    });
    _sseConn.onopen = function() { _sseReconnectAttempts = 0; };
    _sseConn.onerror = function() {
      _sseConn.close();
      _sseConn = null;
      // Reconnect with exponential backoff
      var delay = Math.min(30000, 1000 * Math.pow(2, _sseReconnectAttempts));
      _sseReconnectAttempts++;
      if (_sseReconnectTimer) clearTimeout(_sseReconnectTimer);
      _sseReconnectTimer = setTimeout(connectPopupSSE, delay);
    };
  } catch(e) {}
}

// ── URL bar ────────────────────────────────────────────────────────────────
function setupURLBar() {
  var urlInput = document.getElementById('ktPageURL');
  var copyBtn = document.getElementById('ktPageCopyURL');
  if (urlInput) urlInput.value = window.location.href;
  if (copyBtn && urlInput) {
    copyBtn.addEventListener('click', function() {
      urlInput.select();
      try { navigator.clipboard.writeText(urlInput.value); copyBtn.textContent = '\u2713'; }
      catch(e) { document.execCommand('copy'); copyBtn.textContent = '\u2713'; }
      setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
    });
  }
}

// ── Refresh button ─────────────────────────────────────────────────────────
function setupRefresh() {
  var btn = document.getElementById('btnRefresh');
  if (btn) {
    btn.addEventListener('click', function() {
      if (typeof openKeyTerrainBoard === 'function') openKeyTerrainBoard();
    });
  }
}

// ── Bootstrap: fetch user info, then open the board ────────────────────────
async function bootstrap() {
  // Fetch current user for state
  try {
    var res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (res.ok) {
      var user = await res.json();
      window.state.user = user;
      if (user.preferences) {
        // Merge server preferences into state
        for (var k in user.preferences) {
          window.state.preferences[k] = user.preferences[k];
        }
        // Apply theme from user preferences
        if (user.preferences.theme) applyTheme(user.preferences.theme);
        // Apply size
        if (user.preferences.size) {
          document.documentElement.setAttribute('data-size', user.preferences.size);
        }
        // Load user language if not English
        if (user.preferences.language && user.preferences.language !== 'en') {
          try { await _loadLang(user.preferences.language); } catch(e) {}
        }
      }
    }
  } catch(e) {}

  // Connect SSE for real-time updates
  connectPopupSSE();

  // Set up UI
  setupURLBar();
  setupRefresh();

  // Open the key terrain board
  if (typeof openKeyTerrainBoard === 'function') {
    openKeyTerrainBoard();
  }

  // Update title with translated name
  var title = (typeof t === 'function' ? t('kt_title') : null) || 'Key Terrain Board';
  document.title = 'Tidslinjal \u2014 ' + title;
  var titleEl = document.querySelector('.top-bar .title');
  if (titleEl) titleEl.textContent = '\uD83C\uDFD4\uFE0F ' + title;
}

// Wait for DOM ready, then bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// Cleanup on unload
window.addEventListener('beforeunload', function() {
  if (_sseConn) { _sseConn.close(); _sseConn = null; }
  if (_sseReconnectTimer) clearTimeout(_sseReconnectTimer);
});

})();
