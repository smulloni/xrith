import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringRadius, pointOnCircle, crossed } from '../src/geometry.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ~ ${b}`);

test('ringRadius: single layer uses max; multi spreads max..min', () => {
  near(ringRadius(0, 1), 460);
  near(ringRadius(0, 3), 460);
  near(ringRadius(2, 3), 150);
  near(ringRadius(1, 3), 305);
});

test('pointOnCircle: frac 0 is top, frac .25 is right (clockwise)', () => {
  const top = pointOnCircle(500, 500, 100, 0);
  near(top.x, 500); near(top.y, 400);
  const right = pointOnCircle(500, 500, 100, 0.25);
  near(right.x, 600); near(right.y, 500);
});

test('crossed: detects a fraction passed this frame, including wrap', () => {
  assert.equal(crossed(0.1, 0.3, 0.2), true);
  assert.equal(crossed(0.1, 0.3, 0.05), false);
  assert.equal(crossed(0.3, 0.3, 0.3), false);
  assert.equal(crossed(0.9, 0.1, 0.95), true);  // wrapped past 1.0
  assert.equal(crossed(0.9, 0.1, 0.05), true);
  assert.equal(crossed(0.9, 0.1, 0.5), false);
  // boundary contract: half-open (prevP, curP]
  assert.equal(crossed(0.1, 0.3, 0.1), false); // f === prevP is suppressed
  assert.equal(crossed(0.1, 0.3, 0.3), true);  // f === curP triggers
  assert.equal(crossed(0.9, 0.1, 0.1), true);  // wrap: f === curP triggers
  assert.equal(crossed(0.9, 0.1, 0.9), false); // wrap: f === prevP suppressed
  // total function: non-finite input never misfires
  assert.equal(crossed(NaN, 0.3, 0.2), false);
  assert.equal(crossed(0.1, NaN, 0.2), false);
});
