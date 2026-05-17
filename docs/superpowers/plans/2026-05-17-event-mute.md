# Per-Event Mute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user click any dot ("ball") on a ring to toggle that single event's mute; muted events render gray, don't sound, don't flash, and persist in the shareable URL.

**Architecture:** Add one piece of layer state (`mutedSteps: sorted int[]`) to the pure model and thread it through the three pipelines that independently re-derive events from `k = 0..n-1`: the scheduler (skip muted hits), the ring view (gray/hollow visuals + clickable hit targets + flash gating), and url-state (optional `v1`-compatible `.i.j.k` token suffix). Per-event mute composes with the existing layer M/S purely by AND; layer M/S now also makes dots **hollow** so only sounding events look filled.

**Tech Stack:** Vanilla ES modules, no build. `node --test` for the pure core (model/scheduler/url-state). SVG ring view and audio are manual-tested via `tests/manual.html` (project policy, parent spec §9).

**Spec:** `docs/superpowers/specs/2026-05-17-event-mute-design.md`

---

### Task 1: Model — `mutedSteps`, `toggleStepMute`, `isStepMuted`, prune-on-shrink

**Files:**
- Modify: `src/model.js` (`makeLayer`, `setLayerN`; add `toggleStepMute`, `isStepMuted`)
- Test: `tests/model-state.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/model-state.test.js` (and add `toggleStepMute, isStepMuted, makeLayer` to the existing import from `../src/model.js`):

```js
test('makeLayer / default state seed mutedSteps as empty array', () => {
  assert.deepEqual(makeLayer(5).mutedSteps, []);
  for (const l of createDefaultState().layers) assert.deepEqual(l.mutedSteps, []);
});

test('toggleStepMute adds, removes, stays sorted/unique, immutably', () => {
  const s = createDefaultState();
  const id = s.layers[1].id;                 // the n=7 layer
  const a = toggleStepMute(s, id, 3);
  assert.deepEqual(a.layers[1].mutedSteps, [3]);
  const b = toggleStepMute(toggleStepMute(a, id, 1), id, 5);
  assert.deepEqual(b.layers[1].mutedSteps, [1, 3, 5], 'kept sorted');
  const c = toggleStepMute(b, id, 3);        // toggle 3 back off
  assert.deepEqual(c.layers[1].mutedSteps, [1, 5]);
  assert.deepEqual(s.layers[1].mutedSteps, [], 'input never mutated');
  assert.deepEqual(a.layers[0].mutedSteps, [], 'other layers untouched');
});

test('toggleStepMute ignores out-of-range k (k<0 or k>=n)', () => {
  const s = createDefaultState();
  const id = s.layers[0].id;                 // n=4 -> valid k: 0..3
  assert.deepEqual(toggleStepMute(s, id, 4).layers[0].mutedSteps, []);
  assert.deepEqual(toggleStepMute(s, id, -1).layers[0].mutedSteps, []);
  assert.deepEqual(toggleStepMute(s, id, 0).layers[0].mutedSteps, [0]);
});

test('setLayerN forgets mutes on shrink, keeps them on grow', () => {
  let s = createDefaultState();
  const id = s.layers[1].id;                 // n=7
  s = toggleStepMute(s, id, 1);
  s = toggleStepMute(s, id, 5);              // mutedSteps [1,5]
  const shrunk = setLayerN(s, id, 4);        // 5 is now out of range
  assert.equal(shrunk.layers[1].n, 4);
  assert.deepEqual(shrunk.layers[1].mutedSteps, [1], 'dropped 5');
  const grown = setLayerN(shrunk, id, 9);    // grow back: no resurrection
  assert.deepEqual(grown.layers[1].mutedSteps, [1]);
  assert.deepEqual(s.layers[0].mutedSteps, [], 'other layer untouched');
});

test('isStepMuted reports membership', () => {
  let t = createDefaultState();
  t = toggleStepMute(t, t.layers[0].id, 2);   // mute k=2 on layer 0
  assert.equal(isStepMuted(t.layers[0], 2), true);
  assert.equal(isStepMuted(t.layers[0], 0), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/model-state.test.js`
