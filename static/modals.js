/* ============================================================
   Tidslinjal — Core utilities & remaining feature logic
   Shared helpers (_bindActions, safeJsonParse, dbg),
   preferences, SSE, polls, checklists, ready checks,
   admin settings, ICS export.
   Individual modals are in modal-*.js, sidebar in sidebar.js,
   reports in reports.js, export/import in export-import.js, etc.
   ============================================================ */

/** Safe JSON.parse wrapper — returns null on invalid input instead of throwing */
function safeJsonParse(str) {
  try { return JSON.parse(str); }
  catch (e) { console.warn('[safeJsonParse] invalid JSON:', e.message); return null; }
}

/* ── Auto-stack modals: ensure each new modal-overlay opens on top ────────── */
var _modalZCounter = 10100;
(function _initModalStacking() {
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('modal-overlay')) {
          node.style.zIndex = String(++_modalZCounter);
        }
      });
    });
  });
  if (document.body) {
    obs.observe(document.body, { childList: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      obs.observe(document.body, { childList: true });
    });
  }
})();

/**
 * CSP-safe event binding helper. After setting innerHTML, call this to bind
 * all elements with data-action="fnName" attributes to their handlers.
 * Supports data-arg (single arg) and data-args (JSON array of args).
 * Use data-stop-prop on elements that need event.stopPropagation().
 * Use data-event="change|input" for non-click events (default is 'click').
 */
function _bindActions(root) {
  root.querySelectorAll('[data-action]').forEach(el => {
    if (el._actionBound) return;
    el._actionBound = true;
    const fnName = el.dataset.action;
    const fn = window[fnName];
    if (typeof fn !== 'function') return;
    const eventType = el.dataset.event || 'click';
    el.addEventListener(eventType, e => {
      if (el.hasAttribute('data-stop-prop')) e.stopPropagation();
      const rawArgs = el.dataset.args;
      const rawArg = el.dataset.arg;
      if (rawArgs) {
        fn(...JSON.parse(rawArgs));
      } else if (el.hasAttribute('data-arg-checked')) {
        fn(el.checked);
      } else if (el.hasAttribute('data-pref-checked')) {
        setPref(el.dataset.prefChecked, el.checked);
      } else if (el.hasAttribute('data-arg-value')) {
        fn(el.value);
      } else if (el.hasAttribute('data-arg-el')) {
        fn(el);
      } else if (rawArg !== undefined) {
        let arg = rawArg;
        if (arg === 'null') arg = null;
        else if (/^\d+$/.test(arg)) arg = parseInt(arg, 10);
        else try { arg = JSON.parse(arg); } catch {}
        fn(arg);
      } else {
        fn();
      }
    });
  });
  root.querySelectorAll('[data-stop-prop-only]').forEach(el => {
    el.addEventListener('click', e => e.stopPropagation());
  });
  // Special: edit etype buttons (JSON in single-quoted data attr)
  root.querySelectorAll('[data-edit-etype]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); const d = safeJsonParse(el.dataset.editEtype); if (d) openEtypeModal(d); });
  });
  // Special: edit layer buttons
  root.querySelectorAll('[data-edit-layer]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); const d = safeJsonParse(el.dataset.editLayer); if (d) openLayerModal(d); });
  });
  // Special: close OIDC test panel
  root.querySelectorAll('[data-close-oidc-test]').forEach(el => {
    el.addEventListener('click', () => { document.getElementById('oidcTestResult').style.display = 'none'; });
  });
  // Special: user/group/phase modals with JSON arg in data-arg + data-arg-el
  root.querySelectorAll('[data-action="openUserModal"][data-arg-el]').forEach(el => {
    // Remove the generic handler and re-bind with JSON parse
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openUserModal(d); });
  });
  root.querySelectorAll('[data-action="openGroupModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openGroupModal(d); });
  });
  root.querySelectorAll('[data-action="openMemberModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openMemberModal(d); });
  });
  root.querySelectorAll('[data-action="openPhaseModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openPhaseModal(d); });
  });
  root.querySelectorAll('[data-action="openRoomModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openRoomModal(d); });
  });
  // Special: ackAlarm with closest notification element
  root.querySelectorAll('[data-action="ackAlarm"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => ackAlarm(parseInt(el.dataset.arg, 10), el.closest('.notification')));
  });
  // Special: removeRoleRow(this)
  root.querySelectorAll('[data-action="removeRoleRow"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => removeRoleRow(el));
  });
}
'use strict';

// ── Debug helper ────────────────────────────────────────────────────────────
// window.TIDSLINJAL_DEBUG is set by app.js after checking /api/version
function dbg(...args) {
  if (window.TIDSLINJAL_DEBUG) console.debug('[TL]', ...args);
}

// ── Group label helper ─────────────────────────────────────────────────────
function getGroupLabel() {
  const key = (state.exercise && state.exercise.group_label) || 'group';
  const map = {
    group: { singular: 'Group',  plural: 'Groups',  sv_s: 'Grupp',  sv_p: 'Grupper',  fr_s: 'Groupe',  fr_p: 'Groupes'  },
    unit:  { singular: 'Unit',   plural: 'Units',   sv_s: 'Enhet',  sv_p: 'Enheter',  fr_s: 'Unité',   fr_p: 'Unités'   },
    team:  { singular: 'Team',   plural: 'Teams',   sv_s: 'Team',   sv_p: 'Team',     fr_s: 'Équipe',  fr_p: 'Équipes'  },
  };
  const lang = (state.preferences && state.preferences.language) || 'en';
  const entry = map[key] || map.group;
  if (lang === 'sv') return { singular: entry.sv_s, plural: entry.sv_p };
  if (lang === 'fr') return { singular: entry.fr_s, plural: entry.fr_p };
  return { singular: entry.singular, plural: entry.plural };
}

// ── Role display name helper ───────────────────────────────────────────────
function getRoleDisplayName(roleKey) {
  // Check custom role names first
  const custom = state.roleConfigs && state.roleConfigs.find(r => r.key === roleKey);
  if (custom && custom.display_name) return custom.display_name;
  return t('role_' + roleKey) || roleKey;
}

// ── applyPreferences ───────────────────────────────────────────────────────
function applyPreferences() {
  const body = document.body;
  body.className = '';
  const _theme = state.preferences.theme || 'dark';
  if (_theme === 'light') body.classList.add('light-mode');
  else if (_theme === 'city-camo') body.classList.add('city-camo');
  else if (_theme === 'urban-camo') body.classList.add('urban-camo');
  else if (['sand','matrix','sunset','light-blue-sky','ocean','forest','accessible','crimson'].includes(_theme)) body.classList.add('theme-' + _theme);
  const sz = state.preferences.size || 'small';
  if (sz !== 'small') body.classList.add('size-'+sz);
  if (!state.preferences.show_out_of_hours) body.classList.add('hide-out-of-hours');
  if (state.preferences.hover_zoom_enabled !== false) body.classList.add('hover-zoom-enabled');
  // High contrast mode (separate from theme)
  if (state.preferences.high_contrast) body.classList.add('high-contrast');
  // Color-blind safe palette
  const cbMode = state.preferences.color_blind_mode || 'off';
  if (cbMode !== 'off') body.classList.add('cb-' + cbMode);
  // Start/end event shape
  const evShape = state.preferences.event_point_shape || 'arrow';
  if (evShape !== 'arrow') body.classList.add('ev-shape-' + evShape);
  // Apply view spacing
  const spacing = state.preferences.view_spacing || 1;
  document.documentElement.style.setProperty('--view-spacing', spacing);
  // Apply tooltip delay
  const ttDelay = state.preferences.tooltip_delay || 0;
  document.documentElement.style.setProperty('--tooltip-delay', ttDelay + 'ms');
  // Preload selected language
  const _lang = state.preferences.language || 'en';
  if (_lang !== 'en' && typeof _loadLang === 'function') _loadLang(_lang);
  updateLangFlags();
  // Show/hide language flags in toolbar
  const langFlagsEl = document.getElementById('langFlags');
  if (langFlagsEl) langFlagsEl.style.display = state.preferences.show_lang_flags === false ? 'none' : '';
  // Load Google Material Icons if icon_set is 'material'
  const iconSet = (state.exercise || {}).icon_set || 'emoji';
  if (iconSet === 'material' && !document.getElementById('materialIconsCSS')) {
    const link = document.createElement('link');
    link.id = 'materialIconsCSS';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Outlined|Material+Icons+Round';
    document.head.appendChild(link);
  }
  // ── Accessibility preferences ──
  const ap = state.preferences;
  if (ap.a11y_focus_indicators) body.classList.add('a11y-focus');
  if (ap.a11y_reduced_motion) body.classList.add('a11y-reduced-motion');
  if (ap.a11y_large_click_targets) body.classList.add('a11y-large-targets');
  if (ap.a11y_skip_links) body.classList.add('a11y-skip-links');
  const fontScale = ap.a11y_font_scaling || '100';
  if (fontScale === '125') body.classList.add('a11y-font-125');
  if (fontScale === '150') body.classList.add('a11y-font-150');
  // Apply tactical font
  if (typeof _applyTacticalFont === 'function') _applyTacticalFont();
  // Broadcast theme to detached windows
  if (typeof _broadcastSync === 'function') {
    _broadcastSync({ type: 'theme', theme: state.preferences.theme || 'dark' });
  }
  // Update narrative ticker visibility
  if (typeof initTicker === 'function') initTicker();
}

// Wire up inline alarm checkbox toggle
document.getElementById('inlineAlarmEnabled')?.addEventListener('change', function() {
  const opts = document.getElementById('inlineAlarmOptions');
  if (opts) opts.style.display = this.checked ? '' : 'none';
});

document.getElementById('eventRecurring').addEventListener('change', function() {
  document.getElementById('recurrenceGroup').style.display    = this.checked ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = this.checked ? '' : 'none';
});

// Auto-adjust end time to start + 1 hour whenever start changes
document.getElementById('eventStart').addEventListener('change', function() {
  const start = new Date(this.value);
  if (!isNaN(start.getTime())) {
    document.getElementById('eventEnd').value = fmtDateInput(addHours(start, 1));
  }
});

// NOTE: The btnSaveEvent click handler lives in modal-event.js (single canonical handler).

// Auto-complete for location fields using rooms/buildings
// ── Recurring Event Edit Dialog ────────────────────────────────────────────

// ── @username autocomplete ───────────────────────────────────────────────────

// NOTE: Modal save handlers live in their dedicated modal-*.js files:
// - btnSaveEvent  → modal-event.js
// - btnSaveAlarm  → modal-alarm.js
// - btnSaveLock   → modal-lock.js
// - btnSaveGroup  → modal-group.js
// - btnSaveLayer  → modal-layer.js
// - btnSaveEtype  → modal-event-type.js
// - btnSavePhase  → modal-phase.js

// ── Lock Modal open button ───────────────────────────────────────────────
document.getElementById('btnAddLock').addEventListener('click', () => {
  const now = new Date();
  document.getElementById('lockStart').value = fmtDateInput(now);
  document.getElementById('lockEnd').value   = fmtDateInput(addHours(now, 1));
  document.getElementById('lockReason').value = '';
  openLockModal();
});

window._deleteResourceNote = async function(noteId, resType, resId) {
  if (!confirm(t('resource_note_delete_confirm')||'Delete this note?')) return;
  try {
    const res = await fetch(`/api/resource-notes/${noteId}`, { method: 'DELETE', headers: {'Authorization': 'Bearer ' + state.token} });
    if (!res.ok) { const e = await res.json(); showError(e.error); return; }
    _loadResourceNotes(resType, resId, true);
  } catch (e) { showError(e.message); }
};

window._deleteResourceStar = async function(starId, resType, resId) {
  if (!confirm(t('resource_star_remove')||'Remove this star rating?')) return;
  try {
    const res = await fetch(`/api/resource-stars/${starId}`, { method: 'DELETE', headers: {'Authorization': 'Bearer ' + state.token} });
    if (!res.ok) { const e = await res.json(); showError(e.error); return; }
    _loadResourceStars(resType, resId, true);
  } catch (e) { showError(e.message); }
};

// btnSaveUser handler is in modal-user.js (single handler to avoid duplicate API calls)

// Event log: external events received via SSE/webhook

// ── CRC32 for client-side ZIP generation ──────────────────────────────────

// ── Log Book ───────────────────────────────────────────────────────────────
// Detach sidebar into separate window
// ── Webhook helpers, preference setters: setOOHPref, setRedLinePref, setSynthLabelPref, toggleFreeze, saveExercise, setDefaultView, setPref, setHourPref, toggleType, toggleLayer, toggleAllLayers ──

// ── Enrollment settings helpers ─────────────────────────────────────────────

// ── Ready Check settings ───────────────────────────────────────────────────

// ── OIDC settings helpers ──────────────────────────────────────────────────

// ── Default avatar picker ─────────────────────────────────────────────────────

// ── Password Policy helpers ───────────────────────────────────────────────────

// ── Mail Config UI ─────────────────────────────────────────────────────────
async function _initMailSettingsUI() {
  try {
    const cfg = await apiGet('/api/integrations/mail');
    if (!cfg) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    const setCb  = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    setCb('mailEnabled', cfg.enabled);
    setVal('mailHost',     cfg.smtp_host);
    setVal('mailPort',     cfg.smtp_port || 587);
    setVal('mailTLS',      cfg.tls_mode || 'starttls');
    setVal('mailUsername', cfg.username);
    setVal('mailFrom',     cfg.from_addr);
    setVal('mailFromName', cfg.from_name);
  } catch { /* mail not configured yet */ }
}

async function saveMailConfig() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const cfg = {
    enabled:   document.getElementById('mailEnabled')?.checked || false,
    smtp_host: val('mailHost'),
    smtp_port: parseInt(val('mailPort'), 10) || 587,
    tls_mode:  val('mailTLS'),
    username:  val('mailUsername'),
    password:  val('mailPassword'),
    from_addr: val('mailFrom'),
    from_name: val('mailFromName'),
  };
  const res = await api('PUT', '/api/integrations/mail', cfg);
  if (res.ok) {
    showNotification('success', 'Mail settings saved');
    // Clear password field
    const pw = document.getElementById('mailPassword');
    if (pw) pw.value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save mail settings');
  }
}

async function testMailConfig() {
  const res = await api('POST', '/api/integrations/mail/test', {});
  if (res.ok) {
    const d = await res.json();
    showNotification('success', `Test email sent to ${d.sent_to}`);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Mail test failed');
  }
}

// ── Syslog Config UI ─────────────────────────────────────────────────────────
async function _initSyslogSettingsUI() {
  try {
    const cfg = await apiGet('/api/integrations/syslog');
    if (!cfg) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    const setCb  = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    setCb('syslogEnabled', cfg.enabled);
    setVal('syslogHost',      cfg.host);
    setVal('syslogPort',      cfg.port || '');
    setVal('syslogTransport', cfg.transport || 'udp');
    setVal('syslogFormat',    cfg.format || 'classic');
    setVal('syslogAppName',   cfg.app_name);
    setVal('syslogFacility',  cfg.facility ?? 1);
    setCb('syslogTLSVerify',  cfg.tls_verify !== false);
  } catch { /* syslog not configured yet */ }
}

async function saveSyslogConfig() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const cfg = {
    enabled:    document.getElementById('syslogEnabled')?.checked || false,
    host:       val('syslogHost'),
    port:       parseInt(val('syslogPort'), 10) || 0,
    transport:  val('syslogTransport') || 'udp',
    format:     val('syslogFormat') || 'classic',
    app_name:   val('syslogAppName'),
    facility:   parseInt(val('syslogFacility'), 10) || 1,
    tls_verify: document.getElementById('syslogTLSVerify')?.checked !== false,
  };
  const res = await api('PUT', '/api/integrations/syslog', cfg);
  if (res.ok) {
    showNotification('success', 'Syslog settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save syslog settings');
  }
}

async function testSyslogConfig() {
  const res = await api('POST', '/api/integrations/syslog/test', {});
  if (res.ok) {
    const d = await res.json();
    showNotification('success', `Syslog test message sent via ${d.transport} to ${d.host}`);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Syslog test failed');
  }
}

// ── Report Ingest Config UI ───────────────────────────────────────────────────
async function _initReportIngestConfigUI() {
  try {
    const cfg = await apiGet('/api/integrations/report-ingest');
    if (!cfg) return;
    const el = document.getElementById('reportIngestEnabled');
    if (el) el.checked = !!cfg.enabled;
  } catch { /* not configured yet */ }
}

async function saveReportIngestConfig() {
  const cfg = {
    enabled: document.getElementById('reportIngestEnabled')?.checked || false,
  };
  const res = await api('PUT', '/api/integrations/report-ingest', cfg);
  if (res.ok) {
    showNotification('success', 'Report ingest settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save report ingest settings');
  }
}

// ── Security Settings UI ──────────────────────────────────────────────────────
async function _initSecuritySettingsUI() {
  // Wire up geoblocking country names display on input change
  const geoInput = document.getElementById('secGeoCountries');
  if (geoInput) geoInput.addEventListener('input', _updateGeoCountryNames);
  try {
    const ss = await apiGet('/api/admin/security');
    if (!ss) return;
    const setCb  = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setCb('secPolicyEnabled', ss.password_policy_enabled);
    setVal('secMinLength',    ss.min_length || 8);
    setCb('secReqUpper',    ss.require_uppercase);
    setCb('secReqLower',    ss.require_lowercase);
    setCb('secReqNumbers',  ss.require_numbers);
    setCb('secReqSymbols',  ss.require_symbols);
    // Session management settings
    setCb('secSessionTimeEnabled',  ss.session_time_enabled);
    setVal('secSessionTimeHours',   ss.session_time_hours || 100);
    setCb('secIdleTimeoutEnabled',  ss.idle_timeout_enabled);
    setVal('secIdleTimeoutHours',   ss.idle_timeout_hours || 100);
    setCb('secLogoffOnPwChange',    ss.logoff_on_password_change !== false);
    setCb('secRotateOnRoleChange',  ss.rotate_session_on_role_change !== false);
    // Session hijack protection master switch (default off — explicit !==true
    // because empty / unset / false all mean disabled).
    setCb('secHijackProtection',    ss.session_hijack_protection === true);
    setCb('secBindIP',              ss.session_bind_ip !== false);
    const bindMode = document.getElementById('secBindIPMode');
    if (bindMode) bindMode.value = ss.session_bind_ip_mode || 'subnet';
    setCb('secBindUA',              ss.session_bind_ua !== false);
    setCb('secDisablePasswordLogin', ss.disable_password_login);
  } catch { /* not configured yet */ }
}

async function saveSecuritySettings() {
  const cb  = id => document.getElementById(id)?.checked || false;
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const ss = {
    password_policy_enabled: cb('secPolicyEnabled'),
    min_length:       parseInt(val('secMinLength'), 10) || 8,
    require_uppercase: cb('secReqUpper'),
    require_lowercase: cb('secReqLower'),
    require_numbers:   cb('secReqNumbers'),
    require_symbols:   cb('secReqSymbols'),
    // Session management settings
    session_time_enabled:         cb('secSessionTimeEnabled'),
    session_time_hours:           parseInt(val('secSessionTimeHours'), 10) || 100,
    idle_timeout_enabled:         cb('secIdleTimeoutEnabled'),
    idle_timeout_hours:           parseInt(val('secIdleTimeoutHours'), 10) || 100,
    logoff_on_password_change:    cb('secLogoffOnPwChange'),
    rotate_session_on_role_change: cb('secRotateOnRoleChange'),
    // Session hijack protection (master switch gates the rest)
    session_hijack_protection:    cb('secHijackProtection'),
    session_bind_ip:              cb('secBindIP'),
    session_bind_ip_mode:         (document.getElementById('secBindIPMode')?.value || 'subnet'),
    session_bind_ua:              cb('secBindUA'),
    disable_password_login:       cb('secDisablePasswordLogin'),
  };
  const res = await api('PUT', '/api/admin/security', ss);
  if (res.ok) {
    showNotification('success', 'Security settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save password policy');
  }
}

// ── Security tab action handlers ──────────────────────────────────────────────
function toggleSecTlsDetails() {
  const det = document.getElementById('secTlsDetails');
  const btn = document.getElementById('secTlsToggleDetails');
  if (det && btn) {
    const show = det.style.display === 'none';
    det.style.display = show ? '' : 'none';
    btn.textContent = show ? (t('security_tls_hide_details')||'Hide Details') : (t('security_tls_details')||'Show Details');
  }
}

function toggleSecOidcDetails() {
  const det = document.getElementById('secOidcDetails');
  const btn = document.getElementById('secOidcToggleDetails');
  if (det && btn) {
    const show = det.style.display === 'none';
    det.style.display = show ? '' : 'none';
    btn.textContent = show ? (t('security_oidc_hide_details')||'Hide Details') : (t('security_oidc_details')||'Show Details');
  }
}

async function saveSecSsoEnabled() {
  const enabled = document.getElementById('secSsoEnabled')?.checked || false;
  const res = await api('PUT', '/api/admin/sso-toggle', { enabled });
  if (res.ok) {
    showNotification('success', t('security_sso_saved')||'SSO settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save SSO settings');
  }
}

// ── Active Sessions (admin) ────────────────────────────────────────────────

