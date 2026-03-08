/* ============================================================
   Tidslinjal v3.6.0 — Collaborative Operational Timeline
   Main entry point: initialisation and top-level wiring.

   Module load order (all plain <script> tags):
     i18n.js → utils.js → state.js → api.js
     → timeline.js → modals.js → app.js
   ============================================================ */
'use strict';

// ── Additional DOMContentLoaded wiring ─────────────────────────────────────
// (password change, admin data-export, report modal population)
document.addEventListener('DOMContentLoaded', () => {
  const btnSavePw = document.getElementById('btnSavePassword');
  if (btnSavePw) {
    btnSavePw.addEventListener('click', async () => {
      const curPw = document.getElementById('pwdCurrent')?.value || '';
      const newPw = document.getElementById('pwdNew')?.value?.trim()    || '';
      const conPw = document.getElementById('pwdConfirm')?.value?.trim() || '';
      if (!newPw || newPw !== conPw) {
        showError(t('password_mismatch') || 'Passwords do not match', 'Validation'); return;
      }
      const res = await apiPost('/api/auth/change-password', {current_password: curPw, new_password: newPw});
      if (res.ok) {
        closeModal('passwordModal');
        showNotification('success', t('password_saved')||'Password changed');
      } else {
        const err = await res.json();
        showError(err.error);
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

  const btnReport = document.getElementById('btnReport');
  if (btnReport) {
    btnReport.addEventListener('click', () => {
      const layerList = document.getElementById('reportLayerList');
      if (layerList) {
        layerList.innerHTML = `
          <label class="group-chip selected" style="cursor:pointer">
            <input type="checkbox" class="report-layer-cb" value="0" checked style="margin-right:4px">
            ${t('layers_master')||'Master'}
          </label>
          ${state.layers.map(l => `
            <label class="group-chip selected" style="cursor:pointer">
              <input type="checkbox" class="report-layer-cb" value="${l.id}" checked style="margin-right:4px">
              ${escHtml(l.name)}
            </label>
          `).join('')}
        `;
        layerList.querySelectorAll('.report-layer-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            cb.closest('.group-chip').classList.toggle('selected', cb.checked);
          });
        });
      }
      openModal('reportModal');
    });
  }
});

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    state.user = await apiGet('/api/auth/me');
  } catch {
    window.location.href = '/login';
    return;
  }

  // Load initial data in parallel
  const [prefs, eventTypes, layers, groups, users] = await Promise.all([
    apiGet('/api/preferences'),
    apiGet('/api/event-types'),
    apiGet('/api/layers'),
    apiGet('/api/groups'),
    apiGet('/api/users').catch(() => []),
  ]);

  state.preferences = prefs || state.preferences;
  // Migrate legacy active_layers to hidden_layers (invert old whitelist)
  if (!state.preferences.hidden_layers && state.preferences.active_layers && state.preferences.active_layers.length > 0) {
    const all = layers || [];
    state.preferences.hidden_layers = all.map(l => l.id).filter(id => !state.preferences.active_layers.includes(id));
  }
  state.eventTypes = eventTypes || [];
  state.layers     = layers  || [];
  state.groups     = groups  || [];
  state.users      = users   || [];

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
  // Templates: admin + oplead only
  const btnTemplates = document.getElementById('btnTemplates');
  if (btnTemplates) btnTemplates.style.display = isAdminOrOplead ? '' : 'none';
  // Export/Import: admin + oplead only
  const btnExport = document.getElementById('btnExport');
  if (btnExport) btnExport.style.display = isAdminOrOplead ? '' : 'none';
  const btnImport = document.getElementById('btnImport');
  if (btnImport) btnImport.style.display = isAdminOrOplead ? '' : 'none';
  // Report: teamlead+
  const btnReport = document.getElementById('btnReport');
  if (btnReport) btnReport.style.display = isTeamLead ? '' : 'none';

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
  document.getElementById('btnCenterToday').addEventListener('click', centerToday);
  document.getElementById('btnAddEvent').addEventListener('click', () => openEventModal(null));
  document.getElementById('btnExport').addEventListener('click', openExportModal);
  document.getElementById('btnImport')?.addEventListener('click', openImportModal);
  document.getElementById('btnTemplates')?.addEventListener('click', openTemplatesModal);
  document.getElementById('btnLayerToggle').addEventListener('click', e => openLayerPopover(e.currentTarget));
  document.getElementById('searchInput').addEventListener('input', e => {
    state.search = e.target.value;
    renderTimeline();
  });

  // Close layer popover and nav jump menu when clicking outside
  document.addEventListener('click', e => {
    const pop = document.getElementById('layerPopover');
    if (pop && pop.style.display !== 'none' &&
        !pop.contains(e.target) && e.target.id !== 'btnLayerToggle') {
      pop.style.display = 'none';
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

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Auto-refresh
  setInterval(refreshAll, 60000);
  setInterval(() => updateCurrentTimeLine(getDays(), getSlotHeight()), 30000);

  // SSE
  connectSSE();

  // Browser notifications
  if (Notification.permission === 'default') Notification.requestPermission();

  // Initial data load
  await refreshAll();

  // Set up interactions
  setupZoomDrag();
  setupDragToReschedule();
  setupKeyboardShortcuts();
  setupHorizontalDrag();

  // Change password button
  const btnChgPw = document.getElementById('btnChangePassword');
  if (btnChgPw) {
    btnChgPw.addEventListener('click', () => {
      ['pwdCurrent','pwdNew','pwdConfirm'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      openModal('passwordModal');
    });
  }

  // Pre-fill report date range
  const reportFrom = document.getElementById('reportFrom');
  const reportTo   = document.getElementById('reportTo');
  if (reportFrom) reportFrom.value = fmtDateInput(state.startDate);
  if (reportTo)   reportTo.value   = fmtDateInput(getViewEnd());

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
