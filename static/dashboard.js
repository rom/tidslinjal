/* ── Dashboard ─────────────────────────────────────────────────────────────── */
'use strict';

// Default widget configuration
const _dashboardDefaults = [
  { id: 'clock',            title: 'Clock',                          enabled: true, order: 0 },
  { id: 'urgent_requests',  title: 'Urgent Requests from TeamLeads', enabled: true, order: 1 },
  { id: 'online_users',     title: 'Currently Logged In Users',      enabled: true, order: 2 },
  { id: 'recent_audit',     title: 'Recent Audit Events',            enabled: true, order: 3, config: { count: 5 } },
  { id: 'ongoing',          title: 'Ongoing Activities',             enabled: true, order: 4 },
  { id: 'summary',          title: 'System Summary',                 enabled: true, order: 5 },
  { id: 'board_summary',    title: 'Board Summary',                  enabled: true, order: 6 },
  { id: 'recent_decisions', title: 'Recent Decisions',               enabled: true, order: 7 },
  { id: 'integrations',     title: 'Active Integrations',            enabled: false, order: 8 },
];

let _dashboardData = null;
let _dashboardRefreshTimer = null;
let _dashboardClockTimer = null;

function _getDashboardConfig() {
  try {
    const saved = localStorage.getItem('dashboard_config');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return _dashboardDefaults.map(w => ({...w}));
}

function _saveDashboardConfig(config) {
  try { localStorage.setItem('dashboard_config', JSON.stringify(config)); } catch { /* ignore */ }
}

function _closeDashboard() {
  if (_dashboardRefreshTimer) clearInterval(_dashboardRefreshTimer);
  if (_dashboardClockTimer) clearInterval(_dashboardClockTimer);
  document.getElementById('dashboardModal')?.remove();
}

function _closeDashConfig() {
  document.getElementById('dashConfigModal')?.remove();
}

async function openDashboard() {
  const config = _getDashboardConfig();

  let html = `<div style="max-width:900px;width:95vw">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="margin:0">📊 Dashboard</h2>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-secondary" data-action="_dashboardConfigure" title="Configure widgets">⚙ Customize</button>
        <button class="btn btn-sm btn-secondary" data-action="_dashboardRefresh" title="Refresh data">↻ Refresh</button>
      </div>
    </div>
    <div id="dashboardWidgets" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim)">Loading dashboard data...</div>
    </div>
  </div>`;

  // Use the generic modal system
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'dashboardModal';
  overlay.innerHTML = `<div class="modal" style="max-width:920px;width:95vw;max-height:90vh;overflow-y:auto">
    <div class="modal-header"><h2>📊 ${t('dashboard_title')||'Situational Overview'}</h2>
      <button class="modal-close" data-action="_closeDashboard">✕</button>
    </div>
    <div class="modal-body" style="padding:12px">
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px">
        <button class="btn btn-sm btn-secondary" data-action="_dashboardConfigure">⚙ Customize</button>
        <button class="btn btn-sm btn-secondary" data-action="_dashboardRefresh">↻ Refresh</button>
      </div>
      <div id="dashboardWidgets" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  if (typeof _bindActions === 'function') _bindActions(overlay);

  // Fetch data and render
  await _dashboardRefresh();

  // Auto-refresh every 30s
  if (_dashboardRefreshTimer) clearInterval(_dashboardRefreshTimer);
  _dashboardRefreshTimer = setInterval(() => {
    if (!document.getElementById('dashboardModal')) {
      clearInterval(_dashboardRefreshTimer);
      return;
    }
    _dashboardRefresh();
  }, 10000);

  // Live clock update every second
  _dashboardClockTimer = setInterval(_updateDashboardClock, 1000);
}

async function _dashboardRefresh() {
  try {
    _dashboardData = await apiGet('/api/dashboard');
    _renderDashboardWidgets();
  } catch (e) {
    const el = document.getElementById('dashboardWidgets');
    if (el) el.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:var(--danger)">Failed to load dashboard data: ${escHtml(e.message)}</div>`;
  }
}

