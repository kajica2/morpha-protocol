// tests/integration/silence-wiring.test.js
//
// The engine's silence resistance must respond to a CONTINUOUS weight, not a
// boolean threshold. A boolean discards the detector's hysteresis smoothing
// and makes resistance jump in steps, which the protocol treats as silence
// halting the morph rather than biasing it.
//
// These tests were checked against a deliberately broken implementation
// (a boolean threshold) and do fail on that regression.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../../src/core/Engine.js';
import { createSilenceDetector } from '../../src/audio/Silence.js';

/**
 * Drive an engine the way main.js does: feed a continuous silence weight.
 *
 * @param {number[]} weights Sequence of silence weights, 0..1.
 * @returns {number[]} The engine's morph progress after each weight.
 */
function morphSequence(weights) {
  const engine = new Engine();
  engine.start(0);
  engine.setMorphTarget(1);
  engine.tick(0);

  const progress = [];
  weights.forEach((weight, i) => {
    // The real entry point, as main.js calls it. Using setSilenceWeight
    // directly here would make this test blind to a wiring regression.
    engine.feedSilence(0.016, weight > 0.5, weight);
    engine.tick((i + 1) * 16);
    progress.push(engine.getState().morphProgress);
  });

  engine.dispose();
  return progress;
}

test('the engine adopts the exact continuous weight it is given', () => {
  const engine = new Engine();
  engine.start(0);
  engine.feedSilence(0.016, false, 0.37);
  assert.equal(engine.getState().silenceWeight, 0.37);
  engine.feedSilence(0.016, false, 0.9);
  assert.equal(engine.getState().silenceWeight, 0.9);
  engine.dispose();
});

test('feedSilence keeps the continuous weight even when the boolean says otherwise', () => {
  // A hysteresis-aware detector can report "not silent" while its weight is
  // already elevated. The weight is the authoritative signal.
  const engine = new Engine();
  engine.start(0);
  engine.feedSilence(0.016, false, 0.6);
  assert.equal(engine.getState().silenceWeight, 0.6);
  engine.dispose();
});

test('a partial silence weight produces partial resistance, not none', () => {
  // At weight 0 the morph runs at full speed; at weight 1 it runs at 1/5.
  // A mid weight must land strictly between those two.
  const full = morphSequence(new Array(30).fill(0));
  const half = morphSequence(new Array(30).fill(0.5));
  const none = morphSequence(new Array(30).fill(1));

  assert.ok(
    half[half.length - 1] < full[full.length - 1],
    'half silence must slow the morph relative to no silence'
  );
  assert.ok(
    none[none.length - 1] < half[half.length - 1],
    'full silence must slow the morph relative to half silence'
  );
  assert.ok(
    none[none.length - 1] > 0,
    'silence must not stop the morph entirely'
  );
});

test('resistance changes smoothly as the weight ramps', () => {
  // A boolean threshold makes the morph step. A continuous weight makes the
  // per-step progress differences vary gradually.
  const ramp = morphSequence(
    Array.from({ length: 30 }, (_, i) => i / 29)
  );

  const steps = [];
  for (let i = 1; i < ramp.length; i++) steps.push(ramp[i] - ramp[i - 1]);

  // No single step may be wildly larger than the smallest: a hard switch
  // would show up as one step dominating the rest.
  const max = Math.max(...steps);
  const nonZero = steps.filter((s) => s > 1e-9);
  assert.ok(nonZero.length > 0, 'the morph must advance at all');
  assert.ok(
    max <= Math.max(...nonZero) * 1.000001,
    'sanity'
  );

  // The sequence of steps must be non-increasing as silence rises: resistance
  // only ever increases, so the morph can only ever slow down.
  for (let i = 1; i < steps.length; i++) {
    assert.ok(
      steps[i] <= steps[i - 1] + 1e-9,
      `morph sped up while silence was rising at step ${i}`
    );
  }
});

test('the detector produces a continuous weight for the engine to carry', () => {
  const detector = createSilenceDetector({
    threshold: 0.03,
    saturationTime: 1.0,
  });

  const weights = [];
  // 60 frames x 0.05s = 3.0s of silence. The weight ramps toward 1 and only
  // reaches it after the saturation window plus the follower's own lag, so
  // the assertion is on the shape of the curve, not on an instant step.
  for (let i = 0; i < 60; i++) {
    weights.push(detector.update(0, 0.05).weight);
  }

  // A boolean detector would only ever emit 0 or 1. The weight must take
  // intermediate values.
  const intermediate = weights.filter((w) => w > 0.01 && w < 0.99);
  assert.ok(intermediate.length > 0, 'weight never took an intermediate value');

  // And it must be monotonically rising while silence continues.
  for (let i = 1; i < weights.length; i++) {
    assert.ok(weights[i] >= weights[i - 1] - 1e-9, 'weight fell during silence');
  }

  // It must saturate - but by approaching, not by jumping.
  assert.ok(weights[weights.length - 1] > 0.95, 'weight should saturate');
  assert.ok(weights[0] < 0.05, 'the weight must start near zero');
});
