import assert from 'node:assert/strict';
import test from 'node:test';

import { clamp, roundTo, percentDelta, safeDivide } from '../units.ts';

test('clamp constrains value between low and high', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('roundTo rounds to specified digits', () => {
  assert.equal(roundTo(3.14159, 2), 3.14);
  assert.equal(roundTo(2.5, 0), 3);
});

test('percentDelta calculates percentage change', () => {
  assert.equal(percentDelta(100, 110), 10);
  assert.equal(percentDelta(0, 50), 0);
  assert.equal(percentDelta(NaN, 50), 0);
});

test('safeDivide returns quotient for valid inputs', () => {
  assert.equal(safeDivide(10, 2), 5);
  assert.equal(safeDivide(7, 3), 7 / 3);
});

test('safeDivide returns fallback for zero divisor', () => {
  assert.equal(safeDivide(10, 0), 0);
  assert.equal(safeDivide(10, 0, 99), 99);
});

test('safeDivide returns fallback for non-finite inputs', () => {
  assert.equal(safeDivide(NaN, 2), 0);
  assert.equal(safeDivide(10, Infinity, -1), -1);
});
