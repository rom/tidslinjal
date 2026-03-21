/* ── Reports ── */
// ── Password change ────────────────────────────────────────────────────────
function openReportModal() {
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
}


// ── generateReport, mobileNavTab, closeMobileSidebar ─────────────────────
async function generateReport() {
  const type   = document.getElementById('reportType')?.value || 'aar';
  // Optionally use date range from report modal if provided
  const fromEl = document.getElementById('reportFrom');
  const toEl   = document.getElementById('reportTo');
  const from   = fromEl && fromEl.value ? new Date(fromEl.value) : state.startDate;
  const to     = toEl   && toEl.value   ? new Date(toEl.value)   : getViewEnd();

  // Layer filter from report modal checkboxes
  const reportLayerEls = document.querySelectorAll('.report-layer-cb:checked');
  const reportLayerFilter = reportLayerEls.length > 0
    ? new Set([...reportLayerEls].map(el => Number(el.value)))
    : null; // null = all layers

  let events = state.events.filter(ev => {
    const evStart = new Date(ev.start_time);
    if (evStart < from || evStart >= to) return false;
    if (reportLayerFilter !== null) {
      const lid = ev.layer_id ? Number(ev.layer_id) : 0;
      if (!reportLayerFilter.has(lid)) return false;
    }
    return true;
  });

  const title = `${type.toUpperCase()} Report — ${localShortDate(from)} to ${localShortDate(to)}`;

  const statusOrder = ['planned','active','responded_to','completed','submitted','verified','rejected','cancelled'];

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
  <style>body{font-family:sans-serif;margin:32px;color:#111}
  h1{font-size:22px;margin-bottom:4px}
  h2{font-size:16px;margin-top:24px;border-bottom:2px solid #333;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;font-size:13px;margin-top:8px}
  th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
  th{background:#f0f0f0}
  .status{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600}
  </style></head><body>
  <h1>${escHtml(title)}</h1>
  <p style="color:#666;font-size:13px">Generated: ${fmtDateTime(new Date())}</p>`;

  if (type === 'aar') {
    const byStatus = {};
    statusOrder.forEach(s => { byStatus[s] = []; });
    events.forEach(ev => { const s = ev.status||'planned'; if (byStatus[s]) byStatus[s].push(ev); });

    statusOrder.forEach(s => {
      if (!byStatus[s].length) return;
      html += `<h2>${t('status_'+s)||s} (${byStatus[s].length})</h2>
      <table><thead><tr><th>Title</th><th>Type</th><th>Start</th><th>End</th><th>Duration</th><th>Responsible</th><th>Created by</th></tr></thead><tbody>
      ${byStatus[s].map(ev => `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${escHtml(ev.event_type)}</td>
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
        <td>${escHtml(ev.created_by_name||'')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });

  } else if (type === 'per_layer') {
    const byLayer = {};
    state.layers.forEach(l => { byLayer[l.id] = {name: l.name, events: []}; });
    byLayer['master'] = {name: t('layers_master')||'Master', events: []};
    events.forEach(ev => {
      const key = ev.layer_id ? ev.layer_id : 'master';
      if (!byLayer[key]) byLayer[key] = {name: 'Layer '+key, events: []};
      byLayer[key].events.push(ev);
    });
    Object.values(byLayer).forEach(({name, events: evs}) => {
      if (!evs.length) return;
      html += `<h2>${escHtml(name)} (${evs.length})</h2>
      <table><thead><tr><th>Title</th><th>Status</th><th>Start</th><th>End</th><th>Duration</th><th>Responsible</th></tr></thead><tbody>
      ${evs.map(ev => `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });

  } else if (type === 'status_summary') {
    // Status summary: pie-chart-style table with counts per status
    const byStatus = {};
    statusOrder.forEach(s => { byStatus[s] = 0; });
    events.forEach(ev => { const s = ev.status||'planned'; if (byStatus[s] !== undefined) byStatus[s]++; });
    const total = events.length;
    html += `<h2>Status Summary — ${total} events total</h2>
    <table><thead><tr><th>Status</th><th>Count</th><th>Percentage</th></tr></thead><tbody>
    ${statusOrder.filter(s => byStatus[s] > 0).map(s => `<tr>
      <td><strong>${t('status_'+s)||s}</strong></td>
      <td>${byStatus[s]}</td>
      <td>${total ? Math.round(byStatus[s]/total*100) : 0}%</td>
    </tr>`).join('')}
    </tbody></table>`;

  } else if (type === 'daily_briefing') {
    // Daily briefing: events grouped by day, chronological
    const byDay = {};
    events.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).forEach(ev => {
      const day = new Date(ev.start_time).toLocaleDateString();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(ev);
    });
    Object.entries(byDay).forEach(([day, evs]) => {
      html += `<h2>📅 ${day} (${evs.length} events)</h2>
      <table><thead><tr><th>Time</th><th>Title</th><th>Type</th><th>Status</th><th>Responsible</th><th>Location</th></tr></thead><tbody>
      ${evs.map(ev => `<tr>
        <td>${ev.all_day ? 'All day' : new Date(ev.start_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
        <td><strong>${escHtml(ev.title)}</strong></td>
        <td>${escHtml(ev.event_type)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
        <td>${escHtml(ev.physical_location || '')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });
    if (!Object.keys(byDay).length) html += '<p style="color:#888">No events in this period.</p>';

  } else if (type === 'type_breakdown') {
    // Event type breakdown
    const byType = {};
    events.forEach(ev => {
      const k = ev.event_type || 'event';
      if (!byType[k]) byType[k] = [];
      byType[k].push(ev);
    });
    const sorted = Object.entries(byType).sort((a,b) => b[1].length - a[1].length);
    html += `<h2>Event Type Breakdown — ${events.length} events total</h2>
    <table><thead><tr><th>Type</th><th>Count</th><th>%</th><th>Avg Duration</th></tr></thead><tbody>
    ${sorted.map(([typ, evs]) => {
      const avgMs = evs.reduce((acc, ev) => {
        if (!ev.end_time) return acc;
        return acc + (new Date(ev.end_time) - new Date(ev.start_time));
      }, 0) / (evs.filter(e => e.end_time).length || 1);
      const avgMin = Math.round(avgMs / 60000);
      return `<tr>
        <td><strong>${escHtml(typ)}</strong></td>
        <td>${evs.length}</td>
        <td>${events.length ? Math.round(evs.length/events.length*100) : 0}%</td>
        <td>${avgMin > 0 ? (avgMin >= 60 ? Math.round(avgMin/60)+'h '+(avgMin%60)+'m' : avgMin+'m') : '—'}</td>
      </tr>`;
    }).join('')}
    </tbody></table>`;

  } else if (type === 'responsible') {
    // Responsible / resource report: events grouped by responsible person
    const byResp = {};
    events.forEach(ev => {
      const k = ev.responsible_name || ev.created_by_name || 'Unassigned';
      if (!byResp[k]) byResp[k] = [];
      byResp[k].push(ev);
    });
    const sorted = Object.entries(byResp).sort((a,b) => b[1].length - a[1].length);
    sorted.forEach(([name, evs]) => {
      const totalMins = evs.reduce((acc, ev) => {
        if (!ev.end_time) return acc;
        return acc + (new Date(ev.end_time) - new Date(ev.start_time)) / 60000;
      }, 0);
      html += `<h2>${escHtml(name)} — ${evs.length} events (${Math.round(totalMins/60*10)/10}h)</h2>
      <table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>Duration</th></tr></thead><tbody>
      ${evs.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).map(ev => `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${escHtml(ev.event_type)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });

  } else if (type === 'planned_vs_actual') {
    // Planned vs Actual: compare planned_start/planned_end vs actual
    const withPlanned = events.filter(ev => ev.planned_start);
    html += `<h2>Planned vs. Actual — ${withPlanned.length} events with planned times</h2>
    <table><thead><tr><th>Title</th><th>Planned Start</th><th>Actual Start</th><th>Start Δ</th><th>Planned End</th><th>Actual End</th><th>End Δ</th><th>Status</th></tr></thead><tbody>
    ${withPlanned.sort((a,b)=>new Date(a.planned_start)-new Date(b.planned_start)).map(ev => {
      const pStart = new Date(ev.planned_start);
      const aStart = new Date(ev.start_time);
      const deltaStart = Math.round((aStart - pStart) / 60000);
      const pEnd = ev.planned_end ? new Date(ev.planned_end) : null;
      const aEnd = ev.end_time ? new Date(ev.end_time) : null;
      const deltaEnd = (pEnd && aEnd) ? Math.round((aEnd - pEnd) / 60000) : null;
      const fmtDelta = d => d === null ? '—' : (d > 0 ? `<span style="color:#c00">+${d}m</span>` : d < 0 ? `<span style="color:#0a0">${d}m</span>` : '<span style="color:#888">On time</span>');
      return `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${fmtDateTime(pStart)}</td>
        <td>${fmtDateTime(aStart)}</td>
        <td>${fmtDelta(deltaStart)}</td>
        <td>${pEnd ? fmtDateTime(pEnd) : '—'}</td>
        <td>${aEnd ? fmtDateTime(aEnd) : '—'}</td>
        <td>${fmtDelta(deltaEnd)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
      </tr>`;
    }).join('')}
    </tbody></table>
    ${withPlanned.length === 0 ? '<p style="color:#888;margin-top:8px">No events have planned times recorded yet. Planned times are captured automatically on the first edit of an event.</p>' : ''}`;

  } else if (type === 'critical_path') {
    // Critical path analysis: find longest dependency chain
    const idMap = {};
    events.forEach(ev => { idMap[ev.id] = ev; });
    const longestPath = [];
    const memo = {};

    function calcPath(evId) {
      if (memo[evId] !== undefined) return memo[evId];
      const ev = idMap[evId];
      if (!ev || !ev.depends_on || !ev.depends_on.length) {
        memo[evId] = {len: 0, path: [evId]};
        return memo[evId];
      }
      let best = {len: -1, path: []};
      for (const dep of ev.depends_on) {
        const sub = calcPath(dep);
        if (sub.len > best.len) best = sub;
      }
      memo[evId] = {len: best.len + 1, path: [...best.path, evId]};
      return memo[evId];
    }

    events.forEach(ev => { if (!memo[ev.id]) calcPath(ev.id); });
    let maxPath = {len: 0, path: []};
    Object.values(memo).forEach(r => { if (r.len > maxPath.len) maxPath = r; });

    const cpIds = new Set(maxPath.path);
    html += `<h2>Critical Path Analysis</h2>
    <p style="color:#666;font-size:13px">The critical path is the longest chain of dependent events. Delays on the critical path delay the entire timeline.</p>
    <h3 style="font-size:14px;margin-top:16px">Critical Path (${maxPath.path.length} events):</h3>
    <table><thead><tr><th>#</th><th>Event</th><th>Start</th><th>End</th><th>Duration</th><th>Status</th></tr></thead><tbody>
    ${maxPath.path.map((id, i) => {
      const ev = idMap[id];
      if (!ev) return '';
      return `<tr style="background:${i%2===0?'#fff9e6':'#fff'}">
        <td>${i+1}</td>
        <td><strong>${escHtml(ev.title)}</strong></td>
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
      </tr>`;
    }).join('')}
    </tbody></table>
    <h3 style="font-size:14px;margin-top:16px">All events with dependencies:</h3>
    <table><thead><tr><th>Event</th><th>Depends On</th><th>On Critical Path</th></tr></thead><tbody>
    ${events.filter(ev => ev.depends_on && ev.depends_on.length).map(ev => `<tr>
      <td>${escHtml(ev.title)}</td>
      <td>${ev.depends_on.map(d => idMap[d] ? escHtml(idMap[d].title) : d).join(', ')}</td>
      <td>${cpIds.has(ev.id) ? '⚠️ Yes' : '—'}</td>
    </tr>`).join('')}
    </tbody></table>
    ${!events.some(ev => ev.depends_on && ev.depends_on.length) ? '<p style="color:#888;margin-top:8px">No event dependencies defined yet. Add dependencies via the event editor.</p>' : ''}`;

  } else if (type === 'decisions') {
    // Decisions report: all decision log entries
    try {
      const dlEntries = await apiGet('/api/decision-log') || [];
      const decided = dlEntries.filter(e => !e.status || e.status === 'approved');
      const requested = dlEntries.filter(e => e.status === 'requested');
      const rejected = dlEntries.filter(e => e.status === 'rejected');
      html += `<h2>${t('report_decisions_decided')||'Decisions Made'} (${decided.length})</h2>
      <table><thead><tr><th>#</th><th>${t('report_decisions_seq')||'Seq'}</th><th>${t('report_decisions_decision')||'Decision'}</th><th>${t('report_decisions_by')||'By'}</th><th>${t('report_decisions_time')||'Time'}</th><th>${t('report_decisions_approved_at')||'Decided At'}</th></tr></thead><tbody>
      ${decided.map((e,i) => `<tr>
        <td>${i+1}</td>
        <td>${escHtml(e.sequence_number||'')}</td>
        <td>${escHtml(e.decision)}</td>
        <td>${escHtml(e.display_name || e.user_name)}</td>
        <td>${fmtDateTime(new Date(e.timestamp))}</td>
        <td>${e.decided_at ? fmtDateTime(new Date(e.decided_at)) : e.reviewed_at ? fmtDateTime(new Date(e.reviewed_at)) : '—'}</td>
      </tr>`).join('')}
      </tbody></table>`;
      if (requested.length) {
        html += `<h2>${t('report_decisions_pending')||'Pending Decisions'} (${requested.length})</h2>
        <table><thead><tr><th>#</th><th>${t('report_decisions_seq')||'Seq'}</th><th>${t('report_decisions_request')||'Request'}</th><th>${t('report_decisions_by')||'By'}</th><th>${t('report_decisions_requested_at')||'Requested At'}</th><th>${t('report_decisions_target')||'Requested Of'}</th></tr></thead><tbody>
        ${requested.map((e,i) => `<tr>
          <td>${i+1}</td>
          <td>${escHtml(e.sequence_number||'')}</td>
          <td>${escHtml(e.decision)}</td>
          <td>${escHtml(e.display_name || e.user_name)}</td>
          <td>${e.requested_at ? fmtDateTime(new Date(e.requested_at)) : fmtDateTime(new Date(e.timestamp))}</td>
          <td>${escHtml(e.requested_of_label||'')}</td>
        </tr>`).join('')}
        </tbody></table>`;
      }
      if (rejected.length) {
        html += `<h2>${t('report_decisions_rejected')||'Rejected Decisions'} (${rejected.length})</h2>
        <table><thead><tr><th>#</th><th>${t('report_decisions_decision')||'Decision'}</th><th>${t('report_decisions_by')||'By'}</th><th>${t('report_decisions_reviewed_by')||'Reviewed By'}</th><th>${t('report_decisions_comment')||'Comment'}</th></tr></thead><tbody>
        ${rejected.map((e,i) => `<tr>
          <td>${i+1}</td>
          <td>${escHtml(e.decision)}</td>
          <td>${escHtml(e.display_name || e.user_name)}</td>
          <td>${escHtml(e.reviewed_by_name||'')}</td>
          <td>${escHtml(e.review_comment||'')}</td>
        </tr>`).join('')}
        </tbody></table>`;
      }
    } catch(err) {
      html += '<p>Failed to load decision log data.</p>';
    }

  } else if (type === 'poll') {
    // Poll report
    try {
      const res = await api('GET', '/api/polls/log');
      const polls = res.ok ? await res.json() : [];
      if (!polls || polls.length === 0) {
        html += `<p>${t('poll_no_polls')||'No polls found.'}</p>`;
      } else {
        polls.forEach(poll => {
          const ts = new Date(poll.created_at).toLocaleString();
          const totalR = (poll.responses || []).length;
          const totalT = (poll.target_ids || []).length || '?';
          html += `<h2>📊 ${escHtml(poll.title)} <small style="font-size:11px;color:#888">(${poll.status} — ${ts})</small></h2>`;
          html += `<p>Responses: ${totalR}/${totalT}</p>`;
          if ((poll.questions || []).length && (poll.responses || []).length) {
            html += '<table><thead><tr><th>Question</th><th>Type</th><th>Summary</th></tr></thead><tbody>';
            (poll.questions || []).forEach((q, qi) => {
              const answers = (poll.responses || []).filter(r => r.question_id === q.id).map(r => r.answer).filter(Boolean);
              let summary = '';
              if (q.type === 'scale' || q.type === 'scale_0_3') {
                const counts = [0,0,0,0];
                answers.forEach(a => { const v = parseInt(a); if (v >= 0 && v <= 3) counts[v]++; });
                summary = counts.map((c,i) => `${i}: ${c}`).join(', ');
              } else if (q.type === 'yes_no') {
                const yes = answers.filter(a => a === 'yes').length;
                const no = answers.filter(a => a === 'no').length;
                summary = `Yes: ${yes}, No: ${no}`;
              } else {
                summary = answers.map(a => escHtml(a)).join('; ');
              }
              html += `<tr><td>${escHtml(q.text)}</td><td>${q.type}</td><td>${summary}</td></tr>`;
            });
            html += '</tbody></table>';
          }
        });
      }
    } catch(err) {
      html += '<p>Failed to load poll data.</p>';
    }

  } else if (type === 'staff_manning') {
    // Staff manning report
    try {
      const members = await apiGet('/api/staff/members') || [];
      const posLabels = {};
      if (typeof _staffPositions !== 'undefined') _staffPositions.forEach(p => { posLabels[p.value] = p.label; });
      html += `<h2>${t('report_staff_manning_title')||'Staff Manning Overview'} (${members.length})</h2>`;
      if (members.length) {
        html += `<table><thead><tr><th>#</th><th>${t('staff_position')||'Position'}</th><th>${t('staff_assigned')||'Assigned To'}</th><th>${t('staff_note')||'Note'}</th><th>${t('staff_set_by')||'Set By'}</th><th>${t('report_updated')||'Updated'}</th></tr></thead><tbody>
        ${members.map((m,i) => `<tr>
          <td>${i+1}</td>
          <td><strong>${escHtml(posLabels[m.position] || m.position)}</strong></td>
          <td>${escHtml(m.user_name || '—')}</td>
          <td>${escHtml(m.note || '')}</td>
          <td>${escHtml(m.set_by_name || '')}</td>
          <td>${m.updated_at ? fmtDateTime(new Date(m.updated_at)) : '—'}</td>
        </tr>`).join('')}
        </tbody></table>`;
      } else {
        html += '<p style="color:#888">No staff manning data available.</p>';
      }
      const vacant = members.filter(m => !m.user_name && !m.user_id);
      const filled = members.filter(m => m.user_name || m.user_id);
      html += `<h2>${t('report_manning_summary')||'Manning Summary'}</h2>
      <table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>
        <tr><td><strong>${t('report_filled')||'Filled'}</strong></td><td>${filled.length}</td></tr>
        <tr><td><strong>${t('report_vacant')||'Vacant'}</strong></td><td>${vacant.length}</td></tr>
        <tr><td><strong>${t('report_total')||'Total'}</strong></td><td>${members.length}</td></tr>
      </tbody></table>`;
    } catch(err) {
      html += '<p>Failed to load staff manning data.</p>';
    }

  } else if (type === 'staff_duties') {
    // Staff duty list report
    try {
      const duties = await apiGet('/api/staff/duties') || [];
      html += `<h2>${t('report_staff_duties_title')||'Staff Duty List'} (${duties.length})</h2>`;
      if (duties.length) {
        html += `<table><thead><tr><th>#</th><th>${t('staff_role')||'Role'}</th><th>${t('staff_assigned')||'Assigned To'}</th><th>${t('staff_start')||'Start'}</th><th>${t('staff_end')||'End'}</th><th>${t('staff_note')||'Note'}</th><th>${t('staff_set_by')||'Set By'}</th></tr></thead><tbody>
        ${duties.map((d,i) => `<tr>
          <td>${i+1}</td>
          <td><strong>${escHtml(d.role)}</strong></td>
          <td>${escHtml(d.user_name || '—')}</td>
          <td>${d.start_time ? fmtDateTime(new Date(d.start_time)) : '—'}</td>
          <td>${d.end_time ? fmtDateTime(new Date(d.end_time)) : '—'}</td>
          <td>${escHtml(d.note || '')}</td>
          <td>${escHtml(d.set_by_name || '')}</td>
        </tr>`).join('')}
        </tbody></table>`;
      } else {
        html += '<p style="color:#888">No duty assignments found.</p>';
      }
    } catch(err) {
      html += '<p>Failed to load staff duty data.</p>';
    }

  } else if (type === 'staff_areas') {
    // Areas of responsibility report
    try {
      const areas = await apiGet('/api/staff/areas') || [];
      html += `<h2>${t('report_staff_areas_title')||'Areas of Responsibility'} (${areas.length})</h2>`;
      if (areas.length) {
        html += `<table><thead><tr><th>#</th><th>${t('staff_area_name')||'Area'}</th><th>${t('staff_area_desc')||'Description'}</th><th>${t('staff_assigned')||'Assigned To'}</th><th>${t('staff_area_created_by')||'Created By'}</th><th>${t('report_updated')||'Updated'}</th></tr></thead><tbody>
        ${areas.map((a,i) => `<tr>
          <td>${i+1}</td>
          <td><strong>${escHtml(a.name)}</strong></td>
          <td>${escHtml(a.description || '')}</td>
          <td>${escHtml(a.assigned_name || '—')}</td>
          <td>${escHtml(a.created_by_name || '')}</td>
          <td>${a.updated_at ? fmtDateTime(new Date(a.updated_at)) : '—'}</td>
        </tr>`).join('')}
        </tbody></table>`;
      } else {
        html += '<p style="color:#888">No areas of responsibility defined.</p>';
      }
    } catch(err) {
      html += '<p>Failed to load areas of responsibility data.</p>';
    }

  } else if (type === 'board_summary') {
    // Board summary report
    try {
      const boards = await apiGet('/api/boards') || [];
      html += `<h2>${t('report_board_summary_title')||'Board Summary'} (${boards.length} boards)</h2>`;
      for (const board of boards) {
        let items = [];
        try { items = await apiGet(`/api/boards/${board.id}/items`) || []; } catch(e) {}
        const cols = board.columns || [];
        const colMap = {};
        cols.forEach(c => { colMap[c.id] = c.name; });

        html += `<h2>${escHtml(board.name)} <small style="font-size:11px;color:#888">(${items.length} items)</small></h2>`;
        if (board.description) html += `<p style="color:#666;font-size:13px">${escHtml(board.description)}</p>`;

        // Items by column
        const byCol = {};
        cols.forEach(c => { byCol[c.id] = []; });
        items.forEach(item => {
          const cid = item.column_id || (cols.length ? cols[0].id : 'unknown');
          if (!byCol[cid]) byCol[cid] = [];
          byCol[cid].push(item);
        });

        cols.forEach(col => {
          const citems = byCol[col.id] || [];
          html += `<h3 style="font-size:14px;margin-top:12px">${escHtml(col.name)} (${citems.length})</h3>`;
          if (citems.length) {
            html += `<table><thead><tr><th>${t('board_subject')||'Subject'}</th><th>${t('board_assigned')||'Assigned'}</th><th>${t('board_priority')||'Priority'}</th><th>${t('board_due')||'Due'}</th><th>${t('board_tags')||'Tags'}</th></tr></thead><tbody>
            ${citems.map(item => `<tr>
              <td>${escHtml(item.subject)}</td>
              <td>${escHtml(item.assigned_name || '—')}</td>
              <td>${item.priority && item.priority !== 'normal' ? escHtml(item.priority) : '—'}</td>
              <td>${item.due_date ? fmtDateTime(new Date(item.due_date)) : '—'}</td>
              <td>${(item.tags || []).map(t => escHtml(t)).join(', ') || '—'}</td>
            </tr>`).join('')}
            </tbody></table>`;
          }
        });

        // Priority breakdown
        const byPrio = {};
        items.forEach(item => { const p = item.priority || 'normal'; byPrio[p] = (byPrio[p]||0) + 1; });
        html += `<h3 style="font-size:14px;margin-top:12px">${t('report_priority_breakdown')||'Priority Breakdown'}</h3>
        <table><thead><tr><th>Priority</th><th>Count</th></tr></thead><tbody>
        ${Object.entries(byPrio).map(([p,c]) => `<tr><td>${escHtml(p)}</td><td>${c}</td></tr>`).join('')}
        </tbody></table>`;
      }
      if (!boards.length) html += '<p style="color:#888">No boards found.</p>';
    } catch(err) {
      html += '<p>Failed to load board data.</p>';
    }

  } else if (type === 'technical_system') {
    // Technical / system report
    try {
      const users = await apiGet('/api/users') || [];
      const exercise = await apiGet('/api/exercise') || {};
      const boards = await apiGet('/api/boards') || [];
      const layers = state.layers || [];
      let auditEntries = [];
      try { auditEntries = await apiGet('/api/audit') || []; } catch(e) {}
      let backupInfo = null;
      try { backupInfo = await apiGet('/api/admin/gradual-backup'); } catch(e) {}

      html += `<h2>${t('report_technical_title')||'Technical / System Overview'}</h2>`;

      // Exercise info
      html += `<h3 style="font-size:14px;margin-top:16px">${t('exercise_title')||'Exercise Setup'}</h3>
      <table><tbody>
        <tr><td><strong>${t('exercise_name')||'Name'}</strong></td><td>${escHtml(exercise.name || '—')}</td></tr>
        <tr><td><strong>${t('exercise_start')||'Start'}</strong></td><td>${exercise.start_time ? fmtDateTime(new Date(exercise.start_time)) : '—'}</td></tr>
        <tr><td><strong>${t('exercise_end')||'End'}</strong></td><td>${exercise.end_time ? fmtDateTime(new Date(exercise.end_time)) : '—'}</td></tr>
        <tr><td><strong>${t('exercise_timezone')||'Timezone'}</strong></td><td>${escHtml(exercise.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)}</td></tr>
      </tbody></table>`;

      // Users summary
      const activeUsers = users.filter(u => !u.blocked);
      const blockedUsers = users.filter(u => u.blocked);
      html += `<h3 style="font-size:14px;margin-top:16px">${t('report_users_summary')||'Users'}</h3>
      <table><tbody>
        <tr><td><strong>${t('report_total_users')||'Total Users'}</strong></td><td>${users.length}</td></tr>
        <tr><td><strong>${t('report_active_users')||'Active'}</strong></td><td>${activeUsers.length}</td></tr>
        <tr><td><strong>${t('report_blocked_users')||'Blocked'}</strong></td><td>${blockedUsers.length}</td></tr>
      </tbody></table>`;

      // Data counts
      html += `<h3 style="font-size:14px;margin-top:16px">${t('report_data_overview')||'Data Overview'}</h3>
      <table><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>
        <tr><td>Timeline Events</td><td>${state.events ? state.events.length : 0}</td></tr>
        <tr><td>Layers</td><td>${layers.length}</td></tr>
        <tr><td>Boards</td><td>${boards.length}</td></tr>
        <tr><td>Audit Trail Entries</td><td>${auditEntries.length}</td></tr>
      </tbody></table>`;

      // Backup info
      if (backupInfo) {
        html += `<h3 style="font-size:14px;margin-top:16px">${t('report_backup_status')||'Backup Status'}</h3>
        <table><tbody>
          <tr><td><strong>${t('report_backup_enabled')||'Enabled'}</strong></td><td>${backupInfo.enabled ? 'Yes' : 'No'}</td></tr>
          <tr><td><strong>${t('report_backup_interval')||'Interval'}</strong></td><td>${backupInfo.interval_minutes || '—'} min</td></tr>
          <tr><td><strong>${t('report_backup_snapshots')||'Snapshots'}</strong></td><td>${(backupInfo.snapshots || []).length}</td></tr>
        </tbody></table>`;
      }

      // Recent audit activity (last 20 entries)
      if (auditEntries.length) {
        const recent = auditEntries.slice(0, 20);
        html += `<h3 style="font-size:14px;margin-top:16px">${t('report_recent_audit')||'Recent Audit Activity'} (last ${recent.length})</h3>
        <table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Type</th><th>Summary</th></tr></thead><tbody>
        ${recent.map(e => `<tr>
          <td>${e.timestamp ? fmtDateTime(new Date(e.timestamp)) : '—'}</td>
          <td>${escHtml(e.user_name || '')}</td>
          <td>${escHtml(e.action || '')}</td>
          <td>${escHtml(e.entity_type || '')}</td>
          <td>${escHtml(e.summary || '')}</td>
        </tr>`).join('')}
        </tbody></table>`;
      }
    } catch(err) {
      html += '<p>Failed to load system data.</p>';
    }

  } else {
    // timeline snapshot
    html += `<h2>Timeline Snapshot</h2>
    <table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Duration</th><th>Responsible</th><th>Created by</th></tr></thead><tbody>
    ${events.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).map(ev => `<tr>
      <td>${escHtml(ev.title)}</td>
      <td>${escHtml(ev.event_type)}</td>
      <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
      <td>${new Date(ev.start_time).toLocaleString()}</td>
      <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
      <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
      <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
      <td>${escHtml(ev.created_by_name||'')}</td>
    </tr>`).join('')}
    </tbody></table>`;
  }

  html += '</body></html>';

  const format = document.getElementById('reportFormat')?.value || 'html';
  const dateStr = new Date().toISOString().slice(0,10);

  let dlContent = html, dlMime = 'text/html;charset=utf-8', dlFilename = `report-${type}-${dateStr}.html`;

  if (format === 'print') {
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => { printWin.print(); }, 500);
    }
  } else if (format === 'docx') {
    dlContent = _reportToWordXML(html);
    dlMime = 'application/msword';
    dlFilename = `report-${type}-${dateStr}.doc`;
    _downloadBlob(dlContent, dlMime, dlFilename);
  } else if (format === 'rtf') {
    dlContent = _reportToRTF(html);
    dlMime = 'application/rtf';
    dlFilename = `report-${type}-${dateStr}.rtf`;
    _downloadBlob(dlContent, dlMime, dlFilename);
  } else if (format === 'excel') {
    dlContent = _reportToSpreadsheetML(html);
    dlMime = 'application/vnd.ms-excel';
    dlFilename = `report-${type}-${dateStr}.xls`;
    _downloadBlob(dlContent, dlMime, dlFilename);
  } else {
    _downloadBlob(html, 'text/html;charset=utf-8', dlFilename);
  }

  // Archive to infomanagement → local reports
  _archiveReportToLocal(dlContent, dlMime, dlFilename, title, type, 'report');

  closeModal('reportModal');
  showNotification('success', t('report_ready')||'Report downloaded');
}

// ── Archive report to infomanagement ─────────────────────────────────────────

function _archiveReportToLocal(content, mimeType, filename, title, reportType, source) {
  const blob = new Blob([content], { type: mimeType });
  const fd = new FormData();
  fd.append('file', blob, filename);
  fd.append('title', title);
  fd.append('description', (t('report_auto_archived') || 'Auto-saved when report was generated') + ' (' + source + ')');
  fd.append('category', 'local');
  fd.append('report_type', reportType);
  fd.append('tags', source);
  fetch('/api/report-archive', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd })
    .catch(() => { /* silent — archiving is best-effort */ });
}

// ── Report format helpers ────────────────────────────────────────────────────

function _downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], {type: mimeType});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function _parseReportHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.querySelector('h1')?.textContent?.trim() || 'Report';
  const sections = [];
  let cur = null;
  doc.body.childNodes.forEach(node => {
    if (!node.tagName) return;
    if (node.tagName === 'H1') return;
    if (node.tagName === 'H2') {
      cur = { heading: node.textContent.trim(), headers: [], rows: [] };
      sections.push(cur);
    } else if (node.tagName === 'TABLE' && cur) {
      cur.headers = [...node.querySelectorAll('thead th')].map(th => th.textContent.trim());
      cur.rows    = [...node.querySelectorAll('tbody tr')].map(tr =>
        [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      );
    }
  });
  return { title, sections };
}

function _reportToWordXML(html) {
  const { title, sections } = _parseReportHTML(html);
  const x = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><?mso-application progid="Word.Document"?>` +
    `<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">` +
    `<w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${x(title)}</w:t></w:r></w:p>`;
  sections.forEach(s => {
    out += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${x(s.heading)}</w:t></w:r></w:p>`;
    if (s.headers.length) {
      out += `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>`;
      out += `<w:tr>${s.headers.map(h=>`<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${x(h)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
      s.rows.forEach(row => {
        out += `<w:tr>${row.map(c=>`<w:tc><w:p><w:r><w:t>${x(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
      });
      out += `</w:tbl>`;
    }
  });
  return out + `</w:body></w:wordDocument>`;
}

function _reportToRTF(html) {
  const { title, sections } = _parseReportHTML(html);
  const x = s => s.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}')
    .replace(/[^\x00-\x7F]/g, c => `\\'${c.charCodeAt(0).toString(16).padStart(2,'0')}`);
  let out = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}\\widowctrl\n`;
  out += `{\\b\\fs28 ${x(title)}}\\par\\par\n`;
  sections.forEach(s => {
    out += `{\\b\\fs22 ${x(s.heading)}}\\par\n`;
    if (s.headers.length) {
      const cw = Math.floor(9000 / s.headers.length);
      const rowRTF = (cells, bold) => {
        let r = `{\\trowd\\trgaph120`;
        cells.forEach((_,i) => { r += `\\cellx${cw*(i+1)}`; });
        cells.forEach(c => { r += `\\intbl${bold?'{\\b ':'{ '}${x(c)}}\\cell`; });
        return r + `\\row}\n`;
      };
      out += rowRTF(s.headers, true);
      s.rows.forEach(row => { out += rowRTF(row, false); });
    }
    out += `\\par\n`;
  });
  return out + `}`;
}

function _reportToSpreadsheetML(html) {
  const { title, sections } = _parseReportHTML(html);
  const x = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cell = v => `<Cell><Data ss:Type="String">${x(v)}</Data></Cell>`;
  let rows = `<Row>${cell(title)}</Row><Row/>`;
  sections.forEach(s => {
    rows += `<Row>${cell(s.heading)}</Row>`;
    if (s.headers.length) {
      rows += `<Row>${s.headers.map(cell).join('')}</Row>`;
      s.rows.forEach(r => { rows += `<Row>${r.map(cell).join('')}</Row>`; });
    }
    rows += `<Row/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Worksheet ss:Name="Report"><Table>${rows}</Table></Worksheet></Workbook>`;
}

// ── Auto Report ─────────────────────────────────────────────────────────────
// Auto-report schedules — stored server-side; localStorage is used as fallback for client-only delivery

function openAutoReportModal() {
  _renderAutoReportList();
  openModal('autoReportModal');
}

async function _renderAutoReportList() {
  const el = document.getElementById('autoReportList');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm)">Loading…</p>';
  let list = [];
  try { list = await apiGet('/api/auto-report-schedules'); } catch { list = []; }
  if (!list || !list.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm)">No schedules configured yet.</p>';
    return;
  }
  const fmtLabel = {html:'HTML', excel:'Excel', rtf:'RTF', docx:'DOCX'};
  el.innerHTML = list.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:6px">
      <div>
        <strong>${escHtml(r.report_type)}</strong> — ${escHtml(r.frequency)}
        <span style="color:var(--accent);margin-left:6px">${escHtml(r.delivery)}</span>
        <span style="color:var(--text-dim);margin-left:6px;font-size:var(--fs-xs)">[${fmtLabel[r.format||'html']||escHtml(r.format||'html')}]</span>
        ${r.recipient ? `<span style="color:var(--text-dim);margin-left:8px">→ ${escHtml(r.recipient)}</span>` : ''}
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">Next: ${r.next_run ? new Date(r.next_run).toLocaleString() : 'soon'}</div>
      </div>
      <button class="btn btn-danger btn-sm" data-action="deleteAutoReport" data-arg="${r.id}">Remove</button>
    </div>
  `).join('');
  _bindActions(el);
}

async function addAutoReport() {
  const report_type = document.getElementById('arType')?.value || 'timeline';
  const frequency   = document.getElementById('arFrequency')?.value || 'daily';
  const format      = document.getElementById('arFormat')?.value || 'html';
  const delivery    = document.getElementById('arDelivery')?.value || 'download';
  const recipient   = document.getElementById('arRecipient')?.value?.trim() || '';

  if (delivery === 'email' && !recipient) {
    showError('Please enter a recipient email address for email delivery.', 'Validation');
    return;
  }
  if (delivery === 'webhook' && !recipient) {
    showError('Please enter a webhook URL for webhook delivery.', 'Validation');
    return;
  }

  const res = await apiPost('/api/auto-report-schedules', { report_type, frequency, format, delivery, recipient });
  if (res && res.ok !== false) {
    showNotification('success', 'Auto-report schedule added');
    const rec = document.getElementById('arRecipient');
    if (rec) rec.value = '';
    _renderAutoReportList();
  } else {
    showError('Failed to create schedule.', 'Auto-Report');
  }
}

async function deleteAutoReport(id) {
  const res = await api('DELETE', `/api/auto-report-schedules/${id}`, null);
  if (res && res.ok) {
    showNotification('success', 'Schedule removed');
    _renderAutoReportList();
  }
}

// checkAutoReports — server-side schedules are handled by the Go scheduler.
// This client-side check handles legacy localStorage download-only schedules.
function checkAutoReports() {
  // No-op: server-side scheduling handles email/webhook delivery.
  // Download-only schedules created before server-side support remain in localStorage.
  try {
    const list = JSON.parse(localStorage.getItem('autoReports') || '[]');
    const now  = Date.now();
    let changed = false;
    list.forEach((r, i) => {
      if (r.nextRun && r.nextRun <= now) {
        if (r.delivery === 'download') _runAutoReport(r);
        const msBack = r.frequency === 'hourly' ? 3600000 : r.frequency === 'weekly' ? 7*86400000 : 86400000;
        list[i].nextRun = now + msBack;
        changed = true;
      }
    });
    if (changed) localStorage.setItem('autoReports', JSON.stringify(list));
  } catch { /* ignore */ }
}

async function _runAutoReport(r) {
  // Build events for last period
  const to   = new Date();
  const msBack = r.frequency === 'hourly' ? 3600000 : r.frequency === 'weekly' ? 7*86400000 : 86400000;
  const from  = new Date(Date.now() - msBack);

  const events = state.events.filter(ev => {
    const evStart = new Date(ev.start_time);
    return evStart >= from && evStart < to;
  });

  const rtype = r.report_type || r.type || 'timeline';
  const title = `Auto ${rtype.toUpperCase()} Report — ${from.toLocaleDateString()} to ${to.toLocaleDateString()}`;
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
  <style>body{font-family:sans-serif;margin:32px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ccc;padding:6px 10px}th{background:#f0f0f0}</style></head><body>
  <h1>${escHtml(title)}</h1><p style="color:#666;font-size:13px">Auto-generated: ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>End</th></tr></thead><tbody>
  ${events.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).map(ev => `<tr>
    <td>${escHtml(ev.title)}</td>
    <td>${escHtml(ev.event_type)}</td>
    <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
    <td>${new Date(ev.start_time).toLocaleString()}</td>
    <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
  </tr>`).join('')}
  </tbody></table></body></html>`;

  if (r.delivery === 'download') {
    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `auto-report-${rtype}-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else if (r.delivery === 'webhook' && r.recipient) {
    try {
      await fetch(r.recipient, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text: `Auto report ready: ${title}`, html})
      });
    } catch { /* silent fail */ }
  } else if (r.delivery === 'email' && r.recipient) {
    // Send via server-side mail API if available
    try {
      await apiPost('/api/mail/send', {
        to: r.recipient,
        subject: title,
        body_html: html
      });
    } catch { /* silent fail */ }
  }
  showNotification('success', `Auto report generated: ${title}`);
}

