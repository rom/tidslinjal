/* ── Critical Line Analysis ── */
// ── Critical Line Analysis ──────────────────────────────────────────────────
function openCriticalLineModal() {
  const events = (state.events || []).filter(e => !isTypeHidden(e.event_type) && e.start_time);
  // Build a dependency graph and find the critical path
  const evMap = {};
  events.forEach(e => { evMap[e.id] = e; });

  // Find events with dependencies
  const withDeps = events.filter(e => e.depends_on && e.depends_on.length > 0);
  // Find event chains (longest path through dependencies)
  function findLongestPath(evId, visited) {
    if (visited.has(evId)) return [];
    visited.add(evId);
    const ev = evMap[evId];
    if (!ev) return [];
    const start = new Date(ev.start_time).getTime();
    const end = ev.end_time ? new Date(ev.end_time).getTime() : start;
    const duration = end - start;
    let longestDown = [];
    (ev.depends_on || []).forEach(depId => {
      const path = findLongestPath(depId, new Set(visited));
      if (path.length > longestDown.length) longestDown = path;
    });
    return [...longestDown, { id: evId, title: ev.title, start, end, duration, status: ev.status, type: ev.event_type }];
  }

  // Find all leaf events (not depended upon by others)
  const dependedUpon = new Set();
  events.forEach(e => (e.depends_on || []).forEach(d => dependedUpon.add(d)));
  const leaves = events.filter(e => !dependedUpon.has(e.id));

  let criticalPath = [];
  leaves.forEach(ev => {
    const path = findLongestPath(ev.id, new Set());
    if (path.length > criticalPath.length) criticalPath = path;
  });

  // If no dependency chains, show timeline-based analysis
  const sorted = [...events].sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
  const totalSpan = sorted.length > 1
    ? (new Date(sorted[sorted.length-1].end_time || sorted[sorted.length-1].start_time) - new Date(sorted[0].start_time))
    : 0;

  // Identify overlapping events (resource conflicts)
  const overlaps = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i+1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const aEnd = new Date(a.end_time || a.start_time);
      const bStart = new Date(b.start_time);
      if (aEnd > bStart && a.responsible_id && a.responsible_id === b.responsible_id) {
        overlaps.push({a, b});
      }
    }
    if (overlaps.length >= 20) break;
  }

  // Status distribution
  const statusCounts = {};
  events.forEach(e => { statusCounts[e.status || 'planned'] = (statusCounts[e.status || 'planned'] || 0) + 1; });

  const fmtDur = ms => {
    if (ms < 3600000) return Math.round(ms/60000) + ' min';
    if (ms < 86400000) return (ms/3600000).toFixed(1) + ' h';
    return (ms/86400000).toFixed(1) + ' d';
  };

  // Remove any existing modal to prevent duplicates
  const old = document.getElementById('criticalLineModal');
  if (old) old.remove();

  const el = document.createElement('div');
  el.className = 'modal-overlay open';
  el.id = 'criticalLineModal';
  el.innerHTML = `
      <div class="modal" style="max-width:750px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>📈 ${t('critical_line_title')||'Critical Line Analysis'}</h2>
          <button class="modal-close" data-action="closeCriticalLineModal">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px">Summary</h3>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:var(--fs-sm)">
              <span style="color:var(--text-dim)">Total events:</span><span>${events.length}</span>
              <span style="color:var(--text-dim)">Total span:</span><span>${totalSpan > 0 ? fmtDur(totalSpan) : '—'}</span>
              <span style="color:var(--text-dim)">With dependencies:</span><span>${withDeps.length}</span>
              <span style="color:var(--text-dim)">Resource conflicts:</span><span style="color:${overlaps.length?'var(--danger)':'var(--text)'}">${overlaps.length}</span>
            </div>
          </div>
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px">Status Distribution</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${Object.entries(statusCounts).map(([s,c]) =>
                `<span style="padding:2px 8px;border-radius:var(--radius);background:var(--bg3);font-size:var(--fs-xs)">${s}: <strong>${c}</strong></span>`
              ).join('')}
            </div>
          </div>
          ${criticalPath.length > 1 ? `
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px;color:var(--danger)">Critical Path (${criticalPath.length} events)</h3>
            <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
              ${criticalPath.map((cp,i) => `
                <div style="padding:6px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:var(--fs-xs)">
                  <span style="font-weight:700;color:var(--accent);min-width:20px">${i+1}</span>
                  <span style="flex:1">${escHtml(cp.title)}</span>
                  <span style="color:var(--text-dim)">${fmtDur(cp.duration)}</span>
                  <span class="role-badge role-${cp.status==='completed'?'admin':cp.status==='active'?'teamlead':'observer'}" style="font-size:10px;padding:1px 5px">${cp.status||'planned'}</span>
                </div>`).join('')}
            </div>
          </div>` : `
          <div style="margin-bottom:12px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
            <p style="font-size:var(--fs-xs);color:var(--text-dim)">No dependency chains found. Add dependencies between events (via the "Depends On" field) to see the critical path analysis.</p>
          </div>`}
          ${overlaps.length ? `
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px;color:#E67E22">Resource Conflicts (${overlaps.length})</h3>
            ${overlaps.slice(0,10).map(o => `
              <div style="font-size:var(--fs-xs);padding:4px 0;border-bottom:1px solid var(--border)">
                <span style="color:var(--danger)">⚠</span>
                <strong>${escHtml(o.a.title)}</strong> overlaps with <strong>${escHtml(o.b.title)}</strong>
                ${o.a.responsible_name ? ` (${escHtml(o.a.responsible_name)})` : ''}
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
  document.body.appendChild(el);
  _bindActions(el);
}

function closeCriticalLineModal() {
  const el = document.getElementById('criticalLineModal');
  if (el) el.remove();
}

