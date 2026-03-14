/* ============================================================
   Tidslinjal — Timeline Rendering & Interactions
   Covers: renderTimeline, renderEventBlocks, current-time line,
   navigation, drag-to-reschedule, zoom, synthetic time.
   ============================================================ */
'use strict';

// ── Navigation ──────────────────────────────────────────────────────────────
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
function goToDate(dateStr) {
  if (!dateStr) return;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return;
  state.startDate = startOfDay(d);
  refreshAll();
}
function centerToday() {
  const today = startOfDay(new Date());
  state.startDate = addDays(today, -Math.floor(getRangeDays() / 2));
  refreshAll();
}
function centerDay(date) {
  state.startDate = addDays(startOfDay(date), -Math.floor(getRangeDays() / 2));
  refreshAll();
}

// ── Long-press navigation buttons ───────────────────────────────────────────
function setupNavLongPress(btn, dir) {
  if (!btn) return;
  let timer = null;
  let longPressed = false;

  btn.addEventListener('mousedown', () => {
    longPressed = false;
    timer = setTimeout(() => {
      longPressed = true;
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
    if (longPressed) { longPressed = false; return; }
    navigate(dir);
  });
}

// ── Cell click ──────────────────────────────────────────────────────────────
function onCellClick(e, startISO, endISO, outOfHours) {
  if (!state.user || state.user.role === 'read') return;
  if (outOfHours) return;
  openEventModal(null, new Date(startISO), new Date(endISO));
}

// ── Lock helpers ────────────────────────────────────────────────────────────
function getEventLock(ev) {
  if (!state.locks || !state.locks.length) return null;
  const evStart = new Date(ev.start_time);
  const evEnd   = ev.end_time ? new Date(ev.end_time) : addHours(evStart, 1);
  return state.locks.find(l => {
    const ls = new Date(l.start_time), le = new Date(l.end_time);
    if (evStart >= le || evEnd <= ls) return false;
    const sc = l.scope || 'all';
    if (sc === 'all') return true;
    if (sc === 'master') return !ev.layer_id;
    if (sc === 'layer') return ev.layer_id && ev.layer_id === l.layer_id;
    return true;
  }) || null;
}
function isEventLocked(ev) { return !!getEventLock(ev); }

// ── Synthetic time ──────────────────────────────────────────────────────────
function synthActive() {
  return state.syntheticOn && state.exercise && state.exercise.enabled && state.exercise.epoch;
}

function isWeekendDay(date) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  return dow === 0 || dow === 6;
}

function synthElapsedHours(epochMs, nowMs) {
  const ex = state.exercise;
  const skipWeekends = ex && ex.include_weekends === false;
  if (!ex || (!ex.day_hours_only && !skipWeekends)) {
    return Math.floor((nowMs - epochMs) / 3600000);
  }
  const dayStartH = state.preferences.day_start_hour || 0;
  const dayEndH   = state.preferences.day_end_hour   || 24;
  let elapsed = 0;
  let cur = epochMs;
  while (cur < nowMs) {
    const d = new Date(cur);
    // Skip entire weekends if include_weekends is false
    if (skipWeekends && isWeekendDay(d)) {
      cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, dayStartH, 0, 0).getTime();
      continue;
    }
    if (ex.day_hours_only) {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayStartH, 0, 0).getTime();
      const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayEndH, 0, 0).getTime();
      const segStart = Math.max(cur, dayStart);
      const segEnd   = Math.min(nowMs, dayEnd);
      if (segEnd > segStart) elapsed += segEnd - segStart;
    } else {
      // Count the whole day (but not the weekend — already handled above)
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0).getTime();
      elapsed += Math.min(nowMs, dayEnd) - cur;
    }
    cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, ex.day_hours_only ? dayStartH : 0, 0, 0).getTime();
  }
  return Math.floor(elapsed / 3600000);
}

function toDayNumber(date) {
  const epoch    = new Date(state.exercise.epoch);
  const epochDay = startOfDay(epoch);
  const diffMs   = startOfDay(date) - epochDay;
  const diffDays = Math.round(diffMs / 86400000);
  return diffDays + 1; // Day 1 = epoch day
}

function synthDayHeader(date) {
  const dayNum = toDayNumber(date);
  const dayLabel = t('synth_day') || 'Day';
  return dayLabel + ' ' + dayNum;
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
      badge.style.cursor = 'pointer';
      badge.title = t('exercise_click_info') || 'Click for details';
      badge.onclick = function() { showExerciseInfoPopup(); };
    }
  } else {
    btn.style.display = 'none';
    if (badge) badge.style.display = 'none';
  }
}