function _renderDashboardWidgets() {
  const container = document.getElementById('dashboardWidgets');
  if (!container || !_dashboardData) return;
  const config = _getDashboardConfig().filter(w => w.enabled).sort((a,b) => a.order - b.order);
  const d = _dashboardData;

  let html = '';
  for (const widget of config) {
    html += `<div class="dashboard-widget" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px;${widget.id === 'summary' ? '' : ''}">`;
    switch (widget.id) {
      case 'urgent_requests':
        html += _renderUrgentRequests(d.urgent_requests || []);
        break;
      case 'online_users':
        html += _renderOnlineUsers(d.online_users || []);
        break;
      case 'recent_audit':
        html += _renderRecentAudit(d.recent_audit || [], widget.config?.count || 5);
        break;
      case 'integrations':
        html += _renderIntegrations(d.active_integrations || []);
        break;
      case 'ongoing':
        html += _renderOngoing(d.open_polls || [], d.active_ready_checks || []);
        break;
      case 'summary':
        html += _renderSummary(d.stats || {});
        break;
      case 'clock':
        html += _renderDashboardClock();
        break;
      case 'board_summary':
        html += _renderBoardSummary(d.board_summary || {});
        break;
      case 'recent_decisions':
        html += _renderRecentDecisions(d.recent_decisions || []);
        break;
      default:
        html += `<div style="color:var(--text-dim)">Unknown widget: ${escHtml(widget.id)}</div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function _renderUrgentRequests(requests) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:#E74C3C">🚨 Urgent Requests from TeamLeads</div>`;
  if (!requests.length) {
    h += '<div style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px 0">No urgent requests in the last 24 hours</div>';
    return h;
  }
  for (const r of requests) {
    const time = new Date(r.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
    const icon = r.action === 'quick_response' ? '🚨' : '⚡';
    h += `<div style="font-size:var(--fs-xs);padding:4px 6px;margin-bottom:3px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid #E74C3C">
      <span style="color:var(--text-dim)">${time}</span> ${icon}
      <strong>${escHtml(r.user_name)}</strong>: ${escHtml(r.summary)}
    </div>`;
  }
  return h;
}

function _renderOnlineUsers(users) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:var(--accent)">👥 Currently Logged In (${users.length})</div>`;
  if (!users.length) {
    h += '<div style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px 0">No users currently connected</div>';
    return h;
  }
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  for (const u of users) {
    const roleColor = {admin:'#E74C3C',oplead:'#E67E22',deputy_oplead:'#E67E22',teamlead:'#3498DB',deputy_teamlead:'#3498DB'}[u.role] || 'var(--text-dim)';
    h += `<div style="font-size:var(--fs-xs);padding:3px 8px;background:var(--bg2);border-radius:12px;border:1px solid ${roleColor}40;display:flex;align-items:center;gap:4px">
      <span style="width:6px;height:6px;border-radius:50%;background:#2ecc71;display:inline-block"></span>
      <strong>${escHtml(u.display_name || u.username)}</strong>
      <span style="color:${roleColor};font-size:9px">${escHtml(String(u.role||''))}</span>
    </div>`;
  }
  h += '</div>';
  return h;
}

function _renderRecentAudit(entries, count) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:var(--accent)">📝 Recent Audit Events</div>`;
  const shown = entries.slice(0, count);
  if (!shown.length) {
    h += '<div style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px 0">No recent audit events</div>';
    return h;
  }
  for (const a of shown) {
    const time = new Date(a.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
    h += `<div style="font-size:var(--fs-xs);padding:3px 6px;margin-bottom:2px;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-dim)">${time}</span>
      <strong>${escHtml(a.user_name)}</strong>
      <span style="color:var(--accent)">${escHtml(a.action)}</span>
      ${a.summary ? `<span style="color:var(--text-dim)">— ${escHtml(a.summary).substring(0, 80)}</span>` : ''}
    </div>`;
  }
  return h;
}

function _renderIntegrations(integrations) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:var(--accent)">🔌 Active Integrations (${integrations.length})</div>`;
  if (!integrations.length) {
    h += '<div style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px 0">No active integrations</div>';
    return h;
  }
  for (const i of integrations) {
    const typeIcon = {mail:'📧',syslog:'📋',webhook:'🔗',connector:'⚡'}[i.type] || '🔌';
    h += `<div style="font-size:var(--fs-xs);padding:3px 6px;margin-bottom:2px;display:flex;align-items:center;gap:6px">
      <span>${typeIcon}</span>
      <strong>${escHtml(i.name)}</strong>
      <span style="color:#2ecc71;font-size:9px">● active</span>
    </div>`;
  }
  return h;
}

function _renderOngoing(polls, readyChecks) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:var(--accent)">📋 Ongoing Activities</div>`;
  let hasItems = false;
  if (polls.length) {
    hasItems = true;
    h += '<div style="font-size:var(--fs-xs);font-weight:600;margin-bottom:4px;color:var(--text-dim)">Open Polls:</div>';
    for (const p of polls) {
      const time = new Date(p.created_at).toLocaleString();
      h += `<div style="font-size:var(--fs-xs);padding:3px 6px;margin-bottom:2px;background:var(--bg2);border-radius:var(--radius)">
        📊 <strong>${escHtml(p.title)}</strong>
        <span style="color:var(--text-dim)">by ${escHtml(p.created_by_name)} — ${p.response_count} responses</span>
      </div>`;
    }
  }
  if (readyChecks.length) {
    hasItems = true;
    h += '<div style="font-size:var(--fs-xs);font-weight:600;margin:6px 0 4px;color:var(--text-dim)">Person Ready Checks:</div>';
    for (const rc of readyChecks) {
      h += `<div style="font-size:var(--fs-xs);padding:3px 6px;margin-bottom:2px;background:var(--bg2);border-radius:var(--radius)">
        🙋 <strong>${escHtml(rc.message || 'Ready Check')}</strong>
        <span style="color:var(--text-dim)">by ${escHtml(rc.created_by_name)} — ${rc.responded}/${rc.total} responded</span>
      </div>`;
    }
  }
  if (!hasItems) {
    h += '<div style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px 0">No ongoing polls or ready checks</div>';
  }
  return h;
}

