/* ── Sidebar Settings ── */
// ── Webhook helpers, preference setters: setOOHPref, setRedLinePref, setSynthLabelPref, toggleFreeze, saveExercise, setDefaultView, setPref, setHourPref, toggleType, toggleLayer, toggleAllLayers ──

// ── Enrollment settings helpers ─────────────────────────────────────────────
let _enrollMode = 'off';

function _initEnrollmentUI() {
  if (!state.user || state.user.role !== 'admin') return;
  apiGet('/api/admin/registration').then(data => {
    if (!data) return;
    _enrollMode = data.mode || 'off';
    _applyEnrollMode(_enrollMode, data.invitation_code || '');
  }).catch(() => {});
}

function _applyEnrollMode(mode, code) {
  ['off','open','vetted','generic_invitation','personal_invitation'].forEach(v => {
    const btn = document.getElementById('enrollBtn_'+v);
    if (btn) btn.classList.toggle('active', v === mode);
  });
  const show = (id, visible) => { const el = document.getElementById(id); if (el) el.style.display = visible ? '' : 'none'; };
  show('enrollCodeGroup',   mode === 'generic_invitation');
  show('enrollVettedInfo',  mode === 'vetted');
  show('enrollPersonalInfo',mode === 'personal_invitation');
  show('enrollOpenInfo',    mode === 'open');
  show('enrollOffInfo',     mode === 'off');
  if (mode === 'generic_invitation' && code) {
    const inp = document.getElementById('enrollCodeInput');
    if (inp) inp.value = code;
  }
}

function setEnrollMode(mode) {
  _enrollMode = mode;
  const curCode = document.getElementById('enrollCodeInput')?.value || '';
  _applyEnrollMode(mode, curCode);
}

async function saveEnrollSettings() {
  const code = document.getElementById('enrollCodeInput')?.value.trim() || '';
  const payload = { mode: _enrollMode };
  if (_enrollMode === 'generic_invitation') payload.invitation_code = code;
  const res = await api('PUT', '/api/admin/registration', payload);
  if (res.ok) {
    showNotification('success', t('notif_saved')||'Saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save enrollment settings');
  }
}

// ── Mattermost DM helpers ──────────────────────────────────────────────────
async function saveMattermostDMPref() {
  const url = (document.getElementById('prefMattermostDMURL') || {}).value || '';
  const trimmed = url.trim().replace(/\/+$/, ''); // strip trailing slash
  try {
    const ex = state.exercise || {};
    ex.mattermost_dm_url = trimmed;
    const res = await api('PUT', '/api/exercise', ex);
    if (res.ok) {
      state.exercise = ex;
      showNotification('success', t('notif_saved') || 'Saved');
    } else { showError('Failed to save'); }
  } catch (e) { showError('Failed to save: ' + e.message); }
}

// ── Webhook helpers ────────────────────────────────────────────────────────
async function saveWebhookPref() {
  state.preferences.webhook_url  = document.getElementById('prefWebhookURL').value.trim();
  state.preferences.webhook_type = document.getElementById('prefWebhookType').value;
  await savePreferences();
  showNotification('success', t('notif_saved'));
}

async function testWebhook() {
  const url  = document.getElementById('prefWebhookURL').value.trim();
  const type = document.getElementById('prefWebhookType').value;
  if (!url) { showError(t('settings_webhook_url_required'), 'Validation'); return; }
  const msg  = 'Tidslinjal webhook test';
  let payload;
  if (type === 'mattermost' || type === 'slack') {
    payload = JSON.stringify({text: msg});
  } else {
    payload = JSON.stringify({message: msg});
  }
  try {
    const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: payload});
    showNotification('success', `Webhook: ${res.status}`);
  } catch(e) {
    showError('Webhook test failed: ' + e.message);
  }
}

async function setOOHPref(val) {
  state.preferences.show_out_of_hours = val;
  applyPreferences();
  await savePreferences();
  renderTimeline();
}

