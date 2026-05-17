import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitsInWindow } from '../src/scheduler.js';
import { createDefaultState, toggleMute, toggleSolo, toggleStepMute } from '../src/model.js';

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
  const mHits = hitsInWindow(m, 0, 0, 5);
  assert.ok(mHits.length > 0, 'layer 1 still audible (not a vacuous pass)');
  assert.ok(mHits.every(h => h.layerIndex === 1));
});
