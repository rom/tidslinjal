'use strict';

/* ── Seven-segment digit builder ── */
// Segment map: which segments are ON for each digit (a,b,c,d,e,f,g)
const SEG_MAP = {
  '0':[1,1,1,1,1,1,0], '1':[0,1,1,0,0,0,0], '2':[1,1,0,1,1,0,1],
  '3':[1,1,1,1,0,0,1], '4':[0,1,1,0,0,1,1], '5':[1,0,1,1,0,1,1],
  '6':[1,0,1,1,1,1,1], '7':[1,1,1,0,0,0,0], '8':[1,1,1,1,1,1,1],
  '9':[1,1,1,1,0,1,1], '-':[0,0,0,0,0,0,1],
  'A':[1,1,1,0,1,1,1], 'B':[0,0,1,1,1,1,1], 'C':[1,0,0,1,1,1,0],
  'D':[0,1,1,1,1,0,1], 'E':[1,0,0,1,1,1,1], 'F':[1,0,0,0,1,1,1],
  'G':[1,0,1,1,1,1,0], 'H':[0,1,1,0,1,1,1], 'I':[0,0,1,0,1,0,0],
  'J':[0,1,1,1,0,0,0], 'K':[0,1,1,0,1,1,1], 'L':[0,0,0,1,1,1,0],
  'M':[1,1,1,0,1,1,0], 'N':[0,0,1,0,1,0,1], 'O':[1,1,1,1,1,1,0],
  'P':[1,1,0,0,1,1,1], 'Q':[1,1,1,0,0,1,1], 'R':[0,0,0,0,1,0,1],
  'S':[1,0,1,1,0,1,1], 'T':[0,0,0,1,1,1,1], 'U':[0,1,1,1,1,1,0],
  'V':[0,1,1,1,1,1,0], 'W':[0,1,1,1,1,1,0], 'X':[0,1,1,0,1,1,1],
  'Y':[0,1,1,1,0,1,1], 'Z':[1,1,0,1,1,0,1],
  ' ':[0,0,0,0,0,0,0], '/':[0,1,0,0,1,0,1], '.':[0,0,0,1,0,0,0],
  ',':[0,0,0,1,0,0,0], ':':[0,0,0,0,0,0,0], '+':[0,0,0,0,0,0,1]
};

function buildSeg7(val) {
  const segs = SEG_MAP[val] || [0,0,0,0,0,0,0];
  const segNames = ['sa h','sb v','sc v','sd h','se v','sf v','sg h'];
  return `<span class="seg7">${segNames.map((cls,i) =>
    `<i class="${cls}${segs[i]?'':' off'}"></i>`
  ).join('')}</span>`;
}

function buildSeg7Time(h, m, s) {
  const p = v => String(v).padStart(2,'0');
  const hh=p(h), mm=p(m), ss=p(s);
  return `<span class="seg7-display">${buildSeg7(hh[0])}${buildSeg7(hh[1])}<span class="seg7-colon"><i></i><i></i></span>${buildSeg7(mm[0])}${buildSeg7(mm[1])}<span class="seg7-colon"><i></i><i></i></span>${buildSeg7(ss[0])}${buildSeg7(ss[1])}</span>`;
}

function buildSeg7Text(str) {
  const chars = String(str).toUpperCase().split('');
  return `<span class="seg7-display seg7-text">${chars.map(c => {
    if (c === ' ') return '<span class="seg7-space"></span>';
    return buildSeg7(c);
  }).join('')}</span>`;
}

/* ── State ── */
let clockMode = 'digital'; // 'digital' | 'analog' | 'vcr'
const sizeClasses = ['sz-xs','sz-sm','sz-md','sz-lg','sz-xl','sz-xxl'];
const sizeLabels  = ['XS','S','M','L','XL','XXL'];
let currentStyle = '';
let showDigits = true;
let vcrColor = 'red';
let _lastLang = '';
let _localIsUTC = null; // null = follow opener, true/false = local override
let _hourFormat = '24'; // '24' | '12'
let _timeSep = ':';     // ':' | '.'
let _showSynthClock = false; // synthetic exercise clock toggle

function pad(n) { return String(n).padStart(2,'0'); }

/* ── Artificial time offset: read from opener's state ── */
function _getEffectiveNow() {
  try {
    const ex = window.opener?.state?.exercise;
    if (ex && ex.artificial_time_enabled && ex.artificial_time && ex.artificial_time_set_at) {
      const artTime = new Date(ex.artificial_time).getTime();
      const setAt   = new Date(ex.artificial_time_set_at).getTime();
      if (!isNaN(artTime) && !isNaN(setAt)) {
        return new Date(Date.now() + (artTime - setAt));
      }
    }
  } catch(e) {}
  return new Date();
}

/* ── i18n: read translations from opener ── */
function _t(key) {
  try {
    const lang = window.opener?.state?.preferences?.language || 'en';
    const TRANSLATIONS = window.opener?.TRANSLATIONS;
    if (TRANSLATIONS && TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) return TRANSLATIONS[lang][key];
    if (TRANSLATIONS && TRANSLATIONS.en && TRANSLATIONS.en[key]) return TRANSLATIONS.en[key];
  } catch(e) {}
  // Hardcoded fallbacks
  const fb = { clock_title:'Clocks', clock_local:'Local Time', clock_style:'Style',
    clock_mode:'Mode', clock_size:'Size', clock_standard:'Standard',
    clock_minimal:'Minimal', clock_compact:'Compact', clock_digits:'Show hour numbers on analog face',
    clock_mode_digital:'Digital', clock_mode_analog:'Analog', clock_mode_vcr:'VCR',
    clock_digits_label:'1-12', clock_toggle_tz:'Click to toggle Local / UTC',
    clock_remove:'Remove this clock' };
  return fb[key] || key;
}

function _getLang() {
  try { return window.opener?.state?.preferences?.language || 'en'; } catch(e) { return 'en'; }
}

function _getLocale() {
  const m = { en:'en-GB', sv:'sv-SE', fr:'fr-FR', fi:'fi-FI', da:'da-DK' };
  return m[_getLang()] || 'en-GB';
}

/* ── Theme sync: read from opener ── */
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
// BroadcastChannel theme sync (works even if opener is lost)
try {
  var _clocksBC = new BroadcastChannel('tidslinjal-sync');
  _clocksBC.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      var cls = 'theme-' + (e.data.theme || 'dark');
      document.body.className = document.body.className.replace(/theme-\S+/g, '').trim() + ' ' + cls;
    }
    if (e.data && e.data.type === 'time-format') {
      _hourFormat = e.data.time_format === '12h' ? '12' : '24';
      if (e.data.time_separator) _timeSep = e.data.time_separator === 'dot' ? '.' : ':';
      var btn24 = document.getElementById('btnFmt24');
      var btn12 = document.getElementById('btnFmt12');
      if (btn24) btn24.classList.toggle('active', _hourFormat === '24');
      if (btn12) btn12.classList.toggle('active', _hourFormat === '12');
      tick();
    }
  };
} catch(e) {}

/* ── Language sync: update toolbar labels when language changes ── */
function syncLanguage() {
  const lang = _getLang();
  if (lang === _lastLang) return;
  _lastLang = lang;
  // Update toolbar labels
  const labels = document.querySelectorAll('#toolbar label');
  if (labels.length >= 3) {
    labels[0].textContent = _t('clock_style');
    labels[1].textContent = _t('clock_mode');
    labels[2].textContent = _t('clock_size');
  }
  // Update style select options
  const sel = document.getElementById('selStyle');
  if (sel && sel.options.length >= 3) {
    sel.options[0].textContent = _t('clock_standard');
    sel.options[1].textContent = _t('clock_minimal');
    sel.options[2].textContent = _t('clock_compact');
  }
  // Update mode buttons
  const btnDig = document.getElementById('btnDigital');
  if (btnDig) btnDig.textContent = _t('clock_mode_digital');
  const btnAna = document.getElementById('btnAnalog');
  if (btnAna) btnAna.textContent = _t('clock_mode_analog');
  const btnVcr = document.getElementById('btnVCR');
  if (btnVcr) btnVcr.textContent = _t('clock_mode_vcr');
  // Update digits button tooltip and label
  const btnD = document.getElementById('btnDigits');
  if (btnD) { btnD.title = _t('clock_digits'); btnD.textContent = _t('clock_digits_label'); }
  // Update remove button tooltips
  document.querySelectorAll('[data-rm-clock]').forEach(function(btn) {
    btn.title = _t('clock_remove');
  });
  // Update page header
  const hdr = document.querySelector('.page-header');
  if (hdr) hdr.textContent = 'Tidslinjal \u2014 ' + _t('clock_title');
  // Update document title
  document.title = 'Tidslinjal \u2014 ' + _t('clock_title');
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

/* ── VCR color ── */
function setVcrColor(c) {
  vcrColor = c;
  document.body.classList.remove('vcr-red','vcr-green','vcr-blue','vcr-orange');
  document.body.classList.add('vcr-' + c);
}

/* ── Mode toggle ── */
function setMode(m) {
  clockMode = m;
  document.getElementById('btnDigital').classList.toggle('active', m==='digital');
  document.getElementById('btnAnalog').classList.toggle('active', m==='analog');
  document.getElementById('btnVCR').classList.toggle('active', m==='vcr');
  const colorSel = document.getElementById('selVcrColor');
  const colorLbl = document.getElementById('lblVcrColor');
  if (colorSel) colorSel.style.display = m==='vcr' ? '' : 'none';
  if (colorLbl) colorLbl.style.display = m==='vcr' ? '' : 'none';
  if (m === 'vcr') setVcrColor(vcrColor);
  rebuildClocks();
}

/* ── Toggle hour digits on analog face ── */
function toggleDigits() {
  showDigits = !showDigits;
  const btn = document.getElementById('btnDigits');
  if (btn) btn.classList.toggle('active', showDigits);
  if (clockMode === 'analog') rebuildClocks();
}

/* ── SVG analog face builder ── */
function buildAnalogSVG(id) {
  const ticks = Array.from({length:60},(_,i)=>{
    const a = i*6-90, r1=i%5===0?38:42, r2=46;
    const [x1,y1] = [50+r1*Math.cos(a*Math.PI/180), 50+r1*Math.sin(a*Math.PI/180)];
    const [x2,y2] = [50+r2*Math.cos(a*Math.PI/180), 50+r2*Math.sin(a*Math.PI/180)];
    const w = i%5===0 ? 2 : 0.8;
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="currentColor" stroke-opacity=".5" stroke-width="${w}"/>`;
  }).join('');
  let digits = '';
  if (showDigits) {
    for (let i = 1; i <= 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      const r = 33;
      const x = 50 + r * Math.cos(a);
      const y = 50 + r * Math.sin(a);
      digits += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="var(--text-dim)" font-size="8" font-weight="600" font-family="sans-serif">${i}</text>`;
    }
  }
  return `<svg viewBox="0 0 100 100" class="analog-face" id="${id}">
  <circle cx="50" cy="50" r="49" fill="var(--bg3)" stroke="var(--border)" stroke-width="1.5"/>
  ${ticks}
  ${digits}
  <g id="${id}-deadlines"></g>
  <line id="${id}-h"  x1="50" y1="50" x2="50" y2="22" stroke="var(--text)"   stroke-width="3.5" stroke-linecap="round"/>
  <line id="${id}-m"  x1="50" y1="50" x2="50" y2="14" stroke="var(--text)"   stroke-width="2.5" stroke-linecap="round"/>
  <line id="${id}-s"  x1="50" y1="50" x2="50" y2="10" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="50" cy="50" r="3" fill="var(--accent)"/>
</svg>`;
}

function updateAnalog(svgId, h, m, s) {
  const hEl = document.getElementById(svgId+'-h');
  const mEl = document.getElementById(svgId+'-m');
  const sEl = document.getElementById(svgId+'-s');
  if (!hEl) return;
  const hDeg = (h%12)*30 + m*0.5 + s*(0.5/60) - 90;
  const mDeg = m*6 + s*0.1 - 90;
  const sDeg = s*6 - 90;
  hEl.setAttribute('transform',`rotate(${hDeg+90},50,50)`);
  mEl.setAttribute('transform',`rotate(${mDeg+90},50,50)`);
  sEl.setAttribute('transform',`rotate(${sDeg+90},50,50)`);
}

/* ── Deadline indicator on analog clock ── */
function updateDeadlineIndicators(svgId, isUTC) {
  const g = document.getElementById(svgId + '-deadlines');
  if (!g) return;
  let deadlines = [];
  try {
    const events = window.opener?.state?.events || [];
    const now = new Date();
    const today = isUTC
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    deadlines = events.filter(ev => {
      if (ev.event_type !== 'deadline') return false;
      const t = new Date(ev.end_time || ev.start_time);
      return t >= today && t < tomorrow;
    });
  } catch(e) {}
  if (!deadlines.length) { g.innerHTML = ''; return; }
  let svg = '';
  deadlines.forEach(ev => {
    const t = new Date(ev.end_time || ev.start_time);
    const dh = isUTC ? t.getUTCHours() : t.getHours();
    const dm = isUTC ? t.getUTCMinutes() : t.getMinutes();
    const deg = ((dh % 12) * 30 + dm * 0.5);
    const a = (deg - 90) * Math.PI / 180;
    const r1 = 16, r2 = 46;
    const x1 = (50 + r1 * Math.cos(a)).toFixed(2);
    const y1 = (50 + r1 * Math.sin(a)).toFixed(2);
    const x2 = (50 + r2 * Math.cos(a)).toFixed(2);
    const y2 = (50 + r2 * Math.sin(a)).toFixed(2);
    const title = escH(ev.title || 'Deadline') + ' ' + pad(dh) + ':' + pad(dm);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--danger)" stroke-width="2" stroke-opacity=".7" stroke-dasharray="3,2"><title>${title}</title></line>`;
  });
  g.innerHTML = svg;
}

/* ── Read clock data from opener ── */
function getClockData() {
  try {
    const op = window.opener;
    const openerUTC = op?._clockUTC || false;
    // Use local override if set, otherwise follow opener
    const isUTC = _localIsUTC !== null ? _localIsUTC : openerUTC;
    const extra = op?.state?.preferences?.extra_clocks || [];
    const showFlags = !!(op?.state?.preferences?.show_clock_flags);
    return { isUTC, extra, showFlags };
  } catch(e) { return { isUTC: _localIsUTC || false, extra:[], showFlags: false }; }
}

/* ── Clock flag lookup: delegate to opener or return empty ── */
function _getClockFlag(tz) {
  try {
    if (typeof window.opener?._getClockFlag === 'function') return window.opener._getClockFlag(tz);
    // Fallback: try opener's _tzCountryFlags map
    const flags = window.opener?._tzCountryFlags;
    if (flags && flags[tz]) return flags[tz];
  } catch(e) {}
  return '';
}

/* ── Toggle local/Zulu time (local to this popup) ── */
function setTZ(mode) {
  _localIsUTC = (mode === 'zulu');
  document.getElementById('btnTzLocal').classList.toggle('active', !_localIsUTC);
  document.getElementById('btnTzZulu').classList.toggle('active', _localIsUTC);
  // Also sync to opener if available
  try {
    if (typeof window.opener?.setClockFormat === 'function') {
      window.opener.setClockFormat(_localIsUTC ? 'zulu' : 'local');
    }
  } catch(e) {}
  rebuildClocks();
  tick();
}