async function setRedLinePref() {
  state.preferences.red_line_enabled = document.getElementById('prefRedLine')?.checked ?? true;
  state.preferences.red_line_color   = document.getElementById('prefLineColor')?.value || '#E74C3C';
  state.preferences.red_line_width   = parseInt(document.getElementById('prefLineWidth')?.value || '5', 10);
  state.preferences.red_line_style   = document.getElementById('prefLineStyle')?.value || 'dashed';
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}

async function setSynthLabelPref(val) {
  state.preferences.synth_label = val;
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}

async function setTacticalFontPref(val) {
  state.preferences.tactical_font_enabled = val;
  await savePreferences();
  _applyTacticalFont();
}

async function setTacticalFontFamily(val) {
  state.preferences.tactical_font_family = val;
  await savePreferences();
  _applyTacticalFont();
}

function _applyTacticalFont() {
  const p = state.preferences;
  if (p.tactical_font_enabled && p.tactical_font_family) {
    document.documentElement.style.setProperty('--tactical-font', p.tactical_font_family);
    document.body.classList.add('tactical-font-enabled');
  } else {
    document.body.classList.remove('tactical-font-enabled');
  }
}

function toggleFreeze() {
  if (state.timelinePaused) {
    state.timelinePaused = false;
    state.pausedAt = null;
  } else {
    state.timelinePaused = true;
    state.pausedAt = new Date();
  }
  renderSidebar();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}

// ── Exercise settings ──────────────────────────────────────────────────────
async function saveExercise() {
  const epoch       = document.getElementById('exEpoch')?.value;
  const endex       = document.getElementById('exEndex')?.value;
  const label       = document.getElementById('exLabel')?.value?.trim() || '';
  const enabled          = document.getElementById('exEnabled')?.checked || false;
  const dayHrsOnly       = document.getElementById('exDayHoursOnly')?.checked || false;
  const includeWeekends  = document.getElementById('exIncludeWeekends')?.checked !== false;
  const exIndex          = parseInt(document.getElementById('exIndex')?.value || '0', 10);
  const artTimeEnabled   = document.getElementById('exArtificialTimeEnabled')?.checked || false;
  const artTimeVal       = document.getElementById('exArtificialTime')?.value;
  const ex = state.exercise || {};
  const payload = {
    enabled,
    epoch: epoch ? new Date(epoch).toISOString() : '',
    endex: endex ? new Date(endex).toISOString() : '',
    label,
    day_hours_only: dayHrsOnly,
    include_weekends: includeWeekends,
    group_label: ex.group_label || 'group',
    ex_index: exIndex,
    artificial_time_enabled: artTimeEnabled,
    artificial_time: artTimeVal ? new Date(artTimeVal).toISOString() : '',
    // Preserve ready check settings
    ready_check_enabled: ex.ready_check_enabled || false,
    ready_check_time: ex.ready_check_time || '',
    ready_check_offset_mins: ex.ready_check_offset_mins || 0,
    ready_check_use_offset: ex.ready_check_use_offset || false,
    // Preserve icon set
    icon_set: ex.icon_set || 'emoji',
  };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    updateSyntheticUI();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

// ── Ready Check settings ───────────────────────────────────────────────────

async function saveReadyCheckSettings() {
  const ex = state.exercise || {};
  const rcEnabled = document.getElementById('rcEnabled')?.checked || false;
  const rcUseOffset = document.getElementById('rcModeOffset')?.checked || false;
  const rcTimeVal = document.getElementById('rcAbsoluteTime')?.value;
  const rcOffsetMins = parseInt(document.getElementById('rcOffsetMins')?.value || '60', 10);
  const payload = {
    ...ex,
    ready_check_enabled: rcEnabled,
    ready_check_use_offset: rcUseOffset,
    ready_check_time: rcTimeVal ? new Date(rcTimeVal).toISOString() : '',
    ready_check_offset_mins: rcOffsetMins,
  };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    showNotification('success', t('notif_saved')||'Saved');
    renderSidebar();
  } else {
    const err = await res.json().catch(()=>({}));
    showError(err.error || 'Failed to save');
  }
}

