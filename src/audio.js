import { PALETTE } from './palette.js';

export function createAudioEngine() {
  let ctx = null, master = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    // All layer downbeats coincide at every cycle start, so up to 6 accent
    // voices can sum well past 0 dBFS. A compressor configured as a limiter
    // tames only those stacked peaks while leaving single/few hits punchy
    // (instead of crushing the master gain for every hit).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;   // dB — engage just below clipping
    limiter.knee.value = 0;         // hard knee = limiter, not soft compressor
    limiter.ratio.value = 20;       // brick-wall-ish
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    master.connect(limiter);
    limiter.connect(ctx.destination);
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
      // A late/stale whenSec would make the attack ramp degenerate (click).
      // Never schedule in the past: clamp to the current audio time.
      const t = Math.max(whenSec, ctx.currentTime);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const freq = accent ? v.freq * 2 : v.freq;
      const peak = accent ? 0.9 : 0.5;
      const dur = accent ? 0.13 : 0.08;
      osc.type = v.wave;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
  };
}