async function _refreshActiveSessions() {
  const list = document.getElementById('activeSessionsList');
  if (!list) return;
  list.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:8px">${escHtml(t('loading')||'Loading…')}</div>`;
  try {
    const sessions = await apiGet('/api/admin/active-sessions');
    if (!sessions || sessions.length === 0) {
      list.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:8px">${escHtml(t('security_sessions_none')||'No active sessions.')}</div>`;
      return;
    }
    // Group by user so admins see per-user session counts
    const byUser = {};
    sessions.forEach(s => {
      if (!byUser[s.user_id]) byUser[s.user_id] = { user_id: s.user_id, username: s.username, display_name: s.display_name, sessions: [] };
      byUser[s.user_id].sessions.push(s);
    });
    const users = Object.values(byUser).sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    const fmt = (iso) => {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); } catch { return iso; }
    };
    const truncateUA = (ua) => {
      if (!ua) return '';
      // Pull out browser/OS hints from the user agent
      let label = '';
      if (/Firefox/i.test(ua)) label = 'Firefox';
      else if (/Edg\//i.test(ua)) label = 'Edge';
      else if (/Chrome/i.test(ua)) label = 'Chrome';
      else if (/Safari/i.test(ua)) label = 'Safari';
      else label = ua.slice(0, 30);
      if (/Windows/i.test(ua)) label += ' · Windows';
      else if (/Mac OS/i.test(ua)) label += ' · macOS';
      else if (/Linux/i.test(ua)) label += ' · Linux';
      else if (/Android/i.test(ua)) label += ' · Android';
      else if (/iPhone|iPad/i.test(ua)) label += ' · iOS';
      return label;
    };

    list.innerHTML = users.map(u => `
      <div style="border-bottom:1px solid var(--border);padding:6px 4px;margin-bottom:4px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="font-weight:600">👤 ${escHtml(u.display_name || u.username || '?')} <span style="color:var(--text-dim);font-weight:normal">(${escHtml(u.username||'')})</span></div>
          <button class="btn btn-sm btn-danger" data-action="_destroyUserSessions" data-arg="${u.user_id}" title="${escHtml(t('security_destroy_all_for_user')||'Log out all sessions for this user')}" style="font-size:10px;padding:3px 6px">🗑 ${escHtml(t('security_destroy_all_short')||'All')}</button>
        </div>
        ${u.sessions.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;padding:4px 0 4px 16px;font-size:10px;color:var(--text-dim);border-top:1px dashed var(--border);margin-top:4px">
            <div style="flex:1;min-width:0">
              <div><code style="font-size:9px;background:var(--bg2);padding:1px 4px;border-radius:2px">${escHtml(s.id_prefix)}…</code> ${s.is_current ? `<span style="color:var(--accent);font-weight:700">(${escHtml(t('security_this_session')||'this session')})</span>` : ''}</div>
              ${s.ip_address ? `<div>🌐 ${escHtml(s.ip_address)}</div>` : ''}
              ${s.user_agent ? `<div>💻 ${escHtml(truncateUA(s.user_agent))}</div>` : ''}
              ${s.created_at ? `<div>📅 ${escHtml(t('security_created')||'Created')}: ${escHtml(fmt(s.created_at))}</div>` : ''}
              <div>⏰ ${escHtml(t('security_expires')||'Expires')}: ${escHtml(fmt(s.expires_at))}</div>
            </div>
            ${!s.is_current ? `<button class="btn btn-sm btn-danger" data-action="_destroySession" data-arg="${escAttr(s.id_hash)}" title="${escHtml(t('security_destroy_session')||'Destroy session')}" style="font-size:9px;padding:2px 5px;flex-shrink:0">🗑</button>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div style="color:var(--red);padding:8px">${escHtml(t('security_sessions_error')||'Failed to load sessions.')} ${escHtml(e.message || '')}</div>`;
  }
}

async function _destroySession(idHash) {
  if (!confirm(t('security_destroy_session_confirm')||'Destroy this session? The user will be immediately logged out.')) return;
  try {
    const res = await apiPost('/api/admin/active-sessions/delete', { id_hash: idHash });
    if (res.ok) {
      showNotification('success', t('security_session_destroyed')||'Session destroyed.');
      _refreshActiveSessions();
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to destroy session.');
    }
  } catch (e) {
    showError(e.message || 'Failed to destroy session.');
  }
}

async function _destroyUserSessions(userID) {
  const uid = parseInt(userID, 10);
  if (!confirm(t('security_destroy_user_sessions_confirm')||'Destroy ALL sessions for this user? They will be immediately logged out from every device.')) return;
  try {
    const res = await apiPost('/api/admin/active-sessions/delete', { user_id: uid, all_for_user: true });
    if (res.ok) {
      showNotification('success', t('security_user_sessions_destroyed')||'All sessions destroyed for this user.');
      _refreshActiveSessions();
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to destroy sessions.');
    }
  } catch (e) {
    showError(e.message || 'Failed to destroy sessions.');
  }
}

async function saveSecRateLimits() {
  const val = id => parseInt(document.getElementById(id)?.value || '0', 10);
  const payload = {
    login_limit: val('secRateLogin') || 10,
    registration_limit: val('secRateReg') || 5,
    password_reset_limit: val('secRateReset') || 5,
  };
  const res = await api('PUT', '/api/admin/rate-limits', payload);
  if (res.ok) {
    showNotification('success', t('security_rate_saved')||'Rate limiting settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save rate limits');
  }
}

function _updateGeoCountryNames() {
  const el = document.getElementById('secGeoCountryNames');
  const input = document.getElementById('secGeoCountries');
  if (!el || !input) return;
  const codes = (input.value || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (codes.length === 0) { el.textContent = ''; return; }
  const names = codes.map(c => {
    const name = countryName(c);
    return name !== c ? `${countryAbbr(c)} (${name})` : c;
  });
  el.textContent = names.join(', ');
}

async function saveSecGeoblock() {
  const enabled = document.getElementById('secGeoEnabled')?.checked || false;
  const mode = document.getElementById('secGeoMode')?.value || 'allowlist';
  const countries = (document.getElementById('secGeoCountries')?.value || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  const res = await api('PUT', '/api/admin/geoblocking', { enabled, mode, countries });
  if (res.ok) {
    showNotification('success', t('security_geo_saved')||'Geoblocking settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save geoblocking settings');
  }
}

async function saveSecEncryption() {
  const enabled = document.getElementById('secEncryptionEnabled')?.checked || false;
  const res = await api('PUT', '/api/admin/encryption', { enabled });
  if (res.ok) {
    showNotification('success', t('security_encryption_saved')||'Backup encryption settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save encryption settings');
  }
}

// ── IP Blacklist ──────────────────────────────────────────────────────────────
let _ipBlacklistData = { enabled: false, entries: [] };

async function loadIpBlacklist() {
  try {
    const data = await apiGet('/api/admin/ip-blacklist');
    if (data) _ipBlacklistData = data;
  } catch { /* ignore */ }
  const enabledEl = document.getElementById('secIpBlEnabled');
  if (enabledEl) enabledEl.checked = _ipBlacklistData.enabled;
  renderIpBlacklistEntries();
}

function renderIpBlacklistEntries() {
  const el = document.getElementById('secIpBlEntries');
  if (!el) return;
  const entries = _ipBlacklistData.entries || [];
  if (!entries.length) {
    el.innerHTML = `<p style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px;text-align:center">${t('security_ip_bl_empty')||'No blocked IPs.'}</p>`;
    return;
  }
  el.innerHTML = entries.map((e, i) => `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--border);font-size:var(--fs-xs)">
    <span style="font-weight:600;font-family:monospace;min-width:140px">${escHtml(e.ip)}</span>
    <span style="flex:1;color:var(--text-dim)">${escHtml(e.reason||'')}</span>
    <span style="color:var(--text-dim);font-size:10px;white-space:nowrap">${e.added_by ? escHtml(e.added_by) : ''}${e.added_at ? ' · ' + new Date(e.added_at).toLocaleDateString() : ''}</span>
    <button class="btn btn-sm" style="padding:1px 6px;font-size:10px;background:#E74C3C;color:#fff" data-action="removeIpBlacklistEntry" data-arg="${i}">×</button>
  </div>`).join('');
}

async function addIpBlacklistEntry() {
  const ip = document.getElementById('secIpBlNewIp')?.value?.trim();
  if (!ip) { showError(t('security_ip_required')||'IP address is required'); return; }
  const reason = document.getElementById('secIpBlNewReason')?.value?.trim() || '';
  const res = await apiPost('/api/admin/ip-blacklist/add', { ip, reason });
  if (res.ok) {
    const data = await res.json();
    _ipBlacklistData = data;
    renderIpBlacklistEntries();
    document.getElementById('secIpBlNewIp').value = '';
    document.getElementById('secIpBlNewReason').value = '';
    showNotification('success', (t('security_ip_bl_added')||'IP added to blacklist') + ': ' + ip);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to add IP');
  }
}

async function removeIpBlacklistEntry(idx) {
  const index = parseInt(idx, 10);
  const entry = (_ipBlacklistData.entries || [])[index];
  if (!entry) return;
  const res = await apiPost('/api/admin/ip-blacklist/remove', { ip: entry.ip });
  if (res.ok) {
    const data = await res.json();
    _ipBlacklistData = data;
    renderIpBlacklistEntries();
    showNotification('success', (t('security_ip_bl_removed')||'IP removed from blacklist') + ': ' + entry.ip);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to remove IP');
  }
}

async function saveIpBlacklist() {
  _ipBlacklistData.enabled = document.getElementById('secIpBlEnabled')?.checked || false;
  const res = await api('PUT', '/api/admin/ip-blacklist', _ipBlacklistData);
  if (res.ok) {
    showNotification('success', t('security_ip_bl_saved')||'IP blacklist settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save IP blacklist');
  }
}

function exportIpBlacklist() {
  window.open('/api/admin/ip-blacklist/export', '_blank');
}

// Import file handler — bound after sidebar renders
function _setupIpBlImport() {
  const fileInput = document.getElementById('secIpBlImportFile');
  if (!fileInput || fileInput._bound) return;
  fileInput._bound = true;
  fileInput.addEventListener('change', async function() {
    const file = this.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiPost('/api/admin/ip-blacklist/import?mode=merge', data);
      if (res.ok) {
        _ipBlacklistData = await res.json();
        const enabledEl = document.getElementById('secIpBlEnabled');
        if (enabledEl) enabledEl.checked = _ipBlacklistData.enabled;
        renderIpBlacklistEntries();
        showNotification('success', (t('security_ip_bl_imported')||'IP blacklist imported') + ` (${(_ipBlacklistData.entries||[]).length} entries)`);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to import');
      }
    } catch (e) { showError('Invalid JSON file: ' + e.message); }
    this.value = '';
  });
}

async function restartBackend() {
  if (!confirm(t('danger_restart_confirm')||'Are you sure you want to restart? This will interrupt all active sessions.')) return;
  const res = await api('POST', '/api/admin/restart-backend', {});
  if (res.ok) {
    showNotification('success', 'Backend restart initiated. Reconnecting…');
    setTimeout(() => { window.location.reload(); }, 3000);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to restart backend');
  }
}

async function restartServer() {
  if (!confirm(t('danger_server_confirm')||'Are you sure you want to restart the server? ALL services will be down temporarily.')) return;
  const res = await api('POST', '/api/admin/restart-server', {});
  if (res.ok) {
    showNotification('success', 'Server restart initiated. Please wait…');
    setTimeout(() => { window.location.reload(); }, 10000);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to restart server');
  }
}

// ── TLS Config UI ─────────────────────────────────────────────────────────────
async function _initTLSConfigUI() {
  const statusEl = document.getElementById('tlsCurrentStatus');
  try {
    const cfg = await apiGet('/api/integrations/tls');
    if (!cfg) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('tlsCertFile', cfg.cert_file);
    setVal('tlsKeyFile',  cfg.key_file);
    if (statusEl) {
      const active = cfg.cert_file && cfg.key_file;
      statusEl.innerHTML = active
        ? `<span style="color:#27ae60">✓ TLS configured</span> — cert: <code>${escHtml(cfg.cert_file)}</code>`
        : `<span style="color:var(--text-dim)">TLS not configured (server running on HTTP)</span>`;
    }
  } catch {
    if (statusEl) statusEl.textContent = 'Could not load TLS status.';
  }
}

async function saveTLSConfig() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const cfg = {
    cert_file: val('tlsCertFile'),
    key_file:  val('tlsKeyFile'),
  };
  const res = await api('PUT', '/api/integrations/tls', cfg);
  if (res.ok) {
    showNotification('success', 'TLS config saved — restart the server to apply');
    _initTLSConfigUI();
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save TLS config');
  }
}

// ── API Keys UI ─────────────────────────────────────────────────────────────
async function _loadAPIKeys() {
  const listEl = document.getElementById('apiKeyList');
  if (!listEl) return;
  try {
    const keys = await apiGet('/api/apikeys');
    if (!keys || !keys.length) {
      listEl.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-xs)">${t('api_keys_empty')||'No API keys yet.'}</p>`;
      return;
    }
    listEl.innerHTML = keys.map(k => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <strong style="font-size:var(--fs-sm)">${escHtml(k.name)}</strong>
            <span class="role-badge role-${k.role||'read'}" style="font-size:9px;padding:1px 5px">${escHtml(k.role||'read')}</span>
            <select class="apikey-route-select" data-keyid="${k.id}" style="font-size:9px;padding:1px 4px;border-radius:3px;background:${k.route_mode==='external_event'?'#6C5CE7':'var(--bg3)'};color:${k.route_mode==='external_event'?'#fff':'var(--text)'};border:1px solid var(--border);cursor:pointer">
              <option value="message_archive" ${k.route_mode!=='external_event'?'selected':''}>📨 ${t('api_key_route_messages')||'Messages'}</option>
              <option value="external_event" ${k.route_mode==='external_event'?'selected':''}>🔌 ${t('api_key_route_calendar')||'Calendar'}</option>
            </select>
            ${k.save_raw_key ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg3);border:1px solid var(--border)">🔓 ${t('api_key_revealable')||'Revealable'}</span>` : ''}
          </div>
          ${k.description ? `<div style="color:var(--text-dim);font-size:var(--fs-xs)">${escHtml(k.description)}</div>` : ''}
          <div style="color:var(--text-dim);font-size:10px;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
            <span>${t('api_key_created_at')||'Created'}: ${k.created_at ? new Date(k.created_at).toLocaleString() : '\u2014'}</span>
            <span>${t('api_key_last_used')||'Last used'}: ${k.last_used_at ? new Date(k.last_used_at).toLocaleString() : (t('api_key_never')||'Never')}</span>
            ${k.last_used_ip ? `<span>IP: ${escHtml(k.last_used_ip)}</span>` : ''}
            <span>${t('api_key_usage_count')||'Uses'}: ${k.usage_count || 0}</span>
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" data-action="revealAPIKey" data-arg="${k.id}" style="font-size:10px" title="${t('api_key_show')||'Show key value'}">👁</button>
          <button class="btn btn-danger btn-sm" data-action="deleteAPIKey" data-arg="${k.id}">${t('btn_delete')||'Delete'}</button>
        </div>
      </div>
    `).join('');
    _bindActions(listEl);
    // Bind route-mode dropdowns (CSP-safe, no inline handlers)
    listEl.querySelectorAll('.apikey-route-select').forEach(sel => {
      sel.addEventListener('change', () => _updateAPIKeyRoute(parseInt(sel.dataset.keyid), sel.value));
    });
  } catch {
    listEl.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-xs)">${t('api_keys_load_error')||'Failed to load API keys.'}</p>`;
  }
}

window._updateAPIKeyRoute = async function(id, routeMode) {
  try {
    const res = await apiPut('/api/apikeys/' + id, { route_mode: routeMode });
    if (res.ok) {
      if (typeof showNotification === 'function') showNotification('success', t('api_key_route_updated')||'Route updated');
      await _loadAPIKeys();
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || t('api_key_update_error')||'Failed to update');
    }
  } catch (e) { showError(e.message); }
};

async function revealAPIKey(id) {
  try {
    const res = await apiGet('/api/apikeys/' + id + '/reveal');
    if (!res || !res.key) { showError(res?.error || 'Failed to reveal key'); return; }
    const keyModal = document.createElement('div');
    keyModal.className = 'modal-overlay open';
    keyModal.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header"><h3>${t('api_key_reveal')||'API Key'}</h3>
          <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button></div>
        <div class="modal-body">
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" value="${escHtml(res.key)}" readonly
              style="flex:1;font-family:monospace;font-size:var(--fs-sm);padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);user-select:all"
              data-action="selectSelf" data-arg-el data-event="click">
            <button class="btn btn-primary btn-sm" id="revealCopyBtn">📋 ${t('btn_copy')||'Copy'}</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
        </div>
      </div>`;
    document.body.appendChild(keyModal);
    _bindActions(keyModal);
    const _revealKey = res.key;
    document.getElementById('revealCopyBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(_revealKey).catch(() => {});
    });
  } catch (e) { showError(e.message || 'Failed to reveal key'); }
}

async function createAPIKey() {
  const name = document.getElementById('newAPIKeyName')?.value?.trim();
  if (!name) { showError('Key name is required'); return; }
  const comment = document.getElementById('newAPIKeyComment')?.value?.trim() || '';
  const role = document.getElementById('newAPIKeyRole')?.value || 'teammember';
  const saveRawKey = document.getElementById('newAPIKeySaveRaw')?.checked || false;
  const routeMode = document.getElementById('newAPIKeyRoute')?.value || 'message_archive';
  const res = await apiPost('/api/apikeys', {name, description: comment, role, save_raw_key: saveRawKey, route_mode: routeMode});
  if (res.ok) {
    const key = await res.json();
    // Show the key in a modal with a copyable field
    const keyModal = document.createElement('div');
    keyModal.className = 'modal-overlay open';
    keyModal.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header"><h3>${t('api_key_created')||'API Key Created'}</h3>
          <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button></div>
        <div class="modal-body">
          <p style="font-size:var(--fs-sm);margin-bottom:8px">${t('api_key_copy_warning')||'Copy this key now — it will not be shown again.'}</p>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="apiKeyResult" value="${escHtml(key.key)}" readonly
              style="flex:1;font-family:monospace;font-size:var(--fs-sm);padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);user-select:all"
              data-action="selectSelf" data-arg-el data-event="click">
            <button class="btn btn-primary btn-sm" data-action="copyApiKey">📋 ${t('btn_copy')||'Copy'}</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
        </div>
      </div>`;
    document.body.appendChild(keyModal);
    _bindActions(keyModal);
    document.getElementById('newAPIKeyName').value = '';
    const commentEl = document.getElementById('newAPIKeyComment');
    if (commentEl) commentEl.value = '';
    await _loadAPIKeys();
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to create API key');
  }
}

async function deleteAPIKey(id) {
  if (!confirm(t('api_key_delete_confirm')||'Delete this API key? It will stop working immediately.')) return;
  const res = await api('DELETE', `/api/apikeys/${id}`, null);
  if (res.ok) {
    showNotification('success', t('api_key_deleted')||'API key deleted');
    await _loadAPIKeys();
  } else {
    showError('Failed to delete API key');
  }
}