// ── Terminology & mode settings (global, saved to exercise config) ─────────

async function _saveExerciseField(fields) {
  const ex = state.exercise || {};
  const payload = { ...ex, ...fields };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    // Clear settings tab cache so it re-renders with updated values
    const sidebarEl = document.getElementById('sidebarContent');
    if (sidebarEl) delete sidebarEl.dataset.renderedTab;
    renderSidebar();
    renderTimeline();
    if (typeof updateUILabels === 'function') updateUILabels();
    showNotification('success', t('notif_saved') || 'Saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save');
  }
}

async function setGroupLabel(value) {
  await _saveExerciseField({ group_label: value });
}

async function setUserLabel(value) {
  await _saveExerciseField({ user_label: value });
}

async function setOperationMode(value) {
  await _saveExerciseField({ operation_mode: value });
}

// ── Artificial time settings (from the Settings tab) ──────────────────────

async function toggleArtificialTimeSetting() {
  const cb = document.getElementById('settingsArtTimeEnabled');
  if (!cb) return;
  const ex = state.exercise || {};
  await _saveExerciseField({
    artificial_time_enabled: cb.checked,
    artificial_time: ex.artificial_time || '',
  });
}

async function saveArtificialTimeSetting() {
  const enabled = document.getElementById('settingsArtTimeEnabled')?.checked || false;
  const timeVal = document.getElementById('settingsArtTime')?.value;
  await _saveExerciseField({
    artificial_time_enabled: enabled,
    artificial_time: timeVal ? new Date(timeVal).toISOString() : '',
  });
}

// ── Artificial time toggle (from the exercise setup section) ──────────────

async function setArtificialTime() {
  // Called when the checkbox in the exercise setup section changes
  const cb = document.getElementById('exArtificialTimeEnabled');
  if (!cb) return;
  const timeVal = document.getElementById('exArtificialTime')?.value;
  const ex = state.exercise || {};
  await _saveExerciseField({
    artificial_time_enabled: cb.checked,
    artificial_time: timeVal ? new Date(timeVal).toISOString() : (ex.artificial_time || ''),
  });
}

// ── Timezone preference ───────────────────────────────────────────────────

function setTimezonePref(value) {
  state.timezone = value || '';
  // Store in localStorage so it persists across sessions
  if (value) {
    localStorage.setItem('tidslinjal_timezone', value);
  } else {
    localStorage.removeItem('tidslinjal_timezone');
  }
  // Update clock display
  if (typeof updateClock === 'function') updateClock();
  renderTimeline();
}

// ── Exercise index info tooltip ───────────────────────────────────────────

function showExIndexInfo() {
  alert(
    (t('exercise_index_info') || 'The exercise index is a sequential number used to identify this exercise.\n\nIt is displayed in headers and reports to distinguish between multiple exercises.\n\nSet to 0 to hide.')
  );
}

// ── Detached checklists window ────────────────────────────────────────────

let _checklistsPopout = null;

function openDetachedChecklists() {
  if (_checklistsPopout && !_checklistsPopout.closed) {
    _checklistsPopout.focus();
    return;
  }
  // Build checklist content from the sidebar and open in new window
  const w = Math.min(window.screen.availWidth, 700);
  const h = Math.min(window.screen.availHeight - 100, 800);
  _checklistsPopout = window.open('', 'tidslinjal-checklists',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_checklistsPopout) {
    alert(t('dialog_popup_blocked') || 'Popup blocked. Please allow popups for this site.');
    return;
  }
  const theme = document.body.className || '';
  _checklistsPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Checklists</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>body{margin:0;padding:12px;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    'h3{margin:0 0 12px;font-size:16px;color:var(--accent)}</style>' +
    '</head><body class="' + escHtml(theme) + '">' +
    '<h3>\uD83D\uDCCB ' + escHtml(t('checklists') || 'Checklists') + '</h3>' +
    '<div id="clWrap"></div></body></html>');
  _checklistsPopout.document.close();

  // Copy checklist content from sidebar
  const src = document.getElementById('sidebarContent');
  if (src) {
    const wrap = _checklistsPopout.document.getElementById('clWrap');
    if (wrap) {
      wrap.innerHTML = src.innerHTML;
      // Re-bind action buttons to opener window functions
      wrap.querySelectorAll('[data-action]').forEach(function(el) {
        el.onclick = function() {
          try {
            window.focus();
            var fn = el.dataset.action;
            if (typeof window[fn] === 'function') window[fn]();
          } catch(e) {}
        };
      });
    }
  }

  // Monitor window closure
  var monitor = setInterval(function() {
    if (!_checklistsPopout || _checklistsPopout.closed) {
      clearInterval(monitor);
      _checklistsPopout = null;
    }
  }, 1000);
}

