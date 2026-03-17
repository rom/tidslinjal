'use strict';

var _t = {};
var _cache = {};
var _activeTab = 'overview';

function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function t(key) { return _t[key] || ''; }

async function apiGet(url) {
  var res = await fetch(url);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('unauth'); }
  if (!res.ok) return null;
  return res.json();
}

function getOpener() {
  try { return window.opener && !window.opener.closed ? window.opener : null; } catch(e) { return null; }
}

function initThemeAndI18n() {
  var op = getOpener();
  if (op && op.state) {
    try {
      var theme = op.state.preferences?.theme || 'dark';
      document.body.className = 'theme-' + theme;
      if (op.TRANSLATIONS) {
        var lang = op.state.preferences?.language || 'en';
        _t = op.TRANSLATIONS[lang] || op.TRANSLATIONS.en || {};
      }
      return;
    } catch(e) {}
  }
  // Fallback: use loaded TRANSLATIONS
  if (typeof TRANSLATIONS !== 'undefined') {
    _t = TRANSLATIONS.en || {};
  }
  // Try API for preferences
  fetch('/api/preferences').then(function(r) { return r.ok ? r.json() : null; }).then(function(prefs) {
    if (prefs) {
      document.body.className = 'theme-' + (prefs.theme || 'dark');
      if (typeof TRANSLATIONS !== 'undefined') {
        _t = TRANSLATIONS[prefs.language || 'en'] || TRANSLATIONS.en || {};
      }
      applyI18n();
    }
  }).catch(function() {});
}

function applyI18n() {
  var el = document.getElementById('anlHeaderTitle');
  if (el) el.textContent = '📈 Tidslinjal — ' + (t('analysis_title') || 'Analysis');
  var lbl = function(id, key, fb) { var e = document.getElementById(id); if (e) e.textContent = t(key) || fb; };
  lbl('lblRefresh', 'btn_refresh', 'Refresh');
  lbl('lblFrom', 'from', 'From');
  lbl('lblTo', 'to', 'To');
  // Tab labels
  document.querySelectorAll('#anlTabBar .btn').forEach(function(btn) {
    var tab = btn.dataset.tab;
    var map = {overview:'analysis_tab_overview', activity:'analysis_tab_activity', optempo:'analysis_tab_optempo', decisions:'analysis_tab_decisions', dependencies:'analysis_tab_dependencies', export:'analysis_tab_export'};
    if (map[tab]) btn.textContent = t(map[tab]) || btn.textContent;
  });
}

function dateParams() {
  var from = document.getElementById('anlFrom').value;
  var to = document.getElementById('anlTo').value;
  var qs = '';
  if (from) qs += '&from=' + encodeURIComponent(from);
  if (to) qs += '&to=' + encodeURIComponent(to);
  return qs ? '?' + qs.substring(1) : '';
}

async function cachedGet(url) {
  if (_cache[url]) return _cache[url];
  var data = await apiGet(url);
  _cache[url] = data;
  return data;
}

function card(value, label, color) {
  return '<div class="anl-card"><div class="anl-card-value" style="color:' + (color || 'var(--accent)') + '">' + escHtml(String(value)) + '</div><div class="anl-card-label">' + escHtml(label) + '</div></div>';
}

/* ── Tab renderers ──────────────────────────────────────────────────────── */

