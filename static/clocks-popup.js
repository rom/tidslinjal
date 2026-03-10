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
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="currentColor" stroke-opacity=".5" stroke-width="${w}"/>`;
  }).join('');
  return `<svg viewBox="0 0 100 100" class="analog-face" id="${id}">
  <circle cx="50" cy="50" r="49" fill="var(--bg3)" stroke="var(--border)" stroke-width="1.5"/>
  ${ticks}
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
    html += `<div class="clock-card" id="card-main">
      <div class="clock-label" id="main-label">${isUTC?'UTC/Z':'Local Time'}</div>
      <div class="analog-wrap">${buildAnalogSVG('svg-main')}</div>
      <div class="clock-date" id="main-date"></div>
      <div class="clock-tz" id="main-tz"></div>
    </div>`;
  } else if (clockMode === 'vcr') {
    html += `<div class="clock-card vcr-card" id="card-main">
      <div class="clock-label vcr-label" id="main-label">${isUTC?'UTC/Z':'LOCAL'}</div>
      <div class="clock-time vcr-time"><span id="vcr-main-h">--</span><span class="vcr-colon">:</span><span id="vcr-main-m">--</span><span class="vcr-colon">:</span><span id="vcr-main-s">--</span></div>
      <div class="clock-date vcr-date" id="main-date"></div>
      <div class="clock-tz vcr-tz" id="main-tz"></div>
    </div>`;
  } else {
    html += `<div class="clock-card" id="card-main">
      <div class="clock-label" id="main-label">${isUTC?'UTC/Z':'Local Time'}</div>
      <div class="clock-time" id="main-time">--:--:--</div>
      <div class="clock-date" id="main-date"></div>
      <div class="clock-tz" id="main-tz"></div>
    </div>`;
  }
  // Extra clocks
  extra.forEach(ec => {
    if (clockMode === 'analog') {
      html += `<div class="clock-card" id="card-${ec.id}">
        <button class="clock-remove" title="Remove this clock" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label">${escH(ec.label||ec.timezone)}</div>
        <div class="analog-wrap">${buildAnalogSVG('svg-'+ec.id)}</div>
        <div class="clock-tz" id="ec-${ec.id}-tz"></div>
      </div>`;
    } else if (clockMode === 'vcr') {
      html += `<div class="clock-card vcr-card" id="card-${ec.id}">
        <button class="clock-remove" title="Remove this clock" data-rm-clock="${ec.id}">&times;</button>
        <div class="clock-label vcr-label">${escH(ec.label||ec.timezone)}</div>
        <div class="clock-time vcr-time"><span id="vcr-ec-${ec.id}-h">--</span><span class="vcr-colon">:</span><span id="vcr-ec-${ec.id}-m">--</span><span class="vcr-colon">:</span><span id="vcr-ec-${ec.id}-s">--</span></div>
        <div class="clock-tz vcr-tz" id="ec-${ec.id}-tz"></div>
      </div>`;
    } else {
      html += `<div class="clock-card" id="card-${ec.id}">
        <button class="clock-remove" title="Remove this clock" data-rm-clock="${ec.id}">&times;</button>
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

// Bind toolbar controls (CSP-safe, no inline handlers)
document.getElementById('selStyle').addEventListener('change', function() { applyStyle(this.value); });
document.querySelectorAll('[data-mode]').forEach(function(btn) {
  btn.addEventListener('click', function() { setMode(btn.dataset.mode); });
});
var slider = document.getElementById('sizeSlider');
slider.addEventListener('input', function() { applySize(this.value); });
slider.addEventListener('change', function() { applySize(this.value); });

// Initial build + start ticking
rebuildClocks();
applySize(2);
tick();
setInterval(tick, 1000);
