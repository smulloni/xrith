// One entry per voice index. Shared by audio.js (sound) and ring-view.js
// (color) so a layer's sound and on-screen color always agree — the voice
// index is the single source of layer identity. Pure data: Node-safe.
export const PALETTE = [
  { color: '#ff6b6b', wave: 'triangle', freq: 660 },
  { color: '#4dabf7', wave: 'sine',     freq: 880 },
  { color: '#69db7c', wave: 'triangle', freq: 550 },
  { color: '#ffd43b', wave: 'square',   freq: 990 },
  { color: '#da77f2', wave: 'sine',     freq: 740 },
  { color: '#ff922b', wave: 'sawtooth', freq: 470 },
];

export const MAX_LAYERS = 6;
