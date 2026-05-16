import {
  createDefaultState, makeLayer, clampCycleMs,
  N_MIN, N_MAX, CYCLE_MS_MIN, CYCLE_MS_MAX,
} from './model.js';
import { MAX_LAYERS } from './palette.js';

const VERSION = 1;
const LAYER_RE = /^(\d+)(m?)(s?)$/;

// #<v>;<cycleMs>;<unitIdx>;<n[ms],n[ms],...>   flags: m=muted s=soloed
export function encodeState(state) {
  const layers = state.layers
    .map(l => `${l.n}${l.muted ? 'm' : ''}${l.soloed ? 's' : ''}`)
    .join(',');
  return `#${VERSION};${Math.round(state.cycleMs)};${state.unitLayerIndex};${layers}`;
}

export function decodeState(hash) {
  const ok = (state) => ({ state, warning: null });
  const fallback = () => ({
    state: createDefaultState(),
    warning: 'Shared link was invalid — loaded the default 4 : 7.',
  });
  if (!hash) return ok(createDefaultState());
  const raw = String(hash).replace(/^#/, '').trim();
  if (raw === '') return ok(createDefaultState());

  const parts = raw.split(';');
  if (parts.length !== 4) return fallback();
  const [vs, cs, us, ls] = parts;
  if (Number(vs) !== VERSION) return fallback();

  const cycleMs = Number(cs);
  if (!Number.isFinite(cycleMs) ||
      cycleMs < CYCLE_MS_MIN || cycleMs > CYCLE_MS_MAX) return fallback();

  const entries = ls === '' ? [] : ls.split(',');
  if (entries.length < 1 || entries.length > MAX_LAYERS) return fallback();

  const layers = [];
  for (const e of entries) {
    const m = e.match(LAYER_RE);
    if (!m) return fallback();
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < N_MIN || n > N_MAX) return fallback();
    const layer = makeLayer(n);
    layer.muted = m[2] === 'm';
    layer.soloed = m[3] === 's';
    layers.push(layer);
  }

  let unitLayerIndex = Number(us);
  if (!Number.isInteger(unitLayerIndex) ||
      unitLayerIndex < 0 || unitLayerIndex >= layers.length) {
    unitLayerIndex = 0; // soft-fix a cosmetic field; not a structural failure
  }

  return ok({
    layers,
    cycleMs: clampCycleMs(cycleMs),
    isPlaying: false, // links never autoplay (autoplay policy + UX)
    unitLayerIndex,
  });
}
