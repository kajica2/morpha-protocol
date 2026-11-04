import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  smoothstep,
  EASINGS,
  getEasing,
} from '../../src/utils/Easing.js';

const CURVES = { linear, easeIn, easeOut, easeInOut, smoothstep };

test('every curve maps 0 to 0 and 1 to 1', () => {
  for (const [name, curve] of Object.entries(CURVES)) {
    assert.equal(curve(0), 0, `${name}(0)`);
    assert.equal(curve(1), 1, `${name}(1)`);
  }
});

test('every curve clamps out-of-range input', () => {
  for (const [name, curve] of Object.entries(CURVES)) {
    assert.equal(curve(-1), curve(0), `${name}(-1)`);
    assert.equal(curve(2), curve(1), `${name}(2)`);
  }
});

test('every curve stays within [0, 1] across the domain', () => {
  for (const [name, curve] of Object.entries(CURVES)) {
    for (let i = 0; i <= 100; i += 1) {
      const value = curve(i / 100);
      assert.ok(value >= 0 && value <= 1, `${name}(${i / 100}) = ${value}`);
    }
  }
});

test('linear is the identity', () => {
  assert.equal(linear(0.25), 0.25);
  assert.equal(linear(0.75), 0.75);
});

test('easeIn sits below the diagonal — slow start, fast finish', () => {
  assert.ok(easeIn(0.25) < 0.25);
  assert.ok(easeIn(0.75) < 0.75);
  assert.ok(easeIn(0.75) > easeIn(0.25));
});

test('easeOut sits above the diagonal — fast start, slow finish', () => {
  assert.ok(easeOut(0.25) > 0.25);
  assert.ok(easeOut(0.75) > 0.75);
  assert.ok(easeOut(0.75) > easeOut(0.25));
  assert.ok(easeOut(0.25) < easeOut(0.5));
});

test('easeInOut is symmetric around the midpoint', () => {
  assert.equal(easeInOut(0.5), 0.5);
  assert.ok(Math.abs(easeInOut(0.25) + easeInOut(0.75) - 1) < 1e-12);
});

test('smoothstep passes through the midpoint', () => {
  assert.equal(smoothstep(0.5), 0.5);
});

test('every curve is monotonically non-decreasing', () => {
  for (const [name, curve] of Object.entries(CURVES)) {
    let previous = curve(0);
    for (let i = 1; i <= 100; i += 1) {
      const value = curve(i / 100);
      assert.ok(value >= previous - 1e-12, `${name} dipped at ${i / 100}`);
      previous = value;
    }
  }
});

test('the easing registry exposes every curve', () => {
  assert.equal(Object.keys(EASINGS).length, 5);
  assert.equal(getEasing('smoothstep'), smoothstep);
  assert.equal(getEasing('linear'), linear);
});

test('an unknown easing name throws', () => {
  assert.throws(() => getEasing('bounce'), RangeError);
});
