/* ── Analysis Modal ── */
// ── Analysis Modal ──────────────────────────────────────────────────────────
let _analysisPopout = null;
let _analysisCache = {};
let _analysisActiveTab = 'overview';

async function openAnalysisModal() {
  const html = `
    <div class="modal-overlay" id="analysisModal">
      <div class="modal" style="max-width:1280px;width:96vw;max-height:94vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>${t('analysis_title')||'Analysis'}</h2>
          <div style="display:flex;gap:6px;margin-left:auto;margin-right:8px">
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="detachAnalysis" title="${t('detach_window')||'Detach'}">&#x29C9;</button>
            <select id="analysisExportFmt" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:2px 4px;font-size:11px">
              <option value="csv">CSV</option><option value="json">JSON</option>
            </select>
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="exportAnalysis" title="${t('btn_export')||'Export'}">&#x2B07; ${t('btn_export')||'Export'}</button>
          </div>
          <button class="modal-close" data-action="closeAnalysisModal">&#x2715;</button>
        </div>
        <div style="padding:8px 12px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--border)">
          <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
            ${t('analysis_name')||'Name'}: <input type="text" id="analysisName" value="${escHtml((state.exercise && state.exercise.label) || '')}" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs);width:140px" placeholder="${t('analysis_name_placeholder')||'Analysis name'}">
          </label>
          <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
            ${t('from')||'From'}: <input type="date" id="analysisFrom" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          </label>
          <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
            ${t('to')||'To'}: <input type="date" id="analysisTo" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          </label>
          <button class="btn btn-sm btn-primary" data-action="refreshAnalysis" style="font-size:11px;padding:2px 8px">${t('btn_refresh')||'Refresh'}</button>
          <div style="flex:1"></div>
          <div id="analysisTabBar" style="display:flex;gap:0">
            <button class="btn btn-sm analysisTab active" data-tab="overview" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_overview')||'Overview'}</button>
            <button class="btn btn-sm analysisTab" data-tab="activity" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_activity')||'Activity'}</button>
            <button class="btn btn-sm analysisTab" data-tab="optempo" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_optempo')||'OpTempo'}</button>
            <button class="btn btn-sm analysisTab" data-tab="decisions" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_decisions')||'Decisions'}</button>
            <button class="btn btn-sm analysisTab" data-tab="dependencies" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_dependencies')||'Dependencies'}</button>
            ${state.user && hasRole2(state.user.role, 'oplead') ? `<button class="btn btn-sm analysisTab" data-tab="leadership" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_leadership')||'Leadership'}</button>` : ''}
            <button class="btn btn-sm analysisTab" data-tab="jstaff" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_jstaff')||'J-Staff'}</button>
            <button class="btn btn-sm analysisTab" data-tab="teamleads" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_teamleads')||'TeamLeads'}</button>
            <button class="btn btn-sm analysisTab" data-tab="opsleads" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_opsleads')||'OpsLeads'}</button>
            <button class="btn btn-sm analysisTab" data-tab="teammembers" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_teammembers')||'Team Members'}</button>
            <button class="btn btn-sm analysisTab" data-tab="polls" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_polls')||'Polls'}</button>
            <button class="btn btn-sm analysisTab" data-tab="boards" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_boards')||'Boards'}</button>
            <button class="btn btn-sm analysisTab" data-tab="usage" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_usage')||'Usage'}</button>
            <button class="btn btn-sm analysisTab" data-tab="export" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_export')||'Export'}</button>
          </div>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px" id="analysisContent">
          <div style="text-align:center;padding:40px;color:var(--text-dim)">${t('loading')||'Loading...'}</div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('analysisModal');
  void modal.offsetHeight;
  modal.classList.add('open');
  _bindActions(modal);

  // Tab switching
  modal.querySelectorAll('.analysisTab').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.analysisTab').forEach(b => { b.classList.remove('active'); b.style.background = ''; b.style.color = ''; });
      btn.classList.add('active');
      btn.style.background = 'var(--accent)'; btn.style.color = '#fff';
      _analysisActiveTab = btn.dataset.tab;
      _loadAnalysisTab(btn.dataset.tab);
    });
  });
  // style active tab
  const activeBtn = modal.querySelector('.analysisTab.active');
  if (activeBtn) { activeBtn.style.background = 'var(--accent)'; activeBtn.style.color = '#fff'; }

  // Set default from/to dates from exercise settings (epoch/endex)
  const fromEl = document.getElementById('analysisFrom');
  const toEl = document.getElementById('analysisTo');
  if (state.exercise) {
    if (state.exercise.epoch && fromEl && !fromEl.value) {
      try { fromEl.value = new Date(state.exercise.epoch).toISOString().slice(0, 10); } catch(e) {}
    }
    if (state.exercise.endex && toEl && !toEl.value) {
      try { toEl.value = new Date(state.exercise.endex).toISOString().slice(0, 10); } catch(e) {}
    }
  }

  _analysisCache = {};
  _analysisActiveTab = 'overview';
  await _loadAnalysisTab('overview');
}

function _analysisDateParams() {
  const from = document.getElementById('analysisFrom')?.value || '';
  const to = document.getElementById('analysisTo')?.value || '';
  let qs = '';
  if (from) qs += (qs ? '&' : '?') + 'from=' + encodeURIComponent(from);
  if (to) qs += (qs ? '&' : '?') + 'to=' + encodeURIComponent(to);
  return qs;
}

function _analysisCard(value, label, color) {
  return `<div style="padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);text-align:center">
    <div style="font-size:24px;font-weight:700;color:${color || 'var(--accent)'}">${escHtml(String(value))}</div>
    <div style="font-size:var(--fs-xs);color:var(--text)">${escHtml(label)}</div>
  </div>`;
}

async function _loadAnalysisTab(tab) {
  const container = document.getElementById('analysisContent');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-dim)">${t('loading')||'Loading...'}</div>`;

  try {
    switch(tab) {
      case 'overview': await _renderOverviewTab(container); break;
      case 'activity': await _renderActivityTab(container); break;
      case 'optempo': await _renderOpTempoTab(container); break;
      case 'decisions': await _renderDecisionsTab(container); break;
      case 'dependencies': await _renderDependenciesTab(container); break;
      case 'leadership': await _renderLeadershipTab(container); break;
      case 'jstaff': await _renderJStaffTab(container); break;
      case 'teamleads': await _renderTeamLeadsTab(container); break;
      case 'opsleads': await _renderOpsLeadsTab(container); break;
      case 'teammembers': await _renderTeamMembersTab(container); break;
      case 'polls': await _renderPollsAnalysisTab(container); break;
      case 'boards': await _renderBoardsAnalysisTab(container); break;
      case 'usage': await _renderUsageTab(container); break;
      case 'export': _renderExportTab(container); break;
    }
  } catch(e) {
    console.warn('Analysis tab error', tab, e);
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#E74C3C">${t('error')||'Error'}: ${escHtml(e.message||String(e))}</div>`;
  }
}

