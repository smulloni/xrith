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
