/* ============================================================
   Tidslinjal v3.4.0 — Collaborative Operational Timeline
   ============================================================ */
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
window.state = {
  user:        null,
  events:      [],
  locks:       [],
  alarms:      [],
  layers:      [],
  groups:      [],
  eventTypes:  [],
  phases:      [],
  preferences: {
    theme:           'dark',
    size:            'small',
    language:        'en',
    day_start_hour:  0,
    day_end_hour:    24,
    hidden_types:    [],
    active_layers:   [],
    hidden_layers:   [],
    default_view:    'week',
    show_out_of_hours: true,
    red_line_enabled: true,
    red_line_color:  '#E74C3C',
    red_line_width:  2,
    red_line_style:  'solid',
    synth_label:     false,
  },
  resolution:    'hour',
  range:         'week',
  startDate:     startOfDay(new Date()),
  sidebarTab:    'legend',
  search:        '',
  zoomFactor:    1.0,
  exercise:      { enabled: false, epoch: '', label: '', paused: false, paused_at: '' },
  syntheticOn:   false, // user's local toggle (independent of exercise.enabled)
  timelinePaused: false, // local freeze state
  pausedAt:      null,   // Date when frozen
};

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('unauth'); }
  return res;
}
async function apiGet(p)        { return (await api('GET', p)).json(); }
async function apiPost(p, b)    { return api('POST', p, b); }
async function apiPut(p, b)     { return api('PUT', p, b); }
async function apiDel(p)        { return api('DELETE', p); }

// ── Error display ───────────────────────────────────────────────────────────
function showError(msg, title) {
  const modal = document.getElementById('errorModal');
  if (!modal) { alert(msg); return; }
  document.getElementById('errorModalTitle').textContent = title || 'Error';
  document.getElementById('errorModalMsg').textContent  = msg;
  openModal('errorModal');
}
function showConfirm(msg) { return window.confirm(msg); }

// ── Date utilities ─────────────────────────────────────────────────────────
function startOfDay(d) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth()+n); return r; }
function addHours(d, h) { const r = new Date(d); r.setHours(r.getHours()+h); return r; }
function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function fmtDateInput(d) {
  if (!d) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtTime(d) {
  return d.toLocaleTimeString(getLocale(), {hour:'2-digit', minute:'2-digit', hour12:false});
}
function fmtDateTime(d) {
  return d.toLocaleString(getLocale(), {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false});
}
function fmtFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

function recurStepMs(pattern) {
  const map = {
    '30min':     30 * 60000,
    'hourly':    60 * 60000,
    '2hours':   120 * 60000,
    '3hours':   180 * 60000,
    '4hours':   240 * 60000,
    'daily':   1440 * 60000,
    'weekly':  7 * 1440 * 60000,
    'monthly':  null, // handled separately
    'quarterly': null,
  };
  return map[pattern] || null;
}

// ── Range helpers ──────────────────────────────────────────────────────────
function getRangeDays() {
  switch (state.range) {
    case 'day':     return 1;
    case '2days':   return 2;
    case '3days':   return 3;
    case '4days':   return 4;
    case 'week':    return 7;
    case 'month':   return daysInMonth(state.startDate);
    case '2months': return daysInMonth(state.startDate) + daysInMonth(addMonths(state.startDate,1));
    case '3months': return daysInMonth(state.startDate) + daysInMonth(addMonths(state.startDate,1)) + daysInMonth(addMonths(state.startDate,2));
    default:        return 7;
  }
}
function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
}
function getDays() {
  const n = getRangeDays();
  return Array.from({length:n}, (_, i) => addDays(state.startDate, i));
}
function getViewEnd() { return addDays(state.startDate, getRangeDays()); }

// ── Slot helpers ───────────────────────────────────────────────────────────
function getSlotMinutes() {
  switch (state.resolution) {
    case 'ten':     return 10;
    case 'quarter': return 15;
    case 'hour':    return 60;
    case 'day':     return 1440;
    default:        return 60;
  }
}
function getSlotsPerDay() {
  // Always render the full 24h; out-of-hours slots are grayed
  if (state.resolution === 'day') return 1;
  return Math.round(1440 / getSlotMinutes());
}
function getSlotHeight() {
  const s = getComputedStyle(document.documentElement);
  let h;
  switch (state.resolution) {
    case 'ten':     h = parseInt(s.getPropertyValue('--slot-h-ten'))     || 24; break;
    case 'quarter': h = parseInt(s.getPropertyValue('--slot-h-quarter')) || 18; break;
    case 'hour':    h = parseInt(s.getPropertyValue('--slot-h-hour'))    || 40; break;
    case 'day':     h = parseInt(s.getPropertyValue('--slot-h-day'))     || 80; break;
    default:        h = 40;
  }
  return Math.max(6, Math.round(h * (state.zoomFactor || 1.0)));
}
function getStartHourOffset() {
  // Always from midnight — full day is always rendered
  return 0;
}
function isOutOfHours(slotIdx) {
  if (state.resolution === 'day') return false;
  const min     = slotIdx * getSlotMinutes();
  const startH  = (state.preferences.day_start_hour || 0) * 60;
  const endH    = (state.preferences.day_end_hour   || 24) * 60;
  return min < startH || min >= endH;
}
function slotLabel(slotIdx) {
  if (state.resolution === 'day') return '';
  const minutes = slotIdx * getSlotMinutes();
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  if (state.resolution === 'hour') return `${String(h).padStart(2,'0')}:00`;
  if (m === 0) return `${String(h).padStart(2,'0')}:00`;
  if (state.resolution === 'quarter' && m === 30) return `${String(h).padStart(2,'0')}:30`;
  return '';
}

// ── Preferences helpers ────────────────────────────────────────────────────
function isTypeHidden(key) {
  return (state.preferences.hidden_types || []).includes(key);
}
function isLayerActive(id) {
  // A layer is active (visible) when it is NOT in the hidden_layers exclusion list
  return !(state.preferences.hidden_layers || []).includes(id);
}
function isLayerHidden(id) {
  return (state.preferences.hidden_layers || []).includes(id);
}

// ── Timeline render ────────────────────────────────────────────────────────
function renderTimeline() {
  // Update zoom-dependent CSS variable so event font/icons scale with zoom
  const zf = state.zoomFactor || 1.0;
  document.documentElement.style.setProperty('--ev-zoom-scale', Math.max(0.7, Math.min(2.0, zf)).toFixed(3));

  const container = document.getElementById('timeline');
  const days       = getDays();
  const slots      = getSlotsPerDay();
  const slotH      = getSlotHeight();
  const timeColW   = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--time-col-w')) || 52;
  const today      = new Date();

  container.style.gridTemplateColumns =
    `${timeColW}px ${days.map(() => 'minmax(var(--day-col-min),1fr)').join(' ')}`;

  let html = '';

  // ── Header row ───────────────────────────────────────────────────────────
  html += `<div class="tl-corner" style="height:44px"></div>`;
  days.forEach(day => {
    const isToday = isSameDay(day, today);
    const useSync = synthActive();
    const dayName = useSync ? synthDayHeader(day) : localDayName(day);
    const dayDate = useSync
      ? `<small style="font-size:.75em;opacity:.65">${localShortDate(day)}</small>`
      : localShortDate(day);
    html += `<div class="tl-day-header${isToday?' today':''}" data-date="${day.toISOString()}">
      <div class="tl-day-name">${dayName}</div>
      <div class="tl-day-date">${dayDate}${isToday?'<span class="today-marker"></span>':''}</div>
    </div>`;
  });

  // ── Body rows ─────────────────────────────────────────────────────────────
  for (let s = 0; s < slots; s++) {
    const label  = slotLabel(s);
    const oohLbl = isOutOfHours(s) ? ' out-of-hours' : '';
    html += `<div class="tl-time-label${oohLbl}" style="height:${slotH}px">${label}</div>`;

    const startOffset = getStartHourOffset();
    days.forEach((day, di) => {
      const slotStartMin = startOffset + s * getSlotMinutes();
      const slotStart    = new Date(day);
      slotStart.setHours(0, slotStartMin, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + getSlotMinutes() * 60000);

      const locked = state.locks.some(l => {
        const ls = new Date(l.start_time), le = new Date(l.end_time);
        return slotStart < le && slotEnd > ls;
      });
      const isHalf = state.resolution === 'quarter' && (s % 2 === 1);
      const isCur  = isCurrentSlot(slotStart, slotEnd);

      const ooh = isOutOfHours(s);
      html += `<div class="tl-cell${locked?' locked':''}${isHalf?' half-hour':''}${isCur?' tl-row-current':''}${ooh?' out-of-hours':''}"
        style="height:${slotH}px"
        data-day="${di}" data-slot="${s}"
        data-start="${slotStart.toISOString()}"
        ${(locked || ooh) ? `title="${locked?'Locked':'Outside configured hours'}"` : `onclick="onCellClick(event,'${slotStart.toISOString()}','${slotEnd.toISOString()}',${ooh})"`}
      ></div>`;
    });
  }

  container.innerHTML = html;
  renderEventBlocks(days, slotH);
  updateCurrentTimeLine(days, slotH);
}

function isCurrentSlot(s, e) {
  const now = new Date(); return now >= s && now < e;
}