function _renderSummary(stats) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:var(--accent)">📈 System Summary</div>`;
  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div style="text-align:center;padding:10px;background:var(--bg2);border-radius:var(--radius)">
      <div style="font-size:24px;font-weight:700;color:var(--accent)">${stats.online_users || 0}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim)">Users Online</div>
    </div>
    <div style="text-align:center;padding:10px;background:var(--bg2);border-radius:var(--radius)">
      <div style="font-size:24px;font-weight:700;color:var(--accent)">${stats.active_events || 0}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim)">Active Events</div>
    </div>
    <div style="text-align:center;padding:10px;background:var(--bg2);border-radius:var(--radius)">
      <div style="font-size:24px;font-weight:700;color:${(stats.pending_decisions||0) > 0 ? '#E67E22' : 'var(--accent)'}">${stats.pending_decisions || 0}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim)">Pending Decisions</div>
    </div>
    <div style="text-align:center;padding:10px;background:var(--bg2);border-radius:var(--radius)">
      <div style="font-size:24px;font-weight:700;color:var(--accent)">${stats.open_polls || 0}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim)">Open Polls</div>
    </div>
  </div>`;
  return h;
}

function _renderDashboardClock() {
  const now = new Date();
  const localTime = now.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const utcTime = now.toUTCString().slice(17, 25);
  const dateStr = now.toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
  let h = `<div style="text-align:center;padding:8px 0">
    <div style="font-weight:700;margin-bottom:6px;color:var(--accent)">🕐 ${t('dashboard_clock')||'Clock'}</div>
    <div id="dashClockLocal" style="font-size:32px;font-weight:700;font-family:monospace;color:var(--text-bright);letter-spacing:2px">${localTime}</div>
    <div id="dashClockDate" style="font-size:var(--fs-sm);color:var(--text-dim);margin-top:2px">${dateStr}</div>
    <div id="dashClockUTC" style="font-size:var(--fs-sm);font-family:monospace;color:var(--text-dim);margin-top:4px">UTC: ${utcTime}</div>
  </div>`;
  return h;
}

function _updateDashboardClock() {
  const localEl = document.getElementById('dashClockLocal');
  const utcEl = document.getElementById('dashClockUTC');
  const dateEl = document.getElementById('dashClockDate');
  if (!localEl) return;
  const now = new Date();
  localEl.textContent = now.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if (utcEl) utcEl.textContent = 'UTC: ' + now.toUTCString().slice(17, 25);
  if (dateEl) dateEl.textContent = now.toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
}

function _renderBoardSummary(summary) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:var(--accent)">📌 ${t('dashboard_boards')||'Board Summary'}</div>`;
  const boards = summary.boards || [];
  if (!boards.length) {
    h += '<div style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px 0">No boards available</div>';
    return h;
  }
  for (const b of boards.slice(0, 5)) {
    h += `<div style="font-size:var(--fs-xs);padding:4px 6px;margin-bottom:3px;background:var(--bg2);border-radius:var(--radius);display:flex;justify-content:space-between;align-items:center">
      <strong>${escHtml(b.name)}</strong>
      <span style="color:var(--text-dim)">${b.item_count||0} items${b.overdue_count ? ` · <span style="color:var(--danger)">${b.overdue_count} overdue</span>` : ''}</span>
    </div>`;
  }
  return h;
}

