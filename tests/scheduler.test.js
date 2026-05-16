import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitsInWindow } from '../src/scheduler.js';
import { createDefaultState, toggleMute, toggleSolo } from '../src/model.js';

// default: [4,7], cycleMs 4000 => cycleSec 4.0
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
  const s = createDefaultState();              // cycleSec = 4.0
  const hits = hitsInWindow(s, 0, 3.99, 4.05);
  const at40 = hits.filter(h => Math.abs(h.timeSec - 4.0) < 1e-9);
  assert.equal(at40.length, 2);
  assert.ok(at40.every(h => h.accent));
});

test('no audible layers => empty', () => {
  let s = createDefaultState();
  s = toggleMute(s, s.layers[0].id);
  s = toggleMute(s, s.layers[1].id);
  assert.deepEqual(hitsInWindow(s, 0, 0, 10), []);
});

test('half-open window [from,to): includes from, excludes to', () => {
  const s = createDefaultState();
  assert.equal(hitsInWindow(s, 0, 1.0, 1.1).some(h => Math.abs(h.timeSec - 1.0) < 1e-9), true);
  assert.equal(hitsInWindow(s, 0, 0.9, 1.0).some(h => Math.abs(h.timeSec - 1.0) < 1e-9), false);
});

test('adjacent windows: a hit on the boundary is scheduled exactly once', () => {
  const s = createDefaultState();           // layer 0 (n=4) has a hit at 1.0s
  const a = hitsInWindow(s, 0, 0, 1.0);     // window A
  const b = hitsInWindow(s, 0, 1.0, 2.0);   // window B (adjacent, no gap/overlap)
  const boundary = [...a, ...b]
    .filter(h => Math.abs(h.timeSec - 1.0) < 1e-9);
  assert.equal(boundary.length, 1);         // exactly once (in B, never A)
});