// ── Event block rendering ──────────────────────────────────────────────────
function renderEventBlocks(days, slotH) {
  const container  = document.getElementById('timeline');
  const headerH    = 44;
  const slotMin    = getSlotMinutes();
  const slots      = getSlotsPerDay();
  const startOff   = 0; // always from midnight (full 24h view)
  const endOff     = 1440;

  requestAnimationFrame(() => {
    const cells = container.querySelectorAll('.tl-cell');
    if (!cells.length) return;

    // FIX: cells are in slot-major order (outer=slot, inner=day).
    // First slot row occupies indices 0..days-1, so day[di] first-slot cell = cells[di].
    const dayMeta = days.map((_, di) => {
      const cell = cells[di]; // correct: index di = slot=0, day=di
      return cell ? { left: cell.offsetLeft, width: cell.offsetWidth } : null;
    });

    container.querySelectorAll('.event-block,.lock-overlay,.lock-label').forEach(el => el.remove());

    // ── Exercise Phase overlays ───────────────────────────────────────────────
    container.querySelectorAll('.phase-overlay,.phase-label').forEach(el => el.remove());
    if (state.phases && state.phases.length > 0) {
      state.phases.forEach(ph => {
        const phStart = new Date(ph.start_time);
        const phEnd   = new Date(ph.end_time);
        days.forEach((day, di) => {
          if (!dayMeta[di]) return;
          const dayStart = new Date(day), dayEnd = addDays(day, 1);
          if (phEnd <= dayStart || phStart >= dayEnd) return;
          const visStart = phStart < dayStart ? dayStart : phStart;
          const visEnd   = phEnd   > dayEnd   ? dayEnd   : phEnd;
          const vsMin = visStart.getHours()*60 + visStart.getMinutes();
          const veMin = Math.min(visEnd.getHours()*60 + visEnd.getMinutes() || 1440, 1440);
          if (veMin <= vsMin) return;
          const topPx    = headerH + (vsMin / slotMin) * slotH;
          const heightPx = Math.max(((veMin - vsMin) / slotMin) * slotH, 4);
          const el = document.createElement('div');
          el.className = 'phase-overlay';
          el.style.cssText = `top:${topPx}px;left:${dayMeta[di].left}px;width:${dayMeta[di].width}px;height:${heightPx}px;background:${ph.color};border-color:${ph.color};`;
          container.appendChild(el);
          if (di === 0) {
            const lbl = document.createElement('div');
            lbl.className = 'phase-label';
            lbl.style.cssText = `top:${topPx}px;left:${dayMeta[di].left}px;background:${ph.color};color:#fff;`;
            lbl.textContent = ph.name;
            container.appendChild(lbl);
          }
        });
      });
    }

    // ── Synthetic H+N hour labels on time column ──────────────────────────────
    container.querySelectorAll('.synth-hour-label').forEach(el => el.remove());
    if (synthActive() && state.preferences.synth_label) {
      const epoch = new Date(state.exercise.epoch);
      const dayHrsOnly = state.exercise.day_hours_only;
      for (let s = 0; s < slots; s++) {
        const min = s * slotMin;
        if (min % 60 !== 0) continue; // only show on full-hour slots
        // When day_hours_only is on, don't show H+N labels outside day hours
        if (dayHrsOnly && isOutOfHours(s)) continue;
        const slotTime = new Date(days[0]);
        slotTime.setHours(0, min, 0, 0);
        const hoursOn = synthElapsedHours(epoch.getTime(), slotTime.getTime());
        if (hoursOn < 0) continue;
        const topPx = headerH + s * slotH;
        const lbl = document.createElement('div');
        lbl.className = 'synth-hour-label';
        lbl.style.cssText = `top:${topPx + 2}px;`;
        lbl.textContent = `H+${hoursOn}`;
        container.appendChild(lbl);
      }
    }

    // ── Events ───────────────────────────────────────────────────────────────
    const searchTerm = (state.search||'').trim().toLowerCase();
    const hl         = state.preferences.hidden_layers || [];
    const dayStartMin = (state.preferences.day_start_hour || 0) * 60;
    const dayEndMin   = (state.preferences.day_end_hour   || 24) * 60;

    // Expand recurring events into occurrences for the current view
    const viewStart = days[0];
    const viewEnd   = addDays(days[days.length - 1], 1);
    const expandedEvents = [];
    state.events.forEach(ev => {
      if (!ev.is_recurring || !ev.recurrence_pattern) {
        expandedEvents.push(ev);
        return;
      }
      // Add the master event if it falls in view
      expandedEvents.push(ev);
      // Generate occurrences
      const evStart = new Date(ev.start_time);
      const evEnd   = ev.end_time ? new Date(ev.end_time) : addHours(evStart, 1);
      const duration = evEnd - evStart;
      const recEnd = ev.recurrence_end ? new Date(ev.recurrence_end) : viewEnd;
      const stepMs = recurStepMs(ev.recurrence_pattern);
      if (!stepMs) return;
      const exclSet = new Set((ev.recurrence_excl || []).map(ts => new Date(ts).getTime()));
      let cur = new Date(evStart.getTime() + stepMs);
      let safety = 0;
      while (cur < viewEnd && cur <= recEnd && safety++ < 500) {
        const occEnd = new Date(cur.getTime() + duration);
        if (cur >= viewStart) {
          // Skip excluded occurrences
          if (exclSet.has(cur.getTime())) {
            cur = new Date(cur.getTime() + stepMs);
            continue;
          }
          // Skip recurring instances that fall entirely outside day hours
          const occStartMin = cur.getHours()*60 + cur.getMinutes();
          const occEndMin   = occEnd.getHours()*60 + occEnd.getMinutes() || 1440;
          if (occEndMin <= dayStartMin || occStartMin >= dayEndMin) {
            cur = new Date(cur.getTime() + stepMs);
            continue;
          }
          expandedEvents.push({
            ...ev,
            id: ev.id + '_' + cur.getTime(), // synthetic id
            start_time: cur.toISOString(),
            end_time: occEnd.toISOString(),
            _recurring_instance: true,
          });
        }
        cur = new Date(cur.getTime() + stepMs);
      }
    });

    const visibleEvents = expandedEvents.filter(ev =>
      !isTypeHidden(ev.event_type) &&
      // Layer visibility: hide events whose layer is in the hidden_layers exclusion list
      (ev.layer_id == null || !hl.includes(ev.layer_id)) &&
      (!searchTerm ||
        ev.title.toLowerCase().includes(searchTerm) ||
        (ev.description||'').toLowerCase().includes(searchTerm) ||
        (ev.created_by_name||'').toLowerCase().includes(searchTerm)
      )
    );

    // Build per-day collision lists for side-by-side layout
    // evsByDay[di] = [{ev, evStart, evEnd, vsOff, veOff, topPx, heightPx}]
    const evsByDay = days.map(() => []);

    visibleEvents.forEach(ev => {
      const evStart = new Date(ev.start_time);
      const evEnd   = ev.end_time ? new Date(ev.end_time) : addHours(evStart, 1);

      days.forEach((day, di) => {
        if (!dayMeta[di]) return;
        const dayStart = new Date(day);
        const dayEnd   = addDays(day, 1);
        if (evEnd <= dayStart || evStart >= dayEnd) return;

        const visStart = evStart < dayStart ? dayStart : evStart;
        const visEnd   = evEnd   > dayEnd   ? dayEnd   : evEnd;

        const vsMin = visStart.getHours()*60 + visStart.getMinutes();
        const veMin = visEnd.getHours()*60   + visEnd.getMinutes();

        const vsOff = Math.max(vsMin, startOff);
        const veOff = Math.min(veMin === 0 && visEnd >= dayEnd ? 1440 : veMin, endOff);
        if (veOff <= vsOff) return;

        const topPx    = headerH + ((vsOff - startOff) / slotMin) * slotH;
        const heightPx = Math.max(((veOff - vsOff) / slotMin) * slotH - 2, 14);
        evsByDay[di].push({ ev, evStart, evEnd, vsOff, veOff, topPx, heightPx });
      });
    });

    // Assign columns for overlapping events within each day
    days.forEach((day, di) => {
      if (!dayMeta[di]) return;
      const items = evsByDay[di];
      if (!items.length) return;

      // Sort by start time
      items.sort((a, b) => a.vsOff - b.vsOff);

      // Greedy column assignment
      const colEnd = []; // colEnd[c] = veOff of last event assigned to column c
      const colOf  = [];
      items.forEach(item => {
        let col = colEnd.findIndex(e => e <= item.vsOff);
        if (col === -1) { col = colEnd.length; colEnd.push(0); }
        colEnd[col] = item.veOff;
        colOf.push(col);
      });
      const totalCols = colEnd.length;

      // Compute per-event local overlap count (max concurrent events at that slot)
      const localCols = items.map((item, idx) => {
        let maxCols = colOf[idx] + 1;
        for (let j = 0; j < items.length; j++) {
          if (j === idx) continue;
          if (items[j].vsOff < item.veOff && items[j].veOff > item.vsOff) {
            maxCols = Math.max(maxCols, colOf[j] + 1);
          }
        }
        return maxCols;
      });

      const { left: cellLeft, width: cellWidth } = dayMeta[di];
      const PAD = 2;

      items.forEach((item, idx) => {
        const col     = colOf[idx];
        const numCols = localCols[idx]; // only as many cols as needed for this event's group
        const colW    = Math.floor((cellWidth - PAD*2) / numCols);
        const blockL  = cellLeft + PAD + col * colW;
        const blockW  = colW - (col < numCols-1 ? 1 : 0); // small gap between cols

        const { ev, evStart, evEnd, topPx, heightPx } = item;

        // Layer color border
        let borderL = 'rgba(255,255,255,.3)';
        if (ev.layer_id) {
          const layer = state.layers.find(l => l.id === ev.layer_id);
          if (layer) borderL = layer.color || borderL;
        }

        // Build icons
        const statusDot = ev.status && ev.status !== 'planned'
          ? `<span class="ev-status-dot ev-status-${ev.status}" title="${ev.status}"></span>` : '';
        const recurIcon = ev.is_recurring
          ? `<span class="ev-icon" title="Recurring">↻</span>` : '';
        // "Edited" = updated more than 10 s after creation
        const createdAt = ev.created_at ? new Date(ev.created_at) : null;
        const updatedAt = ev.updated_at ? new Date(ev.updated_at) : null;
        const editedIcon = (createdAt && updatedAt && (updatedAt - createdAt) > 10000)
          ? `<span class="ev-icon" title="Modified ${fmtDateTime(updatedAt)}">✎</span>` : '';
        const attachIcon = ev.attachment_count > 0
          ? `<span class="ev-icon" title="${ev.attachment_count} attachment(s)">📎</span>` : '';
        const commentIcon = ev.comment_count > 0
          ? `<span class="ev-icon" title="${ev.comment_count} comment(s)">💬</span>` : '';
        const allDayIcon = ev.all_day
          ? `<span class="ev-icon" title="Day-only">📅</span>` : '';

        const block = document.createElement('div');
        block.className = 'event-block';
        block.dataset.evId = ev.id;
        block.style.cssText = `top:${topPx}px;left:${blockL}px;width:${blockW}px;height:${heightPx}px;background:${ev.color||'#4A90D9'};border-left-color:${borderL};cursor:grab;`;
        if (ev.status === 'cancelled') block.style.opacity = '0.45';
        if (ev.status === 'rejected')  block.style.outline = '2px solid var(--red)';
        if (ev.status === 'verified')  block.style.outline = '2px solid var(--green)';
        block.innerHTML = `
          <div class="ev-title">${statusDot}${escHtml(ev.title)}${recurIcon}${editedIcon}${attachIcon}${commentIcon}${allDayIcon}</div>
          ${heightPx > 28 ? `<div class="ev-time">${fmtTime(evStart)}${ev.end_time?'–'+fmtTime(evEnd):''}</div>` : ''}
          ${heightPx > 44 ? `<div class="ev-creator">${escHtml(ev.created_by_name||'')}</div>` : ''}
        `;
        block.onclick = e => {
          e.stopPropagation();
          if (ev._recurring_instance) {
            // Track which occurrence was clicked for recurring delete dialog
            state._currentOccurrenceTime = new Date(ev.start_time);
            const masterEv = state.events.find(x => x.id === parseInt(String(ev.id).split('_')[0], 10)) || ev;
            showEventDetail(masterEv);
          } else {
            state._currentOccurrenceTime = null;
            showEventDetail(ev);
          }
        };
        container.appendChild(block);
      });
    });

    // ── Lock overlays ────────────────────────────────────────────────────────
    state.locks.forEach(lk => {
      const lkStart = new Date(lk.start_time);
      const lkEnd   = new Date(lk.end_time);
      days.forEach((day, di) => {
        if (!dayMeta[di]) return;
        const dayStart = new Date(day), dayEnd = addDays(day, 1);
        if (lkEnd <= dayStart || lkStart >= dayEnd) return;
        const visStart = lkStart < dayStart ? dayStart : lkStart;
        const visEnd   = lkEnd   > dayEnd   ? dayEnd   : lkEnd;
        const vsMin = Math.max(visStart.getHours()*60+visStart.getMinutes(), startOff);
        const veMin = Math.min(visEnd.getHours()*60+visEnd.getMinutes() || 24*60, endOff);
        if (veMin <= vsMin) return;
        const topPx    = headerH + ((vsMin-startOff)/slotMin)*slotH;
        const heightPx = Math.max(((veMin-vsMin)/slotMin)*slotH, 14);
        const el = document.createElement('div');
        el.className = 'lock-overlay';
        el.style.cssText = `position:absolute;top:${topPx}px;left:${dayMeta[di].left}px;width:${dayMeta[di].width}px;height:${heightPx}px;background:repeating-linear-gradient(45deg,rgba(231,76,60,.12),rgba(231,76,60,.12) 5px,rgba(231,76,60,.04) 5px,rgba(231,76,60,.04) 12px);border-left:2px solid rgba(231,76,60,.5);pointer-events:none;z-index:4;`;
        container.appendChild(el);
        if (state.user && (state.user.role==='admin' || state.user.can_lock)) {
          const btn = document.createElement('button');
          btn.className = 'lock-label btn btn-danger btn-sm';
          btn.style.cssText = `position:absolute;top:${topPx+2}px;left:${dayMeta[di].left+2}px;z-index:5;font-size:10px;padding:2px 5px;pointer-events:auto;`;
          btn.textContent = '🔓 ' + (lk.reason||'Locked');
          btn.onclick = () => deleteLock(lk.id);
          container.appendChild(btn);
        }
      });
    });
  });
}

// ── Current time line ──────────────────────────────────────────────────────
function getNow() {
  // If paused, use frozen time
  if (state.timelinePaused && state.pausedAt) return state.pausedAt;
  return new Date();
}

function updateCurrentTimeLine(days, slotH) {
  const line   = document.getElementById('current-time-line');
  const p      = state.preferences;

  // Hide if disabled
  if (!p.red_line_enabled) { line.style.display='none'; return; }

  // Apply color/width/style via CSS variables
  const root = document.documentElement;
  root.style.setProperty('--line-color', p.red_line_color || '#E74C3C');
  root.style.setProperty('--line-width', (p.red_line_width || 2) + 'px');
  root.style.setProperty('--line-style', p.red_line_style || 'solid');

  const now    = getNow();
  const today  = days.find(d => isSameDay(d, now));
  if (!today) { line.style.display='none'; return; }
  const startOff = getStartHourOffset();
  const nowMin   = now.getHours()*60 + now.getMinutes();
  if (nowMin < startOff || nowMin > startOff + getSlotsPerDay()*getSlotMinutes()) {
    line.style.display='none'; return;
  }
  // When day_hours_only synthetic time is active, hide red line outside day hours
  if (synthActive() && state.exercise.day_hours_only) {
    const dayStartMin = (p.day_start_hour || 0) * 60;
    const dayEndMin   = (p.day_end_hour   || 24) * 60;
    if (nowMin < dayStartMin || nowMin >= dayEndMin) {
      line.style.display = 'none'; return;
    }
  }
  const topPx = 44 + ((nowMin - startOff) / getSlotMinutes()) * slotH;
  line.style.display = 'block';
  line.style.top = topPx+'px';

  // Synthetic H+N label
  let existingLabel = document.getElementById('synthTimeLabel');
  if (p.synth_label && synthActive()) {
    const epochMs  = new Date(state.exercise.epoch).getTime();
    const nowMs    = now.getTime();
    const hoursOn  = synthElapsedHours(epochMs, nowMs);
    const label    = hoursOn >= 0 ? `H+${hoursOn}` : `H${hoursOn}`;
    if (!existingLabel) {
      existingLabel = document.createElement('div');
      existingLabel.id        = 'synthTimeLabel';
      existingLabel.className = 'tl-synth-label';
      document.getElementById('timeline-container').appendChild(existingLabel);
    }
    existingLabel.textContent = label;
    existingLabel.style.top   = topPx + 'px';
    existingLabel.style.display = '';
  } else if (existingLabel) {
    existingLabel.style.display = 'none';
  }

  // Freeze badge
  const freezeBadge = document.getElementById('freezeBadge');
  if (freezeBadge) {
    freezeBadge.style.display = state.timelinePaused ? '' : 'none';
    if (state.timelinePaused && state.pausedAt) {
      freezeBadge.innerHTML = `<span>⏸</span> ${t('freeze_label')} ${fmtTime(state.pausedAt)}`;
    }
  }
}

// ── Zoom to now ────────────────────────────────────────────────────────────
function zoomToNow() {
  const now = new Date();
  // Navigate to today if needed
  const days = getDays();
  if (!days.some(d => isSameDay(d, now))) {
    state.startDate = startOfDay(now);
    refreshAll().then(() => scrollToNow());
  } else {
    scrollToNow();
  }
}
function scrollToNow() {
  const slotH  = getSlotHeight();
  const now    = getNow();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const topPx  = 44 + (nowMin / getSlotMinutes()) * slotH;
  const tc     = document.getElementById('timeline-container');
  tc.scrollTop = Math.max(0, topPx - tc.clientHeight/2);
}

function scrollToDayStart() {
  const slotH   = getSlotHeight();
  const startH  = (state.preferences.day_start_hour || 0) * 60;
  const topPx   = 44 + (startH / getSlotMinutes()) * slotH;
  const tc      = document.getElementById('timeline-container');
  tc.scrollTop  = Math.max(0, topPx);
}

