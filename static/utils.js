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
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  document.getElementById('clockTime').textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  document.getElementById('clockDate').textContent =
    now.toLocaleDateString(getLocale(), {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
