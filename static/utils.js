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
  const order = {read:0, reporter:1, readwrite:2, teammember:2, teamlead:3, oplead:4, staffofficer:4, staffofficer_full:4, admin:5};
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

// ── Detachable clock window ──────────────────────────────────────────────────
let _clockPopout = null;
let _clockPopoutMonitor = null;

// Show/hide the main window clock area when the popout is open/closed
function _setClockAreaDetached(detached) {
  const area = document.getElementById('clockArea');
  const indicator = document.getElementById('clockDetachedIndicator');
  if (area) area.style.display = detached ? 'none' : '';
  if (indicator) indicator.style.display = detached ? '' : 'none';
}

function detachClock() {
  if (_clockPopout && !_clockPopout.closed) {
    _clockPopout.focus();
    return;
  }

  // Hide the main header clock while the popout is open
  _setClockAreaDetached(true);

  const popupHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tidslinjal — Clocks</title>
<style>
/* ── Theme application ── */
body.theme-dark  { --bg:#1a1d23; --bg2:#22262e; --bg3:#2a2e38; --text:#e8eaf0; --text-dim:#9098b0; --accent:#4a9eff; --border:#2e3340; --danger:#e05252; }
body.theme-light { --bg:#f0f2f5; --bg2:#ffffff; --bg3:#e8eaf0; --text:#1a1d23; --text-dim:#666; --accent:#1a6ed8; --border:#d0d4de; --danger:#c0392b; }
body.theme-city-camo { --bg:#2b3325; --bg2:#333d2c; --bg3:#3a4532; --text:#d4dbc0; --text-dim:#8d9a78; --accent:#8fb85c; --border:#404d34; --danger:#e05252; }
body.theme-urban-camo { --bg:#212630; --bg2:#282e3a; --bg3:#2f3644; --text:#c8d0e0; --text-dim:#7a88a0; --accent:#5c8abf; --border:#333d50; --danger:#e05252; }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:var(--bg); color:var(--text); font-family:'Segoe UI',system-ui,sans-serif;
  display:flex; flex-direction:column; align-items:center; min-height:100vh; gap:16px; padding:16px; }
/* ── Toolbar ── */
.toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:var(--bg2);
  border:1px solid var(--border); border-radius:10px; padding:8px 14px; width:100%; max-width:600px; }
.toolbar label { font-size:11px; color:var(--text-dim); }
.toolbar select, .toolbar input[type=range] { background:var(--bg3); border:1px solid var(--border);
  border-radius:5px; color:var(--text); padding:3px 6px; font-size:11px; }
.toolbar input[type=range] { width:80px; cursor:pointer; }
.btn-tb { background:var(--bg3); border:1px solid var(--border); border-radius:5px; color:var(--text);
  padding:3px 10px; font-size:11px; cursor:pointer; }
.btn-tb:hover { background:var(--accent); color:#fff; border-color:var(--accent); }
.btn-tb.active { background:var(--accent); color:#fff; border-color:var(--accent); }
/* ── Clock cards ── */
.clocks-wrap { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; width:100%; max-width:800px; }
.clock-card { background:var(--bg2); border:1px solid var(--border); border-radius:12px;
  padding:16px 24px 14px; text-align:center; position:relative; min-width:180px; transition:box-shadow .2s; }
.clock-card:hover { box-shadow:0 0 0 2px var(--accent); }
.clock-label { font-size:11px; font-weight:700; color:var(--accent); letter-spacing:.1em;
  text-transform:uppercase; margin-bottom:6px; }
.clock-time { font-weight:700; letter-spacing:.04em; font-variant-numeric:tabular-nums; line-height:1.1; }
.clock-date { font-size:11px; color:var(--text-dim); margin-top:4px; }
.clock-tz { font-size:11px; font-weight:700; color:var(--accent); margin-top:2px; }
/* ── Size variants ── */
.sz-xs .clock-time { font-size:28px; } .sz-xs .clock-card { padding:10px 16px 8px; min-width:130px; }
.sz-sm .clock-time { font-size:38px; } .sz-sm .clock-card { padding:12px 20px 10px; min-width:160px; }
.sz-md .clock-time { font-size:52px; }
.sz-lg .clock-time { font-size:72px; } .sz-lg .clock-card { padding:20px 32px 18px; min-width:240px; }
.sz-xl .clock-time { font-size:96px; } .sz-xl .clock-card { padding:24px 40px 22px; min-width:300px; }
/* ── Analog clock ── */
.analog-wrap { width:120px; height:120px; margin:0 auto 4px; }
.analog-face { width:100%; height:100%; }
.sz-lg .analog-wrap { width:160px; height:160px; }
.sz-xl .analog-wrap { width:200px; height:200px; }
/* ── Remove button ── */
.clock-remove { position:absolute; top:6px; right:8px; background:none; border:none;
  color:var(--text-dim); font-size:15px; cursor:pointer; line-height:1; padding:2px 5px;
  border-radius:4px; }
.clock-remove:hover { background:var(--danger); color:#fff; }
/* ── Style: minimal ── */
.style-minimal .clock-card { background:transparent; border-color:transparent; box-shadow:none; }
.style-minimal .clock-card:hover { box-shadow:0 0 0 1px var(--border); }
/* ── Style: compact ── */
.style-compact .clock-card { padding:8px 14px 6px; min-width:120px; }
.style-compact .clock-time { font-size:28px!important; }
.style-compact .clock-label { font-size:10px; }
/* ── Header row ── */
.page-header { font-size:11px; color:var(--text-dim); letter-spacing:.12em; text-transform:uppercase; }
/* ── VCR mode ── */
.vcr-card { background:#050000 !important; border-color:#3a0000 !important; }
.vcr-time {
  color:#ff2200; text-shadow:0 0 8px rgba(255,40,0,.9),0 0 18px rgba(255,0,0,.5);
  font-family:'Courier New','Lucida Console',monospace; font-weight:bold; letter-spacing:.1em; }
.vcr-label { color:#880000 !important; }
.vcr-date  { color:#660000 !important; }
.vcr-tz    { color:#880000 !important; }
.vcr-colon { display:inline-block; animation:vcr-blink 1s step-start infinite; }
@keyframes vcr-blink { 50% { opacity:0; } }
</style>
</head>
<body class="theme-dark sz-md">
<p class="page-header">Tidslinjal — Clocks</p>
<div class="toolbar" id="toolbar">
  <label>Style</label>
  <select id="selStyle" onchange="applyStyle(this.value)">
    <option value="">Standard</option>
    <option value="style-minimal">Minimal</option>
    <option value="style-compact">Compact</option>
  </select>
  <label>Mode</label>
  <button class="btn-tb active" id="btnDigital" onclick="setMode('digital')">Digital</button>
  <button class="btn-tb" id="btnAnalog" onclick="setMode('analog')">Analog</button>
  <button class="btn-tb" id="btnVCR" onclick="setMode('vcr')">VCR</button>
  <label>Size</label>
  <input type="range" id="sizeSlider" min="0" max="4" value="2" step="1" oninput="applySize(this.value)" onchange="applySize(this.value)">
  <span id="sizeLbl" style="font-size:11px;color:var(--text-dim);min-width:18px">M</span>
</div>
<div class="clocks-wrap" id="clocksWrap"></div>
<script>
'use strict';
/* ── State ── */
let clockMode = 'digital'; // 'digital' | 'analog' | 'vcr'
const sizeClasses = ['sz-xs','sz-sm','sz-md','sz-lg','sz-xl'];
const sizeLabels  = ['XS','S','M','L','XL'];
let currentStyle = '';

function pad(n) { return String(n).padStart(2,'0'); }

/* ── Theme sync: read from opener every 2 s ── */
function syncTheme() {
  try {
    const t = window.opener?.state?.preferences?.theme || 'dark';
    const cls = 'theme-' + t;
    if (!document.body.classList.contains(cls)) {
      document.body.className = document.body.className
        .replace(/theme-\S+/g, '').trim() + ' ' + cls;
    }
  } catch(e) {}
}

/* ── Size ── */
function applySize(val) {
  const v = parseInt(val,10);
  document.body.className = document.body.className.replace(/sz-\S+/g,'').trim() + ' ' + sizeClasses[v];
  document.getElementById('sizeLbl').textContent = sizeLabels[v];
}

/* ── Clock style ── */
function applyStyle(cls) {
  const wrap = document.getElementById('clocksWrap');
  if (currentStyle) wrap.classList.remove(currentStyle);
  currentStyle = cls;
  if (cls) wrap.classList.add(cls);
}

/* ── Mode toggle ── */
function setMode(m) {
  clockMode = m;
  document.getElementById('btnDigital').classList.toggle('active', m==='digital');
  document.getElementById('btnAnalog').classList.toggle('active', m==='analog');
  document.getElementById('btnVCR').classList.toggle('active', m==='vcr');
  rebuildClocks();
}

/* ── SVG analog face builder ── */
function buildAnalogSVG(id) {
  const ticks = Array.from({length:60},(_,i)=>{
    const a = i*6-90, r1=i%5===0?38:42, r2=46;
    const [x1,y1] = [50+r1*Math.cos(a*Math.PI/180), 50+r1*Math.sin(a*Math.PI/180)];
    const [x2,y2] = [50+r2*Math.cos(a*Math.PI/180), 50+r2*Math.sin(a*Math.PI/180)];
    const w = i%5===0 ? 2 : 0.8;
    return \`<line x1="\${x1.toFixed(2)}" y1="\${y1.toFixed(2)}" x2="\${x2.toFixed(2)}" y2="\${y2.toFixed(2)}" stroke="currentColor" stroke-opacity=".5" stroke-width="\${w}"/>\`;
  }).join('');
  return \`<svg viewBox="0 0 100 100" class="analog-face" id="\${id}">
  <circle cx="50" cy="50" r="49" fill="var(--bg3)" stroke="var(--border)" stroke-width="1.5"/>
  \${ticks}
  <line id="\${id}-h"  x1="50" y1="50" x2="50" y2="22" stroke="var(--text)"   stroke-width="3.5" stroke-linecap="round"/>
  <line id="\${id}-m"  x1="50" y1="50" x2="50" y2="14" stroke="var(--text)"   stroke-width="2.5" stroke-linecap="round"/>
  <line id="\${id}-s"  x1="50" y1="50" x2="50" y2="10" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="50" cy="50" r="3" fill="var(--accent)"/>
</svg>\`;
}

function updateAnalog(svgId, h, m, s) {
  const hEl = document.getElementById(svgId+'-h');
  const mEl = document.getElementById(svgId+'-m');
  const sEl = document.getElementById(svgId+'-s');
  if (!hEl) return;
  const hDeg = (h%12)*30 + m*0.5 + s*(0.5/60) - 90;
  const mDeg = m*6 + s*0.1 - 90;
  const sDeg = s*6 - 90;
  const rot = (deg, x1,y1,x2,y2) => {
    const a=deg*Math.PI/180;
    const nx2 = 50+(x2-50)*Math.cos(a)-(y2-50)*Math.sin(a);
    const ny2 = 50+(x2-50)*Math.sin(a)+(y2-50)*Math.cos(a);
    return [nx2,ny2];
  };
  // Rotate hands using transform
  hEl.setAttribute('transform',\`rotate(\${hDeg+90},50,50)\`);
  mEl.setAttribute('transform',\`rotate(\${mDeg+90},50,50)\`);
  sEl.setAttribute('transform',\`rotate(\${sDeg+90},50,50)\`);
}

/* ── Read clock data from opener ── */
function getClockData() {
  try {
    const op = window.opener;
    const isUTC = op?._clockUTC || false;
    const extra = op?.state?.preferences?.extra_clocks || [];
    return { isUTC, extra };
  } catch(e) { return { isUTC:false, extra:[] }; }
}

/* ── Remove a clock by calling parent ── */
function removeClock(id) {
  try { window.opener?.removeExtraClock(id); } catch(e){}
  rebuildClocks();
}

/* ── Build / rebuild all clock cards ── */
let _lastClockCount = -1;
let _lastMode = '';
function rebuildClocks() {
  const {isUTC, extra} = getClockData();
  const total = 1 + extra.length;
  const wrap = document.getElementById('clocksWrap');
  if (!wrap) return;
  _lastClockCount = total;
  _lastMode = clockMode;
  let html = '';
  // Main clock
  if (clockMode === 'analog') {
    html += \`<div class="clock-card" id="card-main">
      <div class="clock-label" id="main-label">\${isUTC?'UTC/Z':'Local Time'}</div>
      <div class="analog-wrap">\${buildAnalogSVG('svg-main')}</div>
      <div class="clock-date" id="main-date"></div>
      <div class="clock-tz" id="main-tz"></div>
    </div>\`;
  } else if (clockMode === 'vcr') {
    html += \`<div class="clock-card vcr-card" id="card-main">
      <div class="clock-label vcr-label" id="main-label">\${isUTC?'UTC/Z':'LOCAL'}</div>
      <div class="clock-time vcr-time"><span id="vcr-main-h">--</span><span class="vcr-colon">:</span><span id="vcr-main-m">--</span><span class="vcr-colon">:</span><span id="vcr-main-s">--</span></div>
      <div class="clock-date vcr-date" id="main-date"></div>
      <div class="clock-tz vcr-tz" id="main-tz"></div>
    </div>\`;
  } else {
    html += \`<div class="clock-card" id="card-main">
      <div class="clock-label" id="main-label">\${isUTC?'UTC/Z':'Local Time'}</div>
      <div class="clock-time" id="main-time">--:--:--</div>
      <div class="clock-date" id="main-date"></div>
      <div class="clock-tz" id="main-tz"></div>
    </div>\`;
  }
  // Extra clocks
  extra.forEach(ec => {
    if (clockMode === 'analog') {
      html += \`<div class="clock-card" id="card-\${ec.id}">
        <button class="clock-remove" title="Remove this clock" onclick="removeClock(\${ec.id})">&times;</button>
        <div class="clock-label">\${escH(ec.label||ec.timezone)}</div>
        <div class="analog-wrap">\${buildAnalogSVG('svg-'+ec.id)}</div>
        <div class="clock-tz" id="ec-\${ec.id}-tz"></div>
      </div>\`;
    } else if (clockMode === 'vcr') {
      html += \`<div class="clock-card vcr-card" id="card-\${ec.id}">
        <button class="clock-remove" title="Remove this clock" onclick="removeClock(\${ec.id})">&times;</button>
        <div class="clock-label vcr-label">\${escH(ec.label||ec.timezone)}</div>
        <div class="clock-time vcr-time"><span id="vcr-ec-\${ec.id}-h">--</span><span class="vcr-colon">:</span><span id="vcr-ec-\${ec.id}-m">--</span><span class="vcr-colon">:</span><span id="vcr-ec-\${ec.id}-s">--</span></div>
        <div class="clock-tz vcr-tz" id="ec-\${ec.id}-tz"></div>
      </div>\`;
    } else {
      html += \`<div class="clock-card" id="card-\${ec.id}">
        <button class="clock-remove" title="Remove this clock" onclick="removeClock(\${ec.id})">&times;</button>
        <div class="clock-label">\${escH(ec.label||ec.timezone)}</div>
        <div class="clock-time" id="ec-\${ec.id}-time">--:--:--</div>
        <div class="clock-tz" id="ec-\${ec.id}-tz"></div>
      </div>\`;
    }
  });
  wrap.innerHTML = html;
}

function escH(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Main tick function ── */
function tick() {
  syncTheme();
  const {isUTC, extra} = getClockData();
  const now = new Date();

  // Detect if clock list changed or mode changed
  if (1 + extra.length !== _lastClockCount || clockMode !== _lastMode) {
    rebuildClocks();
  }

  // Update main clock label if UTC mode changed
  const lbl = document.getElementById('main-label');
  if (lbl) lbl.textContent = isUTC ? 'UTC/Z' : 'Local Time';

  let h, m, s, dateStr, tzLabel, timeStr;
  if (isUTC) {
    h=now.getUTCHours(); m=now.getUTCMinutes(); s=now.getUTCSeconds();
    timeStr = pad(h)+pad(m)+pad(s)+'Z';
    dateStr = now.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    tzLabel = 'UTC/Z';
  } else {
    h=now.getHours(); m=now.getMinutes(); s=now.getSeconds();
    timeStr = pad(h)+':'+pad(m)+':'+pad(s);
    dateStr = now.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    try { tzLabel=now.toLocaleTimeString(undefined,{timeZoneName:'short'}).split(' ').pop(); } catch{tzLabel='';}
  }

  if (clockMode === 'analog') {
    updateAnalog('svg-main', h, m, s);
  } else if (clockMode === 'vcr') {
    const vh=document.getElementById('vcr-main-h'); if(vh)vh.textContent=pad(h);
    const vm=document.getElementById('vcr-main-m'); if(vm)vm.textContent=pad(m);
    const vs=document.getElementById('vcr-main-s'); if(vs)vs.textContent=pad(s);
  } else {
    const t=document.getElementById('main-time'); if(t)t.textContent=timeStr;
  }
  const d=document.getElementById('main-date'); if(d)d.textContent=dateStr;
  const z=document.getElementById('main-tz');   if(z)z.textContent=tzLabel;

  // Extra clocks
  extra.forEach(ec => {
    try {
      const ecTime = new Date();
      const ecH = parseInt(ecTime.toLocaleTimeString('en-GB',{hour:'2-digit',hour12:false,timeZone:ec.timezone}),10)||0;
      const ecM = parseInt(ecTime.toLocaleTimeString('en-GB',{minute:'2-digit',hour12:false,timeZone:ec.timezone}),10)||0;
      const ecS = parseInt(ecTime.toLocaleTimeString('en-GB',{second:'2-digit',hour12:false,timeZone:ec.timezone}),10)||0;
      const ecTStr = ecTime.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:ec.timezone});
      const ecTZ = ecTime.toLocaleTimeString('en-GB',{timeZoneName:'short',timeZone:ec.timezone}).split(' ').pop()||ec.timezone;
      if (clockMode === 'analog') {
        updateAnalog('svg-'+ec.id, ecH, ecM, ecS);
      } else if (clockMode === 'vcr') {
        const vh=document.getElementById('vcr-ec-'+ec.id+'-h'); if(vh)vh.textContent=pad(ecH);
        const vm=document.getElementById('vcr-ec-'+ec.id+'-m'); if(vm)vm.textContent=pad(ecM);
        const vs=document.getElementById('vcr-ec-'+ec.id+'-s'); if(vs)vs.textContent=pad(ecS);
      } else {
        const t=document.getElementById('ec-'+ec.id+'-time'); if(t)t.textContent=ecTStr;
      }
      const z=document.getElementById('ec-'+ec.id+'-tz'); if(z)z.textContent=ecTZ;
    } catch(e) {
      const t=document.getElementById('ec-'+ec.id+'-time'); if(t)t.textContent='??:??:??';
    }
  });
}

// Initial build + start ticking
rebuildClocks();
applySize(2);
tick();
setInterval(tick, 1000);
<\/script>
</body>
</html>`;

  const w = Math.min(window.screen.availWidth, 720);
  const extraClocks = (state.preferences && state.preferences.extra_clocks) || [];
  const h = Math.min(window.screen.availHeight - 100, Math.max(340, 220 + extraClocks.length * 160));
  _clockPopout = window.open('', 'tidslinjal-clocks',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (_clockPopout) {
    _clockPopout.document.open();
    _clockPopout.document.write(popupHTML);
    _clockPopout.document.close();
  }

  // Poll for popout closure so we can restore the main clock display
  if (_clockPopoutMonitor) clearInterval(_clockPopoutMonitor);
  _clockPopoutMonitor = setInterval(() => {
    if (!_clockPopout || _clockPopout.closed) {
      clearInterval(_clockPopoutMonitor);
      _clockPopoutMonitor = null;
      _clockPopout = null;
      _setClockAreaDetached(false);
    }
  }, 800);
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

// ── Detachable help window ──────────────────────────────────────────────────
let _helpPopout = null;
let _helpPopoutMonitor = null;

function detachHelp() {
  if (_helpPopout && !_helpPopout.closed) {
    _helpPopout.focus();
    closeModal('helpModal');
    return;
  }
  const theme = (state.preferences && state.preferences.theme) || 'dark';
  // Grab the full help content from the current modal
  const helpBody = document.querySelector('#helpModal .modal-body');
  const helpContent = helpBody ? helpBody.innerHTML : '<p>Help unavailable</p>';
  const helpStyles = Array.from(document.styleSheets)
    .map(s => { try { return s.href || ''; } catch { return ''; } })
    .filter(h => h && h.includes('style'))
    .map(h => `<link rel="stylesheet" href="${h}">`)
    .join('\n');

  const popupHTML = `<!DOCTYPE html>
<html lang="en" data-theme="${escHtml(theme)}" data-size="normal">
<head>
<meta charset="UTF-8">
<title>Tidslinjal — Help</title>
<link rel="stylesheet" href="/static/style.css">
<style>
  body { margin:0; padding:0; overflow:hidden; }
  .help-window-wrap { display:flex; flex-direction:column; height:100vh; background:var(--bg); color:var(--text); }
  .help-win-header { display:flex; align-items:center; gap:10px; padding:10px 16px; background:var(--bg2); border-bottom:1px solid var(--border); flex-shrink:0; }
  .help-win-title { font-weight:700; font-size:14px; color:var(--text-bright,var(--text)); flex:1; }
  .help-win-search { flex:1; max-width:320px; background:var(--bg3,var(--bg)); border:1px solid var(--border); border-radius:5px; color:var(--text); padding:5px 9px; font-size:12px; }
  .help-body { display:flex; gap:0; flex:1; overflow:hidden; }
  .help-toc { width:200px; flex-shrink:0; overflow-y:auto; padding:12px 8px; border-right:1px solid var(--border); font-size:12px; }
  .help-toc-link { display:block; padding:4px 8px; border-radius:5px; color:var(--text-dim,#888); text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .help-toc-link:hover { background:var(--bg3,#333); color:var(--text); }
  .help-content { flex:1; overflow-y:auto; padding:16px 20px; }
  .help-section { display:flex; gap:14px; padding:14px 0; border-bottom:1px solid var(--border); }
  .help-section.hidden { display:none; }
  .help-section-icon { font-size:28px; flex-shrink:0; width:36px; text-align:center; }
  .help-section-body { flex:1; min-width:0; }
  .help-section-body h3 { font-size:14px; font-weight:700; margin-bottom:6px; color:var(--text-bright,var(--text)); }
  .help-section-body h4 { font-size:12px; font-weight:600; margin:8px 0 4px; }
  .help-section-body p { font-size:12px; line-height:1.5; margin-bottom:6px; }
  .help-section-body ul, .help-section-body ol { font-size:12px; padding-left:18px; margin-bottom:6px; }
  .help-section-body li { margin-bottom:3px; line-height:1.5; }
  .help-list { padding-left:16px; }
  .help-table { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:6px; }
  .help-table th { text-align:left; font-weight:600; padding:4px 6px; border-bottom:1px solid var(--border); color:var(--accent); }
  .help-table td { padding:4px 6px; border-bottom:1px solid var(--border,#333); vertical-align:top; }
  .help-kbd { display:inline-block; background:var(--bg3,#444); border:1px solid var(--border,#555); border-radius:3px; padding:1px 5px; font-size:10px; font-family:monospace; }
  .help-badge { background:var(--bg3,#333); border-radius:3px; padding:1px 4px; font-size:10px; }
  mark { background:rgba(255,200,0,.35); border-radius:2px; padding:0 2px; }
  .role-badge { font-size:10px; padding:1px 6px; border-radius:3px; font-weight:600; }
  code { background:var(--bg3,#333); padding:1px 4px; border-radius:3px; font-size:11px; font-family:monospace; }
</style>
</head>
<body>
<div class="help-window-wrap">
  <div class="help-win-header">
    <span class="help-win-title">Tidslinjal — Help</span>
    <input type="search" class="help-win-search" id="helpWinSearch" placeholder="Search…" oninput="filterHelpWin(this.value)" autocomplete="off">
    <span id="helpWinStatus" style="font-size:11px;color:var(--text-dim,#888);min-width:60px"></span>
  </div>
  <div class="help-body">${helpContent}</div>
</div>
<script>
'use strict';
// Sync theme from opener
function syncTheme() {
  try {
    const t = window.opener?.state?.preferences?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
}
syncTheme();
setInterval(syncTheme, 2000);

function filterHelpWin(q) {
  const sections = document.querySelectorAll('.help-section');
  const status = document.getElementById('helpWinStatus');
  if (!q.trim()) {
    sections.forEach(s => { s.classList.remove('hidden'); clearMarks(s); });
    if (status) status.textContent = '';
    return;
  }
  const lq = q.toLowerCase();
  let shown = 0;
  sections.forEach(s => {
    const text = s.textContent.toLowerCase();
    if (text.includes(lq)) {
      s.classList.remove('hidden');
      highlightMarks(s, q);
      shown++;
    } else {
      s.classList.add('hidden');
      clearMarks(s);
    }
  });
  if (status) status.textContent = shown + ' section' + (shown===1?'':'s');
}

function clearMarks(el) {
  el.querySelectorAll('mark').forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
}

function highlightMarks(el, q) {
  clearMarks(el);
  const lq = q.toLowerCase();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(node => {
    const idx = node.nodeValue.toLowerCase().indexOf(lq);
    if (idx < 0) return;
    const before = document.createTextNode(node.nodeValue.slice(0, idx));
    const mark   = document.createElement('mark');
    mark.textContent = node.nodeValue.slice(idx, idx + q.length);
    const after  = document.createTextNode(node.nodeValue.slice(idx + q.length));
    const parent = node.parentNode;
    parent.insertBefore(before, node);
    parent.insertBefore(mark, node);
    parent.insertBefore(after, node);
    parent.removeChild(node);
  });
}
<\/script>
</body>
</html>`;

  const w = Math.min(window.screen.availWidth - 100, 1000);
  const h = Math.min(window.screen.availHeight - 80, 800);
  _helpPopout = window.open('', 'tidslinjal-help',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (_helpPopout) {
    _helpPopout.document.open();
    _helpPopout.document.write(popupHTML);
    _helpPopout.document.close();
    closeModal('helpModal');
  }

  if (_helpPopoutMonitor) clearInterval(_helpPopoutMonitor);
  _helpPopoutMonitor = setInterval(() => {
    if (!_helpPopout || _helpPopout.closed) {
      clearInterval(_helpPopoutMonitor);
      _helpPopoutMonitor = null;
      _helpPopout = null;
    }
  }, 1000);
}

// ── Help search (in-modal) ──────────────────────────────────────────────────
function filterHelp(q) {
  const sections = document.querySelectorAll('#helpModal .help-section');
  const status = document.getElementById('helpSearchStatus');
  if (!q || !q.trim()) {
    sections.forEach(s => { s.style.display = ''; _clearHelpMarks(s); });
    if (status) status.textContent = '';
    return;
  }
  const lq = q.toLowerCase();
  let shown = 0;
  sections.forEach(s => {
    const text = s.textContent.toLowerCase();
    if (text.includes(lq)) {
      s.style.display = '';
      _highlightHelpMarks(s, q);
      shown++;
    } else {
      s.style.display = 'none';
      _clearHelpMarks(s);
    }
  });
  if (status) status.textContent = shown + ' section' + (shown===1?'':'s') + ' match';
}

function _clearHelpMarks(el) {
  el.querySelectorAll('mark.help-highlight').forEach(m => {
    const p = m.parentNode;
    p.replaceChild(document.createTextNode(m.textContent), m);
    p.normalize();
  });
}

function _highlightHelpMarks(el, q) {
  _clearHelpMarks(el);
  const lq = q.toLowerCase();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(node => {
    const idx = node.nodeValue.toLowerCase().indexOf(lq);
    if (idx < 0 || node.parentElement?.tagName === 'SCRIPT' || node.parentElement?.tagName === 'STYLE') return;
    const before = document.createTextNode(node.nodeValue.slice(0, idx));
    const mark   = document.createElement('mark');
    mark.className = 'help-highlight';
    mark.textContent = node.nodeValue.slice(idx, idx + q.length);
    const after  = document.createTextNode(node.nodeValue.slice(idx + q.length));
    const parent = node.parentNode;
    parent.insertBefore(before, node);
    parent.insertBefore(mark, node);
    parent.insertBefore(after, node);
    parent.removeChild(node);
  });
}