// ── Clock ──────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  document.getElementById('clockTime').textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  document.getElementById('clockDate').textContent =
    now.toLocaleDateString(getLocale(), {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}

// ── Fetch data ─────────────────────────────────────────────────────────────
async function fetchPhases() { state.phases = await apiGet('/api/phases') || []; }

async function fetchEvents() {
  const from = state.startDate.toISOString();
  const to   = getViewEnd().toISOString();
  state.events = await apiGet(`/api/events?from=${from}&to=${to}`) || [];
}
async function fetchLocks()   { state.locks      = await apiGet('/api/locks')  || []; }
async function fetchAlarms()  { state.alarms     = await apiGet('/api/alarms') || []; }
async function fetchLayers()  { state.layers     = await apiGet('/api/layers') || []; }
async function fetchGroups()  { state.groups     = await apiGet('/api/groups') || []; }

async function fetchExercise() {
  try { state.exercise = await apiGet('/api/exercise'); } catch { /* ignore */ }
}

async function refreshAll() {
  await Promise.all([fetchEvents(), fetchLocks(), fetchAlarms(), fetchLayers(), fetchExercise(), fetchPhases()]);
  renderTimeline();
  renderSidebar();
  updateSyntheticUI();
}

// ── Preferences ────────────────────────────────────────────────────────────
async function loadPreferences() {
  state.preferences = await apiGet('/api/preferences');
}
async function savePreferences() {
  await apiPut('/api/preferences', state.preferences);
}

function applyPreferences() {
  const body = document.body;
  body.className = '';
  if (state.preferences.theme === 'light') body.classList.add('light-mode');
  const sz = state.preferences.size || 'small';
  if (sz !== 'small') body.classList.add('size-'+sz);
  if (!state.preferences.show_out_of_hours) body.classList.add('hide-out-of-hours');
  updateLangFlags();
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(dir) {
  state.startDate = addDays(state.startDate, dir * getRangeDays());
  refreshAll();
}
function navJump(days) {
  const menu = document.getElementById('navJumpMenu');
  if (menu) menu.style.display = 'none';
  state.startDate = addDays(state.startDate, (state._navDir || 1) * days);
  refreshAll();
}
function goToday() {
  state.startDate = startOfDay(new Date());
  refreshAll();
}
function centerToday() {
  const today = startOfDay(new Date());
  state.startDate = addDays(today, -Math.floor(getRangeDays() / 2));
  refreshAll();
}

// ── Long-press navigation buttons ──────────────────────────────────────────
function setupNavLongPress(btn, dir) {
  if (!btn) return;
  let timer = null;
  let longPressed = false;

  btn.addEventListener('mousedown', () => {
    longPressed = false;
    timer = setTimeout(() => {
      longPressed = true;
      // Show jump dropdown
      const menu = document.getElementById('navJumpMenu');
      if (!menu) return;
      state._navDir = dir;
      const rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top  = (rect.bottom + 4) + 'px';
      menu.style.display = '';
    }, 400);
  });

  btn.addEventListener('mouseup', () => { clearTimeout(timer); });
  btn.addEventListener('mouseleave', () => { clearTimeout(timer); });

  btn.addEventListener('click', () => {
    if (longPressed) { longPressed = false; return; } // Handled by long-press
    navigate(dir);
  });
}

// ── Cell click ─────────────────────────────────────────────────────────────
function onCellClick(e, startISO, endISO, outOfHours) {
  if (!state.user || state.user.role === 'read') return;
  if (outOfHours) return; // out-of-hours slots: no event creation
  openEventModal(null, new Date(startISO), new Date(endISO));
}

// ── Event Modal ────────────────────────────────────────────────────────────
function updateEventModalTimeVisibility() {
  const allDay  = document.getElementById('eventAllDay')?.checked;
  const typeVal = document.getElementById('eventType')?.value;
  const isInstant = typeVal === 'instant';

  const startRow = document.getElementById('eventTimeRow');
  const endGroup = document.getElementById('eventEndGroup');
  const recurRow = document.querySelectorAll('#eventModal .recurrence-row');

  if (startRow) startRow.style.display = allDay ? 'none' : '';
  if (endGroup) endGroup.style.display = (allDay || isInstant) ? 'none' : '';
  recurRow.forEach(el => { el.style.display = allDay ? 'none' : ''; });
}

function openEventModal(ev, defaultStart, defaultEnd) {
  const isEdit = !!ev;
  document.getElementById('eventModalTitle').textContent = isEdit ? t('event_edit') : t('event_add');
  document.getElementById('eventId').value = ev ? ev.id : '';
  document.getElementById('eventTitle').value = ev ? ev.title : '';
  document.getElementById('eventDescription').value = ev ? (ev.description||'') : '';
  document.getElementById('eventColor').value = ev ? (ev.color||'#4A90D9') : '#4A90D9';

  // Type select
  const typeSelect = document.getElementById('eventType');
  const lang = state.preferences.language || 'en';
  typeSelect.innerHTML = state.eventTypes.map(et => {
    const lbl = lang==='sv' && et.label_sv ? et.label_sv :
                lang==='fr' && et.label_fr ? et.label_fr : et.label;
    return `<option value="${et.key}" ${ev && ev.event_type===et.key?'selected':''}>${lbl}</option>`;
  }).join('');
  typeSelect.onchange = () => {
    const found = state.eventTypes.find(x => x.key === typeSelect.value);
    if (found) document.getElementById('eventColor').value = found.color;
    updateEventModalTimeVisibility();
  };

  // Layer select
  const layerSel = document.getElementById('eventLayer');
  layerSel.innerHTML = `<option value="">${t('event_master')}</option>` +
    state.layers
      .filter(l => l.owner_id===state.user.id || state.user.role==='admin' || l.permission==='readwrite')
      .map(l => `<option value="${l.id}" ${ev && ev.layer_id===l.id?'selected':''}>${escHtml(l.name)}</option>`)
      .join('');

  const start = defaultStart || (ev ? new Date(ev.start_time) : new Date());
  const end   = defaultEnd   || (ev && ev.end_time ? new Date(ev.end_time) : addHours(start, 1));
  document.getElementById('eventStart').value = fmtDateInput(start);
  document.getElementById('eventEnd').value   = fmtDateInput(end);

  // All-day checkbox
  const allDayChk = document.getElementById('eventAllDay');
  if (allDayChk) allDayChk.checked = ev ? !!ev.all_day : false;

  const recurring = ev && ev.is_recurring;
  document.getElementById('eventRecurring').checked = recurring;
  document.getElementById('recurrenceGroup').style.display    = recurring ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = recurring ? '' : 'none';
  if (ev) {
    document.getElementById('eventRecurrencePattern').value = ev.recurrence_pattern || 'weekly';
    if (ev.recurrence_end) document.getElementById('eventRecurrenceEnd').value = fmtDateInput(new Date(ev.recurrence_end));
  }

  // Status
  document.getElementById('eventStatus').value = (ev && ev.status) ? ev.status : 'planned';

  // Intern/extern
  const partSel = document.getElementById('eventParticipant');
  if (partSel) partSel.value = ev ? (ev.participant || '') : '';

  // Responsible user select
  const respSel = document.getElementById('eventResponsible');
  if (respSel) {
    const users = state.users || [];
    const creatorId = ev ? ev.created_by : (state.user ? state.user.id : null);
    respSel.innerHTML = `<option value="">— (${t('ev_responsible_creator')||'creator'})</option>` +
      users.map(u => `<option value="${u.id}" ${ev && ev.responsible_id===u.id?'selected':''}>${escHtml(u.display_name||u.username)}</option>`).join('');
  }

  // Invited users/groups
  const invList = document.getElementById('eventInvitedList');
  if (invList) {
    const invUserIDs  = ev && ev.invited_user_ids  ? ev.invited_user_ids  : [];
    const invGroupIDs = ev && ev.invited_group_ids ? ev.invited_group_ids : [];
    const users = state.users || [];
    const groups = state.groups || [];
    invList.innerHTML = [
      ...users.map(u => `<label class="group-chip${invUserIDs.includes(u.id)?' selected':''}" style="cursor:pointer">
        <input type="checkbox" class="inv-user-cb" value="${u.id}" ${invUserIDs.includes(u.id)?'checked':''} style="margin-right:4px">
        👤 ${escHtml(u.display_name||u.username)}
      </label>`),
      ...groups.map(g => `<label class="group-chip${invGroupIDs.includes(g.id)?' selected':''}" style="cursor:pointer">
        <input type="checkbox" class="inv-group-cb" value="${g.id}" ${invGroupIDs.includes(g.id)?'checked':''} style="margin-right:4px">
        👥 ${escHtml(g.name)}
      </label>`)
    ].join('');
    invList.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => cb.closest('.group-chip').classList.toggle('selected', cb.checked));
    });
  }

  // Clear attachment input on each open
  const attachFile = document.getElementById('eventAttachFile');
  if (attachFile) attachFile.value = '';

  // Reset inline alarm section
  const inlineAlarmCb = document.getElementById('inlineAlarmEnabled');
  const inlineAlarmOpts = document.getElementById('inlineAlarmOptions');
  if (inlineAlarmCb) {
    inlineAlarmCb.checked = false;
    if (inlineAlarmOpts) inlineAlarmOpts.style.display = 'none';
  }

  const creatorEl = document.getElementById('eventCreator');
  creatorEl.style.display = isEdit ? '' : 'none';
  if (isEdit) creatorEl.textContent = `${t('event_created_by')} ${ev.created_by_name} — ${fmtDateTime(new Date(ev.created_at))}`;

  const delBtn = document.getElementById('btnDeleteEvent');
  const canDel = isEdit && (state.user.role==='admin' || state.user.id===ev.created_by);
  delBtn.style.display = canDel ? '' : 'none';
  delBtn.onclick = canDel ? () => deleteEvent(ev.id) : null;

  // Update field visibility for type/allday
  updateEventModalTimeVisibility();

  openModal('eventModal');
}

// Wire up inline alarm checkbox toggle
document.getElementById('inlineAlarmEnabled')?.addEventListener('change', function() {
  const opts = document.getElementById('inlineAlarmOptions');
  if (opts) opts.style.display = this.checked ? '' : 'none';
});

document.getElementById('eventRecurring').addEventListener('change', function() {
  document.getElementById('recurrenceGroup').style.display    = this.checked ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = this.checked ? '' : 'none';
});

document.getElementById('eventAllDay').addEventListener('change', updateEventModalTimeVisibility);

// Auto-adjust end time to start + 1 hour whenever start changes
document.getElementById('eventStart').addEventListener('change', function() {
  const start = new Date(this.value);
  if (!isNaN(start.getTime())) {
    document.getElementById('eventEnd').value = fmtDateInput(addHours(start, 1));
  }
});