// ── Connectors list UI ──────────────────────────────────────────────────────
const _connectorTypes = [
  { name: 'google_calendar', label: 'Google Calendar', icon: '📅', fields: [
    { key: 'credentials_json', label: 'Service Account JSON', type: 'textarea', placeholder: 'Paste service account JSON key' },
    { key: 'calendar_id', label: 'Calendar ID', type: 'text', placeholder: 'primary or calendar@group.calendar.google.com' },
    { key: 'poll_interval_sec', label: 'Poll Interval (seconds)', type: 'number', placeholder: '300' },
  ]},
  { name: 'github_gitlab', label: 'GitHub / GitLab', icon: '🐙', fields: [
    { key: 'provider', label: 'Provider', type: 'select', options: ['github', 'gitlab'] },
    { key: 'base_url', label: 'API Base URL', type: 'text', placeholder: 'https://api.github.com' },
    { key: 'token', label: 'Access Token', type: 'password', placeholder: 'ghp_...' },
    { key: 'owner', label: 'Owner / Namespace', type: 'text', placeholder: 'org-or-user' },
    { key: 'repo', label: 'Repository', type: 'text', placeholder: 'repo-name' },
    { key: 'sync_commits', label: 'Sync Commits', type: 'checkbox' },
    { key: 'sync_issues', label: 'Sync Issues', type: 'checkbox' },
    { key: 'sync_pull_requests', label: 'Sync Pull Requests', type: 'checkbox' },
  ]},
  { name: 'jira', label: 'Jira', icon: '🔧', fields: [
    { key: 'base_url', label: 'Jira Base URL', type: 'text', placeholder: 'https://yourteam.atlassian.net' },
    { key: 'email', label: 'Email', type: 'text', placeholder: 'user@example.com' },
    { key: 'api_token', label: 'API Token', type: 'password', placeholder: 'API token from Jira' },
    { key: 'project_key', label: 'Project Key', type: 'text', placeholder: 'PROJ' },
    { key: 'jql', label: 'JQL Filter (optional)', type: 'text', placeholder: 'status changed after -1d' },
  ]},
  { name: 'stix_taxii', label: 'STIX / TAXII', icon: '🛡', fields: [
    { key: 'taxii_url', label: 'TAXII Server URL', type: 'text', placeholder: 'https://taxii.example.com/taxii2/' },
    { key: 'collection_id', label: 'Collection ID', type: 'text', placeholder: 'collection-uuid' },
    { key: 'api_key', label: 'API Key (optional)', type: 'password', placeholder: '' },
    { key: 'username', label: 'Username (optional)', type: 'text', placeholder: '' },
    { key: 'password', label: 'Password (optional)', type: 'password', placeholder: '' },
  ]},
  { name: 'ldap', label: 'LDAP / Active Directory', icon: '👥', fields: [
    { key: 'server_url', label: 'LDAP Server URL', type: 'text', placeholder: 'ldap://ldap.example.com:389' },
    { key: 'bind_dn', label: 'Bind DN', type: 'text', placeholder: 'cn=admin,dc=example,dc=com' },
    { key: 'bind_password', label: 'Bind Password', type: 'password', placeholder: '' },
    { key: 'base_dn', label: 'Search Base DN', type: 'text', placeholder: 'ou=users,dc=example,dc=com' },
    { key: 'user_filter', label: 'User Filter', type: 'text', placeholder: '(objectClass=person)' },
  ]},
  { name: 'nato_adatp3', label: 'NATO ADatP-3 / MIP', icon: '🎖', fields: [
    { key: 'endpoint_url', label: 'Endpoint URL', type: 'text', placeholder: 'https://mip-gateway.example.com/adatp3' },
    { key: 'certificate_path', label: 'Client Certificate Path', type: 'text', placeholder: '/path/to/cert.pem' },
    { key: 'key_path', label: 'Client Key Path', type: 'text', placeholder: '/path/to/key.pem' },
    { key: 'community_of_interest', label: 'Community of Interest', type: 'text', placeholder: '' },
  ]},
  { name: 'generic_webhook', label: 'Generic Webhook', icon: '🔗', fields: [
    { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://example.com/webhook' },
    { key: 'method', label: 'HTTP Method', type: 'select', options: ['POST', 'PUT', 'PATCH'] },
    { key: 'secret', label: 'Secret / Auth Token (optional)', type: 'password', placeholder: '' },
    { key: 'headers', label: 'Custom Headers (JSON, optional)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
    { key: 'poll_url', label: 'Poll URL (optional, for inbound)', type: 'text', placeholder: 'https://example.com/events' },
    { key: 'poll_interval_sec', label: 'Poll Interval (seconds)', type: 'number', placeholder: '300' },
  ]},
];

async function _loadConnectorList() {
  const listEl = document.getElementById('connectorList');
  if (!listEl) return;
  if (state.user?.role !== 'admin') {
    listEl.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-xs)">${t('connectors_admin_only')||'Connector configuration is available to administrators only.'}</p>`;
    return;
  }
  try {
    const configs = await apiGet('/api/integrations/connectors');
    let html = '';
    if (configs && configs.length) {
      html += configs.map(c => {
        const cType = _connectorTypes.find(ct => ct.name === c.name);
        const icon = cType ? cType.icon : '🔌';
        const label = cType ? cType.label : c.name;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
            <span style="font-size:16px">${icon}</span>
            <div style="flex:1;min-width:0">
              <div>
                <strong style="font-size:var(--fs-sm)">${escHtml(label)}</strong>
                <span style="color:${c.enabled ? 'var(--accent)' : 'var(--text-dim)'};font-size:var(--fs-xs);margin-left:6px">${c.enabled ? '● Active' : '○ Disabled'}</span>
              </div>
              <div style="color:var(--text-dim);font-size:10px;display:flex;gap:8px;flex-wrap:wrap;margin-top:1px">
                ${c.last_used_at ? `<span>Last: ${new Date(c.last_used_at).toLocaleString()}</span>` : ''}
                ${c.last_used_ip ? `<span>IP: ${escHtml(c.last_used_ip)}</span>` : ''}
                ${c.usage_count ? `<span>Polls: ${c.usage_count}</span>` : ''}
                ${c.last_error ? `<span style="color:var(--red)">⚠ ${escHtml(c.last_error)}</span>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-sm btn-secondary" data-action="_editConnector" data-arg="${escHtml(c.name)}" title="Configure">⚙</button>
            <button class="btn btn-sm ${c.enabled ? 'btn-danger' : 'btn-secondary'}" data-action="toggleConnector" data-arg="${escHtml(c.name)}">
              ${c.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>`;
      }).join('');
    } else {
      html += `<p style="color:var(--text-dim);font-size:var(--fs-xs);margin-bottom:8px">${t('connectors_none')||'No connectors configured.'}</p>`;
    }
    // Add connector button with dropdown
    html += `<div style="margin-top:8px">
      <button class="btn btn-sm btn-secondary" data-action="_showAddConnectorMenu" id="addConnectorBtn">+ ${t('connector_add')||'Add Connector'}</button>
      <div id="addConnectorMenu" style="display:none;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:4px;max-width:280px">
        ${_connectorTypes.map(ct => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:var(--radius)" class="connector-type-option"
            data-action="_addConnector" data-arg="${ct.name}">
            <span style="font-size:16px">${ct.icon}</span>
            <span style="font-size:var(--fs-sm)">${escHtml(ct.label)}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
    listEl.innerHTML = html;
    _bindActions(listEl);
  } catch {
    listEl.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load connectors.</p>';
  }
}

function _showAddConnectorMenu() {
  const menu = document.getElementById('addConnectorMenu');
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

async function _addConnector(typeName) {
  const menu = document.getElementById('addConnectorMenu');
  if (menu) menu.style.display = 'none';
  const cType = _connectorTypes.find(ct => ct.name === typeName);
  if (!cType) return;
  // Create a new connector config with defaults
  const cfg = { name: typeName, enabled: false, config: {} };
  try {
    await apiPut('/api/integrations/connectors', cfg);
    showNotification('success', `${cType.label} connector added`);
    await _loadConnectorList();
    // Open config editor
    _editConnector(typeName);
  } catch (e) {
    showError('Failed to add connector');
  }
}

async function _editConnector(name) {
  const cType = _connectorTypes.find(ct => ct.name === name);
  if (!cType) { showError('Unknown connector type'); return; }
  let configs;
  try {
    configs = await apiGet('/api/integrations/connectors');
  } catch { configs = []; }
  const cfg = (configs || []).find(c => c.name === name);
  const cfgData = cfg && cfg.config ? (typeof cfg.config === 'string' ? JSON.parse(cfg.config) : cfg.config) : {};

  let fieldsHtml = cType.fields.map(f => {
    const val = cfgData[f.key] || '';
    if (f.type === 'textarea') {
      return `<div style="margin-bottom:6px">
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(f.label)}</label>
        <textarea id="conn_${f.key}" class="input" rows="3" style="width:100%;font-size:var(--fs-xs);resize:vertical" placeholder="${escHtml(f.placeholder||'')}">${escHtml(typeof val === 'string' ? val : JSON.stringify(val, null, 2))}</textarea>
      </div>`;
    }
    if (f.type === 'select') {
      return `<div style="margin-bottom:6px">
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(f.label)}</label>
        <select id="conn_${f.key}" class="input" style="width:100%;font-size:var(--fs-xs)">
          ${f.options.map(o => `<option value="${escHtml(o)}" ${val === o ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}
        </select>
      </div>`;
    }
    if (f.type === 'checkbox') {
      return `<div style="margin-bottom:6px;display:flex;align-items:center;gap:6px">
        <input type="checkbox" id="conn_${f.key}" ${val ? 'checked' : ''}>
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(f.label)}</label>
      </div>`;
    }
    return `<div style="margin-bottom:6px">
      <label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(f.label)}</label>
      <input type="${f.type || 'text'}" id="conn_${f.key}" class="input" style="width:100%;font-size:var(--fs-xs)" value="${escHtml(String(val))}" placeholder="${escHtml(f.placeholder||'')}">
    </div>`;
  }).join('');

  const html = `<div style="max-width:500px">
    <h3>${cType.icon} ${escHtml(cType.label)} — ${t('connector_config')||'Configuration'}</h3>
    <div style="margin-bottom:8px;display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="connEnabled" ${cfg && cfg.enabled ? 'checked' : ''}>
      <label style="font-size:var(--fs-sm)">${t('connector_enabled')||'Enabled'}</label>
    </div>
    ${fieldsHtml}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary btn-sm" data-action="_saveConnectorConfig" data-arg="${escHtml(name)}">✔ ${t('connector_save')||'Save'}</button>
      <button class="btn btn-secondary btn-sm" data-action="closeModal" data-arg="connectorConfigModal">✖ ${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;

  let overlay = document.getElementById('connectorConfigModal');
  if (overlay) overlay.remove();
  document.body.insertAdjacentHTML('beforeend',
    `<div class="modal-overlay" id="connectorConfigModal"><div class="modal" style="width:520px;max-width:96vw;padding:20px">${html}</div></div>`);
  const el = document.getElementById('connectorConfigModal');
  if (el) {
    void el.offsetHeight;
    el.classList.add('open');
    el.addEventListener('click', function(e) { if (e.target === el) closeModal('connectorConfigModal'); });
    if (typeof _bindActions === 'function') _bindActions(el);
  }
}

async function _saveConnectorConfig(name) {
  const cType = _connectorTypes.find(ct => ct.name === name);
  if (!cType) return;
  const config = {};
  for (const f of cType.fields) {
    const el = document.getElementById('conn_' + f.key);
    if (!el) continue;
    if (f.type === 'checkbox') {
      config[f.key] = el.checked;
    } else if (f.type === 'number') {
      config[f.key] = parseInt(el.value) || 0;
    } else if (f.type === 'textarea' && f.key.endsWith('_json')) {
      try { config[f.key] = JSON.parse(el.value); } catch { config[f.key] = el.value; }
    } else {
      config[f.key] = el.value;
    }
  }
  const enabled = document.getElementById('connEnabled')?.checked || false;
  try {
    const res = await apiPut('/api/integrations/connectors', { name, enabled, config });
    if (res.ok) {
      showNotification('success', `${cType.label} configuration saved`);
      closeModal('connectorConfigModal');
      await _loadConnectorList();
    } else {
      showError('Failed to save connector configuration');
    }
  } catch {
    showError('Failed to save connector configuration');
  }
}

async function toggleConnector(name) {
  const configs = await apiGet('/api/integrations/connectors').catch(() => []);
  const cfg = (configs || []).find(c => c.name === name);
  if (!cfg) return;
  cfg.enabled = !cfg.enabled;
  const res = await apiPut('/api/integrations/connectors', cfg);
  if (res.ok) {
    showNotification('success', `Connector ${name} ${cfg.enabled ? 'enabled' : 'disabled'}`);
    await _loadConnectorList();
  }
}

// ── Federated IdPs ──────────────────────────────────────────────────────────
async function _loadFederatedIdPs() {
  const el = document.getElementById('federatedIdPList');
  if (!el) return;
  try {
    const idps = await apiGet('/api/federation/idps');
    if (!idps || !idps.length) {
      el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No federated identity providers configured.</p>';
      return;
    }
    el.innerHTML = idps.map(idp => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
        <div>
          <strong style="font-size:var(--fs-sm)">${escHtml(idp.name)}</strong>
          <span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:4px">(${idp.protocol.toUpperCase()})</span>
          <span style="color:${idp.enabled?'var(--accent)':'var(--text-dim)'};font-size:var(--fs-xs);margin-left:4px">${idp.enabled?'● Active':'○ Disabled'}</span>
          ${idp.trust_realm ? `<br><span style="font-size:10px;color:var(--text-dim)">Realm: ${escHtml(idp.trust_realm)}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-danger" data-action="deleteFederatedIdP" data-arg="${idp.id}">✕</button>
      </div>
    `).join('');
    _bindActions(el);
  } catch {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load IdPs.</p>';
  }
}

async function saveFederatedIdP() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const idp = {
    id: val('fedIdpId'), name: val('fedIdpName'), protocol: val('fedIdpProtocol'),
    issuer: val('fedIdpIssuer'), client_id: val('fedIdpClientId'),
    client_secret: val('fedIdpSecret'), trust_realm: val('fedIdpRealm'),
    default_role: val('fedIdpRole'), enabled: true,
    allowed_domains: val('fedIdpDomains') ? val('fedIdpDomains').split(',').map(d=>d.trim()) : []
  };
  if (!idp.id || !idp.name) { showError('ID and name are required'); return; }
  const res = await apiPut('/api/federation/idps', idp);
  if (res.ok) { showNotification('success','IdP saved'); _loadFederatedIdPs(); }
  else { showError('Failed to save IdP'); }
}

async function deleteFederatedIdP(id) {
  if (!confirm('Delete this identity provider?')) return;
  const res = await api('DELETE', `/api/federation/idps/${id}`, null);
  if (res.ok) { showNotification('success','IdP deleted'); _loadFederatedIdPs(); }
}

async function _loadTrustRealms() {
  const el = document.getElementById('trustRealmList');
  if (!el) return;
  try {
    const realms = await apiGet('/api/federation/realms');
    if (!realms || !realms.length) {
      el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No trust realms configured.</p>';
      return;
    }
    el.innerHTML = realms.map(r => `
      <div style="padding:4px 6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:3px;font-size:var(--fs-xs)">
        <strong>${escHtml(r.name)}</strong> <span style="color:var(--text-dim)">(${escHtml(r.id)})</span>
        <span style="margin-left:6px;color:var(--text-dim)">Max role: ${r.max_role||'teammember'}</span>
      </div>
    `).join('');
  } catch {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load realms.</p>';
  }
}

// ── Rooms / Resources ────────────────────────────────────────────────────────
async function _loadRoomList() {
  const el = document.getElementById('roomList');
  if (!el) return;
  try {
    const rooms = await apiGet('/api/rooms');
    if (!rooms || !rooms.length) {
      el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No rooms or resources configured.</p>';
      return;
    }
    el.innerHTML = rooms.map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
        <div>
          <strong style="font-size:var(--fs-sm)">${escHtml(r.name)}</strong>
          <span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:4px">${r.type||'room'}${r.capacity ? ' ('+r.capacity+' seats)' : ''}</span>
          ${r.location ? `<br><span style="font-size:10px;color:var(--text-dim)">${escHtml(r.location)}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-danger" data-action="deleteRoom" data-arg="${r.id}">✕</button>
      </div>
    `).join('');
    _bindActions(el);
  } catch {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load rooms.</p>';
  }
}

async function saveRoom() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const room = {
    name: val('roomName'), type: val('roomType'),
    location: val('roomLocation'),
    capacity: parseInt(val('roomCapacity')) || 0,
    enabled: true
  };
  if (!room.name) { showError('Room name required'); return; }
  const res = await apiPut('/api/rooms', room);
  if (res.ok) { showNotification('success','Room saved'); _loadRoomList(); }
  else { showError('Failed to save room'); }
}

async function deleteRoom(id) {
  if (!confirm('Delete this room/resource?')) return;
  const res = await api('DELETE', `/api/rooms/${id}`, null);
  if (res.ok) { showNotification('success','Room deleted'); _loadRoomList(); }
}

// ── Custom Resource Type actions ────────────────────────────────────────────

async function saveCustomResourceType() {
  const key = (document.getElementById('crtKey')?.value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const label = (document.getElementById('crtLabel')?.value || '').trim();
  const icon = (document.getElementById('crtIcon')?.value || '').trim() || '📦';
  if (!key || !label) { showError(t('resource_type_key_label_required')||'Key and display name are required.'); return; }
  const res = await apiPut('/api/custom-resource-types', { key, label, icon });
  if (res.ok) {
    state._customResourceTypes = null; // force reload
    showNotification('success', (t('resource_type_saved')||'Resource type saved'));
    renderSidebar();
  } else {
    const err = await res.json().catch(()=>({}));
    showError(err.error || 'Failed to save');
  }
}

async function deleteCustomResourceType(id) {
  if (!confirm(t('confirm_delete_resource_type')||'Delete this resource type? Resources of this type will remain but the tab will be removed.')) return;
  const res = await api('DELETE', `/api/custom-resource-types/${id}`, null);
  if (res.ok) {
    state._customResourceTypes = null; // force reload
    showNotification('success', (t('resource_type_deleted')||'Resource type deleted'));
    renderSidebar();
  }
}

// ── Ready Check action ──────────────────────────────────────────────────────

async function runReadyCheck() {
  const res = await apiGet('/api/ready-check');
  if (!res) { showError('Failed to run ready check'); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  const notReady = res.not_ready || [];
  modal.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header" style="background:${res.ready ? 'var(--success,#27AE60)' : 'var(--warning,#E67E22)'};border-radius:var(--radius) var(--radius) 0 0">
        <h3 style="color:#fff">${res.ready ? '✅ ' + (t('ready_check_pass')||'All Clear') : '⚠ ' + (t('ready_check_fail')||'Not Ready')}</h3>
        <button class="modal-close" style="color:#fff" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:60vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);margin-bottom:8px">
          ${res.ready
            ? (t('ready_check_pass_desc')||'All activities have been moved from "planned" status. Preparations appear complete.')
            : (t('ready_check_fail_desc')||'The following activities are still in "planned" status:')}
        </p>
        ${notReady.length > 0 ? `
          <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
            <thead><tr style="background:var(--bg3)">
              <th style="padding:4px 8px;text-align:left">ID</th>
              <th style="padding:4px 8px;text-align:left">${t('lv_title')||'Title'}</th>
              <th style="padding:4px 8px;text-align:left">${t('lv_status')||'Status'}</th>
              <th style="padding:4px 8px;text-align:left">${t('lv_start')||'Start'}</th>
            </tr></thead>
            <tbody>${notReady.map(ev => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:4px 8px">#${ev.id}</td>
                <td style="padding:4px 8px">${escHtml(ev.title)}</td>
                <td style="padding:4px 8px"><span class="status-badge status-planned">${ev.status}</span></td>
                <td style="padding:4px 8px;color:var(--text-dim)">${ev.start_time ? fmtDateTime(new Date(ev.start_time)) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : ''}
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:8px">${t('ready_check_total')||'Total activities'}: ${res.total}</p>
      </div>
      <div class="modal-footer">
        ${!res.ready && notReady.length > 0 ? `<button class="btn btn-warning btn-sm" id="btnForceActivateAll" style="margin-right:auto;background:#E67E22;color:#fff;border:none">⚡ ${t('ready_check_force_activate')||'Force Activate All Planned'}</button>` : ''}
        <button class="btn btn-primary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  // Force activate button
  const forceBtn = modal.querySelector('#btnForceActivateAll');
  if (forceBtn) {
    forceBtn.addEventListener('click', async () => {
      if (!confirm(t('ready_check_force_confirm') || 'Change all planned activities to active status?')) return;
      let changed = 0;
      for (const ev of notReady) {
        try {
          await patchEventStatus(ev.id, 'active', '');
          changed++;
        } catch (e) { /* skip */ }
      }
      showNotification('success', (t('ready_check_force_done') || 'All planned activities set to active') + ` (${changed})`);
      modal.remove();
      await refreshAll();
    });
  }
}

// ── Ready Check popup (wraps existing runReadyCheck) ────────────────────────
function openReadyCheckPopup() {
  runReadyCheck();
}

// ── Tag Cloud / Tag Input Utilities ────────────────────────────────────────
// Reusable tag cloud component for polls, ready checks, etc.

const _tagCloudColors = [
  '#e57373','#64b5f6','#81c784','#ffb74d','#ba68c8',
  '#4dd0e1','#ff8a65','#aed581','#f06292','#7986cb',
  '#a1887f','#90a4ae','#dce775','#4db6ac','#fff176'
];

function _tagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash) + tag.charCodeAt(i);
  return _tagCloudColors[Math.abs(hash) % _tagCloudColors.length];
}

/**
 * Render a tag input with tag cloud below.
 * @param {HTMLElement} parentEl - container to append into
 * @param {string} inputId - ID for the text input
 * @param {string} placeholder - placeholder text
 * @returns {{ inputEl: HTMLInputElement, getSelectedTags: () => string[] }}
 */
function _renderTagInput(parentEl, inputId, placeholder) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-bottom:8px';

  const label = document.createElement('label');
  label.style.cssText = 'font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;display:block;margin-bottom:4px';
  label.textContent = t('tags_title') || 'Tags';
  wrapper.appendChild(label);

  const chipsRow = document.createElement('div');
  chipsRow.id = inputId + '_chips';
  chipsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px';
  wrapper.appendChild(chipsRow);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = inputId;
  input.placeholder = placeholder || t('tags_placeholder') || 'Tags (comma-separated)';
  input.style.cssText = 'width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)';
  wrapper.appendChild(input);

  const cloudContainer = document.createElement('div');
  cloudContainer.id = inputId + '_cloud';
  cloudContainer.style.cssText = 'margin-top:6px';
  wrapper.appendChild(cloudContainer);

  parentEl.appendChild(wrapper);

  const selectedTags = new Set();

  function renderChips() {
    chipsRow.innerHTML = '';
    selectedTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.style.cssText = `display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:${_tagColor(tag)};cursor:default`;
      chip.textContent = tag;
      const x = document.createElement('span');
      x.textContent = '\u00d7';
      x.style.cssText = 'cursor:pointer;font-weight:bold;margin-left:2px';
      x.addEventListener('click', () => { selectedTags.delete(tag); renderChips(); });
      chip.appendChild(x);
      chipsRow.appendChild(chip);
    });
  }

  // Handle comma-separated input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.replace(/,/g, '').trim();
      if (val) { selectedTags.add(val); renderChips(); }
      input.value = '';
    }
  });
  input.addEventListener('blur', () => {
    const val = input.value.replace(/,/g, '').trim();
    if (val) { selectedTags.add(val); renderChips(); }
    input.value = '';
  });

  // Fetch and render cloud
  _renderTagCloud(cloudContainer, selectedTags, renderChips);

  return {
    inputEl: input,
    getSelectedTags: () => [...selectedTags],
    addTag: (tag) => { selectedTags.add(tag); renderChips(); }
  };
}

/**
 * Fetch tags from /api/tags/cloud and render as clickable colored chips.
 * Clicking a tag adds it to the selectedTags set and re-renders chips.
 */
async function _renderTagCloud(container, selectedTags, renderChipsCallback) {
  try {
    const resp = await api('GET', '/api/tags/cloud');
    if (!resp.ok) { container.innerHTML = ''; return; }
    const tags = await resp.json();
    if (!tags || tags.length === 0) {
      container.innerHTML = `<span style="font-size:var(--fs-xs);color:var(--text-dim)">${t('tags_no_tags') || 'No tags yet'}</span>`;
      return;
    }
    const cloudLabel = document.createElement('div');
    cloudLabel.style.cssText = 'font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:3px';
    cloudLabel.textContent = t('tags_cloud') || 'Tag Cloud';
    container.appendChild(cloudLabel);

    const cloudRow = document.createElement('div');
    cloudRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
    (Array.isArray(tags) ? tags : []).forEach(tagObj => {
      const tagName = typeof tagObj === 'string' ? tagObj : (tagObj.tag || tagObj.name || '');
      if (!tagName) return;
      const chip = document.createElement('span');
      chip.style.cssText = `display:inline-block;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:${_tagColor(tagName)};cursor:pointer;opacity:0.8;transition:opacity 0.15s`;
      chip.textContent = tagName + (tagObj.count ? ` (${tagObj.count})` : '');
      chip.title = t('tags_add') || 'Add Tag';
      chip.addEventListener('mouseenter', () => { chip.style.opacity = '1'; });
      chip.addEventListener('mouseleave', () => { chip.style.opacity = '0.8'; });
      chip.addEventListener('click', () => {
        selectedTags.add(tagName);
        renderChipsCallback();
      });
      cloudRow.appendChild(chip);
    });
    container.appendChild(cloudRow);
  } catch (e) {
    console.warn('Failed to load tag cloud', e);
    container.innerHTML = '';
  }
}

// ── Person Ready Check ─────────────────────────────────────────────────────
// Tracks per-participant readiness with traffic-light status
let _personReadyChecks = []; // { id, event_id?, created_by, participants: [{user_id, user_name, status}], created_at }

async function openPersonReadyCheckPopup() {
  const isCreator = hasRole2(state.user.role, 'teamlead');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:700px">
      <div class="modal-header">
        <h3>🙋 ${t('person_ready_check_title')||'Person Ready Check'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto" id="personReadyCheckBody">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('person_ready_check_desc')||'Request all participants to confirm their readiness. Each participant shows as a traffic light: green = ready, red = not ready, yellow = pending.'}
        </p>
        ${isCreator ? `
        <div style="border:1px solid var(--accent);border-radius:var(--radius);padding:12px;margin-bottom:12px;background:color-mix(in srgb, var(--accent) 5%, var(--bg2))">
          <h4 style="font-size:var(--fs-sm);margin-bottom:8px">${t('prc_new_check')||'New Ready Check'}</h4>
          <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('prc_select_mode')||'Select by'}:</label>
            <div class="toggle-btn-group" style="font-size:10px">
              <button class="toggle-btn active" id="prcModeIndividual" data-prc-mode="individual">${t('prc_mode_individual')||'Individual'}</button>
              <button class="toggle-btn" id="prcModeGroup" data-prc-mode="group">${t('prc_mode_group')||'Group / Team'}</button>
              <button class="toggle-btn" id="prcModeRole" data-prc-mode="role">${t('prc_mode_role')||'Role'}</button>
            </div>
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:3px;margin-left:auto">
              <input type="checkbox" id="prcSelectAll" style="accent-color:var(--accent);width:12px;height:12px">
              <span style="font-weight:600">${t('prc_select_all')||'Select all'}</span>
            </label>
          </div>
          <div id="prcIndividualSection">
            <div style="margin-bottom:6px;display:flex;gap:8px;align-items:center">
              <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_select_participants')||'Select participants'}:</label>
              <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:3px">
                <input type="checkbox" id="prcOnlineOnly" style="accent-color:var(--accent);width:12px;height:12px">
                <span style="color:var(--accent);font-weight:600">🟢 ${t('prc_filter_online')||'Online only'}</span>
              </label>
              <input type="text" id="prcUserSearch" placeholder="${t('prc_search_users')||'Search users...'}" style="margin-left:auto;padding:3px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);width:140px">
            </div>
            <div id="prcParticipantList" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.users||[]).filter(u => u.id !== state.user.id).map(u => `
                <label class="group-chip prc-user-chip" style="cursor:pointer;font-size:var(--fs-xs)" data-online="${u.availability && u.availability !== 'away' ? 'true' : 'false'}" data-user-id="${u.id}" data-user-name="${escHtml((u.display_name||u.username).toLowerCase())}">
                  <input type="checkbox" class="prc-user-cb" value="${u.id}" style="margin-right:4px">
                  ${u.availability === 'busy' ? '🟡' : u.availability === 'dnd' ? '🔴' : u.availability === 'away' ? '⚪' : '🟢'} ${escHtml(u.display_name||u.username)}
                </label>`).join('')}
            </div>
          </div>
          <div id="prcGroupSection" style="display:none">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_send_to_group')||'Send to group/team'}:</label>
            <div id="prcGroupList" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.groups||[]).map(g => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="prc-group-cb" value="${g.id}" style="margin-right:4px">
                  <span class="group-icon-badge">👥</span> ${escHtml(g.name)}
                </label>`).join('')}
            </div>
          </div>
          <div id="prcRoleSection" style="display:none">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_send_to_role')||'Send to role'}:</label>
            <div id="prcRoleList" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              ${[...new Set((state.users||[]).map(u => u.role).filter(Boolean))].map(role => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="prc-role-cb" value="${role}" style="margin-right:4px">
                  🛡 ${getRoleDisplayName(role)}
                </label>`).join('')}
            </div>
          </div>
          <div style="margin-top:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_message')||'Message (optional)'}:</label>
            <textarea id="prcMessageText" rows="2" placeholder="${t('prc_message_placeholder')||'Add a message to send with the ready check...'}"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;margin-top:2px"></textarea>
          </div>
          <div id="prcTagsContainer" style="margin-top:8px"></div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btnCreatePRC">${t('prc_send_request')||'Send Ready Check Request'}</button>
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-dim)">
              <input type="checkbox" id="prcTimedCheck" style="accent-color:var(--accent);width:12px;height:12px">
              ${t('prc_timed_check')||'Timed Ready Check'}
            </label>
            <span id="prcTimedTZInfo" style="display:none;font-size:var(--fs-xs);color:var(--text-dim)"></span>
            <input type="datetime-local" id="prcTimedDateTime" style="display:none;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
        </div>` : ''}
        <div id="prcActiveChecks"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  // Render tags input
  let _prcTagInput = null;
  const prcTagsContainer = modal.querySelector('#prcTagsContainer');
  if (prcTagsContainer) {
    _prcTagInput = _renderTagInput(prcTagsContainer, 'prcTags', t('tags_placeholder') || 'Tags (comma-separated)');
  }

  // Load existing checks
  _loadPersonReadyChecks(modal);

  // PRC mode switching (individual / group / role)
  modal.querySelectorAll('[data-prc-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-prc-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.prcMode;
      const indSec = modal.querySelector('#prcIndividualSection');
      const grpSec = modal.querySelector('#prcGroupSection');
      const rolSec = modal.querySelector('#prcRoleSection');
      if (indSec) indSec.style.display = mode === 'individual' ? '' : 'none';
      if (grpSec) grpSec.style.display = mode === 'group' ? '' : 'none';
      if (rolSec) rolSec.style.display = mode === 'role' ? '' : 'none';
    });
  });

  // Online filter for individual participants
  const onlineFilter = modal.querySelector('#prcOnlineOnly');
  if (onlineFilter) {
    onlineFilter.addEventListener('change', () => {
      _prcFilterUsers(modal);
    });
  }

  // User search filter
  const userSearch = modal.querySelector('#prcUserSearch');
  if (userSearch) {
    userSearch.addEventListener('input', () => _prcFilterUsers(modal));
  }

  // Select all checkbox
  const selectAll = modal.querySelector('#prcSelectAll');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const checked = selectAll.checked;
      modal.querySelectorAll('.prc-user-cb').forEach(cb => {
        const chip = cb.closest('.prc-user-chip');
        if (chip && chip.style.display !== 'none') cb.checked = checked;
      });
    });
  }

  // Timed check toggle
  const timedCheck = modal.querySelector('#prcTimedCheck');
  const timedDateTime = modal.querySelector('#prcTimedDateTime');
  const timedTZInfo = modal.querySelector('#prcTimedTZInfo');
  if (timedCheck && timedDateTime) {
    timedCheck.addEventListener('change', () => {
      timedDateTime.style.display = timedCheck.checked ? '' : 'none';
      // Update button text to reflect timed vs immediate mode
      const btn = modal.querySelector('#btnCreatePRC');
      if (btn) {
        btn.textContent = timedCheck.checked
          ? (t('prc_schedule_request')||'Schedule Ready Check')
          : (t('prc_send_request')||'Send Ready Check Request');
      }
      if (timedTZInfo) {
        if (timedCheck.checked) {
          const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
          const tzAbbr = new Date().toLocaleTimeString('en-GB', {timeZoneName:'short'}).split(' ').pop() || '';
          timedTZInfo.textContent = tzAbbr + (tzName ? ' (' + tzName + ')' : '');
          timedTZInfo.style.display = '';
        } else {
          timedTZInfo.style.display = 'none';
        }
      }
      if (timedCheck.checked && !timedDateTime.value) {
        const d = new Date(); d.setMinutes(d.getMinutes() + 30);
        timedDateTime.value = fmtDateInput(d);
      }
    });
  }

  // Create new check button
  const createBtn = modal.querySelector('#btnCreatePRC');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      try {
        const activeMode = modal.querySelector('[data-prc-mode].active')?.dataset?.prcMode || 'individual';
        let selected = [];
        if (activeMode === 'individual') {
          const checkedCbs = [...modal.querySelectorAll('.prc-user-cb:checked')];
          selected = checkedCbs.map(cb => {
            const id = Number(cb.value);
            return isNaN(id) ? null : id;
          }).filter(id => id !== null && id > 0);
        } else if (activeMode === 'group') {
          const groupIds = [...modal.querySelectorAll('.prc-group-cb:checked')].map(cb => parseInt(cb.value, 10));
          for (const gid of groupIds) {
            try {
              const members = await apiGet(`/api/groups/${gid}/members`);
              if (members) members.forEach(m => { if (m.user_id && m.user_id !== state.user.id && !selected.includes(m.user_id)) selected.push(m.user_id); });
            } catch {}
          }
        } else if (activeMode === 'role') {
          const roles = [...modal.querySelectorAll('.prc-role-cb:checked')].map(cb => cb.value);
          (state.users || []).forEach(u => {
            if (roles.includes(u.role) && u.id !== state.user.id && !selected.includes(u.id)) selected.push(u.id);
          });
        }
        if (selected.length === 0) { showError(t('prc_no_participants')||'Select at least one participant'); return; }
        const isTimed = modal.querySelector('#prcTimedCheck')?.checked || false;
        const timedAt = isTimed ? modal.querySelector('#prcTimedDateTime')?.value : null;
        if (isTimed && !timedAt) { showError(t('prc_timed_required')||'Please select a date and time for the timed check'); return; }
        const messageText = modal.querySelector('#prcMessageText')?.value?.trim() || '';
        const body = { participant_ids: selected };
        if (messageText) body.message = messageText;
        if (isTimed && timedAt) {
          body.scheduled_at = new Date(timedAt).toISOString();
        }
        // Include tags if any selected
        if (_prcTagInput) {
          const tags = _prcTagInput.getSelectedTags();
          if (tags.length > 0) body.tags = tags;
        }
        const res = await apiPost('/api/person-ready-check', body);
        if (res.ok) {
          const created = await res.json().catch(() => null);
          const pCount = created && created.participants ? created.participants.length : selected.length;
          const names = created && created.participants ? created.participants.map(p => p.user_name || ('User #' + p.user_id)).join(', ') : '';
          if (isTimed) {
            showNotification('success', (t('prc_timed_scheduled')||'Timed ready check scheduled') + ` (${pCount} ${t('participants')||'participants'})`);
          } else {
            showNotification('success', (t('prc_sent')||'Ready check request sent') + ` → ${names || pCount + ' ' + (t('participants')||'participants')}`);
          }
          _loadPersonReadyChecks(modal);
        } else {
          const err = await res.json().catch(() => ({}));
          showError(err.error || 'Failed to create ready check');
        }
      } catch (e) {
        console.error('PRC creation error:', e);
        showError('Failed to create ready check: ' + (e.message || String(e)));
      }
    });
  }
}

