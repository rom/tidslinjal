/* ============================================================
   Tidslinjal v2.0.0 — Collaborative Operational Timeline
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
  preferences: {
    theme:        'dark',
    size:         'small',
    language:     'en',
    day_start_hour: 0,
    day_end_hour:   24,
    hidden_types:  [],
    active_layers: [],
  },
  resolution:  'hour',
  range:       'week',
  startDate:   startOfDay(new Date()),
  sidebarTab:  'legend',
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
function getSlotsPerDay() {
  const startH = state.preferences.day_start_hour || 0;
  const endH   = state.preferences.day_end_hour   || 24;
  const hours  = Math.max(1, endH - startH);
  switch (state.resolution) {
    case 'quarter': return hours * 4;
    case 'hour':    return hours;
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
  const s = getComputedStyle(document.documentElement);
  switch (state.resolution) {
    case 'quarter': return parseInt(s.getPropertyValue('--slot-h-quarter')) || 18;
    case 'hour':    return parseInt(s.getPropertyValue('--slot-h-hour'))    || 40;
    case 'day':     return parseInt(s.getPropertyValue('--slot-h-day'))     || 80;
  }
}
function getStartHourOffset() {
  // Minutes from midnight to start of visible day
  return (state.preferences.day_start_hour || 0) * 60;
}
function slotLabel(slotIdx) {
  if (state.resolution === 'day') return '';
  const startMin = getStartHourOffset();
  const minutes  = startMin + slotIdx * getSlotMinutes();
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  if (state.resolution === 'hour') return `${String(h).padStart(2,'0')}:00`;
  return m === 0 ? `${String(h).padStart(2,'0')}:00` : '';
}

// ── Preferences helpers ────────────────────────────────────────────────────
function isTypeHidden(key) {
  return (state.preferences.hidden_types || []).includes(key);
}
function isLayerActive(id) {
  return (state.preferences.active_layers || []).includes(id);
}

// ── Timeline render ────────────────────────────────────────────────────────
function renderTimeline() {
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
    html += `<div class="tl-day-header${isToday?' today':''}" data-date="${day.toISOString()}">
      <div class="tl-day-name">${localDayName(day)}</div>
      <div class="tl-day-date">${localShortDate(day)}${isToday?'<span class="today-marker"></span>':''}</div>
    </div>`;
  });

  // ── Body rows ─────────────────────────────────────────────────────────────
  for (let s = 0; s < slots; s++) {
    const label = slotLabel(s);
    html += `<div class="tl-time-label" style="height:${slotH}px">${label}</div>`;

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

      html += `<div class="tl-cell${locked?' locked':''}${isHalf?' half-hour':''}${isCur?' tl-row-current':''}"
        style="height:${slotH}px"
        data-start="${slotStart.toISOString()}"
        ${locked ? `title="Locked"` : `onclick="onCellClick(event,'${slotStart.toISOString()}','${slotEnd.toISOString()}')"` }
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
  const startOff   = getStartHourOffset(); // minutes from midnight to view start
  const endOff     = startOff + slots * slotMin;

  requestAnimationFrame(() => {
    const cells = container.querySelectorAll('.tl-cell');
    if (!cells.length) return;

    const dayMeta = days.map((_, di) => {
      const cell = cells[di * slots];
      return cell ? { left: cell.offsetLeft, width: cell.offsetWidth } : null;
    });

    container.querySelectorAll('.event-block,.lock-overlay,.lock-label').forEach(el => el.remove());

    // ── Events ───────────────────────────────────────────────────────────────
    const visibleEvents = state.events.filter(ev => !isTypeHidden(ev.event_type));

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
        const veOff = Math.min(veMin === 0 && visEnd >= dayEnd ? 24*60 : veMin, endOff);
        if (veOff <= vsOff) return;

        const topPx    = headerH + ((vsOff - startOff) / slotMin) * slotH;
        const heightPx = Math.max(((veOff - vsOff) / slotMin) * slotH - 2, 14);

        // Get layer color tint for non-master events
        let borderL = 'rgba(255,255,255,.3)';
        if (ev.layer_id) {
          const layer = state.layers.find(l => l.id === ev.layer_id);
          if (layer) borderL = layer.color || borderL;
        }

        const block = document.createElement('div');
        block.className = 'event-block';
        block.style.cssText = `top:${topPx}px;left:${dayMeta[di].left+2}px;width:${dayMeta[di].width-4}px;height:${heightPx}px;background:${ev.color||'#4A90D9'};border-left-color:${borderL};`;
        block.innerHTML = `
          <div class="ev-title">${escHtml(ev.title)}</div>
          ${heightPx > 28 ? `<div class="ev-time">${fmtTime(evStart)}${ev.end_time?'–'+fmtTime(evEnd):''}</div>` : ''}
          ${heightPx > 44 ? `<div class="ev-creator">${escHtml(ev.created_by_name||'')}</div>` : ''}
        `;
        block.onclick = e => { e.stopPropagation(); showEventDetail(ev); };
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
function updateCurrentTimeLine(days, slotH) {
  const line   = document.getElementById('current-time-line');
  const now    = new Date();
  const today  = days.find(d => isSameDay(d, now));
  if (!today) { line.style.display='none'; return; }
  const startOff = getStartHourOffset();
  const nowMin   = now.getHours()*60 + now.getMinutes();
  if (nowMin < startOff || nowMin > startOff + getSlotsPerDay()*getSlotMinutes()) {
    line.style.display='none'; return;
  }
  const topPx = 44 + ((nowMin - startOff) / getSlotMinutes()) * slotH;
  line.style.display = 'block';
  line.style.top = topPx+'px';
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
  const slotH    = getSlotHeight();
  const startOff = getStartHourOffset();
  const now      = new Date();
  const nowMin   = now.getHours()*60 + now.getMinutes();
  const topPx    = 44 + ((nowMin - startOff) / getSlotMinutes()) * slotH;
  const tc       = document.getElementById('timeline-container');
  tc.scrollTop   = Math.max(0, topPx - tc.clientHeight/2);
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
async function fetchEvents() {
  const from = state.startDate.toISOString();
  const to   = getViewEnd().toISOString();
  state.events = await apiGet(`/api/events?from=${from}&to=${to}`) || [];
}
async function fetchLocks()   { state.locks      = await apiGet('/api/locks')  || []; }
async function fetchAlarms()  { state.alarms     = await apiGet('/api/alarms') || []; }
async function fetchLayers()  { state.layers     = await apiGet('/api/layers') || []; }
async function fetchGroups()  { state.groups     = await apiGet('/api/groups') || []; }

async function refreshAll() {
  await Promise.all([fetchEvents(), fetchLocks(), fetchAlarms(), fetchLayers()]);
  renderTimeline();
  renderSidebar();
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
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(dir) {
  state.startDate = addDays(state.startDate, dir * getRangeDays());
  refreshAll();
}
function goToday() {
  state.startDate = startOfDay(new Date());
  refreshAll();
}

// ── Cell click ─────────────────────────────────────────────────────────────
function onCellClick(e, startISO, endISO) {
  if (!state.user || state.user.role === 'read') return;
  openEventModal(null, new Date(startISO), new Date(endISO));
}

// ── Event Modal ────────────────────────────────────────────────────────────
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

  const recurring = ev && ev.is_recurring;
  document.getElementById('eventRecurring').checked = recurring;
  document.getElementById('recurrenceGroup').style.display    = recurring ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = recurring ? '' : 'none';
  if (ev) {
    document.getElementById('eventRecurrencePattern').value = ev.recurrence_pattern || 'weekly';
    if (ev.recurrence_end) document.getElementById('eventRecurrenceEnd').value = fmtDateInput(new Date(ev.recurrence_end));
  }

  const creatorEl = document.getElementById('eventCreator');
  creatorEl.style.display = isEdit ? '' : 'none';
  if (isEdit) creatorEl.textContent = `${t('event_created_by')} ${ev.created_by_name} — ${fmtDateTime(new Date(ev.created_at))}`;

  const delBtn = document.getElementById('btnDeleteEvent');
  const canDel = isEdit && (state.user.role==='admin' || state.user.id===ev.created_by);
  delBtn.style.display = canDel ? '' : 'none';
  delBtn.onclick = canDel ? () => deleteEvent(ev.id) : null;

  openModal('eventModal');
}

document.getElementById('eventRecurring').addEventListener('change', function() {
  document.getElementById('recurrenceGroup').style.display    = this.checked ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = this.checked ? '' : 'none';
});

document.getElementById('btnSaveEvent').addEventListener('click', async () => {
  const id    = document.getElementById('eventId').value;
  const title = document.getElementById('eventTitle').value.trim();
  if (!title) { alert('Title is required'); return; }
  const startVal = document.getElementById('eventStart').value;
  const endVal   = document.getElementById('eventEnd').value;
  if (!startVal) { alert('Start time is required'); return; }

  const recurring = document.getElementById('eventRecurring').checked;
  const layerVal  = document.getElementById('eventLayer').value;
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
                          ? new Date(document.getElementById('eventRecurrenceEnd').value).toISOString() : null,
    layer_id:           layerVal ? parseInt(layerVal, 10) : null,
  };

  const res = id ? await apiPut(`/api/events/${id}`, payload) : await apiPost('/api/events', payload);
  if (res.ok) {
    closeModal('eventModal');
    await refreshAll();
    showNotification('success', t(id ? 'notif_event_updated' : 'notif_event_created'));
  } else {
    const err = await res.json();
    alert('Error: '+err.error);
  }
});

async function deleteEvent(id) {
  if (!confirm(t('confirm_delete_event'))) return;
  const res = await apiDel(`/api/events/${id}`);
  if (res.ok) {
    closeModal('eventModal'); closeModal('detailModal');
    await refreshAll();
    showNotification('success', t('notif_event_deleted'));
  } else { alert('Failed to delete event'); }
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
          ${ev.is_recurring ? `<b>${t('detail_repeats')}:</b><span>${ev.recurrence_pattern}</span>` : ''}
          ${layer ? `<b>${t('event_layer')}:</b><span>${escHtml(layer.name)}</span>` : ''}
          <b>${t('detail_created')}:</b><span>${escHtml(ev.created_by_name||'')}</span>
          <b>${t('detail_created_at')}:</b><span>${fmtDateTime(new Date(ev.created_at))}</span>
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
        alert('Upload failed: '+err.error);
      }
    };
  }

  const footer = document.getElementById('detailFooter');
  footer.innerHTML = '';

  const alarmBtn = document.createElement('button');
  alarmBtn.className = 'btn btn-secondary btn-sm';
  alarmBtn.textContent = t('detail_set_alarm');
  alarmBtn.onclick = () => { closeModal('detailModal'); openAlarmModal(ev); };
  footer.appendChild(alarmBtn);

  const canEdit = state.user && (state.user.role==='admin' || state.user.role==='readwrite' || state.user.id===ev.created_by);
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
  } else { const err = await res.json(); alert('Error: '+err.error); }
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
  if (!sv||!ev) { alert('Start and end required'); return; }
  const res = await apiPost('/api/locks', {
    start_time: new Date(sv).toISOString(),
    end_time:   new Date(ev).toISOString(),
    reason:     document.getElementById('lockReason').value,
  });
  if (res.ok) {
    closeModal('lockModal'); await fetchLocks(); renderTimeline();
    showNotification('success', t('notif_locked'));
  } else { const err = await res.json(); alert('Error: '+err.error); }
});

async function deleteLock(id) {
  if (!confirm(t('confirm_delete_lock'))) return;
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) { await fetchLocks(); renderTimeline(); showNotification('success', t('notif_unlocked')); }
}

// ── User Modal ─────────────────────────────────────────────────────────────
function openUserModal(user) {
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
  openModal('userModal');
}

document.getElementById('btnSaveUser').addEventListener('click', async () => {
  const id = document.getElementById('userId').value;
  const username = document.getElementById('uUsername').value.trim();
  const password = document.getElementById('uPassword').value;
  const displayName = document.getElementById('uDisplayName').value.trim();
  const role = document.getElementById('uRole').value;
  const canLock = document.getElementById('uCanLock').checked;
  if (!id && (!username||!password)) { alert('Username and password required'); return; }
  const payload = {display_name:displayName, role, can_lock:canLock};
  if (!id) { payload.username=username; payload.password=password; }
  if (id&&password) { payload.password=password; }
  const res = id ? await apiPut(`/api/users/${id}`, payload) : await apiPost('/api/users', payload);
  if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { const err = await res.json(); alert('Error: '+err.error); }
});

async function deleteUser(id) {
  if (!confirm(t('confirm_delete_user'))) return;
  const res = await apiDel(`/api/users/${id}`);
  if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { alert('Failed to delete user'); }
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
  if (!name) { alert('Name required'); return; }
  const payload = {name, description: document.getElementById('groupDesc').value};
  const res = id ? await apiPut(`/api/groups/${id}`, payload) : await apiPost('/api/groups', payload);
  if (res.ok) { closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { const err = await res.json(); alert('Error: '+err.error); }
});

async function deleteGroup(id) {
  if (!confirm(t('confirm_delete_group'))) return;
  const res = await apiDel(`/api/groups/${id}`);
  if (res.ok) { closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved')); }
}

// ── Layer Modal ────────────────────────────────────────────────────────────
function openLayerModal(layer) {
  const isEdit = !!layer;
  document.getElementById('layerModalTitle').textContent = isEdit ? 'Edit Layer' : t('layers_add').replace('+ ','');
  document.getElementById('layerId').value = layer ? layer.id : '';
  document.getElementById('layerName').value = layer ? layer.name : '';
  document.getElementById('layerDesc').value = layer ? (layer.description||'') : '';
  document.getElementById('layerColor').value = layer ? (layer.color||'#4A90D9') : '#4A90D9';
  document.getElementById('layerVisibility').value = layer ? layer.visibility : 'private';
  document.getElementById('layerPermission').value = layer ? layer.permission : 'read';
  document.getElementById('layerGroupIDs').value = layer ? (layer.group_ids||[]).join(', ') : '';
  const delBtn = document.getElementById('btnDeleteLayer');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteLayer(layer.id) : null;
  openModal('layerModal');
}

document.getElementById('btnSaveLayer').addEventListener('click', async () => {
  const id = document.getElementById('layerId').value;
  const name = document.getElementById('layerName').value.trim();
  if (!name) { alert('Name required'); return; }
  const groupIDs = document.getElementById('layerGroupIDs').value
    .split(',').map(s => parseInt(s.trim(),10)).filter(n => !isNaN(n));
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
  } else { const err = await res.json(); alert('Error: '+err.error); }
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
  if (!label || (!id && !key)) { alert('Key and label required'); return; }
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
  } else { const err = await res.json(); alert('Error: '+err.error); }
});

async function deleteEtype(id) {
  if (!confirm(t('confirm_delete_type'))) return;
  const res = await apiDel(`/api/event-types/${id}`);
  if (res.ok) {
    closeModal('etypeModal');
    state.eventTypes = await apiGet('/api/event-types');
    renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); alert('Error: '+err.error); }
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
          <div class="layer-item${!(state.preferences.active_layers&&state.preferences.active_layers.length>0)?' active':''}" onclick="toggleAllLayers()">
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
  } else if (tab === 'groups' && state.user && state.user.role==='admin') {
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
              <button class="btn btn-ghost btn-icon" onclick='openGroupModal(${JSON.stringify(g).replace(/'/g,"&#39;")})'>✏️</button>
            </div>`).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'settings') {
    const p = state.preferences;
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
    `;
  }
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

async function toggleLayer(id) {
  const al = state.preferences.active_layers || [];
  if (al.includes(id)) {
    state.preferences.active_layers = al.filter(x => x!==id);
  } else {
    state.preferences.active_layers = [...al, id];
  }
  await savePreferences();
  await fetchEvents();
  renderSidebar();
  renderTimeline();
}

async function toggleAllLayers() {
  state.preferences.active_layers = [];
  await savePreferences();
  await fetchEvents();
  renderSidebar();
  renderTimeline();
}

function hasRole2(userRole, required) {
  const order = {read:0,readwrite:1,admin:2};
  return (order[userRole]||0) >= (order[required]||0);
}

// ── UI labels (i18n) ───────────────────────────────────────────────────────
function updateUILabels() {
  // Header buttons
  document.getElementById('btnToday').textContent    = t('today');
  document.getElementById('btnZoomNow').title        = t('zoom_now');
  document.getElementById('btnAddEvent').textContent = t('add_event');
  document.getElementById('btnAddLock').textContent  = t('lock_slot');
  document.getElementById('btnLogout').textContent   = t('logout');
  document.getElementById('lbl-show').textContent    = t('show')+':';
  document.getElementById('lbl-res').textContent     = t('resolution')+':';

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
    showNotification('alarm', data.message, 0);
    if (Notification.permission === 'granted') {
      new Notification('Tidslinjal', {body: data.message});
    }
  });
  es.onerror = () => setTimeout(connectSSE, 5000);
}

// ── Utility ────────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  const [prefs, eventTypes, layers, groups] = await Promise.all([
    apiGet('/api/preferences'),
    apiGet('/api/event-types'),
    apiGet('/api/layers'),
    apiGet('/api/groups'),
  ]);

  state.preferences = prefs || state.preferences;
  state.eventTypes  = eventTypes || [];
  state.layers      = layers  || [];
  state.groups      = groups  || [];

  // Apply theme/size
  applyPreferences();

  // Sync UI with loaded preferences
  state.resolution = 'hour';
  state.range      = 'week';
  document.getElementById('rangeSelect').value      = state.range;
  document.getElementById('resolutionSelect').value = state.resolution;

  // Update labels
  updateUILabels();

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

  // Control events
  document.getElementById('rangeSelect').addEventListener('change', e => {
    state.range = e.target.value; refreshAll();
  });
  document.getElementById('resolutionSelect').addEventListener('change', e => {
    state.resolution = e.target.value; refreshAll();
  });
  document.getElementById('btnPrev').addEventListener('click',   () => navigate(-1));
  document.getElementById('btnNext').addEventListener('click',   () => navigate(1));
  document.getElementById('btnToday').addEventListener('click',  goToday);
  document.getElementById('btnZoomNow').addEventListener('click', zoomToNow);
  document.getElementById('btnAddEvent').addEventListener('click', () => openEventModal(null));
  document.getElementById('btnSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hidden');
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

  // Scroll to current time
  setTimeout(() => {
    const slotH    = getSlotHeight();
    const startOff = getStartHourOffset();
    const now      = new Date();
    const nowMin   = now.getHours()*60 + now.getMinutes();
    const topPx    = 44 + ((nowMin - startOff) / getSlotMinutes()) * slotH;
    const tc       = document.getElementById('timeline-container');
    tc.scrollTop   = Math.max(0, topPx - tc.clientHeight/2);
  }, 200);
}

document.addEventListener('DOMContentLoaded', init);