// ── Timeline render ─────────────────────────────────────────────────────────
function renderTimeline() {
  const zf = state.zoomFactor || 1.0;
  document.documentElement.style.setProperty('--ev-zoom-scale', Math.max(0.7, Math.min(2.0, zf)).toFixed(3));

  const container = document.getElementById('timeline');
  const days       = getDays();
  const slots      = getSlotsPerDay();
  const slotH      = getSlotHeight();
  const baseTimeColW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--time-col-w')) || 52;
  const synthLabelActive = synthActive() && state.preferences.synth_label;
  const synthExtra = synthLabelActive ? 44 : 0;
  const timeColW   = baseTimeColW + synthExtra;
  const today      = new Date();

  container.style.gridTemplateColumns =
    `${timeColW}px ${days.map(() => 'minmax(var(--day-col-min),1fr)').join(' ')}`;

  let html = '';

  // ── Header row ─────────────────────────────────────────────────────────────
  const excludeWeekends = state.exercise && state.exercise.include_weekends === false;
  html += `<div class="tl-corner" style="height:44px;width:${timeColW}px"></div>`;
  days.forEach(day => {
    const isToday   = isSameDay(day, today);
    const isWeekend = isWeekendDay(day);
    const useSync   = synthActive();
    const dayName   = useSync ? synthDayHeader(day) : localDayName(day);
    const dayDate   = useSync
      ? `<small style="font-size:.75em;opacity:.65">${localShortDate(day)}</small>`
      : localShortDate(day);
    const weekendCls = (excludeWeekends && isWeekend) ? ' weekend-excluded' : (isWeekend ? ' weekend' : '');
    // Day-of-year number
    let doyHtml = '';
    if (state.preferences.show_day_of_year) {
      const start = new Date(day.getFullYear(), 0, 0);
      const diff = day - start;
      const oneDay = 86400000;
      const doy = Math.floor(diff / oneDay);
      doyHtml = `<span style="font-size:.85em;color:var(--text-dim);margin-left:4px;font-weight:600">[${doy}]</span>`;
    }
    // Week number
    let weekHtml = '';
    const weekStartDow = state.preferences?.week_start_day === 'sunday' ? 0 : 1;
    if (state.preferences.show_week_numbers && day.getDay() === weekStartDow) {
      const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
      const style = state.preferences.week_number_style;
      const label = style === 'year_week' ? (day.getFullYear() % 10) + '-W' + String(weekNo).padStart(2,'0') : 'W' + weekNo;
      weekHtml = `<div style="font-size:.55em;color:var(--accent);font-weight:700">${label}</div>`;
    }
    html += `<div class="tl-day-header${isToday?' today':''}${weekendCls}" data-date="${day.toISOString()}" data-center-day="${day.toISOString()}" title="Click to center this day" style="cursor:pointer">
      <div class="tl-day-name">${dayName}${doyHtml}</div>
      <div class="tl-day-date">${dayDate}${isToday?`<span class="today-marker">${t('today')||'Today'}</span>`:''}${weekHtml}</div>
    </div>`;
  });

  // ── Body rows ───────────────────────────────────────────────────────────────
  const synthEpoch = synthLabelActive ? new Date(state.exercise.epoch) : null;
  const synthDayHrsOnly = synthLabelActive && state.exercise.day_hours_only;
  const slotMinutes = getSlotMinutes();
  for (let s = 0; s < slots; s++) {
    const label  = slotLabel(s);
    const oohLbl = isOutOfHours(s) ? ' out-of-hours' : '';
    let synthSpan = '';
    if (synthLabelActive) {
      const slotMin = s * slotMinutes;
      const isHourBoundary = slotMin % 60 === 0;
      if (isHourBoundary && !(synthDayHrsOnly && isOutOfHours(s))) {
        const slotTime = new Date(days[0]);
        slotTime.setHours(0, slotMin, 0, 0);
        const hoursOn = synthElapsedHours(synthEpoch.getTime(), slotTime.getTime());
        if (hoursOn >= 0) {
          synthSpan = `<span class="synth-inline">H+${hoursOn}</span>`;
        }
      }
    }
    html += `<div class="tl-time-label${oohLbl}" style="height:${slotH}px;width:${timeColW}px">${synthSpan}<span>${label}</span></div>`;

    const startOffset = getStartHourOffset();
    days.forEach((day, di) => {
      const slotStartMin = startOffset + s * getSlotMinutes();
      const slotStart    = new Date(day);
      slotStart.setHours(0, slotStartMin, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + getSlotMinutes() * 60000);

      const locked = state.locks.some(l => {
        const ls = new Date(l.start_time), le = new Date(l.end_time);
        if (slotStart >= le || slotEnd <= ls) return false;
        const sc = l.scope || 'all';
        return sc === 'all' || sc === 'master';
      });
      const lockedLayer = !locked && state.locks.some(l => {
        const ls = new Date(l.start_time), le = new Date(l.end_time);
        if (slotStart >= le || slotEnd <= ls) return false;
        return (l.scope || 'all') === 'layer';
      });
      const isHalf = state.resolution === 'quarter' && (s % 2 === 1);
      const isCur  = isCurrentSlot(slotStart, slotEnd);

      const ooh = isOutOfHours(s);
      const isWeekend = isWeekendDay(day);
      const weekendExcludedCell = excludeWeekends && isWeekend;
      html += `<div class="tl-cell${locked?' locked':''}${lockedLayer?' locked-layer':''}${isHalf?' half-hour':''}${isCur?' tl-row-current':''}${ooh?' out-of-hours':''}${weekendExcludedCell?' weekend-excluded':isWeekend?' weekend':''}"
        style="height:${slotH}px"
        data-day="${di}" data-slot="${s}"
        data-start="${slotStart.toISOString()}"
        ${(locked || ooh || weekendExcludedCell) ? `title="${locked?'Locked: (master/all) — no events can be added or edited':weekendExcludedCell?'Weekend (excluded from synthetic time)':'Outside configured hours'}"` : `data-cell-click="1" data-cell-start="${slotStart.toISOString()}" data-cell-end="${slotEnd.toISOString()}" data-cell-ooh="${ooh?1:0}"`}
      ></div>`;
    });
  }

  container.innerHTML = html;

  // Attach day-header click listeners (CSP-safe)
  container.querySelectorAll('[data-center-day]').forEach(el => {
    el.addEventListener('click', () => centerDay(new Date(el.dataset.centerDay)));
  });
  // Attach cell click listeners (CSP-safe)
  container.querySelectorAll('[data-cell-click]').forEach(el => {
    el.addEventListener('click', e => onCellClick(e, el.dataset.cellStart, el.dataset.cellEnd, el.dataset.cellOoh === '1'));
  });

  renderEventBlocks(days, slotH);
  updateCurrentTimeLine(days, slotH);
}

