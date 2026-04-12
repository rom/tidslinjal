/* ============================================================
   Tidslinjal — API & Data Fetching
   HTTP helpers and all server data fetch functions.
   ============================================================ */
'use strict';

// ── HTTP helpers ────────────────────────────────────────────────────────────
function _getCSRFToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? m[1] : '';
}
let _authRedirectPending = false;
async function api(method, path, body) {
  const csrf = _getCSRFToken();
  const opts = { method, headers: { 'X-Requested-With': 'XMLHttpRequest' } };
  if (csrf) opts.headers['X-CSRF-Token'] = csrf;
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    // Network error: report to offline detection so it can mark the client offline
    if (typeof _reportNetworkFailure === 'function') _reportNetworkFailure();
    throw err;
  }
  // Successful response (any status) means server is reachable
  if (typeof _reportNetworkSuccess === 'function') _reportNetworkSuccess();
  if (res.status === 401) {
    // Avoid multiple simultaneous redirects and allow multi-device sessions.
    // Verify the session is truly gone before redirecting (handles transient errors).
    if (_authRedirectPending) throw new Error('unauth');
    _authRedirectPending = true;
    try {
      // Double-check session validity with a lightweight probe
      const probe = await fetch('/api/auth/me', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (probe.status === 401) {
        window.location.href = '/login';
      } else {
        // Session is actually valid — the 401 was transient or from a different cause
        _authRedirectPending = false;
        return res;
      }
    } catch {
      // Network error on probe — don't redirect, let the caller handle the error
      _authRedirectPending = false;
    }
    throw new Error('unauth');
  }
  return res;
}
async function apiGet(p) {
  const res = await api('GET', p);
  if (!res.ok) {
    console.warn('[apiGet]', p, res.status, res.statusText);
    return null;
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    console.warn('[apiGet]', p, 'unexpected content-type:', ct);
    return null;
  }
  return res.json();
}
async function apiPost(p, b)    { return api('POST', p, b); }
async function apiPut(p, b)     { return api('PUT', p, b); }
async function apiDel(p)        { return api('DELETE', p); }

// ── Data fetchers ───────────────────────────────────────────────────────────
async function fetchPhases()    { state.phases    = await apiGet('/api/phases')    || []; }
async function fetchLocks()     { state.locks     = await apiGet('/api/locks')     || []; }
async function fetchAlarms()    { state.alarms    = await apiGet('/api/alarms')    || []; }
async function fetchLayers()    { state.layers    = await apiGet('/api/layers')    || []; }
async function fetchGroups()    { state.groups    = await apiGet('/api/groups')    || []; }
async function fetchDayLabels() { state.dayLabels = await apiGet('/api/day-labels')|| []; }

async function fetchEvents() {
  const from = state.startDate.toISOString();
  const to   = getViewEnd().toISOString();
  state.events = await apiGet(`/api/events?from=${from}&to=${to}`) || [];
}

async function fetchExercise() {
  try { state.exercise = await apiGet('/api/exercise'); } catch { /* ignore */ }
}

// ── Refresh all ─────────────────────────────────────────────────────────────
let _refreshInFlight = null;
let _refreshQueued = false;
async function refreshAll() {
  // If a refresh is already running, queue one follow-up but don't stack
  if (_refreshInFlight) {
    _refreshQueued = true;
    return _refreshInFlight;
  }
  _refreshInFlight = (async () => {
    try {
      await Promise.all([fetchEvents(), fetchLocks(), fetchAlarms(), fetchLayers(), fetchExercise(), fetchPhases(), fetchDayLabels()]);
      if (typeof _listViewActive !== 'undefined' && _listViewActive) {
        if (typeof patchListView === 'function') patchListView();
        else renderListView();
      } else {
        if (typeof patchTimeline === 'function') patchTimeline();
        else renderTimeline();
      }
      // Preserve sidebar filter state (audit log, logbook, etc.) across refreshes
      // triggered by SSE events — only re-render if the current tab benefits from it.
      const curTab = state.sidebarTab;
      const skipTabs = new Set(['audit', 'logs']);
      if (!skipTabs.has(curTab)) {
        renderSidebar();
      }
      updateSyntheticUI();
    } catch (err) {
      if (err.message !== 'offline') console.error('[refreshAll]', err);
    } finally {
      _refreshInFlight = null;
      if (_refreshQueued) {
        _refreshQueued = false;
        refreshAll();
      }
    }
  })();
  return _refreshInFlight;
}

// ── Preferences persistence ─────────────────────────────────────────────────
let _savePrefTimer = null;
async function savePreferences() {
  // Debounce rapid successive saves (e.g. toggling multiple settings quickly)
  if (_savePrefTimer) clearTimeout(_savePrefTimer);
  return new Promise(resolve => {
    _savePrefTimer = setTimeout(async () => {
      _savePrefTimer = null;
      await apiPut('/api/preferences', state.preferences);
      resolve();
    }, 300);
  });
}