async function renderOverview(container) {
  var qs = dateParams();
  var results = await Promise.all([
    cachedGet('/api/stats/overview' + qs),
    cachedGet('/api/stats/events/status' + qs),
    cachedGet('/api/stats/events/type' + qs),
    cachedGet('/api/stats/users/workload' + qs),
  ]);
  var overview = results[0], evStatus = results[1], evType = results[2], workload = results[3];

  var statusLabels = Object.keys(evStatus || {});
  var statusData = Object.values(evStatus || {});
  var statusColors = statusLabels.map(function(k) { return {planned:'#3498DB',active:'#E67E22',completed:'#27AE60',cancelled:'#95A5A6',verified:'#2ECC71',rejected:'#E74C3C'}[k] || '#9B59B6'; });

  var typeEntries = Object.entries(evType || {}).sort(function(a,b) { return b[1] - a[1]; });
  var typeLabels = typeEntries.map(function(e) { return e[0]; });
  var typeData = typeEntries.map(function(e) { return e[1]; });

  var wlEntries = Object.entries(workload || {}).sort(function(a,b) { return (b[1].total||0) - (a[1].total||0); }).slice(0, 15);
  var wlLabels = wlEntries.map(function(e) { return e[0]; });
  var wlData = wlEntries.map(function(e) { return e[1].total || 0; });

  container.innerHTML =
    '<div class="anl-grid anl-grid-6">' +
      card(overview?.total_events||0, t('total_events')||'Total Events', 'var(--accent)') +
      card(overview?.total_users||0, t('total_users')||'Total Users', 'var(--accent)') +
      card(overview?.active_alarms||0, t('active_alarms')||'Active Alarms', '#E67E22') +
      card(overview?.pending_decisions||0, t('pending_decisions')||'Pending Decisions', '#E67E22') +
      card(overview?.approved_decisions||0, t('approved_decisions')||'Approved', '#27AE60') +
      card(overview?.denied_decisions||0, t('denied_decisions')||'Denied', '#E74C3C') +
    '</div>' +
    '<div class="anl-grid anl-grid-2">' +
      '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_status_dist')||'Event Status Distribution') + '</div><canvas id="anlPieStatus" height="220"></canvas></div>' +
      '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_type_breakdown')||'Event Type Breakdown') + '</div><canvas id="anlBarType" height="' + Math.max(180, typeLabels.length * 22 + 20) + '"></canvas></div>' +
    '</div>' +
    '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_workload')||'User Workload (Top 15)') + '</div><canvas id="anlBarWorkload" height="' + Math.max(180, wlLabels.length * 22 + 20) + '"></canvas></div>';

  requestAnimationFrame(function() {
    if (statusLabels.length) drawPieChart('anlPieStatus', statusLabels, statusData, statusColors);
    if (typeLabels.length) drawBarChart('anlBarType', typeLabels, typeData, { horizontal: true });
    if (wlLabels.length) drawBarChart('anlBarWorkload', wlLabels, wlData, { horizontal: true, colors: '#2980B9' });
  });
}

async function renderActivity(container) {
  var qs = dateParams();
  var results = await Promise.all([
    cachedGet('/api/stats/events/heatmap' + qs),
    cachedGet('/api/stats/events/timeline' + qs),
  ]);
  var heatmap = results[0], timeline = results[1];

  var hmData = heatmap?.data || [];
  var hmDays = heatmap?.days || ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var hmHours = Array.from({length:24}, function(_, i) { return String(i).padStart(2,'0'); });

  var tlLabels = timeline?.labels || timeline?.dates || [];
  var tlData = timeline?.data || timeline?.counts || [];

  container.innerHTML =
    '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_heatmap')||'Activity Heatmap (Day x Hour)') + '</div><canvas id="anlHeatmap" height="' + Math.max(200, hmDays.length * 28 + 30) + '"></canvas></div>' +
    '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_events_timeline')||'Events Over Time') + '</div><canvas id="anlAreaTimeline" height="250"></canvas></div>';

  setTimeout(function() {
    if (hmData.length) drawHeatmap('anlHeatmap', hmDays, hmHours, hmData, { colorLow: '#1a1a2e', colorHigh: '#3498DB' });
    if (tlLabels.length) drawAreaChart('anlAreaTimeline', tlLabels, tlData, { color: '#3498DB' });
  }, 50);
}

async function renderOpTempo(container) {
  var qs = dateParams();
  var results = await Promise.all([
    cachedGet('/api/stats/op-tempo' + qs),
    cachedGet('/api/stats/slip-histogram' + qs),
  ]);
  var opTempo = results[0], slipHist = results[1];

  var tempoLabels = opTempo?.labels || opTempo?.dates || [];
  var tempoDatasets = [];
  if (opTempo?.datasets && Array.isArray(opTempo.datasets)) {
    opTempo.datasets.forEach(function(ds) { tempoDatasets.push({data: ds.data||[], color: ds.color||'#3498DB', label: ds.label||''}); });
  } else if (opTempo?.data) {
    tempoDatasets.push({data: opTempo.data, color: '#3498DB', label: t('op_tempo')||'Op Tempo'});
  }

  var slipBuckets = slipHist?.labels || slipHist?.buckets || [];
  var slipValues = slipHist?.data || slipHist?.values || [];

  container.innerHTML =
    '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_optempo')||'Operational Tempo') + '</div><canvas id="anlLineOpTempo" height="250"></canvas></div>' +
    '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_slip_histogram')||'Slip / Delay Histogram') + '</div><canvas id="anlHistSlip" height="250"></canvas></div>';

  setTimeout(function() {
    if (tempoLabels.length && tempoDatasets.length) drawLineChart('anlLineOpTempo', tempoLabels, tempoDatasets, { showArea: true, showPoints: true });
    if (slipBuckets.length) drawHistogram('anlHistSlip', slipBuckets, slipValues, { color: '#E67E22', showValues: true });
  }, 50);
}

