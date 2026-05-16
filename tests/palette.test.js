import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, MAX_LAYERS } from '../src/palette.js';

test('palette has 6 distinct voices with required fields', () => {
  assert.equal(PALETTE.length, 6);
  assert.equal(MAX_LAYERS, 6);
  const colors = new Set();
  for (const v of PALETTE) {
    assert.match(v.color, /^#[0-9a-f]{6}$/i);
    assert.ok(['sine', 'triangle', 'square', 'sawtooth'].includes(v.wave));
    assert.ok(v.freq > 0);
    colors.add(v.color);
  }
  assert.equal(colors.size, 6, 'colors must be distinct');
});