function toggleUTC() {
  const {isUTC} = getClockData();
  setTZ(isUTC ? 'local' : 'zulu');
}

/* ── 12h/24h format toggle ── */
function setHourFormat(fmt) {
  _hourFormat = fmt;
  document.getElementById('btnFmt24').classList.toggle('active', fmt === '24');
  document.getElementById('btnFmt12').classList.toggle('active', fmt === '12');
  tick();
}

function formatHour12(h, m, s) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return pad(h12) + _timeSep + pad(m) + _timeSep + pad(s) + ' ' + ampm;
}

/* ── Remove a clock by calling parent ── */
function removeClock(id) {
  try { window.opener?.removeExtraClock(id); } catch(e){}
  rebuildClocks();
}

/* ── Build / rebuild all clock cards ── */
let _lastClockCount = -1;
let _lastMode = '';
let _lastShowFlags = null;
function rebuildClocks() {
  const {isUTC, extra, showFlags} = getClockData();
  _lastShowFlags = showFlags;
  const total = 1 + extra.length + (_showSynthClock ? 1 : 0);
  const wrap = document.getElementById('clocksWrap');
  if (!wrap) return;
  _lastClockCount = total;
  _lastMode = clockMode;
  let html = '';
  const mainLabel = isUTC ? 'UTC/Z' : _t('clock_local');
  const toggleTip = escH(_t('clock_toggle_tz'));
  const removeTip = escH(_t('clock_remove'));
  if (clockMode === 'analog') {
    html += `<div class="clock-card" id="card-main">
      <div class="clock-label clock-label-click" id="main-label" title="${toggleTip}">${mainLabel}</div>
      <div class="analog-wrap">${buildAnalogSVG('svg-main')}</div>
      <div class="clock-date" id="main-date"></div>
      <div class="clock-tz" id="main-tz"></div>
    </div>`;
  } else if (clockMode === 'vcr') {
    html += `<div class="clock-card vcr-card" id="card-main">
      <div class="clock-label vcr-label clock-label-click" id="main-label" title="${toggleTip}">${buildSeg7Text(isUTC?'UTC/Z':_t('clock_local'))}</div>
      <div class="clock-time vcr-time" id="vcr-main-seg">${buildSeg7Time(0,0,0)}</div>
      <div class="clock-date vcr-date" id="main-date">${buildSeg7Text('--')}</div>
      <div class="clock-tz vcr-tz" id="main-tz">${buildSeg7Text('--')}</div>
    </div>`;
  } else {
    html += `<div class="clock-card" id="card-main">
      <div class="clock-label clock-label-click" id="main-label" title="${toggleTip}">${mainLabel}</div>
      <div class="clock-time" id="main-time">--:--:--</div>
      <div class="clock-date" id="main-date"></div>
      <div class="clock-tz" id="main-tz"></div>
    </div>`;
  }
  extra.forEach(ec => {
    const flag = showFlags ? _getClockFlag(ec.timezone) : '';
    const flagHtml = flag ? '<span class="clock-flag">' + flag + '</span> ' : '';
    const labelText = ec.label || ec.timezone;
    if (clockMode === 'analog') {
      html += `<div class="clock-card" id="card-${ec.id}">
        <button class="clock-remove" title="${removeTip}" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label">${flagHtml}${escH(labelText)}</div>
        <div class="analog-wrap">${buildAnalogSVG('svg-'+ec.id)}</div>
        <div class="clock-tz" id="ec-${ec.id}-tz"></div>
      </div>`;
    } else if (clockMode === 'vcr') {
      html += `<div class="clock-card vcr-card" id="card-${ec.id}">
        <button class="clock-remove" title="${removeTip}" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label vcr-label">${flag ? '<span class="clock-flag">' + flag + '</span> ' : ''}${buildSeg7Text(labelText)}</div>
        <div class="clock-time vcr-time" id="vcr-ec-${ec.id}-seg">${buildSeg7Time(0,0,0)}</div>
        <div class="clock-tz vcr-tz" id="ec-${ec.id}-tz">${buildSeg7Text('--')}</div>
      </div>`;
    } else {
      html += `<div class="clock-card" id="card-${ec.id}">
        <button class="clock-remove" title="${removeTip}" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label">${flagHtml}${escH(labelText)}</div>
        <div class="clock-time" id="ec-${ec.id}-time">--:--:--</div>
        <div class="clock-tz" id="ec-${ec.id}-tz"></div>
      </div>`;
    }
  });
  // Synthetic exercise clock
  if (_showSynthClock) {
    const synthLabel = _t('clock_synthetic') || 'Synthetic Time';
    const synthTzLabel = _t('clock_synthetic_tz') || 'SYNTHETIC';
    if (clockMode === 'vcr') {
      html += `<div class="clock-card vcr-card synth-card" id="card-synth">
        <button class="clock-remove" title="${removeTip}" data-rm-synth>&times;</button>
        <div class="clock-label vcr-label">${buildSeg7Text(synthLabel)}</div>
        <div class="clock-time vcr-time" id="vcr-synth-seg">${buildSeg7Time(0,0,0)}</div>
        <div class="clock-date vcr-date" id="synth-date">${buildSeg7Text('--')}</div>
        <div class="clock-tz vcr-tz" id="synth-tz">${buildSeg7Text(synthTzLabel)}</div>
      </div>`;
    } else if (clockMode === 'analog') {
      html += `<div class="clock-card synth-card" id="card-synth">
        <button class="clock-remove" title="${removeTip}" data-rm-synth>&times;</button>
        <div class="clock-label">${escH(synthLabel)}</div>
        <div class="clock-time" id="synth-time" style="color:#ff4444;font-size:inherit">--:--:--</div>
        <div class="clock-date" id="synth-date"></div>
        <div class="clock-tz" id="synth-tz" style="color:#ff4444">${escH(synthTzLabel)}</div>
      </div>`;
    } else {
      html += `<div class="clock-card synth-card" id="card-synth">
        <button class="clock-remove" title="${removeTip}" data-rm-synth>&times;</button>
        <div class="clock-label" style="color:#ff4444">${escH(synthLabel)}</div>
        <div class="clock-time" id="synth-time" style="color:#ff4444;text-shadow:0 0 8px rgba(255,68,68,.4)">--:--:--</div>
        <div class="clock-date" id="synth-date"></div>
        <div class="clock-tz" id="synth-tz" style="color:#ff4444">${escH(synthTzLabel)}</div>
      </div>`;
    }
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-rm-clock]').forEach(btn => {
    btn.addEventListener('click', () => removeClock(parseInt(btn.dataset.rmClock, 10)));
  });
  wrap.querySelectorAll('[data-rm-synth]').forEach(btn => {
    btn.addEventListener('click', () => { _showSynthClock = false; rebuildClocks(); });
  });
  const mainLbl = document.getElementById('main-label');
  if (mainLbl) mainLbl.addEventListener('click', toggleUTC);
}

