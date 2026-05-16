import { MAX_LAYERS } from './palette.js';

export const N_MIN = 1, N_MAX = 32;
export const BPM_MIN = 20, BPM_MAX = 300;
export const CYCLE_MS_MIN = 50, CYCLE_MS_MAX = 120000;
const DEFAULT_BPM = 60;

let _idSeq = 0;
function newId() { return 'L' + (++_idSeq); }

export function clampN(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return N_MIN;
  return Math.min(N_MAX, Math.max(N_MIN, n));
}
export function clampBpm(bpm) {
  bpm = Number(bpm);
  if (!Number.isFinite(bpm)) return BPM_MIN;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
}
export function clampCycleMs(ms) {
  ms = Number(ms);
  if (!Number.isFinite(ms)) return CYCLE_MS_MIN;
  return Math.min(CYCLE_MS_MAX, Math.max(CYCLE_MS_MIN, ms));
}

export function bpmToCycleMs(bpm, n) { return (n * 60000) / bpm; }
export function cycleMsToBpm(cycleMs, n) { return (n * 60000) / cycleMs; }

export function hitTimes(n, cycleMs) {
  const out = [];
  for (let k = 0; k < n; k++) out.push((k / n) * cycleMs);
  return out;
}

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
export function lcm(a, b) { return (a / gcd(a, b)) * b; }
export function lcmAll(ns) { return ns.reduce((acc, n) => lcm(acc, n), 1); }

export { MAX_LAYERS, newId };

export function makeLayer(n) {
  return { id: newId(), n: clampN(n), muted: false, soloed: false };
}

export function createDefaultState() {
  const layers = [makeLayer(4), makeLayer(7)];
  return {
    layers,
    cycleMs: bpmToCycleMs(DEFAULT_BPM, layers[0].n), // 4000
    isPlaying: false,
    // Cosmetic ONLY: which layer's BPM the tempo UI displays.
    // Never read by scheduler/audio/ring-view.
    unitLayerIndex: 0,
  };
}

export function audibleLayers(state) {
  const anySolo = state.layers.some(l => l.soloed);
  const out = [];
  state.layers.forEach((layer, index) => {
    const on = anySolo ? (layer.soloed && !layer.muted) : !layer.muted;
    if (on) out.push({ index, layer });
  });
  return out;
}

function withLayers(state, layers) { return { ...state, layers }; }

export function addLayer(state) {
  if (state.layers.length >= MAX_LAYERS) return state;
  return withLayers(state, [...state.layers, makeLayer(3)]);
}
export function removeLayer(state, id) {
  if (state.layers.length <= 1) return state;
  const layers = state.layers.filter(l => l.id !== id);
  // unitLayerIndex is cosmetic-only: clamp from above. If an EARLIER layer
  // was removed it may point at a different layer — intentional, not a remap.
  const unitLayerIndex = Math.min(state.unitLayerIndex, layers.length - 1);
  return { ...state, layers, unitLayerIndex };
}
export function setLayerN(state, id, n) {
  return withLayers(state, state.layers.map(
    l => (l.id === id ? { ...l, n: clampN(n) } : l)));
}
export function toggleMute(state, id) {
  return withLayers(state, state.layers.map(
    l => (l.id === id ? { ...l, muted: !l.muted } : l)));
}
export function toggleSolo(state, id) {
  return withLayers(state, state.layers.map(
    l => (l.id === id ? { ...l, soloed: !l.soloed } : l)));
}
export function setCycleMs(state, ms) {
  return { ...state, cycleMs: clampCycleMs(ms) };
}
export function setBpmForLayer(state, layerIndex, bpm) {
  const layer = state.layers[layerIndex];
  if (!layer) return state;
  return setCycleMs(state, bpmToCycleMs(clampBpm(bpm), layer.n));
}
export function setUnitLayerIndex(state, idx) {
  const clamped = Math.min(Math.max(0, idx | 0), state.layers.length - 1);
  return { ...state, unitLayerIndex: clamped };
}
export function setPlaying(state, isPlaying) {
  return { ...state, isPlaying: !!isPlaying };
}

export function ratioText(state) {
  const ns = state.layers.map(l => l.n);
  return `${ns.join(' : ')} · cycle ${Math.round(state.cycleMs)} ms · grid LCM ${lcmAll(ns)}`;
}