Expected: FAIL — `toggleStepMute is not a function` / `isStepMuted is not a function` / `makeLayer(...).mutedSteps` is `undefined`.

- [ ] **Step 3: Implement in `src/model.js`**

Change `makeLayer` (currently line 42-44):

```js
export function makeLayer(n) {
  return { id: newId(), n: clampN(n), muted: false, soloed: false, mutedSteps: [] };
}
```

Add after `toggleSolo` (currently ends line 93):

```js
export function isStepMuted(layer, k) {
  return layer.mutedSteps.includes(k);
}
export function toggleStepMute(state, id, k) {
  return withLayers(state, state.layers.map((l) => {
    if (l.id !== id || k < 0 || k >= l.n) return l;
    const mutedSteps = l.mutedSteps.includes(k)
      ? l.mutedSteps.filter((x) => x !== k)
      : [...l.mutedSteps, k].sort((a, b) => a - b);
    return { ...l, mutedSteps };
  }));
}
```

Replace `setLayerN` (currently line 82-85) so it prunes on shrink:

```js
export function setLayerN(state, id, n) {
  return withLayers(state, state.layers.map((l) => {
    if (l.id !== id) return l;
    const cn = clampN(n);
    return { ...l, n: cn, mutedSteps: l.mutedSteps.filter((k) => k < cn) };
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/model-state.test.js`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Run the full suite (nothing else broke)**

Run: `npm test`
Expected: PASS, 0 fail. (Pre-existing `model-state` tests still pass — `setLayerN` clamp/immutability behavior is unchanged for layers without mutes.)

- [ ] **Step 6: Commit**

```bash
git add src/model.js tests/model-state.test.js
git commit -m "feat(model): per-event mute state (mutedSteps) with forget-on-shrink

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Scheduler — exclude individually-muted events from hits

**Files:**
- Modify: `src/scheduler.js` (import + `hitsInWindow` inner loop)
- Test: `tests/scheduler.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/scheduler.test.js`. Change its model import line to:

```js
import { createDefaultState, toggleMute, toggleSolo, toggleStepMute } from '../src/model.js';
```

Then add:

```js
test('individually-muted event is excluded from hits', () => {
  let s = createDefaultState();            // layer 0 = n4, cycleSec 4 -> hits at 0,1,2,3s
  s = toggleStepMute(s, s.layers[0].id, 1); // mute k=1 (t=1.0s) of layer 0
  const t0 = hitsInWindow(s, 0, 0, 0.05).filter(h => h.layerIndex === 0);
  assert.equal(t0.length, 1, 'downbeat still present');
  const t1 = hitsInWindow(s, 0, 1.0, 1.05).filter(h => h.layerIndex === 0);
  assert.equal(t1.length, 0, 'muted k=1 produces no hit');
});

test('muting the downbeat (k=0) removes that accent', () => {
  let s = createDefaultState();
  s = toggleStepMute(s, s.layers[0].id, 0); // mute layer-0 downbeat
  const hits = hitsInWindow(s, 0, 0, 0.05);
  assert.deepEqual(hits.map(h => h.layerIndex), [1], 'only layer 1 downbeat at t=0');
});

