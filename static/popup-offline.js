/* ── Shared offline-mode banner for detached popup windows ─────────────────
 *
 * When a detached Tidslinjal window (Key Terrain Board, Clocks, Narrative,
 * Decision Log, Analysis, Resources, References, Map) loses network
 * connectivity, this helper shows a fixed red banner at the top of the
 * window so the operator knows the data they're seeing is stale.
 *
 * It is intentionally small and self-contained — every popup has its own
 * tiny bootstrap script and there's no shared runtime, so we just ship
 * this file as a plain <script> tag in each popup HTML and call
 * initPopupOfflineBanner() once.
 *
 * Detection strategy:
 *   1. navigator.onLine + online/offline events — fast, no network I/O.
 *   2. Optional SSE / fetch error signals — when the popup already has
 *      an EventSource or periodic fetch, it can call reportPopupOffline()
 *      or reportPopupOnline() directly and this helper flips the banner
 *      immediately instead of waiting for the browser's own online event.
 *   3. Periodic heartbeat ping (every 15 s) against a cheap same-origin
 *      endpoint. This covers the case where the server crashed but the
 *      client's TCP stack still thinks the network is up.
 *
 * Public API:
 *   initPopupOfflineBanner({ pingUrl: '/api/auth/me', labelOverride: '…' })
 *     — call once on bootstrap. Idempotent.
 *   reportPopupOffline(reason?)  — flip to offline right now.
 *   reportPopupOnline()          — flip back to online right now.
 *
 * CSS: the banner is styled inline via element.style so the helper stays
 * a single drop-in file and doesn't depend on any stylesheet load order.
 * ----------------------------------------------------------------------- */
(function() {
'use strict';

// Module-scope state, guarded behind a single init() call so double-loading
// or re-running bootstrap doesn't create duplicate banners.
var _inited = false;
var _offline = false;
var _banner = null;
var _pingUrl = '/api/auth/me';
var _pingTimer = null;

function _buildBanner() {
  if (_banner) return _banner;
  var b = document.createElement('div');
  b.id = 'popupOfflineBanner';
  // Fixed red bar at the very top of the popup, high z-index so it sits
  // above whatever the popup's main content is (including modal overlays
  // which use z-index up to ~10100). pointer-events:none so it doesn't
  // intercept clicks from the user even when visible — we don't want a
  // connectivity warning to prevent dismissal of real errors below.
  b.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:100000',
    'background:#c0392b',
    'color:#fff',
    'padding:6px 12px',
    'font:600 12px/1.4 "Segoe UI",system-ui,sans-serif',
    'letter-spacing:.03em',
    'text-align:center',
    'box-shadow:0 2px 6px rgba(0,0,0,.35)',
    'display:none',
    'pointer-events:none',
  ].join(';');
  // Optional aria signalling for screen readers.
  b.setAttribute('role', 'status');
  b.setAttribute('aria-live', 'polite');
  document.body.appendChild(b);
  _banner = b;
  return b;
}

function _show(reason) {
  var b = _buildBanner();
  // Look up the translated label at show time so the banner picks up the
  // operator's language if the popup loads i18n before our helper runs.
  var label = '\u26A0\uFE0F ' + (
    (typeof t === 'function' && (t('popup_offline_banner') || '')) ||
    'Offline mode — connection lost. Data may be stale.'
  );
  if (reason) label += '  \u00B7  ' + reason;
  b.textContent = label;
  b.style.display = 'block';
  // Give the popup body a top padding so the banner doesn't cover the
  // first row of content. The popup's own CSS uses min-height:100vh on
  // body, so a 28px nudge is harmless and reversible.
  if (!document.body.dataset.offlinePadApplied) {
    document.body.dataset.offlinePadApplied = '1';
    document.body.dataset.prevPaddingTop = document.body.style.paddingTop || '';
    document.body.style.paddingTop = (parseFloat(getComputedStyle(document.body).paddingTop)||0) + 28 + 'px';
  }
}

function _hide() {
  if (_banner) _banner.style.display = 'none';
  if (document.body.dataset.offlinePadApplied) {
    document.body.style.paddingTop = document.body.dataset.prevPaddingTop || '';
    delete document.body.dataset.offlinePadApplied;
    delete document.body.dataset.prevPaddingTop;
  }
}

function _setOffline(yes, reason) {
  var was = _offline;
  _offline = !!yes;
  if (_offline && !was) _show(reason);
  if (!_offline && was) _hide();
}

// Periodic heartbeat ping. Uses a short (4 s) timeout and treats any
// non-2xx / network error / timeout as "server unreachable". Returns
// a Promise that resolves to true on success, false on failure.
function _ping() {
  return new Promise(function(resolve) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var tid = setTimeout(function() { if (ctrl) ctrl.abort(); resolve(false); }, 4000);
    fetch(_pingUrl, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }).then(function(res) {
      clearTimeout(tid);
      resolve(res.ok);
    }).catch(function() {
      clearTimeout(tid);
      resolve(false);
    });
  });
}

function _schedulePing() {
  if (_pingTimer) return;
  _pingTimer = setInterval(function() {
    // If the browser itself says we're offline, skip the ping — we already
    // know we're offline and don't need to spam the network stack.
    if (!navigator.onLine) { _setOffline(true, 'navigator.onLine=false'); return; }
    _ping().then(function(ok) { _setOffline(!ok, ok ? '' : 'heartbeat failed'); });
  }, 15000);
}

// ── Public API ─────────────────────────────────────────────────────────
window.initPopupOfflineBanner = function(opts) {
  if (_inited) return;
  _inited = true;
  opts = opts || {};
  if (opts.pingUrl) _pingUrl = opts.pingUrl;
  // Hook the browser-level events. These are the fastest path but can lie
  // on some platforms (e.g. a captive portal on the same LAN keeps
  // navigator.onLine true), which is why we also schedule the ping.
  window.addEventListener('online',  function() { _setOffline(false, ''); });
  window.addEventListener('offline', function() { _setOffline(true,  'navigator offline'); });
  // Initial read: if the browser already thinks we're offline at load
  // time, show the banner immediately.
  if (!navigator.onLine) _setOffline(true, 'navigator.onLine=false');
  _schedulePing();
};

window.reportPopupOffline = function(reason) { _setOffline(true, reason || ''); };
window.reportPopupOnline  = function() { _setOffline(false, ''); };

})();
