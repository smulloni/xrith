import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultState, addLayer, removeLayer, setLayerN,
  toggleMute, toggleSolo, setCycleMs, setBpmForLayer,
  setUnitLayerIndex, setPlaying, audibleLayers, ratioText,
  toggleStepMute, isStepMuted, makeLayer,
} from '../src/model.js';

test('default state: 4 and 7, cycleMs 4000 (60bpm per 4), not playing', () => {
  const s = createDefaultState();
  assert.deepEqual(s.layers.map(l => l.n), [4, 7]);
  assert.equal(s.cycleMs, 4000);
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
  assert.equal(s.layers[0].muted, false, 'toggleMute did not mutate input');
  assert.equal(s.layers[0].soloed, false, 'toggleSolo did not mutate input');
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
  // all muted, no solo -> nothing audible
  let m = createDefaultState();
  m = toggleMute(m, m.layers[0].id);
  m = toggleMute(m, m.layers[1].id);
  assert.deepEqual(audibleLayers(m).map(x => x.index), []);
  // multiple solos, none muted -> all soloed audible
  let d = createDefaultState();
  d = toggleSolo(d, d.layers[0].id);
  d = toggleSolo(d, d.layers[1].id);
  assert.deepEqual(audibleLayers(d).map(x => x.index), [0, 1]);
});

test('removeLayer keeps unitLayerIndex in range', () => {
  let s = createDefaultState();
  s = setUnitLayerIndex(s, 1);
  s = removeLayer(s, s.layers[1].id);
  assert.equal(s.unitLayerIndex, 0);
  // cosmetic-only drift: removing an EARLIER layer clamps from above and
  // may point at a different layer than before — intentional.
  let t = createDefaultState();
  t = addLayer(t);                    // [4,7,3]
  t = setUnitLayerIndex(t, 2);        // points at index 2
  t = removeLayer(t, t.layers[0].id); // remove the 4 -> [7,3]
  assert.equal(t.unitLayerIndex, 1);  // clamped to len-1 (=1), not preserved at 2
});

test('ratioText shows ratio, cycle, LCM', () => {
  assert.equal(ratioText(createDefaultState()),
    '4 : 7 · cycle 4000 ms · grid LCM 28');
});

test('setPlaying toggles the flag only', () => {
  assert.equal(setPlaying(createDefaultState(), true).isPlaying, true);
});

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
