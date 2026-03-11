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
const sizeClasses = ['sz-xs','sz-sm','sz-md','sz-lg','sz-xl'];
const sizeLabels  = ['XS','S','M','L','XL'];
let currentStyle = '';
let showDigits = true;
let vcrColor = 'red';
let _lastLang = '';
let _localIsUTC = null; // null = follow opener, true/false = local override
let _hourFormat = '24'; // '24' | '12'

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
  const m = { en:'en-GB', sv:'sv-SE', fr:'fr-FR' };
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
    return { isUTC, extra };
  } catch(e) { return { isUTC: _localIsUTC || false, extra:[] }; }
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
  return pad(h12) + ':' + pad(m) + ':' + pad(s) + ' ' + ampm;
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
    if (clockMode === 'analog') {
      html += `<div class="clock-card" id="card-${ec.id}">
        <button class="clock-remove" title="${removeTip}" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label">${escH(ec.label||ec.timezone)}</div>
        <div class="analog-wrap">${buildAnalogSVG('svg-'+ec.id)}</div>
        <div class="clock-tz" id="ec-${ec.id}-tz"></div>
      </div>`;
    } else if (clockMode === 'vcr') {
      html += `<div class="clock-card vcr-card" id="card-${ec.id}">
        <button class="clock-remove" title="${removeTip}" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label vcr-label">${buildSeg7Text(ec.label||ec.timezone)}</div>
        <div class="clock-time vcr-time" id="vcr-ec-${ec.id}-seg">${buildSeg7Time(0,0,0)}</div>
        <div class="clock-tz vcr-tz" id="ec-${ec.id}-tz">${buildSeg7Text('--')}</div>
      </div>`;
    } else {
      html += `<div class="clock-card" id="card-${ec.id}">
        <button class="clock-remove" title="${removeTip}" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label">${escH(ec.label||ec.timezone)}</div>
        <div class="clock-time" id="ec-${ec.id}-time">--:--:--</div>
        <div class="clock-tz" id="ec-${ec.id}-tz"></div>
      </div>`;
    }
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-rm-clock]').forEach(btn => {
    btn.addEventListener('click', () => removeClock(parseInt(btn.dataset.rmClock, 10)));
  });
  const mainLbl = document.getElementById('main-label');
  if (mainLbl) mainLbl.addEventListener('click', toggleUTC);
}

function escH(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Main tick function ── */
function tick() {
  syncTheme();
  syncLanguage();
  const {isUTC, extra} = getClockData();
  const now = _getEffectiveNow();
  const locale = _getLocale();

  if (1 + extra.length !== _lastClockCount || clockMode !== _lastMode) {
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
      timeStr = pad(h)+':'+pad(m)+':'+pad(s);
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
        ecTStr = ecTime.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:ec.timezone});
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
}

/* ── Countdown timer system ── */
let _countdowns = []; // { id, label, targetTime, totalMs, continueUp, playSound, paused, pausedRemaining, acknowledged }
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
  renderCountdowns();
}

function removeCountdown(id) {
  _countdowns = _countdowns.filter(cd => cd.id !== id);
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
  _countdowns = _countdowns.filter(c => c.id !== id);
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
  const w = window.open('', 'cd-' + id + '-' + Date.now(), 'width=400,height=250,menubar=no,toolbar=no');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Countdown — ${escH(cd.label)}</title>
<link rel="stylesheet" href="/static/vendor/seven-segment.css">
<style>
body.theme-dark{--bg:#1a1d23;--bg2:#22262e;--text:#e8eaf0;--text-dim:#9098b0;--accent:#4a9eff;--border:#2e3340;--danger:#e05252}
body.theme-light{--bg:#f0f2f5;--bg2:#fff;--text:#1a1d23;--text-dim:#666;--accent:#1a6ed8;--border:#d0d4de;--danger:#c0392b}
body.theme-city-camo{--bg:#2b3325;--bg2:#333d2c;--text:#d4dbc0;--text-dim:#8d9a78;--accent:#8fb85c;--border:#404d34;--danger:#e05252}
body.theme-urban-camo{--bg:#212630;--bg2:#282e3a;--text:#c8d0e0;--text-dim:#7a88a0;--accent:#5c8abf;--border:#333d50;--danger:#e05252}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px}
.cd-label{font-size:1.2rem;color:var(--text-dim)}
.cd-time{font-size:4rem;font-variant-numeric:tabular-nums;font-weight:700}
.cd-controls{display:flex;gap:8px}
.cd-controls button{background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 14px;cursor:pointer;font-size:1rem}
.cd-controls button:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.cd-overtime{color:var(--danger)}
.cd-blink{animation:cdb 1.2s step-end infinite}
@keyframes cdb{0%,100%{opacity:1}50%{opacity:.3}}
</style></head><body class="${theme}">
<div class="cd-label" id="cdLabel">${escH(cd.label)}</div>
<div class="cd-time" id="cdTime">00:00:00</div>
<div class="cd-controls">
  <button id="btnPause">${cd.paused ? '\u25B6' : '\u23F8'}</button>
  <button id="btnReset">\u21BA</button>
</div>
<script>
const cdId = ${cd.id};
function pad(n){return String(n).padStart(2,'0');}
function tick(){
  try {
    const cd = window.opener._countdowns?.find(c=>c.id===cdId);
    if(!cd){document.getElementById('cdTime').textContent='--:--:--';return;}
    let ms,isOT=false;
    if(cd.paused){ms=Math.max(0,cd.pausedRemaining);}
    else{const rem=cd.targetTime-Date.now();if(rem>0){ms=rem;}else{isOT=cd.continueUp;ms=isOT?-rem:0;}}
    const ts=Math.floor(ms/1000),h=Math.floor(ts/3600),m=Math.floor((ts%3600)/60),s=ts%60;
    const el=document.getElementById('cdTime');
    el.textContent=(isOT?'+':'')+pad(h)+':'+pad(m)+':'+pad(s);
    el.classList.toggle('cd-overtime',isOT);
    el.classList.toggle('cd-blink',cd.paused);
    document.getElementById('btnPause').textContent=cd.paused?'\u25B6':'\u23F8';
  }catch(e){}
}
document.getElementById('btnPause').onclick=()=>{try{window.opener.togglePauseCountdown(cdId);window.opener.renderCountdowns();}catch(e){}};
document.getElementById('btnReset').onclick=()=>{try{window.opener.resetCountdown(cdId);}catch(e){}};
setInterval(tick,200);tick();
<\/script></body></html>`);
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
  if (_countdowns.length === 0) { wrap.innerHTML = ''; return; }
  let html = '';
  _countdowns.forEach(cd => {
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

    html += `<div class="${classes.join(' ')}" id="cd-card-${cd.id}">
      <button class="clock-remove" title="Remove" data-rm-cd="${cd.id}">&times;</button>
      ${labelHtml}
      ${timeDisplay}
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
    el.textContent = prefix + pad(h) + ':' + pad(m) + ':' + pad(s);
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

// Initial build + start ticking
rebuildClocks();
applySize(2);
loadEventCountdowns();
tick();
setInterval(function() { tick(); tickCountdowns(); }, 1000);
