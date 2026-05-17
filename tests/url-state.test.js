import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState } from '../src/url-state.js';
import { createDefaultState, toggleSolo, toggleMute, toggleStepMute } from '../src/model.js';

const shape = s => ({
  layers: s.layers.map(l => ({ n: l.n, muted: l.muted, soloed: l.soloed })),
  cycleMs: s.cycleMs, unitLayerIndex: s.unitLayerIndex, isPlaying: s.isPlaying,
});

test('encode default => stable string', () => {
  assert.equal(encodeState(createDefaultState()), '#1;4000;0;4,7');
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
  assert.equal(decodeState(null).warning, null);
  assert.equal(decodeState('   ').warning, null);
});

test('malformed or out-of-range => default + warning', () => {
  for (const bad of ['#9;2400;0;4,7', '#1;2400;0;', '#1;abc;0;4,7',
                      '#1;2400;0;0,7', '#1;2400;0;4,7,1,2,3,4,5',
                      '#1;2400;0;4,99', 'garbage', '#1;2400;0;4,7;extra',
                      '#1;2400;0;,4,7', '#1;2400;0;4,7,',
                      '#1;2400;0;4x,7', '#1;49;0;4,7']) {
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

test('cycleMs boundary values 50 and 120000 are accepted', () => {
  for (const c of [50, 120000]) {
    const r = decodeState(`#1;${c};0;4,7`);
    assert.equal(r.warning, null);
    assert.equal(r.state.cycleMs, c);
  }
});

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