function escH(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Synthetic clock helpers ── */
function _getSynthElapsed() {
  try {
    const ex = window.opener?.state?.exercise;
    if (!ex || !ex.enabled || !ex.epoch) return null;
    const now = _getEffectiveNow();
    const epochMs = new Date(ex.epoch).getTime();
    if (isNaN(epochMs)) return null;
    const elapsedMs = now.getTime() - epochMs;
    return { elapsedMs, now, epoch: new Date(epochMs), ex };
  } catch(e) { return null; }
}

function _fmtSynthElapsed(elapsedMs) {
  const neg = elapsedMs < 0;
  const abs = Math.abs(elapsedMs);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const prefix = neg ? '-' : '';
  return { h, m, s, text: prefix + 'H+' + h + _timeSep + pad(m) + _timeSep + pad(s) };
}

/* ── Main tick function ── */
function tick() {
  syncTheme();
  syncLanguage();
  const {isUTC, extra} = getClockData();
  const now = _getEffectiveNow();
  const locale = _getLocale();

  const curShowFlags = !!(window.opener?.state?.preferences?.show_clock_flags);
  if (1 + extra.length + (_showSynthClock ? 1 : 0) !== _lastClockCount || clockMode !== _lastMode || curShowFlags !== _lastShowFlags) {
    rebuildClocks();
  }

  const lbl = document.getElementById('main-label');
  if (lbl) {
    const lblText = isUTC ? 'UTC/Z' : _t('clock_local');
    if (clockMode === 'vcr') { lbl.innerHTML = buildSeg7Text(lblText); } else { lbl.textContent = lblText; }
  }

  let h, m, s, dateStr, tzLabel, timeStr;
  if (isUTC) {
    h=now.getUTCHours(); m=now.getUTCMinutes(); s=now.getUTCSeconds();
    if (_hourFormat === '12') {
      // ZULU 12h: no colons, e.g. "012233 PM Z"
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      timeStr = pad(h12)+pad(m)+pad(s)+' '+ampm+' Z';
    } else {
      timeStr = pad(h)+pad(m)+pad(s)+'Z';
    }
    dateStr = now.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    tzLabel = 'UTC/Z';
  } else {
    h=now.getHours(); m=now.getMinutes(); s=now.getSeconds();
    if (_hourFormat === '12') {
      timeStr = formatHour12(h,m,s);
    } else {
      timeStr = pad(h)+_timeSep+pad(m)+_timeSep+pad(s);
    }
    dateStr = now.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    try { tzLabel=now.toLocaleTimeString(locale,{timeZoneName:'short'}).split(' ').pop(); } catch{tzLabel='';}
  }

  // Display hours for VCR seven-segment (always use display h/m/s, respect 12h)
  const dispH = _hourFormat === '12' ? (h % 12 || 12) : h;

  if (clockMode === 'analog') {
    updateAnalog('svg-main', h, m, s);
    updateDeadlineIndicators('svg-main', isUTC);
  } else if (clockMode === 'vcr') {
    const segEl=document.getElementById('vcr-main-seg'); if(segEl) segEl.innerHTML=buildSeg7Time(dispH,m,s);
  } else {
    const t=document.getElementById('main-time'); if(t)t.textContent=timeStr;
  }
  const d=document.getElementById('main-date');
  if(d){ if(clockMode==='vcr'){d.innerHTML=buildSeg7Text(dateStr);}else{d.textContent=dateStr;} }
  const z=document.getElementById('main-tz');
  if(z){ if(clockMode==='vcr'){z.innerHTML=buildSeg7Text(tzLabel);}else{z.textContent=tzLabel;} }

  extra.forEach(ec => {
    try {
      const ecTime = _getEffectiveNow();
      const ecH = parseInt(ecTime.toLocaleTimeString('en-GB',{hour:'2-digit',hour12:false,timeZone:ec.timezone}),10)||0;
      const ecM = parseInt(ecTime.toLocaleTimeString('en-GB',{minute:'2-digit',hour12:false,timeZone:ec.timezone}),10)||0;
      const ecS = parseInt(ecTime.toLocaleTimeString('en-GB',{second:'2-digit',hour12:false,timeZone:ec.timezone}),10)||0;
      let ecTStr;
      if (_hourFormat === '12') {
        ecTStr = formatHour12(ecH, ecM, ecS);
      } else {
        ecTStr = pad(ecH)+_timeSep+pad(ecM)+_timeSep+pad(ecS);
      }
      const ecTZ = ecTime.toLocaleTimeString('en-GB',{timeZoneName:'short',timeZone:ec.timezone}).split(' ').pop()||ec.timezone;
      const ecDispH = _hourFormat === '12' ? (ecH % 12 || 12) : ecH;
      if (clockMode === 'analog') {
        updateAnalog('svg-'+ec.id, ecH, ecM, ecS);
      } else if (clockMode === 'vcr') {
        const segEl=document.getElementById('vcr-ec-'+ec.id+'-seg'); if(segEl) segEl.innerHTML=buildSeg7Time(ecDispH,ecM,ecS);
      } else {
        const t=document.getElementById('ec-'+ec.id+'-time'); if(t)t.textContent=ecTStr;
      }
      const z=document.getElementById('ec-'+ec.id+'-tz');
      if(z){ if(clockMode==='vcr'){z.innerHTML=buildSeg7Text(ecTZ);}else{z.textContent=ecTZ;} }
    } catch(e) {
      const t=document.getElementById('ec-'+ec.id+'-time'); if(t)t.textContent='??:??:??';
    }
  });

  // Update synthetic clock
  if (_showSynthClock) {
    const synthData = _getSynthElapsed();
    if (synthData) {
      const { elapsedMs } = synthData;
      const fmt = _fmtSynthElapsed(elapsedMs);
      if (clockMode === 'vcr') {
        const segEl = document.getElementById('vcr-synth-seg');
        if (segEl) segEl.innerHTML = buildSeg7Time(fmt.h, fmt.m, fmt.s);
        const dateEl = document.getElementById('synth-date');
        if (dateEl) dateEl.innerHTML = buildSeg7Text(fmt.text);
      } else {
        const tEl = document.getElementById('synth-time');
        if (tEl) tEl.textContent = fmt.text;
        const dateEl = document.getElementById('synth-date');
        if (dateEl) dateEl.textContent = synthData.ex.label || '';
      }
    } else {
      // No exercise active
      if (clockMode === 'vcr') {
        const segEl = document.getElementById('vcr-synth-seg');
        if (segEl) segEl.innerHTML = buildSeg7Time(0, 0, 0);
        const dateEl = document.getElementById('synth-date');
        if (dateEl) dateEl.innerHTML = buildSeg7Text('NO EPOCH');
      } else {
        const tEl = document.getElementById('synth-time');
        if (tEl) tEl.textContent = 'H+0' + _timeSep + '00' + _timeSep + '00';
        const dateEl = document.getElementById('synth-date');
        if (dateEl) dateEl.textContent = _t('clock_no_exercise') || 'No exercise active';
      }
    }
  }
}

/* ── Countdown timer system ── */
let _countdowns = []; // { id, label, targetTime, totalMs, continueUp, playSound, paused, pausedRemaining, acknowledged }
window._countdowns = _countdowns; // expose for detached windows
let _nextCountdownId = 1;
let _cdAudioCtx = null;

function addCountdown(label, hours, minutes, seconds, continueUp, playSound, soundType) {
  const totalMs = ((hours * 3600) + (minutes * 60) + seconds) * 1000;
  if (totalMs <= 0) return;
  const cd = {
    id: _nextCountdownId++,
    label: label || 'Countdown',
    targetTime: Date.now() + totalMs,
    totalMs: totalMs,
    continueUp: continueUp,
    playSound: playSound,
    soundType: soundType || 'beep',
    paused: false,
    pausedRemaining: 0,
    acknowledged: false,
    expired: false
  };
  _countdowns.push(cd);
  window._countdowns = _countdowns;
  renderCountdowns();
}

function addCountdownForEvent(ev, minutesBefore) {
  const eventTime = new Date(ev.start_time).getTime();
  const targetTime = eventTime - (minutesBefore * 60 * 1000);
  const remaining = targetTime - Date.now();
  if (remaining <= 0) return; // already past
  const cd = {
    id: _nextCountdownId++,
    label: ev.title || 'Event',
    targetTime: targetTime,
    totalMs: remaining,
    continueUp: true,
    playSound: true,
    paused: false,
    pausedRemaining: 0,
    acknowledged: false,
    expired: false
  };
  _countdowns.push(cd);
  window._countdowns = _countdowns;
  renderCountdowns();
}

function removeCountdown(id) {
  const idx = _countdowns.findIndex(cd => cd.id === id);
  if (idx !== -1) _countdowns.splice(idx, 1);
  window._countdowns = _countdowns;
  renderCountdowns();
}

function togglePauseCountdown(id) {
  const cd = _countdowns.find(c => c.id === id);
  if (!cd) return;
  if (cd.paused) {
    // Resume: set new target based on remaining
    cd.targetTime = Date.now() + cd.pausedRemaining;
    cd.paused = false;
  } else {
    // Pause: store remaining
    cd.pausedRemaining = cd.targetTime - Date.now();
    cd.paused = true;
  }
}

function acknowledgeCountdown(id) {
  const cd = _countdowns.find(c => c.id === id);
  if (!cd) return;
  cd.acknowledged = true;
  // Log audit event to opener
  try {
    const user = window.opener?.state?.user;
    const userName = user?.display_name || user?.username || 'Unknown';
    if (typeof window.opener?.apiPost === 'function') {
      window.opener.apiPost('/api/audit', {
        action: 'countdown_acknowledged',
        entity_type: 'countdown',
        summary: userName + ' acknowledged countdown: ' + cd.label
      });
    }
  } catch(e) {}
  // Remove the countdown after acknowledgement
  const ackIdx = _countdowns.findIndex(c => c.id === id);
  if (ackIdx !== -1) _countdowns.splice(ackIdx, 1);
  window._countdowns = _countdowns;
  renderCountdowns();
}

function resetCountdown(id) {
  const cd = _countdowns.find(c => c.id === id);
  if (!cd) return;
  cd.targetTime = Date.now() + cd.totalMs;
  cd.paused = false;
  cd.expired = false;
  cd.acknowledged = false;
  renderCountdowns();
}

function detachCountdown(id) {
  const cd = _countdowns.find(c => c.id === id);
  if (!cd) return;
  const theme = document.body.className || 'theme-dark';
  const cdColor = _getCountdownColor();
  const bgColor = _getBgColor();
  // Serialize countdown state for self-contained operation
  const cdState = JSON.stringify({
    id: cd.id, label: cd.label, targetTime: cd.targetTime, totalMs: cd.totalMs,
    continueUp: cd.continueUp, playSound: cd.playSound, soundType: cd.soundType,
    paused: cd.paused, pausedRemaining: cd.pausedRemaining, acknowledged: cd.acknowledged, expired: cd.expired
  });
  const w = window.open('', 'tidslinjal-cd-' + id, 'width=400,height=280,menubar=no,toolbar=no');
  if (!w) return;
  // Mark as detached and remove from parent display
  cd.detached = true;
  cd._detachedWin = w;
  renderCountdowns();
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Countdown — ' + escH(cd.label) + '</title>' +
'<link rel="stylesheet" href="/static/vendor/seven-segment.css">' +
'<style>' +
'body.theme-dark{--bg:#1a1d23;--bg2:#22262e;--text:#e8eaf0;--text-dim:#9098b0;--accent:#4a9eff;--border:#2e3340;--danger:#e05252}' +
'body.theme-light{--bg:#f0f2f5;--bg2:#fff;--text:#1a1d23;--text-dim:#666;--accent:#1a6ed8;--border:#d0d4de;--danger:#c0392b}' +
'body.theme-city-camo{--bg:#2b3325;--bg2:#333d2c;--text:#d4dbc0;--text-dim:#8d9a78;--accent:#8fb85c;--border:#404d34;--danger:#e05252}' +
'body.theme-urban-camo{--bg:#212630;--bg2:#282e3a;--text:#c8d0e0;--text-dim:#7a88a0;--accent:#5c8abf;--border:#333d50;--danger:#e05252}' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px}' +
'.cd-label{font-size:1.2rem;color:var(--text-dim)}' +
'.cd-time{font-size:4rem;font-variant-numeric:tabular-nums;font-weight:700}' +
'.cd-controls{display:flex;gap:8px}' +
'.cd-controls button{background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 14px;cursor:pointer;font-size:1rem}' +
'.cd-controls button:hover{background:var(--accent);color:#fff;border-color:var(--accent)}' +
'.cd-overtime{color:var(--danger)}' +
'.cd-blink{animation:cdb 1.2s step-end infinite}' +
'@keyframes cdb{0%,100%{opacity:1}50%{opacity:.3}}' +
'.cd-progress{width:80%;height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--border);margin:6px 0}' +
'.cd-progress-bar{height:100%;transition:width .5s,background .3s;border-radius:4px}' +
'.cd-size-bar{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--text-dim)}' +
'.cd-size-bar input[type=range]{width:100px;cursor:pointer}' +
'.cd-sz-xs .cd-time{font-size:2rem} .cd-sz-sm .cd-time{font-size:3rem}' +
'.cd-sz-md .cd-time{font-size:4rem} .cd-sz-lg .cd-time{font-size:5.5rem}' +
'.cd-sz-xl .cd-time{font-size:7rem} .cd-sz-xxl .cd-time{font-size:10rem}' +
'</style></head><body class="' + theme + ' cd-sz-md">' +
'<div class="cd-label" id="cdLabel">' + escH(cd.label) + '</div>' +
'<div class="cd-time" id="cdTime">00:00:00</div>' +
'<div class="cd-progress"><div class="cd-progress-bar" id="cdBar" style="width:0%;background:' + cdColor + '"></div></div>' +
'<div class="cd-controls">' +
'  <button id="btnPause">' + (cd.paused ? '\u25B6' : '\u23F8') + '</button>' +
'  <button id="btnReset">\u21BA</button>' +
'  <button id="btnAck" style="display:none;background:var(--danger);color:#fff;border-color:var(--danger)">\u2713 Ack</button>' +
'</div>' +
'<div class="cd-size-bar"><span>Size:</span><input type="range" id="cdSizeSlider" min="0" max="5" value="2" step="1"><span id="cdSizeLbl">M</span></div>');
  w.document.write('<script>' +
'var cd = ' + cdState + ';\n' +
'var cdColor = "' + cdColor + '";\n' +
'var _audioCtx = null;\n' +
'function pad(n){return String(n).padStart(2,"0");}\n' +
'function playCdAlarm(type){\n' +
'  try{if(!_audioCtx)_audioCtx=new(window.AudioContext||window.webkitAudioContext)();var ctx=_audioCtx;\n' +
'  if(type==="beep"){for(var i=0;i<3;i++){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=880;o.type="square";g.gain.value=0.15;var t=ctx.currentTime+i*0.3;o.start(t);o.stop(t+0.15);}}\n' +
'  else if(type==="klaxon"){for(var i=0;i<4;i++){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=i%2===0?440:550;o.type="sawtooth";g.gain.value=0.2;var t=ctx.currentTime+i*0.4;o.start(t);o.stop(t+0.35);}}\n' +
'  }catch(e){}\n' +
'}\n' +
'function tick(){\n' +
'  var ms,isOT=false;\n' +
'  if(cd.paused){ms=Math.max(0,cd.pausedRemaining);}\n' +
'  else{var rem=cd.targetTime-Date.now();if(rem>0){ms=rem;}else{isOT=cd.continueUp;ms=isOT?-rem:0;}}\n' +
'  var ts=Math.floor(ms/1000),h=Math.floor(ts/3600),m=Math.floor((ts%3600)/60),s=ts%60;\n' +
'  var el=document.getElementById("cdTime");\n' +
'  el.textContent=(isOT?"+":"")+pad(h)+":"+pad(m)+":"+pad(s);\n' +
'  el.classList.toggle("cd-overtime",isOT);\n' +
'  el.classList.toggle("cd-blink",cd.paused);\n' +
'  document.getElementById("btnPause").textContent=cd.paused?"\\u25B6":"\\u23F8";\n' +
'  var bar=document.getElementById("cdBar");\n' +
'  if(bar&&cd.totalMs>0){var elapsed=cd.totalMs-(cd.paused?cd.pausedRemaining:(cd.targetTime-Date.now()));var pct=isOT?100:Math.min(100,Math.max(0,(elapsed/cd.totalMs)*100));bar.style.width=pct+"%";if(isOT)bar.style.background="var(--danger)";}\n' +
'  var ackBtn=document.getElementById("btnAck");\n' +
'  if(isOT&&!cd.acknowledged&&ackBtn)ackBtn.style.display="";\n' +
'  // Fire alarm\n' +
'  if(!cd.paused&&!cd.expired&&cd.targetTime<=Date.now()){cd.expired=true;if(cd.playSound)playCdAlarm(cd.soundType);}\n' +
'  // Sync state back to opener\n' +
'  try{var oc=window.opener&&window.opener._countdowns?window.opener._countdowns.find(function(c){return c.id===cd.id}):null;if(oc){oc.targetTime=cd.targetTime;oc.paused=cd.paused;oc.pausedRemaining=cd.pausedRemaining;oc.expired=cd.expired;oc.acknowledged=cd.acknowledged;}}catch(e){}\n' +
'}\n' +
'document.getElementById("btnPause").onclick=function(){\n' +
'  if(cd.paused){cd.targetTime=Date.now()+cd.pausedRemaining;cd.paused=false;}\n' +
'  else{cd.pausedRemaining=cd.targetTime-Date.now();cd.paused=true;}\n' +
'};\n' +
'document.getElementById("btnReset").onclick=function(){\n' +
'  cd.targetTime=Date.now()+cd.totalMs;cd.paused=false;cd.expired=false;cd.acknowledged=false;\n' +
'  document.getElementById("btnAck").style.display="none";\n' +
'};\n' +
'document.getElementById("btnAck").onclick=function(){\n' +
'  cd.acknowledged=true;document.getElementById("btnAck").style.display="none";\n' +
'};\n' +
'var cdSzCls=["cd-sz-xs","cd-sz-sm","cd-sz-md","cd-sz-lg","cd-sz-xl","cd-sz-xxl"];\n' +
'var cdSzLbl=["XS","S","M","L","XL","XXL"];\n' +
'document.getElementById("cdSizeSlider").oninput=function(){\n' +
'  var v=parseInt(this.value,10);\n' +
'  document.body.className=document.body.className.replace(/cd-sz-\\S+/g,"").trim()+" "+cdSzCls[v];\n' +
'  document.getElementById("cdSizeLbl").textContent=cdSzLbl[v];\n' +
'};\n' +
'// BroadcastChannel theme sync\n' +
'try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme"){document.body.className=document.body.className.replace(/theme-\\S+/g,"").trim()+" theme-"+(e.data.theme||"dark");}};}catch(e){}\n' +
'// Custom background color\n' +
'document.body.style.background="' + bgColor + '";\n' +
'// On window close: re-attach countdown to parent\n' +
'window.addEventListener("beforeunload",function(){\n' +
'  try{var oc=window.opener&&window.opener._countdowns?window.opener._countdowns.find(function(c){return c.id===cd.id}):null;if(oc){oc.detached=false;oc._detachedWin=null;window.opener.renderCountdowns();}}catch(e){}\n' +
'});\n' +
'setInterval(tick,200);tick();\n' +
'<\\/script></body></html>');
  w.document.close();
}

function playCdAlarm(soundType) {
  try {
    if (!_cdAudioCtx) _cdAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _cdAudioCtx;
    const type = soundType || 'beep';
    if (type === 'beep') {
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; o.type = 'square'; g.gain.value = 0.15;
        const t = ctx.currentTime + i * 0.3; o.start(t); o.stop(t + 0.15);
      }
    } else if (type === 'klaxon') {
      for (let i = 0; i < 4; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = i % 2 === 0 ? 440 : 550; o.type = 'sawtooth'; g.gain.value = 0.2;
        const t = ctx.currentTime + i * 0.4; o.start(t); o.stop(t + 0.35);
      }
    } else if (type === 'bell') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 830; o.type = 'sine'; g.gain.value = 0.3;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 2);
    } else if (type === 'siren') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sawtooth'; g.gain.value = 0.15;
      o.frequency.setValueAtTime(400, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5);
      o.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.0);
      o.frequency.linearRampToValueAtTime(800, ctx.currentTime + 1.5);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 2);
    } else if (type === 'chime') {
      [523, 659, 784].forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq; o.type = 'sine'; g.gain.value = 0.2;
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.8);
        o.start(ctx.currentTime + i * 0.3); o.stop(ctx.currentTime + i * 0.3 + 0.8);
      });
    }
  } catch(e) {}
}

function renderCountdowns() {
  const wrap = document.getElementById('countdownWrap');
  if (!wrap) return;
  // Filter out detached countdowns from display
  const visibleCountdowns = _countdowns.filter(c => !c.detached);
  if (visibleCountdowns.length === 0) { wrap.innerHTML = ''; return; }
  let html = '';
  visibleCountdowns.forEach(cd => {
    const isExpired = !cd.paused && Date.now() >= cd.targetTime;
    const classes = ['clock-card', 'countdown-card'];
    if (clockMode === 'vcr') classes.push('vcr-card');
    if (cd.paused) classes.push('cd-paused');
    if (isExpired && !cd.acknowledged) classes.push('cd-expired');
    if (isExpired && cd.continueUp) classes.push('cd-counting-up');

    let timeDisplay;
    if (clockMode === 'vcr') {
      timeDisplay = `<div class="clock-time vcr-time countdown-time" id="cd-time-${cd.id}">${buildSeg7Time(0,0,0)}</div>`;
    } else {
      timeDisplay = `<div class="clock-time countdown-time" id="cd-time-${cd.id}">00:00:00</div>`;
    }

    const elapsedTxt = _t('cd_elapsed') || 'ELAPSED';
    const expiredTxt = _t('cd_expired_label') || 'EXPIRED';
    const lblText = cd.label + (isExpired && cd.continueUp && !cd.acknowledged ? ` (${elapsedTxt})` : isExpired ? ` (${expiredTxt})` : '');
    const labelHtml = clockMode === 'vcr'
      ? `<div class="clock-label vcr-label">${buildSeg7Text(cd.label)}</div>`
      : `<div class="clock-label">${escH(lblText)}</div>`;

    // Countdown progress bar
    const cdProgressHtml = `<div class="timer-progress"><div class="timer-progress-bar" id="cd-bar-${cd.id}" style="width:0%;background:var(--countdown-color,var(--accent,#4a9eff))"></div></div>`;

    html += `<div class="${classes.join(' ')}" id="cd-card-${cd.id}">
      <button class="clock-remove" title="Remove" data-rm-cd="${cd.id}">&times;</button>
      ${labelHtml}
      ${timeDisplay}
      ${cdProgressHtml}
      <div class="countdown-controls">
        <button data-cd-pause="${cd.id}">${cd.paused ? '▶' : '⏸'}</button>
        <button data-cd-reset="${cd.id}">↺</button>
        <button data-cd-detach="${cd.id}" title="Detach to own window">⧉</button>
        ${isExpired && !cd.acknowledged ? `<button data-cd-ack="${cd.id}" style="background:var(--danger,#e05252);color:#fff;border-color:var(--danger,#e05252)">✓ Acknowledge</button>` : ''}
      </div>
    </div>`;
  });
  wrap.innerHTML = html;
  // Bind events
  wrap.querySelectorAll('[data-rm-cd]').forEach(btn => {
    btn.addEventListener('click', () => removeCountdown(parseInt(btn.dataset.rmCd, 10)));
  });
  wrap.querySelectorAll('[data-cd-pause]').forEach(btn => {
    btn.addEventListener('click', () => { togglePauseCountdown(parseInt(btn.dataset.cdPause, 10)); renderCountdowns(); });
  });
  wrap.querySelectorAll('[data-cd-reset]').forEach(btn => {
    btn.addEventListener('click', () => resetCountdown(parseInt(btn.dataset.cdReset, 10)));
  });
  wrap.querySelectorAll('[data-cd-ack]').forEach(btn => {
    btn.addEventListener('click', () => acknowledgeCountdown(parseInt(btn.dataset.cdAck, 10)));
  });
  wrap.querySelectorAll('[data-cd-detach]').forEach(btn => {
    btn.addEventListener('click', () => detachCountdown(parseInt(btn.dataset.cdDetach, 10)));
  });
}

