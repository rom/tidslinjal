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

// BroadcastChannel for syncing state to detached windows
const _detachedChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('tidslinjal-sync') : null;

function _broadcastSync(msg) {
  if (_detachedChannel) _detachedChannel.postMessage(msg);
}

// Listen for messages from detached windows
if (_detachedChannel) {
  _detachedChannel.onmessage = e => {
    if (e.data.type === 'clock-format') {
      _clockUTC = e.data.zulu;
      localStorage.setItem('clockFmt', _clockUTC ? 'zulu' : 'local');
      updateClock();
      const localBtn = document.getElementById('clockFmtLocal');
      const zuluBtn  = document.getElementById('clockFmtZulu');
      if (localBtn) localBtn.classList.toggle('active', !_clockUTC);
      if (zuluBtn)  zuluBtn.classList.toggle('active',  _clockUTC);
    }
  };
}

function setClockFormat(fmt) {
  _clockUTC = (fmt === 'zulu');
  localStorage.setItem('clockFmt', _clockUTC ? 'zulu' : 'local');
  updateClock();
  // Sync buttons in settings panel if open
  const localBtn = document.getElementById('clockFmtLocal');
  const zuluBtn  = document.getElementById('clockFmtZulu');
  if (localBtn) localBtn.classList.toggle('active', !_clockUTC);
  if (zuluBtn)  zuluBtn.classList.toggle('active',  _clockUTC);
  _broadcastSync({ type: 'clock-format', zulu: _clockUTC });
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

// ── Detached Clock Window ──────────────────────────────────────────────────
let _detachedClockWin = null;

function _getThemeClass() {
  const t = (state.preferences && state.preferences.theme) || 'dark';
  if (t === 'light') return 'light-mode';
  if (t === 'city-camo') return 'city-camo';
  if (t === 'urban-camo') return 'urban-camo';
  return '';
}

function _getThemeVars(themeClass) {
  const themes = {
    '': { bg:'#0f1923', bg2:'#162030', bg3:'#1e2d40', border:'#2a3f56', accent:'#4A90D9', text:'#cfd8e3', textDim:'#7a8fa6', textBright:'#f0f4f8' },
    'light-mode': { bg:'#f0f4f8', bg2:'#ffffff', bg3:'#e4eaf2', border:'#c4d0de', accent:'#2a6fad', text:'#2c3e50', textDim:'#5f7a99', textBright:'#0a1929' },
    'city-camo': { bg:'#3a3d2e', bg2:'#4a4d38', bg3:'#555847', border:'#6b6e58', accent:'#8faa5a', text:'#d4d8c4', textDim:'#9a9e8a', textBright:'#eef0e0' },
    'urban-camo': { bg:'#1a2233', bg2:'#1e293b', bg3:'#243044', border:'#3a4a5c', accent:'#4a90d9', text:'#c8d8e8', textDim:'#7a90a8', textBright:'#e8f0f8' },
  };
  return themes[themeClass] || themes[''];
}

function openDetachedClock() {
  if (_detachedClockWin && !_detachedClockWin.closed) { _detachedClockWin.focus(); return; }
  const themeClass = _getThemeClass();
  const tv = _getThemeVars(themeClass);
  // Gather today's deadlines from state.events
  const deadlines = _getTodayDeadlines();
  const deadlineJSON = JSON.stringify(deadlines);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal Clock</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;
  background:var(--bg);color:var(--text);transition:background .3s,color .3s}
:root{--bg:${tv.bg};--bg2:${tv.bg2};--bg3:${tv.bg3};--border:${tv.border};--accent:${tv.accent};--text:${tv.text};--text-dim:${tv.textDim};--text-bright:${tv.textBright}}
.clock-container{text-align:center;padding:30px}
.analog-clock{position:relative;width:280px;height:280px;margin:0 auto 20px}
.analog-clock svg{width:100%;height:100%}
.digital-time{font-size:48px;font-weight:700;letter-spacing:2px;color:var(--text-bright);font-variant-numeric:tabular-nums}
.digital-date{font-size:16px;color:var(--text-dim);margin-top:4px}
.tz-label{font-size:14px;font-weight:700;color:var(--accent);margin-top:2px;cursor:pointer;user-select:none}
.tz-label:hover{text-decoration:underline}
</style></head><body>
<div class="clock-container">
  <div class="analog-clock"><svg id="analogSvg" viewBox="0 0 200 200"></svg></div>
  <div class="digital-time" id="dTime">--:--:--</div>
  <div class="digital-date" id="dDate">—</div>
  <div class="tz-label" id="dTZ" onclick="toggleTZ()" title="Click to toggle Local / ZULU">—</div>
</div>
<script>
let useUTC = ${_clockUTC};
const deadlines = ${deadlineJSON};
const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('tidslinjal-sync') : null;

function toggleTZ() {
  useUTC = !useUTC;
  // Notify main window
  if (channel) channel.postMessage({ type: 'clock-format', zulu: useUTC });
  tick();
}

if (channel) {
  channel.onmessage = e => {
    if (e.data.type === 'clock-format') { useUTC = e.data.zulu; tick(); }
    if (e.data.type === 'theme') { applyTheme(e.data.themeClass); }
    if (e.data.type === 'deadlines') { deadlines.length = 0; e.data.list.forEach(d => deadlines.push(d)); tick(); }
  };
}

function applyTheme(cls) {
  const themes = ${JSON.stringify({
    '': _getThemeVars(''),
    'light-mode': _getThemeVars('light-mode'),
    'city-camo': _getThemeVars('city-camo'),
    'urban-camo': _getThemeVars('urban-camo'),
  })};
  const tv = themes[cls] || themes[''];
  const r = document.documentElement.style;
  r.setProperty('--bg', tv.bg); r.setProperty('--bg2', tv.bg2);
  r.setProperty('--bg3', tv.bg3); r.setProperty('--border', tv.border);
  r.setProperty('--accent', tv.accent); r.setProperty('--text', tv.text);
  r.setProperty('--text-dim', tv.textDim); r.setProperty('--text-bright', tv.textBright);
}

function drawAnalogClock(now) {
  const svg = document.getElementById('analogSvg');
  if (!svg) return;
  const cx = 100, cy = 100, r = 90;
  const h = useUTC ? now.getUTCHours() : now.getHours();
  const m = useUTC ? now.getUTCMinutes() : now.getMinutes();
  const s = useUTC ? now.getUTCSeconds() : now.getSeconds();
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4A90D9';
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#cfd8e3';
  const dimColor = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#7a8fa6';
  const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#2a3f56';
  let markup = '';
  // Face
  markup += '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+borderColor+'" stroke-width="2"/>';
  // Hour marks
  for (let i=0;i<12;i++) {
    const a = (i*30-90)*Math.PI/180;
    const x1 = cx+Math.cos(a)*(r-8), y1 = cy+Math.sin(a)*(r-8);
    const x2 = cx+Math.cos(a)*(r-2), y2 = cy+Math.sin(a)*(r-2);
    markup += '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+textColor+'" stroke-width="'+(i%3===0?2.5:1)+'"/>';
  }
  // Minute marks
  for (let i=0;i<60;i++) {
    if (i%5===0) continue;
    const a = (i*6-90)*Math.PI/180;
    const x1 = cx+Math.cos(a)*(r-4), y1 = cy+Math.sin(a)*(r-4);
    const x2 = cx+Math.cos(a)*(r-2), y2 = cy+Math.sin(a)*(r-2);
    markup += '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+dimColor+'" stroke-width="0.5"/>';
  }
  // Deadline markers (RED lines)
  deadlines.forEach(dl => {
    const dDate = new Date(dl.time);
    const dh = useUTC ? dDate.getUTCHours() : dDate.getHours();
    const dm = useUTC ? dDate.getUTCMinutes() : dDate.getMinutes();
    const angle = ((dh%12)*30 + dm*0.5 - 90) * Math.PI/180;
    const x1 = cx+Math.cos(angle)*(r-18), y1 = cy+Math.sin(angle)*(r-18);
    const x2 = cx+Math.cos(angle)*(r-1), y2 = cy+Math.sin(angle)*(r-1);
    markup += '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#E74C3C" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>';
    // Small red dot at outer end
    markup += '<circle cx="'+x2+'" cy="'+y2+'" r="3" fill="#E74C3C" opacity="0.85"/>';
  });
  // Hour hand
  const hAngle = ((h%12)*30 + m*0.5 - 90) * Math.PI/180;
  markup += '<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+Math.cos(hAngle)*55)+'" y2="'+(cy+Math.sin(hAngle)*55)+'" stroke="'+textColor+'" stroke-width="3.5" stroke-linecap="round"/>';
  // Minute hand
  const mAngle = (m*6 + s*0.1 - 90) * Math.PI/180;
  markup += '<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+Math.cos(mAngle)*72)+'" y2="'+(cy+Math.sin(mAngle)*72)+'" stroke="'+textColor+'" stroke-width="2" stroke-linecap="round"/>';
  // Second hand
  const sAngle = (s*6 - 90) * Math.PI/180;
  markup += '<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+Math.cos(sAngle)*78)+'" y2="'+(cy+Math.sin(sAngle)*78)+'" stroke="'+accentColor+'" stroke-width="1" stroke-linecap="round"/>';
  // Center dot
  markup += '<circle cx="'+cx+'" cy="'+cy+'" r="3" fill="'+accentColor+'"/>';
  svg.innerHTML = markup;
}

function tick() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  let timeStr, dateStr, tzLabel;
  const locale = navigator.language || 'en';
  if (useUTC) {
    timeStr = pad(now.getUTCHours())+pad(now.getUTCMinutes())+pad(now.getUTCSeconds())+'Z';
    dateStr = now.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    tzLabel = 'UTC/Z — click to switch';
  } else {
    timeStr = pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
    dateStr = now.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    try { tzLabel = now.toLocaleTimeString(locale,{timeZoneName:'short'}).split(' ').pop()+' — click to switch'; } catch { tzLabel = 'Local'; }
  }
  document.getElementById('dTime').textContent = timeStr;
  document.getElementById('dDate').textContent = dateStr;
  document.getElementById('dTZ').textContent = tzLabel;
  drawAnalogClock(now);
}
tick();
setInterval(tick, 1000);
<\/script></body></html>`;

  _detachedClockWin = window.open('', 'tidslinjal-clock', 'width=380,height=520,resizable=yes');
  if (_detachedClockWin) {
    _detachedClockWin.document.write(html);
    _detachedClockWin.document.close();
  }
}

function _getTodayDeadlines() {
  if (!state.events) return [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  return state.events
    .filter(ev => {
      if (ev.event_type !== 'deadline') return false;
      const t = new Date(ev.start_time);
      return t >= todayStart && t < todayEnd;
    })
    .map(ev => ({ time: ev.start_time, title: ev.title }));
}

// ── Detached Help Window ───────────────────────────────────────────────────
let _detachedHelpWin = null;

function openDetachedHelp() {
  if (_detachedHelpWin && !_detachedHelpWin.closed) { _detachedHelpWin.focus(); return; }
  const helpBody = document.querySelector('.help-body');
  if (!helpBody) return;
  const themeClass = _getThemeClass();
  const tv = _getThemeVars(themeClass);
  // Clone help content
  const helpHTML = helpBody.innerHTML;
  // Get the help-specific styles from the stylesheet
  const styleEl = document.querySelector('link[href*="style.css"]');
  const stylePath = styleEl ? styleEl.href : '/static/style.css';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal — Help</title>
<link rel="stylesheet" href="${stylePath}">
<style>
body{background:var(--bg);color:var(--text);padding:20px;overflow:auto;min-height:100vh}
.help-body{max-width:900px;margin:0 auto}
h2{color:var(--text-bright);font-size:20px;margin-bottom:16px}
</style></head><body class="${themeClass}">
<h2>Tidslinjal — Quick Reference Guide</h2>
<div class="help-body">${helpHTML}</div>
<script>
const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('tidslinjal-sync') : null;
if (channel) {
  channel.onmessage = e => {
    if (e.data.type === 'theme') {
      document.body.className = e.data.themeClass;
    }
  };
}
<\/script></body></html>`;

  _detachedHelpWin = window.open('', 'tidslinjal-help', 'width=800,height=700,resizable=yes');
  if (_detachedHelpWin) {
    _detachedHelpWin.document.write(html);
    _detachedHelpWin.document.close();
  }
  // Close the modal since we detached
  if (typeof closeModal === 'function') closeModal('helpModal');
}
