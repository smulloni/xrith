# Cross-Rhythm Explorer (xrith) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A no-build, vanilla-JS web app that plays and visualizes up to 6 integer subdivisions of one shared loop with distinct synth voices and a concentric-ring view.

**Architecture:** One source of truth (`{layers, cycleMs, isPlaying, unitLayerIndex}`); pure model/url/scheduler/geometry modules (Node-tested with `node --test`, zero deps) plus browser-only audio/view/controls modules wired by a composition root. Unidirectional flow: input → mutate state → re-render view + reconfigure scheduler + write URL.

**Tech Stack:** Plain ES modules, Web Audio API, SVG, Node built-in test runner. No bundler, no framework, no dependencies.

Spec: `docs/superpowers/specs/2026-05-16-cross-rhythm-explorer-design.md`.

> **Test command correction:** Run the suite with `npm test` (the `test` script is `node --test`). A bare directory argument (`node --test tests/`) is NOT supported on Node ≥ 22. Wherever a task step says `Run: node --test tests/`, run `npm test` instead — including the "verify it fails" steps (the failure/error still appears, just via `npm test`).

---

## File structure

| File | Responsibility | Tested |
|---|---|---|
| `package.json` | `"type":"module"`, `test` script. No deps. | — |
| `src/palette.js` | 6 voices: shared `{color,wave,freq}` + `MAX_LAYERS`. Pure data. | unit |
| `src/geometry.js` | Pure ring math: `ringRadius`, `pointOnCircle`, `crossed`. | unit |
| `src/model.js` | State + pure transitions + math (`hitTimes`, bpm↔cycleMs, `lcmAll`, `audibleLayers`, clamps, `ratioText`). No DOM/Audio. | unit |
| `src/url-state.js` | `encodeState`/`decodeState` (hash ↔ state, validation + fallback). | unit |
| `src/scheduler.js` | Pure `hitsInWindow` + `createScheduler` (lookahead transport). | unit (pure parts) |
| `src/audio.js` | `createAudioEngine`: `AudioContext`, `playHit`, iOS unlock. | manual |
| `src/ring-view.js` | `createRingView`: SVG rings + playhead + flash. `Visualization` interface. | manual |
| `src/controls.js` | Builds/wires control DOM (createElement, no innerHTML). | manual |
| `src/main.js` | Composition root: wire everything; rAF loop; visibility recovery. | manual (E2E) |
| `index.html`, `styles.css` | Shell + responsive layout/theme. | manual |
| `tests/*.test.js` | `node --test` suites. | — |
| `tests/manual.html` | Manual harness (voices, known pattern, mobile checklist). | — |

---

## Task 1: Project scaffold + palette + test runner

**Files:**
- Create: `package.json`
- Create: `src/palette.js`
- Test: `tests/palette.test.js`

- [ ] **Step 1: Write the failing test**

`tests/palette.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, MAX_LAYERS } from '../src/palette.js';

test('palette has 6 distinct voices with required fields', () => {
  assert.equal(PALETTE.length, 6);
  assert.equal(MAX_LAYERS, 6);
  const colors = new Set();
  for (const v of PALETTE) {
    assert.match(v.color, /^#[0-9a-f]{6}$/i);
    assert.ok(['sine', 'triangle', 'square', 'sawtooth'].includes(v.wave));
    assert.ok(v.freq > 0);
    colors.add(v.color);
  }
  assert.equal(colors.size, 6, 'colors must be distinct');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../src/palette.js'`.

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "xrith",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 4: Create `src/palette.js`**

```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — `# pass 1`.

- [ ] **Step 6: Commit**

```bash
git add package.json src/palette.js tests/palette.test.js
git commit -m "feat: scaffold project, shared voice palette, test runner" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure ring geometry

**Files:**
- Create: `src/geometry.js`
- Test: `tests/geometry.test.js`

- [ ] **Step 1: Write the failing test**

`tests/geometry.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringRadius, pointOnCircle, crossed } from '../src/geometry.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ~ ${b}`);

test('ringRadius: single layer uses max; multi spreads max..min', () => {
  near(ringRadius(0, 1), 460);
  near(ringRadius(0, 3), 460);
  near(ringRadius(2, 3), 150);
  near(ringRadius(1, 3), 305);
});

test('pointOnCircle: frac 0 is top, frac .25 is right (clockwise)', () => {
  const top = pointOnCircle(500, 500, 100, 0);
  near(top.x, 500); near(top.y, 400);
  const right = pointOnCircle(500, 500, 100, 0.25);
  near(right.x, 600); near(right.y, 500);
});