async function _loadPersonReadyChecks(modal) {
  const container = modal.querySelector('#prcActiveChecks');
  if (!container) return;
  try {
    const checks = await apiGet('/api/person-ready-check');
    _personReadyChecks = checks || [];
  } catch { _personReadyChecks = []; }

  if (_personReadyChecks.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);text-align:center;padding:16px">${t('prc_no_active')||'No active ready checks.'}</div>`;
    return;
  }

  // Display checks in reverse chronological order (newest first)
  const sortedChecks = [..._personReadyChecks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  container.innerHTML = sortedChecks.map(check => {
    const isMyCheck = check.created_by === state.user.id;
    const participants = check.participants || [];
    const checkTime = new Date(check.created_at);
    const readyCount = participants.filter(p => p.status === 'ready').length;
    const notReadyCount = participants.filter(p => p.status === 'not_ready').length;
    const pendingCount = participants.filter(p => p.status === 'pending').length;
    const isScheduled = check.scheduled_at && new Date(check.scheduled_at) > new Date();
    // Sort participants: pending first (actionable), then by response time
    const sortedParticipants = [...participants].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      // Among responded, sort by response time (newest first)
      if (a.responded_at && b.responded_at) return new Date(b.responded_at) - new Date(a.responded_at);
      return 0;
    });
    // For large groups, show summary and collapsible details
    const isLargeGroup = participants.length > 20;
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;background:var(--bg3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px">
          <span style="font-weight:600;font-size:var(--fs-sm)">
            ${isScheduled ? '⏰ ' : ''}${t('prc_ready_check')||'Ready Check'} #${check.id}
          </span>
          <span style="font-size:var(--fs-xs);color:var(--text-dim)">${check.created_by_name || ''} — ${fmtDateTime(checkTime)}</span>
        </div>
        ${check.message ? `<div style="font-size:var(--fs-sm);padding:6px 8px;margin-bottom:8px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid var(--accent);color:var(--text)">${escHtml(check.message)}</div>` : ''}
        <div style="font-size:var(--fs-xs);margin-bottom:8px;display:flex;gap:12px;color:var(--text-dim)">
          <span>🟢 ${readyCount}</span> <span>🔴 ${notReadyCount}</span> <span>🟡 ${pendingCount}</span>
          <span style="margin-left:auto">${t('prc_total')||'Total'}: ${participants.length}</span>
          ${isScheduled ? `<span style="color:var(--accent)">⏰ ${t('prc_scheduled_for')||'Scheduled for'}: ${fmtDateTime(new Date(check.scheduled_at))}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;${isLargeGroup ? 'max-height:200px;overflow-y:auto' : ''}">
          ${sortedParticipants.map(p => {
            const color = p.status === 'ready' ? '#27AE60' : p.status === 'not_ready' ? '#E74C3C' : '#F39C12';
            const icon = p.status === 'ready' ? '🟢' : p.status === 'not_ready' ? '🔴' : '🟡';
            const isMe = p.user_id === state.user.id;
            // Calculate response time difference from check creation
            let responseInfo = '';
            if (p.responded_at) {
              const respTime = new Date(p.responded_at);
              const diffMs = respTime - checkTime;
              const diffSec = Math.floor(diffMs / 1000);
              const diffMin = Math.floor(diffSec / 60);
              const diffH = Math.floor(diffMin / 60);
              let diffStr = '';
              if (diffH > 0) diffStr = `${diffH}h ${diffMin % 60}m`;
              else if (diffMin > 0) diffStr = `${diffMin}m ${diffSec % 60}s`;
              else diffStr = `${diffSec}s`;
              responseInfo = `<span style="font-size:9px;color:var(--text-dim);margin-left:2px" title="${fmtDateTime(respTime)}">(+${diffStr})</span>`;
            }
            return `<div style="display:inline-flex;align-items:center;gap:3px;padding:3px 6px;background:var(--bg2);border-radius:var(--radius);border:1px solid ${color};font-size:var(--fs-xs)">
              <span>${icon}</span>
              <span>${escHtml(p.user_name)}</span>${responseInfo}
              ${isMe && p.status === 'pending' ? `
                <button class="btn btn-sm" style="padding:1px 6px;font-size:10px;background:#27AE60;color:#fff;border:none;border-radius:3px;margin-left:2px" data-prc-respond="${check.id}" data-prc-status="ready">✓</button>
                <button class="btn btn-sm" style="padding:1px 6px;font-size:10px;background:#E74C3C;color:#fff;border:none;border-radius:3px" data-prc-respond="${check.id}" data-prc-status="not_ready">✗</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  // Bind response buttons
  container.querySelectorAll('[data-prc-respond]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const checkId = parseInt(btn.dataset.prcRespond, 10);
      const status = btn.dataset.prcStatus;
      const res = await apiPut(`/api/person-ready-check/${checkId}/respond`, { status });
      if (res.ok) {
        _loadPersonReadyChecks(modal);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to respond');
      }
    });
  });
}

// ── PRC Popup (shown to participants when a ready check is created) ──────────
function _prcFilterUsers(modal) {
  const onlyOnline = modal.querySelector('#prcOnlineOnly')?.checked || false;
  const searchTerm = (modal.querySelector('#prcUserSearch')?.value || '').toLowerCase();
  modal.querySelectorAll('.prc-user-chip').forEach(chip => {
    let hidden = false;
    if (onlyOnline && chip.dataset.online !== 'true') hidden = true;
    if (searchTerm && chip.dataset.userName && !chip.dataset.userName.includes(searchTerm)) hidden = true;
    chip.style.display = hidden ? 'none' : '';
  });
}

function _showPRCPopup(check) {
  // Prevent duplicate popups for same check
  if (document.getElementById('prcPopup_' + check.id)) return;
  const overlay = document.createElement('div');
  overlay.id = 'prcPopup_' + check.id;
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '10001';
  const participants = (check.participants || []).map(p => {
    const color = p.status === 'ready' ? '#27AE60' : p.status === 'not_ready' ? '#E74C3C' : '#F39C12';
    const icon = p.status === 'ready' ? '🟢' : p.status === 'not_ready' ? '🔴' : '🟡';
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:var(--bg2);border:1px solid ${color};border-radius:var(--radius);font-size:var(--fs-xs);margin:2px">${icon} ${escHtml(p.user_name)}</span>`;
  }).join('');
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px;animation:slideIn .25s ease">
      <div class="modal-header" style="background:#F39C12;color:#000">
        <h3 style="color:#000">🙋 Ready Check Required</h3>
      </div>
      <div class="modal-body">
        <p style="font-size:var(--fs-sm);margin-bottom:8px">
          <b>${escHtml(check.created_by_name || '')}</b> ${t('prc_popup_requested')||'has requested a readiness check.'}
        </p>
        ${check.message ? `<div style="font-size:var(--fs-sm);padding:8px 10px;margin-bottom:10px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid var(--accent);color:var(--text);font-style:italic">${escHtml(check.message)}</div>` : ''}
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:12px">${t('prc_popup_confirm')||'Please confirm your readiness status.'}</p>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px">${participants}</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-primary" id="prcPopupReady_${check.id}" style="background:#27AE60;border-color:#27AE60;padding:8px 24px;font-size:14px">✓ Ready</button>
          <button class="btn btn-secondary" id="prcPopupNotReady_${check.id}" style="background:#E74C3C;border-color:#E74C3C;color:#fff;padding:8px 24px;font-size:14px">✗ Not Ready</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const respond = async (status) => {
    try {
      const res = await apiPut(`/api/person-ready-check/${check.id}/respond`, { status });
      if (res.ok) {
        if (typeof stopRepeatingAlarm === 'function') stopRepeatingAlarm('prc-' + check.id);
        overlay.remove();
        showNotification('success', status === 'ready' ? 'Marked as ready' : 'Marked as not ready');
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to respond');
      }
    } catch (e) { showError('Error: ' + e.message); }
  };
  document.getElementById('prcPopupReady_' + check.id).addEventListener('click', () => respond('ready'));
  document.getElementById('prcPopupNotReady_' + check.id).addEventListener('click', () => respond('not_ready'));
  // Play an attention-grabbing repeating alarm — fires immediately and then
  // every 60 seconds until the user responds (Ready / Not Ready) or the
  // popup is otherwise removed. Falls back gracefully if the helper is
  // not loaded yet.
  if (typeof startRepeatingAlarm === 'function') {
    startRepeatingAlarm('prc-' + check.id, 'chime', 60000);
  } else {
    _playNotifBellSound();
  }
}

/* ── Request For Information (RFI) ── */
let _rfiList = [];
let _rfiFilter = 'all';   // all | open | closed | unanswered
let _rfiSearch = '';
const RFI_SWATCHES = ['', '#FFF4C2', '#D6F5D6', '#FFD6D6', '#D6E4FF', '#E6D6FF', '#FFE0B3'];

async function openRFIModal() {
  try { _rfiList = await apiGet('/api/rfi') || []; } catch { _rfiList = []; }
  const isCreator = hasRole2(state.user.role, 'teamlead');
  const groups = state.groups || [];
  const users = (state.users || []).filter(u => u.id !== state.user.id);
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'rfiModal';
  const richQuestion = (typeof _diaryRichField === 'function')
    ? _diaryRichField('rfiQuestion', '', t('rfi_question_placeholder')||'What information do you need?', '100px')
    : `<textarea id="rfiQuestion" rows="3" placeholder="${t('rfi_question_placeholder')||'What information do you need?'}"
         style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>`;
  modal.innerHTML = `
    <div class="modal" style="max-width:800px;width:95vw;max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3>📋 ${t('rfi_title')||'Request For Information'}</h3>
        <button class="modal-close" data-action="_closeRFIModal">&times;</button>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
        ${isCreator ? `
        <div style="margin-bottom:12px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
          <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:4px">${t('rfi_question')||'Question / Request'}</label>
          <div id="rfiQuestionWrap">${richQuestion}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
            <label style="font-size:var(--fs-xs);font-weight:600">${t('rfi_target')||'Send to'}:</label>
            <div class="toggle-btn-group" style="font-size:10px">
              <button class="toggle-btn active" id="rfiModeUser" data-rfi-mode="users">${t('poll_target_users')||'Users'}</button>
              <button class="toggle-btn" id="rfiModeGroup" data-rfi-mode="groups">${t('poll_target_groups')||'Groups'}</button>
              <button class="toggle-btn" id="rfiModeAll" data-rfi-mode="all">${t('rfi_all')||'All'}</button>
            </div>
          </div>
          <div id="rfiTargetUsers" style="margin-top:6px">
            <div style="max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${users.map(u => `<label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                <input type="checkbox" class="rfi-user-cb" value="${u.id}" style="margin-right:4px">
                ${escHtml(u.display_name||u.username)}
              </label>`).join('')}
            </div>
          </div>
          <div id="rfiTargetGroups" style="display:none;margin-top:6px">
            <div style="max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${groups.map(g => `<label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                <input type="checkbox" class="rfi-group-cb" value="${g.id}" style="margin-right:4px">
                👥 ${escHtml(g.name)}
              </label>`).join('')}
            </div>
          </div>
          <div id="rfiTargetAll" style="display:none;margin-top:6px">
            <p style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px">📢 ${t('rfi_all_desc')||'The RFI will be sent to all users.'}</p>
          </div>
          <div style="margin-top:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;display:block;margin-bottom:4px">${t('lb_background_color')||'Background colour'}</label>
            <div id="rfiAddSwatches" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
              ${RFI_SWATCHES.map(sw => {
                const bg = sw || 'transparent';
                const sel = sw === '' ? 'outline:2px solid var(--accent);' : '';
                return `<button type="button" class="rfi-add-swatch" data-rfi-color="${escHtml(sw)}"
                  style="width:20px;height:20px;border:1px solid #888;border-radius:4px;background:${bg};${sel}cursor:pointer" title="${sw||'None'}"></button>`;
              }).join('')}
            </div>
            <input type="hidden" id="rfiAddColor" value="">
          </div>
          <div style="margin-top:4px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;display:block;margin-bottom:4px">🔗 ${t('rfi_references')||'References'}</label>
            <div id="rfiAddRefs" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px"></div>
            <div style="display:flex;gap:4px;align-items:center">
              <select id="rfiAddRefType" class="input" style="font-size:var(--fs-xs);width:auto;padding:3px 6px">
                <option value="log_book">${t('tab_log_book')||'Log Book'}</option>
                <option value="diary">${t('diary_title')||'Diary'}</option>
                <option value="decision">${t('decisions_title')||'Decision'}</option>
                <option value="event">${t('event')||'Event'}</option>
              </select>
              <input type="number" id="rfiAddRefId" class="input" style="width:60px;font-size:var(--fs-xs);padding:3px 6px" placeholder="ID" min="1">
              <input type="text" id="rfiAddRefLabel" class="input" style="flex:1;font-size:var(--fs-xs);padding:3px 6px" placeholder="${t('decision_ref_label')||'Label'}">
              <button type="button" class="btn btn-sm btn-secondary" id="rfiAddRefBtn" style="font-size:10px;padding:2px 6px">+</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">⏱ ${t('rfi_deadline')||'Deadline (minutes)'}:
              <input type="number" id="rfiDeadlineMins" min="1" value="5" style="width:60px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            </label>
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">📅 ${t('rfi_schedule')||'Schedule'}:
              <input type="datetime-local" id="rfiScheduledAt" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            </label>
            <button class="btn btn-primary btn-sm" data-action="_rfiSend">${t('rfi_send')||'Send RFI'}</button>
          </div>
        </div>` : ''}
        <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
          <input id="rfiSearchInput" class="input" style="flex:1;min-width:150px;font-size:var(--fs-xs)" placeholder="🔍 ${t('rfi_search_placeholder')||'Search RFIs…'}">
          <div class="toggle-btn-group" style="font-size:10px">
            <button class="toggle-btn${_rfiFilter==='all'?' active':''}" data-action="_setRFIFilter" data-arg="all">${t('filter_all')||'All'}</button>
            <button class="toggle-btn${_rfiFilter==='open'?' active':''}" data-action="_setRFIFilter" data-arg="open">${t('rfi_filter_open')||'Open'}</button>
            <button class="toggle-btn${_rfiFilter==='closed'?' active':''}" data-action="_setRFIFilter" data-arg="closed">${t('rfi_filter_closed')||'Closed'}</button>
            <button class="toggle-btn${_rfiFilter==='unanswered'?' active':''}" data-action="_setRFIFilter" data-arg="unanswered">${t('rfi_filter_unanswered')||'Unanswered'}</button>
          </div>
          <button class="btn btn-sm" style="font-size:11px;padding:2px 8px" data-action="_rfiExportCSV" title="${t('btn_export_csv')||'Export CSV'}">⤓ ${t('btn_export')||'Export'}</button>
          <button class="btn btn-sm" style="font-size:11px;padding:2px 8px" data-action="_rfiPrintAll" title="${t('btn_print')||'Print'}">🖨 ${t('btn_print')||'Print'}</button>
        </div>
        <div id="rfiActiveList"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  // Mode toggle
  modal.querySelectorAll('[data-rfi-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-rfi-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('rfiTargetUsers').style.display = btn.dataset.rfiMode === 'users' ? '' : 'none';
      document.getElementById('rfiTargetGroups').style.display = btn.dataset.rfiMode === 'groups' ? '' : 'none';
      document.getElementById('rfiTargetAll').style.display = btn.dataset.rfiMode === 'all' ? '' : 'none';
    });
  });
  // Wire rich text toolbar for the question body (if diary helper is loaded)
  if (typeof _diaryBindToolbar === 'function') {
    _diaryBindToolbar(modal, 'rfiQuestion');
  }
  // Wire colour swatches
  modal.querySelectorAll('.rfi-add-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.rfiColor || '';
      const hidden = document.getElementById('rfiAddColor');
      if (hidden) hidden.value = val;
      modal.querySelectorAll('.rfi-add-swatch').forEach(b => { b.style.outline = ''; });
      btn.style.outline = '2px solid var(--accent)';
    });
  });
  // Wire reference add button
  document.getElementById('rfiAddRefBtn')?.addEventListener('click', () => {
    const refType = document.getElementById('rfiAddRefType')?.value;
    const refId = document.getElementById('rfiAddRefId')?.value;
    const refLabel = document.getElementById('rfiAddRefLabel')?.value || '';
    if (!refType || !refId) return;
    const tag = document.createElement('span');
    tag.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border:1px solid var(--accent);border-radius:var(--radius);font-size:10px';
    tag.dataset.refType = refType;
    tag.dataset.refId = refId;
    tag.dataset.refLabel = refLabel || `${refType} #${refId}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.style.cssText = 'border:none;background:none;cursor:pointer;font-size:10px;color:var(--danger)';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => tag.remove());
    tag.textContent = `🔗 ${refLabel || refType + ' #' + refId} `;
    tag.appendChild(removeBtn);
    document.getElementById('rfiAddRefs')?.appendChild(tag);
    document.getElementById('rfiAddRefId').value = '';
    document.getElementById('rfiAddRefLabel').value = '';
  });
  // Wire search
  const searchEl = document.getElementById('rfiSearchInput');
  if (searchEl) {
    searchEl.value = _rfiSearch;
    searchEl.addEventListener('input', () => {
      _rfiSearch = searchEl.value.trim();
      _rfiRenderList(modal);
    });
  }
  _rfiRenderList(modal);
}

function _setRFIFilter(filter) {
  _rfiFilter = filter;
  const modal = document.getElementById('rfiModal');
  if (!modal) return;
  // Update active class on filter buttons
  modal.querySelectorAll('[data-action="_setRFIFilter"]').forEach(b => {
    b.classList.toggle('active', b.dataset.arg === filter);
  });
  _rfiRenderList(modal);
}

function _closeRFIModal() {
  document.getElementById('rfiModal')?.remove();
}

function _rfiFilteredList() {
  let list = (_rfiList || []).slice();
  if (_rfiFilter === 'open')   list = list.filter(r => r.status === 'open');
  else if (_rfiFilter === 'closed') list = list.filter(r => r.status === 'closed');
  else if (_rfiFilter === 'unanswered') {
    list = list.filter(r => (r.respondents||[]).some(x => x.status === 'unanswered'));
  }
  if (_rfiSearch) {
    const q = _rfiSearch.toLowerCase();
    list = list.filter(r => {
      const respNames = (r.respondents||[]).map(x => `${x.user_name} ${x.response||''}`).join(' ');
      const hay = `${r.sequence_number||''} ${r.question||''} ${r.created_by_name||''} ${respNames}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return list;
}

function _rfiRenderList(modal) {
  const wrap = (modal || document).querySelector('#rfiActiveList');
  if (!wrap) return;
  const filtered = _rfiFilteredList();
  if (!filtered || filtered.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('rfi_empty')||'No requests for information.'}</p>`;
    return;
  }
  const isAdmin = hasRole2(state.user?.role, 'admin');
  const isCreator = hasRole2(state.user?.role, 'teamlead');
  // Sort newest first
  const sorted = filtered.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  wrap.innerHTML = sorted.map(rfi => {
    const isOpen = rfi.status === 'open';
    const responded = (rfi.respondents || []).filter(r => r.status === 'responded');
    const pending = (rfi.respondents || []).filter(r => r.status === 'pending');
    const unanswered = (rfi.respondents || []).filter(r => r.status === 'unanswered');
    const total = (rfi.respondents || []).length;
    const statusColor = isOpen ? 'var(--accent)' : 'var(--text-dim)';
    let statusText = isOpen ? (t('rfi_open')||'Open') : (t('rfi_closed')||'Closed');
    if (!isOpen && rfi.closed_reason === 'deadline') statusText += ' ⏱';
    const dlInfo = rfi.deadline_at ? ` · ⏱ ${new Date(rfi.deadline_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : '';
    let respondentsHtml = '';
    if (responded.length > 0) {
      respondentsHtml = `<div style="margin-top:6px"><strong style="color:#27AE60;font-size:var(--fs-xs)">✅ ${t('rfi_responded')||'Responded'} (${responded.length}/${total}):</strong>
        ${responded.map(r => `<div style="margin:4px 0 4px 8px;padding:6px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);font-size:var(--fs-xs)">
          <strong>${escHtml(r.user_name)}</strong>${r.responded_at ? ' · ' + new Date(r.responded_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}
          <div style="margin-top:2px">${r.response||''}</div>
        </div>`).join('')}
      </div>`;
    }
    if (pending.length > 0 && isCreator) {
      respondentsHtml += `<div style="margin-top:4px"><span style="color:#E67E22;font-size:var(--fs-xs)">⏳ ${t('rfi_pending')||'Pending'}: ${pending.map(r => escHtml(r.user_name)).join(', ')}</span></div>`;
    }
    if (unanswered.length > 0) {
      respondentsHtml += `<div style="margin-top:4px"><span style="color:var(--danger,#E74C3C);font-size:var(--fs-xs);font-weight:700">❌ ${t('rfi_unanswered')||'Unanswered'} (${unanswered.length}): ${unanswered.map(r => escHtml(r.user_name)).join(', ')}</span></div>`;
    }
    const bgStyle = rfi.color ? `background:${escHtml(rfi.color)};color:#222;` : '';
    const refsHtml = (rfi.references && rfi.references.length)
      ? `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)">🔗 ${rfi.references.map(r =>
          `<button type="button" class="btn btn-sm" style="padding:0 4px;font-size:10px;color:var(--accent);text-decoration:none" data-action="_openRFIRef" data-args='["${escHtml(r.type)}",${r.id}]'>${escHtml(r.label || r.type + ' #' + r.id)}</button>`
        ).join(', ')}</div>`
      : '';
    const seqHtml = rfi.sequence_number ? `<span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;margin-right:4px">${escHtml(rfi.sequence_number)}</span>` : '';
    const canDelete = (rfi.created_by === state.user?.id) || isAdmin;
    return `<div data-rfi-id="${rfi.id}" style="margin-bottom:8px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);${bgStyle}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
        <div style="flex:1;min-width:0">
          ${seqHtml}<strong style="font-size:var(--fs-sm)">📋</strong>
          <span style="font-size:var(--fs-xs);color:${statusColor};font-weight:600;margin-left:4px">${statusText}</span>
          <div style="margin-top:4px;line-height:1.5">${rfi.question || ''}</div>
        </div>
        <div style="display:flex;gap:2px;flex-shrink:0">
          ${isCreator && isOpen ? `<button class="btn btn-sm btn-danger" style="font-size:10px" data-action="_rfiClose" data-arg="${rfi.id}" title="${t('rfi_close')||'Close'}">${t('rfi_close')||'Close'}</button>` : ''}
          <button class="btn btn-sm" style="padding:1px 6px;font-size:10px" data-action="_rfiPrintEntry" data-arg="${rfi.id}" title="${t('btn_print')||'Print'}">🖨</button>
          ${canDelete ? `<button class="btn btn-sm" style="padding:1px 6px;font-size:10px;color:var(--danger,#e74c3c)" data-action="_rfiDelete" data-arg="${rfi.id}" title="${t('btn_delete')||'Delete'}">🗑</button>` : ''}
        </div>
      </div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">
        ${escHtml(rfi.created_by_name)} — ${new Date(rfi.created_at).toLocaleString()}${dlInfo}
        — ${t('rfi_responses')||'Responses'}: ${responded.length}/${total}${unanswered.length ? ' · ❌ ' + unanswered.length : ''}
      </div>
      ${refsHtml}
      ${respondentsHtml}
    </div>`;
  }).join('');
  _bindActions(wrap);
}

async function _rfiSend() {
  const qEl = document.getElementById('rfiQuestion');
  const question = qEl ? (qEl.tagName === 'TEXTAREA' ? qEl.value.trim() : (qEl.innerHTML || '').trim()) : '';
  if (!question || question === '<br>') { showError(t('rfi_question_required')||'Question is required'); return; }
  const mode = document.querySelector('[data-rfi-mode].active')?.dataset?.rfiMode || 'users';
  const respondentIds = mode === 'users' ? [...document.querySelectorAll('.rfi-user-cb:checked')].map(c => parseInt(c.value)) : [];
  const groupIds = mode === 'groups' ? [...document.querySelectorAll('.rfi-group-cb:checked')].map(c => parseInt(c.value)) : [];
  const all = mode === 'all';
  if (!all && respondentIds.length === 0 && groupIds.length === 0) {
    showError(t('rfi_target_required')||'Select at least one recipient');
    return;
  }
  const deadlineMins = parseInt(document.getElementById('rfiDeadlineMins')?.value || '0', 10);
  const scheduledAtLocal = document.getElementById('rfiScheduledAt')?.value || '';
  const scheduledAt = scheduledAtLocal ? new Date(scheduledAtLocal).toISOString() : '';
  const color = document.getElementById('rfiAddColor')?.value || '';
  // Collect references
  const refEls = document.querySelectorAll('#rfiAddRefs span[data-ref-type]');
  const references = [];
  refEls.forEach(el => {
    references.push({ type: el.dataset.refType, id: parseInt(el.dataset.refId, 10), label: el.dataset.refLabel || '' });
  });
  const res = await apiPost('/api/rfi', {
    question,
    respondent_ids: respondentIds,
    group_ids: groupIds,
    all,
    deadline_mins: deadlineMins,
    scheduled_at: scheduledAt,
    color,
    references
  });
  if (res.ok) {
    if (qEl) { if (qEl.tagName === 'TEXTAREA') qEl.value = ''; else qEl.innerHTML = ''; }
    const refsWrap = document.getElementById('rfiAddRefs'); if (refsWrap) refsWrap.innerHTML = '';
    showNotification('success', t('rfi_sent')||'RFI sent');
    _rfiList = await apiGet('/api/rfi') || [];
    _rfiRenderList(document.getElementById('rfiModal'));
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to send RFI');
  }
}

async function _rfiClose(id) {
  const res = await api('PUT', `/api/rfi/${id}/close`);
  if (res.ok) {
    showNotification('success', t('rfi_closed_success')||'RFI closed');
    _rfiList = await apiGet('/api/rfi') || [];
    _rfiRenderList(document.getElementById('rfiModal'));
  }
}

async function _rfiDelete(id) {
  if (!confirm(t('rfi_delete_confirm')||'Delete this RFI and all of its responses?')) return;
  const res = await api('DELETE', `/api/rfi/${id}`);
  if (res.ok) {
    showNotification('success', t('rfi_deleted')||'RFI deleted');
    _rfiList = await apiGet('/api/rfi') || [];
    _rfiRenderList(document.getElementById('rfiModal'));
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to delete RFI');
  }
}

// Open a cross-referenced target from an RFI entry
function _openRFIRef(type, id) {
  if (type === 'diary') {
    if (typeof openDiaryModal === 'function') openDiaryModal();
  } else if (type === 'log_book') {
    if (typeof openLogBookModal === 'function') openLogBookModal();
  } else if (type === 'decision') {
    if (typeof openDecisionLogModal === 'function') openDecisionLogModal();
  } else if (type === 'event') {
    const ev = (state.events || []).find(e => e.id === id);
    if (ev && typeof showEventDetail === 'function') showEventDetail(ev);
  }
}

function _rfiEntryToHTML(rfi) {
  const responded = (rfi.respondents || []).filter(r => r.status === 'responded');
  const unanswered = (rfi.respondents || []).filter(r => r.status === 'unanswered');
  const pending = (rfi.respondents || []).filter(r => r.status === 'pending');
  const total = (rfi.respondents || []).length;
  const closedReason = rfi.closed_reason === 'deadline' ? ' (deadline reached)' : '';
  let respHtml = '';
  if (responded.length) {
    respHtml += '<h3>Responses</h3><ul>';
    responded.forEach(r => {
      respHtml += `<li><b>${escHtml(r.user_name)}</b>${r.responded_at ? ' — ' + new Date(r.responded_at).toLocaleString() : ''}<br>${r.response||''}</li>`;
    });
    respHtml += '</ul>';
  }
  if (unanswered.length) {
    respHtml += `<p><b>Unanswered:</b> ${unanswered.map(r => escHtml(r.user_name)).join(', ')}</p>`;
  }
  if (pending.length) {
    respHtml += `<p><b>Pending:</b> ${pending.map(r => escHtml(r.user_name)).join(', ')}</p>`;
  }
  return `<section style="page-break-inside:avoid;margin-bottom:24px">
    <h2>${escHtml(rfi.sequence_number || ('RFI #' + rfi.id))}</h2>
    <p style="color:#666;font-size:12px">
      ${escHtml(rfi.created_by_name||'')} — ${new Date(rfi.created_at).toLocaleString()} —
      ${rfi.status === 'open' ? 'Open' : 'Closed' + closedReason} —
      Responses: ${responded.length}/${total}
    </p>
    <div style="line-height:1.6">${rfi.question || ''}</div>
    ${respHtml}
  </section>`;
}

function _rfiPrintHTML(bodyHtml, title) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>body{font-family:Calibri,Arial,sans-serif;max-width:800px;margin:20px auto;padding:0 20px;color:#222}
    h1{color:#333;border-bottom:2px solid #333;padding-bottom:4px}
    h2{color:#333;margin-top:0}
    a{color:#2563eb}
    hr{border:0;border-top:1px solid #ccc;margin:18px 0}
    @media print{body{margin:0;padding:10px}}</style>
    </head><body>${bodyHtml}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

function _rfiPrintEntry(idRaw) {
  const id = typeof idRaw === 'number' ? idRaw : parseInt(idRaw, 10);
  const rfi = (_rfiList || []).find(r => r.id === id);
  if (!rfi) { showError('RFI not found'); return; }
  _rfiPrintHTML(_rfiEntryToHTML(rfi), rfi.sequence_number || ('RFI #' + rfi.id));
}

function _rfiPrintAll() {
  const entries = _rfiFilteredList();
  if (!entries.length) { showError(t('rfi_empty')||'No RFIs to print'); return; }
  entries.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const exName = (state.exercise && state.exercise.label) || '';
  const title = (exName ? exName + ' — ' : '') + (t('rfi_title')||'Request For Information');
  let html = `<h1>${escHtml(title)}</h1>`;
  html += `<p style="color:#666">${new Date().toLocaleString()} — ${entries.length} ${t('rfi_entries')||'entries'}</p><hr>`;
  for (const r of entries) html += _rfiEntryToHTML(r);
  _rfiPrintHTML(html, title);
}

// CSV export of currently filtered RFIs, one row per respondent (or one row
// when there are no respondents). Opens a download dialog in the browser.
function _rfiExportCSV() {
  const entries = _rfiFilteredList();
  if (!entries.length) { showError(t('rfi_empty')||'No RFIs to export'); return; }
  const esc = (v) => {
    const s = (v === null || v === undefined) ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const stripTags = (h) => (h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [['sequence_number','rfi_id','status','closed_reason','created_by','created_at','deadline_at','question','respondent','respondent_status','response','responded_at']];
  entries.forEach(r => {
    const base = [r.sequence_number||'', r.id, r.status||'', r.closed_reason||'', r.created_by_name||'', r.created_at||'', r.deadline_at||'', stripTags(r.question||'')];
    if (!r.respondents || r.respondents.length === 0) {
      rows.push([...base, '', '', '', '']);
    } else {
      r.respondents.forEach(x => {
        rows.push([...base, x.user_name||'', x.status||'', stripTags(x.response||''), x.responded_at||'']);
      });
    }
  });
  const csv = rows.map(row => row.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rfi-export-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

// RFI popup for respondents — shown when an SSE rfi_new event arrives
function _showRFIPopup(rfi) {
  if (!state.user) return;
  const me = (rfi.respondents || []).find(r => r.user_id === state.user.id);
  if (!me || me.status !== 'pending') return;
  // Don't show duplicate popups
  if (document.getElementById('rfiPopup_' + rfi.id)) return;
  const overlay = document.createElement('div');
  overlay.id = 'rfiPopup_' + rfi.id;
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '10001';
  const dlText = rfi.deadline_at ? `<p style="font-size:var(--fs-xs);color:#E67E22;margin-bottom:8px">⏱ ${t('rfi_deadline_at')||'Deadline'}: ${new Date(rfi.deadline_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</p>` : '';
  const responseId = 'rfiResponse_' + rfi.id;
  const responseField = (typeof _diaryRichField === 'function')
    ? _diaryRichField(responseId, '', t('rfi_response_placeholder')||'Type your response here…', '120px')
    : `<textarea id="${responseId}" rows="6" placeholder="${t('rfi_response_placeholder')||'Type your response here…'}"
         style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:8px"></textarea>`;
  const seq = rfi.sequence_number ? `<span style="font-size:var(--fs-xs);color:#cde;margin-left:8px">${escHtml(rfi.sequence_number)}</span>` : '';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;animation:slideIn .25s ease">
      <div class="modal-header" style="background:#3498DB;color:#fff">
        <h3 style="color:#fff">📋 ${t('rfi_popup_title')||'Information Requested'}${seq}</h3>
      </div>
      <div class="modal-body">
        <p style="font-size:var(--fs-sm);margin-bottom:4px">
          <b>${escHtml(rfi.created_by_name || '')}</b> ${t('rfi_popup_asks')||'requests information:'}
        </p>
        <div style="font-size:var(--fs-sm);padding:8px 10px;margin-bottom:10px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid var(--accent);color:var(--text);font-weight:600">${rfi.question || ''}</div>
        ${dlText}
        ${responseField}
        <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
          <button class="btn btn-primary" id="rfiSubmit_${rfi.id}" style="padding:8px 24px;font-size:14px">📨 ${t('rfi_submit')||'Submit Response'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof _diaryBindToolbar === 'function') _diaryBindToolbar(overlay, responseId);
  document.getElementById('rfiSubmit_' + rfi.id).addEventListener('click', async () => {
    const respEl = document.getElementById(responseId);
    const response = respEl ? (respEl.tagName === 'TEXTAREA' ? respEl.value : (respEl.innerHTML || '')) : '';
    try {
      const res = await api('PUT', `/api/rfi/${rfi.id}/respond`, { response });
      if (res.ok) {
        if (typeof stopRepeatingAlarm === 'function') stopRepeatingAlarm('rfi-' + rfi.id);
        overlay.remove();
        showNotification('success', t('rfi_response_sent')||'Response submitted');
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to submit');
      }
    } catch (e) { showError('Error: ' + e.message); }
  });
  // Play repeating alarm to get attention
  if (typeof startRepeatingAlarm === 'function') {
    startRepeatingAlarm('rfi-' + rfi.id, 'chime', 60000);
  }
}

/* ── Poll / Multipoll ── */
async function openPollModal(opts) {
  opts = opts || {};
  const isCreator = hasRole2(state.user.role, 'teamlead');
  const hideCreatePane = opts.hideCreate || false;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';

  const standardQs = [
    { key: 'stress',      label: t('poll_question_stress')||'Personal stress level (0-3)', type: 'scale' },
    { key: 'team_stress', label: t('poll_question_team_stress')||'Team stress level (0-3)', type: 'scale' },
    { key: 'in_control',  label: t('poll_question_in_control')||'Are you in control?', type: 'yes_no' },
    { key: 'need_assist', label: t('poll_question_need_assist')||'Do you need assistance from Operations Lead or other central support?', type: 'yes_no' },
    { key: 'need_assist_teamlead', label: t('poll_question_need_assist_teamlead')||'Do you need assistance from other team leads?', type: 'yes_no' },
    { key: 'other',       label: t('poll_question_other')||'Additional comments', type: 'free_text' },
  ];

  modal.innerHTML = `
    <div class="modal" style="max-width:1200px;width:95vw">
      <div class="modal-header">
        <h3>📊 ${t('poll_title')||'Poll / Multipoll'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:80vh;overflow-y:auto" id="pollModalBody">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('poll_desc')||'Poll specific users, groups, or roles with standard or custom questions. All replies are collected and reported.'}
        </p>
        ${isCreator ? `
        <div id="pollCreatePane" style="border:1px solid var(--accent);border-radius:var(--radius);margin-bottom:12px;background:color-mix(in srgb, var(--accent) 5%, var(--bg2))">
          <div id="pollCreateHeader" style="padding:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between">
            <h4 style="font-size:var(--fs-sm);margin:0">${t('poll_create')||'Create New Poll'}</h4>
            <span id="pollCreateToggle" style="font-size:12px;color:var(--text-dim)">${hideCreatePane ? '▶' : '▼'}</span>
          </div>
          <div id="pollCreateBody" style="padding:0 12px 12px 12px;${hideCreatePane ? 'display:none' : ''}">
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('poll_title')||'Poll title'}:</label>
            <input type="text" id="pollTitleInput" placeholder="${t('poll_title')||'Poll title'}..." maxlength="100"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div id="pollTagsContainer" style="margin-bottom:0"></div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;margin-bottom:4px;display:block">${t('poll_questions')||'Questions'}:</label>
            <div style="margin-bottom:4px;display:flex;gap:6px;align-items:center">
              <select id="pollQuestionnaireSelect" style="flex:1;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                <option value="">${t('questionnaire_none')||'Custom questions'}</option>
              </select>
              <button class="btn btn-sm btn-secondary" id="pollUseQuestionnaire">${t('questionnaire_use')||'Use Questionnaire'}</button>
            </div>
            <div id="pollQuestionList">
            </div>
            <button class="btn btn-sm btn-secondary" id="pollAddQuestion" style="margin-top:4px">+ ${t('poll_add_question')||'Add question'}</button>
          </div>
          <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('poll_target')||'Target'}:</label>
            <div class="toggle-btn-group" style="font-size:10px">
              <button class="toggle-btn active" id="pollModeUser" data-poll-mode="users">${t('poll_target_users')||'Users'}</button>
              <button class="toggle-btn" id="pollModeGroup" data-poll-mode="groups">${t('poll_target_groups')||'Groups'}</button>
              <button class="toggle-btn" id="pollModeRole" data-poll-mode="roles">${t('poll_target_roles')||'Roles'}</button>
            </div>
          </div>
          <div id="pollTargetUsers">
            <div id="pollUserList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.users||[]).filter(u => u.id !== state.user.id).map(u => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="poll-user-cb" value="${u.id}" style="margin-right:4px">
                  ${u.availability === 'busy' ? '🟡' : u.availability === 'dnd' ? '🔴' : u.availability === 'away' ? '⚪' : '🟢'} ${escHtml(u.display_name||u.username)}
                </label>`).join('')}
            </div>
          </div>
          <div id="pollTargetGroups" style="display:none">
            <div id="pollGroupList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.groups||[]).map(g => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="poll-group-cb" value="${g.id}" style="margin-right:4px">
                  <span class="group-icon-badge">👥</span> ${escHtml(g.name)}
                </label>`).join('')}
            </div>
          </div>
          <div id="pollTargetRoles" style="display:none">
            <div id="pollRoleList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${[...new Set((state.users||[]).map(u => u.role).filter(Boolean))].map(role => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="poll-role-cb" value="${role}" style="margin-right:4px">
                  🛡 ${getRoleDisplayName(role)}
                </label>`).join('')}
            </div>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btnCreatePoll">${t('poll_create')||'Create Poll'}</button>
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-dim)">
              <input type="checkbox" id="pollTimedCheck" style="accent-color:var(--accent);width:12px;height:12px">
              ${t('poll_timed')||'Timed Poll'}
            </label>
            <input type="datetime-local" id="pollTimedDateTime" style="display:none;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-dim)">
              <span>${t('poll_reminder_after')||'Remind after'}:</span>
              <input type="number" id="pollReminderMins" min="0" value="0" placeholder="0" style="width:50px;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
              <span>${t('poll_minutes')||'min'}</span>
            </label>
          </div>
          </div>
        </div>` : ''}
        <div id="pollActiveList"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  // Render tags input for poll
  let _pollTagInput = null;
  const pollTagsContainer = modal.querySelector('#pollTagsContainer');
  if (pollTagsContainer) {
    _pollTagInput = _renderTagInput(pollTagsContainer, 'pollTags', t('tags_placeholder') || 'Tags (comma-separated)');
  }

  // Target mode switching
  modal.querySelectorAll('[data-poll-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-poll-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const m = btn.dataset.pollMode;
      const u = modal.querySelector('#pollTargetUsers');
      const g = modal.querySelector('#pollTargetGroups');
      const r = modal.querySelector('#pollTargetRoles');
      if (u) u.style.display = m === 'users' ? '' : 'none';
      if (g) g.style.display = m === 'groups' ? '' : 'none';
      if (r) r.style.display = m === 'roles' ? '' : 'none';
    });
  });

  // Collapsible create pane toggle
  const pollCreateHeader = modal.querySelector('#pollCreateHeader');
  if (pollCreateHeader) {
    pollCreateHeader.addEventListener('click', () => {
      const body = modal.querySelector('#pollCreateBody');
      const toggle = modal.querySelector('#pollCreateToggle');
      if (body) {
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? '' : 'none';
        if (toggle) toggle.textContent = hidden ? '▼' : '▶';
      }
    });
  }

  // Timed poll toggle
  const pollTimedCheck = modal.querySelector('#pollTimedCheck');
  const pollTimedDateTime = modal.querySelector('#pollTimedDateTime');
  if (pollTimedCheck && pollTimedDateTime) {
    pollTimedCheck.addEventListener('change', () => {
      pollTimedDateTime.style.display = pollTimedCheck.checked ? '' : 'none';
      const btn = modal.querySelector('#btnCreatePoll');
      if (btn) btn.textContent = pollTimedCheck.checked
        ? (t('poll_schedule')||'Schedule Poll')
        : (t('poll_create')||'Create Poll');
      if (pollTimedCheck.checked && !pollTimedDateTime.value) {
        const d = new Date(); d.setMinutes(d.getMinutes() + 30);
        pollTimedDateTime.value = fmtDateInput(d);
      }
    });
  }

  // Load questionnaires into dropdown
  const qSelect = modal.querySelector('#pollQuestionnaireSelect');
  if (qSelect) {
    try {
      const resp = await api('GET', '/api/poll-questionnaires');
      const questionnaires = await resp.json();
      questionnaires.forEach(q => {
        const tq = _translateSQ(q);
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = tq.name + (q.built_in ? ` (${t('questionnaire_builtin')||'Built-in'})` : '');
        opt.dataset.questions = JSON.stringify(tq.questions || []);
        qSelect.appendChild(opt);
      });
    } catch(e) { console.warn('Failed to load questionnaires', e); }
  }
  const useQBtn = modal.querySelector('#pollUseQuestionnaire');
  if (useQBtn) {
    useQBtn.addEventListener('click', () => {
      const list = modal.querySelector('#pollQuestionList');
      if (!list) return;
      const sel = modal.querySelector('#pollQuestionnaireSelect');
      if (!sel || !sel.value) return;
      const opt = sel.selectedOptions[0];
      const questions = JSON.parse(opt.dataset.questions || '[]');
      list.innerHTML = '';
      questions.forEach(q => {
        const typeMap = { scale_0_3: 'scale', yes_no: 'yes_no', free_text: 'free_text' };
        _addPollQuestionRow(list, q.text, typeMap[q.type] || q.type || 'scale');
      });
    });
  }

  // Add question button
  const addBtn = modal.querySelector('#pollAddQuestion');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const list = modal.querySelector('#pollQuestionList');
      if (list) _addPollQuestionRow(list, '', 'scale');
    });
  }

  // Create poll button
  const createBtn = modal.querySelector('#btnCreatePoll');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const title = modal.querySelector('#pollTitleInput')?.value?.trim();
      if (!title) { showError(t('poll_title_required')||'Poll title is required'); return; }
      const questions = [];
      modal.querySelectorAll('.poll-q-row').forEach(row => {
        const text = row.querySelector('.poll-q-text')?.value?.trim();
        const type = row.querySelector('.poll-q-type')?.value || 'scale';
        if (text) questions.push({ text, type });
      });
      if (questions.length === 0) { showError(t('poll_questions_required')||'At least one question is required'); return; }

      // Gather targets — backend expects target_type + target_ids
      const activeMode = modal.querySelector('[data-poll-mode].active')?.dataset?.pollMode || 'users';
      let targetType = 'user';
      let targetIds = [];
      if (activeMode === 'users') {
        targetType = 'user';
        modal.querySelectorAll('.poll-user-cb:checked').forEach(cb => targetIds.push(cb.value));
      } else if (activeMode === 'groups') {
        targetType = 'group';
        modal.querySelectorAll('.poll-group-cb:checked').forEach(cb => targetIds.push(cb.value));
      } else if (activeMode === 'roles') {
        targetType = 'role';
        modal.querySelectorAll('.poll-role-cb:checked').forEach(cb => targetIds.push(cb.value));
      }
      if (targetIds.length === 0) {
        showError(t('poll_target_required')||'Select at least one target'); return;
      }

      // Map question types to backend format and add IDs
      const mappedQs = questions.map((q, i) => ({
        id: 'q_' + i,
        text: q.text,
        type: q.type === 'scale' ? 'scale_0_3' : q.type,
        required: q.type !== 'free_text'
      }));

      try {
        const payload = { title, questions: mappedQs, target_type: targetType, target_ids: targetIds.map(String) };
        // Include tags if any selected
        if (_pollTagInput) {
          const tags = _pollTagInput.getSelectedTags();
          if (tags.length > 0) payload.tags = tags;
        }
        // Timed poll
        const isPollTimed = modal.querySelector('#pollTimedCheck')?.checked || false;
        const pollTimedVal = isPollTimed ? modal.querySelector('#pollTimedDateTime')?.value : null;
        if (isPollTimed && pollTimedVal) {
          const scheduledDate = new Date(pollTimedVal);
          if (isNaN(scheduledDate.getTime()) || scheduledDate.getFullYear() < 2000) {
            showError(t('poll_invalid_schedule_date')||'Invalid scheduled date. Please use a valid future date.');
            return;
          }
          if (scheduledDate <= new Date()) {
            showError(t('poll_schedule_past')||'Scheduled date must be in the future.');
            return;
          }
          payload.scheduled_at = scheduledDate.toISOString();
        }
        // Reminder
        const reminderMins = parseInt(modal.querySelector('#pollReminderMins')?.value || '0', 10);
        if (reminderMins > 0) payload.reminder_mins = reminderMins;
        const res = await apiPost('/api/polls', payload);
        if (!res.ok) {
          let errMsg = '';
          try {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const err = await res.json();
              errMsg = err.error || '';
            }
          } catch {}
          if (!errMsg) {
            errMsg = res.status === 403 ? (t('poll_no_permission')||'You do not have permission to create polls (requires team lead role)')
              : res.status === 404 ? (t('poll_not_available')||'Poll feature is not available on this server version')
              : (t('poll_create_failed')||'Failed to create poll') + ' (HTTP ' + res.status + ')';
          }
          throw new Error(errMsg);
        }
        showNotification('success',t('poll_created')||'Poll created successfully');
        // Collapse create pane and clear fields after successful creation
        const createBody = modal.querySelector('#pollCreateBody');
        const createToggle = modal.querySelector('#pollCreateToggle');
        if (createBody) createBody.style.display = 'none';
        if (createToggle) createToggle.textContent = '▶';
        modal.querySelector('#pollTitleInput').value = '';
        const qList = modal.querySelector('#pollQuestionList');
        if (qList) qList.innerHTML = '';
        _loadPolls(modal);
      } catch (e) { showError(e.message); }
    });
  }

  // Load existing polls
  _loadPolls(modal);
}

