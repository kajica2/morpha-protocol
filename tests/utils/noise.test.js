import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoise } from '../../src/utils/Noise.js';

test('the same seed produces identical output', () => {
  const a = createNoise(1234);
  const b = createNoise(1234);
  for (const [x, y] of [[0, 0], [1.5, -2.25], [10.125, 3.75], [-7.5, 8.25]]) {
    assert.equal(a(x, y), b(x, y), `mismatch at ${x},${y}`);
  }
});

test('different seeds produce different output', () => {
  const a = createNoise(1);
  const b = createNoise(2);
  const differs = [[0, 0], [1.5, -2.25], [10.125, 3.75]].some(([x, y]) => a(x, y) !== b(x, y));
  assert.ok(differs, 'different seeds should not agree');
});

test('a string seed is deterministic too', () => {
  const a = createNoise('ritual');
  const b = createNoise('ritual');
  const c = createNoise('void');
  assert.equal(a(2.5, 1.25), b(2.5, 1.25));
  assert.notEqual(a(2.5, 1.25), c(2.5, 1.25));
});

test('output stays within the [-1, 1] band', () => {
  const noise = createNoise(99);
  for (let x = -20; x <= 20; x += 0.37) {
    for (let y = -20; y <= 20; y += 0.37) {
      const value = noise(x, y);
      assert.ok(value >= -1 && value <= 1, `value out of range: ${value} at ${x},${y}`);
    }
  }
});

test('the field is continuous — nearby samples are close', () => {
  const noise = createNoise(7);
  const delta = 1e-4;
  const base = noise(3.3, 2.7);
  const nearby = noise(3.3 + delta, 2.7);
  assert.ok(Math.abs(base - nearby) < 0.01, 'noise jumped between adjacent samples');
});

test('the sampler is a pure function of its coordinates', () => {
  const noise = createNoise(3);
  const first = noise(5.5, -1.25);
  noise(100, 100);
  assert.equal(noise(5.5, -1.25), first);
});

test('the seed is exposed for provenance', () => {
  const noise = createNoise(2024);
  assert.equal(noise.seed, 2024);
});
