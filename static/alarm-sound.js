/* ── Alarm Sound Engine ── */
// ── Alarm sound engine (Web Audio API) ─────────────────────────────────────
function playAlarmSound(sound) {
  if (!sound || sound === 'none') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (sound === 'klaxon') {
      // Fast alternating high-low tone, 3 cycles
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now + i * 0.4);
        osc.frequency.setValueAtTime(440, now + i * 0.4 + 0.2);
        gain.gain.setValueAtTime(0.4, now + i * 0.4);
        gain.gain.setValueAtTime(0, now + i * 0.4 + 0.38);
        osc.start(now + i * 0.4);
        osc.stop(now + i * 0.4 + 0.39);
      }
    } else if (sound === 'alert') {
      // 4 short beeps
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'square';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.3, now + i * 0.25);
        gain.gain.setValueAtTime(0, now + i * 0.25 + 0.15);
        osc.start(now + i * 0.25);
        osc.stop(now + i * 0.25 + 0.16);
      }
    } else if (sound === 'siren') {
      // Rising-falling sweep
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.5);
      osc.frequency.linearRampToValueAtTime(300, now + 1.0);
      osc.frequency.linearRampToValueAtTime(1200, now + 1.5);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0, now + 1.8);
      osc.start(now);
      osc.stop(now + 1.9);
    } else if (sound === 'chime') {
      // Soft bell-like tone
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.6);
    } else if (sound === 'beep') {
      // Single beep
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.value = 750;
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.31);
    }
    // Auto-close context after sounds finish
    setTimeout(() => ctx.close(), 3000);
  } catch (e) { /* Audio not available */ }
}

