/* ── Sidebar Settings (Enrollment, Webhook, Tactical Font, Freeze, Exercise, OIDC, Teams/Zoom) ── */
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