function _renumberPollQuestions(container) {
  container.querySelectorAll('.poll-q-row').forEach((row, i) => {
    const num = row.querySelector('.poll-q-num');
    if (num) num.textContent = (i + 1) + '.';
  });
}

// Translate built-in questionnaire fields via i18n keys
function _translateSQ(q) {
  if (!q || !q.built_in || q.id >= 0) return q;
  const idx = Math.abs(q.id);
  const tq = Object.assign({}, q);
  tq.name = t('sq' + idx + '_name') || q.name;
  tq.description = t('sq' + idx + '_desc') || q.description;
  if (q.questions) {
    tq.questions = q.questions.map(qu => {
      const tText = t('sq' + idx + '_q_' + qu.id);
      return tText ? Object.assign({}, qu, { text: tText }) : qu;
    });
  }
  return tq;
}

function _addPollQuestionRow(container, text, type) {
  const row = document.createElement('div');
  row.className = 'poll-q-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
  const idx = container.querySelectorAll('.poll-q-row').length + 1;
  row.innerHTML = `
    <span class="poll-q-num" style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;min-width:20px;text-align:right;flex-shrink:0">${idx}.</span>
    <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
      <button class="btn btn-ghost poll-q-up" style="padding:0 3px;font-size:9px;line-height:1" title="${t('move_up')||'Move up'}">▲</button>
      <button class="btn btn-ghost poll-q-down" style="padding:0 3px;font-size:9px;line-height:1" title="${t('move_down')||'Move down'}">▼</button>
    </div>
    <textarea class="poll-q-text" placeholder="${t('poll_custom_question')||'Question text...'}"
      style="flex:1;width:auto;min-width:0;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;min-height:32px;height:32px;line-height:1.4">${escHtml(text)}</textarea>
    <select class="poll-q-type" style="width:auto;padding:4px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);flex-shrink:0">
      <option value="scale" ${type==='scale'?'selected':''}>${t('poll_type_scale')||'Scale 0-3'}</option>
      <option value="yes_no" ${type==='yes_no'?'selected':''}>${t('poll_type_yes_no')||'Yes / No'}</option>
      <option value="free_text" ${type==='free_text'?'selected':''}>${t('poll_type_free_text')||'Free text'}</option>
    </select>
    <button class="btn btn-sm btn-danger" style="padding:2px 6px;font-size:10px;flex-shrink:0" title="${t('poll_remove_question')||'Remove'}">✕</button>`;
  row.querySelector('.btn-danger').addEventListener('click', () => { row.remove(); _renumberPollQuestions(container); });
  row.querySelector('.poll-q-up').addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev) { container.insertBefore(row, prev); _renumberPollQuestions(container); }
  });
  row.querySelector('.poll-q-down').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next) { container.insertBefore(next, row); _renumberPollQuestions(container); }
  });
  container.appendChild(row);
}