/* ── Overview Tab ──────────────────────────────────────────────────────────── */
async function _renderOverviewTab(container) {
  const qs = _analysisDateParams();
  const [overview, evStatus, evType, workload] = await Promise.all([
    _analysisFetch('/api/stats/overview' + qs),
    _analysisFetch('/api/stats/events/status' + qs),
    _analysisFetch('/api/stats/events/type' + qs),
    _analysisFetch('/api/stats/users/workload' + qs),
  ]);

  const statusLabels = Object.keys(evStatus || {});
  const statusData = Object.values(evStatus || {});
  const statusColors = statusLabels.map(k => ({planned:'#3498DB',active:'#E67E22',completed:'#27AE60',cancelled:'#95A5A6',verified:'#2ECC71',rejected:'#E74C3C'}[k] || '#9B59B6'));

  const typeEntries = Object.entries(evType || {}).sort((a,b) => b[1] - a[1]);
  const typeLabels = typeEntries.map(e => e[0]);
  const typeData = typeEntries.map(e => e[1]);

  const wlEntries = Object.entries(workload || {}).sort((a,b) => (b[1].total||0) - (a[1].total||0)).slice(0, 15);
  const wlLabels = wlEntries.map(e => e[0]);
  const wlData = wlEntries.map(e => e[1].total || 0);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(overview?.total_events||0, t('total_events')||'Total Events', 'var(--accent)')}
      ${_analysisCard(overview?.total_users||0, t('total_users')||'Total Users', 'var(--accent)')}
      ${_analysisCard(overview?.active_alarms||0, t('active_alarms')||'Active Alarms', '#E67E22')}
      ${_analysisCard(overview?.pending_decisions||0, t('pending_decisions')||'Pending Decisions', '#E67E22')}
      ${_analysisCard(overview?.approved_decisions||0, t('approved_decisions')||'Approved', '#27AE60')}
      ${_analysisCard(overview?.denied_decisions||0, t('denied_decisions')||'Denied', '#E74C3C')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_status_dist')||'Event Status Distribution'}</div>
        <canvas id="anlPieStatus" height="220"></canvas>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_type_breakdown')||'Event Type Breakdown'}</div>
        <canvas id="anlBarType" height="${Math.max(180, typeLabels.length * 22 + 20)}"></canvas>
      </div>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_workload')||'User Workload (Top 15)'}</div>
      <canvas id="anlBarWorkload" height="${Math.max(180, wlLabels.length * 22 + 20)}"></canvas>
    </div>`;

  requestAnimationFrame(() => {
    if (statusLabels.length) drawPieChart('anlPieStatus', statusLabels, statusData, statusColors);
    if (typeLabels.length) drawBarChart('anlBarType', typeLabels, typeData, { horizontal: true });
    if (wlLabels.length) drawBarChart('anlBarWorkload', wlLabels, wlData, { horizontal: true, colors: '#2980B9' });
  });
}

/* ── Activity Tab ──────────────────────────────────────────────────────────── */
async function _renderActivityTab(container) {
  const qs = _analysisDateParams();
  const [heatmap, timeline] = await Promise.all([
    _analysisFetch('/api/stats/events/heatmap' + qs),
    _analysisFetch('/api/stats/events/timeline' + qs).catch(() => null),
  ]);

  const hmData = heatmap?.data || [];
  const hmDays = heatmap?.days || ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const hmHours = Array.from({length:24}, (_, i) => String(i).padStart(2,'0'));

  // Timeline endpoint returns {date: count} object — convert to sorted arrays
  let tlLabels = [], tlData = [];
  if (timeline && typeof timeline === 'object' && !Array.isArray(timeline)) {
    if (timeline.labels) { tlLabels = timeline.labels; tlData = timeline.data || []; }
    else { const sorted = Object.entries(timeline).sort((a,b) => a[0].localeCompare(b[0])); tlLabels = sorted.map(e => e[0]); tlData = sorted.map(e => e[1]); }
  }

  container.innerHTML = `
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_heatmap')||'Activity Heatmap (Day x Hour)'}</div>
      <canvas id="anlHeatmap" height="${Math.max(200, hmDays.length * 28 + 30)}"></canvas>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_events_timeline')||'Events Over Time'}</div>
      <canvas id="anlAreaTimeline" height="250"></canvas>
    </div>`;

  setTimeout(() => {
    if (hmData.length) {
      drawHeatmap('anlHeatmap', hmDays, hmHours, hmData, { colorHigh: '#3498DB' });
    }
    if (tlLabels.length) {
      drawAreaChart('anlAreaTimeline', tlLabels, tlData, { color: '#3498DB' });
    }
  }, 50);
}

/* ── Decisions Tab ─────────────────────────────────────────────────────────── */
async function _renderDecisionsTab(container) {
  const qs = _analysisDateParams();
  const analytics = await _analysisFetch('/api/stats/decision-analytics' + qs).catch(() => ({})) || {};

  const byStatus = analytics.decisions_by_type || analytics.by_status || {};
  const outcomeLabels = Object.keys(byStatus).filter(k => byStatus[k] > 0).map(k => k === 'rejected' ? 'Denied' : k.charAt(0).toUpperCase() + k.slice(1));
  const outcomeData = Object.keys(byStatus).filter(k => byStatus[k] > 0).map(k => byStatus[k]);
  const outcomeColors = Object.keys(byStatus).filter(k => byStatus[k] > 0).map(k => ({approved:'#27AE60',rejected:'#E74C3C',pending:'#E67E22',denied:'#E74C3C',requested:'#9B59B6',direct:'#3498DB'}[k] || '#9B59B6'));

  const avgMin = analytics.avg_approval_time_minutes || analytics.average_response_ms ? ((analytics.average_response_ms||0) / 60000) : 0;
  const avgResponse = avgMin ? avgMin.toFixed(1) + ' min' : 'N/A';

  // top_requesters is [{name, count}] — convert to chart-friendly format
  const topReq = analytics.top_requesters || [];
  const reqLabels = topReq.length ? topReq.map(r => r.name) : Object.keys(analytics.per_requester || {});
  const reqData = topReq.length ? topReq.map(r => r.count) : Object.values(analytics.per_requester || {});

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_approval_rate')||'Approval Rate'}</div>
        <canvas id="anlPieDecisions" height="250"></canvas>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);display:flex;flex-direction:column;justify-content:center;align-items:center">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('avg_response_time')||'Avg Response Time'}</div>
        <div style="font-size:36px;font-weight:700;color:var(--accent)">${escHtml(avgResponse)}</div>
      </div>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_per_requester')||'Decisions Per Requester'}</div>
      <canvas id="anlBarRequester" height="${Math.max(250, reqLabels.length * 22 + 20)}"></canvas>
    </div>`;

  setTimeout(() => {
    if (outcomeLabels.length) drawPieChart('anlPieDecisions', outcomeLabels, outcomeData, outcomeColors);
    if (reqLabels.length) drawBarChart('anlBarRequester', reqLabels, reqData, { horizontal: true, maxBarWidth: 28 });
  }, 50);
}

