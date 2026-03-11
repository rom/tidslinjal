'use strict';

/* ── Seven-segment digit builder ── */
// Segment map: which segments are ON for each digit (a,b,c,d,e,f,g)
const SEG_MAP = {
  '0':[1,1,1,1,1,1,0], '1':[0,1,1,0,0,0,0], '2':[1,1,0,1,1,0,1],
  '3':[1,1,1,1,0,0,1], '4':[0,1,1,0,0,1,1], '5':[1,0,1,1,0,1,1],
  '6':[1,0,1,1,1,1,1], '7':[1,1,1,0,0,0,0], '8':[1,1,1,1,1,1,1],
  '9':[1,1,1,1,0,1,1], '-':[0,0,0,0,0,0,1]
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

/* ── State ── */
let clockMode = 'digital'; // 'digital' | 'analog' | 'vcr'
const sizeClasses = ['sz-xs','sz-sm','sz-md','sz-lg','sz-xl'];
const sizeLabels  = ['XS','S','M','L','XL'];
let currentStyle = '';
let showDigits = false;
let vcrColor = 'red';
let _lastLang = '';

function pad(n) { return String(n).padStart(2,'0'); }

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
    const isUTC = op?._clockUTC || false;
    const extra = op?.state?.preferences?.extra_clocks || [];
    return { isUTC, extra };
  } catch(e) { return { isUTC:false, extra:[] }; }
}

/* ── Toggle local/Zulu time via opener ── */
function toggleUTC() {
  try {
    if (typeof window.opener?.toggleClockTZ === 'function') {
      window.opener.toggleClockTZ();
    }
  } catch(e) {}
  tick();
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
      <div class="clock-label vcr-label clock-label-click" id="main-label" title="${toggleTip}">${isUTC?'UTC/Z':escH(_t('clock_local'))}</div>
      <div class="clock-time vcr-time" id="vcr-main-seg">${buildSeg7Time(0,0,0)}</div>
      <div class="clock-date vcr-date" id="main-date"></div>
      <div class="clock-tz vcr-tz" id="main-tz"></div>
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
        <div class="clock-label vcr-label">${escH(ec.label||ec.timezone)}</div>
        <div class="clock-time vcr-time" id="vcr-ec-${ec.id}-seg">${buildSeg7Time(0,0,0)}</div>
        <div class="clock-tz vcr-tz" id="ec-${ec.id}-tz"></div>
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
  const now = new Date();
  const locale = _getLocale();

  if (1 + extra.length !== _lastClockCount || clockMode !== _lastMode) {
    rebuildClocks();
  }

  const lbl = document.getElementById('main-label');
  if (lbl) lbl.textContent = isUTC ? 'UTC/Z' : _t('clock_local');

  let h, m, s, dateStr, tzLabel, timeStr;
  if (isUTC) {
    h=now.getUTCHours(); m=now.getUTCMinutes(); s=now.getUTCSeconds();
    timeStr = pad(h)+pad(m)+pad(s)+'Z';
    dateStr = now.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    tzLabel = 'UTC/Z';
  } else {
    h=now.getHours(); m=now.getMinutes(); s=now.getSeconds();
    timeStr = pad(h)+':'+pad(m)+':'+pad(s);
    dateStr = now.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    try { tzLabel=now.toLocaleTimeString(locale,{timeZoneName:'short'}).split(' ').pop(); } catch{tzLabel='';}
  }

  if (clockMode === 'analog') {
    updateAnalog('svg-main', h, m, s);
    updateDeadlineIndicators('svg-main', isUTC);
  } else if (clockMode === 'vcr') {
    const segEl=document.getElementById('vcr-main-seg'); if(segEl) segEl.innerHTML=buildSeg7Time(h,m,s);
  } else {
    const t=document.getElementById('main-time'); if(t)t.textContent=timeStr;
  }
  const d=document.getElementById('main-date'); if(d)d.textContent=dateStr;
  const z=document.getElementById('main-tz');   if(z)z.textContent=tzLabel;

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
        const segEl=document.getElementById('vcr-ec-'+ec.id+'-seg'); if(segEl) segEl.innerHTML=buildSeg7Time(ecH,ecM,ecS);
      } else {
        const t=document.getElementById('ec-'+ec.id+'-time'); if(t)t.textContent=ecTStr;
      }
      const z=document.getElementById('ec-'+ec.id+'-tz'); if(z)z.textContent=ecTZ;
    } catch(e) {
      const t=document.getElementById('ec-'+ec.id+'-time'); if(t)t.textContent='??:??:??';
    }
  });
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

// Initial build + start ticking
rebuildClocks();
applySize(2);
tick();
setInterval(tick, 1000);
