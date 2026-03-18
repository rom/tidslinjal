/* ── Task-Time Matrix Rendering, Detach, Print ── */
// ── Task-Time Matrix ──────────────────────────────────────────────────────────
function _renderTaskTimeMatrixTable(dateFrom, dateTo) {
  const el = document.getElementById('taskTimeMatrixContent');
  if (!el) return;
  const events = (state.events || []).filter(ev => ev.start_time && ev.title);
  if (!events.length) {
    el.innerHTML = `<p style="color:var(--text-dim)">${t('ttm_no_events')||'No events to display in the matrix.'}</p>`;
    return;
  }
  const sorted = events.slice().sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
  let minT = dateFrom ? new Date(dateFrom) : new Date(sorted[0].start_time);
  let maxT = dateTo ? new Date(dateTo + 'T23:59:59') : new Date(sorted[sorted.length-1].end_time || sorted[sorted.length-1].start_time);
  minT = new Date(minT.getFullYear(), minT.getMonth(), minT.getDate(), minT.getHours());
  maxT = new Date(maxT.getFullYear(), maxT.getMonth(), maxT.getDate(), maxT.getHours()+1);
  const hours = [];
  for (let tm = new Date(minT); tm < maxT; tm = new Date(tm.getTime() + 3600000)) {
    hours.push(new Date(tm));
    if (hours.length > 336) break; // max 2 weeks
  }
  if (hours.length === 0) { el.innerHTML = `<p style="color:var(--text-dim)">${t('ttm_no_range')||'No valid time range.'}</p>`; return; }
  // Build phase lookup for the matrix time range
  const phases = (state.phases || []).slice().sort((a,b) => (a.order||0) - (b.order||0));
  const _phaseForHour = (hTime) => {
    for (const ph of phases) {
      const ps = new Date(ph.start_time).getTime();
      const pe = new Date(ph.end_time).getTime();
      if (hTime >= ps && hTime < pe) return ph;
    }
    return null;
  };
  let html = `<table class="ttm-table" style="border-collapse:collapse;font-size:var(--fs-sm,11px);width:100%"><thead>`;
  // Phase row
  if (phases.length > 0) {
    html += `<tr><th style="padding:2px 6px;position:sticky;left:0;background:var(--bg2);z-index:2;min-width:180px;text-align:left;font-size:9px;color:var(--text-dim)">${t('ttm_phase')||'Phase'}</th>`;
    let i = 0;
    while (i < hours.length) {
      const ph = _phaseForHour(hours[i].getTime());
      if (ph) {
        let span = 1;
        while (i + span < hours.length && _phaseForHour(hours[i + span].getTime())?.id === ph.id) span++;
        html += `<th colspan="${span}" style="padding:2px 4px;text-align:center;font-size:9px;font-weight:600;color:#fff;background:${escHtml(ph.color || 'var(--accent)')};border-left:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(ph.name)}</th>`;
        i += span;
      } else {
        html += `<th style="padding:2px;border-left:1px solid var(--border)"></th>`;
        i++;
      }
    }
    html += '</tr>';
  }
  // Time header row
  html += `<tr><th style="padding:4px 6px;position:sticky;left:0;background:var(--bg2);z-index:2;min-width:180px;text-align:left">${t('ttm_task')||'Task'}</th>`;
  hours.forEach(h => {
    const dayChanged = h.getHours() === 0;
    const lbl = dayChanged ? h.toLocaleDateString(undefined,{month:'short',day:'numeric'}) + ' 00' : String(h.getHours()).padStart(2,'0');
    const ph = _phaseForHour(h.getTime());
    const phBg = ph ? `background:color-mix(in srgb, ${ph.color} 15%, var(--bg2));` : '';
    html += `<th style="padding:3px 2px;min-width:28px;text-align:center;border-left:${dayChanged?'2':'1'}px solid var(--border);font-weight:${dayChanged?700:400};color:${dayChanged?'var(--accent)':'var(--text-dim)'};${phBg}">${lbl}</th>`;
  });
  html += '</tr></thead><tbody>';
  const etMap = {};
  (state.eventTypes||[]).forEach(et => etMap[et.key] = et);
  sorted.forEach(ev => {
    const evStart = new Date(ev.start_time).getTime();
    const evEnd = new Date(ev.end_time || ev.start_time).getTime();
    if (evEnd < minT.getTime() || evStart > maxT.getTime()) return; // outside range
    const et = etMap[ev.event_type];
    const color = et?.color || ev.color || 'var(--accent)';
    html += `<tr><td style="padding:4px 6px;position:sticky;left:0;background:var(--bg2);color:var(--text);z-index:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px" title="${escHtml(ev.title)}">${escHtml(ev.title)}</td>`;
    hours.forEach(h => {
      const hStart = h.getTime();
      const hEnd = hStart + 3600000;
      const active = evStart < hEnd && evEnd > hStart;
      html += `<td style="padding:0;border-left:1px solid var(--border);${active ? 'background:'+color+';opacity:0.8' : ''}">&nbsp;</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;

  // ── Current time line in task-time matrix ──
  const p = state.preferences || {};
  if (p.red_line_enabled !== false) {
    const now = typeof getNow === 'function' ? getNow() : new Date();
    const nowMs = now.getTime();
    if (nowMs >= minT.getTime() && nowMs <= maxT.getTime()) {
      const table = el.querySelector('.ttm-table');
      if (table) {
        const headerCells = table.querySelectorAll('thead th');
        // Find which column the current time falls into
        for (let i = 0; i < hours.length; i++) {
          const hStart = hours[i].getTime();
          const hEnd = hStart + 3600000;
          if (nowMs >= hStart && nowMs < hEnd) {
            const fraction = (nowMs - hStart) / 3600000;
            const colIdx = i + 1; // +1 for the task name column
            const lineColor = p.red_line_color || '#E74C3C';
            const lineWidth = p.red_line_width || 2;
            const lineStyle = p.red_line_style || 'solid';
            // Add a marker line via CSS overlay
            table.style.position = 'relative';
            const marker = document.createElement('div');
            marker.className = 'ttm-now-line';
            marker.style.cssText = `position:absolute;top:0;bottom:0;width:${lineWidth}px;border-left:${lineWidth}px ${lineStyle} ${lineColor};z-index:5;pointer-events:none`;
            // Calculate left position based on column offset
            const thEl = headerCells[colIdx];
            if (thEl) {
              const tableRect = table.getBoundingClientRect();
              const thRect = thEl.getBoundingClientRect();
              const leftPx = (thRect.left - tableRect.left) + (thRect.width * fraction);
              marker.style.left = leftPx + 'px';
              // Now label
              const label = document.createElement('span');
              label.textContent = '▶ ' + (t('ttm_now') || 'Now');
              label.style.cssText = `position:absolute;top:-2px;left:2px;font-size:9px;color:${lineColor};background:var(--bg2);padding:0 3px;white-space:nowrap;z-index:6`;
              marker.appendChild(label);
              table.parentElement.style.position = 'relative';
              table.parentElement.appendChild(marker);
              // Recalculate on scroll
              const wrapper = el;
              const recalc = () => {
                const tr2 = table.getBoundingClientRect();
                const th2 = thEl.getBoundingClientRect();
                marker.style.left = ((th2.left - tr2.left) + (th2.width * fraction)) + 'px';
                marker.style.top = '0';
                marker.style.height = table.offsetHeight + 'px';
              };
              wrapper.addEventListener('scroll', recalc);
              setTimeout(recalc, 50);
            }
            break;
          }
        }
      }
    }
  }
}

function openTaskTimeMatrix() {
  const events = (state.events || []).filter(ev => ev.start_time && ev.title);
  if (events.length) {
    const sorted = events.slice().sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
    const fromEl = document.getElementById('ttmDateFrom');
    const toEl = document.getElementById('ttmDateTo');
    if (fromEl && !fromEl.value) fromEl.value = new Date(sorted[0].start_time).toISOString().slice(0,10);
    if (toEl && !toEl.value) toEl.value = new Date(sorted[sorted.length-1].end_time || sorted[sorted.length-1].start_time).toISOString().slice(0,10);
  }
  _renderTaskTimeMatrixTable(document.getElementById('ttmDateFrom')?.value, document.getElementById('ttmDateTo')?.value);
  openModal('taskTimeMatrixModal');
  // Bind date apply
  document.getElementById('ttmApplyDates')?.addEventListener('click', () => {
    _renderTaskTimeMatrixTable(document.getElementById('ttmDateFrom')?.value, document.getElementById('ttmDateTo')?.value);
  });
  // Bind detach
  document.getElementById('ttmDetach')?.addEventListener('click', _detachTaskTimeMatrix);
  // Bind print
  document.getElementById('ttmPrint')?.addEventListener('click', _printTaskTimeMatrix);
}

function _detachTaskTimeMatrix() {
  const content = document.getElementById('taskTimeMatrixContent')?.innerHTML || '';
  const theme = document.body.className || 'theme-dark';
  const w = window.open('', 'ttm-' + Date.now(), 'width=1400,height=700,menubar=no,toolbar=no');
  if (!w) return;
  const css = document.querySelector('link[href*="style.css"]');
  const cssHref = css ? css.href : '/static/style.css';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${t('btn_task_time_matrix')||'Task-Time Matrix'}</title>
<link rel="stylesheet" href="${cssHref}">
<style>
body{padding:20px;overflow:auto}
.ttm-table{border-collapse:collapse;font-size:11px;width:100%}
.ttm-table th,.ttm-table td{border:1px solid var(--border)}
@media print{body{background:#fff;color:#000} .ttm-table th{background:#eee!important;color:#000!important} .no-print{display:none!important}}
</style></head><body class="${theme}">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px" class="no-print">
  <h2>${t('btn_task_time_matrix')||'Task-Time Matrix'}</h2>
  <button class="btn btn-primary btn-sm" id="ttmPrintBtn">🖨 ${t('btn_print')||'Print'}</button>
</div>
${content}
</body></html>`);
  w.document.close();
  const printBtn = w.document.getElementById('ttmPrintBtn');
  if (printBtn) printBtn.addEventListener('click', () => w.print());
}

function _printTaskTimeMatrix() {
  _detachTaskTimeMatrix();
}