async function _loadPolls(modal) {
  const wrap = modal.querySelector('#pollActiveList');
  if (!wrap) return;
  try {
    const res = await api('GET', '/api/polls');
    if (!res.ok) { wrap.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('poll_no_polls')||'No polls found.'}</p>`; return; }
    const polls = await res.json();
    if (!polls || polls.length === 0) { wrap.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('poll_no_polls')||'No polls found.'}</p>`; return; }

    // Sort polls: latest (most recently created) first
    polls.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    wrap.innerHTML = polls.map(poll => {
      const isOpen = poll.status === 'open';
      const isCreator = poll.created_by === state.user.id;
      const myResponses = (poll.responses || []).filter(r => r.user_id === state.user.id);
      const hasResponded = myResponses.length > 0;
      const totalTargets = (poll.target_ids || []).length || '?';
      // Count unique users who responded
      const respondedUsers = new Set((poll.responses || []).map(r => r.user_id));
      const totalResponses = respondedUsers.size;
      const statusColor = isOpen ? 'var(--accent)' : 'var(--text-dim)';
      const statusText = isOpen ? (t('poll_status_open')||'Open') : (t('poll_status_closed')||'Closed');

      let questionsHtml = '';
      if (isOpen && !hasResponded) {
        // Show response form
        questionsHtml = `<div class="poll-respond-form" data-poll-id="${poll.id}" style="margin-top:8px">
          ${(poll.questions || []).map((q, qi) => {
            if (q.type === 'scale' || q.type === 'scale_0_3') {
              return `<div style="margin-bottom:6px"><label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(q.text)}</label>
                <div class="toggle-btn-group" style="font-size:10px;margin-top:2px">
                  ${[0,1,2,3].map(v => `<button class="toggle-btn poll-scale-btn" data-qi="${qi}" data-val="${v}">${t('poll_scale_'+v)||['None','Low','Medium','High'][v]}</button>`).join('')}
                </div></div>`;
            } else if (q.type === 'yes_no') {
              return `<div style="margin-bottom:6px"><label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(q.text)}</label>
                <div class="toggle-btn-group" style="font-size:10px;margin-top:2px">
                  <button class="toggle-btn poll-yn-btn" data-qi="${qi}" data-val="yes">${t('yes')||'Yes'}</button>
                  <button class="toggle-btn poll-yn-btn" data-qi="${qi}" data-val="no">${t('no')||'No'}</button>
                </div></div>`;
            } else {
              return `<div style="margin-bottom:6px"><label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(q.text)}</label>
                <input type="text" class="poll-free-input" data-qi="${qi}" placeholder="${t('poll_type_free_text')||'Your answer...'}"
                  style="width:100%;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);margin-top:2px"></div>`;
            }
          }).join('')}
          <button class="btn btn-primary btn-sm poll-submit-btn" data-poll-id="${poll.id}" style="margin-top:6px">${t('poll_respond')||'Submit Response'}</button>
        </div>`;
      } else if (hasResponded) {
        questionsHtml = `<div style="margin-top:6px;font-size:var(--fs-xs);color:var(--accent);font-weight:600">✅ ${t('poll_responded')||'You have responded'}</div>`;
      }

      // Summary for creator — enhanced with respondent tracking
      let summaryHtml = '';
      if (isCreator) {
        const allTargetIDs = (poll.target_ids || []);
        const allResponses = poll.responses || [];
        const pollCreatedAt = new Date(poll.created_at);
        // Resolve who answered and who didn't
        const answeredMap = {};  // user_id -> { name, answeredAt, questionCount }
        allResponses.forEach(r => {
          if (!answeredMap[r.user_id]) {
            answeredMap[r.user_id] = { name: r.user_name, firstAt: new Date(r.answered_at), count: 0 };
          }
          answeredMap[r.user_id].count++;
          const at = new Date(r.answered_at);
          if (at < answeredMap[r.user_id].firstAt) answeredMap[r.user_id].firstAt = at;
        });
        const totalQuestions = (poll.questions || []).length;
        // Build respondent details
        const answeredUsers = Object.entries(answeredMap).map(([uid, info]) => {
          const diffMs = info.firstAt - pollCreatedAt;
          const diffSec = Math.floor(diffMs / 1000);
          const diffMin = Math.floor(diffSec / 60);
          const diffH = Math.floor(diffMin / 60);
          let diffStr = '';
          if (diffH > 0) diffStr = `${diffH}h ${diffMin % 60}m`;
          else if (diffMin > 0) diffStr = `${diffMin}m ${diffSec % 60}s`;
          else diffStr = `${diffSec}s`;
          const isPartial = info.count < totalQuestions;
          const u = (state.users||[]).find(u => u.id === parseInt(uid));
          const avail = u ? u.availability : '';
          const isRemote = u && u.location === 'remote';
          let statusIcon = '🟢';
          if (!u) statusIcon = '❓';
          else if (avail === 'away') statusIcon = '⚪';
          else if (avail === 'dnd') statusIcon = '🔴';
          else if (avail === 'busy') statusIcon = '🟡';
          else if (isRemote) statusIcon = '🌐';
          return { uid: parseInt(uid), name: info.name, diffStr, isPartial, statusIcon, isRemote };
        });
        // Find non-respondents
        const respondedSet = new Set(Object.keys(answeredMap).map(Number));
        let nonRespondents = [];
        // Try to resolve actual user names for targets
        if (poll.target_type === 'user') {
          allTargetIDs.forEach(idStr => {
            const uid = parseInt(idStr);
            if (!respondedSet.has(uid)) {
              const u = (state.users||[]).find(u => u.id === uid);
              const name = u ? (u.display_name||u.username) : `User #${uid}`;
              const avail = u ? u.availability : '';
              const isRemote = u && u.location === 'remote';
              let statusIcon = '🟢';
              if (!u) statusIcon = '❓';
              else if (avail === 'away') statusIcon = '⚪';
              else if (avail === 'dnd') statusIcon = '🔴';
              else if (avail === 'busy') statusIcon = '🟡';
              else if (isRemote) statusIcon = '🌐';
              nonRespondents.push({ uid, name, statusIcon, isRemote });
            }
          });
        }

        // Standard question table for scale/yes_no
        const standardQs = (poll.questions || []).filter(q => q.type === 'scale' || q.type === 'scale_0_3' || q.type === 'yes_no');
        let tableHtml = '';
        if (standardQs.length > 0 && answeredUsers.length > 0) {
          const headerCells = standardQs.map(q => `<th style="padding:3px 6px;border:1px solid var(--border);font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${escHtml(q.text)}">${escHtml(q.text.length > 30 ? q.text.slice(0,27)+'...' : q.text)}</th>`).join('');
          const rows = answeredUsers.map(au => {
            const cells = standardQs.map(q => {
              const resp = allResponses.find(r => r.user_id === au.uid && r.question_id === q.id);
              if (!resp) return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;color:var(--text-dim)">—</td>`;
              let val = resp.answer;
              let bg = '';
              if (q.type === 'scale' || q.type === 'scale_0_3') {
                const v = parseInt(val);
                if (v === 0) bg = 'background:#27AE6033';
                else if (v === 1) bg = 'background:#F39C1233';
                else if (v === 2) bg = 'background:#E67E2233';
                else if (v === 3) bg = 'background:#E74C3C33';
                val = t('poll_scale_'+v)||['None','Low','Medium','High'][v]||v;
              } else if (q.type === 'yes_no') {
                bg = val === 'yes' ? 'background:#27AE6022' : 'background:#E74C3C22';
                val = val === 'yes' ? (t('yes')||'Yes') : (t('no')||'No');
              }
              return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;font-size:10px;${bg}">${val}</td>`;
            }).join('');
            return `<tr><td style="padding:3px 6px;border:1px solid var(--border);font-size:10px;white-space:nowrap">${au.statusIcon} ${escHtml(au.name)}${au.isRemote ? ' 🌐' : ''}</td>${cells}</tr>`;
          }).join('');
          tableHtml = `<div style="margin-top:6px;overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:10px">
            <thead><tr><th style="padding:3px 6px;border:1px solid var(--border)"></th>${headerCells}</tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
        }

        // Free text responses
        const freeTextQs = (poll.questions || []).filter(q => q.type === 'free_text');
        let freeTextHtml = '';
        if (freeTextQs.length > 0) {
          freeTextHtml = freeTextQs.map(q => {
            const answers = allResponses.filter(r => r.question_id === q.id && r.answer).map(r => `<div style="padding:2px 0"><b>${escHtml(r.user_name)}</b>: ${escHtml(r.answer)}</div>`).join('');
            return answers ? `<div style="margin-top:4px"><em>${escHtml(q.text)}</em>${answers}</div>` : '';
          }).join('');
        }

        summaryHtml = `<div style="margin-top:8px;padding:8px;background:var(--bg3);border-radius:var(--radius);font-size:var(--fs-xs)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>${t('poll_responses')||'Responses'}: ${totalResponses}/${totalTargets}</strong>
            <span style="color:var(--text-dim)">${t('poll_started')||'Started'}: ${fmtDateTime(pollCreatedAt)}</span>
          </div>
          ${answeredUsers.length > 0 ? `<div style="margin-bottom:4px"><span style="color:#27AE60;font-weight:600">✅ ${t('poll_answered')||'Answered'}:</span>
            ${answeredUsers.map(au => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #27AE60${au.isPartial ? '80' : ''}">${au.statusIcon} ${escHtml(au.name)}${au.isRemote ? ' 🌐' : ''} <span style="color:var(--text-dim)">(+${au.diffStr})</span>${au.isPartial ? ` <span style="color:#F39C12" title="${t('poll_partial_answer')||'Partial answer'}">⚠</span>` : ''}</span>`).join(' ')}
          </div>` : ''}
          ${nonRespondents.length > 0 ? `<div style="margin-bottom:4px"><span style="color:#E74C3C;font-weight:600">❌ ${t('poll_not_answered')||'Not answered'}:</span>
            ${nonRespondents.map(nr => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #E74C3C">${nr.statusIcon} ${escHtml(nr.name)}${nr.isRemote ? ' 🌐' : ''}</span>`).join(' ')}
          </div>` : ''}
          ${tableHtml}
          ${freeTextHtml}
        </div>`;
      }

      return `<div class="sidebar-section" style="margin-bottom:8px;padding:10px;border:1px solid var(--border);border-radius:var(--radius)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:var(--fs-sm)">📊 ${escHtml(poll.title)}</strong>
          <span style="font-size:var(--fs-xs);color:${statusColor};font-weight:600">${statusText}</span>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">
          ${t('poll_started')||'Started'}: ${fmtDateTime(new Date(poll.created_at))}${isCreator ? ` — ${t('poll_responses')||'Responses'}: ${totalResponses}/${totalTargets}` : ''}
        </div>
        ${questionsHtml}
        ${summaryHtml}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          ${isCreator && isOpen ? `<button class="btn btn-sm btn-danger poll-close-btn" data-poll-id="${poll.id}">${t('poll_close')||'Close Poll'}</button>` : ''}
          ${isCreator && isOpen ? `<button class="btn btn-sm btn-secondary poll-remind-btn" data-poll-id="${poll.id}">${t('poll_send_reminder')||'Send Reminder'}</button>` : ''}
          ${isCreator || state.user?.role === 'admin' ? `<button class="btn btn-sm btn-secondary poll-delete-btn" data-poll-id="${poll.id}" style="color:var(--danger)">${t('poll_delete')||'Delete Poll'}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // Bind scale/yn toggle buttons
    wrap.querySelectorAll('.poll-scale-btn, .poll-yn-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const grp = btn.parentElement;
        grp.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Bind submit response
    wrap.querySelectorAll('.poll-submit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = parseInt(btn.dataset.pollId);
        const form = wrap.querySelector(`.poll-respond-form[data-poll-id="${pollId}"]`);
        if (!form) return;
        const poll = polls.find(p => p.id === pollId);
        if (!poll) return;
        const answers = (poll.questions || []).map((q, qi) => {
          let answer = '';
          if (q.type === 'scale_0_3' || q.type === 'scale') {
            const active = form.querySelector(`.poll-scale-btn[data-qi="${qi}"].active`);
            answer = active ? active.dataset.val : '';
          } else if (q.type === 'yes_no') {
            const active = form.querySelector(`.poll-yn-btn[data-qi="${qi}"].active`);
            answer = active ? active.dataset.val : '';
          } else {
            const input = form.querySelector(`.poll-free-input[data-qi="${qi}"]`);
            answer = input ? input.value.trim() : '';
          }
          return { question_id: q.id, answer };
        }).filter(a => a.answer);
        try {
          const res = await apiPut(`/api/polls/${pollId}/respond`, { answers });
          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || 'Failed'); }
          // Silence the repeating poll alarm — we've submitted our response.
          if (typeof stopRepeatingAlarm === 'function') stopRepeatingAlarm('poll-' + pollId);
          showNotification('success',t('poll_response_saved')||'Response saved');
          _loadPolls(modal);
        } catch (e) { showError(e.message); }
      });
    });

    // Bind close poll
    wrap.querySelectorAll('.poll-close-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = parseInt(btn.dataset.pollId);
        try {
          const res = await apiPut(`/api/polls/${pollId}/close`);
          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || 'Failed'); }
          showNotification('success',t('poll_closed_success')||'Poll closed');
          _loadPolls(modal);
        } catch (e) { showError(e.message); }
      });
    });

    // Bind send reminder
    wrap.querySelectorAll('.poll-remind-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = parseInt(btn.dataset.pollId);
        try {
          const res = await apiPost(`/api/polls/${pollId}/remind`, {});
          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || 'Failed'); }
          const data = await res.json().catch(()=>({}));
          showNotification('success', (t('poll_reminder_sent')||'Reminder sent') + (data.reminded != null ? ` (${data.reminded})` : ''));
        } catch (e) { showError(e.message); }
      });
    });

    // Bind delete poll
    wrap.querySelectorAll('.poll-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = parseInt(btn.dataset.pollId);
        if (!confirm(t('poll_delete_confirm')||'Are you sure you want to delete this poll? This cannot be undone.')) return;
        try {
          const res = await api('DELETE', `/api/polls/${pollId}`);
          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || 'Failed'); }
          showNotification('success', t('poll_deleted_success')||'Poll deleted');
          _loadPolls(modal);
        } catch (e) { showError(e.message); }
      });
    });
  } catch (e) {
    wrap.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('poll_no_polls')||'No polls found.'}</p>`;
  }
}

// Symbol palettes for each resource type
const _resourceSymbols = {
  room: ['🏠','🚪','🛋','📐','🪑','🖥','📽','🎙','📞','🏫','🏥','🏛','🏗','🔬','🧪'],
  building: ['🏢','🏬','🏭','🏗','🏛','🏤','🏣','🏦','🏨','🏩','🏪','🏫','🏥','⛪','🕌','🕍','🛕','⛩','🏰','🏯','🗼','🏚','🏘','🏙','🌆','🌇','🌃','🗽','🏟','⛲'],
  computer_service: ['💻','🖥','🖨','🖱','⌨','💾','💿','📀','🔌','📡','📶','🌐','🔒','🔑','🛡','⚙','🔧','🧰','📊','📈','🗄','🗃','📁','📂','📧','📨','🔗','🧮','☁','🔄','📲','📱','🤖','🧠','🔬','📟','🎛','📺','🎮','🕹','🌍','🔐','🛜','📳','🏧'],
  data_center: ['🖥','🗄','💾','📡','🔌','⚡','❄','🌡','🔒','🛡','🏗','🏢','📊','🔄','☁','🌐','📶','🧊','🔧','⚙','🖧','📦','🗃','🔋','💡','🌀','🎚','🎛','📟','🧰'],
  vehicle: ['🚗','🚙','🚕','🚌','🚎','🚐','🚑','🚒','🚓','🚔','🚘','🚍','🚖','🛻','🚚','🚛','🚜','✈️','🛩','🚁','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🛤','⛵','🛶','🚤','🛳','⛴','🛥','🏍','🛵','🚲','🛴','🛞','⛽','🚧'],
  equipment: ['🔧','🔨','⚒','🛠','⛏','🔩','⚙','🧰','🪛','🪚','📦','📮','🔐','🔒','🔓','📟','📠','📺','📻','📡','🔋','🔌','💡','🕯','🧲','🧯','🪜','🧱','⛓','🪝','🎖','🏅','🔭','🔬','🧪','⚗','🩺','💉','🩹','⚖','🧭','📐','📏'],
  exercise_area: ['🏋','🤸','🏃','🚴','🧗','🤺','🥊','🥋','⛹','🏊','🎯','🏹','🪂','🏕','🗺','🧭','⛰','🏔','🌲','🌳','🏟','🏜','🌾','🛤'],
  work_area: ['💼','📋','📝','🖊','📎','🗂','📁','🖥','📊','📈','🗃','📐','✏','📌','📍','🖇','📏','🧮','🏢','🏗','🛠','⚙'],
  rest_room: ['🛋','☕','🍵','🧘','😴','🛏','🪑','📺','🎵','📖','🎮','🕹','🍽','🧊','🚰','🚿','🏠','🛁','🌿','🕯'],
  training_ground: ['🎯','🏋','🪖','🔫','🛡','⚔','🏃','🧗','🪂','🏕','⛺','🗺','🧭','🎖','🏹','🥊','🤺','🚁','📡','🔭','⛰','🌲','🏔','🏜']
};

function openRoomModal(argJson) {
  const data = typeof argJson === 'string' ? JSON.parse(argJson) : (argJson || {});
  const isEdit = !!data.id;
  const typeLabel = {room:'Room', building:'Building', computer_service:'IT Service', data_center:'Data Center', exercise_area:'Exercise Area', work_area:'Work Area', rest_room:'Rest Room', training_ground:'Training Ground', capability:t('resource_capabilities')||'Capability', application:t('resource_applications')||'Application', infrastructure:t('resource_infrastructure')||'Infrastructure'};
  // Look up custom resource type label if not a built-in type
  let label = typeLabel[data.type] || 'Resource';
  if (!typeLabel[data.type] && state._customResourceTypes) {
    const ct = state._customResourceTypes.find(c => c.key === data.type);
    if (ct) label = ct.label;
  }
  const symbols = _resourceSymbols[data.type] || _resourceSymbols.room;
  const currentIcon = data.icon || '';
  const hasImage = isEdit && data.image_name;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header"><h3>${isEdit ? (t('btn_edit')||'Edit') : (t('btn_add')||'Add')} ${escHtml(label)}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button></div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <label class="form-label">${t('name')||'Name'}</label>
        <input class="form-input" id="rmName" value="${escHtml(data.name||'')}">
        <label class="form-label" style="margin-top:8px">${t('description')||'Description'}</label>
        <textarea class="form-input" id="rmDesc" rows="${data.type === 'capability' ? 3 : 1}" style="resize:vertical">${escHtml(data.description||'')}</textarea>
        ${data.type === 'capability' ? `
        <label class="form-label" style="margin-top:8px">${t('kt_zone')||'Zone'}</label>
        <input class="form-input" id="rmZone" value="${escHtml(data.zone||'')}" placeholder="${t('cap_zone_ph')||'e.g. North, HQ, DMZ'}">
        <label class="form-label" style="margin-top:8px">${t('cap_responsibility')||'Ownership'}</label>
        <input class="form-input" id="rmResponsibility" value="${escHtml(data.responsibility||'')}" placeholder="${t('cap_responsibility_ph')||'e.g. J6 Cyber Ops, CISO'}">
        <label class="form-label" style="margin-top:8px">${t('kt_owner')||'Owner'}</label>
        <input class="form-input" id="rmOwner" value="${escHtml(data.owner||'')}" placeholder="${t('cap_owner_ph')||'e.g. Unit Commander, CTO'}">
        <label class="form-label" style="margin-top:8px">${t('kt_status')||'Status'}</label>
        <select class="form-input" id="rmStatus" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px">
          <option value="working"${data.status==='working'?' selected':''}>${t('cap_status_working')||'Working'}</option>
          <option value="degraded"${data.status==='degraded'?' selected':''}>${t('cap_status_degraded')||'Degraded'}</option>
          <option value="down"${data.status==='down'?' selected':''}>${t('cap_status_down')||'Down'}</option>
          <option value="unknown"${(data.status==='unknown'||!data.status)?' selected':''}>${t('cap_status_unknown')||'Unknown'}</option>
        </select>
        ` : ''}
        ${data.type === 'room' ? `<label class="form-label" style="margin-top:8px">${t('room_sub_type')||'Room Type'}</label>
        <select class="form-input" id="rmSubType" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px">
          <option value="">${t('room_type_general')||'General'}</option>
          <option value="meeting_room"${data.sub_type==='meeting_room'?' selected':''}>${t('room_type_meeting')||'Meeting Room'}</option>
          <option value="video_room"${data.sub_type==='video_room'?' selected':''}>${t('room_type_video')||'Video Room'}</option>
          <option value="aula"${data.sub_type==='aula'?' selected':''}>${t('room_type_aula')||'Aula / Lecture Hall'}</option>
          <option value="studio"${data.sub_type==='studio'?' selected':''}>${t('room_type_studio')||'Studio'}</option>
          <option value="server_room"${data.sub_type==='server_room'?' selected':''}>${t('room_type_server')||'Server Room'}</option>
          <option value="depot"${data.sub_type==='depot'?' selected':''}>${t('room_type_depot')||'Depot / Storage'}</option>
          <option value="workshop"${data.sub_type==='workshop'?' selected':''}>${t('room_type_workshop')||'Workshop'}</option>
          <option value="lab"${data.sub_type==='lab'?' selected':''}>${t('room_type_lab')||'Laboratory'}</option>
        </select>` : ''}
        <label class="form-label" style="margin-top:8px">${t('location')||'Location'}</label>
        <input class="form-input" id="rmLoc" value="${escHtml(data.location||'')}">
        <div style="display:flex;gap:8px;margin-top:8px">
          <div style="flex:1">
            <label class="form-label">${t('latitude')||'Latitude'}</label>
            <input class="form-input" id="rmLat" type="number" step="any" min="-90" max="90" placeholder="e.g. 59.33" value="${data.latitude != null ? data.latitude : ''}">
          </div>
          <div style="flex:1">
            <label class="form-label">${t('longitude')||'Longitude'}</label>
            <input class="form-input" id="rmLng" type="number" step="any" min="-180" max="180" placeholder="e.g. 18.07" value="${data.longitude != null ? data.longitude : ''}">
          </div>
        </div>
        ${data.type === 'room' ? `<label class="form-label" style="margin-top:8px">${t('capacity')||'Capacity'}</label>
        <input class="form-input" id="rmCap" type="number" value="${data.capacity||0}">` : ''}

        <label class="form-label" style="margin-top:12px">${t('rm_icon')||'Symbol'}</label>
        <div id="rmIconGrid" style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto;padding:4px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border)">
          ${symbols.map(s => `<button type="button" class="rm-icon-btn${currentIcon===s?' rm-icon-selected':''}" data-icon="${s}" style="font-size:20px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:${currentIcon===s?'var(--accent)':'var(--bg2)'};border:1px solid ${currentIcon===s?'var(--accent)':'var(--border)'};border-radius:var(--radius);cursor:pointer">${s}</button>`).join('')}
        </div>
        <input type="hidden" id="rmIcon" value="${escHtml(currentIcon)}">

        ${isEdit ? `<label class="form-label" style="margin-top:12px">${t('rm_assigned_users')||'Assigned Users'}</label>
        <div id="rmAssignedUsers" style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:4px;background:var(--bg3);margin-bottom:4px">
          ${(state.users||[]).map(u => {
            const checked = u.building_id === data.id;
            return '<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:var(--fs-xs);cursor:pointer">' +
              '<input type="checkbox" class="rmUserCheck" value="' + u.id + '"' + (checked ? ' checked' : '') + ' style="width:14px;height:14px;accent-color:var(--accent)">' +
              escHtml(u.display_name || u.username) + '</label>';
          }).join('')}
        </div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin:0 0 8px">${t('rm_assigned_users_hint')||'Select users assigned to this building/resource'}</p>
        ` : ''}
        <label class="form-label" style="margin-top:12px">${t('rm_image')||'Photo / Image'}</label>
        ${hasImage ? `<div id="rmCurrentImage" style="margin-bottom:6px">
          <img src="/api/rooms/${data.id}/image" alt="Resource image" style="max-width:100%;max-height:150px;border-radius:var(--radius);border:1px solid var(--border)">
        </div>` : ''}
        <input type="file" id="rmImageFile" accept="image/*" style="font-size:var(--fs-xs)">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-action="_closeParentModal" data-arg-el>${t('btn_cancel')||'Cancel'}</button>
        <button class="btn btn-primary" id="rmSaveBtn">${t('btn_save')||'Save'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  // Icon selection
  modal.querySelectorAll('.rm-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.rm-icon-btn').forEach(b => {
        b.style.background = 'var(--bg2)';
        b.style.borderColor = 'var(--border)';
        b.classList.remove('rm-icon-selected');
      });
      btn.style.background = 'var(--accent)';
      btn.style.borderColor = 'var(--accent)';
      btn.classList.add('rm-icon-selected');
      modal.querySelector('#rmIcon').value = btn.dataset.icon;
    });
  });

  modal.querySelector('#rmSaveBtn').addEventListener('click', async () => {
    const room = {
      name: (modal.querySelector('#rmName')?.value || '').trim(),
      type: data.type || 'room',
      sub_type: modal.querySelector('#rmSubType')?.value || '',
      description: (modal.querySelector('#rmDesc')?.value || '').trim(),
      location: (modal.querySelector('#rmLoc')?.value || '').trim(),
      latitude: modal.querySelector('#rmLat')?.value ? parseFloat(modal.querySelector('#rmLat').value) : null,
      longitude: modal.querySelector('#rmLng')?.value ? parseFloat(modal.querySelector('#rmLng').value) : null,
      capacity: parseInt(modal.querySelector('#rmCap')?.value) || 0,
      icon: modal.querySelector('#rmIcon')?.value || '',
      enabled: true,
    };
    // Capability-specific fields
    if (data.type === 'capability') {
      room.zone = (modal.querySelector('#rmZone')?.value || '').trim();
      room.responsibility = (modal.querySelector('#rmResponsibility')?.value || '').trim();
      room.owner = (modal.querySelector('#rmOwner')?.value || '').trim();
      room.status = modal.querySelector('#rmStatus')?.value || 'unknown';
    }
    if (isEdit) {
      room.id = data.id;
      room.image_name = data.image_name || '';
    }
    if (!room.name) { showError(t('resource_name_required')||'A name is required for this resource.'); return; }
    const res = await apiPut('/api/rooms', room);
    if (!res.ok) { showError('Failed to save'); return; }

    // Upload image if selected
    const imgFile = modal.querySelector('#rmImageFile')?.files?.[0];
    const roomId = isEdit ? data.id : (await (async () => {
      // For new rooms, fetch the room list to find the one we just created
      const rooms = await apiGet('/api/rooms');
      const found = rooms?.find(r => r.name === room.name && r.type === room.type);
      return found?.id;
    })());
    if (imgFile && roomId) {
      const fd = new FormData();
      fd.append('image', imgFile);
      await api('POST', `/api/rooms/${roomId}/image`, fd);
    }

    // Update user building assignments
    if (isEdit && roomId) {
      const checkedIds = new Set();
      modal.querySelectorAll('.rmUserCheck:checked').forEach(cb => checkedIds.add(parseInt(cb.value)));
      const allUsers = state.users || [];
      for (const u of allUsers) {
        const wasAssigned = u.building_id === data.id;
        const nowAssigned = checkedIds.has(u.id);
        if (nowAssigned && !wasAssigned) {
          await apiPut('/api/users/' + u.id, { building_id: roomId });
        } else if (!nowAssigned && wasAssigned) {
          await apiPut('/api/users/' + u.id, { building_id: 0 });
        }
      }
    }

    showNotification('success', `${label} ${t('saved')||'saved'}`);
    modal.remove();
    renderSidebar();
  });
}

// ── Checklists ──────────────────────────────────────────────────────────────

function showChecklistsInSidebar() {
  state.sidebarTab = 'checklists';
  // Activate the tab visually (even though the tab button is removed, renderSidebar handles the content)
  document.querySelectorAll('#sidebarTabs .sidebar-tab').forEach(btn => btn.classList.remove('active'));
  renderSidebar();
}

async function _loadChecklistInstances() {
  const activeEl = document.getElementById('checklistActiveList');
  const completedEl = document.getElementById('checklistCompletedList');
  if (!activeEl || !completedEl) return;
  try {
    const res = await api('GET', '/api/checklist-instances');
    const instances = await res.json();
    const active = instances.filter(i => i.status === 'active');
    const completed = instances.filter(i => i.status === 'completed');
    if (active.length === 0) {
      activeEl.innerHTML = `<p style="color:var(--text-dim);font-style:italic">${t('checklist_no_active')||'No active checklists.'}</p>`;
    } else {
      activeEl.innerHTML = active.map(ci => {
        const total = ci.items.length;
        const checked = ci.items.filter(it => it.checked).length;
        const pct = total > 0 ? Math.round(checked/total*100) : 0;
        return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:8px;margin-bottom:6px;background:var(--bg2);cursor:pointer" data-action="openChecklistInstance" data-arg="${ci.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <strong style="font-size:var(--fs-sm)">${escHtml(ci.name)}</strong>
            <span style="font-size:10px;color:var(--text-dim)">${checked}/${total}</span>
          </div>
          <div style="background:var(--bg3);border-radius:4px;height:6px;overflow:hidden">
            <div style="background:var(--accent);height:100%;width:${pct}%;transition:width .3s"></div>
          </div>
        </div>`;
      }).join('');
    }
    if (completed.length === 0) {
      completedEl.innerHTML = `<p style="color:var(--text-dim);font-style:italic">—</p>`;
    } else {
      completedEl.innerHTML = completed.slice(0, 10).map(ci =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer" data-action="openChecklistInstance" data-arg="${ci.id}">
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:var(--fs-xs)">${escHtml(ci.name)}</span>
            <span style="font-size:10px;color:var(--text-dim)">${ci.completed_at ? new Date(ci.completed_at).toLocaleDateString() : ''}</span>
          </div>
          ${ci.completed_by_name ? `<div style="font-size:10px;color:var(--text-dim)">${t('checklist_completed_by')||'Completed by'}: ${escHtml(ci.completed_by_name)}</div>` : ''}
        </div>`
      ).join('');
    }
    _bindActions(activeEl);
    _bindActions(completedEl);
  } catch(e) {
    activeEl.innerHTML = `<p style="color:var(--danger)">Failed to load checklists</p>`;
    completedEl.innerHTML = '';
  }
}

async function _loadChecklistLog() {
  const container = document.getElementById('checklistLogEntries');
  if (!container) return;
  try {
    const res = await api('GET', '/api/checklist-instances');
    const instances = await res.json();
    const completed = instances.filter(i => i.status === 'completed').sort((a, b) =>
      (b.completed_at ? new Date(b.completed_at) : 0) - (a.completed_at ? new Date(a.completed_at) : 0)
    );
    if (completed.length === 0) {
      container.innerHTML = `<em style="color:var(--text-dim)">${t('checklist_logs_empty')||'No completed checklists yet.'}</em>`;
      return;
    }
    container.innerHTML = completed.map(ci => {
      const total = ci.items ? ci.items.length : 0;
      const checked = ci.items ? ci.items.filter(it => it.checked).length : 0;
      const skipped = ci.items ? ci.items.filter(it => it.skipped).length : 0;
      return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:8px;margin-bottom:6px;background:var(--bg2);cursor:pointer" data-action="openChecklistInstance" data-arg="${ci.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <strong style="font-size:var(--fs-sm)">${escHtml(ci.name)}</strong>
          <span style="font-size:10px;color:var(--text-dim)">${ci.completed_at ? new Date(ci.completed_at).toLocaleString() : ''}</span>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim)">
          ${ci.completed_by_name ? `${t('checklist_completed_by')||'Completed by'}: <strong>${escHtml(ci.completed_by_name)}</strong>` : ''}
          ${ci.created_by_name ? ` · Started by: ${escHtml(ci.created_by_name)}` : ''}
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
          ✅ ${checked} checked · ⏭ ${skipped} skipped · ${total} total
        </div>
      </div>`;
    }).join('');
    _bindActions(container);
  } catch(e) {
    container.innerHTML = `<em style="color:var(--danger)">Failed to load checklist log</em>`;
  }
}