async function renderDecisions(container) {
  var qs = dateParams();
  var analytics = await cachedGet('/api/stats/decision-analytics' + qs) || {};

  var byStatus = analytics.by_status || {};
  var outcomeLabels = Object.keys(byStatus).map(function(k) { return k === 'rejected' ? 'Denied' : k.charAt(0).toUpperCase() + k.slice(1); });
  var outcomeData = Object.values(byStatus);
  var outcomeColors = Object.keys(byStatus).map(function(k) { return {approved:'#27AE60',rejected:'#E74C3C',pending:'#E67E22',denied:'#E74C3C'}[k] || '#9B59B6'; });

  var avgMs = analytics.average_response_ms || analytics.avg_response_ms || 0;
  var avgResponse = avgMs ? (avgMs / 60000).toFixed(1) + ' min' : 'N/A';

  var perReq = analytics.per_requester || analytics.by_requester || {};
  var reqLabels = Object.keys(perReq);
  var reqData = Object.values(perReq);

  container.innerHTML =
    '<div class="anl-grid anl-grid-2">' +
      '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_approval_rate')||'Approval Rate') + '</div><canvas id="anlPieDecisions" height="250"></canvas></div>' +
      '<div class="anl-section" style="display:flex;flex-direction:column;justify-content:center;align-items:center"><div class="anl-section-title">' + (t('avg_response_time')||'Avg Response Time') + '</div><div style="font-size:36px;font-weight:700;color:var(--accent)">' + escHtml(avgResponse) + '</div></div>' +
    '</div>' +
    '<div class="anl-section"><div class="anl-section-title">' + (t('analysis_per_requester')||'Decisions Per Requester') + '</div><canvas id="anlBarRequester" height="' + Math.max(250, reqLabels.length * 22 + 20) + '"></canvas></div>';

  setTimeout(function() {
    if (outcomeLabels.length) drawPieChart('anlPieDecisions', outcomeLabels, outcomeData, outcomeColors);
    if (reqLabels.length) drawBarChart('anlBarRequester', reqLabels, reqData, { horizontal: true, maxBarWidth: 28 });
  }, 50);
}

async function renderDependencies(container) {
  var qs = dateParams();
  var graph = await cachedGet('/api/stats/dependency-graph' + qs);

  var nodes = (graph?.nodes || []).map(function(n) {
    return { id: n.id, label: n.label || n.title || n.id, x: n.x, y: n.y, color: n.critical ? '#E74C3C' : (n.color || '#3498DB'), size: n.size || 10,
      _event: { status: n.status, event_type: n.type, start_time: n.start_time, description: n.description, assigned_to: n.assigned_to, layer_name: n.layer_name } };
  });
  var edges = (graph?.edges || []).map(function(e) {
    return { from: e.from, to: e.to, color: e.critical ? '#E74C3C' : (e.color || 'rgba(255,255,255,0.3)'), critical: !!e.critical };
  });
  var stats = graph?.stats || {};

  container.innerHTML =
    '<div class="anl-grid anl-grid-3">' +
      card(stats.total_nodes || nodes.length, t('total_nodes')||'Nodes', 'var(--accent)') +
      card(stats.total_edges || edges.length, t('total_edges')||'Edges', 'var(--accent)') +
      card(stats.longest_chain || 0, t('longest_chain')||'Longest Chain', '#E67E22') +
    '</div>' +
    '<div class="anl-section"><div class="anl-section-title">' + (t('dependency_graph')||'Event Dependency Graph') + '</div>' +
      '<div style="font-size:var(--fs-xs);color:var(--text);margin-bottom:6px">' + (t('drag_nodes_click')||'Drag nodes to reposition. Click a node to see event details. Red = critical path.') + '</div>' +
      '<canvas id="anlNetGraph" height="400"></canvas>' +
    '</div>';

  requestAnimationFrame(function() {
    drawNetworkGraph('anlNetGraph', nodes, edges, { directed: true, interactive: true, nodeRadius: 10 });
  });
}

