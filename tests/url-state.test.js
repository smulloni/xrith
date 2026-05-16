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