// ── Planned vs Actual (PVA) Modal ─────────────────────────────────────────

function openPVAModal() {
  const el = document.getElementById('pvaContent');
  if (!el) return;

  const events = state.events || [];
  const withPlanned = events.filter(e => e.planned_start);
  if (withPlanned.length === 0) {
    el.innerHTML = `<p style="color:var(--text-dim);padding:16px">${t('pva_no_data')||'No events have planned times set. Edit an event and set a "Planned start" to see comparisons here.'}</p>`;
    openModal('pvaModal');
    return;
  }

  let html = '<table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">';
  html += '<thead><tr style="background:var(--bg3);border-bottom:2px solid var(--border)">';
  html += `<th style="padding:8px;text-align:left">${t('lv_title')||'Title'}</th>`;
  html += `<th style="padding:8px">${t('pva_planned_start')||'Planned Start'}</th>`;
  html += `<th style="padding:8px">${t('pva_actual_start')||'Actual Start'}</th>`;
  html += `<th style="padding:8px">${t('pva_diff')||'Difference'}</th>`;
  html += `<th style="padding:8px">${t('lv_status')||'Status'}</th>`;
  html += '</tr></thead><tbody>';

  const fmtDT = (d) => d ? new Date(d).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

  withPlanned.forEach(ev => {
    const ps = new Date(ev.planned_start);
    const as_ = new Date(ev.start_time);
    const diffMs = as_ - ps;
    const diffMin = Math.round(diffMs / 60000);
    let diffLabel = '';
    let diffColor = 'var(--text-dim)';
    if (Math.abs(diffMin) < 5) {
      diffLabel = t('pva_on_time')||'On time';
      diffColor = 'var(--green)';
    } else if (diffMin > 0) {
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      diffLabel = '+' + (h > 0 ? h + 'h ' : '') + m + 'm ' + (t('pva_late')||'late');
      diffColor = 'var(--red)';
    } else {
      const absMin = Math.abs(diffMin);
      const h = Math.floor(absMin / 60);
      const m = absMin % 60;
      diffLabel = '-' + (h > 0 ? h + 'h ' : '') + m + 'm ' + (t('pva_early')||'early');
      diffColor = 'var(--accent)';
    }
    html += `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:600">${escHtml(ev.title)}</td>
      <td style="padding:6px 8px;text-align:center">${fmtDT(ev.planned_start)}</td>
      <td style="padding:6px 8px;text-align:center">${fmtDT(ev.start_time)}</td>
      <td style="padding:6px 8px;text-align:center;color:${diffColor};font-weight:600">${diffLabel}</td>
      <td style="padding:6px 8px;text-align:center"><span class="status-badge status-${ev.status||'planned'}">${t('status_'+(ev.status||'planned'))||ev.status||'planned'}</span></td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
  openModal('pvaModal');
}

function exportPVAReport() {
  const el = document.getElementById('pvaContent');
  if (!el) return;
  // Open a print window with the PVA content
  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) return;
  const theme = state.preferences?.theme === 'light' ? 'light-mode' : '';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Planned vs. Actual Report</title>
    <link rel="stylesheet" href="/static/style.css">
    <style>body{padding:20px;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}
    h1{font-size:18px;margin-bottom:16px;color:var(--accent)}
    @media print{body{background:#fff;color:#000}}</style>
    </head><body class="${theme}">
    <h1>📊 Planned vs. Actual Comparison</h1>
    ${el.innerHTML}
    </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ── OIDC settings helpers ──────────────────────────────────────────────────

function _setOIDCStatusBar(enabled, issuer, active) {
  const dot   = document.getElementById('oidcStatusDot');
  const label = document.getElementById('oidcStatusLabel');
  const detail = document.getElementById('oidcStatusDetail');
  if (!dot || !label) return;
  if (active) {
    dot.style.background = '#2ECC71';
    label.textContent = 'SSO Active';
    try {
      detail.textContent = 'Provider: ' + new URL(issuer).hostname;
    } catch { detail.textContent = 'Provider: ' + (issuer || ''); }
  } else if (enabled && issuer) {
    dot.style.background = '#E67E22';
    label.textContent = 'Configured but not yet active';
    detail.textContent = issuer;
  } else {
    dot.style.background = '#888';
    label.textContent = 'Not configured';
    detail.textContent = 'Fill in Issuer URL, Client ID, and Client Secret, then save.';
  }
}

async function _initOIDCSettingsUI() {
  const data = await apiGet('/api/admin/oidc');
  if (!data) return;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  setVal('oidcIssuer', data.issuer);
  setVal('oidcClientID', data.client_id);
  setVal('oidcRedirectURL', data.redirect_url);
  setVal('oidcDefaultRole', data.default_role || 'teammember');
  setChk('oidcExclusive', data.exclusive);
  setChk('oidcEnabled', data.enabled);

  // Clear password field; show hint if secret exists
  const secretEl  = document.getElementById('oidcClientSecret');
  const secretHint = document.getElementById('oidcSecretHint');
  if (secretEl) {
    secretEl.value = '';
    secretEl.placeholder = data.has_secret ? '(secret saved — leave blank to keep)' : '••••••••';
  }
  if (secretHint) {
    secretHint.textContent = data.has_secret
      ? '✓ A client secret is currently saved.'
      : 'No client secret saved yet.';
    secretHint.style.color = data.has_secret ? 'var(--success, #2ecc71)' : 'var(--text-dim)';
  }

  // Determine if OIDC is currently active in-memory (check public config endpoint)
  let active = false;
  try {
    const r = await fetch('/api/auth/oidc-config');
    active = r.ok;
  } catch { /* ok */ }

  _setOIDCStatusBar(data.enabled, data.issuer, active);
}

async function saveOIDCSettings() {
  const getVal = id => document.getElementById(id)?.value?.trim() || '';
  const getChk = id => document.getElementById(id)?.checked || false;
  const payload = {
    enabled:       getChk('oidcEnabled'),
    issuer:        getVal('oidcIssuer'),
    client_id:     getVal('oidcClientID'),
    client_secret: getVal('oidcClientSecret'),
    redirect_url:  getVal('oidcRedirectURL'),
    exclusive:     getChk('oidcExclusive'),
    default_role:  getVal('oidcDefaultRole'),
  };
  const res = await api('PUT', '/api/admin/oidc', payload);
  if (res.ok) {
    showNotification('success', t('notif_saved') || 'Saved');
    setTimeout(_initOIDCSettingsUI, 0);
    // After save, auto-run test so admin sees immediate feedback
    setTimeout(runOIDCTest, 300);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save OIDC settings');
  }
}

// runOIDCTest — calls the backend diagnostic endpoint and renders step-by-step results
async function runOIDCTest() {
  const panel  = document.getElementById('oidcTestResult');
  const steps  = document.getElementById('oidcTestSteps');
  const summary = document.getElementById('oidcTestSummary');
  if (!panel) return;

  panel.style.display = '';
  steps.innerHTML = '<em style="color:var(--text-dim)">Running diagnostics…</em>';
  summary.textContent = '';

  try {
    const res  = await api('POST', '/api/admin/oidc/test', {});
    const data = await res.json().catch(() => ({}));

    if (!data.steps || !Array.isArray(data.steps)) {
      steps.innerHTML = '<span style="color:#E74C3C">Unexpected response from server.</span>';
      return;
    }

    steps.innerHTML = data.steps.map(s => {
      const icon   = s.ok ? '✅' : '❌';
      const color  = s.ok ? '#2ECC71' : '#E74C3C';
      const detail = s.detail ? `<div style="color:var(--text-dim);margin-left:20px;word-break:break-all">${escHtml(s.detail)}</div>` : '';
      return `<div style="margin-bottom:4px">
        ${icon} <span style="color:${color};font-weight:600">${escHtml(s.step)}</span>
        — <span>${escHtml(s.message)}</span>
        ${detail}
      </div>`;
    }).join('');

    const ok = data.overall;
    summary.style.background = ok ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)';
    summary.style.color       = ok ? '#2ECC71' : '#E74C3C';
    summary.textContent       = (ok ? '✅ ' : '❌ ') + (data.summary || (ok ? 'All checks passed.' : 'Some checks failed.'));

    // Update the status bar to reflect test results
    const issuerEl = document.getElementById('oidcIssuer');
    _setOIDCStatusBar(true, issuerEl?.value || '', ok);
  } catch (err) {
    steps.innerHTML = `<span style="color:#E74C3C">Test failed: ${escHtml(String(err))}</span>`;
  }
}

// ── Teams / Zoom Integration ───────────────────────────────────────────────
function _getTeamsConfig() {
  try { return JSON.parse(localStorage.getItem('teamsConfig') || '{}'); } catch { return {}; }
}

function saveTeamsConfig() {
  const cfg = {
    webhook:     document.getElementById('teamsWebhookURL')?.value?.trim()      || '',
    teamsBase:   document.getElementById('teamsMeetingTemplate')?.value?.trim() || '',
    zoomBase:    document.getElementById('zoomMeetingBase')?.value?.trim()      || '',
  };
  localStorage.setItem('teamsConfig', JSON.stringify(cfg));
  showNotification('success', 'Teams/Zoom config saved');
}

function _loadTeamsConfigUI() {
  const cfg = _getTeamsConfig();
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('teamsWebhookURL',       cfg.webhook);
  setVal('teamsMeetingTemplate',  cfg.teamsBase);
  setVal('zoomMeetingBase',       cfg.zoomBase);
}

// Called from event modal when virtual meeting type changes
function onVirtualMeetingTypeChange() {
  const vmType = document.getElementById('eventVirtualMeetingType')?.value;
  const btn    = document.getElementById('btnGenerateMeetingLink');
  if (btn) btn.style.display = (vmType === 'teams' || vmType === 'zoom') ? '' : 'none';
}

function generateMeetingLink() {
  const vmType  = document.getElementById('eventVirtualMeetingType')?.value;
  const cfg     = _getTeamsConfig();
  const title   = document.getElementById('eventTitle')?.value || 'Meeting';
  const start   = document.getElementById('eventStart')?.value || new Date().toISOString();
  let url = '';

  if (vmType === 'teams') {
    const base = cfg.teamsBase;
    if (base) {
      url = base + (base.includes('?') ? '&' : '?') +
        'subject=' + encodeURIComponent(title) +
        '&startTime=' + encodeURIComponent(start);
    } else {
      // Generate a "new meeting" deep link
      url = 'https://teams.microsoft.com/l/meeting/new?subject=' +
        encodeURIComponent(title) + '&startTime=' + encodeURIComponent(start);
    }
  } else if (vmType === 'zoom') {
    const base = cfg.zoomBase;
    if (base) {
      url = base;
    } else {
      url = 'https://zoom.us/start/videomeeting';
    }
  }

  if (url) {
    const urlEl = document.getElementById('eventContactURL');
    if (urlEl) urlEl.value = url;
    showNotification('success', `${vmType === 'teams' ? 'Teams' : 'Zoom'} link generated`);
  } else {
    showError(`Configure ${vmType} URL in Integrations first`);
  }
}

