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
      a.download = `tidslinjal-export-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

});

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
  state.roleConfigs = roles   || [];

  applyPreferences();

  state.resolution = 'hour';
  state.range      = state.preferences.default_view || 'week';
  document.getElementById('rangeSelect').value      = state.range;
  document.getElementById('resolutionSelect').value = state.resolution;

  updateUILabels();

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
      state._integrationStatus = await apiGet('/api/status');
    } catch { state._integrationStatus = null; }
    // Load gradual backup status for legend panel
    try {
      const gbData = await apiGet('/api/admin/gradual-backup');
      if (gbData && gbData.settings) {
        state._gradualBackupStatus = {
          enabled: gbData.settings.enabled !== false,
          interval_minutes: gbData.settings.interval_minutes || 15,
          snapshot_count: (gbData.snapshots || []).length,
        };
      }
    } catch { state._gradualBackupStatus = null; }
  }

  // User info in header
  document.getElementById('userDisplayName').textContent = state.user.display_name || state.user.username;
  const roleEl = document.getElementById('userRoleBadge');
  roleEl.textContent = t('role_'+state.user.role) || state.user.role;
  roleEl.className   = `role-badge role-${state.user.role}`;

  // Show/hide role-gated controls
  const role = state.user.role;
  const isAdminOrOplead = hasRole2(role, 'oplead');
  const isTeamLead      = hasRole2(role, 'teamlead');
  const canWrite        = hasRole2(role, 'readwrite');

  if (canWrite) {
    document.getElementById('btnAddEvent').style.display = '';
  }
  if (state.user.role==='admin' || state.user.can_lock) {
    document.getElementById('btnAddLock').style.display = '';
  }
  if (state.user.role==='admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display='');
  }
  if (hasRole2(state.user.role, 'teamlead')) {
    document.querySelectorAll('.teamlead-only').forEach(el => el.style.display='');
  }

  // Control events
  document.getElementById('rangeSelect').addEventListener('change', e => {
    state.range = e.target.value; refreshAll();
  });
  document.getElementById('resolutionSelect').addEventListener('change', e => {
    state.resolution = e.target.value; refreshAll();
  });
  setupNavLongPress(document.getElementById('btnPrev'), -1);
  setupNavLongPress(document.getElementById('btnNext'),  1);
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
  document.getElementById('searchInput').addEventListener('input', e => {
    state.search = e.target.value;
    renderTimeline();
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
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t2 => t2.classList.remove('active'));
      tab.classList.add('active');
      state.sidebarTab = tab.dataset.tab;
      renderSidebar();
    });
  });

  // Load filter presets
  _loadFilterPresets();

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Auto-refresh
  setInterval(refreshAll, 60000);
  setInterval(() => updateCurrentTimeLine(getDays(), getSlotHeight()), 30000);

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

  // Set up interactions
  setupZoomDrag();
  setupDragToReschedule();
  setupEventResize();
  setupKeyboardShortcuts();
  setupHorizontalDrag();
  setupSidebarResize();
  setupContextMenus();

  // Clean up drag state when tab loses focus (e.g. alt-tab during drag)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Release any mouse-button-held state by dispatching a synthetic mouseup
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
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

  // Scroll to current time or day start
  setTimeout(() => {
    const now    = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    const startH = (state.preferences.day_start_hour || 0) * 60;
    const endH   = (state.preferences.day_end_hour   || 24) * 60;
    if (nowMin >= startH && nowMin < endH) scrollToNow();
    else scrollToDayStart();
  }, 200);
}

document.addEventListener('DOMContentLoaded', init);

// ── List / Table View ───────────────────────────────────────────────────────
let _listViewActive = false;
let _listSortKey    = 'start_time';
let _listSortAsc    = true;

function toggleListView() {
  _listViewActive = !_listViewActive;
  const timeline  = document.getElementById('timeline-container');
  const listView  = document.getElementById('list-view');
  const btn       = document.getElementById('btnViewToggle');
  if (_listViewActive) {
    if (timeline) timeline.style.display = 'none';
    if (listView)  listView.style.display = '';
    if (btn)       { btn.textContent = '📅 Calendar'; btn.classList.add('active'); }
    // Populate type filter
    const typeEl = document.getElementById('listTypeFilter');
    if (typeEl && typeEl.options.length <= 1) {
      const _listTypeIcons = { mote:'🤝', decision:'⚖️', deadline:'⏰', standup:'🧍', reporting:'📊',
        instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌', pause:'⏸' };
      const lang = state.preferences?.language || 'en';
      (state.eventTypes || []).forEach(et => {
        const opt = document.createElement('option');
        opt.value = et.key;
        const lbl = lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : et.label;
        const ico = et.icon || _listTypeIcons[et.key] || '';
        opt.textContent = (ico ? ico + ' ' : '') + lbl;
        typeEl.appendChild(opt);
      });
    }
    renderListView();
  } else {
    if (timeline) timeline.style.display = '';
    if (listView)  listView.style.display = 'none';
    if (btn)       { btn.textContent = '📋 List'; btn.classList.remove('active'); }
    renderTimeline();
  }
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

  const search     = (document.getElementById('listSearch')?.value || '').toLowerCase();
  const statusFil  = document.getElementById('listStatusFilter')?.value || '';
  const typeFil    = document.getElementById('listTypeFilter')?.value || '';

  let events = (state.events || []).filter(ev => {
    if (statusFil && ev.status !== statusFil) return false;
    if (typeFil   && ev.event_type !== typeFil) return false;
    if (search) {
      const hay = (ev.title + ' ' + (ev.description||'') + ' ' + (ev.responsible_name||'')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort
  events.sort((a, b) => {
    let va = a[_listSortKey] || '';
    let vb = b[_listSortKey] || '';
    if (_listSortKey === 'start_time') { va = new Date(va); vb = new Date(vb); }
    if (va < vb) return _listSortAsc ? -1 : 1;
    if (va > vb) return _listSortAsc ?  1 : -1;
    return 0;
  });

  if (countEl) countEl.textContent = `${events.length} event${events.length !== 1 ? 's' : ''}`;

  const statusColors = {
    planned:'var(--text-dim)', active:'var(--accent)', completed:'var(--green)',
    verified:'var(--green)', cancelled:'var(--red)', submitted:'var(--yellow)',
    responded_to:'var(--yellow)', rejected:'var(--red)'
  };

  tbody.innerHTML = events.map(ev => `
    <tr data-ev-row="${ev.id}" style="border-bottom:1px solid var(--border);cursor:pointer">
      <td style="padding:8px 10px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ev.color||'var(--accent)'};margin-right:6px;vertical-align:middle"></span>
        ${escHtml(ev.title)}
      </td>
      <td style="padding:8px 10px">${escHtml(ev.event_type)}</td>
      <td style="padding:8px 10px"><span style="color:${statusColors[ev.status]||'var(--text)'}">${t('status_'+(ev.status||'planned'))||ev.status}</span></td>
      <td style="padding:8px 10px;white-space:nowrap">${fmtDateTime(new Date(ev.start_time))}</td>
      <td style="padding:8px 10px;white-space:nowrap">${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
      <td style="padding:8px 10px">${escHtml(ev.responsible_name||'')}</td>
      <td style="padding:8px 10px">
        <button class="btn btn-secondary btn-sm" data-ev-view="${ev.id}">View</button>
        ${state.user && hasRole2(state.user.role, 'readwrite') ?
          `<button class="btn btn-secondary btn-sm" style="margin-left:4px" data-ev-edit="${ev.id}">Edit</button>` : ''}
      </td>
    </tr>
  `).join('');

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
}