/* ── Export Tab ─────────────────────────────────────────────────────────── */

function renderExport(container) {
  container.innerHTML =
    '<div style="padding:16px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">' +
      '<div style="font-weight:700;margin-bottom:12px;font-size:var(--fs-sm)">📄 ' + (t('analysis_export_data')||'Export Data') + '</div>' +
      '<p style="font-size:var(--fs-xs);color:var(--text);margin-bottom:16px">' + (t('analysis_export_desc')||'Download analysis data in your preferred format.') + '</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn" onclick="popupDownloadExport(\'csv\')">📋 CSV</button>' +
        '<button class="btn" onclick="popupDownloadExport(\'json\')">📋 JSON</button>' +
        '<button class="btn" onclick="popupDownloadExport(\'xml\')">📋 XML</button>' +
        '<button class="btn" onclick="popupDownloadExport(\'txt\')">📋 TXT</button>' +
        '<button class="btn" onclick="popupDownloadExport(\'xlsx\')">📋 XLSX</button>' +
      '</div>' +
    '</div>' +
    '<div style="padding:16px;background:var(--bg3);border-radius:var(--radius)">' +
      '<div style="font-weight:700;margin-bottom:12px;font-size:var(--fs-sm)">🖼 ' + (t('analysis_export_visual')||'Export Visuals') + '</div>' +
      '<p style="font-size:var(--fs-xs);color:var(--text);margin-bottom:16px">' + (t('analysis_export_visual_desc')||'Capture the current analysis view as an image. Switch to a chart tab first.') + '</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn" onclick="popupExportVisual(\'png\')">🖼 PNG</button>' +
        '<button class="btn" onclick="popupExportVisual(\'jpeg\')">🖼 JPEG</button>' +
        '<button class="btn" onclick="popupExportVisual(\'svg\')">🖼 SVG</button>' +
      '</div>' +
    '</div>';
}

function popupDownloadExport(format) {
  var qs = dateParams();
  var url = '/api/stats/export?format=' + encodeURIComponent(format);
  var from = document.getElementById('anlFrom').value;
  var to = document.getElementById('anlTo').value;
  if (from) url += '&from=' + encodeURIComponent(from);
  if (to) url += '&to=' + encodeURIComponent(to);
  var a = document.createElement('a');
  a.href = url; a.download = 'tidslinjal-analysis-' + new Date().toISOString().slice(0,10) + '.' + format;
  a.click();
}

function popupExportVisual(format) {
  var contentEl = document.getElementById('anlContent');
  var canvases = contentEl ? contentEl.querySelectorAll('canvas') : [];
  if (!canvases.length) { alert(t('no_charts')||'No charts to export. Switch to a tab with charts first.'); return; }
  var dateStr = new Date().toISOString().slice(0,10);
  var fname = 'tidslinjal-analysis-' + dateStr;
  var dpr = window.devicePixelRatio || 1;
  var gap = 20, totalH = gap, maxW = 0;
  canvases.forEach(function(c) { totalH += c.height/dpr + gap; maxW = Math.max(maxW, c.width/dpr); });

  if (format === 'png' || format === 'jpeg') {
    var merged = document.createElement('canvas');
    merged.width = maxW * dpr; merged.height = totalH * dpr;
    var mctx = merged.getContext('2d'); mctx.scale(dpr, dpr);
    mctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg') || '#0f1923';
    mctx.fillRect(0, 0, maxW, totalH);
    var yOff = gap;
    canvases.forEach(function(c) { var cw=c.width/dpr, ch=c.height/dpr; mctx.drawImage(c, 0,0,c.width,c.height, 0,yOff,cw,ch); yOff+=ch+gap; });
    var mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    merged.toBlob(function(blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = fname + '.' + format; a.click();
      setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
    }, mimeType, 0.95);
  } else if (format === 'svg') {
    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + maxW + '" height="' + totalH + '">');
    parts.push('<rect width="100%" height="100%" fill="' + (getComputedStyle(document.body).getPropertyValue('--bg')||'#0f1923') + '"/>');
    var yOff2 = gap;
    canvases.forEach(function(c) { var cw=c.width/dpr, ch=c.height/dpr; parts.push('<image x="0" y="'+yOff2+'" width="'+cw+'" height="'+ch+'" href="'+c.toDataURL('image/png')+'"/>'); yOff2+=ch+gap; });
    parts.push('</svg>');
    var blob2 = new Blob([parts.join('\n')], {type:'image/svg+xml'});
    var url2 = URL.createObjectURL(blob2);
    var a2 = document.createElement('a'); a2.href = url2; a2.download = fname + '.svg'; a2.click();
    setTimeout(function() { URL.revokeObjectURL(url2); }, 5000);
  }
}