/* ── OpTempo Tab ───────────────────────────────────────────────────────────── */
async function _renderOpTempoTab(container) {
  const qs = _analysisDateParams();
  const [opTempo, slipHist] = await Promise.all([
    _analysisFetch('/api/stats/op-tempo' + qs).catch(() => null),
    _analysisFetch('/api/stats/slip-histogram' + qs).catch(() => null),
  ]);

  // Op-tempo endpoint returns {events_per_hour: {"00": n, ...}} — convert to sorted arrays
  let tempoLabels = [], tempoDatasets = [];
  if (opTempo?.events_per_hour && typeof opTempo.events_per_hour === 'object') {
    const sorted = Object.entries(opTempo.events_per_hour).sort((a,b) => a[0].localeCompare(b[0]));
    tempoLabels = sorted.map(e => e[0] + ':00');
    tempoDatasets.push({data: sorted.map(e => e[1]), color: '#3498DB', label: t('op_tempo')||'Events/Hour'});
  } else if (opTempo?.labels) {
    tempoLabels = opTempo.labels;
    if (opTempo.datasets) opTempo.datasets.forEach(ds => tempoDatasets.push({data: ds.data||[], color: ds.color||'#3498DB', label: ds.label||''}));
    else if (opTempo.data) tempoDatasets.push({data: opTempo.data, color: '#3498DB', label: t('op_tempo')||'Op Tempo'});
  }

  // Slip histogram: backend returns {buckets: {key: val}} — convert to arrays
  let slipBuckets = [], slipValues = [];
  if (slipHist?.buckets && typeof slipHist.buckets === 'object' && !Array.isArray(slipHist.buckets)) {
    slipBuckets = Object.keys(slipHist.buckets);
    slipValues = Object.values(slipHist.buckets);
  } else if (Array.isArray(slipHist?.labels)) {
    slipBuckets = slipHist.labels; slipValues = slipHist.data || [];
  }

  const concPeak = opTempo?.concurrent_peak || 0;
  const avgPerDay = (opTempo?.avg_events_per_day || 0).toFixed(1);
  const meanSlip = slipHist?.mean_slip_minutes ? slipHist.mean_slip_minutes.toFixed(1) + 'm' : '—';
  const medianSlip = slipHist?.median_slip_minutes ? slipHist.median_slip_minutes.toFixed(1) + 'm' : '—';

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(concPeak, t('concurrent_peak')||'Concurrent Peak', '#E67E22')}
      ${_analysisCard(avgPerDay, t('avg_events_day')||'Avg Events/Day', 'var(--accent)')}
      ${_analysisCard(meanSlip, t('mean_slip')||'Mean Slip', '#E74C3C')}
      ${_analysisCard(medianSlip, t('median_slip')||'Median Slip', '#E67E22')}
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_optempo')||'Operational Tempo (Events per Hour, Last 24h)'}</div>
      <canvas id="anlLineOpTempo" height="250"></canvas>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_slip_histogram')||'Slip / Delay Histogram'}</div>
      <canvas id="anlHistSlip" height="250"></canvas>
    </div>`;

  setTimeout(() => {
    if (tempoLabels.length && tempoDatasets.length) {
      drawLineChart('anlLineOpTempo', tempoLabels, tempoDatasets, { showArea: true, showPoints: true });
    }
    if (slipBuckets.length) {
      drawHistogram('anlHistSlip', slipBuckets, slipValues, { color: '#E67E22', showValues: true });
    }
  }, 50);
}

/* ── Dependencies Tab ──────────────────────────────────────────────────────── */
async function _renderDependenciesTab(container) {
  const qs = _analysisDateParams();
  const graph = await _analysisFetch('/api/stats/dependency-graph' + qs).catch(() => null);

  const nodes = (graph?.nodes || []).map(n => ({
    id: n.id, label: n.label || n.title || n.id, x: n.x, y: n.y,
    color: n.critical ? '#E74C3C' : (n.color || '#3498DB'),
    size: n.size || 10,
    _event: { status: n.status, event_type: n.type, start_time: n.start_time, description: n.description, assigned_to: n.assigned_to, layer_name: n.layer_name }
  }));
  const edges = (graph?.edges || []).map(e => ({
    from: e.from, to: e.to,
    color: e.critical ? '#E74C3C' : (e.color || 'rgba(255,255,255,0.3)'),
    critical: !!e.critical
  }));
  const stats = graph?.stats || {};

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(stats.total_nodes || nodes.length, t('total_nodes')||'Nodes', 'var(--accent)')}
      ${_analysisCard(stats.total_edges || edges.length, t('total_edges')||'Edges', 'var(--accent)')}
      ${_analysisCard(stats.longest_chain || 0, t('longest_chain')||'Longest Chain', '#E67E22')}
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('dependency_graph')||'Event Dependency Graph'}</div>
      <div style="font-size:var(--fs-xs);color:var(--text);margin-bottom:6px">${t('drag_nodes_click')||'Drag nodes to reposition. Click a node to see event details. Red = critical path.'}</div>
      <canvas id="anlNetGraph" height="400"></canvas>
    </div>`;

  requestAnimationFrame(() => {
    drawNetworkGraph('anlNetGraph', nodes, edges, { directed: true, interactive: true, nodeRadius: 10 });
  });
}

