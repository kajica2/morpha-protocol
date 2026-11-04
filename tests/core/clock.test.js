import test from 'node:test';
import assert from 'node:assert/strict';
import { Clock } from '../../src/core/Clock.js';

test('clock reports delta and dt in seconds', () => {
  const clock = new Clock({ maxDelta: 1 });
  clock.tick(0);
  const frame = clock.tick(250);
  assert.equal(frame.delta, 0.25);
  assert.equal(frame.dt, 0.25);
});

test('first tick establishes the baseline with zero delta', () => {
  const clock = new Clock();
  const frame = clock.tick(1000);
  assert.equal(frame.delta, 0);
  assert.equal(frame.elapsed, 0);
  assert.equal(frame.frame, 1);
});

test('frame counter increases monotonically', () => {
  const clock = new Clock();
  clock.tick(0);
  assert.equal(clock.tick(16).frame, 2);
  assert.equal(clock.tick(32).frame, 3);
  assert.equal(clock.tick(48).frame, 4);
});

test('elapsed accumulates total simulated seconds', () => {
  const clock = new Clock({ maxDelta: 1 });
  clock.tick(0);
  clock.tick(100);
  clock.tick(250);
  assert.equal(clock.elapsed, 0.25);
});

test('large gaps are clamped to maxDelta', () => {
  const clock = new Clock({ maxDelta: 0.1 });
  clock.tick(0);
  const frame = clock.tick(60_000);
  assert.equal(frame.delta, 0.1);
  assert.equal(frame.elapsed, 0.1);
});

test('a backwards clock never yields a negative delta', () => {
  const clock = new Clock();
  clock.tick(1000);
  const frame = clock.tick(500);
  assert.equal(frame.delta, 0);
  assert.ok(frame.delta >= 0);
  assert.equal(frame.elapsed, 0);
});

test('elapsed never decreases after a backwards timestamp', () => {
  const clock = new Clock();
  clock.tick(1000);
  clock.tick(1500);
  const elapsed = clock.elapsed;
  clock.tick(100);
  assert.equal(clock.elapsed, elapsed);
});

test('reset clears frame and elapsed counters', () => {
  const clock = new Clock();
  clock.tick(0);
  clock.tick(500);
  clock.reset();
  assert.equal(clock.frame, 0);
  assert.equal(clock.elapsed, 0);
  assert.equal(clock.delta, 0);
});

test('reset accepts a new baseline timestamp', () => {
  const clock = new Clock();
  clock.reset(1000);
  const frame = clock.tick(1100);
  assert.equal(frame.delta, 0.1);
});

test('an injected time source drives the clock', () => {
  let t = 5000;
  const clock = new Clock({ maxDelta: 1, now: () => t });
  clock.tick();
  t = 5200;
  const frame = clock.tick();
  assert.equal(frame.delta, 0.2);
});

test('non-finite timestamps are rejected', () => {
  const clock = new Clock();
  assert.throws(() => clock.tick(Number.NaN), TypeError);
  assert.throws(() => clock.tick(Number.POSITIVE_INFINITY), TypeError);
});

test('an invalid maxDelta is rejected', () => {
  assert.throws(() => new Clock({ maxDelta: 0 }), TypeError);
  assert.throws(() => new Clock({ maxDelta: -1 }), TypeError);
  assert.throws(() => new Clock({ maxDelta: Number.NaN }), TypeError);
});

test('the same timestamps produce the same sequence', () => {
  const a = new Clock();
  const b = new Clock();
  const stamps = [0, 16, 32, 48, 64];
  const seqA = stamps.map((s) => a.tick(s));
  const seqB = stamps.map((s) => b.tick(s));
  assert.deepEqual(seqA, seqB);
});