async function openChecklistStart() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px;width:90vw">
      <div class="modal-header">
        <h3>▶ ${t('checklist_start')||'Start Checklist'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:60vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('checklist_start')||'Select a checklist template to start:'}
        </p>
        <div id="checklistTemplateList" style="font-size:var(--fs-sm)">Loading...</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  try {
    const res = await api('GET', '/api/checklist-templates');
    const templates = await res.json();
    const listEl = modal.querySelector('#checklistTemplateList');
    if (templates.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-dim)">No templates available.</p>';
      return;
    }
    // Group templates by category
    const catOrder = ['Generic', 'Exercise', 'Incident', 'Operations', 'Tidslinjal'];
    const catIcons = { Generic: '📎', Exercise: '🎯', Incident: '🚨', Operations: '⚙', Tidslinjal: '📐' };
    const byCategory = {};
    templates.forEach(tmpl => {
      const cat = tmpl.category || (tmpl.built_in ? 'Generic' : t('checklist_custom') || 'Custom');
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(tmpl);
    });
    const sortedCats = Object.keys(byCategory).sort((a, b) => {
      const ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    let catHtml = '';
    sortedCats.forEach(cat => {
      const icon = catIcons[cat] || '📋';
      catHtml += `<div style="margin-bottom:12px">
        <div style="font-size:var(--fs-xs);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;display:flex;align-items:center;gap:4px">${icon} ${escHtml(cat)}</div>`;
      byCategory[cat].forEach(tmpl => {
        catHtml += `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:6px;background:var(--bg2)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${escHtml(tmpl.name)}</strong>
              ${tmpl.built_in ? `<span style="font-size:10px;color:var(--text-dim);margin-left:4px">(${t('checklist_builtin')||'Built-in'})</span>` : ''}
              <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${escHtml(tmpl.description||'')}</div>
              <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${tmpl.items?.length||0} items</div>
            </div>
            <button class="btn btn-sm btn-primary _cl_start_btn" data-tmpl-id="${tmpl.id}" data-tmpl-name="${escHtml(tmpl.name)}">▶ ${t('checklist_start')||'Start'}</button>
          </div>
        </div>`;
      });
      catHtml += '</div>';
    });
    listEl.innerHTML = catHtml;
    listEl.querySelectorAll('._cl_start_btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tid = parseInt(btn.dataset.tmplId);
        try {
          await api('POST', '/api/checklist-instances', { template_id: tid, name: btn.dataset.tmplName });
          showNotification('success', 'Checklist started');
          modal.remove();
          _loadChecklistInstances();
        } catch(e) { showError('Failed to start checklist'); }
      });
    });
  } catch(e) {
    modal.querySelector('#checklistTemplateList').innerHTML = '<p style="color:var(--danger)">Failed to load templates</p>';
  }
}