// ── Event block rendering ───────────────────────────────────────────────────
function renderEventBlocks(days, slotH) {
  const container  = document.getElementById('timeline');
  const headerH    = 44;
  const slotMin    = getSlotMinutes();
  const slots      = getSlotsPerDay();
  const startOff   = 0;
  const endOff     = 1440;

  requestAnimationFrame(() => {
    const cells = container.querySelectorAll('.tl-cell');
    if (!cells.length) return;

    // Use actual DOM measurements for precise event positioning so any CSS
    // changes to the header height or slot height don't cause drift.
    const firstCell = cells[0];
    const realHeaderH = firstCell ? firstCell.offsetTop  : headerH;
    const realSlotH   = firstCell ? firstCell.offsetHeight : slotH;

    const dayMeta = days.map((_, di) => {
      const cell = cells[di];
      return cell ? { left: cell.offsetLeft, width: cell.offsetWidth } : null;
    });

    container.querySelectorAll('.event-block,.lock-overlay,.lock-label').forEach(el => el.remove());

    // ── Exercise Phase overlays ─────────────────────────────────────────────
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
          const topPx    = realHeaderH + (vsMin / slotMin) * realSlotH;
          const heightPx = Math.max(((veMin - vsMin) / slotMin) * realSlotH, 4);
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

    // ── Events ─────────────────────────────────────────────────────────────
    const searchTerm  = (state.search||'').trim().toLowerCase();
    const hl          = state.preferences.hidden_layers || [];
    const dayStartMin = (state.preferences.day_start_hour || 0) * 60;
    const dayEndMin   = (state.preferences.day_end_hour   || 24) * 60;

    const viewStart = days[0];
    const viewEnd   = addDays(days[days.length - 1], 1);
    const expandedEvents = [];
    state.events.forEach(ev => {
      if (!ev.is_recurring || !ev.recurrence_pattern) {
        expandedEvents.push(ev);
        return;
      }
      expandedEvents.push(ev);
      const evStart  = new Date(ev.start_time);
      const evEnd    = ev.end_time ? new Date(ev.end_time) : addHours(evStart, 1);
      const duration = evEnd - evStart;
      const recEnd   = ev.recurrence_end ? new Date(ev.recurrence_end) : viewEnd;
      const stepMs   = recurStepMs(ev.recurrence_pattern);
      if (!stepMs) return;
      const exclSet = new Set((ev.recurrence_excl || []).map(ts => new Date(ts).getTime()));
      let cur = new Date(evStart.getTime() + stepMs);
      let safety = 0;
      while (cur < viewEnd && cur <= recEnd && safety++ < 500) {
        const occEnd = new Date(cur.getTime() + duration);
        if (cur >= viewStart) {
          if (exclSet.has(cur.getTime())) { cur = new Date(cur.getTime() + stepMs); continue; }
          const occStartMin = cur.getHours()*60 + cur.getMinutes();
          const occEndMin   = occEnd.getHours()*60 + occEnd.getMinutes() || 1440;
          if (occEndMin <= dayStartMin || occStartMin >= dayEndMin) {
            cur = new Date(cur.getTime() + stepMs); continue;
          }
          expandedEvents.push({
            ...ev,
            id: ev.id + '_' + cur.getTime(),
            start_time: cur.toISOString(),
            end_time: occEnd.toISOString(),
            _recurring_instance: true,
          });
        }
        cur = new Date(cur.getTime() + stepMs);
      }
    });

    const visibleEvents = expandedEvents.filter(ev => {
      if (isTypeHidden(ev.event_type)) return false;
      if (ev.layer_id != null && hl.includes(ev.layer_id)) return false;
      if (searchTerm && !(
        ev.title.toLowerCase().includes(searchTerm) ||
        (ev.description||'').toLowerCase().includes(searchTerm) ||
        (ev.created_by_name||'').toLowerCase().includes(searchTerm)
      )) return false;
      // Apply filters
      const f = state.filters || {};
      if (f.status && f.status.length > 0 && !f.status.includes(ev.status)) return false;
      if (f.responsibleId != null && (ev.responsible_id || null) != f.responsibleId) return false;
      if (f.layerId !== null && f.layerId !== undefined) {
        if (f.layerId === 0 && ev.layer_id != null) return false;
        if (f.layerId !== 0 && ev.layer_id != f.layerId) return false;
      }
      return true;
    });

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

        const topPx    = realHeaderH + ((vsOff - startOff) / slotMin) * realSlotH;
        const heightPx = Math.max(((veOff - vsOff) / slotMin) * realSlotH - 2, 14);
        evsByDay[di].push({ ev, evStart, evEnd, vsOff, veOff, topPx, heightPx });
      });
    });

    days.forEach((day, di) => {
      if (!dayMeta[di]) return;
      const items = evsByDay[di];
      if (!items.length) return;

      items.sort((a, b) => a.vsOff - b.vsOff);

      const colEnd = [];
      const colOf  = [];
      items.forEach(item => {
        let col = colEnd.findIndex(e => e <= item.vsOff);
        if (col === -1) { col = colEnd.length; colEnd.push(0); }
        colEnd[col] = item.veOff;
        colOf.push(col);
      });

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
      const PAD = 6;
      const halfCell = Math.floor((cellWidth - PAD*2) / 2);

      items.forEach((item, idx) => {
        const col     = colOf[idx];
        const numCols = localCols[idx];
        const colW    = Math.floor((cellWidth - PAD*2) / numCols);
        const blockL  = cellLeft + PAD + col * colW;
        const isInstant = item.ev.event_type === 'instant';
        const blockW  = isInstant
          ? Math.min(colW - (col < numCols-1 ? 1 : 0), halfCell)
          : colW - (col < numCols-1 ? 1 : 0);

        const { ev, evStart, evEnd, topPx, heightPx } = item;

        let borderL = 'rgba(255,255,255,.3)';
        if (ev.layer_id) {
          const layer = state.layers.find(l => l.id === ev.layer_id);
          if (layer) borderL = layer.color || borderL;
        }

        const showIcons = state.preferences.show_event_icons !== false;
        const statusDot  = ev.status && ev.status !== 'planned'
          ? `<span class="ev-status-dot ev-status-${ev.status}" title="${ev.status}"></span>` : '';
        // recurring icon — LEFT of title
        const recurIcon  = showIcons && ev.is_recurring
          ? `<span class="ev-icon ev-left-icon" title="Recurring">↻</span>` : '';
        const createdAt  = ev.created_at ? new Date(ev.created_at) : null;
        const updatedAt  = ev.updated_at ? new Date(ev.updated_at) : null;
        const editedIcon = showIcons && (createdAt && updatedAt && (updatedAt - createdAt) > 10000)
          ? `<span class="ev-icon" title="Modified ${fmtDateTime(updatedAt)}">✎</span>` : '';
        const attachIcon = showIcons && ev.attachment_count > 0
          ? `<span class="ev-icon" title="${ev.attachment_count} attachment(s)">📎</span>` : '';
        const commentIcon = showIcons && ev.comment_count > 0
          ? `<span class="ev-icon" title="${ev.comment_count} comment(s)">💬</span>` : '';
        const allDayIcon = showIcons && ev.all_day
          ? `<span class="ev-icon" title="Day-only">📅</span>` : '';
        // instant icon — LEFT of title; suppressed if type icon already covers it
        const instantIcon = showIcons && isInstant && ev.event_type !== 'instant'
          ? `<span class="ev-icon ev-left-icon" title="Instant">⚡</span>` : '';

        // Event-type icon: custom icon from type def, or built-in defaults
        const evTypeDef = state.eventTypes ? state.eventTypes.find(x => x.key === ev.event_type) : null;
        const builtinTypeIcons = { mote:'🤝', decision:'⚖️', deadline:'⏰', standup:'🧍', reporting:'📊',
          instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌' };
        const typeIconChar = showIcons
          ? (evTypeDef && evTypeDef.icon ? evTypeDef.icon : (builtinTypeIcons[ev.event_type] || ''))
          : '';
        const typeIcon = typeIconChar
          ? `<span class="ev-icon ev-type-icon" title="${escHtml(ev.event_type)}">${typeIconChar}</span>` : '';

        const block = document.createElement('div');
        block.className = 'event-block';
        block.dataset.evId = ev.id;
        const evColor = ev.color || (evTypeDef ? evTypeDef.color : '#4A90D9');
        block.style.cssText = `top:${topPx}px;left:${blockL}px;width:${blockW}px;height:${heightPx}px;background:${evColor};border-left-color:${borderL};cursor:grab;`;
        if (ev.status === 'cancelled') block.style.opacity = '0.45';
        if (ev.status === 'rejected')  block.style.outline = '2px solid var(--red)';
        if (ev.status === 'verified')  block.style.outline = '2px solid var(--green)';
        block.innerHTML = `
          <div class="ev-title">${statusDot}${recurIcon}${instantIcon}${typeIcon}${escHtml(ev.title)}${editedIcon}${attachIcon}${commentIcon}${allDayIcon}</div>
          ${heightPx > 28 ? `<div class="ev-time">${fmtTime(evStart)}${ev.end_time?'–'+fmtTime(evEnd):''}</div>` : ''}
          ${heightPx > 44 ? `<div class="ev-creator">${escHtml(ev.created_by_name||'')}</div>` : ''}
          <div class="ev-resize-handle" data-ev-id="${ev.id}"></div>
        `;
        block.onclick = e => {
          if (e.target.classList.contains('ev-resize-handle')) return;
          e.stopPropagation();
          // Ctrl+click (or Meta+click on Mac) toggles event selection for multi-move
          if (e.ctrlKey || e.metaKey) {
            const realId = ev._recurring_instance
              ? parseInt(String(ev.id).split('_')[0], 10)
              : ev.id;
            if (typeof toggleEventSelection === 'function') toggleEventSelection(realId);
            return;
          }
          if (ev._recurring_instance) {
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

    // ── Lock overlays ─────────────────────────────────────────────────────
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
        const topPx    = realHeaderH + ((vsMin-startOff)/slotMin)*realSlotH;
        const heightPx = Math.max(((veMin-vsMin)/slotMin)*realSlotH, 14);
        const scopeColor  = (lk.scope||'all') === 'layer'
          ? 'rgba(74,144,217,.12),rgba(74,144,217,.12) 5px,rgba(74,144,217,.04) 5px,rgba(74,144,217,.04) 12px'
          : 'rgba(231,76,60,.12),rgba(231,76,60,.12) 5px,rgba(231,76,60,.04) 5px,rgba(231,76,60,.04) 12px';
        const scopeBorder = (lk.scope||'all') === 'layer' ? 'rgba(74,144,217,.5)' : 'rgba(231,76,60,.5)';
        const el = document.createElement('div');
        el.className = 'lock-overlay';
        el.style.cssText = `position:absolute;top:${topPx}px;left:${dayMeta[di].left}px;width:${dayMeta[di].width}px;height:${heightPx}px;background:repeating-linear-gradient(45deg,${scopeColor});border-left:2px solid ${scopeBorder};pointer-events:none;z-index:4;`;
        container.appendChild(el);
        const canUnlock = state.user && (state.user.role==='admin' || state.user.id===lk.locked_by || state.user.can_lock);
        if (canUnlock) {
          const scopeTag = {'all':'ALL','master':'MASTER','layer':'LAYER'}[lk.scope||'all']||'ALL';
          const btn = document.createElement('button');
          btn.className = 'lock-label btn btn-sm';
          btn.style.cssText = `position:absolute;top:${topPx+2}px;left:${dayMeta[di].left+2}px;z-index:5;font-size:10px;padding:2px 5px;pointer-events:auto;background:rgba(231,76,60,.8);color:#fff;border:none;border-radius:3px;`;
          btn.innerHTML = `🔓 [${scopeTag}] ${escHtml(lk.reason||'Locked')}`;
          btn.title = `Locked by ${escHtml(lk.locked_by_name||'?')} — click to unlock`;
          btn.onclick = () => deleteLock(lk.id);
          container.appendChild(btn);
        }
      });
    });
  });
}

