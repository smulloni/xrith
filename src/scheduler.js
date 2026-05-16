import { audibleLayers } from './model.js';

export const LOOKAHEAD_SEC = 0.12;
export const TICK_MS = 25;

// All hits with absolute time in [fromSec, toSec).
// cycleStartSec = audio-clock time of cycle index 0 (play start / last restart).
// Times use multiplication (no running sum) so long runs don't accumulate drift.
export function hitsInWindow(state, cycleStartSec, fromSec, toSec) {
  const hits = [];
  const cycleSec = state.cycleMs / 1000;
  // cycleMs is clamped >= 50 by the model; this guard also keeps the function
  // total for synthetic/degenerate state (NaN comparisons -> empty result).
  if (cycleSec <= 0 || toSec <= fromSec) return hits;

  // Callers (the lookahead loop) pass fromSec >= cycleStartSec by construction.
  // A window before cycleStart yields negative cycle indices whose hits are
  // correctly filtered out by the [fromSec, toSec) test below (not optimized).
  const firstCycle = Math.floor((fromSec - cycleStartSec) / cycleSec);
  const lastCycle = Math.floor((toSec - cycleStartSec) / cycleSec);

  for (const { index, layer } of audibleLayers(state)) {
    for (let cyc = firstCycle; cyc <= lastCycle; cyc++) {
      const base = cycleStartSec + cyc * cycleSec;
      for (let k = 0; k < layer.n; k++) {
        const t = base + (k / layer.n) * cycleSec;
        if (t >= fromSec && t < toSec) {
          hits.push({ layerIndex: index, voiceIndex: index,
                      accent: k === 0, timeSec: t });
        }
      }
    }
  }
  // Stable sort (V8 / Node >= 11) preserves layer order for simultaneous hits.
  hits.sort((a, b) => a.timeSec - b.timeSec);
  return hits;
}
