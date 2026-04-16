/* ── Offline Mode, Caching, Queued Actions ── */
// ── Offline Mode ────────────────────────────────────────────────────────────
window._offlineMode = false;
window._offlineModeForced = false;
window._offlineCache = {};

function _initOfflineMode() {
  // Restore forced offline preference
  try {
    window._offlineModeForced = localStorage.getItem('tidslinjal_offline_forced') === 'true';
    if (window._offlineModeForced) window._offlineMode = true;
  } catch {}

  // Auto-detect network status
  window.addEventListener('online', () => {
    if (!window._offlineModeForced) {
      _markOnline();
    }
  });
  window.addEventListener('offline', () => {
    _markOffline('Network lost — offline mode active');
  });

  // Check initial state
  if (!navigator.onLine) {
    window._offlineMode = true;
  }

  // Periodically cache key data
  setInterval(_cacheDataForOffline, 60000);
  _cacheDataForOffline();

  // Start the heartbeat — pings the server every 30 seconds to detect
  // server-side outages that don't trigger the browser's offline event
  // (e.g. firewall blocks, server crashes, network partitions)
  _startHeartbeat();
}

// ── Heartbeat: detect server-side outages ─────────────────────────────────
let _heartbeatTimer = null;
let _heartbeatFailures = 0;
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const HEARTBEAT_FAILURE_THRESHOLD = 2; // mark offline after 2 consecutive failures

function _startHeartbeat() {
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(_heartbeatCheck, HEARTBEAT_INTERVAL_MS);
}

async function _heartbeatCheck() {
  if (window._offlineModeForced) return; // user forced offline; skip
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // 8s timeout
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      cache: 'no-store',
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok || res.status === 401) {
      // Server reachable (401 = session expired but server is up)
      _heartbeatFailures = 0;
      if (window._offlineMode && !window._offlineModeForced) {
        _markOnline();
      }
    } else {
      _heartbeatFailures++;
    }
  } catch (e) {
    _heartbeatFailures++;
  }
  if (_heartbeatFailures >= HEARTBEAT_FAILURE_THRESHOLD && !window._offlineMode) {
    _markOffline('Server unreachable — offline mode active');
  }
}

// Called when a regular API request fails with a network error.
// Triggers an immediate heartbeat check rather than waiting for the next tick.
function _reportNetworkFailure() {
  if (window._offlineModeForced) return;
  _heartbeatFailures++;
  // Run heartbeat check immediately to confirm offline state
  setTimeout(_heartbeatCheck, 100);
}

// Called when any API request succeeds — confirms we're online
function _reportNetworkSuccess() {
  _heartbeatFailures = 0;
  if (window._offlineMode && !window._offlineModeForced) {
    _markOnline();
  }
}

function _markOffline(message) {
  if (window._offlineMode) return; // already offline
  window._offlineMode = true;
  _updateOfflineIndicator();
  if (typeof renderSidebar === 'function' && state && state.sidebarTab === 'legend') renderSidebar();
  if (typeof showNotification === 'function') {
    showNotification('warning', message || (typeof t === 'function' ? (t('offline_warning') || 'Network lost — offline mode active') : 'Network lost — offline mode active'));
  }
}

function _markOnline() {
  if (!window._offlineMode) return; // already online
  window._offlineMode = false;
  _heartbeatFailures = 0;
  _updateOfflineIndicator();
  if (typeof showNotification === 'function') {
    showNotification('success', typeof t === 'function' ? (t('online_restored') || 'Connection restored — syncing data…') : 'Connection restored — syncing data…');
  }
  // Sync: push any queued offline actions, then pull fresh data
  if (typeof _syncOfflineQueue === 'function') {
    _syncOfflineQueue().then(() => {
      if (typeof refreshAll === 'function') refreshAll();
      _cacheDataForOffline();
      if (typeof showNotification === 'function') {
        showNotification('success', typeof t === 'function' ? (t('data_synced') || 'Data synchronized') : 'Data synchronized');
      }
    }).catch(() => {
      if (typeof showNotification === 'function') {
        showNotification('warning', typeof t === 'function' ? (t('sync_partial_fail') || 'Sync partially failed — retrying…') : 'Sync partially failed — retrying…');
      }
      setTimeout(() => _syncOfflineQueue().then(() => { if (typeof refreshAll === 'function') refreshAll(); }), 5000);
    });
  }
}

function _cacheDataForOffline() {
  if (window._offlineMode) return;
  try {
    if (state.events) localStorage.setItem('tidslinjal_cache_events', JSON.stringify(state.events));
    if (state.eventTypes) localStorage.setItem('tidslinjal_cache_eventTypes', JSON.stringify(state.eventTypes));
    if (state.user) localStorage.setItem('tidslinjal_cache_user', JSON.stringify(state.user));
    if (state.preferences) localStorage.setItem('tidslinjal_cache_preferences', JSON.stringify(state.preferences));
    if (state.layers) localStorage.setItem('tidslinjal_cache_layers', JSON.stringify(state.layers));
    if (state.exercise) localStorage.setItem('tidslinjal_cache_exercise', JSON.stringify(state.exercise));
  } catch {}
}

