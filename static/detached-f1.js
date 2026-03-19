'use strict';
var f1 = window.__initData.f1;
function pad(n) { return String(n).padStart(2, '0'); }

// Render lights
function renderLights() {
  var wrap = document.getElementById('f1Lights');
  if (!wrap) return;
  var html = '';
  for (var i = 0; i < f1.numLights; i++) {
    var cls = 'f1-light';
    if (f1.state === 'sequence' && i < f1.litCount) cls += ' on';
    if (f1.state === 'go') cls += ' go';
    html += '<div class="' + cls + '" id="f1l' + i + '"></div>';
  }
  wrap.innerHTML = html;
}

function tick() {
  var now = Date.now();
  var timeEl = document.getElementById('f1Time');
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
    if (now - f1.lastLightAt >= 1000 && f1.litCount < f1.numLights) {
      f1.litCount++;
      f1.lastLightAt = now;
      var le = document.getElementById('f1l' + (f1.litCount - 1));
      if (le) le.classList.add('on');
      if (f1.litCount >= f1.numLights) {
        f1.goAt = now + f1.goDelay;
      }
    }
    if (f1.litCount >= f1.numLights && now >= f1.goAt) {
      f1.state = 'go';
      for (var i = 0; i < f1.numLights; i++) {
        var el = document.getElementById('f1l' + i);
        if (el) { el.classList.remove('on'); el.classList.add('go'); }
      }
      if (timeEl) { timeEl.textContent = 'GO!'; timeEl.style.color = '#00ff00'; }
      try { window.opener.playCdAlarm('beep'); } catch(e) {}
      setTimeout(function() {
        f1.state = 'done';
        for (var i = 0; i < f1.numLights; i++) {
          var el = document.getElementById('f1l' + i);
          if (el) el.classList.remove('go');
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
  // Sync state back to opener
  try {
    var of1 = window.opener && window.opener._f1Starts ? window.opener._f1Starts.find(function(f) { return f.id === f1.id; }) : null;
    if (of1) { of1.state = f1.state; of1.litCount = f1.litCount; of1.lastLightAt = f1.lastLightAt; of1.goAt = f1.goAt; of1.targetTime = f1.targetTime; }
  } catch(e) {}
}

document.getElementById('btnReset').onclick = function() {
  f1.targetTime = Date.now() + f1.countdownSeconds * 1000;
  f1.state = 'countdown';
  f1.litCount = 0;
  f1.lastLightAt = 0;
  f1.goAt = 0;
  f1.goDelay = 500 + Math.random() * 2500;
  renderLights();
};

// Size slider
var szCls = ['f1-sz-xs', 'f1-sz-sm', 'f1-sz-md', 'f1-sz-lg', 'f1-sz-xl', 'f1-sz-xxl'];
var szLbl = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
document.getElementById('f1SizeSlider').oninput = function() {
  var v = parseInt(this.value, 10);
  document.body.className = document.body.className.replace(/f1-sz-\S+/g, '').trim() + ' ' + szCls[v];
  document.getElementById('f1SizeLbl').textContent = szLbl[v];
};

// Theme sync
try {
  var bc = new BroadcastChannel('tidslinjal-sync');
  bc.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      document.body.className = document.body.className.replace(/theme-\S+/g, '').trim() + ' theme-' + (e.data.theme || 'dark');
    }
  };
} catch(e) {}

// Custom background
document.body.style.background = window.__initData.bgColor;

// On close: re-attach
window.addEventListener('beforeunload', function() {
  try {
    var of1 = window.opener && window.opener._f1Starts ? window.opener._f1Starts.find(function(f) { return f.id === f1.id; }) : null;
    if (of1) { of1.detached = false; of1._detachedWin = null; window.opener.renderF1Starts(); }
  } catch(e) {}
});

renderLights();
setInterval(tick, 100);
tick();