function tickCountdowns() {
  _countdowns.forEach(cd => {
    if (cd.paused) {
      // Show paused remaining
      const rem = Math.max(0, cd.pausedRemaining);
      displayCountdownTime(cd.id, rem, false);
      return;
    }
    const remaining = cd.targetTime - Date.now();
    if (remaining > 0) {
      displayCountdownTime(cd.id, remaining, false);
    } else {
      // Expired
      if (!cd.expired) {
        cd.expired = true;
        if (cd.playSound) playCdAlarm(cd.soundType);
        renderCountdowns(); // Re-render for expired styling
      }
      if (cd.continueUp) {
        displayCountdownTime(cd.id, -remaining, true);
      } else {
        displayCountdownTime(cd.id, 0, true);
      }
    }
  });
}

function displayCountdownTime(id, ms, isOvertime) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const prefix = isOvertime ? '+' : '';
  const el = document.getElementById('cd-time-' + id);
  if (!el) return;
  if (clockMode === 'vcr') {
    el.innerHTML = (isOvertime ? buildSeg7Text('+') : '') + buildSeg7Time(h, m, s);
  } else {
    el.textContent = prefix + pad(h) + _timeSep + pad(m) + _timeSep + pad(s);
  }
  // Update card classes and overtime color
  const card = document.getElementById('cd-card-' + id);
  if (card) {
    const cd = _countdowns.find(c => c.id === id);
    if (cd && cd.expired && !cd.acknowledged) {
      card.classList.add('cd-expired');
    }
    if (isOvertime) {
      el.style.color = 'var(--danger,#e05252)';
    } else {
      el.style.color = '';
    }
    // Update countdown progress bar
    if (cd) {
      const barEl = document.getElementById('cd-bar-' + id);
      if (barEl) {
        const elapsed = cd.totalMs - ms;
        const pct = isOvertime ? 100 : Math.min(100, Math.max(0, (elapsed / cd.totalMs) * 100));
        barEl.style.width = pct + '%';
        if (isOvertime) {
          barEl.style.background = 'var(--danger,#e05252)';
        }
      }
    }
  }
}

// Check opener for events with countdown settings
function loadEventCountdowns() {
  try {
    const events = window.opener?.state?.events || [];
    const now = Date.now();
    events.forEach(ev => {
      if (!ev.countdown_before_minutes) return;
      const eventTime = new Date(ev.start_time).getTime();
      const cdTarget = eventTime - (ev.countdown_before_minutes * 60 * 1000);
      // Only create if countdown hasn't expired yet (or recently expired within 1 hour)
      if (cdTarget > now - 3600000 && !_countdowns.some(c => c.label === ev.title)) {
        addCountdownForEvent(ev, ev.countdown_before_minutes);
      }
    });
  } catch(e) {}
}

// Countdown popover controls
function showCountdownPopover() {
  document.getElementById('countdownPopover').style.display = '';
  document.getElementById('countdownOverlay').style.display = '';
}
function hideCountdownPopover() {
  document.getElementById('countdownPopover').style.display = 'none';
  document.getElementById('countdownOverlay').style.display = 'none';
}

// Bind toolbar controls (CSP-safe, no inline handlers)
document.getElementById('selStyle').addEventListener('change', function() { applyStyle(this.value); });
document.querySelectorAll('[data-mode]').forEach(function(btn) {
  btn.addEventListener('click', function() { setMode(btn.dataset.mode); });
});
var slider = document.getElementById('sizeSlider');
slider.addEventListener('input', function() { applySize(this.value); });
slider.addEventListener('change', function() { applySize(this.value); });
document.getElementById('btnDigits').addEventListener('click', toggleDigits);
document.getElementById('selVcrColor').addEventListener('change', function() { setVcrColor(this.value); });
document.getElementById('btnTzLocal').addEventListener('click', function() { setTZ('local'); });
document.getElementById('btnTzZulu').addEventListener('click', function() { setTZ('zulu'); });
document.getElementById('btnFmt24').addEventListener('click', function() { setHourFormat('24'); });
document.getElementById('btnFmt12').addEventListener('click', function() { setHourFormat('12'); });

// Countdown popover bindings
document.getElementById('btnAddCountdown').addEventListener('click', showCountdownPopover);
document.getElementById('cdCancel').addEventListener('click', hideCountdownPopover);
document.getElementById('countdownOverlay').addEventListener('click', hideCountdownPopover);
document.getElementById('cdStart').addEventListener('click', function() {
  const label = document.getElementById('cdLabel').value.trim();
  const hours = parseInt(document.getElementById('cdHours').value, 10) || 0;
  const minutes = parseInt(document.getElementById('cdMinutes').value, 10) || 0;
  const seconds = parseInt(document.getElementById('cdSeconds').value, 10) || 0;
  const continueUp = document.getElementById('cdContinueUp').checked;
  const playSound = document.getElementById('cdPlaySound').checked;
  const soundType = document.getElementById('cdSoundType')?.value || 'beep';
  addCountdown(label, hours, minutes, seconds, continueUp, playSound, soundType);
  hideCountdownPopover();
  // Reset form
  document.getElementById('cdLabel').value = '';
  document.getElementById('cdHours').value = '0';
  document.getElementById('cdMinutes').value = '30';
  document.getElementById('cdSeconds').value = '0';
});
// Sound preview
document.getElementById('cdSoundPreview')?.addEventListener('click', function() {
  const st = document.getElementById('cdSoundType')?.value || 'beep';
  playCdAlarm(st);
});
// Sound row show/hide based on checkbox
document.getElementById('cdPlaySound')?.addEventListener('change', function() {
  const row = document.getElementById('cdSoundRow');
  if (row) row.style.display = this.checked ? '' : 'none';
});

document.querySelectorAll('.cd-preset').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const h = parseInt(btn.dataset.h, 10) || 0;
    const m = parseInt(btn.dataset.m, 10) || 0;
    document.getElementById('cdHours').value = h;
    document.getElementById('cdMinutes').value = m;
    document.getElementById('cdSeconds').value = '0';
  });
});

// Initialize TZ state from opener
try {
  const openerUTC = window.opener?._clockUTC || false;
  _localIsUTC = openerUTC;
  document.getElementById('btnTzLocal').classList.toggle('active', !_localIsUTC);
  document.getElementById('btnTzZulu').classList.toggle('active', _localIsUTC);
} catch(e) {}

// ── Stopwatch Timer system ──────────────────────────────────────────────────
let _timers = []; // { id, label, startTime, paused, pausedElapsed, targetMs, continueAfter, playSound, soundType, alarmFired }
window._timers = _timers; // expose for detached windows
let _nextTimerId = 1;

function addTimer(label, hours, minutes, seconds, continueAfter, playSound, soundType) {
  const targetMs = ((hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0)) * 1000;
  const tm = {
    id: _nextTimerId++,
    label: label || 'Timer',
    startTime: Date.now(),
    paused: false,
    pausedElapsed: 0,
    targetMs: targetMs > 0 ? targetMs : 0,
    continueAfter: continueAfter !== false,
    playSound: playSound !== false,
    soundType: soundType || 'beep',
    alarmFired: false,
    laps: [],       // { num, splitMs, totalMs }
    lastLapTime: 0, // timestamp of last lap
    detached: false  // true when moved to a detached window
  };
  tm.lastLapTime = tm.startTime;
  _timers.push(tm);
  window._timers = _timers;
  renderTimers();
}

function lapTimer(id) {
  const tm = _timers.find(t => t.id === id);
  if (!tm || tm.paused) return;
  const now = Date.now();
  const totalMs = now - tm.startTime;
  const splitMs = now - tm.lastLapTime;
  tm.laps.push({ num: tm.laps.length + 1, splitMs, totalMs });
  tm.lastLapTime = now;
  renderTimers();
}