// ── Current time line ───────────────────────────────────────────────────────
function getNow() {
  if (state.timelinePaused && state.pausedAt) return state.pausedAt;
  const ex = state.exercise;
  if (ex && ex.artificial_time_enabled && ex.artificial_time && ex.artificial_time_set_at) {
    const artTime = new Date(ex.artificial_time).getTime();
    const setAt   = new Date(ex.artificial_time_set_at).getTime();
    if (!isNaN(artTime) && !isNaN(setAt)) {
      const offset = artTime - setAt;
      return new Date(Date.now() + offset);
    }
  }
  return new Date();
}

function updateCurrentTimeLine(days, slotH) {
  try { _updateCurrentTimeLineInner(days, slotH); }
  catch (e) { console.warn('[updateCurrentTimeLine]', e); }
}
function _updateCurrentTimeLineInner(days, slotH) {
  const line = document.getElementById('current-time-line');
  if (!line) return;
  const p    = state.preferences;

  if (!p.red_line_enabled) { line.style.display='none'; return; }

  // Set CSS variables directly on the element — overrides the CSS-rule defaults
  // (setting them on :root is overridden by the element-level CSS rule specificity)
  line.style.setProperty('--line-color', p.red_line_color || '#E74C3C');
  line.style.setProperty('--line-width', (p.red_line_width || 2) + 'px');
  line.style.setProperty('--line-style', p.red_line_style || 'solid');

  const now    = getNow();
  const today  = days.find(d => isSameDay(d, now));
  if (!today) { line.style.display='none'; return; }
  const startOff = getStartHourOffset();
  const nowMin   = now.getHours()*60 + now.getMinutes();
  if (nowMin < startOff || nowMin > startOff + getSlotsPerDay()*getSlotMinutes()) {
    line.style.display='none'; return;
  }
  if (synthActive() && state.exercise.day_hours_only) {
    const dayStartMin = (p.day_start_hour || 0) * 60;
    const dayEndMin   = (p.day_end_hour   || 24) * 60;
    if (nowMin < dayStartMin || nowMin >= dayEndMin) {
      line.style.display = 'none'; return;
    }
  }
  const _firstCell = document.getElementById('timeline')?.querySelector('.tl-cell');
  const _headerH = _firstCell ? _firstCell.offsetTop : 44;
  const _slotH   = _firstCell ? _firstCell.offsetHeight : slotH;
  const topPx = _headerH + ((nowMin - startOff) / getSlotMinutes()) * _slotH;
  line.style.display = 'block';
  line.style.top = topPx+'px';

  // "▶ Now" label on the current-time line (calendar/timeline mode, like list view)
  let nowLabel = line.querySelector('.ctl-now-label');
  if (!nowLabel) {
    nowLabel = document.createElement('span');
    nowLabel.className = 'ctl-now-label';
    line.appendChild(nowLabel);
  }
  nowLabel.textContent = '▶ ' + (t('cal_now') || 'Now');

  // Synthetic H+N label
  let existingLabel = document.getElementById('synthTimeLabel');
  if (p.synth_label && synthActive()) {
    const epochMs = new Date(state.exercise.epoch).getTime();
    const nowMs   = now.getTime();
    const hoursOn = synthElapsedHours(epochMs, nowMs);
    const label   = hoursOn >= 0 ? `H+${hoursOn}` : `H${hoursOn}`;
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

// ── Scroll helpers ──────────────────────────────────────────────────────────
function zoomToNow() {
  const now  = new Date();
  const days = getDays();
  if (!days.some(d => isSameDay(d, now))) {
    state.startDate = startOfDay(now);
    refreshAll().then(() => scrollToNow());
  } else {
    scrollToNow();
  }
}
function scrollToNow() {
  const slotH    = getSlotHeight();
  const fc       = document.getElementById('timeline')?.querySelector('.tl-cell');
  const headerH  = fc ? fc.offsetTop : 44;
  const now      = getNow();
  const nowMin   = now.getHours()*60 + now.getMinutes();
  const topPx    = headerH + (nowMin / getSlotMinutes()) * slotH;
  const tc       = document.getElementById('timeline-container');
  tc.scrollTop   = Math.max(0, topPx - tc.clientHeight/2);
}
function scrollToDayStart() {
  const slotH   = getSlotHeight();
  const fc      = document.getElementById('timeline')?.querySelector('.tl-cell');
  const headerH = fc ? fc.offsetTop : 44;
  const startH  = (state.preferences.day_start_hour || 0) * 60;
  const topPx   = headerH + (startH / getSlotMinutes()) * slotH;
  const tc      = document.getElementById('timeline-container');
  tc.scrollTop  = Math.max(0, topPx);
}

// ── Layer quick-toggle popover ──────────────────────────────────────────────
function renderLayerPopover() {
  const list        = document.getElementById('layerPopoverList');
  const hiddenCount = (state.preferences.hidden_layers || []).length;
  const allVisible  = hiddenCount === 0;
  list.innerHTML = `
    <div class="layer-pop-hint" style="font-size:10px;opacity:0.6;padding:4px 8px 2px">${t('layers_multi_hint')||'Click to show/hide layers.'}</div>
    <div class="layer-pop-item${allVisible?' active':''}" data-toggle-all-layers>
      <input type="checkbox" class="layer-pop-cb" ${allVisible?'checked':''} data-stop-prop>
      <div class="layer-pop-swatch" style="background:var(--accent)"></div>
      <span>${t('layers_master')||'All layers'}</span>
    </div>
    ${state.layers.map(l => {
      const visible = isLayerActive(l.id);
      return `<div class="layer-pop-item${visible?' active':''}" data-toggle-layer="${l.id}">
        <input type="checkbox" class="layer-pop-cb" ${visible?'checked':''} data-stop-prop>
        <div class="layer-pop-swatch" style="background:${l.color||'#4A90D9'}"></div>
        <span>${escHtml(l.name)}</span>
      </div>`;
    }).join('')}
    ${hiddenCount > 0 ? `<div class="layer-pop-hint" style="font-size:10px;opacity:0.5;padding:2px 8px 4px;text-align:right">${hiddenCount} layer${hiddenCount>1?'s':''} hidden</div>` : ''}
    ${state.user && hasRole2(state.user.role, 'readwrite') ? `<div style="border-top:1px solid var(--border);padding:6px 8px 4px;margin-top:2px">
      <button class="btn btn-primary btn-sm" style="width:100%" data-add-layer>+ ${t('layers_add')||'Create Layer'}</button>
    </div>` : ''}
  `;

  // Attach layer popover listeners (CSP-safe)
  list.querySelectorAll('[data-stop-prop]').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
  });
  const allBtn = list.querySelector('[data-toggle-all-layers]');
  if (allBtn) allBtn.addEventListener('click', () => toggleAllLayers());
  list.querySelectorAll('[data-toggle-layer]').forEach(el => {
    el.addEventListener('click', () => toggleLayer(parseInt(el.dataset.toggleLayer, 10)));
  });
  const addBtn = list.querySelector('[data-add-layer]');
  if (addBtn) addBtn.addEventListener('click', () => {
    document.getElementById('layerPopover').style.display = 'none';
    openLayerModal(null);
  });
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

// ── Drag-to-zoom on time column ─────────────────────────────────────────────
let _zoomDragSetup = false;
function setupZoomDrag() {
  if (_zoomDragSetup) return;
  _zoomDragSetup = true;
  const container = document.getElementById('timeline-container');
  let dragging = false, startY = 0, startZoom = 1.0;
  let _zoomRafPending = false;

  container.addEventListener('mousedown', e => {
    if (!e.target.closest('.tl-time-label, .tl-corner')) return;
    dragging  = true;
    startY    = e.clientY;
    startZoom = state.zoomFactor;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newZoom = Math.max(0.2, Math.min(6.0, startZoom + (startY - e.clientY) / 150));
    if (Math.abs(newZoom - state.zoomFactor) > 0.01) {
      state.zoomFactor = newZoom;
      if (!_zoomRafPending) {
        _zoomRafPending = true;
        requestAnimationFrame(() => { _zoomRafPending = false; renderTimeline(); });
      }
    }
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  container.addEventListener('dblclick', e => {
    if (!e.target.closest('.tl-time-label, .tl-corner')) return;
    state.zoomFactor = 1.0;
    renderTimeline();
  });
}

// ── Drag-to-reschedule ──────────────────────────────────────────────────────
let _dragRescheduleSetup = false;
function setupDragToReschedule() {
  if (_dragRescheduleSetup) return;
  _dragRescheduleSetup = true;
  const container = document.getElementById('timeline-container');
  let dragging = false, ghost = null, dragEvId = null, dragOrigEl = null, ghostHalfW = 0;

  container.addEventListener('mousedown', e => {
    const block = e.target.closest('.event-block[data-ev-id]');
    if (!block) return;
    dragging    = true;
    dragEvId    = parseInt(block.dataset.evId, 10);
    dragOrigEl  = block;
    ghostHalfW  = block.offsetWidth / 2;
    ghost = block.cloneNode(true);
    ghost.style.cssText = `
      position: fixed; pointer-events: none; z-index: 999; opacity: 0.75;
      width: ${block.offsetWidth}px; box-shadow: 0 4px 20px rgba(0,0,0,.5);
      left: ${e.clientX - ghostHalfW}px;
      top:  ${e.clientY - 12}px;
    `;
    ghost.classList.add('dragging');
    document.body.appendChild(ghost);
    block.style.opacity = '0.35';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging || !ghost) return;
    ghost.style.left = (e.clientX - ghostHalfW) + 'px';
    ghost.style.top  = (e.clientY - 12) + 'px';
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

    const els  = document.elementsFromPoint(e.clientX, e.clientY);
    const cell = els.find(el => el.classList.contains('tl-cell'));
    if (!cell || !dragEvId) { dragEvId = null; dragOrigEl = null; return; }

    const dayIdx  = parseInt(cell.dataset.day,  10);
    const slotIdx = parseInt(cell.dataset.slot, 10);
    if (isNaN(dayIdx) || isNaN(slotIdx)) { dragEvId = null; dragOrigEl = null; return; }

    const ev = state.events.find(ev => ev.id === dragEvId);
    if (!ev) { dragEvId = null; dragOrigEl = null; return; }

    const days      = getDays();
    const targetDay = days[dayIdx];
    if (!targetDay) { dragEvId = null; dragOrigEl = null; return; }

    const slotMin  = getSlotMinutes();
    const startOff = getStartHourOffset();
    const newMin   = startOff + slotIdx * slotMin;
    const newStart = new Date(targetDay);
    newStart.setHours(Math.floor(newMin / 60), newMin % 60, 0, 0);

    if (isEventLocked(ev)) {
      showError('This event is in a locked time slot and cannot be moved.');
      dragEvId = null; dragOrigEl = null; return;
    }

    // Confirm drag-move if user preference is set
    if (state.preferences?.confirm_drag_move) {
      if (!confirm(t('confirm_drag_move_prompt') || 'Move this event to the new time?')) {
        dragEvId = null; dragOrigEl = null; return;
      }
    }

    // Check if this event is part of a multi-selection
    const selIds = state.selectedEventIds || [];
    const isMultiMove = selIds.length > 1 && selIds.includes(dragEvId);

    if (isMultiMove) {
      // Move all selected events by the same time offset
      const oldStart = new Date(ev.start_time);
      const offset = newStart.getTime() - oldStart.getTime();
      const selectedEvs = state.events.filter(e => selIds.includes(e.id));
      const movePromises = selectedEvs.map(async selEv => {
        const sOldStart = new Date(selEv.start_time);
        const sNewStart = new Date(sOldStart.getTime() + offset);
        const payload = { ...selEv, start_time: sNewStart.toISOString() };
        if (selEv.end_time) {
          const dur = new Date(selEv.end_time) - sOldStart;
          payload.end_time = new Date(sNewStart.getTime() + dur).toISOString();
        }
        delete payload.id; delete payload.created_at; delete payload.updated_at;
        delete payload.created_by_name; delete payload.verified_by_name;
        if (typeof pushUndo === 'function') pushUndo('update_event', { id: selEv.id, old: { ...selEv } });
        return apiPut('/api/events/' + selEv.id, payload);
      });
      try {
        await Promise.all(movePromises);
        await refreshAll();
        showNotification('success', t('notif_event_updated'));
      } catch { showError('Failed to move some events'); }
      dragEvId = null; dragOrigEl = null; return;
    }

    const oldStart = new Date(ev.start_time);
    const oldEnd   = ev.end_time ? new Date(ev.end_time) : null;
    const payload  = { ...ev, start_time: newStart.toISOString() };
    if (oldEnd) {
      const dur = oldEnd - oldStart;
      payload.end_time = new Date(newStart.getTime() + dur).toISOString();
    }
    const testEv = { ...ev, start_time: newStart.toISOString(), end_time: payload.end_time };
    if (isEventLocked(testEv)) {
      showError('The target time slot is locked. Cannot move event there.');
      dragEvId = null; dragOrigEl = null; return;
    }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    delete payload.created_by_name; delete payload.verified_by_name;

    // Push undo entry
    if (typeof pushUndo === 'function') pushUndo('update_event', { id: dragEvId, old: { ...ev } });

    const res = await apiPut('/api/events/'+dragEvId, payload);
    if (res.ok) {
      const updated = await res.json();
      // Check for conflicts at new position
      if (typeof checkConflicts === 'function') {
        const conflicts = checkConflicts(updated);
        if (conflicts.length) showConflictWarning(conflicts);
      }
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

// ── Horizontal drag-to-pan ──────────────────────────────────────────────────
let _horizDragSetup = false;
function setupHorizontalDrag() {
  if (_horizDragSetup) return;
  _horizDragSetup = true;
  const container = document.getElementById('timeline-container');
  let dragging = false, startX = 0, startScrollLeft = 0;

  container.addEventListener('mousedown', e => {
    if (e.target.closest('.event-block,.tl-time-label,.tl-corner,.lock-overlay')) return;
    dragging = true;
    startX = e.clientX;
    startScrollLeft = container.scrollLeft;
    container.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    container.scrollLeft = startScrollLeft - (e.clientX - startX);
  });

  document.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    container.style.cursor = '';
    const dx = startX - e.clientX;
    if (Math.abs(dx) > container.clientWidth * 0.4) {
      navigate(dx > 0 ? 1 : -1);
    }
  });
}

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
let _keyboardSetup = false;
function setupKeyboardShortcuts() {
  if (_keyboardSetup) return;
  _keyboardSetup = true;
  document.addEventListener('keydown', e => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

    switch (e.key) {
      case 'ArrowLeft':  if (!e.shiftKey) navigate(-1); break;
      case 'ArrowRight': if (!e.shiftKey) navigate(1);  break;
      case 't': goToday(); break;
      case 'n': zoomToNow(); break;
      case 'e': if (state.user && hasRole2(state.user.role, 'readwrite')) openEventModal(null); break;
      case '?': openModal('helpModal'); break;
      case 'Escape': {
        const openModals = [...document.querySelectorAll('.modal-overlay.open')];
        if (openModals.length) closeModal(openModals[openModals.length-1].id);
        break;
      }
      case 'z':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); performUndo(); }
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

// ── Event resize by dragging ──────────────────────────────────────────────
let _eventResizeSetup = false;
function setupEventResize() {
  if (_eventResizeSetup) return;
  _eventResizeSetup = true;
  const container = document.getElementById('timeline-container');
  let resizing = false, resizeEvId = null, startY = 0, origHeight = 0, resizeBlock = null;

  container.addEventListener('mousedown', e => {
    const handle = e.target.closest('.ev-resize-handle[data-ev-id]');
    if (!handle) return;
    resizing = true;
    resizeEvId = parseInt(handle.dataset.evId, 10);
    resizeBlock = handle.closest('.event-block');
    startY = e.clientY;
    origHeight = resizeBlock.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', e => {
    if (!resizing || !resizeBlock) return;
    const dy = e.clientY - startY;
    const newHeight = Math.max(14, origHeight + dy);
    resizeBlock.style.height = newHeight + 'px';
  });

  document.addEventListener('mouseup', async e => {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (!resizeBlock || !resizeEvId) { resizeBlock = null; resizeEvId = null; return; }

    const newHeight = resizeBlock.offsetHeight;
    const slotH = getSlotHeight();
    const slotMin = getSlotMinutes();
    const durationMin = Math.round((newHeight / slotH) * slotMin);

    const ev = state.events.find(x => x.id === resizeEvId);
    if (!ev) { resizeBlock = null; resizeEvId = null; return; }

    const evStart = new Date(ev.start_time);
    const newEnd = new Date(evStart.getTime() + durationMin * 60000);

    // Save old state for undo
    if (typeof pushUndo === 'function') pushUndo('update_event', { id: ev.id, old: { ...ev } });

    const payload = { ...ev, end_time: newEnd.toISOString() };
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    delete payload.created_by_name; delete payload.verified_by_name;

    const res = await apiPut('/api/events/' + resizeEvId, payload);
    if (res.ok) {
      const updated = await res.json();
      if (typeof checkConflicts === 'function') {
        const conflicts = checkConflicts(updated);
        if (conflicts.length) showConflictWarning(conflicts);
      }
      await refreshAll();
    } else {
      const err = await res.json();
      showError(err.error || 'Could not resize');
    }
    resizeBlock = null;
    resizeEvId = null;
  });
}
