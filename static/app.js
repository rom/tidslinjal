/* ============================================================
   Tidslinjal – Collaborative Operational Timeline
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  user: null,
  events: [],
  locks: [],
  alarms: [],
  eventTypes: [],
  resolution: 'hour',      // quarter | hour | day
  range: 'week',            // day | week | month | 2months | 3months
  startDate: startOfDay(new Date()),
  sidebarTab: 'legend',
};

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('unauth'); }
  return res;
}

async function apiGet(path)         { return (await api('GET', path)).json(); }
async function apiPost(path, body)  { return api('POST', path, body); }
async function apiPut(path, body)   { return api('PUT', path, body); }
async function apiDel(path)         { return api('DELETE', path); }

// ── Date utilities ─────────────────────────────────────────────────────────
function startOfDay(d) {
  const r = new Date(d); r.setHours(0,0,0,0); return r;
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function addMonths(d, n) {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r;
}
function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
}
function fmtDayName(d) {
  return d.toLocaleDateString('en-GB', { weekday:'short' });
}
function fmtDateInput(d) {
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseLocalDatetime(s) {
  if (!s) return null;
  return new Date(s);
}
function fmtTime(d) {
  return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12: false });
}
function fmtDateTime(d) {
  return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
}
function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

// ── Range helpers ──────────────────────────────────────────────────────────
function getRangeDays() {
  const s = state.startDate;
  switch (state.range) {
    case 'day':     return 1;
    case 'week':    return 7;
    case 'month':   return daysInMonthFromDate(s);
    case '2months': return daysInMonthFromDate(s) + daysInMonthFromDate(addMonths(s,1));
    case '3months': return daysInMonthFromDate(s) + daysInMonthFromDate(addMonths(s,1)) + daysInMonthFromDate(addMonths(s,2));
    default:        return 7;
  }
}

function daysInMonthFromDate(d) {
  return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
}

function getDays() {
  const days = [];
  const n = getRangeDays();
  for (let i = 0; i < n; i++) days.push(addDays(state.startDate, i));
  return days;
}

function getViewEnd() {
  return addDays(state.startDate, getRangeDays());
}

// ── Slot helpers ───────────────────────────────────────────────────────────
function getSlotsPerDay() {
  switch (state.resolution) {
    case 'quarter': return 96;
    case 'hour':    return 24;
    case 'day':     return 1;
  }
}
function getSlotMinutes() {
  switch (state.resolution) {
    case 'quarter': return 15;
    case 'hour':    return 60;
    case 'day':     return 1440;
  }
}
function getSlotHeight() {
  switch (state.resolution) {
    case 'quarter': return 18;
    case 'hour':    return 40;
    case 'day':     return 80;
  }
}
function slotLabel(slotIdx) {
  if (state.resolution === 'day') return '';
  const minutes = slotIdx * getSlotMinutes();
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (state.resolution === 'hour') return `${String(h).padStart(2,'0')}:00`;
  return m === 0 ? `${String(h).padStart(2,'0')}:00` : '';
}

// ── Timeline render ────────────────────────────────────────────────────────
function renderTimeline() {
  const container = document.getElementById('timeline');
  const days = getDays();
  const slots = getSlotsPerDay();
  const slotH = getSlotHeight();

  // Grid: col 1 = time label, then one col per day
  const cols = [52, ...days.map(() => 1)];
  container.style.gridTemplateColumns = `${cols[0]}px ${cols.slice(1).map(() => 'minmax(120px,1fr)').join(' ')}`;

  const today = new Date();
  let html = '';

  // ── Header row ──────────────────────────────────────────────────────────
  html += `<div class="tl-corner" style="height:44px"></div>`;
  days.forEach(day => {
    const isToday = isSameDay(day, today);
    html += `<div class="tl-day-header${isToday?' today':''}" data-date="${day.toISOString()}">
      <div class="tl-day-name">${fmtDayName(day)}</div>
      <div class="tl-day-date">${fmtDate(day)}${isToday?'<span class="today-marker"></span>':''}</div>
    </div>`;
  });

  // ── Body rows ────────────────────────────────────────────────────────────
  for (let s = 0; s < slots; s++) {
    const label = slotLabel(s);
    const showLabel = label !== '';

    html += `<div class="tl-time-label" style="height:${slotH}px">${showLabel ? label : ''}</div>`;

    days.forEach((day, di) => {
      const slotStart = new Date(day);
      const minOffset = s * getSlotMinutes();
      slotStart.setMinutes(slotStart.getMinutes() + minOffset);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + getSlotMinutes());

      const locked = state.locks.some(l => {
        const ls = new Date(l.start_time), le = new Date(l.end_time);
        return slotStart < le && slotEnd > ls;
      });

      const isHalf = state.resolution === 'quarter' && (s % 4 === 2);
      const isCurrentRow = isCurrentSlot(slotStart, slotEnd);

      html += `<div class="tl-cell${locked?' locked':''}${isHalf?' half-hour':''}${isCurrentRow?' tl-row-current':''}"
        style="height:${slotH}px"
        data-day="${di}" data-slot="${s}"
        data-start="${slotStart.toISOString()}"
        ${locked ? `title="Locked slot"` : `onclick="onCellClick(event, '${slotStart.toISOString()}', '${slotEnd.toISOString()}')"` }
      ></div>`;
    });
  }

  container.innerHTML = html;

  // ── Overlay event blocks ─────────────────────────────────────────────────
  renderEventBlocks(days, slotH);

  // ── Current time line ────────────────────────────────────────────────────
  updateCurrentTimeLine(days, slotH);
}

function isCurrentSlot(slotStart, slotEnd) {
  const now = new Date();
  return now >= slotStart && now < slotEnd;
}

// ── Event block rendering ──────────────────────────────────────────────────
function renderEventBlocks(days, slotH) {
  const container = document.getElementById('timeline');
  const headerH = 44;
  const slotMin = getSlotMinutes();
  const slots = getSlotsPerDay();
  const colCount = days.length;

  // Get column positions by reading grid cells
  // We rely on the grid layout; use getBoundingClientRect after render
  requestAnimationFrame(() => {
    const cells = container.querySelectorAll('.tl-cell');
    if (!cells.length) return;

    // Map day index to x position
    const dayMeta = [];
    for (let di = 0; di < colCount; di++) {
      const cell = cells[di * slots]; // first slot of day di
      if (!cell) continue;
      const rect = cell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      dayMeta[di] = {
        left: cell.offsetLeft,
        width: cell.offsetWidth,
      };
    }

    // Remove existing event blocks
    container.querySelectorAll('.event-block').forEach(el => el.remove());

    // For each visible event, draw block(s)
    state.events.forEach(ev => {
      const evStart = new Date(ev.start_time);
      const evEnd = ev.end_time ? new Date(ev.end_time) : new Date(evStart.getTime() + 60*60*1000);

      days.forEach((day, di) => {
        if (!dayMeta[di]) return;

        const dayStart = new Date(day);
        const dayEnd = addDays(day, 1);

        // Does event intersect this day?
        if (evEnd <= dayStart || evStart >= dayEnd) return;

        const visStart = evStart < dayStart ? dayStart : evStart;
        const visEnd   = evEnd   > dayEnd   ? dayEnd   : evEnd;

        // Convert times to slot offsets
        const startMinFromMidnight = visStart.getHours() * 60 + visStart.getMinutes();
        const endMinFromMidnight   = visEnd.getHours()   * 60 + visEnd.getMinutes();
        const endMinClamped = visEnd >= dayEnd ? slots * slotMin : endMinFromMidnight;

        const topPx    = headerH + (startMinFromMidnight / slotMin) * slotH;
        const heightPx = Math.max(((endMinClamped - startMinFromMidnight) / slotMin) * slotH - 2, 14);

        const block = document.createElement('div');
        block.className = 'event-block';
        block.style.cssText = `
          top: ${topPx}px;
          left: ${dayMeta[di].left + 2}px;
          width: ${dayMeta[di].width - 4}px;
          height: ${heightPx}px;
          background: ${ev.color || '#4A90D9'};
        `;
        block.innerHTML = `
          <div class="ev-title">${escHtml(ev.title)}</div>
          ${heightPx > 28 ? `<div class="ev-time">${fmtTime(evStart)}${ev.end_time ? '–'+fmtTime(evEnd) : ''}</div>` : ''}
          ${heightPx > 42 ? `<div class="ev-creator">${escHtml(ev.created_by_name||'')}</div>` : ''}
        `;
        block.onclick = (e) => { e.stopPropagation(); showEventDetail(ev); };
        container.appendChild(block);
      });
    });

    // ── Lock overlays ──────────────────────────────────────────────────────
    container.querySelectorAll('.lock-overlay').forEach(el => el.remove());

    state.locks.forEach(lk => {
      const lkStart = new Date(lk.start_time);
      const lkEnd   = new Date(lk.end_time);

      days.forEach((day, di) => {
        if (!dayMeta[di]) return;

        const dayStart = new Date(day);
        const dayEnd   = addDays(day, 1);
        if (lkEnd <= dayStart || lkStart >= dayEnd) return;

        const visStart = lkStart < dayStart ? dayStart : lkStart;
        const visEnd   = lkEnd   > dayEnd   ? dayEnd   : lkEnd;

        const startMin = visStart.getHours() * 60 + visStart.getMinutes();
        const endMin   = Math.min(visEnd.getHours() * 60 + visEnd.getMinutes(), slots * getSlotMinutes());

        const topPx    = headerH + (startMin / getSlotMinutes()) * slotH;
        const heightPx = Math.max(((endMin - startMin) / getSlotMinutes()) * slotH, 14);

        const el = document.createElement('div');
        el.className = 'lock-overlay';
        el.style.cssText = `
          position: absolute;
          top: ${topPx}px;
          left: ${dayMeta[di].left}px;
          width: ${dayMeta[di].width}px;
          height: ${heightPx}px;
          background: repeating-linear-gradient(45deg,rgba(231,76,60,.12),rgba(231,76,60,.12) 5px,rgba(231,76,60,.04) 5px,rgba(231,76,60,.04) 12px);
          border-left: 2px solid rgba(231,76,60,.5);
          pointer-events: none;
          z-index: 4;
        `;
        el.title = `Locked: ${lk.reason || ''} (by ${lk.locked_by_name || ''})`;
        container.appendChild(el);

        // Delete button for lock managers
        if (state.user && (state.user.role === 'admin' || state.user.can_lock)) {
          const btn = document.createElement('button');
          btn.className = 'btn btn-danger btn-sm';
          btn.style.cssText = `position:absolute;top:${topPx+2}px;left:${dayMeta[di].left+2}px;z-index:5;font-size:10px;padding:2px 5px;pointer-events:auto;`;
          btn.textContent = '🔓 ' + (lk.reason || 'Locked');
          btn.onclick = () => deleteLock(lk.id);
          container.appendChild(btn);
        }
      });
    });
  });
}

// ── Current time line ──────────────────────────────────────────────────────
function updateCurrentTimeLine(days, slotH) {
  const line = document.getElementById('current-time-line');
  const now = new Date();
  const today = days.find(d => isSameDay(d, now));
  if (!today) { line.style.display = 'none'; return; }

  const slotMin = getSlotMinutes();
  const slots   = getSlotsPerDay();
  const minSinceMidnight = now.getHours() * 60 + now.getMinutes();
  const topPx   = 44 + (minSinceMidnight / slotMin) * slotH;

  line.style.display = 'block';
  line.style.top = topPx + 'px';
  line.style.left = '0';
  line.style.right = '0';
}

// ── Clock ──────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('clockTime').textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  document.getElementById('clockDate').textContent =
    now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ── Fetch data ─────────────────────────────────────────────────────────────
async function fetchEvents() {
  const from = state.startDate.toISOString();
  const to   = getViewEnd().toISOString();
  state.events = await apiGet(`/api/events?from=${from}&to=${to}`) || [];
}

async function fetchLocks() {
  state.locks = await apiGet('/api/locks') || [];
}

async function fetchAlarms() {
  state.alarms = await apiGet('/api/alarms') || [];
}

async function refreshAll() {
  await Promise.all([fetchEvents(), fetchLocks(), fetchAlarms()]);
  renderTimeline();
  renderSidebar();
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(dir) {
  const days = getRangeDays();
  state.startDate = addDays(state.startDate, dir * days);
  refreshAll();
}

function goToday() {
  state.startDate = startOfDay(new Date());
  refreshAll();
}

// ── Cell click → open new event ────────────────────────────────────────────
function onCellClick(e, startISO, endISO) {
  if (!state.user) return;
  if (state.user.role === 'read') return;
  const start = new Date(startISO);
  openEventModal(null, start, new Date(endISO));
}

// ── Event modal ────────────────────────────────────────────────────────────
function openEventModal(ev, defaultStart, defaultEnd) {
  const isEdit = !!ev;
  document.getElementById('eventModalTitle').textContent = isEdit ? 'Edit Event' : 'Add Event';
  document.getElementById('eventId').value = ev ? ev.id : '';
  document.getElementById('eventTitle').value = ev ? ev.title : '';
  document.getElementById('eventDescription').value = ev ? (ev.description || '') : '';
  document.getElementById('eventColor').value = ev ? (ev.color || '#4A90D9') : '#4A90D9';

  // Populate event type select
  const typeSelect = document.getElementById('eventType');
  typeSelect.innerHTML = state.eventTypes.map(t =>
    `<option value="${t.type}" ${ev && ev.event_type===t.type?'selected':''}>${t.label}</option>`
  ).join('');
  // Set color when type changes
  typeSelect.onchange = () => {
    const found = state.eventTypes.find(t => t.type === typeSelect.value);
    if (found) document.getElementById('eventColor').value = found.color;
  };

  const start = defaultStart || (ev ? new Date(ev.start_time) : new Date());
  const end   = defaultEnd   || (ev && ev.end_time ? new Date(ev.end_time) : addHours(start, 1));
  document.getElementById('eventStart').value = fmtDateInput(start);
  document.getElementById('eventEnd').value   = fmtDateInput(end);

  const recurring = ev && ev.is_recurring;
  document.getElementById('eventRecurring').checked = recurring;
  document.getElementById('recurrenceGroup').style.display = recurring ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = recurring ? '' : 'none';
  if (ev) {
    document.getElementById('eventRecurrencePattern').value = ev.recurrence_pattern || 'weekly';
    if (ev.recurrence_end) document.getElementById('eventRecurrenceEnd').value = fmtDateInput(new Date(ev.recurrence_end));
  }

  const creatorEl = document.getElementById('eventCreator');
  if (isEdit) {
    creatorEl.style.display = '';
    creatorEl.textContent = `Created by ${ev.created_by_name} on ${fmtDateTime(new Date(ev.created_at))}`;
  } else {
    creatorEl.style.display = 'none';
  }

  const delBtn = document.getElementById('btnDeleteEvent');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteEvent(ev.id) : null;

  openModal('eventModal');
}

function addHours(d, h) {
  const r = new Date(d); r.setHours(r.getHours() + h); return r;
}

document.getElementById('eventRecurring').addEventListener('change', function() {
  document.getElementById('recurrenceGroup').style.display = this.checked ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = this.checked ? '' : 'none';
});

document.getElementById('btnSaveEvent').addEventListener('click', async () => {
  const id = document.getElementById('eventId').value;
  const title = document.getElementById('eventTitle').value.trim();
  if (!title) { alert('Title is required'); return; }

  const startVal = document.getElementById('eventStart').value;
  const endVal   = document.getElementById('eventEnd').value;
  if (!startVal) { alert('Start time is required'); return; }

  const recurring = document.getElementById('eventRecurring').checked;
  const payload = {
    title,
    description:        document.getElementById('eventDescription').value,
    event_type:         document.getElementById('eventType').value,
    color:              document.getElementById('eventColor').value,
    start_time:         new Date(startVal).toISOString(),
    end_time:           endVal ? new Date(endVal).toISOString() : null,
    is_recurring:       recurring,
    recurrence_pattern: recurring ? document.getElementById('eventRecurrencePattern').value : '',
    recurrence_end:     recurring && document.getElementById('eventRecurrenceEnd').value
                          ? new Date(document.getElementById('eventRecurrenceEnd').value).toISOString()
                          : null,
  };

  const res = id
    ? await apiPut(`/api/events/${id}`, payload)
    : await apiPost('/api/events', payload);

  if (res.ok) {
    closeModal('eventModal');
    await refreshAll();
    showNotification('success', id ? 'Event updated' : 'Event created');
  } else {
    const err = await res.json();
    alert('Error: ' + err.error);
  }
});

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  const res = await apiDel(`/api/events/${id}`);
  if (res.ok) {
    closeModal('eventModal');
    closeModal('detailModal');
    await refreshAll();
    showNotification('success', 'Event deleted');
  } else {
    alert('Failed to delete event');
  }
}

// ── Event detail modal ─────────────────────────────────────────────────────
function showEventDetail(ev) {
  document.getElementById('detailTitle').textContent = ev.title;
  const body = document.getElementById('detailBody');
  const evStart = new Date(ev.start_time);
  const evEnd   = ev.end_time ? new Date(ev.end_time) : null;

  const typeInfo = state.eventTypes.find(t => t.type === ev.event_type);
  body.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">
      <span style="width:12px;height:12px;border-radius:3px;background:${ev.color};flex-shrink:0;margin-top:2px"></span>
      <div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${typeInfo ? typeInfo.label : ev.event_type}</div>
        ${ev.description ? `<div style="color:var(--text);margin-bottom:8px">${escHtml(ev.description)}</div>` : ''}
        <div style="font-size:12px;color:var(--text-dim)">
          <strong>Start:</strong> ${fmtDateTime(evStart)}<br>
          ${evEnd ? `<strong>End:</strong> ${fmtDateTime(evEnd)}<br>` : ''}
          ${ev.is_recurring ? `<strong>Repeats:</strong> ${ev.recurrence_pattern}<br>` : ''}
          <strong>Created by:</strong> ${escHtml(ev.created_by_name)}<br>
          <strong>Created:</strong> ${fmtDateTime(new Date(ev.created_at))}
        </div>
      </div>
    </div>
  `;

  const footer = document.getElementById('detailFooter');
  const canEdit = state.user && (state.user.role === 'admin' || state.user.role === 'readwrite' || state.user.id === ev.created_by);
  footer.innerHTML = '';

  // Alarm button
  const alarmBtn = document.createElement('button');
  alarmBtn.className = 'btn btn-secondary btn-sm';
  alarmBtn.textContent = '🔔 Set Alarm';
  alarmBtn.onclick = () => { closeModal('detailModal'); openAlarmModal(ev); };
  footer.appendChild(alarmBtn);

  if (canEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary btn-sm';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => { closeModal('detailModal'); openEventModal(ev); };
    footer.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => deleteEvent(ev.id);
    footer.appendChild(delBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-secondary';
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute('data-close', 'detailModal');
  closeBtn.onclick = () => closeModal('detailModal');
  footer.appendChild(closeBtn);

  openModal('detailModal');
}

// ── Alarm modal ────────────────────────────────────────────────────────────
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
  const res = await apiPost('/api/alarms', { event_id: eventId, lead_time: leadTime });
  if (res.ok) {
    closeModal('alarmModal');
    await fetchAlarms();
    renderSidebar();
    showNotification('success', 'Alarm set');
  } else {
    const err = await res.json();
    alert('Error: ' + err.error);
  }
});

async function deleteAlarm(id) {
  const res = await apiDel(`/api/alarms/${id}`);
  if (res.ok) {
    await fetchAlarms();
    renderSidebar();
    showNotification('success', 'Alarm removed');
  }
}

// ── Lock modal ─────────────────────────────────────────────────────────────
document.getElementById('btnAddLock').addEventListener('click', () => {
  const now = new Date();
  document.getElementById('lockStart').value = fmtDateInput(now);
  document.getElementById('lockEnd').value   = fmtDateInput(addHours(now, 1));
  document.getElementById('lockReason').value = '';
  openModal('lockModal');
});

document.getElementById('btnSaveLock').addEventListener('click', async () => {
  const startVal = document.getElementById('lockStart').value;
  const endVal   = document.getElementById('lockEnd').value;
  const reason   = document.getElementById('lockReason').value;
  if (!startVal || !endVal) { alert('Start and end times required'); return; }

  const res = await apiPost('/api/locks', {
    start_time: new Date(startVal).toISOString(),
    end_time:   new Date(endVal).toISOString(),
    reason,
  });
  if (res.ok) {
    closeModal('lockModal');
    await fetchLocks();
    renderTimeline();
    showNotification('success', 'Time slot locked');
  } else {
    const err = await res.json();
    alert('Error: ' + err.error);
  }
});

async function deleteLock(id) {
  if (!confirm('Remove this lock?')) return;
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) {
    await fetchLocks();
    renderTimeline();
    showNotification('success', 'Lock removed');
  }
}

// ── User modal ─────────────────────────────────────────────────────────────
function openUserModal(user) {
  const isEdit = !!user;
  document.getElementById('userModalTitle').textContent = isEdit ? 'Edit User' : 'Add User';
  document.getElementById('userId').value = user ? user.id : '';
  document.getElementById('uUsername').value = user ? user.username : '';
  document.getElementById('uUsername').disabled = isEdit;
  document.getElementById('uPassword').value = '';
  document.getElementById('uPassword').placeholder = isEdit ? 'Leave blank to keep' : 'Password';
  document.getElementById('uDisplayName').value = user ? (user.display_name || '') : '';
  document.getElementById('uRole').value = user ? user.role : 'read';
  document.getElementById('uCanLock').checked = user ? user.can_lock : false;

  const delBtn = document.getElementById('btnDeleteUser');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteUser(user.id) : null;

  openModal('userModal');
}

document.getElementById('btnSaveUser').addEventListener('click', async () => {
  const id = document.getElementById('userId').value;
  const username = document.getElementById('uUsername').value.trim();
  const password = document.getElementById('uPassword').value;
  const displayName = document.getElementById('uDisplayName').value.trim();
  const role = document.getElementById('uRole').value;
  const canLock = document.getElementById('uCanLock').checked;

  if (!id && (!username || !password)) { alert('Username and password required'); return; }

  const payload = { display_name: displayName, role, can_lock: canLock };
  if (!id) { payload.username = username; payload.password = password; }
  if (id && password) { payload.password = password; }

  const res = id
    ? await apiPut(`/api/users/${id}`, payload)
    : await apiPost('/api/users', payload);

  if (res.ok) {
    closeModal('userModal');
    renderSidebar();
    showNotification('success', id ? 'User updated' : 'User created');
  } else {
    const err = await res.json();
    alert('Error: ' + err.error);
  }
});

async function deleteUser(id) {
  if (!confirm('Delete this user?')) return;
  const res = await apiDel(`/api/users/${id}`);
  if (res.ok) {
    closeModal('userModal');
    renderSidebar();
    showNotification('success', 'User deleted');
  } else {
    alert('Failed to delete user');
  }
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function renderSidebar() {
  const tab = state.sidebarTab;
  const content = document.getElementById('sidebarContent');

  if (tab === 'legend') {
    content.innerHTML = `
      <div style="margin-bottom:12px;font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em">Event Types</div>
      <div class="legend-list">
        ${state.eventTypes.map(t => `
          <div class="legend-item">
            <div class="legend-swatch" style="background:${t.color}"></div>
            <span class="legend-label">${t.label}</span>
          </div>
        `).join('')}
      </div>
      <div style="margin:18px 0 8px;font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em">Current View</div>
      <div style="font-size:12px;color:var(--text)">
        <div>Range: ${getRangeDays()} day${getRangeDays()!==1?'s':''}</div>
        <div>Resolution: ${state.resolution === 'quarter' ? '15 min' : state.resolution}</div>
        <div>From: ${fmtDate(state.startDate)}</div>
        <div>To: ${fmtDate(addDays(state.startDate, getRangeDays()-1))}</div>
        <div style="margin-top:8px">Events: ${state.events.length}</div>
        <div>Locks: ${state.locks.length}</div>
      </div>
    `;
  } else if (tab === 'alarms') {
    const myAlarms = state.alarms.filter(a => !a.fired);
    content.innerHTML = `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em">My Alarms</span>
      </div>
      ${myAlarms.length === 0
        ? `<div style="color:var(--text-dim);font-size:12px">No active alarms.<br>Click an event to set a reminder.</div>`
        : `<div class="alarm-list">${myAlarms.map(a => `
          <div class="alarm-item">
            <div class="alarm-title">${escHtml(a.event_title)}</div>
            <div class="alarm-meta">
              📅 ${fmtDateTime(new Date(a.event_time))}<br>
              🔔 ${a.lead_time > 0 ? a.lead_time + ' min before' : 'At event time'}
            </div>
            <div class="alarm-actions">
              <button class="btn btn-danger btn-sm" onclick="deleteAlarm(${a.id})">Remove</button>
            </div>
          </div>
        `).join('')}</div>`
      }
    `;
  } else if (tab === 'users' && state.user && state.user.role === 'admin') {
    apiGet('/api/users').then(users => {
      content.innerHTML = `
        <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em">Users</span>
          <button class="btn btn-primary btn-sm" onclick="openUserModal(null)">+ Add</button>
        </div>
        <div class="user-list">
          ${(users||[]).map(u => `
            <div class="user-item">
              <div class="user-name">
                <div>${escHtml(u.display_name || u.username)}</div>
                <div style="font-size:11px;color:var(--text-dim)">@${escHtml(u.username)}</div>
              </div>
              <span class="role-badge role-${u.role}">${u.role}</span>
              ${u.can_lock ? `<span title="Can lock slots">🔒</span>` : ''}
              <button class="btn btn-secondary btn-sm btn-icon" onclick='openUserModal(${JSON.stringify(u)})' title="Edit">✏️</button>
            </div>
          `).join('')}
        </div>
      `;
    });
  }
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Notifications ──────────────────────────────────────────────────────────
function showNotification(type, message, duration = 4000) {
  const area = document.getElementById('notification-area');
  const el = document.createElement('div');
  el.className = `notification ${type === 'alarm' ? 'alarm' : ''}`;

  const title = type === 'alarm' ? '🔔 Alarm' : type === 'success' ? '✓ Done' : '⚠ Notice';
  el.innerHTML = `
    <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    <div class="notification-title">${title}</div>
    <div class="notification-msg">${escHtml(message)}</div>
  `;
  area.appendChild(el);

  if (duration > 0) setTimeout(() => el.remove(), duration);
}

// ── SSE – real-time alarm notifications ────────────────────────────────────
function connectSSE() {
  const es = new EventSource('/api/notifications/stream');
  es.addEventListener('alarm', (e) => {
    const data = JSON.parse(e.data);
    showNotification('alarm', data.message, 0);
    // Browser notification if permitted
    if (Notification.permission === 'granted') {
      new Notification('Tidslinjal Alarm', { body: data.message, icon: '/static/favicon.ico' });
    }
  });
  es.onerror = () => setTimeout(connectSSE, 5000);
}

// ── Utility ────────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  // Auth check
  try {
    state.user = await apiGet('/api/auth/me');
  } catch {
    window.location.href = '/login';
    return;
  }

  // Load event types
  state.eventTypes = await apiGet('/api/event-types') || [];

  // Update UI with user info
  document.getElementById('userDisplayName').textContent = state.user.display_name || state.user.username;
  const roleEl = document.getElementById('userRoleBadge');
  roleEl.textContent = state.user.role;
  roleEl.className = `role-badge role-${state.user.role}`;

  // Show/hide controls based on role
  if (state.user.role === 'readwrite' || state.user.role === 'admin') {
    document.getElementById('btnAddEvent').style.display = '';
  }
  if (state.user.role === 'admin' || state.user.can_lock) {
    document.getElementById('btnAddLock').style.display = '';
  }
  if (state.user.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  }

  // Range & resolution select
  document.getElementById('rangeSelect').value = state.range;
  document.getElementById('resolutionSelect').value = state.resolution;

  document.getElementById('rangeSelect').addEventListener('change', e => {
    state.range = e.target.value;
    refreshAll();
  });
  document.getElementById('resolutionSelect').addEventListener('change', e => {
    state.resolution = e.target.value;
    refreshAll();
  });

  // Navigation
  document.getElementById('btnPrev').addEventListener('click', () => navigate(-1));
  document.getElementById('btnNext').addEventListener('click', () => navigate(1));
  document.getElementById('btnToday').addEventListener('click', goToday);

  // Add event button
  document.getElementById('btnAddEvent').addEventListener('click', () => openEventModal(null));

  // Sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.sidebarTab = tab.dataset.tab;
      renderSidebar();
    });
  });

  // Toggle sidebar
  document.getElementById('btnSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hidden');
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await apiPost('/api/auth/logout', {});
    window.location.href = '/login';
  });

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Timeline auto-refresh every minute (update current-time-line)
  setInterval(() => {
    const days = getDays();
    updateCurrentTimeLine(days, getSlotHeight());
  }, 30000);

  // Full data refresh every 60 seconds
  setInterval(refreshAll, 60000);

  // SSE for real-time alarms
  connectSSE();

  // Request notification permission
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Initial load
  await refreshAll();

  // Scroll to current time
  requestAnimationFrame(() => {
    const now = new Date();
    const slotH = getSlotHeight();
    const slotMin = getSlotMinutes();
    const minSince = now.getHours() * 60 + now.getMinutes();
    const scrollTop = Math.max(0, (44 + (minSince / slotMin) * slotH) - 200);
    document.getElementById('timeline-container').scrollTop = scrollTop;
  });
}

document.addEventListener('DOMContentLoaded', init);