/* ── Leadership Dashboard Tab ─────────────────────────────────────────────── */
async function _renderLeadershipTab(container) {
  const data = await _analysisFetch('/api/stats/leadership-dashboard');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">No data available.</p>`; return; }

  const T = data.tempo || {};
  const R = data.readiness || {};
  const P = data.progress || {};
  const D = data.delay || {};
  const B = data.bottlenecks || {};
  const DL = data.decision_load || {};
  const I = data.impact || {};
  const C = data.confidence || {};
  const E = data.escalation || {};
  const S = data.summary || {};

  // Color helpers
  const confColor = v => v >= 75 ? '#27AE60' : v >= 50 ? '#E67E22' : '#E74C3C';
  const trendIcon = t => t === 'accelerating' ? '▲' : t === 'decelerating' ? '▼' : '●';
  const trendColor = t => t === 'accelerating' ? '#27AE60' : t === 'decelerating' ? '#E74C3C' : 'var(--text-dim)';
  const prioColor = v => v === 'critical' ? '#E74C3C' : v === 'high' ? '#E67E22' : 'var(--text-dim)';

  // Section helper
  const section = (title, icon, html) => `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">${icon} ${escHtml(title)}</div>
      ${html}
    </div>`;

  const cardRow = (...cards) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:10px">${cards.join('')}</div>`;
  const card = (val, lbl, color) => _analysisCard(val, lbl, color);

  // Build critical delays table
  let critDelayHtml = '';
  if (D.critical_delays && D.critical_delays.length) {
    critDelayHtml = `<div style="margin-top:8px;font-size:var(--fs-xs)"><div style="font-weight:600;margin-bottom:4px;color:var(--text)">Top Delays</div>` +
      D.critical_delays.map(d => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:#E74C3C;font-weight:700;min-width:60px">+${Math.round(d.slip_minutes)}m</span>
        <span>${escHtml(d.title || '#'+d.id)}</span>
      </div>`).join('') + '</div>';
  }

  // Build blocked events list
  let blockedHtml = '';
  if (B.blocked_events && B.blocked_events.length) {
    blockedHtml = `<div style="margin-top:8px;font-size:var(--fs-xs)"><div style="font-weight:600;margin-bottom:4px;color:var(--text)">Blocked Events</div>` +
      B.blocked_events.slice(0, 8).map(b => `<div style="padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:#E74C3C">⛔</span> ${escHtml(b.title)} <span style="color:var(--text-dim)">← ${escHtml(b.blocked_by_title)}</span>
      </div>`).join('') + '</div>';
  }

  // Build overloaded users list
  let overloadedHtml = '';
  if (B.overloaded_users && B.overloaded_users.length) {
    overloadedHtml = `<div style="margin-top:8px;font-size:var(--fs-xs)"><div style="font-weight:600;margin-bottom:4px;color:var(--text)">Overloaded Personnel</div>` +
      B.overloaded_users.map(u => `<div style="padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:#E67E22">⚠</span> ${escHtml(u.name)} <span style="color:var(--text-dim)">(${u.count} events)</span>
      </div>`).join('') + '</div>';
  }

  // Impact by type chart data
  const impactByType = I.events_by_type || {};
  const impactByLayer = I.events_by_layer || {};

  container.innerHTML = `
    <!-- Confidence banner -->
    <div style="display:flex;gap:12px;margin-bottom:16px;padding:16px;background:var(--bg3);border-radius:var(--radius);align-items:center;flex-wrap:wrap">
      <div style="text-align:center;min-width:100px">
        <div style="font-size:36px;font-weight:800;color:${confColor(C.overall_confidence||0)}">${Math.round(C.overall_confidence||0)}%</div>
        <div style="font-size:var(--fs-xs);color:var(--text)">${t('ld_overall_confidence')||'Overall Confidence'}</div>
      </div>
      <div style="flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">
        ${card(Math.round(C.completion_confidence||0)+'%', t('ld_completion')||'Completion', confColor(C.completion_confidence||0))}
        ${card(Math.round(C.readiness_score||0)+'%', t('ld_readiness')||'Readiness', confColor(C.readiness_score||0))}
        ${card(Math.round((C.schedule_adherence||0)*100)+'%', t('ld_on_time')||'On-Time', confColor((C.schedule_adherence||0)*100))}
      </div>
      ${S.phase_name ? `<div style="padding:6px 14px;background:var(--accent);color:#fff;border-radius:var(--radius);font-size:var(--fs-xs);font-weight:700">${escHtml(S.phase_name)}</div>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <!-- Left column -->
      <div>
        ${section(t('ld_tempo')||'Tempo', '⚡', `
          ${cardRow(
            card(T.events_last_hour||0, t('ld_last_1h')||'Last 1h'),
            card(T.events_last_4h||0, t('ld_last_4h')||'Last 4h'),
            card(T.events_last_24h||0, t('ld_last_24h')||'Last 24h'),
            card(`<span style="color:${trendColor(T.tempo_trend)}">${trendIcon(T.tempo_trend)} ${T.tempo_trend||'—'}</span>`, t('ld_trend')||'Trend')
          )}
          <div style="font-size:var(--fs-xs);color:var(--text)">${t('ld_concurrent_active')||'Concurrent active'}: <b>${T.concurrent_active||0}</b></div>
        `)}

        ${section(t('ld_progress')||'Progress', '📊', `
          ${cardRow(
            card(P.total_events||0, t('ld_total')||'Total'),
            card(P.completed_count||0, t('ld_completed')||'Completed', '#27AE60'),
            card(Math.round(P.completion_rate||0)+'%', t('ld_completion_rate')||'Rate', confColor(P.completion_rate||0))
          )}
          <canvas id="anlLdStatus" width="300" height="140"></canvas>
        `)}

        ${section(t('ld_delay')||'Delay', '⏱', `
          ${cardRow(
            card(Math.round(D.mean_slip_minutes||0)+'m', t('ld_mean_slip')||'Mean Slip', D.mean_slip_minutes > 15 ? '#E74C3C' : '#27AE60'),
            card(Math.round(D.median_slip_minutes||0)+'m', t('ld_median_slip')||'Median', D.median_slip_minutes > 15 ? '#E74C3C' : '#27AE60'),
            card(D.delayed_count||0, t('ld_delayed')||'Delayed', '#E67E22'),
            card(Math.round((D.delayed_rate||0)*100)+'%', t('ld_delayed_rate')||'Delay Rate', D.delayed_rate > 0.2 ? '#E74C3C' : '#27AE60')
          )}
          ${critDelayHtml}
        `)}

        ${section(t('ld_impact')||'Impact', '💥', `
          <canvas id="anlLdTypeChart" width="300" height="140"></canvas>
          <canvas id="anlLdLayerChart" width="300" height="140" style="margin-top:8px"></canvas>
        `)}
      </div>

      <!-- Right column -->
      <div>
        ${section(t('ld_readiness_title')||'Readiness', '✅', `
          ${cardRow(
            card(Math.round(R.latest_check_readiness||0)+'%', t('ld_latest_readiness')||'Latest Check', confColor(R.latest_check_readiness||0)),
            card(R.total_checks||0, t('ld_total_checks')||'Total Checks'),
            card(Math.round((R.avg_response_rate||0)*100)+'%', t('ld_avg_response')||'Avg Response', confColor((R.avg_response_rate||0)*100))
          )}
        `)}

        ${section(t('ld_decision_load')||'Decision Load', '⚖', `
          ${cardRow(
            card(DL.total_decisions||0, t('ld_total')||'Total'),
            card(DL.pending||0, t('ld_pending')||'Pending', DL.pending > 5 ? '#E74C3C' : '#E67E22'),
            card(DL.approved||0, t('ld_approved')||'Approved', '#27AE60'),
            card(DL.rejected||0, t('ld_rejected')||'Rejected', '#E74C3C')
          )}
          <div style="display:flex;gap:12px;font-size:var(--fs-xs);color:var(--text)">
            <span>${t('ld_last_1h')||'Last 1h'}: <b>${DL.decisions_last_hour||0}</b></span>
            <span>${t('ld_last_4h')||'Last 4h'}: <b>${DL.decisions_last_4h||0}</b></span>
            <span>${t('ld_avg_response_time')||'Avg response'}: <b>${Math.round(DL.avg_response_time_minutes||0)}m</b></span>
            <span>${t('ld_velocity')||'Velocity'}: <b>${(DL.decision_velocity||0).toFixed(1)}/h</b></span>
          </div>
        `)}

        ${section(t('ld_bottlenecks')||'Bottlenecks', '🚧', `
          ${cardRow(
            card(B.pending_decisions||0, t('ld_pending_decisions')||'Pending Dec.', B.pending_decisions > 3 ? '#E74C3C' : '#E67E22'),
            card(B.unacknowledged_alarms||0, t('ld_unack_alarms')||'Unack. Alarms', B.unacknowledged_alarms > 0 ? '#E74C3C' : '#27AE60'),
            card((B.stale_events||[]).length, t('ld_stale_events')||'Stale (>2h)', (B.stale_events||[]).length > 0 ? '#E67E22' : '#27AE60'),
            card((B.blocked_events||[]).length, t('ld_blocked')||'Blocked', (B.blocked_events||[]).length > 0 ? '#E74C3C' : '#27AE60')
          )}
          ${overloadedHtml}
          ${blockedHtml}
        `)}

        ${section(t('ld_escalation')||'Escalation', '🔺', `
          ${cardRow(
            card(E.escalated_decisions||0, t('ld_escalated')||'Escalated'),
            card(E.quick_responses||0, t('ld_quick_resp')||'Quick Resp.'),
            card(E.quick_reports||0, t('ld_quick_reports')||'Quick Reports'),
            card((E.escalation_rate||0).toFixed(1)+'/h', t('ld_esc_rate')||'Rate')
          )}
        `)}

        ${section(t('ld_summary')||'Summary', '📋', `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:var(--fs-xs);color:var(--text)">
            <div>${t('ld_active_users')||'Active users'}: <b>${S.active_users_count||0}</b></div>
            <div>${t('ld_groups')||'Groups'}: <b>${S.total_groups||0}</b></div>
            <div>${t('ld_layers')||'Layers'}: <b>${S.total_layers||0}</b></div>
            <div>${t('ld_logbook_24h')||'Logbook (24h)'}: <b>${S.logbook_entries_24h||0}</b></div>
            <div>${t('ld_locks')||'Locks'}: <b>${S.lock_count||0}</b></div>
          </div>
        `)}
      </div>
    </div>`;

  // Render charts after DOM is ready
  setTimeout(() => {
    // Status distribution pie
    const statusMap = P.events_by_status || {};
    const statusLabels = Object.keys(statusMap);
    const statusVals = Object.values(statusMap);
    const statusColors = {planned:'#4A90D9', active:'#E67E22', completed:'#27AE60', verified:'#2ECC71', responded_to:'#3498DB', submitted:'#9B59B6', rejected:'#E74C3C', cancelled:'#95A5A6'};
    if (statusLabels.length && typeof drawPieChart === 'function') {
      drawPieChart('anlLdStatus', statusLabels, statusVals, statusLabels.map(s => statusColors[s] || '#666'));
    }

    // Type breakdown bar chart
    const typeLabels = Object.keys(impactByType);
    const typeVals = Object.values(impactByType);
    if (typeLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlLdTypeChart', typeLabels, typeVals, {horizontal: true, maxBarWidth: 22});
    }

    // Layer breakdown bar chart
    const layerLabels = Object.keys(impactByLayer);
    const layerVals = Object.values(impactByLayer);
    if (layerLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlLdLayerChart', layerLabels, layerVals, {horizontal: true, maxBarWidth: 22});
    }
  }, 50);
}

/* ── Personnel Performance Helper ─────────────────────────────────────────── */
function _perfTable(users, title) {
  if (!users || !users.length) return `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`;
  const rows = users.map(u => `<tr>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border)">${escHtml(u.display_name||'')}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.total_events||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;color:#27AE60">${u.completed||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;color:#E67E22">${u.active||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.planned||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;font-weight:700;color:${u.completion_rate >= 75 ? '#27AE60' : u.completion_rate >= 50 ? '#E67E22' : '#E74C3C'}">${(u.completion_rate||0).toFixed(1)}%</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;color:${Math.abs(u.avg_slip_minutes||0) > 15 ? '#E74C3C' : 'var(--text)'}">${(u.avg_slip_minutes||0).toFixed(1)}m</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.decisions_made||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.audit_actions||0}</td>
  </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
    <thead><tr style="background:var(--bg2)">
      <th style="padding:6px 8px;text-align:left;border-bottom:2px solid var(--border)">${t('name')||'Name'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('total')||'Total'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('completed')||'Done'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('active')||'Active'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('planned')||'Planned'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('completion_rate')||'Rate'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('avg_slip')||'Avg Slip'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('decisions')||'Decisions'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('actions')||'Actions'}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ── J-Staff Performance Tab ──────────────────────────────────────────────── */
async function _renderJStaffTab(container) {
  const data = await _analysisFetch('/api/stats/personnel-performance');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const byType = data.j_staff_by_type || [];
  const individuals = data.j_staff_individual || [];

  // J-staff type summary cards
  const typeCards = byType.map(jt => _analysisCard(
    `${jt.user_count} / ${jt.total_events}`,
    `${jt.designation} (${(jt.completion_rate||0).toFixed(0)}%)`,
    jt.completion_rate >= 75 ? '#27AE60' : jt.completion_rate >= 50 ? '#E67E22' : '#E74C3C'
  )).join('');

  // Chart data for type breakdown
  const typeLabels = byType.map(jt => jt.designation);
  const typeData = byType.map(jt => jt.total_events);

  container.innerHTML = `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">⭐ ${t('jstaff_type_performance')||'J-Staff Performance by Designation'}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px">${typeCards}</div>
      <canvas id="anlJStaffTypeChart" height="${Math.max(180, typeLabels.length * 28 + 20)}"></canvas>
    </div>
    <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">👤 ${t('jstaff_individual_performance')||'Individual J-Staff Officer Performance'}</div>
      ${_perfTable(individuals)}
    </div>`;

  setTimeout(() => {
    if (typeLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlJStaffTypeChart', typeLabels, typeData, { horizontal: true, maxBarWidth: 28 });
    }
  }, 50);
}

/* ── TeamLeads Performance Tab ────────────────────────────────────────────── */
async function _renderTeamLeadsTab(container) {
  const [data, usage] = await Promise.all([
    _analysisFetch('/api/stats/personnel-performance'),
    _analysisFetch('/api/stats/usage').catch(() => null),
  ]);
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const leads = data.team_leads || [];
  const deputies = data.deputy_team_leads || [];
  const allLeads = leads.concat(deputies);

  // Aggregate by role type
  const tlTotal = leads.reduce((s,u) => s + (u.total_events||0), 0);
  const tlCompleted = leads.reduce((s,u) => s + (u.completed||0), 0);
  const dtlTotal = deputies.reduce((s,u) => s + (u.total_events||0), 0);
  const dtlCompleted = deputies.reduce((s,u) => s + (u.completed||0), 0);
  const tlRate = tlTotal > 0 ? (tlCompleted/tlTotal*100) : 0;
  const dtlRate = dtlTotal > 0 ? (dtlCompleted/dtlTotal*100) : 0;

  const chartLabels = allLeads.map(u => u.display_name);
  const chartData = allLeads.map(u => u.total_events||0);

  // Toolbox usage from usage stats
  const rc = usage?.readychecks || {};
  const cl = usage?.checklists || {};
  const po = usage?.polls || {};

  // Toolbox coverage — which tools are being used
  const toolbox = [
    { name: 'ReadyChecks', used: rc.total||0, icon: '✅' },
    { name: 'Checklists', used: cl.total||0, icon: '📋' },
    { name: 'Polls', used: po.total||0, icon: '📊' },
    { name: 'Quick Reports', used: allLeads.reduce((s,u) => s + (u.audit_actions||0), 0) > 0 ? 1 : 0, icon: '📝' },
    { name: 'Decisions', used: allLeads.reduce((s,u) => s + (u.decisions_made||0), 0), icon: '⚖' },
  ];
  const toolboxUsed = toolbox.filter(t => t.used > 0).length;
  const toolboxTotal = toolbox.length;
  const toolboxRate = toolboxTotal > 0 ? Math.round(toolboxUsed / toolboxTotal * 100) : 0;

  // Toolbox usage chart data
  const tbLabels = toolbox.map(t => t.name);
  const tbData = toolbox.map(t => t.used);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">TeamLead Performance</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${_analysisCard(leads.length, 'TeamLeads', 'var(--accent)')}
          ${_analysisCard(deputies.length, 'Deputy TeamLeads', 'var(--accent)')}
          ${_analysisCard(tlRate.toFixed(0)+'%', 'TL Completion', tlRate >= 75 ? '#27AE60' : '#E67E22')}
          ${_analysisCard(dtlRate.toFixed(0)+'%', 'DTL Completion', dtlRate >= 75 ? '#27AE60' : '#E67E22')}
        </div>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Event Distribution</div>
        <canvas id="anlTLChart" height="${Math.max(180, chartLabels.length * 22 + 20)}"></canvas>
      </div>
    </div>

    <!-- Toolbox Usage Section -->
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">TeamLead Toolbox Usage</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px">
        ${_analysisCard(toolboxRate + '%', 'Toolbox Coverage', toolboxRate >= 80 ? '#27AE60' : toolboxRate >= 50 ? '#E67E22' : '#E74C3C')}
        ${_analysisCard(rc.total||0, 'ReadyChecks', '#3498DB')}
        ${_analysisCard((rc.response_rate||0).toFixed(0)+'%', 'RC Response Rate', rc.response_rate >= 75 ? '#27AE60' : '#E67E22')}
        ${_analysisCard(cl.total||0, 'Checklists', '#9B59B6')}
        ${_analysisCard(cl.completed||0, 'CL Completed', '#27AE60')}
        ${_analysisCard(po.total||0, 'Polls', '#E67E22')}
        ${_analysisCard(po.total_responses||0, 'Poll Responses', '#1ABC9C')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <canvas id="anlTLToolbox" height="180"></canvas>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text)">
          <div style="font-weight:600;margin-bottom:6px">Toolbox Checklist</div>
          ${toolbox.map(t => `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border)">
            <span>${t.icon}</span>
            <span style="flex:1">${escHtml(t.name)}</span>
            <span style="font-weight:700;color:${t.used > 0 ? '#27AE60' : '#E74C3C'}">${t.used > 0 ? t.used + ' used' : 'Not used'}</span>
          </div>`).join('')}
          ${cl.total_items > 0 ? `<div style="margin-top:8px;color:var(--text-dim)">Checklist item completion: <b>${cl.checked_items}/${cl.total_items}</b> (${cl.total_items > 0 ? Math.round(cl.checked_items/cl.total_items*100) : 0}%)</div>` : ''}
        </div>
      </div>
    </div>

    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">Individual TeamLead & Deputy TeamLead Performance</div>
      ${_perfTable(allLeads)}
    </div>`;

  setTimeout(() => {
    if (chartLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlTLChart', chartLabels, chartData, { horizontal: true, maxBarWidth: 22 });
    }
    if (tbLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlTLToolbox', tbLabels, tbData, { horizontal: true, maxBarWidth: 28, colors: ['#3498DB','#9B59B6','#E67E22','#1ABC9C','#27AE60'] });
    }
  }, 50);
}

/* ── OpsLeads Performance Tab ─────────────────────────────────────────────── */
async function _renderOpsLeadsTab(container) {
  const data = await _analysisFetch('/api/stats/personnel-performance');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const leads = data.ops_leads || [];
  const deputies = data.deputy_ops_leads || [];
  const allLeads = leads.concat(deputies);

  const olTotal = leads.reduce((s,u) => s + (u.total_events||0), 0);
  const olCompleted = leads.reduce((s,u) => s + (u.completed||0), 0);
  const dolTotal = deputies.reduce((s,u) => s + (u.total_events||0), 0);
  const dolCompleted = deputies.reduce((s,u) => s + (u.completed||0), 0);
  const olRate = olTotal > 0 ? (olCompleted/olTotal*100) : 0;
  const dolRate = dolTotal > 0 ? (dolCompleted/dolTotal*100) : 0;

  const chartLabels = allLeads.map(u => u.display_name);
  const chartData = allLeads.map(u => u.total_events||0);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">⚙ ${t('opslead_type_perf')||'OperationsLead Performance (by type)'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${_analysisCard(leads.length, t('opsleads')||'OpsLeads', 'var(--accent)')}
          ${_analysisCard(deputies.length, t('deputy_opsleads')||'Deputy OpsLeads', 'var(--accent)')}
          ${_analysisCard(olRate.toFixed(0)+'%', t('ol_completion')||'OL Completion', olRate >= 75 ? '#27AE60' : '#E67E22')}
          ${_analysisCard(dolRate.toFixed(0)+'%', t('dol_completion')||'DOL Completion', dolRate >= 75 ? '#27AE60' : '#E67E22')}
        </div>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">📊 ${t('event_distribution')||'Event Distribution'}</div>
        <canvas id="anlOLChart" height="${Math.max(180, chartLabels.length * 22 + 20)}"></canvas>
      </div>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">👤 ${t('individual_opslead_perf')||'Individual OperationsLead & Deputy OperationsLead Performance'}</div>
      ${_perfTable(allLeads)}
    </div>`;

  setTimeout(() => {
    if (chartLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlOLChart', chartLabels, chartData, { horizontal: true, maxBarWidth: 22 });
    }
  }, 50);
}

/* ── Team Members Performance Tab ─────────────────────────────────────────── */
async function _renderTeamMembersTab(container) {
  const data = await _analysisFetch('/api/stats/personnel-performance');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const members = data.team_members || [];

  const chartLabels = members.slice(0, 20).map(u => u.display_name);
  const chartData = members.slice(0, 20).map(u => u.total_events||0);

  const totalEvents = members.reduce((s,u) => s + (u.total_events||0), 0);
  const totalCompleted = members.reduce((s,u) => s + (u.completed||0), 0);
  const overallRate = totalEvents > 0 ? (totalCompleted/totalEvents*100) : 0;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(members.length, t('total_members')||'Team Members', 'var(--accent)')}
      ${_analysisCard(totalEvents, t('total_events')||'Total Events', 'var(--accent)')}
      ${_analysisCard(totalCompleted, t('completed')||'Completed', '#27AE60')}
      ${_analysisCard(overallRate.toFixed(0)+'%', t('overall_completion')||'Overall Completion', overallRate >= 75 ? '#27AE60' : '#E67E22')}
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">📊 ${t('member_workload')||'Member Workload (Top 20)'}</div>
      <canvas id="anlMemberChart" height="${Math.max(180, chartLabels.length * 22 + 20)}"></canvas>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">👤 ${t('individual_member_perf')||'Individual Team Member Performance'}</div>
      ${_perfTable(members)}
    </div>`;

  setTimeout(() => {
    if (chartLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlMemberChart', chartLabels, chartData, { horizontal: true, colors: '#2980B9', maxBarWidth: 22 });
    }
  }, 50);
}

/* ── Usage Tab ─────────────────────────────────────────────────────────────── */
async function _renderUsageTab(container) {
  const data = await _analysisFetch('/api/stats/usage');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">No data available.</p>`; return; }

  const rc = data.readychecks || {};
  const cl = data.checklists || {};
  const po = data.polls || {};

  // Logins chart data
  const loginsByDay = data.logins_by_day || {};
  const failedByDay = data.failed_logins_by_day || {};
  const allDays = [...new Set([...Object.keys(loginsByDay), ...Object.keys(failedByDay)])].sort();
  const loginData = allDays.map(d => loginsByDay[d] || 0);
  const failedData = allDays.map(d => failedByDay[d] || 0);

  // Security breakdown
  const secActions = data.security_actions || {};
  const secLabels = Object.keys(secActions);
  const secData = Object.values(secActions);

  // Feature usage
  const featureUsage = data.feature_usage || {};
  const featEntries = Object.entries(featureUsage).sort((a,b) => b[1]-a[1]).slice(0, 15);
  const featLabels = featEntries.map(e => e[0]);
  const featData = featEntries.map(e => e[1]);

  // Integrations
  const integ = data.integrations_by_source || {};
  const integLabels = Object.keys(integ);
  const integData = Object.values(integ);

  // Reference docs
  const refCats = data.ref_docs_by_category || {};
  const refLabels = Object.keys(refCats);
  const refData = Object.values(refCats);

  // Maps
  const mapTypes = data.maps_by_type || {};
  const mapLabels = Object.keys(mapTypes);
  const mapData = Object.values(mapTypes);
  const mapPop = data.map_popularity || [];

  container.innerHTML = `
    <!-- Toolbox summary -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(rc.total||0, 'ReadyChecks', '#3498DB')}
      ${_analysisCard((rc.response_rate||0).toFixed(0)+'%', 'RC Response Rate', rc.response_rate >= 75 ? '#27AE60' : '#E67E22')}
      ${_analysisCard(cl.total||0, 'Checklists', '#9B59B6')}
      ${_analysisCard(cl.completed||0, 'CL Completed', '#27AE60')}
      ${_analysisCard(po.total||0, 'Polls', '#E67E22')}
      ${_analysisCard(po.total_responses||0, 'Poll Responses', '#1ABC9C')}
      ${_analysisCard(data.total_ref_docs||0, 'Reference Docs', '#3498DB')}
      ${_analysisCard(data.total_maps||0, 'Maps & Charts', '#E67E22')}
    </div>

    <!-- Logins over time -->
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Logins Over Time</div>
      <canvas id="anlLoginTimeline" height="200"></canvas>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <!-- Security audit breakdown -->
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Security Audit Records</div>
        <canvas id="anlSecPie" height="200"></canvas>
      </div>
      <!-- Most used features -->
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Most Used Features (Top 15)</div>
        <canvas id="anlFeatBar" height="${Math.max(200, featLabels.length * 22 + 20)}"></canvas>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <!-- Reference material by category -->
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Reference Material by Category</div>
        <canvas id="anlRefPie" height="200"></canvas>
      </div>
      <!-- Maps by type -->
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Maps & Charts by Type</div>
        <canvas id="anlMapPie" height="200"></canvas>
      </div>
    </div>

    ${integLabels.length ? `
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Integration Sources (${data.webhook_users||0} users with webhooks)</div>
      <canvas id="anlIntegBar" height="${Math.max(160, integLabels.length * 28 + 20)}"></canvas>
    </div>` : ''}

    ${mapPop.length ? `
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">Most Active Maps & Charts</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
        <thead><tr style="background:var(--bg2)">
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid var(--border)">Name</th>
          <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">Type</th>
          <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">Overlays</th>
          <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">Drawings</th>
        </tr></thead>
        <tbody>${mapPop.map(m => `<tr>
          <td style="padding:4px 8px;border-bottom:1px solid var(--border)">${escHtml(m.name)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${escHtml(m.type)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${m.overlays}</td>
          <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${m.drawings}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}`;

  setTimeout(() => {
    // Logins over time (line chart with two datasets)
    if (allDays.length && typeof drawLineChart === 'function') {
      drawLineChart('anlLoginTimeline', allDays, [
        {data: loginData, color: '#27AE60', label: 'Successful'},
        {data: failedData, color: '#E74C3C', label: 'Failed'}
      ], { showArea: true, showPoints: false });
    }
    // Security pie
    if (secLabels.length && typeof drawPieChart === 'function') {
      drawPieChart('anlSecPie', secLabels, secData);
    }
    // Feature usage bar
    if (featLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlFeatBar', featLabels, featData, { horizontal: true, maxBarWidth: 22 });
    }
    // Reference docs pie
    if (refLabels.length && typeof drawPieChart === 'function') {
      drawPieChart('anlRefPie', refLabels, refData);
    }
    // Maps pie
    if (mapLabels.length && typeof drawPieChart === 'function') {
      drawPieChart('anlMapPie', mapLabels, mapData);
    }
    // Integrations bar
    if (integLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlIntegBar', integLabels, integData, { horizontal: true, maxBarWidth: 28 });
    }
  }, 50);
}

/* ── Export Tab ────────────────────────────────────────────────────────────── */
function _renderExportTab(container) {
  const qs = _analysisDateParams();
  container.innerHTML = `
    <div style="padding:16px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:12px;font-size:var(--fs-sm)">📄 ${t('analysis_export_data')||'Export Data'}</div>
      <p style="font-size:var(--fs-xs);color:var(--text);margin-bottom:16px">${t('analysis_export_desc')||'Download analysis data in your preferred format.'}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="csv" style="min-width:90px">📋 CSV</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="json" style="min-width:90px">📋 JSON</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="xml" style="min-width:90px">📋 XML</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="txt" style="min-width:90px">📋 TXT</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="xlsx" style="min-width:90px">📋 XLSX</button>
      </div>
    </div>
    <div style="padding:16px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:12px;font-size:var(--fs-sm)">🖼 ${t('analysis_export_visual')||'Export Visuals'}</div>
      <p style="font-size:var(--fs-xs);color:var(--text);margin-bottom:16px">${t('analysis_export_visual_desc')||'Capture the current analysis view as an image or document.'}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="png" style="min-width:90px">🖼 PNG</button>
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="jpeg" style="min-width:90px">🖼 JPEG</button>
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="svg" style="min-width:90px">🖼 SVG</button>
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="pdf" style="min-width:90px">📑 PDF</button>
      </div>
    </div>`;
  _bindActions(container);
}

async function _downloadAnalysisExport(format) {
  const from = document.getElementById('analysisFrom')?.value || '';
  const to = document.getElementById('analysisTo')?.value || '';
  let url = '/api/stats/export?format=' + encodeURIComponent(format);
  if (from) url += '&from=' + encodeURIComponent(from);
  if (to) url += '&to=' + encodeURIComponent(to);
  const filename = 'tidslinjal-analysis-' + new Date().toISOString().slice(0,19).replace(/:/g,'') + '.' + format;

  try {
    const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    // Download
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl; a.download = filename;
    a.click();
    URL.revokeObjectURL(dlUrl);
    // Archive to infomanagement → local reports
    const title = 'Analysis Export — ' + new Date().toISOString().slice(0, 10);
    if (typeof _archiveReportToLocal === 'function') {
      _archiveReportToLocal(await blob.arrayBuffer(), blob.type, filename, title, 'analysis-' + format, 'analysis');
    }
  } catch {
    // Fallback: direct link download (no archiving)
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
  }
  showNotification('success', t('export_started')||'Export started');
}

function _exportAnalysisVisual(format) {
  const contentEl = document.getElementById('analysisContent') || document.querySelector('.anl-content');
  if (!contentEl) { showNotification('error', 'No analysis content found'); return; }
  const canvases = contentEl.querySelectorAll('canvas');
  if (!canvases.length) { showNotification('warning', t('no_charts')||'No charts to export. Switch to a tab with charts first.'); return; }

  const dateStr = new Date().toISOString().slice(0,10);
  const fname = 'tidslinjal-analysis-' + dateStr;

  if (format === 'png' || format === 'jpeg') {
    // Merge all canvases into one image
    const merged = document.createElement('canvas');
    const gap = 20;
    let totalH = gap;
    let maxW = 0;
    canvases.forEach(c => { totalH += c.height / (window.devicePixelRatio||1) + gap; maxW = Math.max(maxW, c.width / (window.devicePixelRatio||1)); });
    const dpr = window.devicePixelRatio || 1;
    merged.width = maxW * dpr;
    merged.height = totalH * dpr;
    const mctx = merged.getContext('2d');
    mctx.scale(dpr, dpr);
    mctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg') || '#0f1923';
    mctx.fillRect(0, 0, maxW, totalH);
    let yOff = gap;
    canvases.forEach(c => {
      const cw = c.width / dpr, ch = c.height / dpr;
      mctx.drawImage(c, 0, 0, c.width, c.height, 0, yOff, cw, ch);
      yOff += ch + gap;
    });
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    merged.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const dlName = fname + '.' + format;
      const a = document.createElement('a');
      a.href = url; a.download = dlName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      // Archive
      if (typeof _archiveReportToLocal === 'function') {
        blob.arrayBuffer().then(buf => _archiveReportToLocal(buf, mimeType, dlName, 'Analysis Chart — ' + dateStr, 'analysis-chart', 'analysis'));
      }
    }, mimeType, 0.95);
    showNotification('success', t('export_started')||'Export started');
  } else if (format === 'svg') {
    // Convert canvases to an SVG with embedded images
    let svgParts = [];
    const gap = 20;
    let totalH = gap, maxW = 0;
    const dpr = window.devicePixelRatio || 1;
    canvases.forEach(c => { const cw = c.width/dpr, ch = c.height/dpr; totalH += ch + gap; maxW = Math.max(maxW, cw); });
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${maxW}" height="${totalH}">`);
    svgParts.push(`<rect width="100%" height="100%" fill="${getComputedStyle(document.body).getPropertyValue('--bg')||'#0f1923'}"/>`);
    let yOff = gap;
    canvases.forEach(c => {
      const cw = c.width/dpr, ch = c.height/dpr;
      const dataUrl = c.toDataURL('image/png');
      svgParts.push(`<image x="0" y="${yOff}" width="${cw}" height="${ch}" href="${dataUrl}"/>`);
      yOff += ch + gap;
    });
    svgParts.push('</svg>');
    const svgContent = svgParts.join('\n');
    const blob = new Blob([svgContent], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const dlName = fname + '.svg';
    const a = document.createElement('a'); a.href = url; a.download = dlName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (typeof _archiveReportToLocal === 'function') _archiveReportToLocal(svgContent, 'image/svg+xml', dlName, 'Analysis Chart — ' + dateStr, 'analysis-chart', 'analysis');
    showNotification('success', t('export_started')||'Export started');
  } else if (format === 'pdf') {
    // Simple PDF with embedded images
    _exportAnalysisPDF(canvases, fname);
  }
}

function _exportAnalysisPDF(canvases, fname) {
  const dpr = window.devicePixelRatio || 1;
  const pageW = 595.28, pageH = 841.89; // A4 in points
  const margin = 40;
  const contentW = pageW - margin * 2;

  // Collect canvas images
  const images = [];
  canvases.forEach(c => {
    const cw = c.width / dpr, ch = c.height / dpr;
    const scale = Math.min(contentW / cw, 1);
    const imgW = cw * scale, imgH = ch * scale;
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    // Extract base64 data
    const b64 = dataUrl.split(',')[1];
    images.push({ b64, w: imgW, h: imgH, rawW: c.width, rawH: c.height });
  });

  // Build minimal PDF
  const objects = [];
  let objId = 0;
  function addObj(content) { objId++; objects.push({ id: objId, content }); return objId; }

  const catalogId = addObj(''); // placeholder
  const pagesId = addObj('');   // placeholder
  const pageIds = [];
  const gap = 20;

  // Create pages with images
  let currentY = margin;
  let currentPageStreams = [];
  let currentPageImages = [];
  let pageCount = 0;

  function finalizePage() {
    if (currentPageImages.length === 0) return;
    pageCount++;
    const imgObjIds = [];
    currentPageImages.forEach((img, i) => {
      const imgObjId = addObj(`<< /Type /XObject /Subtype /Image /Width ${img.rawW} /Height ${img.rawH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${atob(img.b64).length} >>`);
      imgObjIds.push({ objId: imgObjId, img, idx: i });
    });
    // Build content stream
    let stream = '';
    let yPos = pageH - margin;
    currentPageImages.forEach((img, i) => {
      yPos -= img.h;
      stream += `q ${img.w} 0 0 ${img.h} ${margin} ${yPos} cm /Img${i} Do Q\n`;
      yPos -= gap;
    });
    const streamBytes = new TextEncoder().encode(stream);
    const contentId = addObj(`<< /Length ${streamBytes.length} >>`);
    // Resources
    let resImgs = '';
    imgObjIds.forEach((io, i) => { resImgs += `/Img${i} ${io.objId} 0 R `; });
    const pageId = addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources << /XObject << ${resImgs} >> >> >>`);
    pageIds.push(pageId);
    // Store stream and image data for writing
    objects[contentId - 1]._stream = stream;
    imgObjIds.forEach(io => { objects[io.objId - 1]._imgB64 = io.img.b64; });
    currentPageImages = [];
    currentY = margin;
  }

  images.forEach(img => {
    if (currentY + img.h + gap > pageH - margin && currentPageImages.length > 0) {
      finalizePage();
    }
    currentPageImages.push(img);
    currentY += img.h + gap;
  });
  finalizePage();

  // Update catalog and pages
  objects[catalogId - 1].content = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1].content = `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;

  // Serialize PDF
  const parts = ['%PDF-1.4\n'];
  const offsets = [];
  objects.forEach(obj => {
    offsets.push(parts.join('').length);
    parts.push(`${obj.id} 0 obj\n${obj.content}\n`);
    if (obj._stream) {
      parts.push(`stream\n${obj._stream}endstream\n`);
    }
    if (obj._imgB64) {
      const bin = atob(obj._imgB64);
      parts.push('stream\n');
      // We'll handle binary separately
      obj._binOffset = parts.join('').length;
      parts.push(bin);
      parts.push('\nendstream\n');
    }
    parts.push('endobj\n');
  });
  const xrefOffset = parts.join('').length;
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach(off => { parts.push(String(off).padStart(10, '0') + ' 00000 n \n'); });
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const blob = new Blob(parts, { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname + '.pdf'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showNotification('success', t('export_started')||'Export started');
}

/* ── Analysis Helpers ──────────────────────────────────────────────────────── */
async function _analysisFetch(url) {
  if (_analysisCache[url]) return _analysisCache[url];
  const res = await apiGet(url);
  _analysisCache[url] = res;
  return res;
}

/* — kept for backward compat with old template references — */
function closeAnalysisModal() {
  const el = document.getElementById('analysisModal');
  if (el) el.remove();
  _analysisCache = {};
}

async function refreshAnalysis() {
  _analysisCache = {};
  const tab = _analysisActiveTab || 'overview';
  await _loadAnalysisTab(tab);
}

function detachAnalysis() {
  if (_analysisPopout && !_analysisPopout.closed) {
    _analysisPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 1400);
  const h = Math.min(window.screen.availHeight - 60, 1000);
  _analysisPopout = window.open('/static/analysis-popup.html', 'tidslinjal-analysis',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  closeAnalysisModal();
}

async function exportAnalysis() {
  const fmt = document.getElementById('analysisExportFmt')?.value || 'csv';
  _downloadAnalysisExport(fmt);
}

/* ── Polls Analysis Tab ─────────────────────────────────────────────────── */
async function _renderPollsAnalysisTab(container) {
  const data = await _analysisFetch('/api/stats/polls');
  const card = (title, value, sub) => `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px;text-align:center">
    <div style="font-size:24px;font-weight:bold;color:var(--accent)">${value}</div>
    <div style="font-size:var(--fs-sm);font-weight:600;margin-top:4px">${title}</div>
    ${sub ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${sub}</div>` : ''}
  </div>`;

  let html = `<h3 style="margin-bottom:12px">${t('analysis_polls_title')||'Poll Statistics'}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:20px">
      ${card(t('analysis_polls_total')||'Total Polls', data.total || 0)}
      ${card(t('analysis_polls_open')||'Open', data.open || 0)}
      ${card(t('analysis_polls_closed')||'Closed', data.closed || 0)}
      ${card(t('analysis_polls_responses')||'Total Responses', data.total_responses || 0)}
      ${card(t('analysis_polls_questions')||'Total Questions', data.total_questions || 0)}
      ${card(t('analysis_polls_avg_response')||'Avg Response Time', (data.avg_response_time_mins || 0).toFixed(1) + ' min')}
    </div>`;

  // Question type distribution
  if (data.question_type_distribution && Object.keys(data.question_type_distribution).length > 0) {
    html += `<h4 style="margin-bottom:8px">${t('analysis_polls_question_types')||'Question Type Distribution'}</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">`;
    for (const [type, count] of Object.entries(data.question_type_distribution)) {
      html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;font-size:var(--fs-sm)">
        <strong>${escHtml(type)}</strong>: ${count}
      </div>`;
    }
    html += `</div>`;
  }

  // Top creators
  if (data.by_creator && data.by_creator.length > 0) {
    html += `<h4 style="margin-bottom:8px">${t('analysis_polls_top_creators')||'Top Poll Creators'}</h4>
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
        <thead><tr style="background:var(--bg3)">
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">#</th>
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">${t('analysis_name')||'Name'}</th>
          <th style="padding:6px 10px;text-align:right;border-bottom:1px solid var(--border)">${t('analysis_count')||'Polls'}</th>
        </tr></thead><tbody>`;
    data.by_creator.forEach((c, i) => {
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:4px 10px">${i + 1}</td>
        <td style="padding:4px 10px">${escHtml(c.name)}</td>
        <td style="padding:4px 10px;text-align:right">${c.count}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  container.innerHTML = html;
}

/* ── Boards Analysis Tab ────────────────────────────────────────────────── */
async function _renderBoardsAnalysisTab(container) {
  const data = await _analysisFetch('/api/stats/boards');
  const card = (title, value, sub) => `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px;text-align:center">
    <div style="font-size:24px;font-weight:bold;color:var(--accent)">${value}</div>
    <div style="font-size:var(--fs-sm);font-weight:600;margin-top:4px">${title}</div>
    ${sub ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${sub}</div>` : ''}
  </div>`;

  let html = `<h3 style="margin-bottom:12px">${t('analysis_boards_title')||'Board Statistics'}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:20px">
      ${card(t('analysis_boards_total')||'Total Boards', data.total_boards || 0)}
      ${card(t('analysis_boards_items')||'Total Issues', data.total_items || 0)}
      ${card(t('analysis_boards_open')||'Open', data.open_items || 0, t('analysis_boards_items_label')||'issues')}
      ${card(t('analysis_boards_in_progress')||'In Progress', data.in_progress_items || 0, t('analysis_boards_items_label')||'issues')}
      ${card(t('analysis_boards_closed')||'Closed', data.closed_items || 0, t('analysis_boards_items_label')||'issues')}
    </div>`;

  // Boards by owner
  if (data.by_owner && data.by_owner.length > 0) {
    html += `<h4 style="margin-bottom:8px">${t('analysis_boards_by_owner')||'Most Boards by Owner'}</h4>
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
        <thead><tr style="background:var(--bg3)">
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">#</th>
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">${t('analysis_name')||'Name'}</th>
          <th style="padding:6px 10px;text-align:right;border-bottom:1px solid var(--border)">${t('analysis_boards_count')||'Boards'}</th>
        </tr></thead><tbody>`;
    data.by_owner.forEach((o, i) => {
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:4px 10px">${i + 1}</td>
        <td style="padding:4px 10px">${escHtml(o.name)}</td>
        <td style="padding:4px 10px;text-align:right">${o.count}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  // Items per board
  if (data.items_per_board && data.items_per_board.length > 0) {
    html += `<h4 style="margin-top:16px;margin-bottom:8px">${t('analysis_boards_items_per_board')||'Issues per Board'}</h4>
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
        <thead><tr style="background:var(--bg3)">
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">${t('analysis_board_name')||'Board'}</th>
          <th style="padding:6px 10px;text-align:right;border-bottom:1px solid var(--border)">${t('analysis_issues_count')||'Issues'}</th>
        </tr></thead><tbody>`;
    data.items_per_board.forEach(b => {
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:4px 10px">${escHtml(b.board_name)}</td>
        <td style="padding:4px 10px;text-align:right">${b.count}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  container.innerHTML = html;
}

