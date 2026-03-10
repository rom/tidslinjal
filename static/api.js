/* ============================================================
   Tidslinjal — API & Data Fetching
   HTTP helpers and all server data fetch functions.
   ============================================================ */
'use strict';

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('unauth'); }
  return res;
}
async function apiGet(p)        { return (await api('GET', p)).json(); }
async function apiPost(p, b)    { return api('POST', p, b); }
async function apiPut(p, b)     { return api('PUT', p, b); }
async function apiDel(p)        { return api('DELETE', p); }

// ── Data fetchers ───────────────────────────────────────────────────────────
async function fetchPhases()   { state.phases    = await apiGet('/api/phases')  || []; }
async function fetchLocks()    { state.locks     = await apiGet('/api/locks')   || []; }
async function fetchAlarms()   { state.alarms    = await apiGet('/api/alarms')  || []; }
async function fetchLayers()   { state.layers    = await apiGet('/api/layers')  || []; }
async function fetchGroups()   { state.groups    = await apiGet('/api/groups')  || []; }

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
      await Promise.all([fetchEvents(), fetchLocks(), fetchAlarms(), fetchLayers(), fetchExercise(), fetchPhases()]);
      if (typeof _listViewActive !== 'undefined' && _listViewActive) {
        renderListView();
      } else {
        renderTimeline();
      }
      renderSidebar();
      updateSyntheticUI();
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
async function loadPreferences() {
  state.preferences = await apiGet('/api/preferences');
}
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
