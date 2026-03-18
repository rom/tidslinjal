'use strict';
var paused = false, pausedAt = 0;
var teId = window.__initData.teId;
function pad(n){return String(n).padStart(2,'0');}
document.getElementById('btnPause').onclick = function() {
  try {
    var te = window.opener._timedEvents && window.opener._timedEvents.find(function(t) { return t.id === teId; });
    if (!te) return;
    if (!paused) { paused = true; pausedAt = Date.now(); }
    else { te.startTime += (Date.now() - pausedAt); paused = false; }
    document.getElementById('btnPause').textContent = paused ? '\u25B6' : '\u23F8';
  } catch(e) {}
};
document.getElementById('btnReset').onclick = function() {
  try {
    var te = window.opener._timedEvents && window.opener._timedEvents.find(function(t) { return t.id === teId; });
    if (!te) return;
    te.startTime = Date.now();
    te.state = 'running';
    te.alarmsFired = {};
    te.acknowledged = false;
    paused = false;
    document.getElementById('btnPause').textContent = '\u23F8';
    document.getElementById('btnAck').style.display = 'none';
  } catch(e) {}
};
document.getElementById('btnAck').onclick = function() {
  try {
    var te = window.opener._timedEvents && window.opener._timedEvents.find(function(t) { return t.id === teId; });
    if (te) te.acknowledged = true;
    document.getElementById('btnAck').style.display = 'none';
    document.body.classList.remove('te-flash');
  } catch(e) {}
};
// Self-contained tick loop — keeps working even if opener reference breaks
setInterval(function() {
  try {
    var te = window.opener && window.opener._timedEvents && window.opener._timedEvents.find(function(t) { return t.id === teId; });
    if (!te) return;
    var now = Date.now();
    var elapsed = now - te.startTime;
    var remaining = te.durationMs - elapsed;
    var pct = Math.min(100, Math.max(0, (elapsed / te.durationMs) * 100));
    var timeEl = document.getElementById('teTime');
    var statusEl = document.getElementById('teStatus');
    var barEl = document.getElementById('teBar');
    var ackBtn = document.getElementById('btnAck');
    if (te.state === 'waiting') {
      var s = Math.floor((te.startTime - now) / 1000);
      var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (timeEl) timeEl.textContent = '-'+pad(h)+':'+pad(m)+':'+pad(sec);
      if (statusEl) statusEl.textContent = 'Starting in...';
      if (barEl) barEl.style.width = '0%';
      document.body.className = document.body.className.replace(/te-\w+/g,'') + ' te-waiting';
    } else if (te.state === 'running') {
      var s = Math.max(0, Math.floor(remaining/1000));
      var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (timeEl) timeEl.textContent = pad(h)+':'+pad(m)+':'+pad(sec);
      if (statusEl) statusEl.textContent = 'In progress';
      if (barEl) barEl.style.width = pct+'%';
      document.body.className = document.body.className.replace(/te-\w+/g,'');
    } else if (te.state === 'overtime') {
      var overMs = elapsed - te.durationMs;
      var s = Math.floor(overMs/1000);
      var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (timeEl) timeEl.textContent = '+'+pad(h)+':'+pad(m)+':'+pad(sec);
      if (statusEl) statusEl.textContent = 'Overtime';
      if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--danger)'; }
      document.body.className = document.body.className.replace(/te-\w+/g,'') + ' te-overtime';
      if (ackBtn && !te.acknowledged) ackBtn.style.display = '';
    } else if (te.state === 'completed') {
      if (timeEl) timeEl.textContent = '00:00:00';
      if (statusEl) statusEl.textContent = 'Completed';
      if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--success)'; }
      if (ackBtn && !te.acknowledged) ackBtn.style.display = '';
    }
  } catch(e) {}
}, 500);