async function openChecklistInstance(idOrStr) {
  const id = typeof idOrStr === 'string' ? parseInt(idOrStr) : idOrStr;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:650px;width:90vw">
      <div class="modal-header">
        <h3>📋 ${t('checklists')||'Checklist'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:75vh;overflow-y:auto" id="checklistInstanceBody">Loading...</div>
      <div class="modal-footer" id="checklistInstanceFooter"></div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  try {
    const res = await api('GET', '/api/checklist-instances');
    const instances = await res.json();
    const ci = instances.find(x => x.id === id);
    if (!ci) { modal.querySelector('#checklistInstanceBody').innerHTML = 'Not found'; return; }

    function renderInstance() {
      const total = ci.items.length;
      const checked = ci.items.filter(it => it.checked).length;
      const skipped = ci.items.filter(it => it.skipped).length;
      const done = checked + skipped;
      const pct = total > 0 ? Math.round(done/total*100) : 0;
      const isComplete = ci.status === 'completed';

      // Group items by category
      const categories = {};
      ci.items.forEach((it, idx) => {
        const cat = it.category || '';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({ ...it, _idx: idx });
      });

      let html = `
        <div style="margin-bottom:12px">
          <h4 style="margin:0 0 4px 0;font-size:var(--fs-sm)">${escHtml(ci.name)}</h4>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="flex:1;background:var(--bg3);border-radius:4px;height:8px;overflow:hidden">
              <div style="background:${pct===100?'var(--success)':'var(--accent)'};height:100%;width:${pct}%;transition:width .3s"></div>
            </div>
            <span style="font-size:var(--fs-xs);color:var(--text-dim);white-space:nowrap">${done}/${total} (${pct}%)${skipped?' · '+skipped+' '+(t('checklist_skipped_label')||'skipped'):''}</span>
          </div>
        </div>`;

      for (const [cat, items] of Object.entries(categories)) {
        if (cat) html += `<div style="font-size:var(--fs-xs);color:var(--accent);font-weight:600;margin:8px 0 4px 0;text-transform:uppercase">${escHtml(cat)}</div>`;
        items.forEach(it => {
          const itemBg = it.skipped ? 'color-mix(in srgb, var(--warning) 8%, var(--bg2))' : it.checked ? 'color-mix(in srgb, var(--success) 8%, var(--bg2))' : 'var(--bg2)';
          const itemStyle = it.skipped ? 'text-decoration:line-through;opacity:.5;font-style:italic' : it.checked ? 'text-decoration:line-through;opacity:.6' : '';
          html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:var(--radius);margin-bottom:2px;background:${itemBg}">
            <label style="display:flex;align-items:flex-start;gap:8px;flex:1;cursor:${isComplete||it.skipped?'default':'pointer'};margin:0">
              <input type="checkbox" class="_cl_check" data-idx="${it._idx}" ${it.checked?'checked':''} ${isComplete||it.skipped?'disabled':''}
                style="margin-top:2px;width:16px;height:16px;accent-color:var(--success);flex-shrink:0">
              <span style="font-size:var(--fs-sm);${itemStyle}">${escHtml(it.text)}${it.skipped?' <em style="font-size:var(--fs-xs);color:var(--warning)">('+( t('checklist_skipped_label')||'skipped')+')</em>':''}</span>
            </label>
            ${!isComplete && !it.checked ? `<button class="_cl_skip btn btn-sm" data-idx="${it._idx}" style="padding:1px 6px;font-size:var(--fs-xs);opacity:.7;flex-shrink:0" title="${t('checklist_skip')||'Skip'}">${it.skipped?(t('checklist_unskip')||'Unskip'):(t('checklist_skip')||'Skip')}</button>` : ''}
          </div>`;
        });
      }
      modal.querySelector('#checklistInstanceBody').innerHTML = html;

      // Footer
      const footerEl = modal.querySelector('#checklistInstanceFooter');
      if (isComplete) {
        const completedInfo = ci.completed_by_name ? `<span style="font-size:var(--fs-xs);color:var(--text-dim);margin-right:auto">${t('checklist_completed_by')||'Completed by'}: <strong>${escHtml(ci.completed_by_name)}</strong>${ci.completed_at ? ' · ' + new Date(ci.completed_at).toLocaleString() : ''}</span>` : '';
        footerEl.innerHTML = `
          ${completedInfo}
          <button class="btn btn-sm btn-secondary" id="_cl_reopen">↩ ${t('checklist_reopen')||'Reopen'}</button>
          <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>`;
        footerEl.querySelector('#_cl_reopen').addEventListener('click', async () => {
          ci.status = 'active';
          ci.completed_at = null;
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          renderInstance();
          _loadChecklistInstances();
        });
      } else {
        footerEl.innerHTML = `
          <button class="btn btn-sm btn-danger" id="_cl_delete">🗑 ${t('checklist_delete')||'Delete'}</button>
          <button class="btn btn-sm btn-primary" id="_cl_complete" ${done<total?'disabled':''}>✅ ${t('checklist_complete')||'Mark Complete'}</button>
          <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>`;
        footerEl.querySelector('#_cl_complete').addEventListener('click', async () => {
          ci.status = 'completed';
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          showNotification('success', 'Checklist completed!');
          renderInstance();
          _loadChecklistInstances();
        });
        footerEl.querySelector('#_cl_delete').addEventListener('click', async () => {
          if (!confirm(t('checklist_delete_confirm')||'Delete this checklist?')) return;
          await api('DELETE', `/api/checklist-instances/${ci.id}`);
          modal.remove();
          _loadChecklistInstances();
        });
      }
      _bindActions(footerEl);

      // Bind checkbox toggles
      modal.querySelectorAll('._cl_check').forEach(cb => {
        cb.addEventListener('change', async () => {
          const idx = parseInt(cb.dataset.idx);
          ci.items[idx].checked = cb.checked;
          if (cb.checked) {
            ci.items[idx].checked_by = state.user?.id || 0;
            const now = new Date().toISOString();
            ci.items[idx].checked_at = now;
          } else {
            ci.items[idx].checked_by = 0;
            ci.items[idx].checked_at = null;
          }
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          renderInstance();
          _loadChecklistInstances();
        });
      });

      // Bind skip toggles
      modal.querySelectorAll('._cl_skip').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const idx = parseInt(btn.dataset.idx);
          const wasSkipped = ci.items[idx].skipped;
          ci.items[idx].skipped = !wasSkipped;
          if (!wasSkipped) {
            ci.items[idx].skipped_by = state.user?.id || 0;
            ci.items[idx].skipped_at = new Date().toISOString();
          } else {
            ci.items[idx].skipped_by = 0;
            ci.items[idx].skipped_at = null;
          }
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          renderInstance();
          _loadChecklistInstances();
        });
      });
    }
    renderInstance();
  } catch(e) {
    modal.querySelector('#checklistInstanceBody').innerHTML = '<p style="color:var(--danger)">Failed to load checklist</p>';
  }
}

function _addChecklistItemRow(container, text, category) {
  const row = document.createElement('div');
  row.className = 'cl-item-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
  row.innerHTML = `
    <button class="btn btn-sm cl-move-up" style="padding:1px 4px;font-size:9px;flex-shrink:0;opacity:.6" title="${t('checklist_move_up')||'Move up'}">▲</button>
    <button class="btn btn-sm cl-move-down" style="padding:1px 4px;font-size:9px;flex-shrink:0;opacity:.6" title="${t('checklist_move_down')||'Move down'}">▼</button>
    <input type="text" class="cl-item-text" placeholder="${t('checklist_item_text')||'Item text...'}" value="${escHtml(text)}"
      style="flex:1;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
    <input type="text" class="cl-item-cat" placeholder="${t('checklist_item_category')||'Category'}" value="${escHtml(category||'')}"
      style="width:100px;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
    <button class="btn btn-sm btn-danger" style="padding:2px 6px;font-size:10px;flex-shrink:0" title="${t('checklist_remove')||'Remove'}">✕</button>`;
  row.querySelector('.btn-danger').addEventListener('click', () => row.remove());
  row.querySelector('.cl-move-up').addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev && prev.classList.contains('cl-item-row')) container.insertBefore(row, prev);
  });
  row.querySelector('.cl-move-down').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next && next.classList.contains('cl-item-row')) container.insertBefore(next, row);
  });
  container.appendChild(row);
}

async function openChecklistEditor() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:900px;width:90vw">
      <div class="modal-header">
        <h3>✏ ${t('checklist_editor')||'Checklist Editor'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:80vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('checklists_desc')||'Create and manage reusable checklist templates.'}
        </p>
        <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
          <select id="clEditorList" style="flex:1;min-width:200px;padding:6px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            <option value="__new__">── ${t('checklist_new')||'New Checklist'} ──</option>
          </select>
          <button class="btn btn-sm btn-primary" id="clEditorNewBtn">+ ${t('checklist_new')||'New'}</button>
          <button class="btn btn-sm btn-secondary" id="clEditorCloneBtn" style="display:none">📋 ${t('checklist_clone')||'Clone'}</button>
        </div>
        <div id="clEditorForm" style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--bg2)">
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('checklist_template_name')||'Checklist Name'}:</label>
            <input type="text" id="clEditorName" placeholder="${t('checklist_template_name')||'Checklist Name'}..." maxlength="200"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('checklist_template_desc')||'Description'}:</label>
            <input type="text" id="clEditorDesc" placeholder="${t('checklist_template_desc')||'Description'}..." maxlength="500"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;margin-bottom:4px;display:block">${t('checklist_items')||'Items'}:</label>
            <div id="clEditorItems"></div>
            <button class="btn btn-sm btn-secondary" id="clEditorAddItem" style="margin-top:4px">+ ${t('checklist_add_item')||'Add Item'}</button>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-sm btn-danger" id="clEditorDeleteBtn" style="display:none">${t('checklist_delete')||'Delete'}</button>
            <button class="btn btn-sm btn-primary" id="clEditorSaveBtn">${t('checklist_save')||'Save Checklist'}</button>
          </div>
          <div id="clEditorBuiltinNote" style="display:none;margin-top:8px;padding:8px;background:var(--bg3);border-radius:var(--radius);font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('checklist_builtin')||'Built-in'} — read-only
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  let templates = [];
  const listEl = modal.querySelector('#clEditorList');
  const nameEl = modal.querySelector('#clEditorName');
  const descEl = modal.querySelector('#clEditorDesc');
  const itemsEl = modal.querySelector('#clEditorItems');
  const deleteBtn = modal.querySelector('#clEditorDeleteBtn');
  const saveBtn = modal.querySelector('#clEditorSaveBtn');
  const builtinNote = modal.querySelector('#clEditorBuiltinNote');
  const cloneBtn = modal.querySelector('#clEditorCloneBtn');

  async function loadList() {
    try {
      const resp = await api('GET', '/api/checklist-templates');
      templates = await resp.json();
    } catch(e) { templates = []; }
    listEl.innerHTML = `<option value="__new__">── ${t('checklist_new')||'New Checklist'} ──</option>`;
    templates.forEach(tmpl => {
      const opt = document.createElement('option');
      opt.value = tmpl.id;
      opt.textContent = tmpl.name + (tmpl.built_in ? ` (${t('checklist_builtin')||'Built-in'})` : '');
      listEl.appendChild(opt);
    });
  }

  function loadForm(tmpl) {
    const isBuiltIn = tmpl && tmpl.built_in;
    nameEl.value = tmpl ? tmpl.name : '';
    descEl.value = tmpl ? (tmpl.description || '') : '';
    itemsEl.innerHTML = '';
    if (tmpl && tmpl.items) {
      tmpl.items.forEach(it => _addChecklistItemRow(itemsEl, it.text, it.category));
    }
    nameEl.disabled = false;
    descEl.disabled = false;
    deleteBtn.style.display = (tmpl && !isBuiltIn && tmpl.id > 0) ? '' : 'none';
    saveBtn.style.display = '';
    saveBtn.textContent = isBuiltIn ? ('💾 ' + (t('checklist_save')||'Save as Custom')) : ('💾 ' + (t('checklist_save')||'Save Checklist'));
    builtinNote.style.display = isBuiltIn ? '' : 'none';
    builtinNote.innerHTML = isBuiltIn ? `${t('checklist_builtin')||'Built-in'} — ${t('checklist_clone')||'editing will save as a new custom checklist'}` : '';
    cloneBtn.style.display = tmpl ? '' : 'none';
    itemsEl.querySelectorAll('input').forEach(el => el.disabled = false);
    itemsEl.querySelectorAll('.btn-danger').forEach(el => el.style.display = '');
    itemsEl.querySelectorAll('.cl-move-up,.cl-move-down').forEach(el => el.style.display = '');
    modal.querySelector('#clEditorAddItem').style.display = '';
  }

  listEl.addEventListener('change', () => {
    if (listEl.value === '__new__') {
      loadForm(null);
    } else {
      const tmpl = templates.find(x => String(x.id) === listEl.value);
      if (tmpl) loadForm(tmpl);
    }
  });

  modal.querySelector('#clEditorNewBtn').addEventListener('click', () => {
    listEl.value = '__new__';
    loadForm(null);
  });

  modal.querySelector('#clEditorAddItem').addEventListener('click', () => {
    _addChecklistItemRow(itemsEl, '', '');
  });

  saveBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) { showError(t('checklist_template_name')||'Name is required'); return; }
    const items = [];
    itemsEl.querySelectorAll('.cl-item-row').forEach(row => {
      const text = row.querySelector('.cl-item-text')?.value?.trim();
      const cat = row.querySelector('.cl-item-cat')?.value?.trim() || '';
      if (text) items.push({ text, category: cat });
    });
    if (items.length === 0) { showError(t('checklist_add_item')||'Add at least one item'); return; }
    const selectedId = listEl.value;
    const selectedTmpl = templates.find(x => String(x.id) === selectedId);
    const isBuiltIn = selectedTmpl && selectedTmpl.built_in;
    const body = { name, description: descEl.value.trim(), items };
    try {
      if (selectedId === '__new__' || isBuiltIn) {
        // Built-in templates are saved as new custom checklists
        await api('POST', '/api/checklist-templates', body);
        showNotification('success', `${name} created`);
      } else {
        await api('PUT', `/api/checklist-templates/${selectedId}`, body);
        showNotification('success', `${name} updated`);
      }
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to save: ' + (e.message||e)); }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(t('checklist_delete_confirm')||'Are you sure you want to delete this checklist?')) return;
    const selectedId = listEl.value;
    try {
      await api('DELETE', `/api/checklist-templates/${selectedId}`);
      showNotification('success', 'Checklist deleted');
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to delete: ' + (e.message||e)); }
  });

  cloneBtn.addEventListener('click', async () => {
    const selectedId = listEl.value;
    if (selectedId === '__new__') return;
    const tmpl = templates.find(x => String(x.id) === selectedId);
    if (!tmpl) return;
    const cloneName = (t('checklist_clone_name')||'Clone of') + ' ' + tmpl.name;
    const cloneItems = (tmpl.items || []).map(it => ({ text: it.text, category: it.category || '' }));
    try {
      await api('POST', '/api/checklist-templates', { name: cloneName, description: tmpl.description || '', items: cloneItems });
      showNotification('success', `${cloneName} created`);
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to clone: ' + (e.message||e)); }
  });

  await loadList();
  loadForm(null);
}

// ── Poll Questionnaire Editor ────────────────────────────────────────────────

async function openQuestionnaireEditor() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';

  modal.innerHTML = `
    <div class="modal" style="max-width:900px;width:90vw">
      <div class="modal-header">
        <h3>📝 ${t('questionnaire_editor')||'Poll Questions Editor'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:80vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('questionnaire_editor_desc')||'Create and manage reusable questionnaires for polls.'}
        </p>
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <select id="qEditorList" style="flex:1;padding:6px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            <option value="__new__">── ${t('questionnaire_new')||'New Questionnaire'} ──</option>
          </select>
          <button class="btn btn-sm btn-primary" id="qEditorNewBtn">+ ${t('questionnaire_new')||'New'}</button>
        </div>
        <div id="qEditorBuiltinWarn" style="display:none;margin-bottom:8px;padding:8px 12px;background:#fffbe6;border:1px solid #ffe58f;border-radius:var(--radius);font-size:var(--fs-xs);color:#8b6914">
          ⚠️ ${t('questionnaire_builtin_edit_warn')||'You are editing a built-in questionnaire. Changes will be saved as a new copy.'}
        </div>
        <div id="qEditorForm" style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--bg2)">
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('questionnaire_name')||'Questionnaire Name'}:</label>
            <input type="text" id="qEditorName" placeholder="${t('questionnaire_name')||'Questionnaire Name'}..." maxlength="200"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('questionnaire_desc')||'Description'}:</label>
            <input type="text" id="qEditorDesc" placeholder="${t('questionnaire_desc')||'Description'}..." maxlength="500"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;margin-bottom:4px;display:block">${t('questionnaire_questions')||'Questions'}:</label>
            <div id="qEditorQuestions"></div>
            <button class="btn btn-sm btn-secondary" id="qEditorAddQ" style="margin-top:4px">+ ${t('questionnaire_add_question')||'Add Question'}</button>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-sm btn-secondary" id="qEditorDuplicateBtn" style="display:none">📋 ${t('questionnaire_duplicate')||'Duplicate'}</button>
            <button class="btn btn-sm btn-danger" id="qEditorDeleteBtn" style="display:none">${t('questionnaire_delete')||'Delete'}</button>
            <button class="btn btn-sm btn-primary" id="qEditorSaveBtn">${t('questionnaire_save')||'Save Questionnaire'}</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  let questionnaires = [];
  let _builtinEditAcknowledged = false; // Only show confirmation once per session
  const listEl = modal.querySelector('#qEditorList');
  const nameEl = modal.querySelector('#qEditorName');
  const descEl = modal.querySelector('#qEditorDesc');
  const questionsEl = modal.querySelector('#qEditorQuestions');
  const deleteBtn = modal.querySelector('#qEditorDeleteBtn');
  const duplicateBtn = modal.querySelector('#qEditorDuplicateBtn');
  const saveBtn = modal.querySelector('#qEditorSaveBtn');
  const builtinWarn = modal.querySelector('#qEditorBuiltinWarn');

  async function loadList(selectId) {
    try {
      const resp = await api('GET', '/api/poll-questionnaires');
      questionnaires = await resp.json();
    } catch(e) { questionnaires = []; }
    // Rebuild select
    listEl.innerHTML = `<option value="__new__">── ${t('questionnaire_new')||'New Questionnaire'} ──</option>`;
    questionnaires.forEach(q => {
      const tq = _translateSQ(q);
      const opt = document.createElement('option');
      opt.value = q.id;
      opt.textContent = tq.name + (q.built_in ? ` (${t('questionnaire_builtin')||'Built-in'})` : '');
      listEl.appendChild(opt);
    });
    if (selectId !== undefined) {
      listEl.value = String(selectId);
    }
  }

  function _getCurrentQ() {
    if (listEl.value === '__new__') return null;
    return questionnaires.find(x => String(x.id) === listEl.value) || null;
  }

  function loadForm(q) {
    const isBuiltIn = q && q.built_in;
    _builtinEditAcknowledged = false; // Reset per questionnaire switch
    const tq = _translateSQ(q);
    nameEl.value = tq ? tq.name : '';
    descEl.value = tq ? (tq.description || '') : '';
    questionsEl.innerHTML = '';
    if (tq && tq.questions) {
      const typeMap = { scale_0_3: 'scale', yes_no: 'yes_no', free_text: 'free_text' };
      tq.questions.forEach(qu => _addPollQuestionRow(questionsEl, qu.text, typeMap[qu.type] || qu.type || 'scale'));
    }
    // All fields are always editable — built-in questionnaires can be edited (will save as copy)
    nameEl.disabled = false;
    descEl.disabled = false;
    questionsEl.querySelectorAll('textarea, select').forEach(el => el.disabled = false);
    questionsEl.querySelectorAll('.btn-danger').forEach(el => el.style.display = '');
    modal.querySelector('#qEditorAddQ').style.display = '';

    // Show/hide buttons
    deleteBtn.style.display = (q && !isBuiltIn && q.id > 0) ? '' : 'none';
    duplicateBtn.style.display = (q && q.id > 0) ? '' : 'none'; // Visible for all existing questionnaires
    saveBtn.style.display = '';
    builtinWarn.style.display = isBuiltIn ? '' : 'none';
  }

  // Confirmation guard for built-in edits — returns true if editing can proceed
  function _confirmBuiltinEdit() {
    const q = _getCurrentQ();
    if (!q || !q.built_in) return true;
    if (_builtinEditAcknowledged) return true;
    const msg = t('questionnaire_builtin_edit_confirm') || 'This is a standard questionnaire. Your changes will be saved as a new custom copy. Continue?';
    if (!confirm(msg)) return false;
    _builtinEditAcknowledged = true;
    showNotification('info', t('questionnaire_builtin_acknowledged') || 'Editing acknowledged — changes will create a new copy');
    return true;
  }

  // Attach confirmation guard to editable fields
  function _attachBuiltinGuard() {
    nameEl.addEventListener('focus', (e) => { if (!_confirmBuiltinEdit()) { nameEl.blur(); } });
    descEl.addEventListener('focus', (e) => { if (!_confirmBuiltinEdit()) { descEl.blur(); } });
  }
  _attachBuiltinGuard();

  listEl.addEventListener('change', () => {
    if (listEl.value === '__new__') {
      loadForm(null);
    } else {
      const q = questionnaires.find(x => String(x.id) === listEl.value);
      if (q) loadForm(q);
    }
  });

  modal.querySelector('#qEditorNewBtn').addEventListener('click', () => {
    listEl.value = '__new__';
    loadForm(null);
  });

  modal.querySelector('#qEditorAddQ').addEventListener('click', () => {
    if (!_confirmBuiltinEdit()) return;
    _addPollQuestionRow(questionsEl, '', 'scale');
  });

  // Duplicate button
  duplicateBtn.addEventListener('click', async () => {
    const selectedId = listEl.value;
    if (selectedId === '__new__') return;
    if (!confirm(t('questionnaire_duplicate_confirm') || 'Duplicate this questionnaire?')) return;
    try {
      const resp = await api('POST', `/api/poll-questionnaires/${selectedId}/duplicate`);
      if (resp.ok) {
        const newQ = await resp.json();
        showNotification('success', t('questionnaire_duplicated') || 'Questionnaire duplicated');
        await loadList(newQ.id);
        const q = questionnaires.find(x => x.id === newQ.id);
        if (q) loadForm(q);
      } else {
        const err = await resp.json().catch(() => ({}));
        showError(err.error || 'Failed to duplicate');
      }
    } catch(e) { showError('Failed to duplicate: ' + (e.message||e)); }
  });

  saveBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) { showError(t('questionnaire_name')||'Name is required'); return; }
    const questions = [];
    questionsEl.querySelectorAll('.poll-q-row').forEach(row => {
      const text = row.querySelector('.poll-q-text')?.value?.trim();
      const rawType = row.querySelector('.poll-q-type')?.value || 'scale';
      const typeMap = { scale: 'scale_0_3', yes_no: 'yes_no', free_text: 'free_text' };
      if (text) questions.push({ text, type: typeMap[rawType] || rawType });
    });
    if (questions.length === 0) { showError(t('questionnaire_add_question')||'Add at least one question'); return; }
    const selectedId = listEl.value;
    const currentQ = _getCurrentQ();
    const isBuiltIn = currentQ && currentQ.built_in;
    const body = { name, description: descEl.value.trim(), questions };
    // When saving a built-in questionnaire, add acknowledge flag so backend creates a copy
    if (isBuiltIn) body.acknowledge_builtin = true;
    try {
      if (selectedId === '__new__') {
        await api('POST', '/api/poll-questionnaires', body);
        showNotification('success', `${name} created`);
      } else {
        const resp = await api('PUT', `/api/poll-questionnaires/${selectedId}`, body);
        if (isBuiltIn) {
          // Backend creates a copy — try to select the new copy
          try {
            const newQ = await resp.json();
            if (newQ && newQ.id) {
              showNotification('success', `${name} saved as a new copy`);
              await loadList(newQ.id);
              const q = questionnaires.find(x => x.id === newQ.id);
              if (q) loadForm(q);
              return;
            }
          } catch {}
        }
        showNotification('success', `${name} updated`);
      }
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to save: ' + (e.message||e)); }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(t('questionnaire_delete_confirm')||'Are you sure you want to delete this questionnaire?')) return;
    const selectedId = listEl.value;
    try {
      await api('DELETE', `/api/poll-questionnaires/${selectedId}`);
      showNotification('success', 'Questionnaire deleted');
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to delete: ' + (e.message||e)); }
  });

  await loadList();
  loadForm(null);
}

function _closeParentModal() {
  const m = event?.target?.closest('.modal-overlay');
  if (m) m.remove();
}

/** CSP-safe: select all text in the input that triggered the event */
function selectSelf(el) { if (el && el.select) el.select(); }

/** CSP-safe: copy API key to clipboard */
function copyApiKey() {
  const val = document.getElementById('apiKeyResult')?.value || '';
  navigator.clipboard.writeText(val)
    .then(() => showNotification('success', 'Copied!'))
    .catch(() => { document.getElementById('apiKeyResult')?.select(); document.execCommand('copy'); showNotification('success', 'Copied!'); });
}

// ── Meeting Config ───────────────────────────────────────────────────────────
async function saveMeetingConfig(provider) {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  let cfg;
  if (provider === 'teams') {
    cfg = { teams_enabled: true, teams_tenant_id: val('teamsTenantId'), teams_client_id: val('teamsClientId'), teams_secret: val('teamsSecret') };
  } else {
    cfg = { zoom_enabled: true, zoom_account_id: val('zoomAccountId'), zoom_client_id: val('zoomClientId'), zoom_secret: val('zoomSecret') };
  }
  const res = await apiPut('/api/meeting-config', cfg);
  if (res.ok) showNotification('success', `${provider === 'teams' ? 'Teams' : 'Zoom'} config saved`);
  else showError('Failed to save config');
}

async function setDefaultView(view) {
  state.preferences.default_view = view;
  state.range = view;
  document.getElementById('rangeSelect').value = view;
  applyPreferences();
  await savePreferences();
  renderSidebar();
  await refreshAll();
}

// ── Preference actions ─────────────────────────────────────────────────────
async function setPref(key, value) {
  state.preferences[key] = value;
  // If changing language, load the language file BEFORE applying preferences
  // and re-rendering, so translations are available when the UI is rebuilt.
  if (key === 'language' && value !== 'en' && typeof _loadLang === 'function') {
    await _loadLang(value).catch(() => {});
  }
  applyPreferences();
  await savePreferences();
  // Clear the renderedTab guard so the settings tab re-renders with updated values
  const sidebarEl = document.getElementById('sidebarContent');
  if (sidebarEl) delete sidebarEl.dataset.renderedTab;
  renderSidebar();
  renderTimeline();
  if (typeof renderListView === 'function') renderListView();
  updateUILabels();
  // Broadcast time_format / time_separator changes to detached windows
  if (key === 'time_format' || key === 'time_separator') {
    updateClock();
    if (typeof _broadcastSync === 'function') {
      _broadcastSync({ type: 'time-format', time_format: state.preferences.time_format, time_separator: state.preferences.time_separator });
    }
  }
}

async function setPrefSelect() {
  const el = event?.target;
  if (!el) return;
  const key = el.dataset.prefKey;
  if (key) state.preferences[key] = el.value;
  applyPreferences();
  await savePreferences();
  const sidebarEl = document.getElementById('sidebarContent');
  if (sidebarEl) delete sidebarEl.dataset.renderedTab;
  renderSidebar();
  renderTimeline();
}

async function setViewSpacing(value) {
  state.preferences.view_spacing = parseFloat(value) || 1;
  applyPreferences();
  await savePreferences();
  const sidebarEl = document.getElementById('sidebarContent');
  if (sidebarEl) delete sidebarEl.dataset.renderedTab;
  renderSidebar();
  renderTimeline();
}

async function setTickerCount(value) {
  state.preferences.ticker_count = parseInt(value, 10) || 10;
  applyPreferences();
  await savePreferences();
}

async function _saveQRRoles() {
  const roles = [...document.querySelectorAll('.prefQRRole:checked')].map(cb => cb.value);
  state.preferences.quick_response_roles = roles;
  await savePreferences();
  renderSidebar();
}

async function _saveQRGroups() {
  const groups = [...document.querySelectorAll('.prefQRGroup:checked')].map(cb => parseInt(cb.value, 10));
  state.preferences.quick_response_groups = groups;
  await savePreferences();
  renderSidebar();
}

async function setTooltipDelay(value) {
  state.preferences.tooltip_delay = parseInt(value, 10) || 0;
  document.documentElement.style.setProperty('--tooltip-delay', state.preferences.tooltip_delay + 'ms');
  await savePreferences();
  renderSidebar();
}

// Save welcome/help/training/demo URLs to exercise settings (global, visible to all users)
async function setExerciseURL() {
  const el = event?.target;
  if (!el) return;
  const key = el.dataset.urlKey;
  if (!key) return;
  state.exercise = state.exercise || {};
  state.exercise[key] = el.value;
  try {
    const res = await fetch('/api/exercise', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.exercise)
    });
    if (res.ok) state.exercise = await res.json();
  } catch (e) {
    // Fallback: save to user preferences
    state.preferences[key] = el.value;
    await savePreferences();
  }
}

// Set icon set (emoji or material)
async function setIconSet(_, el) {
  const iconSet = el?.dataset?.arg || 'emoji';
  state.exercise = state.exercise || {};
  state.exercise.icon_set = iconSet;
  try {
    const res = await fetch('/api/exercise', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.exercise)
    });
    if (res.ok) state.exercise = await res.json();
  } catch (e) { console.warn('setIconSet error', e); }
  applyPreferences();
  renderSidebar();
  showNotification('success', t('notif_saved'));
}

// Workspace preset actions
async function saveWorkspacePreset() {
  const name = prompt(t('preset_name') || 'Preset Name:');
  if (!name) return;
  const presets = state.preferences.workspace_presets || [];
  const preset = {
    id: presets.length ? Math.max(...presets.map(p => p.id || 0)) + 1 : 1,
    name,
    view: _listViewActive ? 'list' : 'grid',
    range: state.range,
    resolution: state.resolution,
    zoom_factor: state.zoomFactor || 1.0,
    hidden_layers: [...(state.preferences.hidden_layers || [])],
    sidebar_tab: state.sidebarTab || 'legend',
  };
  state.preferences.workspace_presets = [...presets, preset];
  await savePreferences();
  renderSidebar();
  showNotification('success', t('notif_saved'));
}

async function loadWorkspacePreset(idx) {
  const presets = state.preferences.workspace_presets || [];
  const preset = presets[parseInt(idx, 10)];
  if (!preset) return;
  if (preset.range) { state.range = preset.range; document.getElementById('rangeSelect').value = preset.range; }
  if (preset.resolution) { state.resolution = preset.resolution; document.getElementById('resolutionSelect').value = preset.resolution; }
  if (preset.zoom_factor) state.zoomFactor = preset.zoom_factor;
  if (preset.hidden_layers) state.preferences.hidden_layers = [...preset.hidden_layers];
  if (preset.sidebar_tab) state.sidebarTab = preset.sidebar_tab;
  if (preset.view === 'list' && !_listViewActive) toggleListView();
  else if (preset.view === 'grid' && _listViewActive) toggleListView();
  await savePreferences();
  renderSidebar();
  renderTimeline();
  showNotification('success', t('notif_saved'));
}

async function deleteWorkspacePreset(idx) {
  const presets = state.preferences.workspace_presets || [];
  presets.splice(parseInt(idx, 10), 1);
  state.preferences.workspace_presets = [...presets];
  await savePreferences();
  renderSidebar();
}

async function setHourPref() {
  const sh = parseInt(document.getElementById('prefStartH').value, 10);
  const eh = parseInt(document.getElementById('prefEndH').value, 10);
  if (isNaN(sh)||isNaN(eh)||sh>=eh) return;
  state.preferences.day_start_hour = sh;
  state.preferences.day_end_hour   = eh;
  await savePreferences();
  renderTimeline();
}

async function toggleType(key) {
  const ht = state.preferences.hidden_types || [];
  if (ht.includes(key)) {
    state.preferences.hidden_types = ht.filter(k => k!==key);
  } else {
    state.preferences.hidden_types = [...ht, key];
  }
  await savePreferences();
  renderSidebar();
  renderTimeline();
}

function toggleLayer(id) {
  // Exclusion model: hidden_layers lists what to hide; toggling flips visibility
  const hl = state.preferences.hidden_layers || [];
  if (hl.includes(id)) {
    state.preferences.hidden_layers = hl.filter(x => x !== id); // unhide
  } else {
    state.preferences.hidden_layers = [...hl, id]; // hide
  }
  // Immediate visual update, save in background
  renderSidebar();
  renderTimeline();
  if (typeof renderListView === 'function') renderListView();
  const pop = document.getElementById('layerPopover');
  if (pop && pop.style.display !== 'none') renderLayerPopover();
  savePreferences(); // fire-and-forget
}

function toggleAllLayers() {
  state.preferences.hidden_layers = []; // show all layers
  // Immediate visual update, save in background
  renderSidebar();
  renderTimeline();
  if (typeof renderListView === 'function') renderListView();
  const pop = document.getElementById('layerPopover');
  if (pop && pop.style.display !== 'none') renderLayerPopover();
  savePreferences(); // fire-and-forget
}

// ── Alarm sound engine (Web Audio API) ─────────────────────────────────────
function playAlarmSound(sound) {
  if (!sound || sound === 'none') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (sound === 'klaxon') {
      // Fast alternating high-low tone, 3 cycles
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now + i * 0.4);
        osc.frequency.setValueAtTime(440, now + i * 0.4 + 0.2);
        gain.gain.setValueAtTime(0.4, now + i * 0.4);
        gain.gain.setValueAtTime(0, now + i * 0.4 + 0.38);
        osc.start(now + i * 0.4);
        osc.stop(now + i * 0.4 + 0.39);
      }
    } else if (sound === 'alert') {
      // 4 short beeps
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'square';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.3, now + i * 0.25);
        gain.gain.setValueAtTime(0, now + i * 0.25 + 0.15);
        osc.start(now + i * 0.25);
        osc.stop(now + i * 0.25 + 0.16);
      }
    } else if (sound === 'siren') {
      // Rising-falling sweep
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.5);
      osc.frequency.linearRampToValueAtTime(300, now + 1.0);
      osc.frequency.linearRampToValueAtTime(1200, now + 1.5);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0, now + 1.8);
      osc.start(now);
      osc.stop(now + 1.9);
    } else if (sound === 'chime') {
      // Soft bell-like tone
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.6);
    } else if (sound === 'beep') {
      // Single beep
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.value = 750;
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.31);
    }
    // Auto-close context after sounds finish
    setTimeout(() => ctx.close(), 3000);
  } catch (e) { /* Audio not available */ }
}

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
  // Stop the repeating alarm sound — the alarm has been dismissed/acked.
  if (typeof stopRepeatingAlarm === 'function') {
    stopRepeatingAlarm('alarm-' + alarmID);
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

// ── ICS Export ─────────────────────────────────────────────────────────────
function toICSDate(d) {
  const pad = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function escICS(s) {
  return (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function exportICS() {
  const events = state.events;
  if (!events.length) { showError('No events in the current view to export.', 'Validation'); return; }
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tidslinjal//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
  for (const ev of events) {
    const evStart = new Date(ev.start_time);
    const evEnd   = ev.end_time ? new Date(ev.end_time) : new Date(evStart.getTime() + 3600000);
    ics += 'BEGIN:VEVENT\r\n';
    ics += `UID:tidslinjal-${ev.id}@tidslinjal\r\n`;
    ics += `DTSTAMP:${toICSDate(new Date(ev.created_at))}\r\n`;
    ics += `DTSTART:${toICSDate(evStart)}\r\n`;
    ics += `DTEND:${toICSDate(evEnd)}\r\n`;
    ics += `SUMMARY:${escICS(ev.title)}\r\n`;
    if (ev.description) ics += `DESCRIPTION:${escICS(ev.description)}\r\n`;
    if (ev.created_by_name) ics += `ORGANIZER;CN=${escICS(ev.created_by_name)}:MAILTO:noreply@tidslinjal\r\n`;
    ics += `CATEGORIES:${escICS(ev.event_type)}\r\n`;
    if (ev.is_recurring && ev.recurrence_pattern) {
      const rruleMap = {
        '15min':     'MINUTELY;INTERVAL=15',
        '30min':     'MINUTELY;INTERVAL=30',
        'hourly':    'HOURLY',
        '2hours':    'HOURLY;INTERVAL=2',
        '3hours':    'HOURLY;INTERVAL=3',
        '4hours':    'HOURLY;INTERVAL=4',
        'daily':     'DAILY',
        'weekly':    'WEEKLY',
        'monthly':   'MONTHLY',
        'quarterly': 'MONTHLY;INTERVAL=3',
      };
      const freq = rruleMap[ev.recurrence_pattern];
      if (freq) {
        let rr = `RRULE:FREQ=${freq}`;
        if (ev.recurrence_end) rr += `;UNTIL=${toICSDate(new Date(ev.recurrence_end))}`;
        ics += rr + '\r\n';
      }
    }
    ics += 'END:VEVENT\r\n';
  }
  ics += 'END:VCALENDAR\r\n';
  const blob = new Blob([ics], {type: 'text/calendar;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tidslinjal-${state.startDate.toISOString().slice(0,10)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── ICS drag-and-drop on the calendar view ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const tc = document.getElementById('timeline-container');
  if (!tc) return;

  // Overlay shown while dragging an ICS file over the calendar
  const overlay = document.createElement('div');
  overlay.id = 'ics-drop-overlay';
  overlay.style.cssText = [
    'position:absolute','inset:0','display:none','align-items:center',
    'justify-content:center','background:rgba(0,0,0,0.45)',
    'color:#fff','font-size:1.4rem','font-weight:600',
    'pointer-events:none','border-radius:var(--radius)',
    'z-index:900','border:3px dashed var(--accent)',
  ].join(';');
  overlay.textContent = '📅 Drop ICS file to import';
  tc.style.position = tc.style.position || 'relative';
  tc.appendChild(overlay);

  let dragDepth = 0;

  tc.addEventListener('dragenter', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth++;
    overlay.style.display = 'flex';
    e.preventDefault();
  });
  tc.addEventListener('dragleave', () => {
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; overlay.style.display = 'none'; }
  });
  tc.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  tc.addEventListener('drop', async e => {
    e.preventDefault();
    dragDepth = 0;
    overlay.style.display = 'none';
    const file = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.ics'));
    if (!file) { showError('Please drop an .ics file.', 'ICS Import'); return; }
    const fd = new FormData();
    fd.append('data', file);
    const res = await api('POST', '/api/import/ics', fd);
    if (res.ok) {
      const r = await res.json();
      showNotification('success', `ICS imported: ${r.events||0} events, ${r.skipped||0} skipped`);
      await refreshAll();
    } else {
      const err = await res.json();
      showError('ICS import failed: ' + err.error);
    }
  });
});

// ── Report format helpers ────────────────────────────────────────────────────