function _loadOfflineCache() {
  try {
    const events = localStorage.getItem('tidslinjal_cache_events');
    if (events) state.events = JSON.parse(events);
    const types = localStorage.getItem('tidslinjal_cache_eventTypes');
    if (types) state.eventTypes = JSON.parse(types);
    const user = localStorage.getItem('tidslinjal_cache_user');
    if (user) state.user = JSON.parse(user);
    const prefs = localStorage.getItem('tidslinjal_cache_preferences');
    if (prefs) state.preferences = JSON.parse(prefs);
    const layers = localStorage.getItem('tidslinjal_cache_layers');
    if (layers) state.layers = JSON.parse(layers);
    const exercise = localStorage.getItem('tidslinjal_cache_exercise');
    if (exercise) state.exercise = JSON.parse(exercise);
  } catch {}
}

function _updateOfflineIndicator() {
  const el = document.getElementById('offlineStatus');
  if (el) {
    el.innerHTML = window._offlineMode
      ? '<span style="color:#e05252">● Offline</span>'
      : '<span style="color:#27ae60">● Online</span>';
  }
  // Show/hide offline banner in header
  let banner = document.getElementById('offlineBanner');
  if (window._offlineMode && !banner) {
    banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#e05252;color:#fff;text-align:center;font-size:11px;padding:3px;letter-spacing:.05em';
    banner.textContent = '📡 ' + (t('offline_banner')||'OFFLINE MODE — Working with cached data');
    document.body.prepend(banner);
  } else if (!window._offlineMode && banner) {
    banner.remove();
  }
}

function toggleOfflineMode() {
  window._offlineModeForced = !window._offlineModeForced;
  window._offlineMode = window._offlineModeForced || !navigator.onLine;
  try { localStorage.setItem('tidslinjal_offline_forced', window._offlineModeForced); } catch {}
  _updateOfflineIndicator();
  renderSidebar();
  if (window._offlineModeForced) {
    showNotification('warning', t('offline_mode_enabled')||'Offline mode enabled — using cached data');
  } else if (navigator.onLine) {
    showNotification('success', t('online_mode_restored')||'Online mode restored');
    refreshAll();
  }
}

// Wrap apiGet to use cache when offline
const _origApiGet = typeof apiGet === 'function' ? apiGet : null;
if (_origApiGet) {
  window.apiGet = async function(url) {
    if (window._offlineMode) {
      _loadOfflineCache();
      throw new Error('offline');
    }
    return _origApiGet(url);
  };
}

// Offline action queue — stores API calls made while offline for later replay
window._offlineActionQueue = JSON.parse(localStorage.getItem('tidslinjal_offline_queue') || '[]');

function _queueOfflineAction(method, path, body) {
  // Deduplicate: for PUT/DELETE on the same path, keep only the latest action
  if (method === 'PUT' || method === 'DELETE') {
    window._offlineActionQueue = window._offlineActionQueue.filter(
      a => !(a.method === method && a.path === path)
    );
  }
  window._offlineActionQueue.push({ method, path, body, timestamp: Date.now() });
  try { localStorage.setItem('tidslinjal_offline_queue', JSON.stringify(window._offlineActionQueue)); } catch {}
}

async function _syncOfflineQueue() {
  const queue = window._offlineActionQueue.slice();
  if (queue.length === 0) return;
  const failed = [];
  const maxRetries = 3;
  for (const action of queue) {
    let success = false;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await api(action.method, action.path, action.body);
        if (res.ok || res.status === 409) {
          // 409 = conflict, skip (already applied)
          success = true;
          break;
        }
        if (res.status >= 400 && res.status < 500) {
          // Client error (bad request, forbidden, etc.) — don't retry
          success = true; // discard, retrying won't help
          break;
        }
      } catch { /* network error, retry */ }
      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    if (!success) failed.push(action);
  }
  window._offlineActionQueue = failed;
  try { localStorage.setItem('tidslinjal_offline_queue', JSON.stringify(failed)); } catch {}
}

// Wrap apiPost to queue when offline
const _origApiPost = typeof apiPost === 'function' ? apiPost : null;
if (_origApiPost) {
  window.apiPost = async function(url, body) {
    if (window._offlineMode) {
      _queueOfflineAction('POST', url, body);
      return new Response(JSON.stringify({queued:true}), {status:202});
    }
    return _origApiPost(url, body);
  };
}

// Initialize offline mode detection
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', _initOfflineMode);
}