function _renderRecentDecisions(decisions) {
  let h = `<div style="font-weight:700;margin-bottom:8px;color:var(--accent)">⚖ ${t('dashboard_decisions')||'Recent Decisions'}</div>`;
  if (!decisions.length) {
    h += '<div style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px 0">No recent decisions</div>';
    return h;
  }
  for (const d of decisions.slice(0, 5)) {
    const time = d.created_at ? new Date(d.created_at).toLocaleString() : '';
    h += `<div style="font-size:var(--fs-xs);padding:4px 6px;margin-bottom:3px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid var(--accent)">
      <div style="display:flex;justify-content:space-between"><strong>${escHtml(d.title || d.sequence_number || '')}</strong><span style="color:var(--text-dim)">${time}</span></div>
      ${d.decision ? `<div style="color:var(--text-dim);margin-top:2px">${escHtml(d.decision).substring(0, 100)}</div>` : ''}
    </div>`;
  }
  return h;
}

// ── Dashboard configuration ──
function _dashboardConfigure() {
  const config = _getDashboardConfig();
  let html = `<div style="max-width:480px">
    <h3 style="margin-bottom:12px">Customize Dashboard</h3>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">Toggle widgets on/off and set the number of audit events to show.</p>
    <div id="dashConfigList" style="display:flex;flex-direction:column;gap:6px">`;
  for (const w of config.sort((a,b) => a.order - b.order)) {
    html += `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);cursor:pointer;font-size:var(--fs-sm)">
      <input type="checkbox" class="dashWidgetToggle" data-widget-id="${w.id}" ${w.enabled?'checked':''}
        style="width:16px;height:16px;accent-color:var(--accent)">
      <span style="flex:1">${escHtml(w.title)}</span>
      ${w.id === 'recent_audit' ? `<label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">Show: <input type="number" id="dashAuditCount" min="1" max="20" value="${w.config?.count||5}" style="width:40px;padding:2px 4px;font-size:var(--fs-xs);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"> entries</label>` : ''}
    </label>`;
  }
  html += `</div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:10px">
      <button class="btn btn-primary" data-action="_dashboardSaveConfig">Save</button>
      <button class="btn btn-secondary" data-action="_closeDashConfig">Cancel</button>
    </div>
  </div>`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'dashConfigModal';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `<div class="modal" style="max-width:500px">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  if (typeof _bindActions === 'function') _bindActions(overlay);
}

function _dashboardSaveConfig() {
  const config = _getDashboardConfig();
  document.querySelectorAll('.dashWidgetToggle').forEach(cb => {
    const w = config.find(c => c.id === cb.dataset.widgetId);
    if (w) w.enabled = cb.checked;
  });
  const auditCount = document.getElementById('dashAuditCount');
  if (auditCount) {
    const w = config.find(c => c.id === 'recent_audit');
    if (w) {
      if (!w.config) w.config = {};
      w.config.count = parseInt(auditCount.value) || 5;
    }
  }
  _saveDashboardConfig(config);
  document.getElementById('dashConfigModal')?.remove();
  _renderDashboardWidgets();
}
