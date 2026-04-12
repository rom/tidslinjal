/* ============================================================
   Tidslinjal v3.6.0 — Collaborative Operational Timeline
   Main entry point: initialisation and top-level wiring.

   Module load order (all plain <script> tags):
     i18n.js → utils.js → state.js → api.js
     → timeline.js → modals.js → app.js
   ============================================================ */
'use strict';

// ── Password visibility toggle ──────────────────────────────────────────────
function togglePwdVisibility(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (btn) btn.textContent = show ? '🙈' : '👁';
}

// ── Additional DOMContentLoaded wiring ─────────────────────────────────────
// (password change, admin data-export)
document.addEventListener('DOMContentLoaded', () => {
  const btnSavePw = document.getElementById('btnSavePassword');
  if (btnSavePw) {
    btnSavePw.addEventListener('click', async () => {
      const curPw = document.getElementById('pwdCurrent')?.value || '';
      const newPw = document.getElementById('pwdNew')?.value?.trim()    || '';
      const conPw = document.getElementById('pwdConfirm')?.value?.trim() || '';
      if (!curPw) {
        showError(t('current_password_required') || 'Current password is required', 'Validation'); return;
      }
      if (!newPw || newPw !== conPw) {
        showError(t('password_mismatch') || 'Passwords do not match', 'Validation'); return;
      }
      const res = await apiPost('/api/auth/change-password', {current_password: curPw, new_password: newPw});
      if (res.ok) {
        closeModal('passwordModal');
        showNotification('success', t('password_saved')||'Password changed');
      } else {
        const err = await res.json().catch(() => ({}));
        // Friendly display for policy / SSO errors (server prefixes with "password_quality:" or "oidc_account:")
        const msg = (err.error || 'Failed to change password').replace(/^password_quality:\s*/,'').replace(/^oidc_account:\s*/,'');
        showError(msg);
      }
    });
  }

  const btnExportData = document.getElementById('btnExportData');
  if (btnExportData) {
    btnExportData.addEventListener('click', async () => {
      const res = await api('GET', '/api/export');
      if (!res.ok) { showError('Export failed'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `tidslinjal-export-${new Date().toISOString().slice(0,19).replace(/:/g,'')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

});

// ── Role-gated UI ────────────────────────────────────────────────────────────
function applyRoleGatedUI() {
  if (!state.user) return;
  document.getElementById('userDisplayName').textContent = state.user.display_name || state.user.username;
  const roleEl = document.getElementById('userRoleBadge');
  roleEl.textContent = t('role_'+state.user.role) || state.user.role;
  roleEl.className   = `role-badge role-${state.user.role}`;

  const canWrite = hasRole2(state.user.role, 'readwrite') || userHasCapability('create_events') || userHasCapability('edit_own');
  document.getElementById('btnAddEvent').style.display = canWrite ? '' : 'none';
  document.getElementById('btnAddLock').style.display = (hasRole2(state.user.role, 'admin') || state.user.can_lock || userHasCapability('lock_slots')) ? '' : 'none';
  // .admin-only elements: hidden unless user is admin/developer OR has manage_users/manage_integrations capability
  const isAdminLike = hasRole2(state.user.role, 'admin') || userHasCapability('manage_users') || userHasCapability('manage_integrations');
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdminLike ? '' : 'none');
  document.querySelectorAll('.teamlead-only').forEach(el => el.style.display = (hasRole2(state.user.role, 'teamlead') || userHasCapability('view_audit') || userHasCapability('manage_layers') || userHasCapability('manage_groups')) ? '' : 'none');
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Check if server was started with --debug flag
  try {
    const ver = await apiGet('/api/version');
    if (ver && ver.debug) {
      window.TIDSLINJAL_DEBUG = true;
      console.info('[TL] Debug mode enabled (server started with --debug)');
    }
  } catch { /* ignore */ }

  try {
    state.user = await apiGet('/api/auth/me');
  } catch {
    window.location.href = '/login';
    return;
  }

  // Load initial data in parallel
  const [prefs, eventTypes, layers, groups, users, roles] = await Promise.all([
    apiGet('/api/preferences'),
    apiGet('/api/event-types'),
    apiGet('/api/layers'),
    apiGet('/api/groups'),
    apiGet('/api/users').catch(() => []),
    apiGet('/api/roles').catch(() => []),
  ]);

  state.preferences = prefs || state.preferences;
  // Migrate legacy active_layers to hidden_layers (invert old whitelist)
  if (!state.preferences.hidden_layers && state.preferences.active_layers && state.preferences.active_layers.length > 0) {
    const all = layers || [];
    state.preferences.hidden_layers = all.map(l => l.id).filter(id => !state.preferences.active_layers.includes(id));
  }
  state.eventTypes  = eventTypes || [];
  state.layers      = layers  || [];
  state.groups      = groups  || [];
  state.users       = users   || [];
  // Merge saved role configs with built-in defaults so capabilities
  // work even when the admin has never opened the Role Editor.
  state.roleConfigs = mergeRoleConfigs(roles || []);

  applyPreferences();

  state.resolution = state.preferences.default_resolution || 'hour';
  state.range      = state.preferences.default_range || state.preferences.default_view || 'week';
  document.getElementById('rangeSelect').value      = state.range;
  document.getElementById('resolutionSelect').value = state.resolution;

  updateUILabels();

  // User info in header + role-gated controls
  applyRoleGatedUI();

  // Load non-critical data in background (don't block initial render)
  (async () => {
    // Load version + GitHub link
    try {
      const vInfo = await apiGet('/api/version');
      const vLink = document.getElementById('appVersionLink');
      if (vLink && vInfo) {
        vLink.textContent = 'v' + (vInfo.version || '?');
        if (vInfo.github) {
          vLink.href = vInfo.github;
          vLink.title = t('github_link') || 'GitHub Repository';
        }
      }
      const helpVer = document.getElementById('helpVersionLine');
      if (helpVer && vInfo) {
        helpVer.textContent = `Tidslinjal v${vInfo.version || '?'} — ${vInfo.github || ''}`;
      }
      state._versionInfo = vInfo;
    } catch { /* ignore */ }

    // Load integration status for admin legend panel
    if (state.user && state.user.role === 'admin') {
      try {
        const [statusData, gbData, testStats] = await Promise.all([
          apiGet('/api/status').catch(() => null),
          apiGet('/api/admin/gradual-backup').catch(() => null),
          apiGet('/api/admin/test-stats').catch(() => null),
        ]);
        state._integrationStatus = statusData;
        if (gbData && gbData.settings) {
          state._gradualBackupStatus = {
            enabled: gbData.settings.enabled !== false,
            interval_minutes: gbData.settings.interval_minutes || 15,
            snapshot_count: (gbData.snapshots || []).length,
          };
        } else { state._gradualBackupStatus = null; }
        state._testStats = testStats;
      } catch { /* ignore */ }
    }

    // Load database stats for legend panel
    try {
      state._dbStats = await apiGet('/api/db-stats');
    } catch { state._dbStats = null; }
  })();

  // Control events
  document.getElementById('rangeSelect').addEventListener('change', e => {
    state.range = e.target.value; refreshAll();
  });
  document.getElementById('resolutionSelect').addEventListener('change', e => {
    state.resolution = e.target.value; refreshAll();
  });
  setupNavLongPress(document.getElementById('btnPrev'), -1);
  setupNavLongPress(document.getElementById('btnNext'),  1);
  // Calendar navigation arrows on timeline edges
  const calNavPrev = document.getElementById('calNavPrev');
  const calNavNext = document.getElementById('calNavNext');
  if (calNavPrev) calNavPrev.addEventListener('click', () => navigate(-1));
  if (calNavNext) calNavNext.addEventListener('click', () => navigate(1));
  document.getElementById('btnToday').addEventListener('click', goToday);
  document.getElementById('btnDatePicker').addEventListener('click', e => {
    const inp = document.getElementById('datePickerInput');
    const btn = e.currentTarget;
    const r   = btn.getBoundingClientRect();
    inp.style.left = r.left + 'px';
    inp.style.top  = (r.bottom + 2) + 'px';
    inp.style.position = 'fixed';
    inp.showPicker ? inp.showPicker() : inp.click();
  });
  document.getElementById('btnAddEvent').addEventListener('click', () => openEventModal(null));
  document.getElementById('btnLayerToggle').addEventListener('click', e => openLayerPopover(e.currentTarget));
  document.getElementById('btnFilter')?.addEventListener('click', e => openFilterPopover(e.currentTarget));
  document.getElementById('btnViewToggle')?.addEventListener('click', toggleListView);
  document.getElementById('btnUndo')?.addEventListener('click', performUndo);
  let _searchDebounce = null;
  document.getElementById('searchInput').addEventListener('input', e => {
    state.search = e.target.value;
    if (_searchDebounce) clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => {
      if (_listViewActive) renderListView(); else renderTimeline();
    }, 300);
  });

  // Close layer popover, filter popover, and nav jump menu when clicking outside
  document.addEventListener('click', e => {
    const pop = document.getElementById('layerPopover');
    if (pop && pop.style.display !== 'none' &&
        !pop.contains(e.target) && e.target.id !== 'btnLayerToggle') {
      pop.style.display = 'none';
    }
    const fpop = document.getElementById('filterPopover');
    if (fpop && fpop.style.display !== 'none' &&
        !fpop.contains(e.target) && e.target.id !== 'btnFilter') {
      fpop.style.display = 'none';
    }
    const njm = document.getElementById('navJumpMenu');
    if (njm && njm.style.display !== 'none' &&
        !njm.contains(e.target) && e.target.id !== 'btnPrev' && e.target.id !== 'btnNext') {
      njm.style.display = 'none';
    }
  });

  document.getElementById('btnSidebar').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 1024) {
      sidebar.classList.toggle('visible');
      document.getElementById('sidebarBackdrop').classList.toggle('visible', sidebar.classList.contains('visible'));
    } else {
      sidebar.classList.toggle('hidden');
      renderEventBlocks(getDays(), getSlotHeight());
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await apiPost('/api/auth/logout', {});
    window.location.href = '/login';
  });

  // Sidebar tabs
  document.querySelectorAll('.sidebar-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t2 => t2.classList.remove('active'));
      tab.classList.add('active');
      state.sidebarTab = tab.dataset.tab;
      renderSidebar();
    });
  });
  // Sidebar detach button
  const btnDetach = document.getElementById('btnDetachSidebar');
  if (btnDetach) btnDetach.addEventListener('click', () => detachSidebar());

  // Load filter presets
  _loadFilterPresets();

  // Clock
  updateClock();
  state._clockInterval = setInterval(updateClock, 1000);

  // Auto-refresh
  state._refreshInterval = setInterval(refreshAll, 60000);
  state._timeLineInterval = setInterval(() => updateCurrentTimeLine(getDays(), getSlotHeight()), 30000);

  // Auto-report checker (every 5 minutes)
  checkAutoReports();
  setInterval(checkAutoReports, 300000);

  // SSE
  connectSSE();

  // Browser notifications — permission requested via Settings panel
  // Auto-request on first visit if not yet decided
  if (Notification.permission === 'default') {
    setTimeout(() => { if (Notification.permission === 'default') Notification.requestPermission(); }, 3000);
  }

  // Initial data load
  await refreshAll();

  // Auto-enable synthetic time if exercise name is set
  if (state.exercise && state.exercise.enabled && state.exercise.label && !state.syntheticOn) {
    state.syntheticOn = true;
    updateSyntheticUI();
  }

  // Set up interactions
  setupZoomDrag();
  setupDragToReschedule();
  setupEventResize();
  setupKeyboardShortcuts();
  setupHorizontalDrag();
  setupSidebarResize();
  setupContextMenus();

  // Handle tab focus/blur — restart timers that browsers throttle in background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Release any pointer/mouse-button-held state by dispatching synthetic events
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      // Clear intervals to save resources while hidden
      if (state._clockInterval)    { clearInterval(state._clockInterval);    state._clockInterval = null; }
      if (state._timeLineInterval) { clearInterval(state._timeLineInterval); state._timeLineInterval = null; }
      if (state._refreshInterval)  { clearInterval(state._refreshInterval);  state._refreshInterval = null; }
    } else {
      // Tab became visible again — restart timers safely
      if (state._clockInterval) clearInterval(state._clockInterval);
      updateClock();
      state._clockInterval = setInterval(updateClock, 1000);

      if (state._timeLineInterval) clearInterval(state._timeLineInterval);
      updateCurrentTimeLine(getDays(), getSlotHeight());
      state._timeLineInterval = setInterval(() => updateCurrentTimeLine(getDays(), getSlotHeight()), 30000);

      if (state._refreshInterval) clearInterval(state._refreshInterval);
      state._refreshInterval = setInterval(refreshAll, 60000);

      // Refresh data since we may have missed SSE events while backgrounded
      refreshAll();
    }
  });

  // Change password button
  const btnChgPw = document.getElementById('btnChangePassword');
  if (btnChgPw) {
    btnChgPw.addEventListener('click', () => {
      ['pwdCurrent','pwdNew','pwdConfirm'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      // Reset strength indicator
      const bar = document.getElementById('pwdStrengthBar');
      const lbl = document.getElementById('pwdStrengthLabel');
      if (bar) { bar.style.width = '0%'; bar.style.background = '#ccc'; }
      if (lbl) lbl.textContent = '';
      // Show SSO banner for OIDC accounts; hide form
      const isSSO = state.user && state.user.is_oidc;
      const banner = document.getElementById('pwdSSOBanner');
      const form   = document.getElementById('pwdLocalForm');
      const saveBtn = document.getElementById('btnSavePassword');
      if (banner) banner.style.display = isSSO ? '' : 'none';
      if (form)   form.style.display   = isSSO ? 'none' : '';
      if (saveBtn) saveBtn.style.display = isSSO ? 'none' : '';
      openModal('passwordModal');
      setTimeout(_loadStandalonePwdPolicy, 0);
    });
  }

  // Pre-fill report date range
  const reportFrom = document.getElementById('reportFrom');
  const reportTo   = document.getElementById('reportTo');
  if (reportFrom) reportFrom.value = fmtDateInput(state.startDate);
  if (reportTo)   reportTo.value   = fmtDateInput(getViewEnd());

  // Show undo button if user has write access
  if (hasRole2(state.user.role, 'readwrite')) {
    document.getElementById('btnUndo').style.display = '';
  }

  // Synthetic time toggle
  document.getElementById('btnSyntheticTime').addEventListener('click', () => {
    state.syntheticOn = !state.syntheticOn;
    updateSyntheticUI();
    renderTimeline();
  });

  // Apply default landing view
  const landingView = state.preferences.default_landing_view || 'grid';
  if (landingView === 'list' && !_listViewActive) {
    setTimeout(() => toggleListView(), 50);
  } else if (landingView === 'log_book') {
    // Log book is a sub-tab of the "logs" sidebar tab
    state.sidebarTab = 'logs';
    document.querySelectorAll('.sidebar-tab').forEach(t2 => t2.classList.remove('active'));
    const logsTab = document.querySelector('.sidebar-tab[data-tab="logs"]');
    if (logsTab) logsTab.classList.add('active');
    const el = document.getElementById('sidebarContent');
    if (el) el.dataset.logSubTab = 'logbook';
    renderSidebar();
    // Ensure sidebar is visible on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 1024) sidebar.classList.add('visible');
  } else if (landingView === 'decisions') {
    // Decision log is a sub-tab of the "logs" sidebar tab
    state.sidebarTab = 'logs';
    document.querySelectorAll('.sidebar-tab').forEach(t2 => t2.classList.remove('active'));
    const logsTab = document.querySelector('.sidebar-tab[data-tab="logs"]');
    if (logsTab) logsTab.classList.add('active');
    const el = document.getElementById('sidebarContent');
    if (el) el.dataset.logSubTab = 'decision';
    renderSidebar();
    // Ensure sidebar is visible on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 1024) sidebar.classList.add('visible');
  } else if (landingView === 'reports') {
    setTimeout(() => { if (typeof openReportModal === 'function') openReportModal(); }, 200);
  } else if (landingView === 'map') {
    setTimeout(() => { window.open('/map', 'tidslinjal-map', 'width=1200,height=800,resizable=yes'); }, 200);
  }

  // Welcome banner — show if preference is on (default=true)
  const showWelcomePref = state.preferences.show_welcome_message !== false;
  if (showWelcomePref) {
    // Fetch startup text to include in welcome window
    let startupText = '';
    try {
      const startupData = await apiGet('/api/startup-text');
      if (startupData && startupData.text && startupData.text.trim()) {
        startupText = startupData.text.trim();
      }
    } catch { /* ignore if endpoint not available */ }
    _showWelcomeBanner(startupText);
  }

  // Check for due/overdue board items
  _checkBoardDueItems();

  // Scroll to current time or day start
  setTimeout(() => {
    const now    = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    const startH = (state.preferences.day_start_hour || 0) * 60;
    const endH   = (state.preferences.day_end_hour   || 24) * 60;
    if (nowMin >= startH && nowMin < endH) scrollToNow();
    else scrollToDayStart();
  }, 200);

  // Auto-follow "Now" — periodically scroll to current time
  if (state.preferences.auto_follow_now) {
    state._autoFollowInterval = setInterval(() => {
      if (state.preferences.auto_follow_now && !_listViewActive) scrollToNow();
    }, 60000);
  }
}

// Welcome banner for first login
function _showWelcomeBanner(startupText) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '9999';
  const p = state.preferences || {};
  const ex = state.exercise || {};
  // Read URLs from exercise settings (global, set by admin) with per-user pref fallback
  const welcomeURL = ex.welcome_url || p.welcome_url || '';
  const helpURL = ex.help_url || p.help_url || '';
  const trainingURL = ex.training_url || p.training_url || '';
  const demoURL = ex.demo_url || p.demo_url || '';
  const urlLinks = [
    welcomeURL  ? `<a href="${escHtml(welcomeURL)}" target="_blank" rel="noopener" style="color:var(--accent)">🏠 ${t('settings_welcome_url')||'Welcome'}</a>` : '',
    helpURL     ? `<a href="${escHtml(helpURL)}" target="_blank" rel="noopener" style="color:var(--accent)">📖 ${t('settings_help_url')||'Help'}</a>` : '',
    trainingURL ? `<a href="${escHtml(trainingURL)}" target="_blank" rel="noopener" style="color:var(--accent)">🎓 ${t('settings_training_url')||'Training'}</a>` : '',
    demoURL     ? `<a href="${escHtml(demoURL)}" target="_blank" rel="noopener" style="color:var(--accent)">🎬 ${t('settings_demo_url')||'Demo'}</a>` : '',
  ].filter(Boolean);
  // Build startup message section if text is provided
  const startupSection = startupText
    ? `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:16px;background:var(--bg2);text-align:left">
        <div style="font-weight:600;font-size:var(--fs-sm);color:var(--accent);margin-bottom:6px">📢 ${t('startup_text')||'Startup Message'}</div>
        <div style="font-size:var(--fs-sm);color:var(--text);line-height:1.6;white-space:pre-wrap;max-height:200px;overflow-y:auto">${escHtml(startupText)}</div>
      </div>`
    : '';
  // Build login info section
  const u = state.user || {};
  const greetName = u.display_name || u.username || '';
  const prevAt = u.prev_login_at ? fmtDateTime(new Date(u.prev_login_at)) : '';
  const prevFrom = u.prev_login_domain || u.prev_login_ip || '';
  const loginCount = u.login_count || 0;
  const failedAt = u.last_failed_login_at ? fmtDateTime(new Date(u.last_failed_login_at)) : '';
  const failedFrom = u.last_failed_login_ip || '';

  let loginInfoLines = [];
  if (prevAt) {
    const fromStr = prevFrom ? ` ${t('from')||'from'} <em>${escHtml(prevFrom)}</em>` : '';
    loginInfoLines.push(`<span>${t('welcome_last_login')||'Last login'}: ${prevAt}${fromStr}</span>`);
  } else {
    loginInfoLines.push(`<span>${t('welcome_first_login')||'This is your first login — welcome!'}</span>`);
  }
  if (loginCount > 1) {
    loginInfoLines.push(`<span>${t('welcome_login_count')||'Total logins'}: ${loginCount}</span>`);
  }
  if (failedAt) {
    const failedFromStr = failedFrom ? ` ${t('from')||'from'} <em>${escHtml(failedFrom)}</em>` : '';
    loginInfoLines.push(`<span style="color:var(--warning,#e67e22)">⚠ ${t('welcome_failed_login')||'Failed login attempt'}: ${failedAt}${failedFromStr}</span>`);
  }
  const loginInfoSection = `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:16px;background:var(--bg2);text-align:left;font-size:var(--fs-sm);line-height:1.8">
    ${loginInfoLines.join('<br>')}
  </div>`;

  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;padding:32px;text-align:center">
      <h2 style="font-size:var(--fs-xl);margin-bottom:8px;color:var(--text-bright)">${t('welcome_greeting')?.replace('{name}', escHtml(greetName)) || ('Welcome, ' + escHtml(greetName) + '!')}</h2>
      <p style="font-size:var(--fs-sm);color:var(--text);margin-bottom:16px;line-height:1.6">${t('welcome_text')}</p>
      ${loginInfoSection}
      ${startupSection}
      ${urlLinks.length ? `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:16px">${urlLinks.join('')}</div>` : ''}
      <label style="display:flex;align-items:center;gap:6px;justify-content:center;margin-bottom:16px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">
        <input type="checkbox" id="welcomeShowOnLogin" checked style="accent-color:var(--accent)">
        ${t('welcome_show_on_login')||'Show this window when logging in'}
      </label>
      <button class="btn btn-primary" id="welcomeDismissBtn">${t('welcome_dismiss')}</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const dismissWelcome = () => {
    const showOnLogin = overlay.querySelector('#welcomeShowOnLogin')?.checked;
    // Always save the preference state (checked or unchecked)
    state.preferences.show_welcome_message = !!showOnLogin;
    savePreferences();
    overlay.remove();
  };
  overlay.querySelector('#welcomeDismissBtn').addEventListener('click', dismissWelcome);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismissWelcome(); });
}

// ── Due date notification banner ──
async function _checkBoardDueItems() {
  try {
    const dueItems = await apiGet('/api/boards/due-items');
    if (!dueItems || dueItems.length === 0) return;
    const banner = document.createElement('div');
    banner.id = 'boardDueBanner';
    banner.style.cssText = 'background:var(--orange,#e67e22);color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:var(--fs-sm);z-index:100;position:relative';
    const overdueCount = dueItems.filter(i => i.due_date < new Date().toISOString().slice(0,10)).length;
    const dueTodayCount = dueItems.length - overdueCount;
    let msg = '';
    if (overdueCount > 0) msg += (t('board_due_overdue')||'{n} overdue board item(s)').replace('{n}', overdueCount);
    if (overdueCount > 0 && dueTodayCount > 0) msg += ' · ';
    if (dueTodayCount > 0) msg += (t('board_due_today')||'{n} board item(s) due today').replace('{n}', dueTodayCount);
    if (!msg) msg = (t('board_due_items_notice')||'{n} board item(s) due or overdue').replace('{n}', dueItems.length);
    banner.innerHTML = `<span>⚠️ ${msg}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:#fff;border:none;padding:4px 10px;cursor:pointer" onclick="if(typeof openBoardsModal==='function')openBoardsModal();this.closest('#boardDueBanner').remove()">${t('board_due_view')||'View Boards'}</button>
        <button style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:2px 6px" onclick="this.closest('#boardDueBanner').remove()">✕</button>
      </div>`;
    const header = document.getElementById('top-bar') || document.querySelector('header');
    if (header) header.insertAdjacentElement('afterend', banner);
    else document.body.prepend(banner);
  } catch { /* ignore if endpoint not available */ }
}

document.addEventListener('DOMContentLoaded', init);

// ── List / Table View ───────────────────────────────────────────────────────
let _listViewActive = false;
let _listSortKey    = 'start_time';
let _listSortAsc    = true;

// ── Print: dialog to choose view + period, then trigger browser print ─────
function printTimeline() {
  // Build the print options modal on-the-fly
  const existing = document.getElementById('printModal');
  if (existing) existing.remove();

  const today = new Date();
  const fmtDateOnly = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const startDefault = fmtDateOnly(state.startDate || today);
  const endDefault = fmtDateOnly(new Date((state.startDate || today).getTime() + 7 * 86400000));

  const html = `
    <div class="modal-overlay" id="printModal">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2>🖨 ${escHtml(t('print_dialog_title') || 'Print')}</h2>
          <button class="modal-close" data-close-modal="printModal">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
            ${escHtml(t('print_dialog_desc') || 'Choose what to print and the time period.')}
          </p>
          <div class="form-group" style="margin-bottom:12px">
            <label style="font-weight:600;display:block;margin-bottom:6px">${escHtml(t('print_what') || 'What to print')}</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
              <input type="radio" name="printView" value="calendar" checked style="accent-color:var(--accent)">
              📅 ${escHtml(t('print_view_calendar') || 'Calendar view')}
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
              <input type="radio" name="printView" value="list" style="accent-color:var(--accent)">
              📋 ${escHtml(t('print_view_list') || 'List view')}
            </label>
          </div>
          <div class="form-row" style="margin-bottom:12px">
            <div class="form-group" style="flex:1">
              <label>${escHtml(t('print_from') || 'From')}</label>
              <input type="date" id="printDateFrom" value="${startDefault}" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label>${escHtml(t('print_to') || 'To')}</label>
              <input type="date" id="printDateTo" value="${endDefault}" style="width:100%">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label style="font-weight:600;font-size:var(--fs-sm);color:var(--text-dim);display:block;margin-bottom:4px">${escHtml(t('print_quick') || 'Quick select')}</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              <button type="button" class="btn btn-sm btn-secondary" data-print-range="day">${escHtml(t('range_day') || 'Day')}</button>
              <button type="button" class="btn btn-sm btn-secondary" data-print-range="week">${escHtml(t('range_week') || 'Week')}</button>
              <button type="button" class="btn btn-sm btn-secondary" data-print-range="month">${escHtml(t('range_month') || 'Month')}</button>
              <button type="button" class="btn btn-sm btn-secondary" data-print-range="current">${escHtml(t('print_range_current') || 'Current view')}</button>
              <button type="button" class="btn btn-sm btn-secondary" data-print-range="all">${escHtml(t('print_range_all') || 'All events')}</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal="printModal">${escHtml(t('btn_cancel') || 'Cancel')}</button>
          <button class="btn btn-primary" id="btnDoPrint">🖨 ${escHtml(t('btn_print') || 'Print')}</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('printModal');
  openModal('printModal');

  // Quick range buttons
  modal.querySelectorAll('[data-print-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.printRange;
      const fromEl = document.getElementById('printDateFrom');
      const toEl = document.getElementById('printDateTo');
      const now = new Date();
      let from, to;
      if (range === 'day') {
        from = now; to = now;
      } else if (range === 'week') {
        const dow = now.getDay();
        const offset = dow === 0 ? -6 : 1 - dow; // Monday start
        from = new Date(now.getTime() + offset * 86400000);
        to = new Date(from.getTime() + 6 * 86400000);
      } else if (range === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else if (range === 'current') {
        from = state.startDate || now;
        to = (typeof getViewEnd === 'function') ? getViewEnd() : new Date(from.getTime() + 7 * 86400000);
      } else if (range === 'all') {
        const allEvents = state.events || [];
        if (allEvents.length === 0) { from = now; to = now; }
        else {
          const dates = allEvents.map(e => new Date(e.start_time).getTime()).filter(t => !isNaN(t));
          from = new Date(Math.min(...dates));
          to = new Date(Math.max(...dates));
        }
      }
      if (fromEl) fromEl.value = fmtDateOnly(from);
      if (toEl) toEl.value = fmtDateOnly(to);
    });
  });

  // Print button
  document.getElementById('btnDoPrint').addEventListener('click', async () => {
    const view = modal.querySelector('input[name="printView"]:checked')?.value || 'calendar';
    const fromVal = document.getElementById('printDateFrom').value;
    const toVal = document.getElementById('printDateTo').value;
    if (!fromVal || !toVal) {
      showError(t('print_invalid_range') || 'Please select a valid date range.');
      return;
    }
    const from = new Date(fromVal);
    const to = new Date(toVal + 'T23:59:59');
    if (from > to) {
      showError(t('print_invalid_range') || 'Please select a valid date range.');
      return;
    }
    closeModal('printModal');
    modal.remove();

    // Save current state to restore after printing
    const savedRange = state.range;
    const savedStart = state.startDate;
    const savedListActive = _listViewActive;
    const savedListFrom = document.getElementById('listDateFrom')?.value || '';
    const savedListTo = document.getElementById('listDateTo')?.value || '';

    if (view === 'list') {
      // Switch to list view if needed
      if (!_listViewActive) toggleListView();
      // Apply date range to list view filters
      const fromEl = document.getElementById('listDateFrom');
      const toEl = document.getElementById('listDateTo');
      if (fromEl) fromEl.value = fromVal;
      if (toEl) toEl.value = toVal;
      renderListView();
    } else {
      // Calendar view: switch back if currently in list view
      if (_listViewActive) toggleListView();
      // Use the print override to render the exact day range
      const dayCount = Math.ceil((to - from) / 86400000) + 1;
      state.startDate = startOfDay(from);
      state._printDays = dayCount;
      if (typeof refreshAll === 'function') await refreshAll();
      renderTimeline();
    }

    // Wait a tick for the DOM to update, then trigger the print dialog
    setTimeout(() => {
      window.print();
      // Restore previous state after the print dialog closes
      setTimeout(() => {
        state._printDays = null;
        state.startDate = savedStart;
        state.range = savedRange;
        if (view === 'list') {
          // Restore original list view filters
          const fromEl = document.getElementById('listDateFrom');
          const toEl = document.getElementById('listDateTo');
          if (fromEl) fromEl.value = savedListFrom;
          if (toEl) toEl.value = savedListTo;
          if (savedListActive !== _listViewActive) toggleListView();
          else renderListView();
        } else {
          if (savedListActive !== _listViewActive) toggleListView();
          if (typeof refreshAll === 'function') refreshAll();
        }
      }, 1000);
    }, 300);
  });
}

function toggleListView() {
  _listViewActive = !_listViewActive;
  const timeline  = document.getElementById('timeline-container');
  const listView  = document.getElementById('list-view');
  const btn       = document.getElementById('btnViewToggle');
  if (_listViewActive) {
    if (timeline) timeline.style.display = 'none';
    if (listView)  listView.style.display = '';
    if (btn)       { btn.textContent = '📅 Calendar'; btn.classList.add('active'); }
    // i18n for list view toolbar
    const searchEl = document.getElementById('listSearch');
    if (searchEl) searchEl.placeholder = '🔍 ' + t('lv_search');
    const statusEl = document.getElementById('listStatusFilter');
    if (statusEl) {
      statusEl.options[0].textContent = t('lv_all_statuses');
      for (let i = 1; i < statusEl.options.length; i++) {
        const v = statusEl.options[i].value;
        statusEl.options[i].textContent = t('status_' + v) || v;
      }
    }
    // i18n for table headers
    document.querySelectorAll('#list-view-table th[data-i18n]').forEach(th => {
      const key = th.dataset.i18n;
      const sortSpan = th.querySelector('span[id^="listSort-"]');
      th.textContent = t(key);
      if (sortSpan) th.appendChild(sortSpan);
    });
    // Populate type filter
    const typeEl = document.getElementById('listTypeFilter');
    if (typeEl) typeEl.options[0].textContent = t('lv_all_types');
    if (typeEl && typeEl.options.length <= 1) {
      const _listTypeIcons = { mote:'🤝', decision:'⚖️', deadline:'⏰', standup:'🧍', reporting:'📊',
        instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌', pause:'⏸' };
      const lang = state.preferences?.language || 'en';
      (state.eventTypes || []).forEach(et => {
        const opt = document.createElement('option');
        opt.value = et.key;
        const lbl = lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : lang==='da'&&et.label_da ? et.label_da : lang==='fi'&&et.label_fi ? et.label_fi : et.label;
        const ico = et.icon || _listTypeIcons[et.key] || '';
        opt.textContent = (ico ? ico + ' ' : '') + lbl;
        typeEl.appendChild(opt);
      });
    }
    // Populate responsible filter
    const respEl = document.getElementById('listResponsibleFilter');
    if (respEl) {
      respEl.options[0].textContent = t('lv_all_responsible') || 'All responsible';
      if (respEl.options.length <= 1) {
        (state.users || []).forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = u.display_name || u.username;
          respEl.appendChild(opt);
        });
      }
    }
    // Populate layer filter checkboxes
    _initLayerFilterPanel();
    renderListView();
  } else {
    if (timeline) timeline.style.display = '';
    if (listView)  listView.style.display = 'none';
    if (btn)       { btn.textContent = '📋 List'; btn.classList.remove('active'); }
    renderTimeline();
  }
}

// ── List view column visibility toggle ─────────────────────────────────────
(function _initLvColToggle() {
  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('lvColToggleBtn');
    var panel = document.getElementById('lvColTogglePanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', function() {
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
    panel.querySelectorAll('.lv-col-toggle').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var col = cb.dataset.col;
        var show = cb.checked;
        document.querySelectorAll('.lv-col-' + col).forEach(function(el) {
          el.style.display = show ? '' : 'none';
        });
      });
    });
  });
})();

// ── List view multi-layer filter ──────────────────────────────────────────
let _layerPanelInited = false;

function _initLayerFilterPanel() {
  const btn = document.getElementById('lvLayerBtn');
  const panel = document.getElementById('lvLayerPanel');
  const list = document.getElementById('lvLayerList');
  if (!btn || !panel || !list) return;

  // Populate layer checkboxes (rebuild each time in case layers changed)
  list.innerHTML = (state.layers || []).map(l =>
    `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-sm);padding:3px 0">
      <input type="checkbox" class="lv-layer-cb" value="${l.id}" checked style="accent-color:var(--accent)">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${l.color||'#4A90D9'};flex-shrink:0"></span>
      ${escHtml(l.name)}
    </label>`
  ).join('');

  // i18n for static labels
  const allCb = panel.querySelector('.lv-layer-cb[value="_all"]');
  if (allCb) allCb.parentElement.lastChild.textContent = ' ' + (t('lv_all_layers') || 'All layers');
  const masterCb = panel.querySelector('.lv-layer-cb[value="_master"]');
  if (masterCb) masterCb.parentElement.lastChild.textContent = ' ' + (t('layers_master') || 'Master Timeline');

  if (_layerPanelInited) return;
  _layerPanelInited = true;

  // Toggle panel visibility
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });

  // Close panel when clicking outside
  document.addEventListener('click', function(e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.style.display = 'none';
    }
  });

  // Handle checkbox changes via delegation
  panel.addEventListener('change', function(e) {
    const cb = e.target.closest('.lv-layer-cb');
    if (!cb) return;

    if (cb.value === '_all') {
      // "All layers" toggles all other checkboxes
      const checked = cb.checked;
      panel.querySelectorAll('.lv-layer-cb').forEach(c => { c.checked = checked; });
    } else {
      // If unchecking any specific layer, uncheck "All"
      const allCb = panel.querySelector('.lv-layer-cb[value="_all"]');
      if (allCb) {
        const allOthers = [...panel.querySelectorAll('.lv-layer-cb:not([value="_all"])')];
        allCb.checked = allOthers.every(c => c.checked);
      }
    }

    // Update button label
    _updateLayerBtnLabel();
    renderListView();
  });
}

function _updateLayerBtnLabel() {
  const btn = document.getElementById('lvLayerBtn');
  if (!btn) return;
  const allCb = document.querySelector('.lv-layer-cb[value="_all"]');
  if (allCb && allCb.checked) {
    btn.textContent = '🗂 ' + (t('lv_all_layers') || 'All layers') + ' ▾';
    return;
  }
  const checked = [...document.querySelectorAll('.lv-layer-cb:checked:not([value="_all"])')];
  if (checked.length === 0) {
    btn.textContent = '🗂 ' + (t('lv_no_layers') || 'No layers') + ' ▾';
  } else if (checked.length === 1) {
    const label = checked[0].parentElement.textContent.trim();
    btn.textContent = '🗂 ' + label + ' ▾';
  } else {
    btn.textContent = '🗂 ' + checked.length + ' ' + (t('lv_layers_selected') || 'layers') + ' ▾';
  }
}

function _listWeekLabel(date) {
  if (!state.preferences.show_week_numbers || !date) return '';
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const style = state.preferences.week_number_style;
  const label = style === 'year_week' ? (date.getFullYear() % 10) + '-W' + String(weekNo).padStart(2,'0') : 'W' + weekNo;
  return ` <span style="font-size:.8em;color:var(--accent);font-weight:600">${label}</span>`;
}

function listSortBy(key) {
  if (_listSortKey === key) {
    _listSortAsc = !_listSortAsc;
  } else {
    _listSortKey = key;
    _listSortAsc = true;
  }
  // Update sort indicators
  document.querySelectorAll('[id^="listSort-"]').forEach(el => el.textContent = '');
  const ind = document.getElementById('listSort-' + key);
  if (ind) ind.textContent = _listSortAsc ? '▲' : '▼';
  renderListView();
}

function renderListView() {
  if (!_listViewActive) return;
  const tbody  = document.getElementById('list-view-tbody');
  const countEl = document.getElementById('listCount');
  if (!tbody) return;

  // Always update sort indicators on all columns
  document.querySelectorAll('[id^="listSort-"]').forEach(el => {
    const col = el.id.replace('listSort-', '');
    el.textContent = col === _listSortKey ? (_listSortAsc ? '▲' : '▼') : '';
  });

  const search     = (document.getElementById('listSearch')?.value || '').toLowerCase();
  const statusFil  = document.getElementById('listStatusFilter')?.value || '';
  const typeFil    = document.getElementById('listTypeFilter')?.value || '';
  const dateFrom   = document.getElementById('listDateFrom')?.value || '';
  const dateTo     = document.getElementById('listDateTo')?.value || '';
  const respFil    = document.getElementById('listResponsibleFilter')?.value || '';

  // Multi-layer filter: get checked layer checkboxes
  const allLayerCb = document.querySelector('.lv-layer-cb[value="_all"]');
  const layerFilterAll = !allLayerCb || allLayerCb.checked;
  let layerAllowSet = null;
  if (!layerFilterAll) {
    layerAllowSet = new Set();
    document.querySelectorAll('.lv-layer-cb:checked').forEach(cb => {
      if (cb.value !== '_all') layerAllowSet.add(cb.value);
    });
  }

  const hl = state.preferences.hidden_layers || [];
  let events = (state.events || []).filter(ev => {
    if (isTypeHidden(ev.event_type)) return false;
    if (ev.layer_id != null && hl.includes(ev.layer_id)) return false;
    // Multi-layer filter
    if (layerAllowSet) {
      if (ev.layer_id == null) {
        if (!layerAllowSet.has('_master')) return false;
      } else {
        if (!layerAllowSet.has(String(ev.layer_id))) return false;
      }
    }
    if (statusFil && ev.status !== statusFil) return false;
    if (typeFil   && ev.event_type !== typeFil) return false;
    if (dateFrom) {
      const from = new Date(dateFrom);
      const evStart = new Date(ev.start_time);
      if (evStart < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      const evStart = new Date(ev.start_time);
      if (evStart > to) return false;
    }
    if (respFil) {
      const effRespId = ev.responsible_id || ev.created_by || null;
      if (String(effRespId) !== respFil) return false;
    }
    if (search) {
      const hay = (ev.title + ' ' + (ev.description||'') + ' ' + (ev.responsible_name||'')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort
  if (_listSortKey === '_custom') {
    const customOrder = state.preferences.list_custom_order || [];
    events.sort((a, b) => {
      const ia = customOrder.indexOf(a.id);
      const ib = customOrder.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  } else {
    events.sort((a, b) => {
      let va = a[_listSortKey] || '';
      let vb = b[_listSortKey] || '';
      if (_listSortKey === 'start_time' || _listSortKey === 'end_time') { va = new Date(va || 0); vb = new Date(vb || 0); }
      if (typeof va === 'string' && typeof vb === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return _listSortAsc ? -1 : 1;
      if (va > vb) return _listSortAsc ?  1 : -1;
      return 0;
    });
  }

  if (countEl) countEl.textContent = `${events.length} event${events.length !== 1 ? 's' : ''}`;

  // Update fingerprints for incremental comparison
  if (typeof _listRowFingerprints !== 'undefined') {
    _listRowFingerprints = new Map(events.map(ev => [ev.id, _listEventFingerprint(ev)]));
  }

  const statusColors = {
    planned:'var(--text-dim)', active:'var(--accent)', completed:'var(--green)',
    verified:'var(--green)', cancelled:'var(--red)', submitted:'var(--yellow)',
    responded_to:'var(--yellow)', rejected:'var(--red)'
  };

  const canEdit = state.user && hasRole2(state.user.role, 'readwrite');
  const eventTypes = state.eventTypes || [];
  const users = state.users || [];

  // Red time line marker in list view
  const prefs = state.preferences || {};
  const redLineEnabled = prefs.red_line_enabled;
  const redLineColor = prefs.red_line_color || '#E74C3C';
  const now = typeof getNow === 'function' ? getNow() : new Date();
  let redLineInserted = false;

  let _seqNum = 0;
  tbody.innerHTML = events.map(ev => {
    _seqNum++;
    let marker = '';
    if (redLineEnabled && !redLineInserted && _listSortKey === 'start_time') {
      const evTime = new Date(ev.start_time);
      if ((_listSortAsc && evTime > now) || (!_listSortAsc && evTime < now)) {
        redLineInserted = true;
        marker = `<tr class="list-red-line"><td colspan="8" style="padding:0;position:relative;height:2px;background:${redLineColor}">
          <span style="position:absolute;left:8px;top:-8px;font-size:9px;color:${redLineColor};background:var(--bg2);padding:0 4px">▶ ${t('lv_now')}</span>
        </td></tr>`;
      }
    }
    const isStrikethrough = ev.status === 'cancelled' || ev.status === 'rejected';
    const strikeStyle = isStrikethrough ? 'text-decoration:line-through;opacity:0.7;' : '';

    // Event type label
    const etMatch = eventTypes.find(et => et.key === ev.event_type);
    const etLabel = etMatch ? (etMatch.label || etMatch.key) : (ev.event_type || '');

    // Event type dropdown (editable)
    const typeCell = canEdit ?
      `<select class="list-type-sel" data-ev-type="${ev.id}" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:2px 6px;font-size:inherit;cursor:pointer">
        ${eventTypes.map(et =>
          `<option value="${et.key}" ${ev.event_type===et.key?'selected':''}>${escHtml(et.label||et.key)}</option>`
        ).join('')}
      </select>` :
      escHtml(etLabel);

    // Responsible dropdown (editable) — default to creator if no responsible set
    const effRespId = ev.responsible_id || ev.created_by || null;
    const effRespName = ev.responsible_name || ev.created_by_name || '';
    const responsibleCell = canEdit ?
      `<select class="list-resp-sel" data-ev-resp="${ev.id}" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:2px 6px;font-size:inherit;cursor:pointer;max-width:140px">
        <option value="" ${!effRespId?'selected':''}>${t('lv_no_responsible')}</option>
        ${users.map(u =>
          `<option value="${u.id}" ${effRespId===u.id?'selected':''}>${escHtml(u.display_name||u.username)}</option>`
        ).join('')}
      </select>` :
      escHtml(effRespName || t('lv_no_responsible'));

    const _etMatch = eventTypes.find(et => et.key === ev.event_type);
    const _rawColor = ev.color || (_etMatch ? _etMatch.color : 'var(--accent)');
    const _evColor = typeof cbSafeColor === 'function' ? cbSafeColor(_rawColor) : _rawColor;
    return marker + `
    <tr data-ev-row="${ev.id}" ${canEdit ? 'draggable="true"' : ''} style="border-bottom:1px solid var(--border);cursor:pointer;${strikeStyle}">
      <td style="padding:8px 10px;text-align:center;color:var(--text-dim);font-size:var(--fs-xs);width:40px">${canEdit ? '<span style="cursor:grab;margin-right:2px;opacity:.4">⠿</span>' : ''}${_seqNum}</td>
      <td style="padding:8px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${_evColor};margin-right:6px;vertical-align:middle"></span>
        ${escHtml(ev.title)}
      </td>
      <td class="lv-col-type" style="padding:8px 10px">${typeCell}</td>
      <td class="lv-col-status" style="padding:8px 10px;white-space:nowrap">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColors[ev.status]||'var(--text-dim)'};margin-right:5px;vertical-align:middle"></span>${canEdit ?
          `<select class="list-status-sel" data-ev-status="${ev.id}" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:${statusColors[ev.status]||'var(--text)'};padding:2px 6px;font-size:inherit;cursor:pointer">
            ${['planned','active','completed','rejected','cancelled'].map(s =>
              `<option value="${s}" ${(ev.status||'planned')===s?'selected':''} style="color:var(--text)">${t('status_'+s)||s}</option>`
            ).join('')}
          </select>` :
          `<span style="color:${statusColors[ev.status]||'var(--text)'}">${t('status_'+(ev.status||'planned'))||ev.status}</span>`}
      </td>
      <td class="lv-col-start" style="padding:8px 10px;white-space:nowrap">${fmtDateTime(new Date(ev.start_time))}</td>
      <td class="lv-col-end" style="padding:8px 10px;white-space:nowrap">${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
      <td class="lv-col-responsible" style="padding:8px 10px">${responsibleCell}</td>
      <td class="lv-col-actions" style="padding:8px 10px;white-space:nowrap">
        ${ev.contact_url ? `<a href="${escAttr(ev.contact_url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="margin-right:4px;text-decoration:none" title="${escHtml(ev.contact_url)}" onclick="event.stopPropagation()">🔗</a>` : ''}
        <button class="btn btn-secondary btn-sm" data-ev-view="${ev.id}">${t('lv_view')}</button>
        ${canEdit ? `<button class="btn btn-secondary btn-sm" style="margin-left:4px" data-ev-edit="${ev.id}">${t('lv_edit')}</button>` : ''}
        ${canEdit ? `<button class="btn btn-secondary btn-sm" style="margin-left:4px;color:var(--red,#e74c3c)" data-ev-del="${ev.id}">${t('lv_delete')}</button>` : ''}
      </td>
    </tr>
  `; }).join('');

  // Attach event listeners for list view rows
  tbody.querySelectorAll('tr[data-ev-row]').forEach(row => {
    const evId = parseInt(row.dataset.evRow, 10);
    row.addEventListener('click', () => { const ev = state.events.find(e => e.id === evId); if (ev) showEventDetail(ev); });
    row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg3)'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });
  });
  tbody.querySelectorAll('button[data-ev-view]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); const ev = state.events.find(x => x.id === parseInt(btn.dataset.evView, 10)); if (ev) showEventDetail(ev); });
  });
  tbody.querySelectorAll('button[data-ev-edit]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); const ev = state.events.find(x => x.id === parseInt(btn.dataset.evEdit, 10)); if (ev) openEventModal(ev); });
  });
  // Delete button
  tbody.querySelectorAll('button[data-ev-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const evId = parseInt(btn.dataset.evDel, 10);
      if (!confirm(t('lv_confirm_delete'))) return;
      const ev = state.events.find(x => x.id === evId);
      if (ev) pushUndo('delete_event', { ...ev });
      const res = await apiDel(`/api/events/${evId}`);
      if (res.ok) { await refreshAll(); showNotification('success', t('notif_status_changed')); }
      else { const err = await res.json(); showError(err.error); }
    });
  });
  // Status change
  tbody.querySelectorAll('select[data-ev-status]').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const evId = parseInt(sel.dataset.evStatus, 10);
      await patchEventStatus(evId, sel.value, '');
    });
  });
  // Event type change
  tbody.querySelectorAll('select[data-ev-type]').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const evId = parseInt(sel.dataset.evType, 10);
      const ev = state.events.find(x => x.id === evId);
      if (!ev) return;
      const res = await apiPut(`/api/events/${evId}`, { ...ev, event_type: sel.value });
      if (res.ok) { await refreshAll(); } else { const err = await res.json(); showError(err.error); }
    });
  });
  // Responsible change
  tbody.querySelectorAll('select[data-ev-resp]').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const evId = parseInt(sel.dataset.evResp, 10);
      const ev = state.events.find(x => x.id === evId);
      if (!ev) return;
      const newRespId = sel.value ? parseInt(sel.value, 10) : null;
      const newRespUser = users.find(u => u.id === newRespId);
      const payload = { ...ev, responsible_id: newRespId, responsible_name: newRespUser ? (newRespUser.display_name || newRespUser.username) : '' };
      const res = await apiPut(`/api/events/${evId}`, payload);
      if (res.ok) { await refreshAll(); } else { const err = await res.json(); showError(err.error); }
    });
  });

  // Drag-to-reorder rows
  if (canEdit) {
    let _dragRow = null;
    tbody.querySelectorAll('tr[data-ev-row][draggable]').forEach(row => {
      row.addEventListener('dragstart', e => {
        _dragRow = row;
        row.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.evRow);
      });
      row.addEventListener('dragend', () => {
        row.style.opacity = '';
        _dragRow = null;
        tbody.querySelectorAll('tr').forEach(r => {
          r.style.borderTop = '';
          r.style.borderBottom = '';
        });
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!_dragRow || _dragRow === row) return;
        tbody.querySelectorAll('tr').forEach(r => { r.style.borderTop = ''; r.style.borderBottom = ''; });
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          row.style.borderTop = '2px solid var(--accent)';
        } else {
          row.style.borderBottom = '2px solid var(--accent)';
        }
      });
      row.addEventListener('dragleave', () => {
        row.style.borderTop = '';
        row.style.borderBottom = '';
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (!_dragRow || _dragRow === row) return;
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          tbody.insertBefore(_dragRow, row);
        } else {
          tbody.insertBefore(_dragRow, row.nextSibling);
        }
        // Update sequence numbers
        let seq = 0;
        tbody.querySelectorAll('tr[data-ev-row]').forEach(r => {
          seq++;
          const firstTd = r.querySelector('td');
          if (firstTd) {
            const grabSpan = firstTd.querySelector('span') ? '<span style="cursor:grab;margin-right:2px;opacity:.4">⠿</span>' : '';
            firstTd.innerHTML = grabSpan + seq;
          }
        });
        // Save custom order to preferences
        const orderedIds = [...tbody.querySelectorAll('tr[data-ev-row]')].map(r => parseInt(r.dataset.evRow, 10));
        state.preferences.list_custom_order = orderedIds;
        _listSortKey = '_custom';
        if (typeof savePreferences === 'function') savePreferences();
      });
    });
  }
}

// ── Incremental list view update ──────────────────────────────────────────
// Tracks rendered rows and only replaces those whose data changed.
let _listRowFingerprints = new Map(); // evId -> fingerprint

function _listEventFingerprint(ev) {
  return [
    ev.id, ev.title, ev.status || '', ev.event_type || '',
    ev.start_time, ev.end_time || '', ev.color || '',
    ev.responsible_id || 0, ev.responsible_name || '',
    ev.created_by_name || '', ev.contact_url || '',
    ev.layer_id || 0, ev.updated_at || ''
  ].join('|');
}

function patchListView() {
  if (!_listViewActive) return;
  const tbody = document.getElementById('list-view-tbody');
  if (!tbody) return;

  // Re-apply the same filtering and sorting as renderListView
  const search     = (document.getElementById('listSearch')?.value || '').toLowerCase();
  const statusFil  = document.getElementById('listStatusFilter')?.value || '';
  const typeFil    = document.getElementById('listTypeFilter')?.value || '';
  const dateFrom   = document.getElementById('listDateFrom')?.value || '';
  const dateTo     = document.getElementById('listDateTo')?.value || '';
  const respFil    = document.getElementById('listResponsibleFilter')?.value || '';

  const hl = state.preferences.hidden_layers || [];
  let events = (state.events || []).filter(ev => {
    if (isTypeHidden(ev.event_type)) return false;
    if (ev.layer_id != null && hl.includes(ev.layer_id)) return false;
    if (statusFil && ev.status !== statusFil) return false;
    if (typeFil   && ev.event_type !== typeFil) return false;
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (new Date(ev.start_time) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      if (new Date(ev.start_time) > to) return false;
    }
    if (respFil) {
      const effRespId = ev.responsible_id || ev.created_by || null;
      if (String(effRespId) !== respFil) return false;
    }
    if (search) {
      const hay = (ev.title + ' ' + (ev.description||'') + ' ' + (ev.responsible_name||'')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort
  if (_listSortKey === '_custom') {
    const customOrder = state.preferences.list_custom_order || [];
    events.sort((a, b) => {
      const ia = customOrder.indexOf(a.id);
      const ib = customOrder.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  } else {
    events.sort((a, b) => {
      let va = a[_listSortKey] || '';
      let vb = b[_listSortKey] || '';
      if (_listSortKey === 'start_time' || _listSortKey === 'end_time') { va = new Date(va || 0); vb = new Date(vb || 0); }
      if (typeof va === 'string' && typeof vb === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return _listSortAsc ? -1 : 1;
      if (va > vb) return _listSortAsc ?  1 : -1;
      return 0;
    });
  }

  // Build desired ID list and fingerprints
  const desiredIds = events.map(ev => ev.id);
  const desiredFps = new Map(events.map(ev => [ev.id, _listEventFingerprint(ev)]));

  // Get current rows
  const currentRows = [...tbody.querySelectorAll('tr[data-ev-row]')];
  const currentIds = currentRows.map(r => parseInt(r.dataset.evRow, 10));

  // Quick check: if IDs and order match, only update changed rows in-place
  const idsMatch = desiredIds.length === currentIds.length &&
    desiredIds.every((id, i) => id === currentIds[i]);

  if (idsMatch) {
    let anyChanged = false;
    for (let i = 0; i < desiredIds.length; i++) {
      const evId = desiredIds[i];
      const newFp = desiredFps.get(evId);
      if (_listRowFingerprints.get(evId) !== newFp) {
        anyChanged = true;
        break;
      }
    }
    if (!anyChanged) {
      // Update count and return — nothing to change
      const countEl = document.getElementById('listCount');
      if (countEl) countEl.textContent = `${events.length} event${events.length !== 1 ? 's' : ''}`;
      return;
    }
  }

  // Events changed (order, additions, removals, or content) — do full renderListView
  // to preserve the complex row rendering logic (dropdowns, red line, drag handlers)
  _listRowFingerprints = desiredFps;
  renderListView();
}
