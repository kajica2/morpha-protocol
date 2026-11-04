import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSilenceDetector,
  getSilenceWeight,
  isSilent,
  updateSilence,
} from '../../src/audio/Silence.js';

const DT = 1 / 60;

test('silence weight rises smoothly and stays > 0 after sustained silence', () => {
  const detector = createSilenceDetector({ threshold: 0.03, saturationTime: 1.2, hysteresis: 0.01 });

  const weights = [];
  for (let i = 0; i < 180; i++) {
    const state = detector.update(0, DT);
    weights.push(state.weight);
  }

  assert.ok(weights[0] >= 0, 'weight starts at zero');
  assert.ok(weights[weights.length - 1] > 0.5, 'sustained silence produces a real weight');
  assert.ok(weights[weights.length - 1] <= 1, 'weight never exceeds 1');

  // Monotonically rising: silence must never make the weight jump backwards.
  for (let i = 1; i < weights.length; i++) {
    assert.ok(weights[i] >= weights[i - 1] - 1e-12, `weight dipped at frame ${i}`);
  }

  // Smooth: no single frame may move the weight by more than a small step.
  for (let i = 1; i < weights.length; i++) {
    assert.ok(weights[i] - weights[i - 1] < 0.1, `weight stepped hard at frame ${i}`);
  }
});

test('silence weight falls smoothly when sound returns and never hard-cuts to zero', () => {
  const detector = createSilenceDetector({ threshold: 0.03, saturationTime: 1.2, hysteresis: 0.01 });

  for (let i = 0; i < 120; i++) detector.update(0, DT);
  const loud = detector.update(0.8, DT);
  assert.ok(loud.weight > 0, 'the weight must not snap to zero on the first loud frame');
  assert.ok(loud.weight < 1);

  const after = [];
  for (let i = 0; i < 240; i++) after.push(detector.update(0.8, DT).weight);

  for (let i = 1; i < after.length; i++) {
    assert.ok(after[i] <= after[i - 1] + 1e-12, `weight rose while sound was playing at frame ${i}`);
    assert.ok(after[i - 1] - after[i] < 0.1, `weight dropped hard at frame ${i}`);
  }
  assert.ok(after[after.length - 1] < 0.01, 'the weight decays back towards zero');
});

test('hysteresis prevents chatter at a borderline amplitude', () => {
  const detector = createSilenceDetector({ threshold: 0.03, saturationTime: 1.2, hysteresis: 0.02 });

  // Start clearly below the threshold: the detector enters silence.
  assert.equal(detector.update(0.01, DT).isSilent, true);

  // Now dither right around the threshold. With hysteresis the state must
  // not flap back and forth.
  let transitions = 0;
  let previousState = detector.getIsSilent();
  for (let i = 0; i < 200; i++) {
    const amp = i % 2 === 0 ? 0.029 : 0.031;
    const state = detector.update(amp, DT);
    if (state.isSilent !== previousState) transitions += 1;
    previousState = state.isSilent;
  }
  assert.equal(transitions, 0, 'the silence state must not chatter at the threshold');
  assert.equal(detector.getIsSilent(), true);
});

test('a clearly audible signal leaves the silence state once the margin is exceeded', () => {
  const detector = createSilenceDetector({ threshold: 0.03, saturationTime: 1.2, hysteresis: 0.02 });

  detector.update(0.0, DT);
  assert.equal(detector.getIsSilent(), true);

  // Inside the hysteresis band: still silent.
  detector.update(0.045, DT);
  assert.equal(detector.getIsSilent(), true);

  // Beyond threshold + hysteresis: silence ends.
  const state = detector.update(0.08, DT);
  assert.equal(state.isSilent, false);
  assert.equal(state.duration, 0);
});

test('the detector reports duration and time since the last sound', () => {
  const detector = createSilenceDetector({ threshold: 0.03, saturationTime: 1.2, hysteresis: 0.01 });

  detector.update(0.5, DT);
  assert.equal(detector.getDuration(), 0);

  for (let i = 0; i < 60; i++) detector.update(0, DT);
  const state = detector.update(0, DT);
  assert.ok(state.duration > 0.9, 'silence duration accumulates in seconds');
  assert.ok(state.sinceLastSound > 0.9, 'time since the last sound accumulates in seconds');

  const loud = detector.update(0.5, DT);
  assert.equal(loud.sinceLastSound, 0, 'sound resets the time since the last sound');
});

test('the detector survives malformed input', () => {
  const detector = createSilenceDetector();
  const state = detector.update(Number.NaN, Number.NaN);
  assert.ok(Number.isFinite(state.weight));
  assert.ok(Number.isFinite(state.duration));
  assert.equal(state.isSilent, true);

  const negative = detector.update(-5, -1);
  assert.ok(Number.isFinite(negative.weight));
  assert.ok(negative.duration >= 0);
});

test('peek reports the silence state without advancing the timers', () => {
  const detector = createSilenceDetector({ threshold: 0.03, saturationTime: 1.2, hysteresis: 0.01 });
  assert.equal(detector.peek(0), true);
  assert.equal(detector.peek(0.5), false);
  assert.equal(detector.getDuration(), 0, 'peek must not advance the detector');
});

test('reset returns the detector to its initial state', () => {
  const detector = createSilenceDetector({ threshold: 0.03, saturationTime: 1.2, hysteresis: 0.01 });
  for (let i = 0; i < 60; i++) detector.update(0, DT);
  assert.ok(detector.getWeight() > 0);

  detector.reset();
  assert.equal(detector.getWeight(), 0);
  assert.equal(detector.getDuration(), 0);
  assert.equal(detector.getIsSilent(), false);
});

test('the module level API keeps its original signatures', () => {
  assert.equal(typeof updateSilence, 'function');
  assert.equal(typeof getSilenceWeight, 'function');
  assert.equal(typeof isSilent, 'function');

  // Without a microphone the analyser reports zero energy, which counts as
  // silence: the API must still behave and stay in range.
  const duration = updateSilence(DT);
  assert.ok(Number.isFinite(duration));
  assert.ok(duration >= 0 && duration <= 1.2);

  const weight = getSilenceWeight();
  assert.ok(Number.isFinite(weight));
  assert.ok(weight >= 0 && weight <= 1);

  assert.equal(typeof isSilent(), 'boolean');
});
