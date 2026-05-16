import { PALETTE } from './palette.js';

export function createAudioEngine() {
  let ctx = null, master = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }

  return {
    // Must be called from inside a user-gesture handler (iOS).
    async resume() {
      ensure();
      try {
        await ctx.resume();
      } catch (e) {
        return false; // propagated to caller -> visible banner (no silent fail)
      }
      try { // iOS: a 1-sample silent buffer inside the gesture fully unlocks
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = b; src.connect(ctx.destination); src.start(0);
      } catch (e) { /* non-fatal */ }
      return ctx.state === 'running';
    },
    state() { return ctx ? ctx.state : 'suspended'; },
    now() { return ctx ? ctx.currentTime : 0; },
    playHit(voiceIndex, accent, whenSec) {
      if (!ctx) return;
      const v = PALETTE[voiceIndex % PALETTE.length];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const freq = accent ? v.freq * 2 : v.freq;
      const peak = accent ? 0.9 : 0.5;
      const dur = accent ? 0.13 : 0.08;
      osc.type = v.wave;
      osc.frequency.setValueAtTime(freq, whenSec);
      g.gain.setValueAtTime(0.0001, whenSec);
      g.gain.exponentialRampToValueAtTime(peak, whenSec + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, whenSec + dur);
      osc.connect(g); g.connect(master);
      osc.start(whenSec);
      osc.stop(whenSec + dur + 0.02);
    },
  };
}
