/* ============================================================
   Tidslinjal — Utilities
   Pure helper functions: dates, slots, ranges, DOM, security.
   No dependencies on state or api.
   ============================================================ */
'use strict';

// ── Error display ───────────────────────────────────────────────────────────
function showError(msg, title) {
  // If a detached popout window is active, show error there via alert
  const popouts = [
    typeof _boardPopout !== 'undefined' ? _boardPopout : null,
    typeof _staffPopout !== 'undefined' ? _staffPopout : null,
    typeof _teamleadPopout !== 'undefined' ? _teamleadPopout : null,
  ].filter(p => p && !p.closed);
  for (const p of popouts) {
    try { if (p.document && p.document.hasFocus()) { p.alert((title ? title + ': ' : '') + msg); return; } } catch {}
  }
  const modal = document.getElementById('errorModal');
  if (!modal) { alert(msg); return; }
  document.getElementById('errorModalTitle').textContent = title || 'Error';
  document.getElementById('errorModalMsg').textContent  = msg;
  // Move error modal to end of body so it stacks above dynamically created modals
  document.body.appendChild(modal);
  openModal('errorModal');
}

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
function _is12h() {
  return state && state.preferences && state.preferences.time_format === '12h';
}

// Format a date as DTG: DDHHMMZmmmYY (e.g. "141830ZMAR26")
function fmtDTG(d) {
  if (!d) return '';
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const pad = n => String(n).padStart(2,'0');
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const mon = months[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}${hh}${mm}Z${mon}${yy}`;
}

function _getTimeSeparator() {
  return (state?.preferences?.time_separator === 'dot') ? '.' : ':';
}
function _applyTimeSep(str) {
  if (_getTimeSeparator() === '.') return str.replace(/:/g, '.');
  return str;
}
function fmtTime(d) {
  const fmt = state?.preferences?.date_format;
  if (fmt === 'dtg') return fmtDTG(d).slice(2, 7) + 'Z';
  return _applyTimeSep(d.toLocaleTimeString(getLocale(), {hour:'2-digit', minute:'2-digit', hour12:_is12h()}));
}
function fmtDateTime(d) {
  const fmt = state?.preferences?.date_format;
  if (fmt === 'dtg') return fmtDTG(d);
  return _applyTimeSep(d.toLocaleString(getLocale(), {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:_is12h()}));
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
  const all = Array.from({length:n}, (_, i) => addDays(state.startDate, i));
  if (state.exercise && state.exercise.include_weekends === false) {
    return all.filter(d => { const dow = d.getDay(); return dow !== 0 && dow !== 6; });
  }
  return all;
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
  const spacing = (state.preferences && state.preferences.view_spacing) || 1;
  return Math.max(6, Math.round(h * (state.zoomFactor || 1.0) * spacing));
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
function _fmt24or12(h, m) {
  if (_is12h()) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  }
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function slotLabel(slotIdx) {
  if (state.resolution === 'day') return '';
  const minutes = slotIdx * getSlotMinutes();
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  if (state.resolution === 'hour') return _fmt24or12(h, 0);
  if (m === 0) return _fmt24or12(h, 0);
  if (state.resolution === 'quarter' && m === 30) return _fmt24or12(h, 30);
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
// Escape for use inside single-quoted HTML attributes (JSON.stringify output)
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Role check ──────────────────────────────────────────────────────────────
function hasRole2(userRole, required) {
  const order = {read:0, reporter:1, readwrite:2, teammember:2, teamlead:3, deputy_teamlead:3, oplead:4, deputy_oplead:4, staffofficer:4, staff_assistant:4, staffofficer_full:4, developer:5, admin:5};
  return (order[userRole]||0) >= (order[required]||0);
}

// Check if the current user has a named capability via role config override
function userHasCapability(cap) {
  if (!state.user) return false;
  if (state.user.role === 'admin' || state.user.role === 'developer') return true;
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
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  el.removeAttribute('inert');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  // Focus first focusable element inside the modal
  requestAnimationFrame(() => {
    const modal = el.querySelector('.modal');
    if (!modal) return;
    const focusable = modal.querySelector('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  });
  // Announce modal to screen readers
  a11yAnnounce('Dialog opened');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('inert', '');
  a11yAnnounce('Dialog closed');
}

// Focus trap: keep Tab within open modals
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const openOverlays = [...document.querySelectorAll('.modal-overlay.open')];
  if (!openOverlays.length) return;
  const topModal = openOverlays[openOverlays.length - 1].querySelector('.modal');
  if (!topModal) return;
  const focusable = topModal.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// ── Accessibility announcer ────────────────────────────────────────────────
function a11yAnnounce(message) {
  const el = document.getElementById('a11y-announcer');
  if (!el) return;
  // Only announce if screen reader mode is enabled
  if (!(state && state.preferences && state.preferences.a11y_screen_reader)) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = message; });
}

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
  if (!area) return; // Safety: no notification area in detached/popup windows
  const el   = document.createElement('div');
  el.className = `notification${type==='alarm'?' alarm':''}${type==='warning'?' warning':''}`;
  const title  = type==='alarm' ? t('notif_alarm_title') : type==='warning' ? 'Warning' : t('notif_done');
  el.innerHTML = `
    <button class="notification-close">&times;</button>
    <div class="notification-title">${title}</div>
    <div class="notification-msg">${escHtml(message)}</div>
  `;
  el.querySelector('.notification-close').addEventListener('click', () => el.remove());
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
  try {
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
      const timeSep = (state?.preferences?.time_separator === 'dot') ? '.' : ':';
      if (_is12h()) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        timeStr = `${pad(h12)}${timeSep}${pad(m)}${timeSep}${pad(s)} ${ampm}`;
      } else {
        timeStr = `${pad(h)}${timeSep}${pad(m)}${timeSep}${pad(s)}`;
      }
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
  } catch (e) {
    // Prevent exceptions from killing the setInterval
    console.warn('[updateClock]', e);
  }
}

// ── Timezone → country flag mapping ─────────────────────────────────────────
const _tzCountryFlags = {
  'Europe/London':'🇬🇧','Europe/Dublin':'🇮🇪','Europe/Paris':'🇫🇷','Europe/Berlin':'🇩🇪',
  'Europe/Brussels':'🇧🇪','Europe/Amsterdam':'🇳🇱','Europe/Rome':'🇮🇹','Europe/Madrid':'🇪🇸',
  'Europe/Lisbon':'🇵🇹','Europe/Zurich':'🇨🇭','Europe/Vienna':'🇦🇹','Europe/Stockholm':'🇸🇪',
  'Europe/Oslo':'🇳🇴','Europe/Copenhagen':'🇩🇰','Europe/Helsinki':'🇫🇮','Europe/Warsaw':'🇵🇱',
  'Europe/Prague':'🇨🇿','Europe/Budapest':'🇭🇺','Europe/Bucharest':'🇷🇴','Europe/Sofia':'🇧🇬',
  'Europe/Athens':'🇬🇷','Europe/Istanbul':'🇹🇷','Europe/Moscow':'🇷🇺','Europe/Kiev':'🇺🇦',
  'Europe/Kyiv':'🇺🇦','Europe/Tallinn':'🇪🇪','Europe/Riga':'🇱🇻','Europe/Vilnius':'🇱🇹',
  'Europe/Belgrade':'🇷🇸','Europe/Zagreb':'🇭🇷','Europe/Ljubljana':'🇸🇮','Europe/Bratislava':'🇸🇰',
  'Europe/Luxembourg':'🇱🇺','Europe/Malta':'🇲🇹','Europe/Andorra':'🇦🇩','Europe/Monaco':'🇲🇨',
  'Europe/Sarajevo':'🇧🇦','Europe/Skopje':'🇲🇰','Europe/Podgorica':'🇲🇪','Europe/Tirane':'🇦🇱',
  'Europe/Minsk':'🇧🇾','Europe/Chisinau':'🇲🇩','Europe/Reykjavik':'🇮🇸',
  'America/New_York':'🇺🇸','America/Chicago':'🇺🇸','America/Denver':'🇺🇸','America/Los_Angeles':'🇺🇸',
  'America/Anchorage':'🇺🇸','Pacific/Honolulu':'🇺🇸','America/Phoenix':'🇺🇸',
  'America/Toronto':'🇨🇦','America/Vancouver':'🇨🇦','America/Montreal':'🇨🇦','America/Edmonton':'🇨🇦',
  'America/Winnipeg':'🇨🇦','America/Halifax':'🇨🇦','America/St_Johns':'🇨🇦',
  'America/Mexico_City':'🇲🇽','America/Cancun':'🇲🇽','America/Tijuana':'🇲🇽',
  'America/Sao_Paulo':'🇧🇷','America/Argentina/Buenos_Aires':'🇦🇷','America/Santiago':'🇨🇱',
  'America/Bogota':'🇨🇴','America/Lima':'🇵🇪','America/Caracas':'🇻🇪',
  'Asia/Tokyo':'🇯🇵','Asia/Seoul':'🇰🇷','Asia/Shanghai':'🇨🇳','Asia/Hong_Kong':'🇭🇰',
  'Asia/Taipei':'🇹🇼','Asia/Singapore':'🇸🇬','Asia/Bangkok':'🇹🇭','Asia/Jakarta':'🇮🇩',
  'Asia/Manila':'🇵🇭','Asia/Kuala_Lumpur':'🇲🇾','Asia/Ho_Chi_Minh':'🇻🇳','Asia/Saigon':'🇻🇳',
  'Asia/Kolkata':'🇮🇳','Asia/Calcutta':'🇮🇳','Asia/Karachi':'🇵🇰','Asia/Dhaka':'🇧🇩',
  'Asia/Colombo':'🇱🇰','Asia/Kathmandu':'🇳🇵','Asia/Yangon':'🇲🇲',
  'Asia/Dubai':'🇦🇪','Asia/Riyadh':'🇸🇦','Asia/Qatar':'🇶🇦','Asia/Bahrain':'🇧🇭',
  'Asia/Kuwait':'🇰🇼','Asia/Muscat':'🇴🇲','Asia/Tehran':'🇮🇷','Asia/Baghdad':'🇮🇶',
  'Asia/Jerusalem':'🇮🇱','Asia/Tel_Aviv':'🇮🇱','Asia/Beirut':'🇱🇧','Asia/Amman':'🇯🇴',
  'Asia/Almaty':'🇰🇿','Asia/Tashkent':'🇺🇿','Asia/Tbilisi':'🇬🇪','Asia/Baku':'🇦🇿',
  'Asia/Yerevan':'🇦🇲','Asia/Kabul':'🇦🇫','Asia/Ulaanbaatar':'🇲🇳',
  'Africa/Cairo':'🇪🇬','Africa/Lagos':'🇳🇬','Africa/Johannesburg':'🇿🇦','Africa/Nairobi':'🇰🇪',
  'Africa/Casablanca':'🇲🇦','Africa/Tunis':'🇹🇳','Africa/Algiers':'🇩🇿','Africa/Accra':'🇬🇭',
  'Africa/Addis_Ababa':'🇪🇹','Africa/Dar_es_Salaam':'🇹🇿','Africa/Kampala':'🇺🇬',
  'Australia/Sydney':'🇦🇺','Australia/Melbourne':'🇦🇺','Australia/Brisbane':'🇦🇺',
  'Australia/Perth':'🇦🇺','Australia/Adelaide':'🇦🇺','Australia/Darwin':'🇦🇺',
  'Pacific/Auckland':'🇳🇿','Pacific/Fiji':'🇫🇯','Pacific/Guam':'🇬🇺',
  'Atlantic/Reykjavik':'🇮🇸','Atlantic/Canary':'🇪🇸','Indian/Maldives':'🇲🇻',
  'Indian/Mauritius':'🇲🇺',
};

function _getClockFlag(tz) {
  if (!tz) return '';
  if (_tzCountryFlags[tz]) return _tzCountryFlags[tz];
  // Try matching by region prefix (e.g. America/Indiana/Indianapolis → US)
  const parts = tz.split('/');
  if (parts[0] === 'America' && (tz.includes('Indiana') || tz.includes('Kentucky') || tz.includes('North_Dakota'))) return '🇺🇸';
  if (parts[0] === 'Australia') return '🇦🇺';
  return '';
}

// ── Extra timezone clocks ───────────────────────────────────────────────────
let _lastClockFlagState = null;
function updateExtraClocks(now) {
  const clocks = (state.preferences && state.preferences.extra_clocks) || [];
  const container = document.getElementById('extraClocksContainer');
  if (!container) return;
  // If flag setting changed, rebuild all clock widgets
  const curFlagState = !!(state.preferences && state.preferences.show_clock_flags);
  if (_lastClockFlagState !== null && _lastClockFlagState !== curFlagState) {
    container.querySelectorAll('.clock-extra').forEach(el => el.remove());
  }
  _lastClockFlagState = curFlagState;
  // Create/update one widget per configured extra clock
  clocks.forEach(ec => {
    const id = `extra-clock-${ec.id}`;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'clock-extra';
      const showFlags = state.preferences && state.preferences.show_clock_flags;
      const flag = showFlags ? _getClockFlag(ec.timezone) : '';
      el.innerHTML = `
        <div class="clock-extra-inner">
          <div class="clock-extra-label">${flag ? '<span class="clock-flag">' + flag + '</span> ' : ''}${escHtml(ec.label)}</div>
          <div class="clock-extra-time" id="${id}-time">--:--:--</div>
          <div class="clock-extra-tz" id="${id}-tz"></div>
        </div>
        <button class="clock-extra-remove" title="${escHtml(t('clock_remove'))}" data-remove-clock="${ec.id}">×</button>`;
      el.querySelector('[data-remove-clock]').addEventListener('click', () => removeExtraClock(ec.id));
      container.appendChild(el);
    }
    const n = now || new Date();
    const pad = x => String(x).padStart(2,'0');
    try {
      const rawTime = n.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone: ec.timezone});
      const sep = _getTimeSeparator();
      const timeStr = sep === '.' ? rawTime.replace(/:/g, '.') : rawTime;
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

  const w = Math.min(window.screen.availWidth, 720);
  const extraClocks = (state.preferences && state.preferences.extra_clocks) || [];
  const h = Math.min(window.screen.availHeight - 100, Math.max(340, 220 + extraClocks.length * 160));
  _clockPopout = window.open('/static/clocks-popup.html?v=' + Date.now(), 'tidslinjal-clocks',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);

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

// Auto-open clock popup for approaching timed events
setInterval(() => {
  if (_clockPopout && !_clockPopout.closed) return; // already open
  if (!window.state || !window.state.events) return;
  const now = Date.now();
  const hasApproaching = window.state.events.some(ev => {
    if (ev.event_type !== 'timed_event' || !ev.timed_duration_minutes || !ev.start_time) return false;
    const start = new Date(ev.start_time).getTime();
    const preShow = (ev.timed_pre_show_minutes || 5) * 60000;
    return now >= start - preShow && now <= start + ev.timed_duration_minutes * 60000;
  });
  if (hasApproaching) detachClock();
}, 10000);

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
      style="padding:5px 10px;cursor:pointer;font-size:var(--fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
      <span style="color:var(--text)">${c.label}</span>
      ${c.label !== c.tz ? `<span style="opacity:.5;font-size:var(--fs-xs);margin-left:6px">${c.tz}</span>` : ''}
    </div>`
  ).join('');
  box.querySelectorAll('.tz-suggestion').forEach(el => {
    el.addEventListener('mousedown', () => selectTzSuggestion(el));
    el.addEventListener('mouseenter', () => highlightTzSuggestion(parseInt(el.dataset.idx, 10)));
  });
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
  const lang  = (state.preferences && state.preferences.language) || 'en';
  const themeClass = theme === 'light' ? ' class="light-mode"' : theme === 'city-camo' ? ' class="city-camo"' : theme === 'urban-camo' ? ' class="urban-camo"' : '';
  // Grab the full help content from the current modal
  const helpBody = document.querySelector('#helpModal .modal-body');
  const helpContent = helpBody ? helpBody.innerHTML : '<p>' + escHtml(t('help_unavailable')) + '</p>';
  const helpStyles = Array.from(document.styleSheets)
    .map(s => { try { return s.href || ''; } catch { return ''; } })
    .filter(h => h && h.includes('style'))
    .map(h => `<link rel="stylesheet" href="${h}">`)
    .join('\n');

  const popupHTML = `<!DOCTYPE html>
<html lang="${escHtml(lang)}" data-theme="${escHtml(theme)}" data-size="normal">
<head>
<meta charset="UTF-8">
<title>Tidslinjal — ${escHtml(t('help_title'))}</title>
<link rel="icon" href="/static/favicon.ico" sizes="16x16" type="image/x-icon">
<link rel="icon" href="/static/favicon-32.png" sizes="32x32" type="image/png">
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
<body${themeClass}>
<div class="help-window-wrap">
  <div class="help-win-header">
    <span class="help-win-title">Tidslinjal — ${escHtml(t('help_title'))}</span>
    <input type="search" class="help-win-search" id="helpWinSearch" placeholder="${escHtml(t('help_search'))}" autocomplete="off">
    <span id="helpWinStatus" style="font-size:11px;color:var(--text-dim,#888);min-width:60px"></span>
  </div>
  <div class="help-body">${helpContent}</div>
</div>
<script src="/static/help-popup.js"><\/script>
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
