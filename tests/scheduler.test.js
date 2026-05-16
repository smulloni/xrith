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
