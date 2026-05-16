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
    '4 : 7 · cycle 2400 ms · grid LCM 28');
});

test('setPlaying toggles the flag only', () => {
  assert.equal(setPlaying(createDefaultState(), true).isPlaying, true);
});
