/* ============================================================
   Tidslinjal — Utilities
   Pure helper functions: dates, slots, ranges, DOM, security.
   No dependencies on state or api.
   ============================================================ */
'use strict';

// ── Error display ───────────────────────────────────────────────────────────
function showError(msg, title) {
  const modal = document.getElementById('errorModal');
  if (!modal) { alert(msg); return; }
  document.getElementById('errorModalTitle').textContent = title || 'Error';
  document.getElementById('errorModalMsg').textContent  = msg;
  openModal('errorModal');
}
function showConfirm(msg) { return window.confirm(msg); }

// ── Date utilities ──────────────────────────────────────────────────────────
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
function fmtDuration(startIso, endIso) {
  if (!endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  if (ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function recurStepMs(pattern) {
  const map = {
    '15min':     15 * 60000,
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

// ── Range helpers ───────────────────────────────────────────────────────────
function getRangeDays() {
  switch (state.range) {
    case 'day':     return 1;
    case '2days':   return 2;
    case '3days':   return 3;
    case '4days':   return 4;
    case '5days':   return 5;
    case 'week':    return 7;
    case '2weeks':  return 14;
    case '3weeks':  return 21;
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

// ── Slot helpers ────────────────────────────────────────────────────────────
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
  return 0; // Always from midnight — full day is always rendered
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
function isCurrentSlot(s, e) {
  const now = new Date(); return now >= s && now < e;
}

// ── Security ────────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Role check ──────────────────────────────────────────────────────────────
function hasRole2(userRole, required) {
  const order = {read:0, reporter:1, readwrite:2, teamlead:3, oplead:4, admin:5};
  return (order[userRole]||0) >= (order[required]||0);
}

// Check if the current user has a named capability via role config override
function userHasCapability(cap) {
  if (!state.user) return false;
  if (state.user.role === 'admin') return true;
  const roleKey = state.user.role;
  const configs = state.roleConfigs || [];
  const cfg = configs.find(c => c.key === roleKey);
  if (cfg && cfg.capabilities) return !!cfg.capabilities[cap];
  return false;
}

// ── DOM helpers ─────────────────────────────────────────────────────────────
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ── Modal helpers ───────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
});

// ── Notifications ───────────────────────────────────────────────────────────
function showNotification(type, message, duration=4000) {
  const area = document.getElementById('notification-area');
  const el   = document.createElement('div');
  el.className = `notification${type==='alarm'?' alarm':''}${type==='warning'?' warning':''}`;
  const title  = type==='alarm' ? t('notif_alarm_title') : type==='warning' ? 'Warning' : t('notif_done');
  el.innerHTML = `
    <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    <div class="notification-title">${title}</div>
    <div class="notification-msg">${escHtml(message)}</div>
  `;
  area.appendChild(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
}

// ── Clock ───────────────────────────────────────────────────────────────────
let _clockUTC = localStorage.getItem('clockFmt') === 'zulu'; // false = local time, true = UTC

function setClockFormat(fmt) {
  _clockUTC = (fmt === 'zulu');
  localStorage.setItem('clockFmt', _clockUTC ? 'zulu' : 'local');
  updateClock();
  // Sync buttons in settings panel if open
  const localBtn = document.getElementById('clockFmtLocal');
  const zuluBtn  = document.getElementById('clockFmtZulu');
  if (localBtn) localBtn.classList.toggle('active', !_clockUTC);
  if (zuluBtn)  zuluBtn.classList.toggle('active',  _clockUTC);
}

function toggleClockTZ() {
  setClockFormat(_clockUTC ? 'local' : 'zulu');
}

function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  let h, m, s, dateStr, tzLabel, timeStr;
  if (_clockUTC) {
    h = now.getUTCHours(); m = now.getUTCMinutes(); s = now.getUTCSeconds();
    dateStr = now.toLocaleDateString(getLocale(), {weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
    // Zulu format: no colons, "Z" suffix
    timeStr = `${pad(h)}${pad(m)}${pad(s)}Z`;
    tzLabel = 'UTC/Z';
  } else {
    h = now.getHours(); m = now.getMinutes(); s = now.getSeconds();
    dateStr = now.toLocaleDateString(getLocale(), {weekday:'long', day:'numeric', month:'long', year:'numeric'});
    timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;
    // Show short timezone name
    try {
      tzLabel = now.toLocaleTimeString(getLocale(), {timeZoneName:'short'}).split(' ').pop();
    } catch { tzLabel = ''; }
  }
  const timeEl = document.getElementById('clockTime');
  if (timeEl) timeEl.textContent = timeStr;
  const dateEl = document.getElementById('clockDate');
  if (dateEl) dateEl.textContent = dateStr;
  const tzEl = document.getElementById('clockTZ');
  if (tzEl) tzEl.textContent = tzLabel;
  updateExtraClocks(now);
}

// ── Extra timezone clocks ───────────────────────────────────────────────────
function updateExtraClocks(now) {
  const clocks = (state.preferences && state.preferences.extra_clocks) || [];
  const container = document.getElementById('extraClocksContainer');
  if (!container) return;
  // Create/update one widget per configured extra clock
  clocks.forEach(ec => {
    const id = `extra-clock-${ec.id}`;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'clock-extra';
      el.innerHTML = `
        <div class="clock-extra-inner">
          <div class="clock-extra-label">${escHtml(ec.label)}</div>
          <div class="clock-extra-time" id="${id}-time">--:--:--</div>
          <div class="clock-extra-tz" id="${id}-tz"></div>
        </div>
        <button class="clock-extra-remove" title="Remove clock" onclick="removeExtraClock(${ec.id})">×</button>`;
      container.appendChild(el);
    }
    const n = now || new Date();
    const pad = x => String(x).padStart(2,'0');
    try {
      const timeStr = n.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone: ec.timezone});
      const tzAbbr  = n.toLocaleTimeString('en-GB', {timeZoneName:'short', timeZone: ec.timezone}).split(' ').pop();
      const tEl = document.getElementById(`${id}-time`);
      const zEl = document.getElementById(`${id}-tz`);
      if (tEl) tEl.textContent = timeStr;
      if (zEl) zEl.textContent = tzAbbr || ec.timezone;
    } catch (e) {
      const tEl = document.getElementById(`${id}-time`);
      if (tEl) tEl.textContent = '??:??:??';
    }
  });
  // Remove stale widgets
  container.querySelectorAll('.clock-extra').forEach(el => {
    const elId = parseInt(el.id.replace('extra-clock-', ''), 10);
    if (!clocks.find(c => c.id === elId)) el.remove();
  });
}

function removeExtraClock(id) {
  const clocks = state.preferences.extra_clocks || [];
  state.preferences.extra_clocks = clocks.filter(c => c.id !== id);
  const el = document.getElementById(`extra-clock-${id}`);
  if (el) el.remove();
  savePreferences();
  if (typeof renderSidebar === 'function') renderSidebar();
}

// ── Detachable clock window ──────────────────────────────────────────────────
let _clockPopout = null;

function detachClock() {
  // If a popout is already open and not closed, focus it
  if (_clockPopout && !_clockPopout.closed) {
    _clockPopout.focus();
    return;
  }
  const extraClocks = (state.preferences && state.preferences.extra_clocks) || [];
  const isUTC = _clockUTC;
  const theme = (state.preferences && state.preferences.theme) || 'dark';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tidslinjal — Clocks</title>
<style>
  :root {
    --bg: ${theme === 'light' ? '#f0f2f5' : '#1a1d23'};
    --bg2: ${theme === 'light' ? '#ffffff' : '#22262e'};
    --text: ${theme === 'light' ? '#1a1d23' : '#e8eaf0'};
    --accent: #4a9eff;
    --border: ${theme === 'light' ? '#d0d4de' : '#2e3340'};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 100vh; gap: 20px; padding: 24px; }
  .clock-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px;
    padding: 20px 36px; text-align: center; min-width: 220px; }
  .clock-label { font-size: 13px; font-weight: 600; color: var(--accent); letter-spacing: .08em;
    text-transform: uppercase; margin-bottom: 6px; }
  .clock-time { font-size: 48px; font-weight: 700; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
  .clock-date { font-size: 13px; color: #888; margin-top: 4px; }
  .clock-tz { font-size: 12px; font-weight: 700; color: var(--accent); margin-top: 2px; }
  h1 { font-size: 14px; color: #888; letter-spacing: .1em; text-transform: uppercase; }
</style>
</head>
<body>
<h1>Tidslinjal Clocks</h1>
<div class="clock-card" id="main-clock">
  <div class="clock-label" id="main-label">${isUTC ? 'UTC/Z' : 'Local Time'}</div>
  <div class="clock-time" id="main-time">--:--:--</div>
  <div class="clock-date" id="main-date"></div>
  <div class="clock-tz" id="main-tz"></div>
</div>
${extraClocks.map(ec => `
<div class="clock-card">
  <div class="clock-label">${ec.label || ec.timezone}</div>
  <div class="clock-time" id="ec-${ec.id}-time">--:--:--</div>
  <div class="clock-tz" id="ec-${ec.id}-tz"></div>
</div>`).join('')}
<script>
const isUTC = ${JSON.stringify(isUTC)};
const extraClocks = ${JSON.stringify(extraClocks)};
function pad(n) { return String(n).padStart(2,'0'); }
function tick() {
  const now = new Date();
  let timeStr, dateStr, tzLabel;
  if (isUTC) {
    const h = now.getUTCHours(), m = now.getUTCMinutes(), s = now.getUTCSeconds();
    timeStr = pad(h)+pad(m)+pad(s)+'Z';
    dateStr = now.toLocaleDateString(undefined, {weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    tzLabel = 'UTC/Z';
  } else {
    timeStr = pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
    dateStr = now.toLocaleDateString(undefined, {weekday:'long',day:'numeric',month:'long',year:'numeric'});
    try { tzLabel = now.toLocaleTimeString(undefined,{timeZoneName:'short'}).split(' ').pop(); } catch { tzLabel=''; }
  }
  document.getElementById('main-time').textContent = timeStr;
  document.getElementById('main-date').textContent = dateStr;
  document.getElementById('main-tz').textContent = tzLabel;
  extraClocks.forEach(ec => {
    try {
      const t = document.getElementById('ec-'+ec.id+'-time');
      const z = document.getElementById('ec-'+ec.id+'-tz');
      if (t) t.textContent = now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:ec.timezone});
      if (z) z.textContent = now.toLocaleTimeString('en-GB',{timeZoneName:'short',timeZone:ec.timezone}).split(' ').pop()||ec.timezone;
    } catch(e) { const t=document.getElementById('ec-'+ec.id+'-time'); if(t)t.textContent='??:??:??'; }
  });
}
tick();
setInterval(tick, 1000);
<\/script>
</body>
</html>`;

  _clockPopout = window.open('', 'tidslinjal-clocks',
    'width=320,height=' + Math.max(280, 200 + extraClocks.length * 140) + ',resizable=yes,scrollbars=yes');
  if (_clockPopout) {
    _clockPopout.document.open();
    _clockPopout.document.write(html);
    _clockPopout.document.close();
  }
}

// City → IANA timezone hint table (supplement to IANA search)
const _TZ_CITY_MAP = [
  ['London','Europe/London'],['Paris','Europe/Paris'],['Berlin','Europe/Berlin'],
  ['Madrid','Europe/Madrid'],['Rome','Europe/Rome'],['Amsterdam','Europe/Amsterdam'],
  ['Brussels','Europe/Brussels'],['Zurich','Europe/Zurich'],['Vienna','Europe/Vienna'],
  ['Warsaw','Europe/Warsaw'],['Prague','Europe/Prague'],['Budapest','Europe/Budapest'],
  ['Bucharest','Europe/Bucharest'],['Athens','Europe/Athens'],['Istanbul','Europe/Istanbul'],
  ['Helsinki','Europe/Helsinki'],['Stockholm','Europe/Stockholm'],['Oslo','Europe/Oslo'],
  ['Copenhagen','Europe/Copenhagen'],['Tallinn','Europe/Tallinn'],['Riga','Europe/Riga'],
  ['Vilnius','Europe/Vilnius'],['Minsk','Europe/Minsk'],['Kiev','Europe/Kyiv'],
  ['Kyiv','Europe/Kyiv'],['Moscow','Europe/Moscow'],['Dubai','Asia/Dubai'],
  ['Riyadh','Asia/Riyadh'],['Karachi','Asia/Karachi'],['Mumbai','Asia/Kolkata'],
  ['Delhi','Asia/Kolkata'],['Kolkata','Asia/Kolkata'],['Dhaka','Asia/Dhaka'],
  ['Colombo','Asia/Colombo'],['Bangkok','Asia/Bangkok'],['Jakarta','Asia/Jakarta'],
  ['Singapore','Asia/Singapore'],['Kuala Lumpur','Asia/Kuala_Lumpur'],
  ['Manila','Asia/Manila'],['Hong Kong','Asia/Hong_Kong'],['Shanghai','Asia/Shanghai'],
  ['Beijing','Asia/Shanghai'],['Seoul','Asia/Seoul'],['Tokyo','Asia/Tokyo'],
  ['Sydney','Australia/Sydney'],['Melbourne','Australia/Melbourne'],
  ['Brisbane','Australia/Brisbane'],['Auckland','Pacific/Auckland'],
  ['New York','America/New_York'],['Boston','America/New_York'],
  ['Washington','America/New_York'],['Miami','America/New_York'],
  ['Chicago','America/Chicago'],['Dallas','America/Chicago'],
  ['Houston','America/Chicago'],['Denver','America/Denver'],
  ['Phoenix','America/Phoenix'],['Los Angeles','America/Los_Angeles'],
  ['San Francisco','America/Los_Angeles'],['Seattle','America/Los_Angeles'],
  ['Vancouver','America/Vancouver'],['Toronto','America/Toronto'],
  ['Montreal','America/Toronto'],['Mexico City','America/Mexico_City'],
  ['Sao Paulo','America/Sao_Paulo'],['Buenos Aires','America/Argentina/Buenos_Aires'],
  ['Lima','America/Lima'],['Bogota','America/Bogota'],['Santiago','America/Santiago'],
  ['Johannesburg','Africa/Johannesburg'],['Cairo','Africa/Cairo'],
  ['Lagos','Africa/Lagos'],['Nairobi','Africa/Nairobi'],
  ['UTC','UTC'],['GMT','Etc/GMT'],
];

// Build a combined list: city entries + all IANA zones
function _getTzCandidates() {
  const zones = (typeof Intl !== 'undefined' && Intl.supportedValuesOf)
    ? Intl.supportedValuesOf('timeZone') : [];
  const seen = new Set();
  const list = [];
  // City entries first (higher relevance)
  for (const [city, tz] of _TZ_CITY_MAP) {
    const key = city + '|' + tz;
    if (!seen.has(key)) { seen.add(key); list.push({ label: city, tz }); }
  }
  // Then raw IANA zone names
  for (const tz of zones) {
    const key = tz + '|' + tz;
    if (!seen.has(key)) { seen.add(key); list.push({ label: tz, tz }); }
  }
  return list;
}

let _tzCandidates = null;
let _tzHighlightIdx = -1;

function filterTzSuggestions(query) {
  const box = document.getElementById('tzSuggestions');
  if (!box) return;
  const q = query.trim().toLowerCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; _tzHighlightIdx = -1; return; }
  if (!_tzCandidates) _tzCandidates = _getTzCandidates();
  const matches = _tzCandidates.filter(c =>
    c.label.toLowerCase().includes(q) || c.tz.toLowerCase().includes(q)
  ).slice(0, 12);
  if (!matches.length) { box.style.display = 'none'; box.innerHTML = ''; _tzHighlightIdx = -1; return; }
  _tzHighlightIdx = -1;
  box.innerHTML = matches.map((c, i) =>
    `<div class="tz-suggestion" data-idx="${i}" data-tz="${c.tz}" data-label="${c.label}"
      style="padding:5px 10px;cursor:pointer;font-size:var(--fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      onmousedown="selectTzSuggestion(this)" onmouseenter="highlightTzSuggestion(${i})">
      <span style="color:var(--text)">${c.label}</span>
      ${c.label !== c.tz ? `<span style="opacity:.5;font-size:var(--fs-xs);margin-left:6px">${c.tz}</span>` : ''}
    </div>`
  ).join('');
  box.style.display = 'block';
}

function highlightTzSuggestion(idx) {
  _tzHighlightIdx = idx;
  const box = document.getElementById('tzSuggestions');
  if (!box) return;
  box.querySelectorAll('.tz-suggestion').forEach((el, i) => {
    el.style.background = i === idx ? 'var(--accent)' : '';
    el.style.color = i === idx ? '#fff' : '';
  });
}

function selectTzSuggestion(el) {
  const tz    = el.dataset.tz;
  const label = el.dataset.label;
  document.getElementById('newClockTZ').value    = tz;
  document.getElementById('newClockLabel').value = label !== tz ? label : '';
  document.getElementById('newClockSearch').value = label;
  const box = document.getElementById('tzSuggestions');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  _tzHighlightIdx = -1;
}

function tzSuggestionsKey(e) {
  const box = document.getElementById('tzSuggestions');
  if (!box || box.style.display === 'none') return;
  const items = box.querySelectorAll('.tz-suggestion');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _tzHighlightIdx = Math.min(_tzHighlightIdx + 1, items.length - 1);
    highlightTzSuggestion(_tzHighlightIdx);
    items[_tzHighlightIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _tzHighlightIdx = Math.max(_tzHighlightIdx - 1, 0);
    highlightTzSuggestion(_tzHighlightIdx);
    items[_tzHighlightIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = _tzHighlightIdx >= 0 ? items[_tzHighlightIdx] : items[0];
    if (target) selectTzSuggestion(target);
  } else if (e.key === 'Escape') {
    box.style.display = 'none'; box.innerHTML = ''; _tzHighlightIdx = -1;
  }
}

function openAddClockPopover(btn) {
  const pop = document.getElementById('addClockPopover');
  if (!pop) return;
  // Clear all inputs
  const searchEl = document.getElementById('newClockSearch');
  if (searchEl) searchEl.value = '';
  document.getElementById('newClockLabel').value = '';
  document.getElementById('newClockTZ').value = '';
  const box = document.getElementById('tzSuggestions');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  _tzHighlightIdx = -1;
  const rect = btn.getBoundingClientRect();
  pop.style.display = 'block';
  pop.style.top  = (rect.bottom + 6) + 'px';
  pop.style.left = Math.max(4, rect.left - pop.offsetWidth + btn.offsetWidth) + 'px';
  if (searchEl) searchEl.focus();
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', _closeClockPopoverOnOutside, { once: true });
  }, 10);
}

function _closeClockPopoverOnOutside(e) {
  const pop = document.getElementById('addClockPopover');
  if (pop && !pop.contains(e.target) && e.target.id !== 'btnAddClock') {
    pop.style.display = 'none';
  }
}

function closeAddClockPopover() {
  const pop = document.getElementById('addClockPopover');
  if (pop) pop.style.display = 'none';
}

function confirmAddClock() {
  const label = (document.getElementById('newClockLabel')?.value || '').trim();
  const tz    = document.getElementById('newClockTZ')?.value || '';
  if (!tz) { showError('Please select a timezone from the suggestions'); return; }
  // Basic validation: must be a known IANA zone
  try { new Intl.DateTimeFormat(undefined, { timeZone: tz }); } catch(e) {
    showError('Invalid timezone: ' + tz); return;
  }
  const clocks = state.preferences.extra_clocks || [];
  const nextId = clocks.length ? Math.max(...clocks.map(c => c.id)) + 1 : 1;
  state.preferences.extra_clocks = [...clocks, { id: nextId, timezone: tz, label: label || tz }];
  closeAddClockPopover();
  updateExtraClocks(new Date());
  savePreferences();
  if (typeof renderSidebar === 'function') renderSidebar();
}