test('crossed: detects a fraction passed this frame, including wrap', () => {
  assert.equal(crossed(0.1, 0.3, 0.2), true);
  assert.equal(crossed(0.1, 0.3, 0.05), false);
  assert.equal(crossed(0.3, 0.3, 0.3), false);
  assert.equal(crossed(0.9, 0.1, 0.95), true);  // wrapped past 1.0
  assert.equal(crossed(0.9, 0.1, 0.05), true);
  assert.equal(crossed(0.9, 0.1, 0.5), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../src/geometry.js'`.

- [ ] **Step 3: Create `src/geometry.js`**

```js
// Pure geometry for the ring view. No DOM. Angles measured with 0 at
// 12 o'clock, increasing clockwise (matches a clock face and the mockups).

export function ringRadius(index, layerCount, maxR = 460, minR = 150) {
  if (layerCount <= 1) return maxR;
  return maxR - (index * (maxR - minR)) / (layerCount - 1);
}

export function pointOnCircle(cx, cy, r, frac) {
  const theta = frac * 2 * Math.PI - Math.PI / 2; // -90° => start at top
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
}

// Did fraction `f` get crossed moving from prevP to curP around a [0,1) loop?
export function crossed(prevP, curP, f) {
  if (prevP === curP) return false;
  if (prevP < curP) return f > prevP && f <= curP;
  return f > prevP || f <= curP; // wrapped through 1.0 -> 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — geometry suite green.

- [ ] **Step 5: Commit**

```bash
git add src/geometry.js tests/geometry.test.js
git commit -m "feat: pure ring geometry helpers" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Model — math primitives

**Files:**
- Create: `src/model.js`
- Test: `tests/model-math.test.js`

- [ ] **Step 1: Write the failing test**

`tests/model-math.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hitTimes, bpmToCycleMs, cycleMsToBpm, lcm, lcmAll,
  clampN, clampBpm, clampCycleMs,
  N_MIN, N_MAX, BPM_MIN, BPM_MAX,
} from '../src/model.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ~ ${b}`);

test('hitTimes spreads k/n across the cycle', () => {
  assert.deepEqual(hitTimes(4, 2400), [0, 600, 1200, 1800]);
  assert.deepEqual(hitTimes(1, 2400), [0]);
  const seven = hitTimes(7, 2400);
  assert.equal(seven.length, 7);
  near(seven[1], 2400 / 7);
});

test('bpm <-> cycleMs round-trips per layer', () => {
  near(bpmToCycleMs(100, 4), 2400);
  near(cycleMsToBpm(2400, 4), 100);
  near(cycleMsToBpm(bpmToCycleMs(137, 7), 7), 137);
});

test('lcm / lcmAll', () => {
  assert.equal(lcm(4, 7), 28);
  assert.equal(lcmAll([4, 7]), 28);
  assert.equal(lcmAll([3, 4, 5]), 60);
  assert.equal(lcmAll([4]), 4);
});

test('clamps coerce and bound', () => {
  assert.equal(clampN(3.6), 4);
  assert.equal(clampN(0), N_MIN);
  assert.equal(clampN(999), N_MAX);
  assert.equal(clampN('x'), N_MIN);
  assert.equal(clampBpm(5), BPM_MIN);
  assert.equal(clampBpm(9999), BPM_MAX);
  assert.equal(clampCycleMs(-1), 50);
  assert.equal(clampCycleMs(1e9), 120000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../src/model.js'`.

- [ ] **Step 3: Create `src/model.js` (math section)**

```js
import { MAX_LAYERS } from './palette.js';

export const N_MIN = 1, N_MAX = 32;
export const BPM_MIN = 20, BPM_MAX = 300;
export const CYCLE_MS_MIN = 50, CYCLE_MS_MAX = 120000;
const DEFAULT_BPM = 100;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — model-math suite green.

- [ ] **Step 5: Commit**

```bash
git add src/model.js tests/model-math.test.js
git commit -m "feat: model math primitives (hitTimes, bpm conv, lcm, clamps)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Model — state, transitions, audibleLayers, ratioText

**Files:**
- Modify: `src/model.js` (append; keep Task 3 exports unchanged)
- Test: `tests/model-state.test.js`

- [ ] **Step 1: Write the failing test**

`tests/model-state.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultState, addLayer, removeLayer, setLayerN,
  toggleMute, toggleSolo, setCycleMs, setBpmForLayer,
  setUnitLayerIndex, setPlaying, audibleLayers, ratioText,
} from '../src/model.js';

test('default state: 4 and 7, cycleMs 2400 (100bpm per 4), not playing', () => {
  const s = createDefaultState();
  assert.deepEqual(s.layers.map(l => l.n), [4, 7]);
  assert.equal(s.cycleMs, 2400);
  assert.equal(s.isPlaying, false);
  assert.equal(s.unitLayerIndex, 0);
});

test('addLayer caps at 6; removeLayer floors at 1', () => {
  let s = createDefaultState();
  for (let i = 0; i < 10; i++) s = addLayer(s);
  assert.equal(s.layers.length, 6);
  const firstId = s.layers[0].id;
  for (let i = 0; i < 10; i++) s = removeLayer(s, s.layers[0].id);
  assert.equal(s.layers.length, 1);
  assert.notEqual(s.layers[0].id, undefined);
  assert.equal(removeLayer(s, firstId).layers.length, 1);
});

test('setLayerN clamps; toggles flip flags immutably', () => {
  const s = createDefaultState();
  const id = s.layers[0].id;
  assert.equal(setLayerN(s, id, 99).layers[0].n, 32);
  assert.equal(s.layers[0].n, 4, 'original unchanged');
  assert.equal(toggleMute(s, id).layers[0].muted, true);
  assert.equal(toggleSolo(s, id).layers[0].soloed, true);
});

test('setBpmForLayer sets cycleMs; setCycleMs clamps', () => {
  const s = createDefaultState();
  assert.equal(setBpmForLayer(s, 1, 120).cycleMs, (7 * 60000) / 120);
  assert.equal(setCycleMs(s, 1).cycleMs, 50);
});

test('audibleLayers: mute wins over solo; solo isolates', () => {
  let s = createDefaultState();                       // [4,7] none flagged
  assert.deepEqual(audibleLayers(s).map(x => x.index), [0, 1]);
  s = toggleMute(s, s.layers[0].id);                  // mute 4
  assert.deepEqual(audibleLayers(s).map(x => x.index), [1]);
  s = createDefaultState();
  s = toggleSolo(s, s.layers[1].id);                  // solo 7
  assert.deepEqual(audibleLayers(s).map(x => x.index), [1]);
  s = toggleMute(s, s.layers[1].id);                  // 7 soloed AND muted
  assert.deepEqual(audibleLayers(s).map(x => x.index), []);
});

test('removeLayer keeps unitLayerIndex in range', () => {
  let s = createDefaultState();
  s = setUnitLayerIndex(s, 1);
  s = removeLayer(s, s.layers[1].id);
  assert.equal(s.unitLayerIndex, 0);
});

test('ratioText shows ratio, cycle, LCM', () => {
  assert.equal(ratioText(createDefaultState()),
    '4 : 7 · cycle 2400 ms · grid LCM 28');
});

test('setPlaying toggles the flag only', () => {
  assert.equal(setPlaying(createDefaultState(), true).isPlaying, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `createDefaultState` not exported.

- [ ] **Step 3: Append state section to `src/model.js`**

Append below the Task 3 content (do not remove anything):
```js
export function makeLayer(n) {
  return { id: newId(), n: clampN(n), muted: false, soloed: false };
}

export function createDefaultState() {
  const layers = [makeLayer(4), makeLayer(7)];
  return {
    layers,
    cycleMs: bpmToCycleMs(DEFAULT_BPM, layers[0].n), // 2400
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all model suites green.

- [ ] **Step 5: Commit**

```bash
git add src/model.js tests/model-state.test.js
git commit -m "feat: model state, pure transitions, audibleLayers, ratioText" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: URL state (encode/decode + validation)

**Files:**
- Create: `src/url-state.js`
- Test: `tests/url-state.test.js`

- [ ] **Step 1: Write the failing test**

`tests/url-state.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState } from '../src/url-state.js';
import { createDefaultState, toggleSolo, toggleMute } from '../src/model.js';

const shape = s => ({
  layers: s.layers.map(l => ({ n: l.n, muted: l.muted, soloed: l.soloed })),
  cycleMs: s.cycleMs, unitLayerIndex: s.unitLayerIndex, isPlaying: s.isPlaying,
});

test('encode default => stable string', () => {
  assert.equal(encodeState(createDefaultState()), '#1;2400;0;4,7');
});

test('round-trip preserves rhythm, flags, unit; never autoplays', () => {
  let s = createDefaultState();
  s = toggleSolo(s, s.layers[1].id);
  s = toggleMute(s, s.layers[0].id);
  s.isPlaying = true;
  const { state, warning } = decodeState(encodeState(s));
  assert.equal(warning, null);
  assert.equal(state.isPlaying, false, 'links never autoplay');
  assert.deepEqual(shape(state).layers,
    [{ n: 4, muted: true, soloed: false }, { n: 7, muted: false, soloed: true }]);
});

test('empty / missing hash => default, no warning', () => {
  assert.equal(decodeState('').warning, null);
  assert.equal(decodeState('#').warning, null);
  assert.equal(decodeState(undefined).warning, null);
});

test('malformed or out-of-range => default + warning', () => {
  for (const bad of ['#9;2400;0;4,7', '#1;2400;0;', '#1;abc;0;4,7',
                      '#1;2400;0;0,7', '#1;2400;0;4,7,1,2,3,4,5',
                      '#1;2400;0;4,99', 'garbage', '#1;2400;0;4,7;extra']) {
    const r = decodeState(bad);
    assert.ok(r.warning, `expected warning for ${bad}`);
    assert.deepEqual(r.state.layers.map(l => l.n), [4, 7]);
  }
});

test('out-of-range unit index falls back to 0 (not a full reset)', () => {
  const r = decodeState('#1;2400;9;4,7');
  assert.equal(r.warning, null);
  assert.equal(r.state.unitLayerIndex, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../src/url-state.js'`.

- [ ] **Step 3: Create `src/url-state.js`**

```js
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

  const entries = ls.split(',').filter(Boolean);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — url-state suite green.

- [ ] **Step 5: Commit**

```bash
git add src/url-state.js tests/url-state.test.js
git commit -m "feat: URL state encode/decode with validation + fallback" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Scheduler — pure `hitsInWindow`

**Files:**
- Create: `src/scheduler.js`
- Test: `tests/scheduler.test.js`

- [ ] **Step 1: Write the failing test**

`tests/scheduler.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitsInWindow } from '../src/scheduler.js';
import { createDefaultState, toggleMute, toggleSolo } from '../src/model.js';

// default: [4,7], cycleMs 2400 => cycleSec 2.4
test('first window from t=0 yields both downbeats (accented) at 0', () => {
  const s = createDefaultState();
  const hits = hitsInWindow(s, 0, 0, 0.05);
  assert.deepEqual(hits.map(h => [h.voiceIndex, h.accent, +h.timeSec.toFixed(4)]),
    [[0, true, 0], [1, true, 0]]);
});

test('voiceIndex is the FULL-array index, stable under mute/solo', () => {
  let s = createDefaultState();
  s = toggleSolo(s, s.layers[1].id); // only layer index 1 audible
  const hits = hitsInWindow(s, 0, 0, 0.05);
  assert.deepEqual(hits.map(h => h.voiceIndex), [1]);
});

test('cycle wrap: window spanning the boundary includes next cycle downbeat', () => {
  const s = createDefaultState();              // cycleSec = 2.4
  const hits = hitsInWindow(s, 0, 2.39, 2.45);
  const at24 = hits.filter(h => Math.abs(h.timeSec - 2.4) < 1e-9);
  assert.equal(at24.length, 2);
  assert.ok(at24.every(h => h.accent));
});

test('no audible layers => empty', () => {
  let s = createDefaultState();
  s = toggleMute(s, s.layers[0].id);
  s = toggleMute(s, s.layers[1].id);
  assert.deepEqual(hitsInWindow(s, 0, 0, 10), []);
});

test('half-open window [from,to): includes from, excludes to', () => {
  const s = createDefaultState();
  assert.equal(hitsInWindow(s, 0, 0.6, 0.7).some(h => Math.abs(h.timeSec - 0.6) < 1e-9), true);
  assert.equal(hitsInWindow(s, 0, 0.5, 0.6).some(h => Math.abs(h.timeSec - 0.6) < 1e-9), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../src/scheduler.js'`.

- [ ] **Step 3: Create `src/scheduler.js` (pure section)**

```js
import { audibleLayers } from './model.js';

export const LOOKAHEAD_SEC = 0.12;
export const TICK_MS = 25;

// All hits with absolute time in [fromSec, toSec).
// cycleStartSec = audio-clock time of cycle index 0 (play start / last restart).
// Times use multiplication (no running sum) so long runs don't accumulate drift.
export function hitsInWindow(state, cycleStartSec, fromSec, toSec) {
  const hits = [];
  const cycleSec = state.cycleMs / 1000;
  if (cycleSec <= 0 || toSec <= fromSec) return hits;

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
  hits.sort((a, b) => a.timeSec - b.timeSec);
  return hits;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — scheduler suite green.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.js tests/scheduler.test.js
git commit -m "feat: pure hitsInWindow (handles cycle wrap, stable voice index)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Scheduler — `createScheduler` shell (injectable clock)

**Files:**
- Modify: `src/scheduler.js` (append)
- Test: `tests/scheduler-shell.test.js`

- [ ] **Step 1: Write the failing test**

`tests/scheduler-shell.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../src/scheduler.js';
import { createDefaultState } from '../src/model.js';

function fakeEnv() {
  let now = 0, cb = null;
  const played = [];
  const audio = { now: () => now, playHit: (v, a, t) => played.push({ v, a, t }) };
  const env = {
    getState: () => createDefaultState(),
    audio,
    setInterval: (fn) => { cb = fn; return 1; },
    clearInterval: () => { cb = null; },
  };
  return { env, advance: (d) => { now += d; }, fire: () => cb && cb(), played,
           hasTimer: () => cb !== null };
}

test('start schedules the lookahead window and registers a timer', () => {
  const f = fakeEnv();
  const s = createScheduler(f.env);
  s.start();
  assert.ok(f.played.length >= 2, 'downbeats scheduled immediately');
  assert.equal(f.hasTimer(), true);
  assert.equal(s.isRunning(), true);
});

test('stop clears the timer and halts scheduling', () => {
  const f = fakeEnv();
  const s = createScheduler(f.env);
  s.start();
  const n = f.played.length;
  s.stop();
  assert.equal(f.hasTimer(), false);
  assert.equal(s.isRunning(), false);
  f.advance(5); f.fire();
  assert.equal(f.played.length, n, 'no scheduling after stop');
});

test('reconfigure restarts the cycle at now (downbeat realigns)', () => {
  const f = fakeEnv();
  const s = createScheduler(f.env);
  s.start();
  f.advance(1.0);
  s.reconfigure();
  assert.equal(s.getTransport().cycleStartSec, 1.0);
});

test('getTransport reports clock + cycleMs + running', () => {
  const f = fakeEnv();
  const s = createScheduler(f.env);
  s.start(); f.advance(0.3);
  const t = s.getTransport();
  assert.equal(t.nowSec, 0.3);
  assert.equal(t.cycleMs, 2400);
  assert.equal(t.isRunning, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `createScheduler` not exported.

- [ ] **Step 3: Append `createScheduler` to `src/scheduler.js`**

```js
export function createScheduler({
  getState, audio,
  setInterval: si = setInterval, clearInterval: ci = clearInterval,
}) {
  let timer = null, cycleStartSec = 0, scheduledUntilSec = 0, running = false;

  function tick() {
    const now = audio.now();
    const to = now + LOOKAHEAD_SEC;
    const from = Math.max(scheduledUntilSec, now);
    if (to > from) {
      for (const h of hitsInWindow(getState(), cycleStartSec, from, to)) {
        audio.playHit(h.voiceIndex, h.accent, h.timeSec);
      }
      scheduledUntilSec = to;
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      cycleStartSec = audio.now();
      scheduledUntilSec = cycleStartSec;
      tick();
      timer = si(tick, TICK_MS);
    },
    stop() {
      running = false;
      if (timer !== null) { ci(timer); timer = null; }
    },
    // Spec: any live edit restarts the current cycle from its downbeat.
    reconfigure() {
      if (!running) return;
      cycleStartSec = audio.now();
      scheduledUntilSec = cycleStartSec;
      tick();
    },
    getTransport() {
      return {
        nowSec: audio.now(),
        cycleStartSec,
        cycleMs: getState().cycleMs,
        isRunning: running,
      };
    },
    isRunning() { return running; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — scheduler-shell suite green; all prior suites still green.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.js tests/scheduler-shell.test.js
git commit -m "feat: createScheduler lookahead transport (injectable clock)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Audio engine + manual harness

**Files:**
- Create: `src/audio.js`
- Create: `tests/manual.html`

Web Audio is browser-only and timing-sensitive; per the spec it is verified manually, not unit-tested.

- [ ] **Step 1: Create `src/audio.js`**

```js
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
```

- [ ] **Step 2: Create `tests/manual.html` (voice probe)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>xrith manual harness</title>
  <style>
    body { background:#0e1320; color:#e9ecf2; font:14px system-ui; padding:20px; }
    button { background:#1c2740; color:#e9ecf2; border:1px solid #33415c;
             border-radius:6px; padding:12px 16px; margin:4px; min-height:44px; }
  </style>
</head>
<body>
  <h1>Voice probe</h1>
  <p>Click <b>Unlock</b> first (audio needs a gesture), then fire each voice.
     Each should be clearly distinct; "accent" is brighter/louder.</p>
  <button id="unlock">Unlock audio</button>
  <div id="voices"></div>
  <pre id="status"></pre>
  <script type="module">
    import { createAudioEngine } from '../src/audio.js';
    const eng = createAudioEngine();
    const status = document.getElementById('status');
    document.getElementById('unlock').onclick = async () => {
      status.textContent = 'resume() -> ' + await eng.resume()
        + ' (state: ' + eng.state() + ')';
    };
    const box = document.getElementById('voices');
    for (let i = 0; i < 6; i++) {
      const plain = document.createElement('button');
      plain.textContent = `Voice ${i}`;
      plain.onclick = () => eng.playHit(i, false, eng.now() + 0.02);
      const acc = document.createElement('button');
      acc.textContent = `Voice ${i} (accent)`;
      acc.onclick = () => eng.playHit(i, true, eng.now() + 0.02);
      box.append(plain, acc);
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Manual verification**

Run: `python3 -m http.server 8000` (from repo root), open `http://localhost:8000/tests/manual.html`.
Verify:
- Clicking "Unlock audio" shows `resume() -> true (state: running)`.
- Each of the 6 plain voices sounds clearly different from the others.
- Each "(accent)" variant is noticeably brighter and louder than its plain voice.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/audio.js tests/manual.html
git commit -m "feat: Web Audio engine + manual voice harness" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Ring view (SVG) + extend harness

**Files:**
- Create: `src/ring-view.js`
- Modify: `tests/manual.html` (add a render probe)

DOM/SVG; verified manually. Pure geometry it relies on was unit-tested in Task 2.

- [ ] **Step 1: Create `src/ring-view.js`**

```js
import { PALETTE } from './palette.js';
import { ringRadius, pointOnCircle, crossed } from './geometry.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CX = 500, CY = 500;

function el(name, attrs) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function flash(circle, baseR) {
  const start = performance.now(), peak = baseR * 1.9, dur = 160;
  function step(t) {
    const e = Math.min(1, (t - start) / dur);
    circle.setAttribute('r', String(peak - (peak - baseR) * e));
    if (e < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Implements the Visualization interface:
//   renderStructure(state), tick(transport), destroy()
// Lane/polygon views can implement the same 3 methods later.
export function createRingView(svg) {
  svg.setAttribute('viewBox', '0 0 1000 1000');
  let dots = [], hand = null, lastP = 0;

  function renderStructure(state) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    dots = [];
    const L = state.layers.length;
    state.layers.forEach((layer, i) => {
      const r = ringRadius(i, L);
      svg.appendChild(el('circle', {
        cx: CX, cy: CY, r, fill: 'none',
        stroke: '#33415c', 'stroke-width': 2,
      }));
      const color = PALETTE[i % PALETTE.length].color;
      for (let k = 0; k < layer.n; k++) {
        const frac = k / layer.n;
        const p = pointOnCircle(CX, CY, r, frac);
        const baseR = k === 0 ? 22 : 14;
        const c = el('circle', { cx: p.x, cy: p.y, r: baseR, fill: color });
        svg.appendChild(c);
        dots.push({ circle: c, frac, baseR });
      }
    });
    hand = el('line', {
      x1: CX, y1: CY, x2: CX, y2: 40,
      stroke: '#f1f3f8', 'stroke-width': 5, 'stroke-linecap': 'round',
    });
    svg.appendChild(hand);
    lastP = 0;
  }

  function tick(transport) {
    if (!hand) return;
    let p = 0;
    if (transport.isRunning && transport.cycleMs > 0) {
      const elapsedMs = (transport.nowSec - transport.cycleStartSec) * 1000;
      p = (elapsedMs / transport.cycleMs) % 1;
      if (p < 0) p += 1;
    }
    hand.setAttribute('transform', `rotate(${p * 360} ${CX} ${CY})`);
    for (const d of dots) if (crossed(lastP, p, d.frac)) flash(d.circle, d.baseR);
    lastP = p;
  }

  function destroy() { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  return { renderStructure, tick, destroy };
}
```

- [ ] **Step 2: Add a render probe to `tests/manual.html`**

Insert before the closing `</body>`:
```html
  <h1>Ring render probe</h1>
  <p>Static 4-against-7 (no audio). Outer = 4 (coral), inner = 7 (blue);
     big dots are downbeats at 12 o'clock; the white hand sweeps one cycle.</p>
  <svg id="probe" style="width:340px;height:340px;background:#0e1320;border-radius:8px"></svg>
  <script type="module">
    import { createRingView } from '../src/ring-view.js';
    import { createDefaultState } from '../src/model.js';
    const view = createRingView(document.getElementById('probe'));
    view.renderStructure(createDefaultState());
    let t0 = performance.now();
    (function loop(now) {
      const nowSec = (now - t0) / 1000;
      view.tick({ isRunning: true, cycleMs: 2400, nowSec, cycleStartSec: 0 });
      requestAnimationFrame(loop);
    })(performance.now());
  </script>
```

- [ ] **Step 3: Manual verification**

Reload `http://localhost:8000/tests/manual.html`. Verify:
- Two concentric rings: outer has 4 dots, inner has 7, evenly spaced.
- Both downbeat dots sit at 12 o'clock and are larger.
- The white hand rotates clockwise, one full turn every 2.4 s.
- Each dot briefly enlarges as the hand passes it; no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/ring-view.js tests/manual.html
git commit -m "feat: concentric-ring SVG view (Visualization interface)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Controls UI (DOM-builder, no innerHTML)

**Files:**
- Create: `src/controls.js`

DOM; verified manually as part of Task 11's end-to-end pass. Pure helpers it uses (`ratioText`, `cycleMsToBpm`, `clampBpm`) were unit-tested in Tasks 3–4. The panel is built with `document.createElement`/`textContent` (no `innerHTML`), so layer values can never be interpreted as markup.

- [ ] **Step 1: Create `src/controls.js`**

```js
import { cycleMsToBpm, clampBpm, ratioText } from './model.js';
import { PALETTE } from './palette.js';

// Tiny element helper. `text` sets textContent; known DOM props are assigned,
// everything else becomes an attribute. No innerHTML anywhere.
function h(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') e.className = props[k];
    else if (k === 'text') e.textContent = props[k];
    else if (k in e) e[k] = props[k];
    else e.setAttribute(k, props[k]);
  }
  for (const c of children) e.append(c);
  return e;
}

// Builds the control panel into `root`. Communicates only through callbacks:
//   getState() -> current state
//   actions: { setBpm(layerIndex,bpm), setN(id,n), addLayer(), removeLayer(id),
//              toggleMute(id), toggleSolo(id), setUnit(idx),
//              togglePlay(), tap() }
export function createControls(root, getState, actions) {
  root.replaceChildren();

  const banner = h('div', { class: 'banner', hidden: true });
  const playBtn = h('button', { class: 'btn primary' });
  const tapBtn = h('button', { class: 'btn', text: '⭘ Tap' });

  const bpmDown = h('button', { class: 'btn step', text: '−' });
  const bpmInput = h('input', {
    class: 'bpm', type: 'number', inputMode: 'numeric',
    min: '20', max: '300', step: '1',
  });
  const bpmUp = h('button', { class: 'btn step', text: '+' });
  const unitSel = h('select', { class: 'unit' });

  const layersBox = h('div', { class: 'layers' });
  const addBtn = h('button', { class: 'btn wide', text: '＋ Add layer' });
  const shareBtn = h('button', { class: 'btn wide', text: '🔗 Copy share link' });
  const ratio = h('div', { class: 'ratio' });

  root.append(
    banner,
    h('div', { class: 'transport' }, [playBtn, tapBtn]),
    h('div', { class: 'tempo' }, [
      h('div', { class: 'lab', text: 'Tempo' }),
      h('div', { class: 'tempo-row' }, [
        bpmDown, bpmInput, bpmUp,
        h('span', { class: 'muted', text: 'BPM per' }), unitSel,
      ]),
    ]),
    h('div', { class: 'lab', text: 'Layers' }),
    layersBox, addBtn, shareBtn, ratio,
  );

  function unitBpm(state) {
    const layer = state.layers[state.unitLayerIndex] || state.layers[0];
    return Math.round(cycleMsToBpm(state.cycleMs, layer.n));
  }

  function render() {
    const state = getState();
    playBtn.textContent = state.isPlaying ? '⏹ Stop' : '▶ Play';
    playBtn.classList.toggle('primary', !state.isPlaying);

    unitSel.replaceChildren(...state.layers.map((l, i) =>
      h('option', { value: String(i), text: String(l.n) })));
    unitSel.value = String(state.unitLayerIndex);
    bpmInput.value = String(unitBpm(state));

    layersBox.replaceChildren(...state.layers.map((l, i) => {
      const sw = h('span', { class: 'sw' });
      sw.style.background = PALETTE[i % 6].color;
      const nDown = h('button', { class: 'btn step', text: '−' });
      const nUp = h('button', { class: 'btn step', text: '+' });
      const mute = h('button',
        { class: 'tg' + (l.muted ? ' on' : ''), text: 'M' });
      const solo = h('button',
        { class: 'tg' + (l.soloed ? ' on' : ''), text: 'S' });
      const rm = h('button',
        { class: 'tg', text: '×', disabled: state.layers.length === 1 });
      nDown.addEventListener('click', () => actions.setN(l.id, l.n - 1));
      nUp.addEventListener('click', () => actions.setN(l.id, l.n + 1));
      mute.addEventListener('click', () => actions.toggleMute(l.id));
      solo.addEventListener('click', () => actions.toggleSolo(l.id));
      rm.addEventListener('click', () => actions.removeLayer(l.id));
      return h('div', { class: 'layer-row' }, [
        sw,
        h('span', { class: 'step-group' }, [
          nDown, h('b', { class: 'nval', text: String(l.n) }), nUp,
        ]),
        mute, solo, rm,
      ]);
    }));

    addBtn.disabled = state.layers.length >= 6;
    ratio.textContent = ratioText(state);
  }

  function commitBpm() {
    const state = getState();
    actions.setBpm(state.unitLayerIndex, clampBpm(Number(bpmInput.value)));
  }

  playBtn.addEventListener('pointerup', () => actions.togglePlay());
  tapBtn.addEventListener('pointerup', () => actions.tap());
  bpmDown.addEventListener('click', () => {
    bpmInput.value = String(Number(bpmInput.value) - 1); commitBpm();
  });
  bpmUp.addEventListener('click', () => {
    bpmInput.value = String(Number(bpmInput.value) + 1); commitBpm();
  });
  bpmInput.addEventListener('change', commitBpm);
  unitSel.addEventListener('change', () => actions.setUnit(Number(unitSel.value)));
  addBtn.addEventListener('click', () => actions.addLayer());
  shareBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showBanner('Link copied.', 1500);
    } catch (e) {
      showBanner('Copy failed — select the address bar to share.', 3000);
    }
  });

  let bannerTimer = null;
  function showBanner(msg, autoHideMs) {
    banner.textContent = msg;
    banner.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    if (autoHideMs) {
      bannerTimer = setTimeout(() => { banner.hidden = true; }, autoHideMs);
    }
  }

  return { render, showBanner };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/controls.js
git commit -m "feat: control panel UI (DOM-builder, transport, tempo, layers)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Composition root, shell, responsive CSS, end-to-end

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/main.js`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>xrith — cross-rhythm explorer</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main id="app">
    <section id="viz">
      <svg id="rings"></svg>
    </section>
    <aside id="panel"></aside>
  </main>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `styles.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --bg:#0e1320; --panel:#141c2e; --line:#33415c; --fg:#e9ecf2;
        --muted:#9aa6bf; --accent:#3b5bdb; }
html, body { height: 100%; }
body { background: var(--bg); color: var(--fg);
       font: 15px/1.4 -apple-system, system-ui, sans-serif; }

#app { display: flex; gap: 24px; padding: 24px;
       min-height: 100%; align-items: flex-start; }
#viz { flex: 1; display: flex; justify-content: center; }
#rings { width: 100%; max-width: 560px; aspect-ratio: 1 / 1; }
#panel { width: 300px; flex: none; display: flex;
         flex-direction: column; gap: 16px; }

.banner { background:#3b2b12; border:1px solid #ffa94d; color:#ffd8a8;
          padding:10px 12px; border-radius:6px; }
.transport { display:flex; gap:8px; }
.lab { font-size:11px; text-transform:uppercase; letter-spacing:1px;
       color:#6b7794; }
.tempo-row { display:flex; align-items:center; gap:8px; margin-top:6px;
             flex-wrap:wrap; }
.bpm { width:64px; background:var(--bg); color:var(--fg);
       border:1px solid var(--line); border-radius:5px; padding:8px;
       font-size:15px; text-align:center; }
.unit { background:var(--bg); color:var(--fg); border:1px solid var(--line);
        border-radius:5px; padding:8px; min-height:44px; }
.muted { color:var(--muted); font-size:13px; }

.layers { display:flex; flex-direction:column; gap:8px; }
.layer-row { display:flex; align-items:center; gap:8px;
             background:var(--panel); border:1px solid #2a3650;
             border-radius:6px; padding:8px; }
.sw { width:12px; height:12px; border-radius:50%; flex:none; }
.step-group { display:flex; align-items:center; gap:8px; flex:1;
              justify-content:center; }
.nval { font-size:16px; min-width:24px; text-align:center; }

.btn { background:#1c2740; color:var(--fg); border:1px solid var(--line);
        border-radius:6px; padding:10px 14px; font-size:14px;
        min-height:44px; cursor:pointer; touch-action:manipulation; }
.btn.primary { background:var(--accent); border-color:var(--accent); }
.btn.step { min-width:44px; padding:10px; }
.btn.wide { width:100%; }
.btn:disabled { opacity:.4; cursor:not-allowed; }
.tg { min-width:44px; min-height:44px; border:1px solid var(--line);
      background:transparent; color:var(--muted); border-radius:5px;
      cursor:pointer; touch-action:manipulation; }
.tg.on { background:var(--accent); color:#fff; border-color:var(--accent); }
.tg:disabled { opacity:.4; cursor:not-allowed; }
.ratio { color:var(--muted); font-size:13px; letter-spacing:.3px;
         padding-top:4px; }

/* Narrow: stack rings -> readout -> controls. No horizontal scroll. */
@media (max-width: 860px) {
  #app { flex-direction: column; align-items: stretch; }
  #panel { width: 100%; }
  #rings { max-width: 80vw; margin: 0 auto; }
}
```

- [ ] **Step 3: Create `src/main.js`**

```js
import {
  setLayerN, addLayer, removeLayer, toggleMute, toggleSolo,
  setBpmForLayer, setUnitLayerIndex, setPlaying,
} from './model.js';
import { decodeState, encodeState } from './url-state.js';
import { createAudioEngine } from './audio.js';
import { createScheduler } from './scheduler.js';
import { createRingView } from './ring-view.js';
import { createControls } from './controls.js';

const decoded = decodeState(location.hash);
let state = decoded.state;

const audio = createAudioEngine();
const scheduler = createScheduler({ getState: () => state, audio });
const view = createRingView(document.getElementById('rings'));

let urlTimer = null;
function writeUrl() {
  if (urlTimer) clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    history.replaceState(null, '', encodeState(state));
  }, 300);
}

// Apply a transition, then re-render + reconfigure + persist.
function dispatch(next) {
  state = next;
  controls.render();
  view.renderStructure(state);
  scheduler.reconfigure();
  writeUrl();
}

// --- tap tempo: median interval of recent taps -> BPM for the unit layer ---
let taps = [];
function tap() {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 3000);
  taps.push(now);
  if (taps.length >= 2) {
    const gaps = [];
    for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    const bpm = 60000 / median;
    dispatch(setBpmForLayer(state, state.unitLayerIndex, bpm));
  }
}

async function togglePlay() {
  if (state.isPlaying) {
    scheduler.stop();
    dispatch(setPlaying(state, false));
  } else {
    const ok = await audio.resume();
    if (!ok) {
      controls.showBanner('Audio is blocked by the browser — tap Play again.', 4000);
      return;
    }
    dispatch(setPlaying(state, true));
    scheduler.start();
  }
}

const actions = {
  setBpm: (idx, bpm) => dispatch(setBpmForLayer(state, idx, bpm)),
  setN: (id, n) => dispatch(setLayerN(state, id, n)),
  addLayer: () => dispatch(addLayer(state)),
  removeLayer: (id) => dispatch(removeLayer(state, id)),
  toggleMute: (id) => dispatch(toggleMute(state, id)),
  toggleSolo: (id) => dispatch(toggleSolo(state, id)),
  setUnit: (idx) => dispatch(setUnitLayerIndex(state, idx)),
  togglePlay,
  tap,
};

const controls = createControls(
  document.getElementById('panel'), () => state, actions);

// Initial paint
controls.render();
view.renderStructure(state);
if (decoded.warning) controls.showBanner(decoded.warning, 5000);

// Render loop locked to the audio clock via the scheduler transport.
(function frame() {
  view.tick(scheduler.getTransport());
  requestAnimationFrame(frame);
})();

// Mobile/desktop interruption recovery (calls, app-switch suspend the context).
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.isPlaying
      && audio.state() !== 'running') {
    const ok = await audio.resume();
    if (!ok) controls.showBanner('Audio interrupted — tap Play to resume.', 4000);
  }
});
```

- [ ] **Step 4: Manual end-to-end verification (desktop)**

Run: `python3 -m http.server 8000`; open `http://localhost:8000/`.
Verify:
- Loads with rings (4 outer, 7 inner) + ratio text `4 : 7 · cycle 2400 ms · grid LCM 28`.
- Play starts audio and the rotating hand; downbeats are accented and coincide at 12 o'clock once per cycle.
- BPM stepper/input changes tempo; the "per" dropdown reframes the BPM number with no audible jump.
- Adding layers (cap 6), changing `n`, mute, solo, remove (disabled at 1 layer) all take effect immediately from the downbeat.
- Tap the Tap button ~4× at a steady rate → tempo follows.
- Copy share link, open it in a new tab → same pattern, not playing; corrupt the hash manually → loads default 4:7 with the warning banner.

- [ ] **Step 5: Manual responsive/mobile verification**

In devtools device mode (or a real phone via your LAN IP):
- Below ~860 px the layout stacks: rings, then controls; **no horizontal scroll**.
- All buttons/toggles are ≥44 px and comfortably tappable.
- On iOS Safari: first Play tap unlocks audio (no silent failure); backgrounding then returning while playing recovers audio or shows the resume banner.
- Both portrait and landscape are usable.

- [ ] **Step 6: Full regression**

Run: `npm test`
Expected: PASS — all suites (palette, geometry, model-math, model-state, url-state, scheduler, scheduler-shell) green.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css src/main.js
git commit -m "feat: composition root, responsive shell, end-to-end app" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (completed during planning)

**Spec coverage:**
- §3 model (cycleMs sole tempo, hit math, no reference, cosmetic unit index) → Tasks 3–4.
- §4 module breakdown + unidirectional flow + restart-on-edit → Tasks 3–11 (`dispatch` + `reconfigure`).
- §5 audio (6 voices, accent, iOS unlock, visible failure) → Task 8 + `togglePlay` banner.
- §6 rings (radii, dot angles, downbeat size, audio-clock playhead, flash) → Tasks 2, 9.
- §7 Layout A + responsive (≥860 side-by-side, stacked below, ≥44 px, native select, Pointer Events, viewport) → Tasks 10–11.
- §8 edge cases: AudioContext suspended (Task 8/main), clamps (Task 3), layer bounds (Task 4), mute/solo precedence (Task 4), malformed URL (Task 5), float drift (Task 6 multiplication), debounced `replaceState` (Task 11), iOS unlock + interruption (Tasks 8, 11), small-viewport no-scroll (Task 11 CSS).
- §9 testing: `node --test` suites for all pure modules; manual harness for audio/view; responsive checklist → Tasks 1–11.
- §10 seams: `Visualization` interface (Task 9), `playHit` interface (Task 8), voice-index identity via `palette.js` (Task 1).

**Placeholder scan:** none — every code/command step is concrete.

**Type consistency:** `state = {layers:[{id,n,muted,soloed}], cycleMs, isPlaying, unitLayerIndex}` used identically across model/url-state/scheduler/main; transitions return new state; `audibleLayers` → `{index,layer}` consumed by `hitsInWindow`; transport `{nowSec,cycleStartSec,cycleMs,isRunning}` produced by scheduler and consumed by `ring-view.tick`; `actions` keys match `createControls` usage and `main.js` definitions.
