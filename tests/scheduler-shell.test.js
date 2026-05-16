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
  assert.equal(t.cycleMs, 4000);
  assert.equal(t.isRunning, true);
});

test('steady ticks (no stall): each hit scheduled exactly once across windows', () => {
  const f = fakeEnv();
  const s = createScheduler(f.env);
  s.start();                                   // tick @ now=0 -> window [0, 0.12)
  // advance in steps < LOOKAHEAD_SEC so successive windows stay contiguous
  // (from === previous to): no gap, no overlap, no stall.
  for (let i = 0; i < 48; i++) { f.advance(0.025); f.fire(); } // now -> 1.2s
  const at = (t) => f.played.filter(h => Math.abs(h.t - t) < 1e-6).length;
  assert.equal(at(0), 2, 'both downbeats scheduled exactly once (only tick 1)');
  assert.equal(at(1.0), 1, 'layer0 hit at 1.0s scheduled exactly once');
  assert.equal(at(4 / 7), 1, 'layer1 first off-beat scheduled exactly once');
});
