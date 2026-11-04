import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  lerp,
  mapRange,
  inverseLerp,
  wrap,
  approximateEquals,
  normalizeSeed,
  createSeededRandom,
} from '../../src/utils/Math.js';

test('clamp limits values to the range', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('clamp resolves NaN to the lower bound', () => {
  assert.equal(clamp(Number.NaN, 0, 1), 0);
});

test('clamp with an inverted range swaps the bounds', () => {
  assert.equal(clamp(0.5, 1, 0), 0.5);
  assert.equal(clamp(2, 1, 0), 1);
  assert.equal(clamp(-1, 1, 0), 0);
});

test('lerp interpolates linearly', () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
});

test('lerp extrapolates beyond the unit range', () => {
  assert.equal(lerp(0, 10, 2), 20);
  assert.equal(lerp(0, 10, -1), -10);
});

test('mapRange remaps between ranges', () => {
  assert.equal(mapRange(0.5, 0, 1, 10, 20), 15);
  assert.equal(mapRange(0, 0, 1, 10, 20), 10);
  assert.equal(mapRange(1, 0, 1, 10, 20), 20);
});

test('mapRange with a degenerate input range returns the output minimum', () => {
  assert.equal(mapRange(5, 2, 2, 10, 20), 10);
});

test('inverseLerp locates a value within a range', () => {
  assert.equal(inverseLerp(0, 10, 5), 0.5);
  assert.equal(inverseLerp(0, 10, 0), 0);
  assert.equal(inverseLerp(0, 10, 10), 1);
});

test('inverseLerp with a degenerate range returns zero', () => {
  assert.equal(inverseLerp(3, 3, 5), 0);
});

test('wrap keeps values inside the half-open range', () => {
  assert.equal(wrap(5, 0, 3), 2);
  assert.equal(wrap(-1, 0, 3), 2);
  assert.equal(wrap(3, 0, 3), 0);
  assert.equal(wrap(1, 0, 3), 1);
});

test('wrap with a degenerate range returns the minimum', () => {
  assert.equal(wrap(5, 2, 2), 2);
  assert.equal(wrap(5, 3, 1), 3);
});

test('approximateEquals respects the epsilon', () => {
  assert.equal(approximateEquals(0.1 + 0.2, 0.3), true);
  assert.equal(approximateEquals(0.1 + 0.2, 0.31), false);
  assert.equal(approximateEquals(1, 1.0001, 1e-3), true);
});

test('approximateEquals never treats NaN as equal', () => {
  assert.equal(approximateEquals(Number.NaN, Number.NaN), false);
});

test('normalizeSeed produces stable unsigned integers', () => {
  assert.equal(normalizeSeed(5), 5);
  assert.equal(normalizeSeed(-5), 5);
  assert.equal(normalizeSeed(1.9), 1);
  assert.equal(normalizeSeed('ritual'), normalizeSeed('ritual'));
  assert.notEqual(normalizeSeed('ritual'), normalizeSeed('void'));
  assert.ok(normalizeSeed('ritual') >= 0);
});

test('createSeededRandom is deterministic per seed', () => {
  const a = createSeededRandom(42);
  const b = createSeededRandom(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('createSeededRandom differs across seeds', () => {
  const a = createSeededRandom(1);
  const b = createSeededRandom(2);
  assert.notEqual(a(), b());
});

test('createSeededRandom stays within [0, 1)', () => {
  const random = createSeededRandom(7);
  for (let i = 0; i < 500; i += 1) {
    const value = random();
    assert.ok(value >= 0 && value < 1, `value out of range: ${value}`);
  }
});