function exportLaps(id, format) {
  const tm = _timers.find(t => t.id === id);
  if (!tm || tm.laps.length === 0) return;
  const fmtMs = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60, cs = Math.floor((ms % 1000) / 10);
    return pad(h) + ':' + pad(m) + ':' + pad(sec) + '.' + pad(cs);
  };
  if (format === 'print') {
    const w = window.open('', '', 'width=400,height=500');
    if (!w) return;
    let html = '<html><head><title>Lap Times — ' + escH(tm.label) + '</title><style>body{font-family:monospace;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;text-align:right}th{background:#eee}</style></head><body>';
    html += '<h2>' + escH(tm.label) + ' — Lap Times</h2><table><tr><th>#</th><th>Split</th><th>Total</th></tr>';
    tm.laps.forEach(l => { html += '<tr><td>' + l.num + '</td><td>' + fmtMs(l.splitMs) + '</td><td>' + fmtMs(l.totalMs) + '</td></tr>'; });
    html += '</table></body></html>';
    w.document.write(html);
    w.document.close();
    w.print();
    return;
  }
  // CSV export
  let csv = 'Lap,Split,Total\n';
  tm.laps.forEach(l => { csv += l.num + ',' + fmtMs(l.splitMs) + ',' + fmtMs(l.totalMs) + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (tm.label || 'timer') + '-laps.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function removeTimer(id) {
  const idx = _timers.findIndex(t => t.id === id);
  if (idx !== -1) _timers.splice(idx, 1);
  window._timers = _timers;
  renderTimers();
}

function togglePauseTimer(id) {
  const tm = _timers.find(t => t.id === id);
  if (!tm) return;
  if (tm.paused) {
    tm.startTime = Date.now() - tm.pausedElapsed;
    tm.paused = false;
  } else {
    tm.pausedElapsed = Date.now() - tm.startTime;
    tm.paused = true;
  }
}

function resetTimer(id) {
  const tm = _timers.find(t => t.id === id);
  if (!tm) return;
  tm.startTime = Date.now();
  tm.paused = false;
  tm.pausedElapsed = 0;
  tm.alarmFired = false;
  tm.laps = [];
  tm.lastLapTime = tm.startTime;
  renderTimers();
}

function renderTimers() {
  const wrap = document.getElementById('timerWrap');
  if (!wrap) return;
  // Filter out detached timers from display
  const visibleTimers = _timers.filter(t => !t.detached);
  if (visibleTimers.length === 0) { wrap.innerHTML = ''; return; }
  const fmtMs = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60, cs = Math.floor((ms % 1000) / 10);
    return pad(h) + ':' + pad(m) + ':' + pad(sec) + '.' + pad(cs);
  };
  let html = '';
  visibleTimers.forEach(tm => {
    const elapsed = tm.paused ? tm.pausedElapsed : (Date.now() - tm.startTime);
    const isOverTarget = tm.targetMs > 0 && elapsed >= tm.targetMs;
    const classes = ['clock-card', 'timer-card'];
    if (clockMode === 'vcr') classes.push('vcr-card');
    if (tm.paused) classes.push('cd-paused');
    if (isOverTarget && !tm.continueAfter) classes.push('cd-expired');
    if (isOverTarget) classes.push('timer-overtime');
    let timeDisplay;
    if (clockMode === 'vcr') {
      timeDisplay = `<div class="clock-time vcr-time countdown-time" id="tm-time-${tm.id}">${buildSeg7Time(0,0,0)}</div>`;
    } else {
      timeDisplay = `<div class="clock-time countdown-time" id="tm-time-${tm.id}">00:00:00</div>`;
    }
    const elapsedTxt = isOverTarget ? ' (OVER TARGET)' : '';
    const labelHtml = clockMode === 'vcr'
      ? `<div class="clock-label vcr-label">${buildSeg7Text(tm.label)}</div>`
      : `<div class="clock-label">${escH(tm.label + elapsedTxt)}</div>`;
    // Progress bar (only if targetMs > 0) — cursor:ns-resize to hint scroll-to-adjust
    const progressHtml = tm.targetMs > 0
      ? `<div class="timer-progress" data-tm-scroll="${tm.id}"><div class="timer-progress-bar" id="tm-bar-${tm.id}" style="width:0%;background:var(--timer-color,#2ecc71)"></div></div>`
      : '';
    // Lap history
    let lapHtml = '';
    if (tm.laps.length > 0) {
      lapHtml = '<div class="lap-list" id="tm-laps-' + tm.id + '">';
      tm.laps.forEach(l => {
        lapHtml += '<div class="lap-row"><span class="lap-num">#' + l.num + '</span><span class="lap-split">' + fmtMs(l.splitMs) + '</span><span class="lap-total">' + fmtMs(l.totalMs) + '</span></div>';
      });
      lapHtml += '</div>';
      lapHtml += '<div class="lap-export-row"><button data-tm-export-csv="' + tm.id + '">CSV</button><button data-tm-export-print="' + tm.id + '">Print</button></div>';
    }
    html += `<div class="${classes.join(' ')}" id="tm-card-${tm.id}">
      <button class="clock-remove" title="Remove" data-rm-tm="${tm.id}">&times;</button>
      ${labelHtml}
      ${timeDisplay}
      ${progressHtml}
      <div class="countdown-controls">
        <button data-tm-pause="${tm.id}">${tm.paused ? '▶' : '⏸'}</button>
        <button data-tm-lap="${tm.id}" title="Record lap time">Lap</button>
        <button data-tm-reset="${tm.id}">↺</button>
        <button data-tm-detach="${tm.id}" title="Detach to own window">⧉</button>
      </div>
      ${lapHtml}
    </div>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-rm-tm]').forEach(btn => {
    btn.addEventListener('click', () => removeTimer(parseInt(btn.dataset.rmTm, 10)));
  });
  wrap.querySelectorAll('[data-tm-pause]').forEach(btn => {
    btn.addEventListener('click', () => { togglePauseTimer(parseInt(btn.dataset.tmPause, 10)); renderTimers(); });
  });
  wrap.querySelectorAll('[data-tm-lap]').forEach(btn => {
    btn.addEventListener('click', () => lapTimer(parseInt(btn.dataset.tmLap, 10)));
  });
  wrap.querySelectorAll('[data-tm-reset]').forEach(btn => {
    btn.addEventListener('click', () => resetTimer(parseInt(btn.dataset.tmReset, 10)));
  });
  wrap.querySelectorAll('[data-tm-detach]').forEach(btn => {
    btn.addEventListener('click', () => detachTimer(parseInt(btn.dataset.tmDetach, 10)));
  });
  wrap.querySelectorAll('[data-tm-export-csv]').forEach(btn => {
    btn.addEventListener('click', () => exportLaps(parseInt(btn.dataset.tmExportCsv, 10), 'csv'));
  });
  wrap.querySelectorAll('[data-tm-export-print]').forEach(btn => {
    btn.addEventListener('click', () => exportLaps(parseInt(btn.dataset.tmExportPrint, 10), 'print'));
  });
  // Scroll-to-adjust on progress bars
  wrap.querySelectorAll('[data-tm-scroll]').forEach(bar => {
    bar.addEventListener('wheel', (e) => {
      e.preventDefault();
      const tmId = parseInt(bar.dataset.tmScroll, 10);
      const tm = _timers.find(t => t.id === tmId);
      if (!tm) return;
      // Scroll up = increase target, scroll down = decrease (min 10s)
      const delta = e.deltaY < 0 ? 60000 : -60000; // 1 minute per scroll step
      tm.targetMs = Math.max(10000, tm.targetMs + delta);
      tm.alarmFired = false; // reset alarm if target changed
      renderTimers();
    }, { passive: false });
  });
}

function tickTimers() {
  _timers.forEach(tm => {
    const elapsed = tm.paused ? tm.pausedElapsed : (Date.now() - tm.startTime);
    const isOverTarget = tm.targetMs > 0 && elapsed >= tm.targetMs;

    // Fire alarm when first reaching target
    if (isOverTarget && !tm.alarmFired) {
      tm.alarmFired = true;
      if (tm.playSound) playCdAlarm(tm.soundType);
      renderTimers(); // Re-render for overtime styling
    }

    // If stop at target (not continueAfter) and reached target, freeze at target time
    let displayMs = elapsed;
    if (isOverTarget && !tm.continueAfter) {
      displayMs = tm.targetMs;
      if (!tm.paused) {
        tm.pausedElapsed = tm.targetMs;
        tm.paused = true;
      }
    }

    const totalSec = Math.floor(displayMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const el = document.getElementById('tm-time-' + tm.id);
    if (!el) return;
    if (clockMode === 'vcr') {
      el.innerHTML = buildSeg7Time(h, m, s);
    } else {
      el.textContent = pad(h) + _timeSep + pad(m) + _timeSep + pad(s);
    }

    // Update progress bar
    if (tm.targetMs > 0) {
      const barEl = document.getElementById('tm-bar-' + tm.id);
      if (barEl) {
        const pct = Math.min(100, (elapsed / tm.targetMs) * 100);
        barEl.style.width = pct + '%';
        if (isOverTarget) {
          barEl.style.background = 'var(--danger,#e05252)';
        }
      }
    }

    // Overtime color on time display
    if (isOverTarget) {
      el.style.color = 'var(--danger,#e05252)';
    } else {
      el.style.color = '';
    }
  });
}

function _getTimerColor() {
  return document.documentElement.style.getPropertyValue('--timer-color') || '#2ecc71';
}
function _getCountdownColor() {
  return document.documentElement.style.getPropertyValue('--countdown-color') || getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4a9eff';
}
function _getBgColor() {
  return document.body.style.background || getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#1a1d23';
}

function detachTimer(id) {
  const tm = _timers.find(t => t.id === id);
  if (!tm) return;
  const theme = document.body.className || 'theme-dark';
  const hasTarget = tm.targetMs > 0;
  const timerColor = _getTimerColor();
  const bgColor = _getBgColor();
  // Serialize timer state for self-contained operation
  const tmState = JSON.stringify({
    id: tm.id, label: tm.label, startTime: tm.startTime, paused: tm.paused,
    pausedElapsed: tm.pausedElapsed, targetMs: tm.targetMs, continueAfter: tm.continueAfter,
    playSound: tm.playSound, soundType: tm.soundType, alarmFired: tm.alarmFired,
    laps: tm.laps, lastLapTime: tm.lastLapTime
  });
  const w = window.open('', 'tidslinjal-timer-' + id, 'width=440,height=' + (hasTarget ? '380' : '350') + ',menubar=no,toolbar=no');
  if (!w) return;
  // Mark as detached and remove from parent display
  tm.detached = true;
  tm._detachedWin = w;
  renderTimers();
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Timer — ' + escH(tm.label) + '</title>' +
'<link rel="stylesheet" href="/static/vendor/seven-segment.css">' +
'<style>' +
'body.theme-dark{--bg:#1a1d23;--bg2:#22262e;--text:#e8eaf0;--text-dim:#9098b0;--accent:#4a9eff;--border:#2e3340;--danger:#e05252}' +
'body.theme-light{--bg:#f0f2f5;--bg2:#fff;--text:#1a1d23;--text-dim:#666;--accent:#1a6ed8;--border:#d0d4de;--danger:#c0392b}' +
'body.theme-city-camo{--bg:#2b3325;--bg2:#333d2c;--text:#d4dbc0;--text-dim:#8d9a78;--accent:#8fb85c;--border:#404d34;--danger:#e05252}' +
'body.theme-urban-camo{--bg:#212630;--bg2:#282e3a;--text:#c8d0e0;--text-dim:#7a88a0;--accent:#5c8abf;--border:#333d50;--danger:#e05252}' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:10px}' +
'.tm-label{font-size:1.2rem;color:var(--text-dim)}' +
'.tm-time{font-size:4rem;font-variant-numeric:tabular-nums;font-weight:700}' +
'.tm-progress{width:80%;height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--border);cursor:ns-resize}' +
'.tm-progress-bar{height:100%;transition:width .5s,background .3s;border-radius:4px;pointer-events:none}' +
'.tm-overtime .tm-time{color:var(--danger)}' +
'.tm-overtime .tm-progress-bar{background:var(--danger)!important}' +
'.tm-controls{display:flex;gap:8px}' +
'.tm-controls button{background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 14px;cursor:pointer;font-size:1rem}' +
'.tm-controls button:hover{background:var(--accent);color:#fff;border-color:var(--accent)}' +
'.tm-blink{animation:tmb 1.2s step-end infinite}' +
'@keyframes tmb{0%,100%{opacity:1}50%{opacity:.3}}' +
'.tm-size-bar{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;color:var(--text-dim)}' +
'.tm-size-bar input[type=range]{width:100px;cursor:pointer}' +
'.tm-sz-xs .tm-time{font-size:2rem}.tm-sz-sm .tm-time{font-size:3rem}' +
'.tm-sz-md .tm-time{font-size:4rem}.tm-sz-lg .tm-time{font-size:5.5rem}' +
'.tm-sz-xl .tm-time{font-size:7rem}.tm-sz-xxl .tm-time{font-size:10rem}' +
'.lap-list{font-size:11px;color:var(--text-dim);max-height:100px;overflow-y:auto;width:80%;text-align:left;margin-top:4px}' +
'.lap-row{display:flex;justify-content:space-between;padding:1px 0;border-bottom:1px solid var(--border)}' +
'.lap-num{color:var(--accent);min-width:28px}.lap-split{font-variant-numeric:tabular-nums}.lap-total{color:var(--text-dim);font-variant-numeric:tabular-nums}' +
'.lap-export{display:flex;gap:6px;margin-top:4px}' +
'.lap-export button{background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer}' +
'.lap-export button:hover{background:var(--accent);color:#fff;border-color:var(--accent)}' +
'</style></head><body class="' + theme + ' tm-sz-md">');
  w.document.write('<div class="tm-label" id="tmLabel">' + escH(tm.label) + '</div>' +
'<div class="tm-time" id="tmTime">00:00:00</div>' +
(hasTarget ? '<div class="tm-progress" id="tmProgressWrap"><div class="tm-progress-bar" id="tmBar" style="width:0%;background:' + timerColor + '"></div></div>' : '') +
'<div class="tm-controls">' +
'  <button id="btnPause">' + (tm.paused ? '\u25B6' : '\u23F8') + '</button>' +
'  <button id="btnLap">Lap</button>' +
'  <button id="btnReset">\u21BA</button>' +
'</div>' +
'<div id="lapArea"></div>' +
'<div class="tm-size-bar"><span>Size:</span><input type="range" id="tmSizeSlider" min="0" max="5" value="2" step="1"><span id="tmSizeLbl">M</span></div>');
  w.document.write('<script>' +
'var tm = ' + tmState + ';\n' +
'var timerColor = "' + timerColor + '";\n' +
'function pad(n){return String(n).padStart(2,"0");}\n' +
'function fmtMs(ms){var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60,cs=Math.floor((ms%1000)/10);return pad(h)+":"+pad(m)+":"+pad(sec)+"."+pad(cs);}\n' +
'function tick(){\n' +
'  var elapsed=tm.paused?tm.pausedElapsed:(Date.now()-tm.startTime);\n' +
'  var isOver=tm.targetMs>0&&elapsed>=tm.targetMs;\n' +
'  var displayMs=(isOver&&!tm.continueAfter)?tm.targetMs:elapsed;\n' +
'  var ts=Math.floor(displayMs/1000),h=Math.floor(ts/3600),m=Math.floor((ts%3600)/60),s=ts%60;\n' +
'  var el=document.getElementById("tmTime");\n' +
'  el.textContent=pad(h)+":"+pad(m)+":"+pad(s);\n' +
'  el.classList.toggle("tm-blink",tm.paused);\n' +
'  if(isOver)el.style.color="var(--danger)";else el.style.color="";\n' +
'  if(tm.targetMs>0){\n' +
'    var bar=document.getElementById("tmBar");\n' +
'    if(bar){bar.style.width=Math.min(100,(elapsed/tm.targetMs)*100)+"%";if(isOver)bar.style.background="var(--danger)";}\n' +
'    document.body.classList.toggle("tm-overtime",isOver);\n' +
'  }\n' +
'  document.getElementById("btnPause").textContent=tm.paused?"\\u25B6":"\\u23F8";\n' +
'  // Sync state back to opener if available\n' +
'  try{var ot=window.opener&&window.opener._timers?window.opener._timers.find(function(t){return t.id===tm.id}):null;if(ot){ot.startTime=tm.startTime;ot.paused=tm.paused;ot.pausedElapsed=tm.pausedElapsed;ot.alarmFired=tm.alarmFired;ot.laps=tm.laps;ot.lastLapTime=tm.lastLapTime;ot.targetMs=tm.targetMs;}}catch(e){}\n' +
'  // Fire alarm\n' +
'  if(isOver&&!tm.alarmFired){tm.alarmFired=true;if(tm.playSound)try{window.opener.playCdAlarm(tm.soundType)}catch(e){}}\n' +
'  // Stop at target\n' +
'  if(isOver&&!tm.continueAfter&&!tm.paused){tm.pausedElapsed=tm.targetMs;tm.paused=true;}\n' +
'}\n' +
'document.getElementById("btnPause").onclick=function(){\n' +
'  if(tm.paused){tm.startTime=Date.now()-tm.pausedElapsed;tm.paused=false;}\n' +
'  else{tm.pausedElapsed=Date.now()-tm.startTime;tm.paused=true;}\n' +
'};\n' +
'document.getElementById("btnReset").onclick=function(){\n' +
'  tm.startTime=Date.now();tm.paused=false;tm.pausedElapsed=0;tm.alarmFired=false;tm.laps=[];tm.lastLapTime=tm.startTime;renderLaps();\n' +
'};\n' +
'document.getElementById("btnLap").onclick=function(){\n' +
'  if(tm.paused)return;\n' +
'  var now=Date.now(),totalMs=now-tm.startTime,splitMs=now-tm.lastLapTime;\n' +
'  tm.laps.push({num:tm.laps.length+1,splitMs:splitMs,totalMs:totalMs});\n' +
'  tm.lastLapTime=now;\n' +
'  renderLaps();\n' +
'};\n' +
'function renderLaps(){\n' +
'  var area=document.getElementById("lapArea");if(!area)return;\n' +
'  if(tm.laps.length===0){area.innerHTML="";return;}\n' +
'  var h=\'<div class="lap-list">\';\n' +
'  tm.laps.forEach(function(l){h+=\'<div class="lap-row"><span class="lap-num">#\'+l.num+\'</span><span class="lap-split">\'+fmtMs(l.splitMs)+\'</span><span class="lap-total">\'+fmtMs(l.totalMs)+\'</span></div>\';});\n' +
'  h+="</div>";\n' +
'  h+=\'<div class="lap-export"><button id="btnCsv">CSV</button><button id="btnPrint">Print</button></div>\';\n' +
'  area.innerHTML=h;\n' +
'  document.getElementById("btnCsv").onclick=function(){var csv="Lap,Split,Total\\n";tm.laps.forEach(function(l){csv+=l.num+","+fmtMs(l.splitMs)+","+fmtMs(l.totalMs)+"\\n";});var b=new Blob([csv],{type:"text/csv"});var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=(tm.label||"timer")+"-laps.csv";a.click();};\n' +
'  document.getElementById("btnPrint").onclick=function(){var pw=window.open("","","width=400,height=500");if(!pw)return;var ph="<html><head><title>Laps</title><style>body{font-family:monospace;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;text-align:right}th{background:#eee}</style></head><body><h2>"+tm.label+" — Lap Times</h2><table><tr><th>#</th><th>Split</th><th>Total</th></tr>";tm.laps.forEach(function(l){ph+="<tr><td>"+l.num+"</td><td>"+fmtMs(l.splitMs)+"</td><td>"+fmtMs(l.totalMs)+"</td></tr>";});ph+="</table></body></html>";pw.document.write(ph);pw.document.close();pw.print();};\n' +
'}\n' +
'// Scroll to adjust target on progress bar\n' +
'var pw=document.getElementById("tmProgressWrap");\n' +
'if(pw)pw.addEventListener("wheel",function(e){e.preventDefault();var delta=e.deltaY<0?60000:-60000;tm.targetMs=Math.max(10000,tm.targetMs+delta);tm.alarmFired=false;},{passive:false});\n' +
'// Size slider\n' +
'var tmSzCls=["tm-sz-xs","tm-sz-sm","tm-sz-md","tm-sz-lg","tm-sz-xl","tm-sz-xxl"];\n' +
'var tmSzLbl=["XS","S","M","L","XL","XXL"];\n' +
'document.getElementById("tmSizeSlider").oninput=function(){\n' +
'  var v=parseInt(this.value,10);\n' +
'  document.body.className=document.body.className.replace(/tm-sz-\\S+/g,"").trim()+" "+tmSzCls[v];\n' +
'  document.getElementById("tmSizeLbl").textContent=tmSzLbl[v];\n' +
'};\n' +
'// BroadcastChannel theme sync\n' +
'try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme"){document.body.className=document.body.className.replace(/theme-\\S+/g,"").trim()+" theme-"+(e.data.theme||"dark");}};}catch(e){}\n' +
'// Custom background color\n' +
'document.body.style.background="' + bgColor + '";\n' +
'// On window close: re-attach timer to parent\n' +
'window.addEventListener("beforeunload",function(){\n' +
'  try{var ot=window.opener&&window.opener._timers?window.opener._timers.find(function(t){return t.id===tm.id}):null;if(ot){ot.detached=false;ot._detachedWin=null;window.opener.renderTimers();}}catch(e){}\n' +
'});\n' +
'renderLaps();\n' +
'setInterval(tick,200);tick();\n' +
'<\\/script></body></html>');
  w.document.close();
}

// Timer popover bindings
function showTimerPopover() {
  document.getElementById('timerPopover').style.display = '';
  document.getElementById('timerOverlay').style.display = '';
}
function hideTimerPopover() {
  document.getElementById('timerPopover').style.display = 'none';
  document.getElementById('timerOverlay').style.display = 'none';
}
document.getElementById('btnAddTimer').addEventListener('click', showTimerPopover);
document.getElementById('btnAddSynth').addEventListener('click', function() {
  _showSynthClock = !_showSynthClock;
  this.classList.toggle('active', _showSynthClock);
  rebuildClocks();
  tick();
});
document.getElementById('tmrCancel').addEventListener('click', hideTimerPopover);
document.getElementById('timerOverlay').addEventListener('click', hideTimerPopover);
document.getElementById('tmrStart').addEventListener('click', function() {
  const label = document.getElementById('tmrLabel').value.trim();
  const hours = parseInt(document.getElementById('tmrHours').value, 10) || 0;
  const minutes = parseInt(document.getElementById('tmrMinutes').value, 10) || 0;
  const seconds = parseInt(document.getElementById('tmrSeconds').value, 10) || 0;
  const continueAfter = document.getElementById('tmrContinueAfter').checked;
  const playSound = document.getElementById('tmrPlaySound').checked;
  const soundType = document.getElementById('tmrSoundType')?.value || 'beep';
  addTimer(label, hours, minutes, seconds, continueAfter, playSound, soundType);
  hideTimerPopover();
  document.getElementById('tmrLabel').value = '';
  document.getElementById('tmrHours').value = '0';
  document.getElementById('tmrMinutes').value = '0';
  document.getElementById('tmrSeconds').value = '0';
});
// Timer preset buttons
document.querySelectorAll('.tmr-preset').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const h = parseInt(btn.dataset.h, 10) || 0;
    const m = parseInt(btn.dataset.m, 10) || 0;
    document.getElementById('tmrHours').value = h;
    document.getElementById('tmrMinutes').value = m;
    document.getElementById('tmrSeconds').value = '0';
  });
});
// Timer sound preview
document.getElementById('tmrSoundPreview')?.addEventListener('click', function() {
  const st = document.getElementById('tmrSoundType')?.value || 'beep';
  playCdAlarm(st);
});
// Timer sound row show/hide
document.getElementById('tmrPlaySound')?.addEventListener('change', function() {
  const row = document.getElementById('tmrSoundRow');
  if (row) row.style.display = this.checked ? '' : 'none';
});

// ── Timed Events ────────────────────────────────────────────────────────────
let _timedEvents = []; // { id, eventId, label, startTime, durationMs, alarms (parsed), continueAfter, preShowMs, state, detachedWin, alarmsFired }
let _timedEventsLoaded = false;

function loadTimedEvents() {
  try {
    const events = window.opener?.state?.events || [];
    const now = Date.now();
    events.forEach(ev => {
      if (ev.event_type !== 'timed_event' || !ev.timed_duration_minutes || !ev.start_time) return;
      const start = new Date(ev.start_time).getTime();
      if (isNaN(start)) return;
      const dur = ev.timed_duration_minutes * 60000;
      const endTime = start + dur;
      const preShow = (ev.timed_pre_show_minutes || 5) * 60000;
      // Only load events that haven't ended more than 1 hour ago (if continue_after)
      if (!ev.timed_continue_after && now > endTime) return;
      if (ev.timed_continue_after && now > endTime + 3600000) return;
      // Don't load if more than preShow + 60 min before start
      if (now < start - preShow - 3600000) return;
      // Avoid duplicates
      if (_timedEvents.find(t => t.eventId === ev.id)) return;
      // Parse alarms
      const alarms = (ev.timed_alarms || '').split(',').filter(Boolean).map(a => {
        a = a.trim();
        if (a.endsWith('%')) return { type: 'pct', value: parseFloat(a) };
        return { type: 'min', value: parseFloat(a) };
      });
      _timedEvents.push({
        id: 'te-' + ev.id,
        eventId: ev.id,
        label: ev.title,
        startTime: start,
        durationMs: dur,
        alarms: alarms,
        continueAfter: ev.timed_continue_after !== false,
        preShowMs: preShow,
        state: now < start ? 'waiting' : (now < endTime ? 'running' : 'overtime'),
        detachedWin: null,
        alarmsFired: {},
        acknowledged: false
      });
    });
    _timedEventsLoaded = true;
  } catch(e) { console.error('loadTimedEvents', e); }
}

function tickTimedEvents() {
  const now = Date.now();
  const theme = document.body.className || 'theme-dark';
  _timedEvents.forEach(te => {
    const elapsed = now - te.startTime;
    const remaining = te.durationMs - elapsed;

    // Auto-show detached window before start
    if (te.state === 'waiting' && now >= te.startTime - te.preShowMs && !te.detachedWin) {
      te.detachedWin = openTimedEventWindow(te, theme);
    }
    // Transition to running
    if (te.state === 'waiting' && now >= te.startTime) {
      te.state = 'running';
    }
    // Check alarms
    if (te.state === 'running') {
      te.alarms.forEach((alarm, i) => {
        if (te.alarmsFired[i]) return;
        let trigger = false;
        if (alarm.type === 'min' && remaining <= alarm.value * 60000 && remaining > 0) trigger = true;
        if (alarm.type === 'pct') {
          const pctUsed = (elapsed / te.durationMs) * 100;
          if (pctUsed >= alarm.value) trigger = true;
        }
        if (trigger) {
          te.alarmsFired[i] = true;
          const label = alarm.type === 'min' ? alarm.value + ' min left' : alarm.value + '% used';
          fireTimedAlarm(te, label);
        }
      });
    }
    // Transition to overtime or completed
    if (te.state === 'running' && remaining <= 0) {
      te.state = te.continueAfter ? 'overtime' : 'completed';
      fireTimedAlarm(te, 'Time completed!');
    }
    // Update detached window
    if (te.detachedWin && !te.detachedWin.closed) {
      updateTimedEventWindow(te);
    } else if (te.detachedWin && te.detachedWin.closed) {
      te.detachedWin = null;
    }
  });
}

function fireTimedAlarm(te, label) {
  playCdAlarm('klaxon');
  // Flash the detached window if open
  if (te.detachedWin && !te.detachedWin.closed) {
    try {
      const body = te.detachedWin.document.body;
      body.classList.add('te-flash');
      setTimeout(() => body.classList.remove('te-flash'), 3000);
    } catch(e) {}
  }
}

function openTimedEventWindow(te, theme) {
  const w = window.open('', 'te-' + te.eventId + '-' + Date.now(), 'width=450,height=280,menubar=no,toolbar=no');
  if (!w) return null;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>⏱ ${escH(te.label)}</title>
<style>
body.theme-dark{--bg:#1a1d23;--bg2:#22262e;--text:#e8eaf0;--text-dim:#9098b0;--accent:#4a9eff;--border:#2e3340;--danger:#e05252;--success:#2ecc71}
body.theme-light{--bg:#f0f2f5;--bg2:#fff;--text:#1a1d23;--text-dim:#666;--accent:#1a6ed8;--border:#d0d4de;--danger:#c0392b;--success:#27ae60}
body.theme-city-camo{--bg:#2b3325;--bg2:#333d2c;--text:#d4dbc0;--text-dim:#8d9a78;--accent:#8fb85c;--border:#404d34;--danger:#e05252;--success:#2ecc71}
body.theme-urban-camo{--bg:#212630;--bg2:#282e3a;--text:#c8d0e0;--text-dim:#7a88a0;--accent:#5c8abf;--border:#333d50;--danger:#e05252;--success:#2ecc71}
*{box-sizing:border-box;margin:0;padding:0}
body{background:color-mix(in srgb, var(--accent) 6%, var(--bg));color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:8px;transition:background .3s}
.te-label{font-size:1.1rem;color:var(--text-dim);text-align:center}
.te-status{font-size:.8rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em}
.te-time{font-size:3.5rem;font-variant-numeric:tabular-nums;font-weight:700;transition:color .3s}
.te-progress{width:80%;height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--border)}
.te-progress-bar{height:100%;background:var(--accent);transition:width .5s,background .3s;border-radius:4px}
.te-overtime .te-time{color:var(--danger)}
.te-overtime .te-progress-bar{background:var(--danger)}
.te-waiting .te-time{color:var(--text-dim)}
.te-waiting .te-status{color:var(--accent)}
.te-controls{display:flex;gap:8px;margin-top:4px}
.te-controls button{background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 14px;cursor:pointer;font-size:.9rem}
.te-controls button:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.te-flash{animation:teFlash 0.5s ease-in-out 6}
@keyframes teFlash{0%,100%{background:var(--bg)}50%{background:var(--danger)}}
</style></head><body class="${theme}">
<div class="te-label" id="teLabel">⏱ ${escH(te.label)}</div>
<div class="te-status" id="teStatus">Waiting...</div>
<div class="te-time" id="teTime">--:--:--</div>
<div class="te-progress"><div class="te-progress-bar" id="teBar" style="width:0%"></div></div>
<div class="te-controls">
  <button id="btnPause">⏸</button>
  <button id="btnReset">↺</button>
  <button id="btnAck" style="display:none;background:var(--danger);color:#fff;border-color:var(--danger)">✓ Acknowledge</button>
</div>
<script>
let paused = false, pausedAt = 0;
const teId = '${te.id}';
function pad(n){return String(n).padStart(2,'0');}
document.getElementById('btnPause').onclick = () => {
  try {
    const te = window.opener._timedEvents?.find(t => t.id === teId);
    if (!te) return;
    if (!paused) { paused = true; pausedAt = Date.now(); }
    else { te.startTime += (Date.now() - pausedAt); paused = false; }
    document.getElementById('btnPause').textContent = paused ? '▶' : '⏸';
  } catch(e) {}
};
document.getElementById('btnReset').onclick = () => {
  try {
    const te = window.opener._timedEvents?.find(t => t.id === teId);
    if (!te) return;
    te.startTime = Date.now();
    te.state = 'running';
    te.alarmsFired = {};
    te.acknowledged = false;
    paused = false;
    document.getElementById('btnPause').textContent = '⏸';
    document.getElementById('btnAck').style.display = 'none';
  } catch(e) {}
};
document.getElementById('btnAck').onclick = () => {
  try {
    const te = window.opener._timedEvents?.find(t => t.id === teId);
    if (te) te.acknowledged = true;
    document.getElementById('btnAck').style.display = 'none';
    document.body.classList.remove('te-flash');
  } catch(e) {}
};
// Self-contained tick loop — keeps working even if opener reference breaks
setInterval(() => {
  try {
    const te = window.opener?._timedEvents?.find(t => t.id === teId);
    if (!te) return;
    const now = Date.now();
    const elapsed = now - te.startTime;
    const remaining = te.durationMs - elapsed;
    const pct = Math.min(100, Math.max(0, (elapsed / te.durationMs) * 100));
    const timeEl = document.getElementById('teTime');
    const statusEl = document.getElementById('teStatus');
    const barEl = document.getElementById('teBar');
    const ackBtn = document.getElementById('btnAck');
    if (te.state === 'waiting') {
      const s = Math.floor((te.startTime - now) / 1000);
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (timeEl) timeEl.textContent = '-'+pad(h)+':'+pad(m)+':'+pad(sec);
      if (statusEl) statusEl.textContent = 'Starting in...';
      if (barEl) barEl.style.width = '0%';
      document.body.className = document.body.className.replace(/te-\\w+/g,'') + ' te-waiting';
    } else if (te.state === 'running') {
      const s = Math.max(0, Math.floor(remaining/1000));
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (timeEl) timeEl.textContent = pad(h)+':'+pad(m)+':'+pad(sec);
      if (statusEl) statusEl.textContent = 'In progress';
      if (barEl) barEl.style.width = pct+'%';
      document.body.className = document.body.className.replace(/te-\\w+/g,'');
    } else if (te.state === 'overtime') {
      const overMs = elapsed - te.durationMs;
      const s = Math.floor(overMs/1000);
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (timeEl) timeEl.textContent = '+'+pad(h)+':'+pad(m)+':'+pad(sec);
      if (statusEl) statusEl.textContent = 'Overtime';
      if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--danger)'; }
      document.body.className = document.body.className.replace(/te-\\w+/g,'') + ' te-overtime';
      if (ackBtn && !te.acknowledged) ackBtn.style.display = '';
    } else if (te.state === 'completed') {
      if (timeEl) timeEl.textContent = '00:00:00';
      if (statusEl) statusEl.textContent = 'Completed';
      if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--success)'; }
      if (ackBtn && !te.acknowledged) ackBtn.style.display = '';
    }
  } catch(e) {}
}, 500);
<\/script></body></html>`);
  w.document.close();
  return w;
}
window._timedEvents = _timedEvents;

function updateTimedEventWindow(te) {
  try {
    const w = te.detachedWin;
    if (!w || w.closed) return;
    const now = Date.now();
    const elapsed = now - te.startTime;
    const remaining = te.durationMs - elapsed;
    const pct = Math.min(100, Math.max(0, (elapsed / te.durationMs) * 100));

    const timeEl = w.document.getElementById('teTime');
    const statusEl = w.document.getElementById('teStatus');
    const barEl = w.document.getElementById('teBar');
    const ackBtn = w.document.getElementById('btnAck');

    if (te.state === 'waiting') {
      const untilStart = te.startTime - now;
      const s = Math.floor(untilStart / 1000);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      if (timeEl) timeEl.textContent = '-' + pad(h) + ':' + pad(m) + ':' + pad(sec);
      if (statusEl) statusEl.textContent = 'Starting in...';
      if (barEl) barEl.style.width = '0%';
      w.document.body.className = w.document.body.className.replace(/te-\w+/g, '') + ' te-waiting';
    } else if (te.state === 'running') {
      const s = Math.max(0, Math.floor(remaining / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      if (timeEl) timeEl.textContent = pad(h) + ':' + pad(m) + ':' + pad(sec);
      if (statusEl) statusEl.textContent = 'In progress';
      if (barEl) barEl.style.width = pct + '%';
      w.document.body.className = w.document.body.className.replace(/te-\w+/g, '');
    } else if (te.state === 'overtime') {
      const overMs = elapsed - te.durationMs;
      const s = Math.floor(overMs / 1000);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      if (timeEl) timeEl.textContent = '+' + pad(h) + ':' + pad(m) + ':' + pad(sec);
      if (statusEl) statusEl.textContent = 'Overtime';
      if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--danger)'; }
      w.document.body.className = w.document.body.className.replace(/te-\w+/g, '') + ' te-overtime';
      if (ackBtn && !te.acknowledged) ackBtn.style.display = '';
    } else if (te.state === 'completed') {
      if (timeEl) timeEl.textContent = '00:00:00';
      if (statusEl) statusEl.textContent = 'Completed';
      if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--success)'; }
      if (ackBtn && !te.acknowledged) ackBtn.style.display = '';
    }
  } catch(e) {}
}

// ── Color pickers ────────────────────────────────────────────────────────────
document.getElementById('colorBg')?.addEventListener('input', function() {
  document.body.style.background = this.value;
});
document.getElementById('colorCountdown')?.addEventListener('input', function() {
  document.documentElement.style.setProperty('--countdown-color', this.value);
  document.querySelectorAll('.countdown-card').forEach(card => {
    card.style.background = `color-mix(in srgb, ${this.value} 8%, var(--bg2))`;
    card.style.borderColor = `color-mix(in srgb, ${this.value} 25%, var(--border))`;
  });
});
document.getElementById('colorTimer')?.addEventListener('input', function() {
  document.documentElement.style.setProperty('--timer-color', this.value);
  document.querySelectorAll('.timer-card').forEach(card => {
    card.style.background = `color-mix(in srgb, ${this.value} 8%, var(--bg2))`;
    card.style.borderColor = `color-mix(in srgb, ${this.value} 25%, var(--border))`;
  });
  document.querySelectorAll('.timer-progress-bar').forEach(bar => {
    if (!bar.closest('.timer-overtime')) bar.style.background = this.value;
  });
});
// Set initial color picker values from current theme
try {
  const cs = getComputedStyle(document.body);
  const bgInput = document.getElementById('colorBg');
  if (bgInput) bgInput.value = cs.getPropertyValue('--bg').trim() || '#1a1d23';
  const cdInput = document.getElementById('colorCountdown');
  if (cdInput) cdInput.value = cs.getPropertyValue('--accent').trim() || '#4a9eff';
} catch(e) {}

// Sync time format and separator from opener
try {
  var _opTf = window.opener?.state?.preferences?.time_format;
  if (_opTf === '12h') _hourFormat = '12';
  var _opTs = window.opener?.state?.preferences?.time_separator;
  if (_opTs === 'dot') _timeSep = '.';
} catch(e) {}

// ── Header gear toggle ──────────────────────────────────────────────────────
(function() {
  var gear = document.getElementById('btnGear');
  var panel = document.getElementById('settingsPanel');
  if (gear && panel) {
    gear.addEventListener('click', function() {
      panel.classList.toggle('open');
      gear.classList.toggle('active');
    });
  }
})();

// ── Alarm Clock system ──────────────────────────────────────────────────────
let _alarms = [];
window._alarms = _alarms;
let _nextAlarmId = 1;

function addAlarm(label, targetTime, mode, epochOffset, playSound, soundType, continuePulse) {
  var target = targetTime;
  if (mode === 'epoch_relative') {
    try {
      var ex = window.opener && window.opener.state && window.opener.state.exercise;
      if (ex && ex.epoch) {
        var epochMs = new Date(ex.epoch).getTime();
        target = epochMs + epochOffset;
      } else {
        target = Date.now() + epochOffset;
      }
    } catch(e) { target = Date.now() + epochOffset; }
  }
  var alarm = {
    id: _nextAlarmId++,
    label: label || 'Alarm',
    targetTime: target,
    mode: mode || 'absolute',
    epochOffset: epochOffset || 0,
    playSound: playSound !== false,
    soundType: soundType || 'klaxon',
    continuePulse: continuePulse !== false,
    fired: false,
    acknowledged: false
  };
  _alarms.push(alarm);
  window._alarms = _alarms;
  renderAlarms();
}

function removeAlarm(id) {
  var idx = _alarms.findIndex(function(a) { return a.id === id; });
  if (idx !== -1) _alarms.splice(idx, 1);
  window._alarms = _alarms;
  renderAlarms();
}

function acknowledgeAlarm(id) {
  var al = _alarms.find(function(a) { return a.id === id; });
  if (al) al.acknowledged = true;
  renderAlarms();
}

function renderAlarms() {
  var wrap = document.getElementById('alarmWrap');
  if (!wrap) return;
  if (_alarms.length === 0) { wrap.innerHTML = ''; return; }
  var html = '';
  _alarms.forEach(function(al) {
    var now = _getEffectiveNow().getTime();
    var isFired = now >= al.targetTime;
    var isPast = isFired && !al.acknowledged;
    var classes = ['clock-card', 'alarm-card'];
    if (isPast && al.continuePulse) classes.push('alarm-past');
    else if (isPast) classes.push('alarm-active');
    if (al.acknowledged) classes.push('alarm-acked');

    var remaining = al.targetTime - now;
    var timeText;
    if (!isFired) {
      var s = Math.floor(Math.abs(remaining) / 1000);
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      timeText = pad(h) + _timeSep + pad(m) + _timeSep + pad(sec);
    } else {
      var elapsed = now - al.targetTime;
      var s = Math.floor(elapsed / 1000);
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      timeText = '+' + pad(h) + _timeSep + pad(m) + _timeSep + pad(sec);
    }

    var targetStr = new Date(al.targetTime).toLocaleTimeString();
    html += '<div class="' + classes.join(' ') + '" id="al-card-' + al.id + '">' +
      '<button class="clock-remove" title="Remove" data-rm-al="' + al.id + '">&times;</button>' +
      '<div class="clock-label" style="color:#e67e22">' + escH(al.label) + '</div>' +
      '<div class="clock-time" id="al-time-' + al.id + '" style="' + (isFired ? 'color:var(--danger)' : '') + '">' + timeText + '</div>' +
      '<div class="clock-date" style="font-size:10px">Target: ' + escH(targetStr) + '</div>' +
      (isPast ? '<div class="countdown-controls"><button data-al-ack="' + al.id + '" style="background:var(--danger);color:#fff;border-color:var(--danger)">✓ Acknowledge</button></div>' : '') +
      '</div>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-rm-al]').forEach(function(btn) {
    btn.addEventListener('click', function() { removeAlarm(parseInt(btn.dataset.rmAl, 10)); });
  });
  wrap.querySelectorAll('[data-al-ack]').forEach(function(btn) {
    btn.addEventListener('click', function() { acknowledgeAlarm(parseInt(btn.dataset.alAck, 10)); });
  });
}

function tickAlarms() {
  var now = _getEffectiveNow().getTime();
  _alarms.forEach(function(al) {
    if (!al.fired && now >= al.targetTime) {
      al.fired = true;
      if (al.playSound) playCdAlarm(al.soundType);
      renderAlarms();
    }
    // Update time display
    var el = document.getElementById('al-time-' + al.id);
    if (!el) return;
    if (now < al.targetTime) {
      var rem = al.targetTime - now;
      var s = Math.floor(rem / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      el.textContent = pad(h) + _timeSep + pad(m) + _timeSep + pad(sec);
      el.style.color = '';
    } else {
      var over = now - al.targetTime;
      var s = Math.floor(over / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      el.textContent = '+' + pad(h) + _timeSep + pad(m) + _timeSep + pad(sec);
      el.style.color = 'var(--danger)';
    }
  });
}

// Alarm popover bindings
(function() {
  var btnAdd = document.getElementById('btnAddAlarm');
  var popover = document.getElementById('alarmPopover');
  var overlay = document.getElementById('alarmOverlay');
  var modeSelect = document.getElementById('alMode');
  var absRow = document.getElementById('alAbsoluteRow');
  var relRow = document.getElementById('alRelativeRow');
  if (!btnAdd || !popover) return;
  function showAlarmPopover() { popover.style.display = ''; overlay.style.display = ''; }
  function hideAlarmPopover() { popover.style.display = 'none'; overlay.style.display = 'none'; }
  btnAdd.addEventListener('click', showAlarmPopover);
  document.getElementById('alCancel').addEventListener('click', hideAlarmPopover);
  overlay.addEventListener('click', hideAlarmPopover);
  modeSelect.addEventListener('change', function() {
    absRow.style.display = this.value === 'absolute' ? '' : 'none';
    relRow.style.display = this.value === 'epoch_relative' ? '' : 'none';
  });
  document.getElementById('alPlaySound').addEventListener('change', function() {
    document.getElementById('alSoundRow').style.display = this.checked ? '' : 'none';
  });
  document.getElementById('alStart').addEventListener('click', function() {
    var label = document.getElementById('alLabel').value.trim();
    var mode = modeSelect.value;
    var playSound = document.getElementById('alPlaySound').checked;
    var soundType = document.getElementById('alSoundType').value;
    var continuePulse = document.getElementById('alContinuePulse').checked;
    var targetTime, epochOffset = 0;
    if (mode === 'absolute') {
      var dt = document.getElementById('alTargetTime').value;
      if (!dt) return;
      targetTime = new Date(dt).getTime();
    } else {
      var offsetStr = document.getElementById('alEpochOffset').value.trim();
      var neg = offsetStr.startsWith('-');
      var clean = offsetStr.replace(/^[H+\-]+/, '');
      var parts = clean.split(':');
      var hrs = parseInt(parts[0], 10) || 0;
      var mins = parseInt(parts[1], 10) || 0;
      epochOffset = (hrs * 3600 + mins * 60) * 1000;
      if (neg) epochOffset = -epochOffset;
      targetTime = 0; // will be calculated from epoch
    }
    addAlarm(label, targetTime, mode, epochOffset, playSound, soundType, continuePulse);
    hideAlarmPopover();
    document.getElementById('alLabel').value = '';
  });
})();

// ── Phase Clock system ──────────────────────────────────────────────────────
let _phaseClocks = [];

function addPhaseClock() {
  var phases;
  try { phases = window.opener && window.opener.state && window.opener.state.phases; } catch(e) {}
  if (!phases || phases.length === 0) {
    // Try fetching
    fetch('/api/phases', { credentials: 'include' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(p) { if (p.length > 0) _addPhaseClockWithData(p); })
      .catch(function() {});
    return;
  }
  _addPhaseClockWithData(phases);
}

function _addPhaseClockWithData(phases) {
  if (!phases || phases.length === 0) return;
  // Add clock for the current phase (or next)
  var now = _getEffectiveNow().getTime();
  var current = null;
  phases.forEach(function(p) {
    var start = new Date(p.start_time).getTime();
    var end = new Date(p.end_time).getTime();
    if (now >= start && now <= end) current = p;
  });
  if (!current) {
    // Find next upcoming phase
    var upcoming = phases.filter(function(p) { return new Date(p.start_time).getTime() > now; });
    upcoming.sort(function(a, b) { return new Date(a.start_time).getTime() - new Date(b.start_time).getTime(); });
    if (upcoming.length > 0) current = upcoming[0];
    else current = phases[phases.length - 1];
  }
  _phaseClocks.push({
    id: 'phase-' + (current.id || Date.now()),
    phaseId: current.id,
    phaseName: current.name,
    phaseColor: current.color || 'var(--accent)',
    startTime: new Date(current.start_time).getTime(),
    endTime: new Date(current.end_time).getTime()
  });
  renderPhaseClocks();
}

function removePhaseClockAt(idx) {
  _phaseClocks.splice(idx, 1);
  renderPhaseClocks();
}

function renderPhaseClocks() {
  var wrap = document.getElementById('phaseWrap');
  if (!wrap) return;
  if (_phaseClocks.length === 0) { wrap.innerHTML = ''; return; }
  var html = '';
  _phaseClocks.forEach(function(pc, i) {
    html += '<div class="clock-card phase-card" style="border-left-color:' + escH(pc.phaseColor) + '">' +
      '<button class="clock-remove" data-rm-phase="' + i + '">&times;</button>' +
      '<div class="clock-label" style="color:' + escH(pc.phaseColor) + '">' + escH(pc.phaseName) + '</div>' +
      '<div class="clock-time" id="phase-time-' + i + '">--:--:--</div>' +
      '<div class="timer-progress"><div class="timer-progress-bar" id="phase-bar-' + i + '" style="width:0%;background:' + escH(pc.phaseColor) + '"></div></div>' +
      '<div class="clock-date" id="phase-status-' + i + '"></div>' +
      '</div>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-rm-phase]').forEach(function(btn) {
    btn.addEventListener('click', function() { removePhaseClockAt(parseInt(btn.dataset.rmPhase, 10)); });
  });
}

function tickPhaseClocks() {
  var now = _getEffectiveNow().getTime();
  _phaseClocks.forEach(function(pc, i) {
    var el = document.getElementById('phase-time-' + i);
    var bar = document.getElementById('phase-bar-' + i);
    var status = document.getElementById('phase-status-' + i);
    if (!el) return;
    if (now < pc.startTime) {
      var rem = pc.startTime - now;
      var s = Math.floor(rem / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      el.textContent = '-' + pad(h) + _timeSep + pad(m) + _timeSep + pad(sec);
      if (status) status.textContent = 'Starts in...';
      if (bar) bar.style.width = '0%';
    } else if (now <= pc.endTime) {
      var rem = pc.endTime - now;
      var s = Math.floor(rem / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      el.textContent = pad(h) + _timeSep + pad(m) + _timeSep + pad(sec);
      if (status) status.textContent = 'Remaining';
      var elapsed = now - pc.startTime;
      var total = pc.endTime - pc.startTime;
      if (bar && total > 0) bar.style.width = Math.min(100, (elapsed / total) * 100) + '%';
    } else {
      var over = now - pc.endTime;
      var s = Math.floor(over / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      el.textContent = '+' + pad(h) + _timeSep + pad(m) + _timeSep + pad(sec);
      el.style.color = 'var(--danger)';
      if (status) status.textContent = 'Phase ended';
      if (bar) { bar.style.width = '100%'; bar.style.background = 'var(--danger)'; }
    }
  });
}

// Phase clock button binding
(function() {
  var btn = document.getElementById('btnAddPhase');
  if (btn) btn.addEventListener('click', addPhaseClock);
})();

// ── Narrative Clock system ──────────────────────────────────────────────────
let _narrativeClocks = [];
let _narrativeData = null;
let _narrativeLastFetch = 0;

function addNarrativeClock() {
  _narrativeClocks.push({
    id: 'narr-' + Date.now(),
    label: 'Narrative',
    maxEntries: 8
  });
  renderNarrativeClocks();
  fetchNarrativeData();
}

function removeNarrativeClockAt(idx) {
  _narrativeClocks.splice(idx, 1);
  renderNarrativeClocks();
}

function fetchNarrativeData() {
  if (Date.now() - _narrativeLastFetch < 15000) return;
  _narrativeLastFetch = Date.now();
  fetch('/api/narrative?limit=20', { credentials: 'include' })
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) { _narrativeData = data; renderNarrativeClocks(); })
    .catch(function() {});
}

function renderNarrativeClocks() {
  var wrap = document.getElementById('narrativeWrap');
  if (!wrap) return;
  if (_narrativeClocks.length === 0) { wrap.innerHTML = ''; return; }
  var html = '';
  _narrativeClocks.forEach(function(nc, i) {
    var entries = (_narrativeData || []).slice(0, nc.maxEntries);
    var listHtml = '';
    entries.forEach(function(e) {
      var ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
      var icon = e.type === 'event_started' ? '▶' : e.type.startsWith('decision') ? '⚖' : '•';
      var sev = e.severity === 'critical' ? 'color:var(--danger)' : e.severity === 'warning' ? 'color:#e67e22' : '';
      listHtml += '<div style="display:flex;gap:6px;padding:2px 0;border-bottom:1px solid var(--border);font-size:10px">' +
        '<span style="color:var(--text-dim);min-width:50px">' + escH(ts) + '</span>' +
        '<span>' + icon + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + sev + '">' + escH(e.summary || '') + '</span>' +
        '</div>';
    });
    if (!entries.length) listHtml = '<div style="text-align:center;color:var(--text-dim);font-size:11px;padding:8px">No narrative entries</div>';
    html += '<div class="clock-card narrative-card" style="min-width:280px;text-align:left">' +
      '<button class="clock-remove" data-rm-narr="' + i + '">&times;</button>' +
      '<div class="clock-label" style="color:#9b59b6">Narrative / Scenario</div>' +
      '<div style="max-height:150px;overflow-y:auto">' + listHtml + '</div>' +
      '</div>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-rm-narr]').forEach(function(btn) {
    btn.addEventListener('click', function() { removeNarrativeClockAt(parseInt(btn.dataset.rmNarr, 10)); });
  });
}

(function() {
  var btn = document.getElementById('btnAddNarrative');
  if (btn) btn.addEventListener('click', addNarrativeClock);
})();

// ── F1 Start Clock system ───────────────────────────────────────────────────
let _f1Starts = [];
let _nextF1Id = 1;

function addF1Start(label, numLights, countdownSec) {
  var totalMs = countdownSec * 1000;
  var f1 = {
    id: _nextF1Id++,
    label: label || 'F1 START',
    numLights: numLights || 5,
    countdownSeconds: countdownSec || 10,
    targetTime: Date.now() + totalMs,
    state: 'countdown', // countdown → sequence → go → done
    litCount: 0,
    lastLightAt: 0,
    goAt: 0,
    goDelay: 500 + Math.random() * 2500 // random 0.5-3s
  };
  _f1Starts.push(f1);
  renderF1Starts();
}

function removeF1Start(id) {
  var idx = _f1Starts.findIndex(function(f) { return f.id === id; });
  if (idx !== -1) _f1Starts.splice(idx, 1);
  renderF1Starts();
}

function resetF1Start(id) {
  var f1 = _f1Starts.find(function(f) { return f.id === id; });
  if (!f1) return;
  f1.targetTime = Date.now() + f1.countdownSeconds * 1000;
  f1.state = 'countdown';
  f1.litCount = 0;
  f1.lastLightAt = 0;
  f1.goAt = 0;
  f1.goDelay = 500 + Math.random() * 2500;
  renderF1Starts();
}

function renderF1Starts() {
  var wrap = document.getElementById('f1Wrap');
  if (!wrap) return;
  if (_f1Starts.length === 0) { wrap.innerHTML = ''; return; }
  var html = '';
  _f1Starts.forEach(function(f1) {
    var lights = '';
    for (var i = 0; i < f1.numLights; i++) {
      var cls = 'f1-light';
      if (f1.state === 'sequence' && i < f1.litCount) cls += ' on';
      if (f1.state === 'go') cls += ' go';
      lights += '<div class="' + cls + '" id="f1-light-' + f1.id + '-' + i + '"></div>';
    }
    html += '<div class="clock-card f1-card" style="min-width:220px" id="f1-card-' + f1.id + '">' +
      '<button class="clock-remove" data-rm-f1="' + f1.id + '">&times;</button>' +
      '<div class="clock-label" style="color:#e74c3c">' + escH(f1.label) + '</div>' +
      '<div class="f1-lights" id="f1-lights-' + f1.id + '">' + lights + '</div>' +
      '<div class="clock-time" id="f1-time-' + f1.id + '" style="font-size:inherit">--</div>' +
      '<div class="countdown-controls">' +
      '<button data-f1-reset="' + f1.id + '">↺ Reset</button>' +
      '</div></div>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-rm-f1]').forEach(function(btn) {
    btn.addEventListener('click', function() { removeF1Start(parseInt(btn.dataset.rmF1, 10)); });
  });
  wrap.querySelectorAll('[data-f1-reset]').forEach(function(btn) {
    btn.addEventListener('click', function() { resetF1Start(parseInt(btn.dataset.f1Reset, 10)); });
  });
}

function tickF1Starts() {
  var now = Date.now();
  _f1Starts.forEach(function(f1) {
    var timeEl = document.getElementById('f1-time-' + f1.id);
    if (f1.state === 'countdown') {
      var rem = f1.targetTime - now;
      if (rem <= 0) {
        f1.state = 'sequence';
        f1.lastLightAt = now;
        f1.litCount = 0;
      } else {
        var s = Math.ceil(rem / 1000);
        if (timeEl) timeEl.textContent = s + 's';
      }
    } else if (f1.state === 'sequence') {
      // Light one light per second
      if (now - f1.lastLightAt >= 1000 && f1.litCount < f1.numLights) {
        f1.litCount++;
        f1.lastLightAt = now;
        // Update light DOM
        var lightEl = document.getElementById('f1-light-' + f1.id + '-' + (f1.litCount - 1));
        if (lightEl) lightEl.classList.add('on');
        if (f1.litCount >= f1.numLights) {
          f1.goAt = now + f1.goDelay;
        }
      }
      if (f1.litCount >= f1.numLights && now >= f1.goAt) {
        f1.state = 'go';
        // All lights go green
        for (var i = 0; i < f1.numLights; i++) {
          var le = document.getElementById('f1-light-' + f1.id + '-' + i);
          if (le) { le.classList.remove('on'); le.classList.add('go'); }
        }
        if (timeEl) { timeEl.textContent = 'GO!'; timeEl.style.color = '#00ff00'; }
        playCdAlarm('beep');
        setTimeout(function() {
          f1.state = 'done';
          for (var i = 0; i < f1.numLights; i++) {
            var le = document.getElementById('f1-light-' + f1.id + '-' + i);
            if (le) le.classList.remove('go');
          }
        }, 2000);
      } else if (f1.litCount < f1.numLights) {
        if (timeEl) timeEl.textContent = 'SEQUENCE';
      } else {
        if (timeEl) { timeEl.textContent = 'HOLD'; timeEl.style.color = '#ff0000'; }
      }
    } else if (f1.state === 'done') {
      if (timeEl) { timeEl.textContent = 'DONE'; timeEl.style.color = ''; }
    }
  });
}

// F1 popover bindings
(function() {
  var btn = document.getElementById('btnAddF1');
  var popover = document.getElementById('f1Popover');
  var overlay = document.getElementById('f1Overlay');
  if (!btn || !popover) return;
  function show() { popover.style.display = ''; overlay.style.display = ''; }
  function hide() { popover.style.display = 'none'; overlay.style.display = 'none'; }
  btn.addEventListener('click', show);
  document.getElementById('f1Cancel').addEventListener('click', hide);
  overlay.addEventListener('click', hide);
  document.getElementById('f1Start').addEventListener('click', function() {
    var label = document.getElementById('f1Label').value.trim();
    var numLights = parseInt(document.getElementById('f1NumLights').value, 10) || 5;
    var countdownSec = parseInt(document.getElementById('f1CountdownSec').value, 10) || 10;
    addF1Start(label, numLights, countdownSec);
    hide();
    document.getElementById('f1Label').value = '';
  });
})();

// ── Drag-to-detach clocks ───────────────────────────────────────────────────
let _dragState = null;

function initDragToDetach() {
  document.addEventListener('mousedown', function(e) {
    var card = e.target.closest('.clock-card');
    if (!card || e.target.closest('.clock-remove') || e.target.closest('button') || e.target.closest('input')) return;
    _dragState = { card: card, startX: e.clientX, startY: e.clientY, dragging: false };
  });
  document.addEventListener('mousemove', function(e) {
    if (!_dragState) return;
    var dx = e.clientX - _dragState.startX;
    var dy = e.clientY - _dragState.startY;
    if (Math.abs(dx) > 50 || Math.abs(dy) > 50) {
      _dragState.dragging = true;
      _dragState.card.classList.add('dragging');
    }
  });
  document.addEventListener('mouseup', function(e) {
    if (!_dragState || !_dragState.dragging) { _dragState = null; return; }
    _dragState.card.classList.remove('dragging');
    // Check if mouse is near window edge
    var margin = 40;
    var nearEdge = e.clientX < margin || e.clientY < margin ||
      e.clientX > window.innerWidth - margin || e.clientY > window.innerHeight - margin;
    if (nearEdge) {
      var card = _dragState.card;
      // Determine clock type and detach
      if (card.id && card.id.startsWith('cd-card-')) {
        var cdId = parseInt(card.id.replace('cd-card-', ''), 10);
        detachCountdown(cdId);
      } else if (card.id && card.id.startsWith('tm-card-')) {
        var tmId = parseInt(card.id.replace('tm-card-', ''), 10);
        detachTimer(tmId);
      } else if (card.id && card.id.startsWith('card-') && card.id !== 'card-main' && card.id !== 'card-synth') {
        var ecId = parseInt(card.id.replace('card-', ''), 10);
        _detachExtraClock(ecId);
      } else if (card.id === 'card-main') {
        _detachMainClock();
      }
    }
    _dragState = null;
  });
}

function _detachMainClock() {
  var isUTC = _localIsUTC || false;
  var theme = document.body.className || 'theme-dark';
  var w = window.open('', 'tidslinjal-main-clock-' + Date.now(), 'width=300,height=200,menubar=no,toolbar=no');
  if (!w) return;
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Clock</title>' +
    '<style>body{background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}' +
    'body.theme-dark{--bg:#1a1d23;--text:#e8eaf0;--text-dim:#9098b0;--accent:#4a9eff}' +
    'body.theme-light{--bg:#f0f2f5;--text:#1a1d23;--text-dim:#666;--accent:#1a6ed8}' +
    '.t{font-size:3rem;font-weight:700;font-variant-numeric:tabular-nums}.d{font-size:11px;color:var(--text-dim);margin-top:4px}.z{font-size:11px;color:var(--accent);margin-top:2px}' +
    '</style></head><body class="' + theme + '">' +
    '<div class="t" id="t">--:--:--</div><div class="d" id="d"></div><div class="z" id="z"></div>' +
    '<script>var utc=' + isUTC + ';function p(n){return String(n).padStart(2,"0");}' +
    'setInterval(function(){var n=new Date();var h,m,s,tz,d;' +
    'if(utc){h=n.getUTCHours();m=n.getUTCMinutes();s=n.getUTCSeconds();tz="UTC/Z";d=n.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"});}' +
    'else{h=n.getHours();m=n.getMinutes();s=n.getSeconds();tz="Local";d=n.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});}' +
    'document.getElementById("t").textContent=p(h)+":"+p(m)+":"+p(s);' +
    'document.getElementById("d").textContent=d;document.getElementById("z").textContent=tz;},1000);' +
    'try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme")document.body.className="theme-"+(e.data.theme||"dark")};}catch(e){}' +
    '<\\/script></body></html>');
  w.document.close();
}

function _detachExtraClock(ecId) {
  var extra;
  try { extra = (window.opener && window.opener.state && window.opener.state.preferences && window.opener.state.preferences.extra_clocks) || []; } catch(e) { extra = []; }
  var ec = extra.find(function(c) { return c.id === ecId; });
  if (!ec) return;
  var theme = document.body.className || 'theme-dark';
  var w = window.open('', 'tidslinjal-ec-' + ecId + '-' + Date.now(), 'width=300,height=200,menubar=no,toolbar=no');
  if (!w) return;
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escH(ec.label || ec.timezone) + '</title>' +
    '<style>body{background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}' +
    'body.theme-dark{--bg:#1a1d23;--text:#e8eaf0;--text-dim:#9098b0;--accent:#4a9eff}' +
    'body.theme-light{--bg:#f0f2f5;--text:#1a1d23;--text-dim:#666;--accent:#1a6ed8}' +
    '.l{font-size:11px;color:var(--accent);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}' +
    '.t{font-size:3rem;font-weight:700;font-variant-numeric:tabular-nums}.z{font-size:11px;color:var(--accent);margin-top:2px}' +
    '</style></head><body class="' + theme + '">' +
    '<div class="l">' + escH(ec.label || ec.timezone) + '</div>' +
    '<div class="t" id="t">--:--:--</div><div class="z" id="z"></div>' +
    '<script>var tz="' + escH(ec.timezone) + '";function p(n){return String(n).padStart(2,"0");}' +
    'setInterval(function(){var n=new Date();try{' +
    'var h=parseInt(n.toLocaleTimeString("en-GB",{hour:"2-digit",hour12:false,timeZone:tz}),10)||0;' +
    'var m=parseInt(n.toLocaleTimeString("en-GB",{minute:"2-digit",hour12:false,timeZone:tz}),10)||0;' +
    'var s=parseInt(n.toLocaleTimeString("en-GB",{second:"2-digit",hour12:false,timeZone:tz}),10)||0;' +
    'document.getElementById("t").textContent=p(h)+":"+p(m)+":"+p(s);' +
    'var tzl=n.toLocaleTimeString("en-GB",{timeZoneName:"short",timeZone:tz}).split(" ").pop();' +
    'document.getElementById("z").textContent=tzl;}catch(e){document.getElementById("t").textContent="??:??:??";}},1000);' +
    'try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme")document.body.className="theme-"+(e.data.theme||"dark")};}catch(e){}' +
    '<\\/script></body></html>');
  w.document.close();
}

initDragToDetach();

// ── Country flag background for timezone clocks ─────────────────────────────
// Adds a flag watermark behind timezone clocks. Activated by clicking the flag in the label.
// Done in rebuildClocks — we inject data-flag-bg attribute and CSS handles the rest via ::before

// ── Clock pinning / attach ──────────────────────────────────────────────────
function pinClock(type, id, config) {
  try {
    var bc = new BroadcastChannel('tidslinjal-sync');
    bc.postMessage({ type: 'pin-clock', clockType: type, clockId: id, clockConfig: config });
    bc.close();
  } catch(e) {}
}

// ── Per-clock background color ──────────────────────────────────────────────
let _clockColors = {};

// Extend rebuildClocks to add per-clock color pickers and flag backgrounds
var _origRebuildClocks = rebuildClocks;
rebuildClocks = function() {
  _origRebuildClocks();
  // Add flag backgrounds to extra clock cards
  var wrap = document.getElementById('clocksWrap');
  if (!wrap) return;
  var data = getClockData();
  if (data.showFlags) {
    data.extra.forEach(function(ec) {
      var card = document.getElementById('card-' + ec.id);
      if (!card) return;
      var flag = _getClockFlag(ec.timezone);
      if (flag) card.setAttribute('data-flag-bg', flag);
    });
  }
  // Add hover color pickers to all clock cards
  wrap.querySelectorAll('.clock-card').forEach(function(card) {
    if (card.querySelector('.clock-color-picker')) return;
    var picker = document.createElement('span');
    picker.className = 'clock-color-picker';
    picker.innerHTML = '<input type="color" title="Background color" value="#22262e" data-color-type="bg">' +
      '<span class="clock-pin" title="Pin/attach this clock">📌</span>';
    card.appendChild(picker);
    picker.querySelector('[data-color-type="bg"]').addEventListener('input', function() {
      card.style.background = this.value;
    });
    picker.querySelector('.clock-pin').addEventListener('click', function(e) {
      e.stopPropagation();
      var clockId = card.id || 'unknown';
      pinClock('clock', clockId, { label: card.querySelector('.clock-label')?.textContent || '' });
    });
  });
};

// Initial build + start ticking
rebuildClocks();
applySize(2);
loadEventCountdowns();
loadTimedEvents();
tick();
setInterval(function() {
  tick();
  tickCountdowns();
  tickTimers();
  tickTimedEvents();
  tickAlarms();
  tickPhaseClocks();
  tickF1Starts();
}, 1000);
// Reload timed events and narrative periodically
setInterval(loadTimedEvents, 30000);
setInterval(function() { if (_narrativeClocks.length > 0) fetchNarrativeData(); }, 30000);