test('per-event mute composes with layer mute/solo by AND', () => {
  // Layer 1 soloed; its k=0 muted => soloed layer still has muted event silent.
  let s = createDefaultState();
  s = toggleSolo(s, s.layers[1].id);
  s = toggleStepMute(s, s.layers[1].id, 0);
  assert.deepEqual(hitsInWindow(s, 0, 0, 0.05), [], 'solo does not resurrect a muted event');
  // Layer 0 muted (layer-level): per-event state irrelevant, layer silent anyway.
  let m = createDefaultState();
  m = toggleStepMute(m, m.layers[0].id, 2);
  m = toggleMute(m, m.layers[0].id);
  assert.ok(hitsInWindow(m, 0, 0, 5).every(h => h.layerIndex === 1));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/scheduler.test.js`
Expected: FAIL — muted-event hits are still emitted (e.g. `t1.length` is 1, not 0; downbeat test sees `[0,1]`).

- [ ] **Step 3: Implement in `src/scheduler.js`**

Change the import (currently line 1):

```js
import { audibleLayers, isStepMuted } from './model.js';
```

In `hitsInWindow`, inside the `for (let k = 0; k < layer.n; k++)` loop (currently line 25), add the skip as the first statement of the loop body:

```js
      for (let k = 0; k < layer.n; k++) {
        if (isStepMuted(layer, k)) continue;
        const t = base + (k / layer.n) * cycleSec;
        if (t >= fromSec && t < toSec) {
          hits.push({ layerIndex: index, voiceIndex: index,
                      accent: k === 0, timeSec: t });
        }
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scheduler.test.js`
Expected: PASS (new + all pre-existing scheduler tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/scheduler.js tests/scheduler.test.js
git commit -m "feat(scheduler): skip individually-muted events (AND with layer M/S)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: URL state — encode/decode `mutedSteps`, `v1`-compatible suffix

**Files:**
- Modify: `src/url-state.js` (`LAYER_RE`, `encodeState`, `decodeState`)
- Test: `tests/url-state.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/url-state.test.js`. Add `toggleStepMute` to the existing model import:

```js
import { createDefaultState, toggleSolo, toggleMute, toggleStepMute } from '../src/model.js';
```

Then add:

```js
test('encode: no suffix when no muted steps (byte-identical legacy)', () => {
  assert.equal(encodeState(createDefaultState()), '#1;4000;0;4,7');
});

test('encode: muted steps as a sorted dot-list suffix', () => {
  let s = createDefaultState();
  s = toggleStepMute(s, s.layers[1].id, 5);
  s = toggleStepMute(s, s.layers[1].id, 1);   // layer 1 (n7): steps {1,5}
  s = toggleSolo(s, s.layers[1].id);
  assert.equal(encodeState(s), '#1;4000;0;4,7s.1.5');
});

test('round-trip preserves muted steps', () => {
  let s = createDefaultState();
  s = toggleStepMute(s, s.layers[0].id, 2);
  s = toggleStepMute(s, s.layers[1].id, 0);
  s = toggleStepMute(s, s.layers[1].id, 6);
  const { state, warning } = decodeState(encodeState(s));
  assert.equal(warning, null);
  assert.deepEqual(state.layers.map(l => l.mutedSteps), [[2], [0, 6]]);
});

test('legacy v1 link without suffix decodes mutedSteps as []', () => {
  const r = decodeState('#1;4000;0;4m,7s');
  assert.equal(r.warning, null);
  assert.deepEqual(r.state.layers.map(l => l.mutedSteps), [[], []]);
});

test('malformed muted-step suffix => default + warning', () => {
  for (const bad of [
    '#1;4000;0;4.9,7',     // index 9 >= n=4
    '#1;4000;0;4,7.1.1',   // duplicate index
    '#1;4000;0;4.,7',      // empty list (regex reject)
    '#1;4000;0;4.x,7',     // non-numeric (regex reject)
    '#1;4000;0;4..1,7',    // malformed dots (regex reject)
    '#1;4000;0;4.0.,7',    // trailing dot (regex reject)
  ]) {
    const r = decodeState(bad);
    assert.ok(r.warning, `expected warning for ${bad}`);
    assert.deepEqual(r.state.layers.map(l => l.n), [4, 7]);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/url-state.test.js`
Expected: FAIL — encode produces no suffix (e.g. `#1;4000;0;4,7s`), round-trip loses `mutedSteps`, malformed cases parse instead of falling back.

- [ ] **Step 3: Implement in `src/url-state.js`**

Replace `LAYER_RE` (currently line 8):

```js
const LAYER_RE = /^(\d+)(m?)(s?)(?:\.(\d+(?:\.\d+)*))?$/;
```

Replace `encodeState` (currently line 11-16):

```js
export function encodeState(state) {
  const layers = state.layers
    .map((l) => {
      const steps = l.mutedSteps.length
        ? '.' + [...l.mutedSteps].sort((a, b) => a - b).join('.')
        : '';
      return `${l.n}${l.muted ? 'm' : ''}${l.soloed ? 's' : ''}${steps}`;
    })
    .join(',');
  return `#${VERSION};${Math.round(state.cycleMs)};${state.unitLayerIndex};${layers}`;
}
```

In `decodeState`, the per-entry loop (currently line 41-50) becomes:

```js
  for (const e of entries) {
    const m = e.match(LAYER_RE);
    if (!m) return fallback();
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < N_MIN || n > N_MAX) return fallback();
    const layer = makeLayer(n);
    layer.muted = m[2] === 'm';
    layer.soloed = m[3] === 's';
    if (m[4] !== undefined) {
      const idxs = m[4].split('.').map(Number);
      const seen = new Set();
      for (const k of idxs) {
        if (k < 0 || k >= n || seen.has(k)) return fallback();
        seen.add(k);
      }
      layer.mutedSteps = idxs.slice().sort((a, b) => a - b);
    }
    layers.push(layer);
  }
```

(The regex guarantees `m[4]` is digits separated by single dots, so each split element is a non-negative integer; range, duplicate, and structural checks are what remain.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/url-state.test.js`
Expected: PASS — including the pre-existing `'malformed or out-of-range => default + warning'` test (all its old bad strings still fail the new regex: `4x` has trailing `x`, `4,7;extra` is a parts-count failure, `''` entry still fails, etc.).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/url-state.js tests/url-state.test.js
git commit -m "feat(url): encode/decode per-event mutes (v1-compatible .i.j.k suffix)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ring view — gray/hollow visuals, clickable hit targets, flash gating, wiring

**Files:**
- Modify: `src/ring-view.js` (imports, `createRingView` signature, `renderStructure`)
- Modify: `src/main.js` (model import + `createRingView` call)

Not node-tested (Web Audio/SVG is manual territory, parent spec §9). Verified by the full suite still passing plus the manual harness in Task 5.

- [ ] **Step 1: Update `src/ring-view.js` imports and constant**

Replace the import block (currently line 1-2) and add a gray constant after the `CX, CY` line (currently line 5):

```js
import { PALETTE } from './palette.js';
import { audibleLayers, isStepMuted } from './model.js';
import { ringRadius, pointOnCircle, crossed } from './geometry.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CX = 500, CY = 500;
const MUTED_COLOR = '#6b7794';   // gray = this event is individually muted
```

- [ ] **Step 2: Change `createRingView` signature**

Currently line 26: `export function createRingView(svg) {` →

```js
export function createRingView(svg, onToggleEvent) {
```

- [ ] **Step 3: Replace the `state.layers.forEach(...)` body in `renderStructure`**

Replace the whole `state.layers.forEach((layer, i) => { ... });` block (currently line 34-49) with:

```js
    const audible = new Set(audibleLayers(state).map((a) => a.index));
    state.layers.forEach((layer, i) => {
      const r = ringRadius(i, L);
      svg.appendChild(el('circle', {
        cx: CX, cy: CY, r, fill: 'none',
        stroke: '#33415c', 'stroke-width': 2,
      }));
      const color = PALETTE[i % PALETTE.length].color;
      const layerSilenced = !audible.has(i);
      for (let k = 0; k < layer.n; k++) {
        const frac = k / layer.n;
        const p = pointOnCircle(CX, CY, r, frac);
        const baseR = k === 0 ? 22 : 14;
        const eventMuted = isStepMuted(layer, k);
        const tone = eventMuted ? MUTED_COLOR : color;
        const attrs = { cx: p.x, cy: p.y, r: baseR, 'pointer-events': 'none' };
        if (layerSilenced) {
          attrs.fill = 'none';
          attrs.stroke = tone;
          attrs['stroke-width'] = k === 0 ? 3 : 2;
        } else {
          attrs.fill = tone;
        }
        const c = el('circle', attrs);
        svg.appendChild(c);
        // Transparent >=44px touch target on top; carries the toggle.
        const hit = el('circle', {
          cx: p.x, cy: p.y, r: Math.max(baseR, 22),
          fill: 'transparent', 'pointer-events': 'all', cursor: 'pointer',
        });
        const layerId = layer.id, step = k;
        hit.addEventListener('click', () => onToggleEvent(layerId, step));
        svg.appendChild(hit);
        // Audio<->visual honesty: only events that will sound flash.
        if (!layerSilenced && !eventMuted) dots.push({ circle: c, frac, baseR });
      }
    });
```

(The `hand` line creation, `svg.appendChild(hand)`, `lastP = 0`, `wasRunning = false` that currently follow at lines 50-56 stay exactly as they are — the hand is still appended last so it renders above the hit circles. `tick()` and `destroy()` are unchanged.)

- [ ] **Step 4: Wire the callback in `src/main.js`**

Add `toggleStepMute` to the model import (currently line 1-4):

```js
import {
  setLayerN, addLayer, removeLayer, toggleMute, toggleSolo,
  setBpmForLayer, setUnitLayerIndex, setPlaying, toggleStepMute,
} from './model.js';
```

Replace the `createRingView` line (currently line 16):

```js
const view = createRingView(document.getElementById('rings'),
  (layerId, k) => dispatch(toggleStepMute(state, layerId, k)));
```

(No new pathway: the click flows through the existing `dispatch` → `controls.render` + `view.renderStructure` + `scheduler.reconfigure` + debounced `writeUrl`. While playing, the cycle restarts from the downbeat — the parent spec's documented live-edit behavior.)

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS, 0 fail. (Pure core unchanged in this task; this confirms imports/wiring didn't break module loading via the test graph.)

- [ ] **Step 6: Commit**

```bash
git add src/ring-view.js src/main.js
git commit -m "feat(ring-view): clickable per-event mute; gray/hollow dot states; flash only sounding events

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Manual harness + manual verification

**Files:**
- Modify: `tests/manual.html` (ring render probe section)

- [ ] **Step 1: Replace the ring-probe section of `tests/manual.html`**

Replace the block from `<h1>Ring render probe</h1>` through the closing `</script>` of that section (currently line 39-54) with:

```html
  <h1>Ring render / per-event mute probe</h1>
  <p>4-against-7 (no audio). Verify:</p>
  <ol>
    <li>Click any dot → it turns <b>gray</b> (individually muted); click again → restored.</li>
    <li>Muted dots do <b>not</b> flash as the hand passes; colored dots do.</li>
    <li><b>Mute outer</b> → layer-4 dots become <b>hollow</b> (outline only), none flash.</li>
    <li>A dot you grayed stays distinguishable under a layer mute (hollow + gray).</li>
    <li><b>Solo inner</b> → outer becomes hollow too (solo-exclusion = layer silenced).</li>
    <li>Tap a small dot near its edge — the ~44px hit area still toggles it.</li>
  </ol>
  <button id="mMute">Toggle Mute outer (M)</button>
  <button id="mSolo">Toggle Solo inner (S)</button>
  <svg id="probe" style="width:340px;height:340px;background:#0e1320;border-radius:8px"></svg>
  <script type="module">
    import { createRingView } from '../src/ring-view.js';
    import { createDefaultState, toggleStepMute, toggleMute, toggleSolo }
      from '../src/model.js';
    let st = createDefaultState();
    const view = createRingView(document.getElementById('probe'), (id, k) => {
      st = toggleStepMute(st, id, k);
      view.renderStructure(st);
    });
    const rerender = () => view.renderStructure(st);
    document.getElementById('mMute').onclick = () => {
      st = toggleMute(st, st.layers[0].id); rerender();
    };
    document.getElementById('mSolo').onclick = () => {
      st = toggleSolo(st, st.layers[1].id); rerender();
    };
    rerender();
    let t0 = performance.now();
    (function loop(now) {
      const nowSec = (now - t0) / 1000;
      view.tick({ isRunning: true, cycleMs: 2400, nowSec, cycleStartSec: 0 });
      requestAnimationFrame(loop);
    })(performance.now());
  </script>
```

- [ ] **Step 2: Manually verify**

Run: `python3 -m http.server 8765` (from repo root), open `http://localhost:8765/tests/manual.html`.
Walk the 6-item checklist above. All must hold. Also open `http://localhost:8765/index.html`, mute a few events, confirm the URL hash gains a `.i.j` suffix (e.g. `...;4,7.2.5`), reload the page, and confirm the gray dots survive the reload.

- [ ] **Step 3: Commit**

```bash
git add tests/manual.html
git commit -m "test(manual): per-event mute / hollow-layer ring probe + checklist

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Spec sync — amend the parent design doc

**Files:**
- Modify: `docs/superpowers/specs/2026-05-16-cross-rhythm-explorer-design.md` (§3, §6, §10)

- [ ] **Step 1: §3 state block — add `mutedSteps`**

Replace this line (currently line 42):

```
  layers: [ { id, n, muted, soloed } ],   // 1..6 layers; n = integer subdivision
```

with:

```
  layers: [ { id, n, muted, soloed, mutedSteps } ], // 1..6; n = subdivision;
                                            // mutedSteps = sorted int[] of
                                            // individually-muted event indices
```

- [ ] **Step 2: §6 — note dot states + flash gating**

Replace this sentence (currently line 119-120):

```
dot, that dot **flashes** (~150 ms pulse) — visual confirmation locked to the
click. Only this view ships in v1, behind the `Visualization` interface so
```

with:

```
dot, that dot **flashes** (~150 ms pulse) — visual confirmation locked to the
click. Each dot has four states (filled/hollow × layer-color/gray): a dot is
**gray** when individually muted (click to toggle) and **hollow** when its
layer is silenced (M, or solo-exclusion); only filled, layer-colored dots
sound, and only they flash. Only this view ships in v1, behind the
`Visualization` interface so
```

- [ ] **Step 3: §10 — move per-step on-off (mute) to implemented**

Replace this paragraph (currently line 195-197):

```
Deferred: step sequencer / per-step on-off / extra accents / swing · sample
voices · per-layer volume/pitch/voice UI · lane & polygon visualizations ·
presets/accounts/export/MIDI · polymeter (independent per-layer cycles).
```

with:

```
Implemented post-v1: per-event mute (click a dot to silence one event;
see `2026-05-17-event-mute-design.md`).

Deferred: step sequencer / per-step *insert* / extra accents / swing · sample
voices · per-layer volume/pitch/voice UI · lane & polygon visualizations ·
presets/accounts/export/MIDI · polymeter (independent per-layer cycles).
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-cross-rhythm-explorer-design.md
git commit -m "docs: sync parent spec with per-event mute (§3, §6, §10)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §3 interaction/forget-on-shrink/composition → Task 1 (`toggleStepMute`, `setLayerN` prune) + Task 2 (AND).
- §4 visual 2×2 + flash gating → Task 4 + Task 5 (manual verify).
- §5 model shape (`mutedSteps`, `isStepMuted`) → Task 1.
- §6 scheduler/ring-view/main touch-points → Tasks 2 & 4.
- §7 URL grammar/back-compat/strict fallback → Task 3.
- §8 spec sync → Task 6.
- §9 edge cases → covered by tests in Tasks 1–3 (downbeat mute, all-events mute via repeated toggles, shrink prune, solo+mute AND, malformed/legacy URL) and the Task 5 manual checklist (touch target, hollow on solo-exclusion, reload persistence).
- §10 testing plan → Tasks 1–3 node tests, Task 5 manual.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output.

**Type consistency:** `mutedSteps` (sorted `int[]`), `toggleStepMute(state, id, k)`, `isStepMuted(layer, k)`, `setLayerN(state, id, n)`, `createRingView(svg, onToggleEvent)`, callback `(layerId, k)` — names/signatures consistent across Tasks 1, 2, 3, 4, 5. URL token `n[m][s][.i.j.k]` consistent between encode (Task 3 Step 3) and `LAYER_RE` (Task 3 Step 3) and tests (Task 3 Step 1).