document.getElementById('btnSaveEvent').addEventListener('click', async () => {
  const id    = document.getElementById('eventId').value;
  const title = document.getElementById('eventTitle').value.trim();
  if (!title) { showError(t('event_title') + ' is required', 'Validation'); return; }
  const allDay   = document.getElementById('eventAllDay')?.checked || false;
  const typeVal  = document.getElementById('eventType').value;
  const isInstant = typeVal === 'instant';
  const startVal = document.getElementById('eventStart').value;
  const endVal   = document.getElementById('eventEnd').value;
  if (!allDay && !startVal) { showError(t('event_start') + ' is required', 'Validation'); return; }

  const recurring = document.getElementById('eventRecurring').checked;
  const layerVal  = document.getElementById('eventLayer').value;
  const partSel   = document.getElementById('eventParticipant');
  const respSel   = document.getElementById('eventResponsible');
  const respVal   = respSel ? respSel.value : '';
  // Collect invited user/group IDs from checkboxes
  const invUserIDs  = [...(document.querySelectorAll('.inv-user-cb:checked')  || [])].map(cb => parseInt(cb.value, 10));
  const invGroupIDs = [...(document.querySelectorAll('.inv-group-cb:checked') || [])].map(cb => parseInt(cb.value, 10));
  const payload = {
    title,
    description:        document.getElementById('eventDescription').value,
    event_type:         typeVal,
    color:              document.getElementById('eventColor').value,
    status:             document.getElementById('eventStatus').value,
    all_day:            allDay,
    participant:        partSel ? partSel.value : '',
    responsible_id:     respVal ? parseInt(respVal, 10) : null,
    invited_user_ids:   invUserIDs,
    invited_group_ids:  invGroupIDs,
    start_time:         (!allDay && startVal) ? new Date(startVal).toISOString() : new Date().toISOString(),
    end_time:           (!allDay && !isInstant && endVal) ? new Date(endVal).toISOString() : null,
    is_recurring:       recurring && !allDay && !isInstant,
    recurrence_pattern: (recurring && !allDay && !isInstant) ? document.getElementById('eventRecurrencePattern').value : '',
    recurrence_end:     (recurring && !allDay && !isInstant && document.getElementById('eventRecurrenceEnd').value)
                          ? new Date(document.getElementById('eventRecurrenceEnd').value).toISOString() : null,
    layer_id:           layerVal ? parseInt(layerVal, 10) : null,
  };

  const res = id ? await apiPut(`/api/events/${id}`, payload) : await apiPost('/api/events', payload);
  if (res.ok) {
    const saved    = await res.json();
    const eventID  = saved.id || parseInt(id, 10);
    // Upload attachment if a file was selected
    const attachFile = document.getElementById('eventAttachFile');
    if (attachFile && attachFile.files.length > 0) {
      const fd = new FormData();
      fd.append('file', attachFile.files[0]);
      const upRes = await apiPost(`/api/events/${eventID}/attachments`, fd);
      if (!upRes.ok) {
        const upErr = await upRes.json();
        showError('Event saved, but attachment upload failed: ' + upErr.error);
      }
      attachFile.value = '';
    }
    // Handle inline alarm
    const alarmCb = document.getElementById('inlineAlarmEnabled');
    if (alarmCb && alarmCb.checked && !allDay) {
      const leadTime = parseInt(document.getElementById('inlineAlarmLeadTime').value, 10) || 0;
      const scope    = document.getElementById('inlineAlarmScope').value;
      const eventTime = new Date(payload.start_time);
      // Create alarm for current user
      await apiPost('/api/alarms', { event_id: eventID, lead_time: leadTime, event_time: eventTime.toISOString() });
      // If "all invited" and there are invited users, create alarms for them too (admin/oplead only)
      if (scope === 'all' && hasRole2(state.user.role, 'oplead') && invUserIDs.length > 0) {
        for (const uid of invUserIDs) {
          if (uid !== state.user.id) {
            await apiPost('/api/alarms', { event_id: eventID, lead_time: leadTime, event_time: eventTime.toISOString(), for_user_id: uid });
          }
        }
      }
    }
    closeModal('eventModal');
    await refreshAll();
    showNotification('success', t(id ? 'notif_event_updated' : 'notif_event_created'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
});

async function patchEventStatus(id, status, rejectionReason) {
  const res = await api('PATCH', `/api/events/${id}/status`, {status, rejection_reason: rejectionReason});
  if (res.ok) {
    await refreshAll();
    closeModal('detailModal');
    showNotification('success', t('notif_status_changed'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

async function deleteEvent(id) {
  const ev = state.events.find(x => x.id === id);
  if (ev && ev.is_recurring) {
    showRecurDeleteDialog(ev);
    return;
  }
  if (!confirm(t('confirm_delete_event'))) return;
  const res = await apiDel(`/api/events/${id}`);
  if (res.ok) {
    closeModal('eventModal'); closeModal('detailModal');
    await refreshAll();
    showNotification('success', t('notif_event_deleted'));
  } else { showError('Failed to delete event'); }
}

function showRecurDeleteDialog(ev) {
  const occTime = state._currentOccurrenceTime;
  const msg = occTime
    ? `"${ev.title}" — occurrence on ${fmtDateTime(occTime)}`
    : `"${ev.title}" — recurring series`;
  document.getElementById('recurDeleteMsg').textContent =
    `This is a recurring event. What would you like to delete?\n${msg}`;

  const thisBtn   = document.getElementById('recurDelThis');
  const futureBtn = document.getElementById('recurDelFuture');
  const allBtn    = document.getElementById('recurDelAll');

  // "Delete only this occurrence" (only shown when viewing a specific occurrence)
  thisBtn.style.display = occTime ? '' : 'none';
  thisBtn.onclick = async () => {
    if (!occTime) return;
    closeModal('recurDeleteModal');
    // Add occurrence to exclusion list
    const excl = [...(ev.recurrence_excl || []), occTime.toISOString()];
    const res = await apiPut(`/api/events/${ev.id}`, {...ev, recurrence_excl: excl});
    if (res.ok) {
      closeModal('eventModal'); closeModal('detailModal');
      await refreshAll();
      showNotification('success', t('notif_event_deleted'));
    } else { const err = await res.json(); showError(err.error); }
  };

  // "Delete this and all future"
  futureBtn.style.display = occTime ? '' : 'none';
  futureBtn.onclick = async () => {
    if (!occTime) return;
    closeModal('recurDeleteModal');
    // Set recurrence_end to just before this occurrence
    const newEnd = new Date(occTime.getTime() - 60000); // 1 min before
    const res = await apiPut(`/api/events/${ev.id}`, {...ev, recurrence_end: newEnd.toISOString()});
    if (res.ok) {
      closeModal('eventModal'); closeModal('detailModal');
      await refreshAll();
      showNotification('success', t('notif_event_deleted'));
    } else { const err = await res.json(); showError(err.error); }
  };

  // "Delete all occurrences"
  allBtn.onclick = async () => {
    closeModal('recurDeleteModal');
    const res = await apiDel(`/api/events/${ev.id}`);
    if (res.ok) {
      closeModal('eventModal'); closeModal('detailModal');
      await refreshAll();
      showNotification('success', t('notif_event_deleted'));
    } else { showError('Failed to delete event'); }
  };

  openModal('recurDeleteModal');
}

// ── Event Detail Modal ─────────────────────────────────────────────────────
function showEventDetail(ev) {
  document.getElementById('detailTitle').textContent = ev.title;
  const lang   = state.preferences.language || 'en';
  const et     = state.eventTypes.find(x => x.key===ev.event_type);
  const etLbl  = et ? (lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : et.label) : ev.event_type;
  const evStart = new Date(ev.start_time);
  const evEnd   = ev.end_time ? new Date(ev.end_time) : null;
  const layer   = ev.layer_id ? state.layers.find(l => l.id===ev.layer_id) : null;

  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start">
      <div style="width:12px;height:12px;border-radius:3px;background:${ev.color};flex-shrink:0;margin-top:3px"></div>
      <div style="flex:1">
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${etLbl}</div>
        ${ev.description ? `<div style="color:var(--text);margin-bottom:10px">${escHtml(ev.description)}</div>` : ''}
        <div style="font-size:var(--fs-sm);color:var(--text-dim);display:grid;grid-template-columns:auto 1fr;gap:3px 10px">
          <b>${t('detail_start')}:</b><span>${fmtDateTime(evStart)}</span>
          ${evEnd ? `<b>${t('detail_end')}:</b><span>${fmtDateTime(evEnd)}</span>` : ''}
          ${ev.is_recurring ? `<b>${t('detail_repeats')}:</b><span>${t('event_pattern_'+(ev.recurrence_pattern||'weekly'))}</span>` : ''}
          ${layer ? `<b>${t('event_layer')}:</b><span>${escHtml(layer.name)}</span>` : ''}
          <b>${t('detail_created')}:</b><span>${escHtml(ev.created_by_name||'')}</span>
          <b>${t('detail_created_at')}:</b><span>${fmtDateTime(new Date(ev.created_at))}</span>
          ${(ev.updated_at && new Date(ev.updated_at) - new Date(ev.created_at) > 10000) ?
            `<b>${t('detail_updated_at')}:</b><span>${fmtDateTime(new Date(ev.updated_at))}</span>` : ''}
          <b>${t('event_status')}:</b><span><span class="status-badge status-${ev.status||'planned'}">${t('status_'+(ev.status||'planned'))}</span></span>
          ${ev.status==='verified' ? `<b>${t('status_verified_by')}:</b><span>${escHtml(ev.verified_by_name||'')} — ${ev.verified_at?fmtDateTime(new Date(ev.verified_at)):''}</span>` : ''}
          ${ev.status==='rejected' ? `<b>${t('status_rejection_reason')}:</b><span style="color:var(--red)">${escHtml(ev.rejection_reason||'')}</span>` : ''}
        </div>
      </div>
    </div>
    <div id="attachmentSection" style="margin-top:14px">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${t('detail_attachments')}</div>
      <div id="attachmentList"><span style="color:var(--text-dim);font-size:var(--fs-sm)">Loading…</span></div>
      <label class="upload-zone" style="margin-top:8px;display:block" id="uploadZone">
        ${t('detail_upload')}
        <input type="file" id="attachFileInput" style="display:none">
      </label>
    </div>
    <div id="commentSection" style="margin-top:16px">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${t('detail_comments')}</div>
      <div id="commentList"><span style="color:var(--text-dim);font-size:var(--fs-sm)">Loading…</span></div>
      <div class="comment-input-row" style="margin-top:8px">
        <textarea id="commentText" placeholder="${t('comments_add')}"></textarea>
        <button class="btn btn-primary btn-sm" onclick="submitComment(${ev.id})">${t('comments_submit')}</button>
      </div>
    </div>
  `;

  // Load attachments
  apiGet(`/api/events/${ev.id}/attachments`).then(atts => {
    const listEl = document.getElementById('attachmentList');
    if (!listEl) return;
    if (!atts || atts.length===0) {
      listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('detail_no_attachments')}</div>`;
    } else {
      listEl.innerHTML = `<div class="attachment-list">${atts.map(a => `
        <div class="attachment-item">
          <span class="attachment-icon">📄</span>
          <span class="attachment-name" title="${escHtml(a.filename)}">${escHtml(a.filename)}</span>
          <span class="attachment-size">${fmtFileSize(a.size)}</span>
          <a href="/api/attachments/${a.id}" class="btn btn-secondary btn-sm" download="${escHtml(a.filename)}">${t('detail_download')}</a>
          ${state.user && (state.user.id===a.uploaded_by || state.user.role==='admin') ?
            `<button class="btn btn-danger btn-sm" onclick="deleteAttachment(${a.id},${ev.id})">✕</button>` : ''}
        </div>
      `).join('')}</div>`;
    }
  });

  // File upload
  const fileInput = document.getElementById('attachFileInput');
  if (fileInput) {
    fileInput.onchange = async () => {
      if (!fileInput.files.length) return;
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      const res = await apiPost(`/api/events/${ev.id}/attachments`, fd);
      if (res.ok) {
        showNotification('success', 'File attached');
        showEventDetail(ev); // refresh
      } else {
        const err = await res.json();
        showError('Upload failed: ' + err.error);
      }
    };
  }

  // Load comments
  apiGet(`/api/events/${ev.id}/comments`).then(comments => {
    const listEl = document.getElementById('commentList');
    if (!listEl) return;
    if (!comments || comments.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('comments_none')}</div>`;
    } else {
      listEl.innerHTML = comments.map(c => `
        <div class="comment-item${c.pending_approval?' comment-pending':''}">
          <div class="comment-header">
            <span class="comment-author">${escHtml(c.author_name)}</span>
            <span class="comment-ts">${fmtDateTime(new Date(c.created_at))}</span>
            ${c.pending_approval ? `<span class="comment-pending-badge">${t('comments_pending')}</span>` : ''}
            ${c.status_change ? `<span class="status-badge status-${c.status_change}" style="margin-left:4px">${t('status_'+c.status_change)}</span>` : ''}
          </div>
          <div class="comment-text">${escHtml(c.content)}</div>
          <div style="display:flex;gap:4px;margin-top:4px">
            ${state.user && (state.user.id===c.author_id || state.user.role==='admin') ?
              `<button class="btn btn-danger btn-sm" onclick="deleteComment(${c.id},${ev.id})">✕</button>` : ''}
            ${c.pending_approval && state.user && hasRole2(state.user.role,'teamlead') ?
              `<button class="btn btn-sm" style="background:var(--green)" onclick="approveComment(${c.id},${ev.id})">✓ ${t('comments_approve')}</button>` : ''}
          </div>
        </div>
      `).join('');
    }
  });

  const footer = document.getElementById('detailFooter');
  footer.innerHTML = '';

  const alarmBtn = document.createElement('button');
  alarmBtn.className = 'btn btn-secondary btn-sm';
  alarmBtn.textContent = t('detail_set_alarm');
  alarmBtn.onclick = () => { closeModal('detailModal'); openAlarmModal(ev); };
  footer.appendChild(alarmBtn);

  // Verify / Reject (teamlead+)
  if (state.user && hasRole2(state.user.role, 'teamlead') && ev.status !== 'verified' && ev.status !== 'cancelled') {
    const verBtn = document.createElement('button');
    verBtn.className = 'btn btn-sm';
    verBtn.style.background = 'var(--green)';
    verBtn.textContent = '✓ ' + t('status_verify');
    verBtn.onclick = () => patchEventStatus(ev.id, 'verified', '');
    footer.appendChild(verBtn);

    const rejBtn = document.createElement('button');
    rejBtn.className = 'btn btn-danger btn-sm';
    rejBtn.textContent = '✕ ' + t('status_reject');
    rejBtn.onclick = () => {
      const reason = prompt(t('status_rejection_prompt'));
      if (reason === null) return;
      if (!reason.trim()) { showError(t('status_rejection_required'), 'Validation'); return; }
      patchEventStatus(ev.id, 'rejected', reason.trim());
    };
    footer.appendChild(rejBtn);
  }

  // Edit/Delete (creator or readwrite+ on layers, oplead+ on master)
  const isMaster = !ev.layer_id;
  const canEdit = state.user && (
    state.user.role === 'admin' ||
    (!isMaster && (state.user.role === 'readwrite' || state.user.role === 'teamlead' || state.user.id === ev.created_by)) ||
    (isMaster && hasRole2(state.user.role, 'oplead'))
  );
  if (canEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary btn-sm';
    editBtn.textContent = t('detail_edit');
    editBtn.onclick = () => { closeModal('detailModal'); openEventModal(ev); };
    footer.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.textContent = t('detail_delete');
    delBtn.onclick = () => deleteEvent(ev.id);
    footer.appendChild(delBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-secondary';
  closeBtn.textContent = t('detail_close');
  closeBtn.onclick = () => closeModal('detailModal');
  footer.appendChild(closeBtn);

  openModal('detailModal');
}

async function submitComment(eventId) {
  const textarea = document.getElementById('commentText');
  const content  = textarea ? textarea.value.trim() : '';
  if (!content) return;
  const res = await apiPost(`/api/events/${eventId}/comments`, {content});
  if (res.ok) {
    if (textarea) textarea.value = '';
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
    showNotification('success', t('notif_saved'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

async function deleteComment(commentId, eventId) {
  if (!confirm(t('confirm_delete')||'Delete this comment?')) return;
  const res = await apiDel(`/api/comments/${commentId}`);
  if (res.ok) {
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
  }
}

async function approveComment(commentId, eventId) {
  const res = await apiPost(`/api/comments/${commentId}/approve`, {});
  if (res.ok) {
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
    await refreshAll();
    showNotification('success', t('notif_saved'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

async function deleteAttachment(id, eventId) {
  if (!confirm(t('confirm_delete_attachment'))) return;
  const res = await apiDel(`/api/attachments/${id}`);
  if (res.ok) {
    // Re-open detail of same event
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
  }
}

// ── Alarm Modal ────────────────────────────────────────────────────────────
function openAlarmModal(ev) {
  document.getElementById('alarmEventId').value = ev.id;
  document.getElementById('alarmEventTitle').value = ev.title;
  document.getElementById('alarmEventTime').value = fmtDateTime(new Date(ev.start_time));
  document.getElementById('alarmLeadTime').value = '5';
  openModal('alarmModal');
}

document.getElementById('btnSaveAlarm').addEventListener('click', async () => {
  const eventId  = parseInt(document.getElementById('alarmEventId').value, 10);
  const leadTime = parseInt(document.getElementById('alarmLeadTime').value, 10);
  const res = await apiPost('/api/alarms', {event_id: eventId, lead_time: leadTime});
  if (res.ok) {
    closeModal('alarmModal');
    await fetchAlarms(); renderSidebar();
    showNotification('success', t('notif_alarm_set'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteAlarm(id) {
  const res = await apiDel(`/api/alarms/${id}`);
  if (res.ok) { await fetchAlarms(); renderSidebar(); showNotification('success', t('notif_alarm_removed')); }
}

// ── Lock Modal ─────────────────────────────────────────────────────────────
document.getElementById('btnAddLock').addEventListener('click', () => {
  const now = new Date();
  document.getElementById('lockStart').value = fmtDateInput(now);
  document.getElementById('lockEnd').value   = fmtDateInput(addHours(now, 1));
  document.getElementById('lockReason').value = '';
  openModal('lockModal');
});

document.getElementById('btnSaveLock').addEventListener('click', async () => {
  const sv = document.getElementById('lockStart').value;
  const ev = document.getElementById('lockEnd').value;
  if (!sv||!ev) { showError('Start and end required', 'Validation'); return; }
  const res = await apiPost('/api/locks', {
    start_time: new Date(sv).toISOString(),
    end_time:   new Date(ev).toISOString(),
    reason:     document.getElementById('lockReason').value,
  });
  if (res.ok) {
    closeModal('lockModal'); await fetchLocks(); renderTimeline();
    showNotification('success', t('notif_locked'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteLock(id) {
  if (!confirm(t('confirm_delete_lock'))) return;
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) { await fetchLocks(); renderTimeline(); showNotification('success', t('notif_unlocked')); }
}

// ── User Modal ─────────────────────────────────────────────────────────────
async function openUserModal(user) {
  const isEdit = !!user;
  document.getElementById('userModalTitle').textContent = isEdit ? t('user_edit') : t('user_add');
  document.getElementById('userId').value = user ? user.id : '';
  document.getElementById('uUsername').value = user ? user.username : '';
  document.getElementById('uUsername').disabled = isEdit;
  document.getElementById('uPassword').value = '';
  document.getElementById('uDisplayName').value = user ? (user.display_name||'') : '';
  document.getElementById('uRole').value = user ? user.role : 'read';
  document.getElementById('uCanLock').checked = user ? user.can_lock : false;
  const delBtn = document.getElementById('btnDeleteUser');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteUser(user.id) : null;

  // Populate group picker
  const picker = document.getElementById('uGroupPicker');
  if (picker && state.groups.length > 0) {
    let currentMemberIDs = new Set();
    if (isEdit && user.id) {
      try {
        const members = await apiGet(`/api/users/${user.id}/groups`);
        if (members) members.forEach(m => currentMemberIDs.add(m.group_id || m));
      } catch { /* ignore */ }
    }
    picker.innerHTML = state.groups.map(g => `
      <label class="group-chip" style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:var(--radius);border:1px solid var(--border);cursor:pointer;font-size:var(--fs-xs);margin:2px">
        <input type="checkbox" name="uGroup" value="${g.id}" ${currentMemberIDs.has(g.id)?'checked':''} style="accent-color:var(--accent)">
        ${escHtml(g.name)}
      </label>`).join('');
  } else if (picker) {
    picker.innerHTML = `<span style="color:var(--text-dim);font-size:var(--fs-xs)">No groups available.</span>`;
  }

  openModal('userModal');
}

document.getElementById('btnSaveUser').addEventListener('click', async () => {
  const id = document.getElementById('userId').value;
  const username = document.getElementById('uUsername').value.trim();
  const password = document.getElementById('uPassword').value;
  const displayName = document.getElementById('uDisplayName').value.trim();
  const role = document.getElementById('uRole').value;
  const canLock = document.getElementById('uCanLock').checked;
  if (!id && (!username||!password)) { showError('Username and password required', 'Validation'); return; }
  const groupIDs = [...document.querySelectorAll('input[name="uGroup"]:checked')].map(cb => parseInt(cb.value, 10));
  const payload = {display_name:displayName, role, can_lock:canLock, group_ids:groupIDs};
  if (!id) { payload.username=username; payload.password=password; }
  if (id&&password) { payload.password=password; }
  const res = id ? await apiPut(`/api/users/${id}`, payload) : await apiPost('/api/users', payload);
  if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { const err = await res.json(); showError(err.error); }
});

async function deleteUser(id) {
  if (!confirm(t('confirm_delete_user'))) return;
  const res = await apiDel(`/api/users/${id}`);
  if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { showError('Failed to delete user'); }
}

// ── Group Modal ────────────────────────────────────────────────────────────
function openGroupModal(group) {
  const isEdit = !!group;
  document.getElementById('groupModalTitle').textContent = isEdit ? 'Edit Group' : t('groups_add').replace('+ ','');
  document.getElementById('groupId').value = group ? group.id : '';
  document.getElementById('groupName').value = group ? group.name : '';
  document.getElementById('groupDesc').value = group ? (group.description||'') : '';
  const delBtn = document.getElementById('btnDeleteGroup');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteGroup(group.id) : null;
  openModal('groupModal');
}

document.getElementById('btnSaveGroup').addEventListener('click', async () => {
  const id = document.getElementById('groupId').value;
  const name = document.getElementById('groupName').value.trim();
  if (!name) { showError('Name required', 'Validation'); return; }
  const payload = {name, description: document.getElementById('groupDesc').value};
  const res = id ? await apiPut(`/api/groups/${id}`, payload) : await apiPost('/api/groups', payload);
  if (res.ok) { closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { const err = await res.json(); showError(err.error); }
});

async function deleteGroup(id) {
  if (!confirm(t('confirm_delete_group'))) return;
  const res = await apiDel(`/api/groups/${id}`);
  if (res.ok) { closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved')); }
}

// ── Member Management Modal ────────────────────────────────────────────────
async function openMemberModal(group) {
  document.getElementById('memberModalTitle').textContent = `${escHtml(group.name)} — ${t('groups_members')}`;
  const body = document.getElementById('memberModalBody');
  body.innerHTML = `<div style="color:var(--text-dim);padding:8px">Loading…</div>`;
  openModal('memberModal');

  const [members, users] = await Promise.all([
    apiGet(`/api/groups/${group.id}/members`),
    apiGet('/api/users'),
  ]);

  const userMap = {};
  (users||[]).forEach(u => { userMap[u.id] = u; });
  const memberIDs = new Set((members||[]).map(m => m.user_id));
  const nonMembers = (users||[]).filter(u => !memberIDs.has(u.id));

  const memberRows = (members||[]).map(m => {
    const u = userMap[m.user_id];
    const name = u ? (u.display_name || u.username) : `User #${m.user_id}`;
    const role = u ? u.role : 'read';
    return `<div class="member-item">
      <span class="member-name">${escHtml(name)}</span>
      <span class="role-badge role-${role}" style="font-size:var(--fs-xs)">${t('role_'+role)||role}</span>
      <span style="font-size:var(--fs-xs);color:var(--text-dim)">(${escHtml(m.role)})</span>
      <button class="btn btn-danger btn-sm" onclick="removeGroupMember(${group.id},${m.user_id})" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');

  const addMemberForm = nonMembers.length > 0 ? `
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">${t('groups_add_member')}</div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div class="form-group" style="flex:1;min-width:120px;margin:0">
          <label style="font-size:var(--fs-sm);color:var(--text-dim)">User</label>
          <select id="addMemberUser">
            ${nonMembers.map(u => `<option value="${u.id}">${escHtml(u.display_name||u.username)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:90px">
          <label style="font-size:var(--fs-sm);color:var(--text-dim)">Role</label>
          <select id="addMemberRole">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="addGroupMember(${group.id})">${t('btn_add')}</button>
      </div>
    </div>` : '';

  body.innerHTML = `
    <div>
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">${t('groups_members')}</div>
      <div class="member-list">
        ${(members||[]).length === 0
          ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No members yet.</div>`
          : memberRows}
      </div>
    </div>
    ${addMemberForm}
  `;
}

async function addGroupMember(groupID) {
  const userID = parseInt(document.getElementById('addMemberUser').value, 10);
  const role   = document.getElementById('addMemberRole').value;
  const res = await apiPost(`/api/groups/${groupID}/members`, {user_id: userID, role});
  if (res.ok) {
    const group = state.groups.find(g => g.id === groupID);
    if (group) openMemberModal(group);
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
}

async function removeGroupMember(groupID, userID) {
  if (!confirm('Remove this member from the group?')) return;
  const res = await apiDel(`/api/groups/${groupID}/members/${userID}`);
  if (res.ok) {
    const group = state.groups.find(g => g.id === groupID);
    if (group) openMemberModal(group);
    showNotification('success', t('notif_saved'));
  } else { showError('Failed to remove member'); }
}

// ── Layer Modal ────────────────────────────────────────────────────────────
function openLayerModal(layer) {
  const isEdit = !!layer;
  document.getElementById('layerModalTitle').textContent = isEdit ? 'Edit Layer' : t('layers_add').replace('+ ','');
  document.getElementById('layerId').value = layer ? layer.id : '';
  document.getElementById('layerName').value = layer ? layer.name : '';
  document.getElementById('layerDesc').value = layer ? (layer.description||'') : '';
  document.getElementById('layerColor').value = layer ? (layer.color||'#4A90D9') : '#4A90D9';

  const visSel   = document.getElementById('layerVisibility');
  const permSel  = document.getElementById('layerPermission');
  const grpGroup = document.getElementById('layerGroupsGroup');
  visSel.value  = layer ? layer.visibility : 'private';
  permSel.value = layer ? layer.permission : 'read';

  // Show/hide group section based on visibility
  const updateGroupsVis = () => {
    grpGroup.style.display = visSel.value === 'groups' ? '' : 'none';
  };
  visSel.onchange = updateGroupsVis;
  updateGroupsVis();

  // Populate group checkboxes
  const selectedGroups = layer ? (layer.group_ids||[]) : [];
  const groupCheckboxes = document.getElementById('layerGroupCheckboxes');
  if (state.groups.length === 0) {
    groupCheckboxes.innerHTML = `<span style="color:var(--text-dim);font-size:var(--fs-sm)">No groups available. Create groups first.</span>`;
  } else {
    groupCheckboxes.innerHTML = state.groups.map(g => `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" name="layerGroup" value="${g.id}" ${selectedGroups.includes(g.id)?'checked':''} style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0">
        <span style="font-size:var(--fs-sm);color:var(--text)">${escHtml(g.name)}</span>
        ${g.description ? `<span style="color:var(--text-dim);font-size:var(--fs-xs)">${escHtml(g.description)}</span>` : ''}
      </label>
    `).join('');
  }

  const delBtn = document.getElementById('btnDeleteLayer');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteLayer(layer.id) : null;
  openModal('layerModal');
}

document.getElementById('btnSaveLayer').addEventListener('click', async () => {
  const id = document.getElementById('layerId').value;
  const name = document.getElementById('layerName').value.trim();
  if (!name) { showError('Name required', 'Validation'); return; }
  const groupIDs = [...document.querySelectorAll('input[name="layerGroup"]:checked')]
    .map(cb => parseInt(cb.value, 10));
  const payload = {
    name, description: document.getElementById('layerDesc').value,
    color: document.getElementById('layerColor').value,
    visibility: document.getElementById('layerVisibility').value,
    permission: document.getElementById('layerPermission').value,
    group_ids: groupIDs,
  };
  const res = id ? await apiPut(`/api/layers/${id}`, payload) : await apiPost('/api/layers', payload);
  if (res.ok) {
    closeModal('layerModal'); await fetchLayers(); renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteLayer(id) {
  if (!confirm(t('confirm_delete_layer'))) return;
  const res = await apiDel(`/api/layers/${id}`);
  if (res.ok) {
    closeModal('layerModal'); await fetchLayers();
    state.preferences.active_layers = (state.preferences.active_layers||[]).filter(x => x!==id);
    await savePreferences(); renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  }
}

// ── Event Type Modal ───────────────────────────────────────────────────────
function openEtypeModal(et) {
  const isEdit = !!et;
  document.getElementById('etypeModalTitle').textContent = isEdit ? 'Edit Event Type' : 'New Event Type';
  document.getElementById('etypeId').value = et ? et.id : '';
  document.getElementById('etypeKey').value = et ? et.key : '';
  document.getElementById('etypeKey').disabled = isEdit;
  document.getElementById('etypeLabel').value   = et ? et.label    : '';
  document.getElementById('etypeLabelSV').value = et ? (et.label_sv||'') : '';
  document.getElementById('etypeLabelFR').value = et ? (et.label_fr||'') : '';
  document.getElementById('etypeColor').value   = et ? et.color : '#4A90D9';
  const delBtn = document.getElementById('btnDeleteEtype');
  const canDel = isEdit && !et.is_system;
  delBtn.style.display = canDel ? '' : 'none';
  delBtn.onclick = canDel ? () => deleteEtype(et.id) : null;
  openModal('etypeModal');
}

document.getElementById('btnSaveEtype').addEventListener('click', async () => {
  const id    = document.getElementById('etypeId').value;
  const key   = document.getElementById('etypeKey').value.trim().replace(/\s+/g,'_');
  const label = document.getElementById('etypeLabel').value.trim();
  if (!label || (!id && !key)) { showError('Key and label required', 'Validation'); return; }
  const payload = {
    key, label,
    label_sv: document.getElementById('etypeLabelSV').value,
    label_fr: document.getElementById('etypeLabelFR').value,
    color:    document.getElementById('etypeColor').value,
  };
  const res = id ? await apiPut(`/api/event-types/${id}`, payload) : await apiPost('/api/event-types', payload);
  if (res.ok) {
    closeModal('etypeModal');
    state.eventTypes = await apiGet('/api/event-types');
    renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteEtype(id) {
  if (!confirm(t('confirm_delete_type'))) return;
  const res = await apiDel(`/api/event-types/${id}`);
  if (res.ok) {
    closeModal('etypeModal');
    state.eventTypes = await apiGet('/api/event-types');
    renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
}

// ── Phase Modal ────────────────────────────────────────────────────────────
function openPhaseModal(ph) {
  const isEdit = !!ph;
  document.getElementById('phaseModalTitle').textContent = isEdit ? (t('phase_edit')||'Edit Phase') : (t('phase_add')||'New Phase');
  document.getElementById('phaseId').value    = ph ? ph.id : '';
  document.getElementById('phaseName').value  = ph ? ph.name : '';
  document.getElementById('phaseColor').value = ph ? (ph.color||'#4A90D9') : '#4A90D9';
  document.getElementById('phaseOrder').value = ph ? ph.order : 0;
  document.getElementById('phaseStart').value = ph ? fmtDateInput(new Date(ph.start_time)) : fmtDateInput(state.startDate);
  document.getElementById('phaseEnd').value   = ph ? fmtDateInput(new Date(ph.end_time))   : fmtDateInput(addDays(state.startDate, 1));
  // Layer selector for phase
  const phaseLaySel = document.getElementById('phaseLayer');
  if (phaseLaySel) {
    const myLayers = state.layers.filter(l => l.owner_id===state.user.id || hasRole2(state.user.role,'oplead'));
    phaseLaySel.innerHTML = `<option value="">— Master Timeline —</option>` +
      myLayers.map(l => `<option value="${l.id}" ${ph && ph.layer_id===l.id?'selected':''}>${escHtml(l.name)}</option>`).join('');
  }
  const delBtn = document.getElementById('btnDeletePhase');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deletePhase(ph.id) : null;
  openModal('phaseModal');
}

document.getElementById('btnSavePhase').addEventListener('click', async () => {
  const id    = document.getElementById('phaseId').value;
  const name  = document.getElementById('phaseName').value.trim();
  if (!name) { showError('Name required', 'Validation'); return; }
  const sv = document.getElementById('phaseStart').value;
  const ev = document.getElementById('phaseEnd').value;
  if (!sv || !ev) { showError('Start and end required', 'Validation'); return; }
  const phaseLayVal = document.getElementById('phaseLayer')?.value;
  const payload = {
    name, color: document.getElementById('phaseColor').value,
    order: parseInt(document.getElementById('phaseOrder').value, 10) || 0,
    start_time: new Date(sv).toISOString(),
    end_time:   new Date(ev).toISOString(),
    layer_id:   phaseLayVal ? parseInt(phaseLayVal, 10) : null,
  };
  const res = id ? await apiPut(`/api/phases/${id}`, payload) : await apiPost('/api/phases', payload);
  if (res.ok) {
    closeModal('phaseModal');
    await fetchPhases();
    renderSidebar();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deletePhase(id) {
  if (!confirm(t('confirm_delete')||'Delete this phase?')) return;
  const res = await apiDel(`/api/phases/${id}`);
  if (res.ok) {
    closeModal('phaseModal');
    await fetchPhases();
    renderSidebar();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  }
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function renderSidebar() {
  const tab  = state.sidebarTab;
  const el   = document.getElementById('sidebarContent');
  const lang = state.preferences.language || 'en';

  if (tab === 'legend') {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('event_types_title')}
          ${state.user&&hasRole2(state.user.role,'readwrite') ? `<button class="btn btn-primary btn-sm" onclick="openEtypeModal(null)">${t('event_types_add')}</button>` : ''}
        </div>
        <div class="legend-list">
          ${state.eventTypes.map(et => {
            const lbl = lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : et.label;
            const hidden = isTypeHidden(et.key);
            return `<div class="legend-item${hidden?' hidden-type':''}" onclick="toggleType('${et.key}')">
              <div class="legend-swatch" style="background:${et.color}"></div>
              <span class="legend-label">${escHtml(lbl)}</span>
              <span class="legend-eye">${hidden?'👁‍🗨':'👁'}</span>
              ${state.user&&(state.user.role==='admin'||(et.created_by&&et.created_by===state.user.id)) ?
                `<button class="btn btn-ghost btn-icon" style="font-size:11px;padding:0 3px" onclick="event.stopPropagation();openEtypeModal(${JSON.stringify(et).replace(/"/g,'&quot;')})">✏️</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('info_range')}</div>
        <div style="font-size:var(--fs-sm);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
          <span style="color:var(--text-dim)">${t('info_from')}:</span><span>${localShortDate(state.startDate)}</span>
          <span style="color:var(--text-dim)">${t('info_to')}:</span><span>${localShortDate(addDays(state.startDate, getRangeDays()-1))}</span>
          <span style="color:var(--text-dim)">${t('info_events')}:</span><span>${state.events.filter(e=>!isTypeHidden(e.event_type)).length}</span>
          <span style="color:var(--text-dim)">${t('info_locks')}:</span><span>${state.locks.length}</span>
        </div>
      </div>
    `;
  } else if (tab === 'alarms') {
    const active = state.alarms.filter(a => !a.fired);
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('tab_alarms')}</div>
        ${active.length === 0
          ? `<div style="color:var(--text-dim);font-size:var(--fs-sm);white-space:pre-line">${t('alarms_none')}</div>`
          : `<div class="alarm-list">${active.map(a => `
            <div class="alarm-item">
              <div class="alarm-title">${escHtml(a.event_title)}</div>
              <div class="alarm-meta">📅 ${fmtDateTime(new Date(a.event_time))}<br>🔔 ${a.lead_time>0?a.lead_time+' min before':'At event time'}</div>
              <div class="alarm-actions"><button class="btn btn-danger btn-sm" onclick="deleteAlarm(${a.id})">${t('btn_remove')}</button></div>
            </div>`).join('')}</div>`
        }
      </div>
    `;
  } else if (tab === 'layers') {
    const myLayers     = state.layers.filter(l => l.owner_id === state.user.id);
    const sharedLayers = state.layers.filter(l => l.owner_id !== state.user.id);
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_master')}
        </div>
        <div class="layer-list">
          <div class="layer-item${!(state.preferences.hidden_layers&&state.preferences.hidden_layers.length>0)?' active':''}" onclick="toggleAllLayers()">
            <div class="layer-swatch" style="background:var(--accent)"></div>
            <span class="layer-name">${t('layers_master')}</span>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_my')}
          <button class="btn btn-primary btn-sm" onclick="openLayerModal(null)">${t('layers_add')}</button>
        </div>
        <div class="layer-list">
          ${myLayers.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No layers yet.</div>` : ''}
          ${myLayers.map(l => {
            const active = isLayerActive(l.id);
            return `<div class="layer-item${active?' active':''}" onclick="toggleLayer(${l.id})">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${l.visibility}</span>
              <button class="btn btn-ghost btn-icon" style="font-size:11px" onclick="event.stopPropagation();openLayerModal(${JSON.stringify(l).replace(/"/g,'&quot;')})">✏️</button>
            </div>`;
          }).join('')}
        </div>
      </div>
      ${sharedLayers.length ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('layers_shared')}</div>
        <div class="layer-list">
          ${sharedLayers.map(l => {
            const active = isLayerActive(l.id);
            return `<div class="layer-item${active?' active':''}" onclick="toggleLayer(${l.id})">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${escHtml(l.owner_name||'')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  } else if (tab === 'users' && state.user && state.user.role==='admin') {
    apiGet('/api/users').then(users => {
      el.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            ${t('tab_users')}
            <button class="btn btn-primary btn-sm" onclick="openUserModal(null)">${t('btn_add')}</button>
          </div>
          <div class="user-list">
            ${(users||[]).map(u => `
              <div class="user-item">
                <div class="user-name">
                  <div>${escHtml(u.display_name||u.username)}</div>
                  <div style="font-size:var(--fs-xs);color:var(--text-dim)">@${escHtml(u.username)}</div>
                </div>
                <span class="role-badge role-${u.role}">${t('role_'+u.role)||u.role}</span>
                ${u.can_lock?'<span title="Can lock">🔒</span>':''}
                <button class="btn btn-ghost btn-icon" onclick='openUserModal(${JSON.stringify(u).replace(/'/g,"&#39;")})'>✏️</button>
              </div>`).join('')}
          </div>
        </div>
      `;
    });
  } else if (tab === 'groups' && state.user && hasRole2(state.user.role,'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('groups_title')}
          <button class="btn btn-primary btn-sm" onclick="openGroupModal(null)">${t('groups_add')}</button>
        </div>
        <div class="group-list">
          ${state.groups.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No groups yet.</div>` : ''}
          ${state.groups.map(g => `
            <div class="group-item">
              <div class="group-name">
                <div>${escHtml(g.name)}</div>
                ${g.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(g.description)}</div>` : ''}
              </div>
              <button class="btn btn-ghost btn-icon btn-sm" onclick='openMemberModal(${JSON.stringify(g).replace(/'/g,"&#39;")})' title="${t('groups_members')}">👥</button>
              <button class="btn btn-ghost btn-icon" onclick='openGroupModal(${JSON.stringify(g).replace(/'/g,"&#39;")})' title="Edit">✏️</button>
            </div>`).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'phases' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('tab_phases')||'Exercise Phases'}
          <button class="btn btn-primary btn-sm" onclick="openPhaseModal(null)">${t('btn_add')||'+ Add'}</button>
        </div>
        <div class="phase-list">
          ${state.phases.length === 0
            ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('phases_none')||'No phases defined.'}</div>`
            : state.phases.sort((a,b)=>a.order-b.order).map(ph => `
              <div class="phase-item" style="border-left:4px solid ${ph.color};padding:6px 8px;margin-bottom:6px;background:var(--bg2);border-radius:var(--radius)">
                <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text)">${escHtml(ph.name)}</div>
                <div style="font-size:var(--fs-xs);color:var(--text-dim)">${fmtDateTime(new Date(ph.start_time))} – ${fmtDateTime(new Date(ph.end_time))}</div>
                <div style="display:flex;gap:4px;margin-top:4px">
                  <button class="btn btn-ghost btn-sm" onclick='openPhaseModal(${JSON.stringify(ph).replace(/'/g,"&#39;")})'>✏️</button>
                  <button class="btn btn-danger btn-sm" onclick="deletePhase(${ph.id})">✕</button>
                </div>
              </div>`).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'audit' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `<div class="sidebar-section"><div class="sidebar-section-title">${t('tab_audit')}</div><div id="auditLog" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">Loading…</em></div></div>`;
    apiGet('/api/audit?limit=200').then(entries => {
      const container = document.getElementById('auditLog');
      if (!container) return;
      if (!entries || entries.length === 0) {
        container.innerHTML = `<em style="color:var(--text-dim)">${t('audit_empty')}</em>`;
        return;
      }
      container.innerHTML = `<div class="audit-list">${entries.map(e => `
        <div class="audit-item">
          <span class="audit-ts">${fmtDateTime(new Date(e.timestamp))}</span>
          <span class="audit-user">${escHtml(e.user_name)}</span>
          <span class="audit-action audit-action-${e.action}">${escHtml(e.action)}</span>
          <span class="audit-summary">${escHtml(e.summary)}</span>
        </div>`).join('')}
      </div>`;
    });
  } else if (tab === 'settings') {
    const p  = state.preferences;
    const ex = state.exercise || {};
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_theme')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.theme==='dark'?' active':''}" onclick="setPref('theme','dark')">${t('theme_dark')}</button>
          <button class="toggle-btn${p.theme==='light'?' active':''}" onclick="setPref('theme','light')">${t('theme_light')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_size')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.size==='small'?' active':''}" onclick="setPref('size','small')">${t('size_small')}</button>
          <button class="toggle-btn${p.size==='normal'?' active':''}" onclick="setPref('size','normal')">${t('size_normal')}</button>
          <button class="toggle-btn${p.size==='large'?' active':''}" onclick="setPref('size','large')">${t('size_large')}</button>
          <button class="toggle-btn${p.size==='huge'?' active':''}" onclick="setPref('size','huge')">${t('size_huge')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_language')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.language==='en'?' active':''}" onclick="setPref('language','en')">EN</button>
          <button class="toggle-btn${p.language==='sv'?' active':''}" onclick="setPref('language','sv')">SV</button>
          <button class="toggle-btn${p.language==='fr'?' active':''}" onclick="setPref('language','fr')">FR</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_day_hours')}</div>
        <div class="hour-range">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_start')}</label>
          <input type="number" min="0" max="23" value="${p.day_start_hour||0}" id="prefStartH" style="width:52px" onchange="setHourPref()">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">–</label>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_end')}</label>
          <input type="number" min="1" max="24" value="${p.day_end_hour||24}" id="prefEndH" style="width:52px" onchange="setHourPref()">
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_webhook')}</div>
        <div class="form-group" style="margin-bottom:6px">
          <select id="prefWebhookType" style="width:100%;margin-bottom:4px">
            <option value="generic"${p.webhook_type==='generic'||!p.webhook_type?' selected':''}>Generic JSON</option>
            <option value="mattermost"${p.webhook_type==='mattermost'?' selected':''}>Mattermost / Slack</option>
          </select>
          <input type="url" id="prefWebhookURL" placeholder="https://…/webhook" value="${escHtml(p.webhook_url||'')}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" onclick="saveWebhookPref()">${t('btn_save')}</button>
          <button class="btn btn-secondary btn-sm" onclick="testWebhook()">${t('settings_webhook_test')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_view')||'Default View'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['day','2days','3days','4days','week'].map(v =>
            `<button class="toggle-btn${(p.default_view||'week')===v?' active':''}" onclick="setDefaultView('${v}')">${t('range_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_date_format')||'Date / Time Format'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${[['iso','ISO 8601'],['uk','UK'],['fr','FR'],['sv','SV']].map(([v,l]) =>
            `<button class="toggle-btn${(p.date_format||'iso')===v?' active':''}" onclick="setPref('date_format','${v}')">${l}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_out_of_hours')||'Out-of-Hours Area'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefShowOOH" ${p.show_out_of_hours!==false?'checked':''} onchange="setOOHPref(this.checked)"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_out_of_hours')||'Show ghosted area outside day hours'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_red_line')||'Current-time Line'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="prefRedLine" ${p.red_line_enabled!==false?'checked':''} onchange="setRedLinePref()"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_red_line_enabled')||'Show current-time line'}
        </label>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 8px;align-items:center;font-size:var(--fs-xs);color:var(--text-dim)">
          <span>${t('settings_red_line_color')||'Color'}:</span>
          <input type="color" id="prefLineColor" value="${p.red_line_color||'#E74C3C'}" onchange="setRedLinePref()"
            style="width:32px;height:22px;padding:0;border:none;background:transparent;cursor:pointer">
          <span>${t('settings_red_line_width')||'Width'}:</span>
          <input type="number" id="prefLineWidth" min="1" max="8" value="${p.red_line_width||2}" onchange="setRedLinePref()"
            style="width:52px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <span>${t('settings_red_line_style')||'Style'}:</span>
          <select id="prefLineStyle" onchange="setRedLinePref()"
            style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            <option value="solid" ${(p.red_line_style||'solid')==='solid'?'selected':''}>Solid</option>
            <option value="dashed" ${p.red_line_style==='dashed'?'selected':''}>Dashed</option>
            <option value="dotted" ${p.red_line_style==='dotted'?'selected':''}>Dotted</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:8px">
          <input type="checkbox" id="prefSynthLabel" ${p.synth_label?'checked':''} onchange="setSynthLabelPref(this.checked)"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_synth_label')||'Show H+N label on red line'}
        </label>
      </div>
      ${synthActive() ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('freeze_label')||'Timeline Freeze'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin:0 0 8px">${state.timelinePaused ? (t('freeze_active')||'Timeline is frozen.') : (t('freeze_desc')||'Freeze progression for exercise review.')}</p>
        <button class="btn btn-sm ${state.timelinePaused?'btn-danger':'btn-secondary'}" onclick="toggleFreeze()">
          ${state.timelinePaused ? ('▶ '+(t('btn_resume')||'Resume')) : ('⏸ '+(t('btn_freeze')||'Freeze'))}
        </button>
      </div>` : ''}
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_exercise')}</div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_exercise_label')}</label>
          <input type="text" id="exLabel" value="${escHtml(ex.label||'')}" placeholder="${t('settings_exercise_label_ph')||'Exercise name…'}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">STARTEX — ${t('settings_exercise_epoch')}</label>
          <input type="datetime-local" id="exEpoch" value="${ex.epoch ? fmtDateInput(new Date(ex.epoch)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">ENDEX — ${t('settings_exercise_endex')||'End of exercise'}</label>
          <input type="datetime-local" id="exEndex" value="${ex.endex ? fmtDateInput(new Date(ex.endex)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-check" style="margin-bottom:6px">
          <input type="checkbox" id="exEnabled" ${ex.enabled?'checked':''}>
          <label for="exEnabled" style="font-size:var(--fs-sm)">${t('settings_exercise_enable')}</label>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exDayHoursOnly" ${ex.day_hours_only?'checked':''}>
          <label for="exDayHoursOnly" style="font-size:var(--fs-sm)">${t('synth_day_hours_only')||'Day hours only'}</label>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveExercise()">${t('btn_save')}</button>
        ${state.user.role==='admin' ? `<a href="/admin-view" class="btn btn-secondary btn-sm" style="margin-left:4px">⚙ ${t('admin_view')||'Admin View'}</a>` : ''}
      </div>` : ''}
    `;
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
  state.preferences.red_line_width   = parseInt(document.getElementById('prefLineWidth')?.value || '2', 10);
  state.preferences.red_line_style   = document.getElementById('prefLineStyle')?.value || 'solid';
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}

async function setSynthLabelPref(val) {
  state.preferences.synth_label = val;
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
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
  const enabled     = document.getElementById('exEnabled')?.checked || false;
  const dayHrsOnly  = document.getElementById('exDayHoursOnly')?.checked || false;
  const payload = {
    enabled,
    epoch: epoch ? new Date(epoch).toISOString() : '',
    endex: endex ? new Date(endex).toISOString() : '',
    label,
    day_hours_only: dayHrsOnly,
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

async function setDefaultView(view) {
  state.preferences.default_view = view;
  state.range = view;
  document.getElementById('rangeSelect').value = view;
  applyPreferences();
  await savePreferences();
  renderSidebar();
  await refreshAll();
}

// ── Preference actions ─────────────────────────────────────────────────────
async function setPref(key, value) {
  state.preferences[key] = value;
  applyPreferences();
  await savePreferences();
  renderSidebar();
  renderTimeline();
  updateUILabels();
}

async function setHourPref() {
  const sh = parseInt(document.getElementById('prefStartH').value, 10);
  const eh = parseInt(document.getElementById('prefEndH').value, 10);
  if (isNaN(sh)||isNaN(eh)||sh>=eh) return;
  state.preferences.day_start_hour = sh;
  state.preferences.day_end_hour   = eh;
  await savePreferences();
  renderTimeline();
}

async function toggleType(key) {
  const ht = state.preferences.hidden_types || [];
  if (ht.includes(key)) {
    state.preferences.hidden_types = ht.filter(k => k!==key);
  } else {
    state.preferences.hidden_types = [...ht, key];
  }
  await savePreferences();
  renderSidebar();
  renderTimeline();
}

function toggleLayer(id) {
  // Exclusion model: hidden_layers lists what to hide; toggling flips visibility
  const hl = state.preferences.hidden_layers || [];
  if (hl.includes(id)) {
    state.preferences.hidden_layers = hl.filter(x => x !== id); // unhide
  } else {
    state.preferences.hidden_layers = [...hl, id]; // hide
  }
  // Immediate visual update, save in background
  renderSidebar();
  renderTimeline();
  const pop = document.getElementById('layerPopover');
  if (pop && pop.style.display !== 'none') renderLayerPopover();
  savePreferences(); // fire-and-forget
}

function toggleAllLayers() {
  state.preferences.hidden_layers = []; // show all layers
  // Immediate visual update, save in background
  renderSidebar();
  renderTimeline();
  const pop = document.getElementById('layerPopover');
  if (pop && pop.style.display !== 'none') renderLayerPopover();
  savePreferences(); // fire-and-forget
}

function hasRole2(userRole, required) {
  const order = {read:0, reporter:1, readwrite:2, teamlead:3, oplead:4, admin:5};
  return (order[userRole]||0) >= (order[required]||0);
}

// ── Synthetic time helpers ─────────────────────────────────────────────────
function synthActive() {
  return state.syntheticOn && state.exercise && state.exercise.enabled && state.exercise.epoch;
}

// Compute elapsed synthetic hours, optionally skipping out-of-hours time
function synthElapsedHours(epochMs, nowMs) {
  const ex = state.exercise;
  if (!ex || !ex.day_hours_only) {
    return Math.floor((nowMs - epochMs) / 3600000);
  }
  const dayStartH = state.preferences.day_start_hour || 0;
  const dayEndH   = state.preferences.day_end_hour   || 24;
  const dayMs     = (dayEndH - dayStartH) * 3600000;
  let elapsed = 0;
  let cur = epochMs;
  while (cur < nowMs) {
    const d = new Date(cur);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayStartH, 0, 0).getTime();
    const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayEndH, 0, 0).getTime();
    const segStart = Math.max(cur, dayStart);
    const segEnd   = Math.min(nowMs, dayEnd);
    if (segEnd > segStart) elapsed += segEnd - segStart;
    // Advance to start of next day
    cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, dayStartH, 0, 0).getTime();
  }
  return Math.floor(elapsed / 3600000);
}

function toDayNumber(date) {
  const epoch = new Date(state.exercise.epoch);
  const epochDay = startOfDay(epoch);
  const diffMs   = startOfDay(date) - epochDay;
  const diffDays = Math.round(diffMs / 86400000);
  return diffDays + 1; // Day 1 = epoch day
}

function synthDayHeader(date) {
  return 'Day ' + toDayNumber(date);
}

function updateSyntheticUI() {
  const btn   = document.getElementById('btnSyntheticTime');
  const badge = document.getElementById('exerciseBadge');
  const ex    = state.exercise;
  if (ex && ex.enabled) {
    btn.style.display = '';
    btn.classList.toggle('active', state.syntheticOn);
    if (badge) {
      badge.style.display = (state.syntheticOn && ex.label) ? '' : 'none';
      badge.textContent   = ex.label || '';
    }
  } else {
    btn.style.display = 'none';
    if (badge) badge.style.display = 'none';
  }
}

// ── UI labels (i18n) ───────────────────────────────────────────────────────
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateUILabels() {
  // Header buttons
  document.getElementById('btnToday').textContent    = t('today');
  const znBtn = document.getElementById('btnZoomNow');
  if (znBtn) znBtn.title = t('zoom_now');
  setElText('btnAddEvent', t('add_event'));
  setElText('btnAddLock', t('lock_slot'));
  setElText('btnLogout', t('logout'));
  setElText('btnExport', t('btn_export'));
  setElText('btnReport', t('btn_report'));
  setElText('lbl-show', t('show')+':');
  setElText('lbl-res', t('resolution')+':');

  // Range select options
  const rs = document.getElementById('rangeSelect');
  const rangeKeys = ['day','2days','3days','4days','week','month','2months','3months'];
  [...rs.options].forEach((opt, i) => { opt.text = t('range_'+rangeKeys[i]); });

  // Resolution select
  const res = document.getElementById('resolutionSelect');
  [...res.options].forEach(opt => { opt.text = t('res_'+opt.value); });

  // Sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.textContent = t('tab_'+tab.dataset.tab) || tab.dataset.tab;
  });

  // Alarm modal
  setElText('lbl-alarm-cancel', t('btn_cancel'));
  setElText('btnSaveAlarm', t('alarm_set'));

  // Lock modal
  setElText('lbl-lock-cancel', t('btn_cancel'));
  setElText('btnSaveLock', t('btn_lock'));

  // Event modal
  setElText('lbl-btn-cancel', t('btn_cancel'));
  setElText('btnSaveEvent', t('btn_save'));
  setElText('btnDeleteEvent', t('btn_delete'));
  setElText('lbl-ev-responsible', t('ev_responsible') || 'Responsible');
  setElText('lbl-ev-invited', t('ev_invited') || 'Invited (notify on creation)');
  setElText('lbl-report-layers', t('report_layers') || 'Layers to include');
  // Status options
  const evStatus = document.getElementById('eventStatus');
  if (evStatus) {
    [...evStatus.options].forEach(opt => { opt.text = t('status_'+opt.value) || opt.text; });
  }
  // Recurrence pattern options
  const evPat = document.getElementById('eventRecurrencePattern');
  if (evPat) {
    [...evPat.options].forEach(opt => { opt.text = t('event_pattern_'+opt.value) || opt.text; });
  }

  // User modal
  setElText('lbl-u-username', t('user_username_lbl') || t('user_username'));
  setElText('lbl-u-password', t('user_password'));
  setElText('lbl-u-display', t('user_display'));
  setElText('lbl-u-role', t('user_role'));
  setElText('lbl-u-canlock', t('user_can_lock'));
  setElText('lbl-u-groups', t('user_groups'));
  setElText('lbl-u-changepwd', t('change_password'));
  setElText('lbl-u-cancel', t('btn_cancel'));
  setElText('btnSaveUser', t('btn_save'));
  setElText('btnDeleteUser', t('user_delete'));
  const uRole = document.getElementById('uRole');
  if (uRole) {
    const roleMap = {read:'role_read',reporter:'role_reporter',readwrite:'role_readwrite',teamlead:'role_teamlead',oplead:'role_oplead',admin:'role_admin'};
    [...uRole.options].forEach(opt => { opt.text = t(roleMap[opt.value]) || opt.text; });
  }

  // Password modal
  setElText('lbl-pwd-title', t('change_password'));
  setElText('lbl-pwd-current', t('current_password'));
  setElText('lbl-pwd-new', t('new_password'));
  setElText('lbl-pwd-confirm', t('confirm_password'));
  setElText('lbl-pwd-cancel', t('btn_cancel'));
  setElText('btnSavePassword', t('change_password'));

  // Phase modal
  setElText('lbl-phase-name', t('phase_name'));
  setElText('lbl-phase-color', t('phase_color'));
  setElText('lbl-phase-start', t('phase_start'));
  setElText('lbl-phase-end', t('phase_end'));
  setElText('lbl-phase-order', t('phase_order_lbl') || 'Order (0-9)');
  setElText('lbl-phase-layer', t('phase_layer_lbl') || 'Layer (empty = master timeline)');
  setElText('lbl-phase-cancel', t('btn_cancel'));
  setElText('btnSavePhase', t('btn_save'));
  setElText('btnDeletePhase', t('btn_delete'));

  // Group modal
  setElText('lbl-group-name', t('group_name_lbl') || 'Name *');
  setElText('lbl-group-desc', t('event_description'));
  setElText('lbl-group-cancel', t('btn_cancel'));
  setElText('btnSaveGroup', t('btn_save'));
  setElText('btnDeleteGroup', t('btn_delete'));

  // Layer modal
  setElText('lbl-layer-name', t('layer_name_lbl') || 'Name *');
  setElText('lbl-layer-color', t('event_type_color'));
  setElText('lbl-layer-desc', t('event_description'));
  setElText('lbl-layer-vis', t('layer_visibility_private').replace(/^./, '') || 'Visibility');
  setElText('lbl-layer-perm', t('layer_perm_lbl') || 'Group Permission');
  setElText('lbl-layer-groups', t('layer_shared_groups'));
  setElText('lbl-layer-cancel', t('btn_cancel'));
  setElText('btnSaveLayer', t('btn_save'));
  setElText('btnDeleteLayer', t('btn_delete'));
  const lVis = document.getElementById('layerVisibility');
  if (lVis) {
    const visMap = {private:'layer_visibility_private',groups:'layer_visibility_groups',public:'layer_visibility_public'};
    [...lVis.options].forEach(opt => { opt.text = t(visMap[opt.value]) || opt.text; });
  }
  const lPerm = document.getElementById('layerPermission');
  if (lPerm) {
    const permMap = {read:'layer_permission_read',readwrite:'layer_permission_readwrite'};
    [...lPerm.options].forEach(opt => { opt.text = t(permMap[opt.value]) || opt.text; });
  }

  // Event type modal
  setElText('lbl-etype-key', t('event_type_key'));
  setElText('lbl-etype-color', t('event_type_color'));
  setElText('lbl-etype-label', t('event_type_label'));
  setElText('lbl-etype-label-sv', t('event_type_label_sv'));
  setElText('lbl-etype-label-fr', t('event_type_label_fr'));
  setElText('lbl-etype-cancel', t('btn_cancel'));
  setElText('btnSaveEtype', t('btn_save'));
  setElText('btnDeleteEtype', t('btn_delete'));

  // Report modal
  setElText('lbl-report-title', '📄 ' + (t('report_title') || 'Generate Report'));
  setElText('lbl-report-type', t('report_type_label') || 'Report type');
  setElText('lbl-report-format', t('report_format_label') || 'Format');
  setElText('lbl-report-from', t('event_start'));
  setElText('lbl-report-to', t('event_end'));
  setElText('lbl-report-cancel', t('btn_cancel'));
  setElText('lbl-report-generate', t('report_generate'));
  const rType = document.getElementById('reportType');
  if (rType) {
    const typeMap = {aar: t('report_type_aar'), timeline: t('report_type_timeline'), per_layer: t('report_type_perlayer') || 'Per-Layer Activity'};
    [...rType.options].forEach(opt => { opt.text = typeMap[opt.value] || opt.text; });
  }
  const rFmt = document.getElementById('reportFormat');
  if (rFmt) {
    const fmtMap = {html: t('report_format_html_opt') || t('report_format_html'), print: t('report_format_print_opt') || t('report_format_pdf')};
    [...rFmt.options].forEach(opt => { opt.text = fmtMap[opt.value] || opt.text; });
  }

  // Member modal
  setElText('lbl-member-close', t('btn_close'));

  // Language flag active state
  updateLangFlags();
}

function updateLangFlags() {
  const lang = (state.preferences && state.preferences.language) || 'en';
  ['EN', 'SV', 'FR'].forEach(code => {
    const btn = document.getElementById('flag'+code);
    if (btn) btn.classList.toggle('active', lang === code.toLowerCase());
  });
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Notifications ──────────────────────────────────────────────────────────
function showNotification(type, message, duration=4000) {
  const area = document.getElementById('notification-area');
  const el   = document.createElement('div');
  el.className = `notification${type==='alarm'?' alarm':''}`;
  const title  = type==='alarm' ? t('notif_alarm_title') : t('notif_done');
  el.innerHTML = `
    <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    <div class="notification-title">${title}</div>
    <div class="notification-msg">${escHtml(message)}</div>
  `;
  area.appendChild(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
}

// ── SSE ────────────────────────────────────────────────────────────────────
function connectSSE() {
  const es = new EventSource('/api/notifications/stream');
  es.addEventListener('alarm', e => {
    const data = JSON.parse(e.data);
    showAlarmNotification(data, 0);
  });
  es.onerror = () => setTimeout(connectSSE, 5000);
}

// ── Alarm ACK ──────────────────────────────────────────────────────────────
const unackedAlarms = new Map(); // alarmID → {data, level, timerID, element}

function showAlarmNotification(data, level) {
  // Clear any existing notification for this alarm
  const existing = unackedAlarms.get(data.alarm_id);
  if (existing) {
    clearTimeout(existing.timerID);
    if (existing.element && existing.element.parentNode) existing.element.remove();
  }

  const area = document.getElementById('notification-area');
  const el   = document.createElement('div');
  el.className = `notification alarm alarm-level-${Math.min(level, 2)}`;

  const warnings = level > 0 ? ' ' + '⚠️'.repeat(Math.min(level, 3)) : '';
  el.innerHTML = `
    <div class="notification-title">${t('notif_alarm_title')}${escHtml(warnings)}</div>
    <div class="notification-msg">${escHtml(data.message)}</div>
    <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm notification-close-btn" onclick="dismissAlarmNotif(${data.alarm_id})">Dismiss</button>
      <button class="btn btn-primary btn-sm" onclick="ackAlarm(${data.alarm_id}, this.closest('.notification'))">✓ ${t('alarm_ack')}</button>
    </div>
  `;
  area.appendChild(el);

  // Browser notification on first fire
  if (level === 0 && Notification.permission === 'granted') {
    new Notification('Tidslinjal — ' + t('notif_alarm_title'), {body: data.message});
  }

  // Escalate after 60 s if not acked, as long as we're before the event time
  const eventTime = new Date(data.event_time);
  const timerID = (new Date() < eventTime)
    ? setTimeout(() => showAlarmNotification(data, level + 1), 60000)
    : null;

  unackedAlarms.set(data.alarm_id, {data, level, timerID, element: el});
}

function dismissAlarmNotif(alarmID) {
  const entry = unackedAlarms.get(alarmID);
  if (entry) {
    clearTimeout(entry.timerID);
    unackedAlarms.delete(alarmID);
    if (entry.element && entry.element.parentNode) entry.element.remove();
  }
}

async function ackAlarm(alarmID, notifEl) {
  const res = await apiPost(`/api/alarms/${alarmID}/ack`, {});
  if (res.ok) {
    dismissAlarmNotif(alarmID);
    if (notifEl && notifEl.parentNode) notifEl.remove();
    await fetchAlarms();
    renderSidebar();
    showNotification('success', t('alarm_acked'));
  }
}

// ── Utility ────────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Export ─────────────────────────────────────────────────────────────────
function openExportModal() {
  // Show/hide privileged-only categories
  const isPriv = hasRole2(state.user?.role, 'oplead');
  const usersCb  = document.getElementById('exportUsersCb');
  const phasesCb = document.getElementById('exportPhasesCb');
  if (usersCb)  usersCb.style.display  = isPriv ? '' : 'none';
  if (phasesCb) phasesCb.style.display = isPriv ? '' : 'none';
  // Toggle chip style on checkbox change
  document.querySelectorAll('.export-cat-cb').forEach(cb => {
    cb.onchange = () => cb.closest('.group-chip').classList.toggle('selected', cb.checked);
  });
  openModal('exportModal');
}

function doExport(format) {
  if (format === 'ics') { closeModal('exportModal'); exportICS(); return; }
  if (format === 'csv') { closeModal('exportModal'); exportCSV(); return; }
  if (format === 'json') {
    const cats = [...document.querySelectorAll('.export-cat-cb:checked')].map(cb => cb.value);
    const include = cats.join(',') || 'events';
    const url = `/api/export?include=${encodeURIComponent(include)}`;
    window.location.href = url;
    closeModal('exportModal');
    return;
  }
}

function openImportModal() {
  const isPriv = hasRole2(state.user?.role, 'oplead');
  const usersCb     = document.getElementById('importUsersCb');
  const reassignRow = document.getElementById('importReassignRow');
  if (usersCb)     usersCb.style.display     = isPriv ? '' : 'none';
  if (reassignRow) reassignRow.style.display = isPriv ? '' : 'none';
  // Toggle chip style on checkbox change
  document.querySelectorAll('.import-cat-cb').forEach(cb => {
    cb.onchange = () => cb.closest('.group-chip').classList.toggle('selected', cb.checked);
  });
  const resultEl = document.getElementById('importResult');
  if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }
  openModal('importModal');
}

async function doImport() {
  const fileEl = document.getElementById('importFile');
  if (!fileEl || !fileEl.files.length) { showError('Please select a JSON export file.', 'Validation'); return; }
  const cats = [...document.querySelectorAll('.import-cat-cb:checked')].map(cb => cb.value);
  if (!cats.length) { showError('Select at least one category to import.', 'Validation'); return; }
  const reassign = document.getElementById('importReassign')?.checked || false;
  const fd = new FormData();
  fd.append('data', fileEl.files[0]);
  fd.append('include', cats.join(','));
  fd.append('reassign', reassign ? 'true' : 'false');
  const res = await api('POST', '/api/import', fd);
  const resultEl = document.getElementById('importResult');
  if (res.ok) {
    const r = await res.json();
    const msg = `Imported: ${r.events||0} events, ${r.groups||0} groups, ${r.layers||0} layers, ${r.alarms||0} alarms, ${r.users||0} users. Skipped: ${r.skipped||0}.`;
    if (resultEl) { resultEl.textContent = msg; resultEl.style.display = ''; }
    await refreshAll();
    showNotification('success', 'Import complete');
  } else {
    const err = await res.json();
    showError('Import failed: ' + err.error);
  }
}

function exportCSV() {
  const events = state.events;
  if (!events.length) { showError('No events in the current view to export.', 'Validation'); return; }
  const headers = ['ID','Title','Type','Status','Start','End','All Day','Participant','Layer','Created By','Description'];
  const rows = events.map(ev => [
    ev.id,
    `"${(ev.title||'').replace(/"/g,'""')}"`,
    ev.event_type,
    ev.status,
    ev.all_day ? ev.start_time.slice(0,10) : ev.start_time,
    ev.all_day ? '' : (ev.end_time || ''),
    ev.all_day ? 'yes' : 'no',
    ev.participant || '',
    ev.layer_id || '',
    `"${(ev.created_by_name||'').replace(/"/g,'""')}"`,
    `"${(ev.description||'').replace(/"/g,'""').replace(/\n/g,' ')}"`,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tidslinjal-${state.startDate.toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Templates ──────────────────────────────────────────────────────────────
async function openTemplatesModal() {
  await renderTemplatesList();
  // Wire up save button
  const btn = document.getElementById('btnSaveTemplate');
  if (btn) btn.onclick = openSaveTemplateDialog;
  openModal('templatesModal');
}

async function renderTemplatesList() {
  const listEl = document.getElementById('templatesList');
  if (!listEl) return;
  const templates = await apiGet('/api/templates') || [];
  if (!templates.length) {
    listEl.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">No templates yet. Save the current events as a template to get started.</p>`;
    return;
  }
  listEl.innerHTML = templates.map(tmpl => `
    <div class="tmpl-card">
      <div class="tmpl-card-info">
        <div class="tmpl-card-name">${escHtml(tmpl.name)}</div>
        <div class="tmpl-card-meta">
          ${tmpl.item_count || 0} event${(tmpl.item_count||0)!==1?'s':''} ·
          ${tmpl.scope === 'private' ? '🔒 Private' : '🌐 Public'} ·
          by ${escHtml(tmpl.created_by_name||'—')}
          ${tmpl.description ? ' · ' + escHtml(tmpl.description) : ''}
        </div>
      </div>
      <div class="tmpl-card-actions">
        <button class="btn btn-primary btn-sm" onclick="openApplyTemplateDialog(${tmpl.id}, ${JSON.stringify(escHtml(tmpl.name))}, ${tmpl.item_count||0})">▶ Apply</button>
        ${(state.user && (state.user.id === tmpl.created_by || hasRole2(state.user.role, 'admin')))
          ? `<button class="btn btn-danger btn-sm" onclick="deleteTemplate(${tmpl.id})">Delete</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

function openSaveTemplateDialog() {
  const evCount = state.events.length;
  const el = document.getElementById('tmplEventCount');
  if (el) el.textContent = `Will save ${evCount} event${evCount!==1?'s':''} from the current view.`;
  document.getElementById('tmplName').value = '';
  document.getElementById('tmplDescription').value = '';
  document.getElementById('tmplScope').value = 'private';
  // Role-based visibility
  const scopeSel = document.getElementById('tmplScope');
  if (scopeSel) {
    const isPriv = hasRole2(state.user?.role, 'oplead');
    [...scopeSel.options].forEach(opt => {
      if (opt.value === 'public') opt.hidden = !isPriv;
    });
  }
  document.getElementById('btnConfirmSaveTemplate').onclick = confirmSaveTemplate;
  openModal('saveTemplateModal');
}

async function confirmSaveTemplate() {
  const name = document.getElementById('tmplName').value.trim();
  if (!name) { showError('Template name is required.', 'Validation'); return; }
  const scope = document.getElementById('tmplScope').value;
  // Build items from current events
  const events = state.events;
  if (!events.length) { showError('No events in current view.', 'Validation'); return; }
  // Find earliest start to anchor offsets
  const earliest = Math.min(...events.map(e => new Date(e.start_time).getTime()));
  const items = events.map(e => {
    const startMs = new Date(e.start_time).getTime();
    const endMs   = e.end_time ? new Date(e.end_time).getTime() : null;
    return {
      title:              e.title,
      event_type:         e.event_type,
      color:              e.color,
      description:        e.description || '',
      start_offset_min:   Math.round((startMs - earliest) / 60000),
      duration_min:       endMs ? Math.round((endMs - startMs) / 60000) : 0,
      all_day:            e.all_day,
      is_recurring:       e.is_recurring,
      recurrence_pattern: e.recurrence_pattern || '',
      participant:        e.participant || '',
    };
  });
  const payload = {
    name,
    description: document.getElementById('tmplDescription').value.trim(),
    scope,
    items,
  };
  const res = await apiPost('/api/templates', payload);
  if (res.ok) {
    closeModal('saveTemplateModal');
    showNotification('success', 'Template saved');
    renderTemplatesList();
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

function openApplyTemplateDialog(id, name, itemCount) {
  document.getElementById('applyTemplateInfo').textContent =
    `Apply template "${name}" (${itemCount} event${itemCount!==1?'s':''})`;
  document.getElementById('applyTemplateBase').value = fmtDateInput(new Date());
  // Populate layer select
  const layerSel = document.getElementById('applyTemplateLayer');
  layerSel.innerHTML = `<option value="">Master Timeline</option>` +
    state.layers.filter(l => l.owner_id===state.user.id || l.permission==='readwrite')
      .map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
  document.getElementById('btnConfirmApplyTemplate').onclick = () => confirmApplyTemplate(id);
  openModal('applyTemplateModal');
}

async function confirmApplyTemplate(id) {
  const baseVal   = document.getElementById('applyTemplateBase').value;
  if (!baseVal) { showError('Please select a base date/time.', 'Validation'); return; }
  const layerVal  = document.getElementById('applyTemplateLayer').value;
  const payload   = {
    base_time: new Date(baseVal).toISOString(),
    layer_id:  layerVal ? parseInt(layerVal, 10) : null,
  };
  const res = await apiPost(`/api/templates/${id}/apply`, payload);
  if (res.ok) {
    const r = await res.json();
    closeModal('applyTemplateModal');
    closeModal('templatesModal');
    await refreshAll();
    showNotification('success', `Created ${r.created || 0} event${(r.created||0)!==1?'s':''} from template`);
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  const res = await apiDel(`/api/templates/${id}`);
  if (res.ok) {
    showNotification('success', 'Template deleted');
    renderTemplatesList();
  } else {
    const err = await res.json();
    showError(err.error);
  }
}

// ── ICS Export ─────────────────────────────────────────────────────────────
function toICSDate(d) {
  const pad = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function escICS(s) {
  return (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function exportICS() {
  const events = state.events;
  if (!events.length) { showError('No events in the current view to export.', 'Validation'); return; }
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tidslinjal//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
  for (const ev of events) {
    const evStart = new Date(ev.start_time);
    const evEnd   = ev.end_time ? new Date(ev.end_time) : new Date(evStart.getTime() + 3600000);
    ics += 'BEGIN:VEVENT\r\n';
    ics += `UID:tidslinjal-${ev.id}@tidslinjal\r\n`;
    ics += `DTSTAMP:${toICSDate(new Date(ev.created_at))}\r\n`;
    ics += `DTSTART:${toICSDate(evStart)}\r\n`;
    ics += `DTEND:${toICSDate(evEnd)}\r\n`;
    ics += `SUMMARY:${escICS(ev.title)}\r\n`;
    if (ev.description) ics += `DESCRIPTION:${escICS(ev.description)}\r\n`;
    if (ev.created_by_name) ics += `ORGANIZER;CN=${escICS(ev.created_by_name)}:MAILTO:noreply@tidslinjal\r\n`;
    ics += `CATEGORIES:${escICS(ev.event_type)}\r\n`;
    if (ev.is_recurring && ev.recurrence_pattern) {
      const rruleMap = {
        '30min':     'MINUTELY;INTERVAL=30',
        'hourly':    'HOURLY',
        '2hours':    'HOURLY;INTERVAL=2',
        '3hours':    'HOURLY;INTERVAL=3',
        '4hours':    'HOURLY;INTERVAL=4',
        'daily':     'DAILY',
        'weekly':    'WEEKLY',
        'monthly':   'MONTHLY',
        'quarterly': 'MONTHLY;INTERVAL=3',
      };
      const freq = rruleMap[ev.recurrence_pattern];
      if (freq) {
        let rr = `RRULE:FREQ=${freq}`;
        if (ev.recurrence_end) rr += `;UNTIL=${toICSDate(new Date(ev.recurrence_end))}`;
        ics += rr + '\r\n';
      }
    }
    ics += 'END:VEVENT\r\n';
  }
  ics += 'END:VCALENDAR\r\n';
  const blob = new Blob([ics], {type: 'text/calendar;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tidslinjal-${state.startDate.toISOString().slice(0,10)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Layer quick-toggle popover ─────────────────────────────────────────────
function renderLayerPopover() {
  const list         = document.getElementById('layerPopoverList');
  const hiddenCount  = (state.preferences.hidden_layers || []).length;
  const allVisible   = hiddenCount === 0;
  list.innerHTML = `
    <div class="layer-pop-hint" style="font-size:10px;opacity:0.6;padding:4px 8px 2px">${t('layers_multi_hint')||'Click to show/hide layers.'}</div>
    <div class="layer-pop-item${allVisible?' active':''}" onclick="toggleAllLayers()">
      <input type="checkbox" class="layer-pop-cb" ${allVisible?'checked':''} onclick="event.stopPropagation()">
      <div class="layer-pop-swatch" style="background:var(--accent)"></div>
      <span>${t('layers_master')||'All layers'}</span>
    </div>
    ${state.layers.map(l => {
      const visible = isLayerActive(l.id);
      return `<div class="layer-pop-item${visible?' active':''}" onclick="toggleLayer(${l.id})">
        <input type="checkbox" class="layer-pop-cb" ${visible?'checked':''} onclick="event.stopPropagation()">
        <div class="layer-pop-swatch" style="background:${l.color||'#4A90D9'}"></div>
        <span>${escHtml(l.name)}</span>
      </div>`;
    }).join('')}
    ${hiddenCount > 0 ? `<div class="layer-pop-hint" style="font-size:10px;opacity:0.5;padding:2px 8px 4px;text-align:right">${hiddenCount} layer${hiddenCount>1?'s':''} hidden</div>` : ''}
  `;
}

function openLayerPopover(btn) {
  const pop = document.getElementById('layerPopover');
  if (pop.style.display !== 'none') { pop.style.display = 'none'; return; }
  renderLayerPopover();
  const rect    = btn.getBoundingClientRect();
  pop.style.top  = (rect.bottom + 4) + 'px';
  pop.style.left = rect.left + 'px';
  pop.style.display = '';
}

// ── Drag-to-zoom on time column ────────────────────────────────────────────
function setupZoomDrag() {
  const container = document.getElementById('timeline-container');
  let dragging = false, startY = 0, startZoom = 1.0;

  container.addEventListener('mousedown', e => {
    if (!e.target.closest('.tl-time-label, .tl-corner')) return;
    dragging  = true;
    startY    = e.clientY;
    startZoom = state.zoomFactor;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // Drag up = zoom in, drag down = zoom out (150 px per zoom unit)
    const newZoom = Math.max(0.2, Math.min(6.0, startZoom + (startY - e.clientY) / 150));
    if (Math.abs(newZoom - state.zoomFactor) > 0.01) {
      state.zoomFactor = newZoom;
      renderTimeline();
    }
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  // Double-click on time column resets zoom
  container.addEventListener('dblclick', e => {
    if (!e.target.closest('.tl-time-label, .tl-corner')) return;
    state.zoomFactor = 1.0;
    renderTimeline();
  });
}

// ── Drag-to-reschedule ─────────────────────────────────────────────────────
function setupDragToReschedule() {
  const container = document.getElementById('timeline-container');
  let dragging = false, ghost = null, dragEvId = null, dragOrigEl = null;

  container.addEventListener('mousedown', e => {
    const block = e.target.closest('.event-block[data-ev-id]');
    if (!block) return;
    // Only allow drag if user can edit the event (check later on drop)
    dragging    = true;
    dragEvId    = parseInt(block.dataset.evId, 10);
    dragOrigEl  = block;
    // Create ghost
    ghost = block.cloneNode(true);
    ghost.style.cssText = `
      position: fixed; pointer-events: none; z-index: 999; opacity: 0.75;
      width: ${block.offsetWidth}px; box-shadow: 0 4px 20px rgba(0,0,0,.5);
      left: ${e.clientX - block.offsetWidth/2}px;
      top:  ${e.clientY - 12}px;
    `;
    ghost.classList.add('dragging');
    document.body.appendChild(ghost);
    block.style.opacity = '0.35';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging || !ghost) return;
    ghost.style.left = (e.clientX - parseInt(ghost.style.width)/2) + 'px';
    ghost.style.top  = (e.clientY - 12) + 'px';
    // Highlight target cell
    document.querySelectorAll('.tl-cell.drag-target').forEach(c => c.classList.remove('drag-target'));
    ghost.style.display = 'none';
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    ghost.style.display = '';
    const cell = els.find(el => el.classList.contains('tl-cell'));
    if (cell) cell.classList.add('drag-target');
  });

  document.addEventListener('mouseup', async e => {
    if (!dragging) return;
    dragging = false;
    if (ghost) { ghost.remove(); ghost = null; }
    document.querySelectorAll('.tl-cell.drag-target').forEach(c => c.classList.remove('drag-target'));
    if (dragOrigEl) dragOrigEl.style.opacity = '';

    // Find drop target cell
    const els  = document.elementsFromPoint(e.clientX, e.clientY);
    const cell = els.find(el => el.classList.contains('tl-cell'));
    if (!cell || !dragEvId) { dragEvId = null; dragOrigEl = null; return; }

    const dayIdx  = parseInt(cell.dataset.day,  10);
    const slotIdx = parseInt(cell.dataset.slot, 10);
    if (isNaN(dayIdx) || isNaN(slotIdx)) { dragEvId = null; dragOrigEl = null; return; }

    const ev = state.events.find(ev => ev.id === dragEvId);
    if (!ev) { dragEvId = null; dragOrigEl = null; return; }

    // Compute new start time
    const days     = getDays();
    const targetDay = days[dayIdx];
    if (!targetDay) { dragEvId = null; dragOrigEl = null; return; }

    const slotMin  = getSlotMinutes();
    const startOff = getStartHourOffset();
    const newMin   = startOff + slotIdx * slotMin;
    const newStart = new Date(targetDay);
    newStart.setHours(Math.floor(newMin / 60), newMin % 60, 0, 0);

    // Preserve duration
    const oldStart = new Date(ev.start_time);
    const oldEnd   = ev.end_time ? new Date(ev.end_time) : null;
    const payload  = { ...ev, start_time: newStart.toISOString() };
    if (oldEnd) {
      const dur = oldEnd - oldStart;
      payload.end_time = new Date(newStart.getTime() + dur).toISOString();
    }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    delete payload.created_by_name; delete payload.verified_by_name;

    const res = await apiPut('/api/events/'+dragEvId, payload);
    if (res.ok) {
      await refreshAll();
      showNotification('success', t('notif_event_updated'));
    } else {
      const err = await res.json();
      showError(err.error || 'Could not reschedule');
      if (dragOrigEl) dragOrigEl.style.opacity = '';
    }
    dragEvId = null; dragOrigEl = null;
  });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Skip if focus is in an input/textarea/select
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

    switch (e.key) {
      case 'ArrowLeft':
        if (!e.shiftKey) { navigate(-1); }
        break;
      case 'ArrowRight':
        if (!e.shiftKey) { navigate(1); }
        break;
      case 't':
        goToday();
        break;
      case 'n':
        zoomToNow();
        break;
      case 'e':
        if (state.user && hasRole2(state.user.role, 'readwrite')) openEventModal(null);
        break;
      case '?':
        openModal('helpModal');
        break;
      case 'Escape':
        // Close the topmost open modal
        const openModals = [...document.querySelectorAll('.modal-overlay.open')];
        if (openModals.length) closeModal(openModals[openModals.length-1].id);
        break;
      case '+':
      case '=':
        state.zoomFactor = Math.min(6.0, state.zoomFactor + 0.25);
        renderTimeline();
        break;
      case '-':
        state.zoomFactor = Math.max(0.2, state.zoomFactor - 0.25);
        renderTimeline();
        break;
    }
  });
}

// ── Horizontal drag-to-scroll (pan dates) ─────────────────────────────────
function setupHorizontalDrag() {
  const container = document.getElementById('timeline-container');
  let dragging = false, startX = 0, startScrollLeft = 0;
  let panTriggered = false; // distinguish from click

  container.addEventListener('mousedown', e => {
    // Only trigger on background (not event blocks, time labels, etc.)
    if (e.target.closest('.event-block,.tl-time-label,.tl-corner,.lock-overlay')) return;
    dragging = true;
    panTriggered = false;
    startX = e.clientX;
    startScrollLeft = container.scrollLeft;
    container.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) panTriggered = true;
    container.scrollLeft = startScrollLeft - dx;
  });

  document.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    container.style.cursor = '';
    // If we dragged far enough horizontally, navigate to adjacent date range
    const dx = startX - e.clientX;
    if (Math.abs(dx) > container.clientWidth * 0.4) {
      navigate(dx > 0 ? 1 : -1);
    }
  });
}

// ── Password change ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnSavePw = document.getElementById('btnSavePassword');
  if (btnSavePw) {
    btnSavePw.addEventListener('click', async () => {
      const curPw  = document.getElementById('pwdCurrent')?.value || '';
      const newPw  = document.getElementById('pwdNew')?.value?.trim()    || '';
      const conPw  = document.getElementById('pwdConfirm')?.value?.trim() || '';
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

  const btnExport = document.getElementById('btnExportData');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
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
      // Populate layer checkboxes in report modal
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
        // Toggle chip selected class on change
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

function fmtDuration(startIso, endIso) {
  if (!endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  if (ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

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
  <p style="color:#666;font-size:13px">Generated: ${new Date().toLocaleString()}</p>`;

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
        <td>${new Date(ev.start_time).toLocaleString()}</td>
        <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
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
        <td>${new Date(ev.start_time).toLocaleString()}</td>
        <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });
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
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);

  if (format === 'print') {
    // Open in new window and trigger print dialog (user can save as PDF)
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      // Delay print to allow rendering
      setTimeout(() => {
        printWin.print();
      }, 500);
    }
  } else {
    // Download as HTML
    const a = document.createElement('a');
    a.href     = url;
    a.download = `report-${type}-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  URL.revokeObjectURL(url);
  closeModal('reportModal');
  showNotification('success', t('report_ready')||'Report downloaded');
}

// ── Mobile nav ─────────────────────────────────────────────────────────────
function mobileNavTab(tab) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (tab === 'timeline') {
    closeMobileSidebar();
    return;
  }
  if (tab === 'menu') {
    // Show sidebar with first available tab
    sidebar.classList.add('visible');
    backdrop.classList.add('visible');
    return;
  }
  // Open sidebar to specific tab
  sidebar.classList.add('visible');
  backdrop.classList.add('visible');
  state.sidebarTab = tab;
  renderSidebar();
  // Update active tab button in sidebar
  document.querySelectorAll('.sidebar-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Highlight active mobile nav button
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const mn = document.getElementById('mn' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (mn) mn.classList.add('active');
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
}

// ── Init ───────────────────────────────────────────────────────────────────
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
  // Migrate legacy active_layers to hidden_layers (invert the old whitelist)
  if (!state.preferences.hidden_layers && state.preferences.active_layers && state.preferences.active_layers.length > 0) {
    const all = layers || [];
    state.preferences.hidden_layers = all.map(l => l.id).filter(id => !state.preferences.active_layers.includes(id));
  }
  state.eventTypes  = eventTypes || [];
  state.layers      = layers  || [];
  state.groups      = groups  || [];
  state.users       = users   || [];

  // Apply theme/size
  applyPreferences();

  // Sync UI with loaded preferences (apply default_view from prefs)
  state.resolution = 'hour';
  state.range      = state.preferences.default_view || 'week';
  document.getElementById('rangeSelect').value      = state.range;
  document.getElementById('resolutionSelect').value = state.resolution;

  // Update labels
  updateUILabels();

  // Load and display version + GitHub link
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
  } catch { /* ignore */ }

  // User info in header
  document.getElementById('userDisplayName').textContent = state.user.display_name || state.user.username;
  const roleEl = document.getElementById('userRoleBadge');
  roleEl.textContent  = t('role_'+state.user.role) || state.user.role;
  roleEl.className    = `role-badge role-${state.user.role}`;

  // Show/hide role-gated controls
  if (hasRole2(state.user.role, 'readwrite')) {
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
  // Long-press on prev/next: show jump menu; short click: navigate by current range
  setupNavLongPress(document.getElementById('btnPrev'), -1);
  setupNavLongPress(document.getElementById('btnNext'),  1);
  document.getElementById('btnToday').addEventListener('click',  goToday);
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
      // Mobile/tablet: overlay drawer
      sidebar.classList.toggle('visible');
      document.getElementById('sidebarBackdrop').classList.toggle('visible', sidebar.classList.contains('visible'));
    } else {
      // Desktop: push layout
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

  // Timeline refresh every 60s
  setInterval(refreshAll, 60000);

  // Time-line update every 30s
  setInterval(() => {
    updateCurrentTimeLine(getDays(), getSlotHeight());
  }, 30000);

  // SSE
  connectSSE();

  // Browser notifications
  if (Notification.permission === 'default') Notification.requestPermission();

  // Initial data load
  await refreshAll();

  // Set up drag-to-zoom on time column
  setupZoomDrag();

  // Set up drag-to-reschedule on event blocks
  setupDragToReschedule();

  // Keyboard shortcuts
  setupKeyboardShortcuts();

  // Horizontal drag-to-pan
  setupHorizontalDrag();

  // Change password button
  const btnChgPw = document.getElementById('btnChangePassword');
  if (btnChgPw) {
    btnChgPw.addEventListener('click', () => {
      const f = ['pwdCurrent','pwdNew','pwdConfirm'];
      f.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      openModal('passwordModal');
    });
  }

  // Pre-fill report date range with current view
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

  // Scroll to configured day start (or current time if within window)
  setTimeout(() => {
    const now    = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    const startH = (state.preferences.day_start_hour || 0) * 60;
    const endH   = (state.preferences.day_end_hour   || 24) * 60;
    if (nowMin >= startH && nowMin < endH) {
      scrollToNow();
    } else {
      scrollToDayStart();
    }
  }, 200);
}

document.addEventListener('DOMContentLoaded', init);