/* ── Tab loading ────────────────────────────────────────────────────────── */

async function loadTab(tab) {
  _activeTab = tab;
  var container = document.getElementById('anlContent');
  if (!container) return;
  container.innerHTML = '<div class="anl-empty">' + (t('loading')||'Loading...') + '</div>';

  // Update tab buttons
  document.querySelectorAll('#anlTabBar .btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  try {
    switch (tab) {
      case 'overview':     await renderOverview(container); break;
      case 'activity':     await renderActivity(container); break;
      case 'optempo':      await renderOpTempo(container); break;
      case 'decisions':    await renderDecisions(container); break;
      case 'dependencies': await renderDependencies(container); break;
      case 'export':       renderExport(container); break;
    }
  } catch(e) {
    console.warn('Analysis tab error', e);
    container.innerHTML = '<div class="anl-empty">Error loading data.</div>';
  }
}

function refresh() {
  _cache = {};
  loadTab(_activeTab);
}

/* ── Init ───────────────────────────────────────────────────────────────── */

// Tab switching
document.querySelectorAll('#anlTabBar .btn').forEach(function(btn) {
  btn.addEventListener('click', function() { loadTab(btn.dataset.tab); });
});
document.getElementById('btnRefresh').addEventListener('click', refresh);

// Theme sync
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'theme') {
    document.body.className = 'theme-' + (e.data.theme || 'dark');
  }
});

try {
  var _anlBC = new BroadcastChannel('tidslinjal-sync');
  _anlBC.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      document.body.className = 'theme-' + (e.data.theme || 'dark');
    }
  };
} catch(e) {}

setInterval(function() {
  var op = getOpener();
  if (op && op.state && op.state.preferences) {
    var theme = op.state.preferences.theme || 'dark';
    if (document.body.className !== 'theme-' + theme) {
      document.body.className = 'theme-' + theme;
    }
  }
}, 3000);

// SSE refresh
try {
  var _anlSSE = new EventSource('/api/events');
  _anlSSE.onmessage = function(ev) {
    try {
      var data = JSON.parse(ev.data);
      if (data.type && (data.type.startsWith('event_') || data.type.startsWith('decision_') || data.type === 'refresh')) {
        _cache = {};
        loadTab(_activeTab);
      }
    } catch(e) {}
  };
} catch(e) {}

// Init
initThemeAndI18n();
applyI18n();

// Set default from/to dates and name from exercise settings
(function() {
  var op = getOpener();
  if (op && op.state && op.state.exercise) {
    var ex = op.state.exercise;
    var fromEl = document.getElementById('anlFrom');
    var toEl = document.getElementById('anlTo');
    if (ex.epoch && fromEl && !fromEl.value) {
      try { fromEl.value = new Date(ex.epoch).toISOString().slice(0, 10); } catch(e) {}
    }
    if (ex.endex && toEl && !toEl.value) {
      try { toEl.value = new Date(ex.endex).toISOString().slice(0, 10); } catch(e) {}
    }
    // Update title with exercise name
    if (ex.label) {
      var title = document.getElementById('anlHeaderTitle');
      if (title) title.textContent = '\u{1F4C8} ' + ex.label + ' \u2014 ' + (t('analysis_title') || 'Analysis');
    }
  }
})();

loadTab('overview');
