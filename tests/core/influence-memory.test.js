import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DEFAULT_MEMORY_CONFIG,
  InfluenceMemory,
  MIN_MORPH_VELOCITY,
  NEUTRAL_INFLUENCE,
  createInfluenceMemory,
} from '../../src/core/InfluenceMemory.js';

const DT = 1 / 60;

/** A loud, energetic frame — a transient hit. */
const LOUD = {
  morphVelocity: 0.9,
  resistance: 0.2,
  persistence: 0.35,
  direction: 0.8,
  phase: 0.4,
  decay: 0.7,
  emotionalTone: 0.5,
};

/** A silent frame: no energy, the field is resting. */
const SILENT = {
  morphVelocity: 0.02,
  resistance: 0.85,
  persistence: 0.9,
  direction: 0,
  phase: 0,
  decay: 0,
  emotionalTone: 0,
};

/** A frame carrying the strongest possible influence. */
const MAXIMUM = {
  morphVelocity: 4,
  resistance: 0,
  persistence: 0,
  direction: 1,
  phase: 0,
  decay: 1,
  emotionalTone: 1,
};

/** Drive a memory for a fixed number of frames with one influence. */
function run(memory, influence, frames, dt = DT) {
  let result = null;
  for (let i = 0; i < frames; i += 1) result = memory.update(influence, dt);
  return result;
}

/** The magnitude of the signed distortion. */
function magnitude(distortion) {
  return Math.hypot(distortion.x, distortion.y);
}

test('the module is pure — no three.js, no DOM, no audio dependency', () => {
  const source = readFileSync(new URL('../../src/core/InfluenceMemory.js', import.meta.url), 'utf8');
  assert.ok(!source.includes("from 'three'"));
  assert.ok(!source.includes('document.'));
  assert.ok(!source.includes('window.'));
  assert.ok(!/from '\.\.\/(render|audio|glyphs)\//.test(source));
  assert.ok(!/^import\s/m.test(source), 'the module must have no imports at all');
});

test('the default configuration exposes both time constants independently', () => {
  const memory = new InfluenceMemory();
  assert.equal(memory.config.attack, DEFAULT_MEMORY_CONFIG.attack);
  assert.equal(memory.config.release, DEFAULT_MEMORY_CONFIG.release);
  assert.equal(memory.attack, DEFAULT_MEMORY_CONFIG.attack);
  assert.equal(memory.release, DEFAULT_MEMORY_CONFIG.release);

  // The two constants are genuinely separate knobs.
  const tuned = new InfluenceMemory({ attack: 0.2, release: 4 });
  assert.equal(tuned.attack, 0.2);
  assert.equal(tuned.release, 4);
  assert.equal(tuned.attack !== tuned.release, true);

  assert.equal(new InfluenceMemory({ attack: 0.5 }).release, DEFAULT_MEMORY_CONFIG.release);
  assert.equal(new InfluenceMemory({ release: 0.5 }).attack, DEFAULT_MEMORY_CONFIG.attack);
});

test('the memory starts at the neutral baseline', () => {
  const memory = new InfluenceMemory();
  const state = memory.getState();

  assert.equal(state.distortion.amount, 0);
  assert.equal(state.distortion.x, 0);
  assert.equal(state.distortion.y, 0);
  assert.equal(state.influence.morphVelocity, NEUTRAL_INFLUENCE.morphVelocity);
  assert.equal(state.influence.direction, 0);
  assert.equal(state.influence.resistance, 0);
  assert.equal(state.influence.persistence, 0);
});

test('a new event registers quickly — attack is fast', () => {
  const memory = new InfluenceMemory();
  // One attack time constant (0.08s) is enough to register most of the hit.
  const result = memory.update(LOUD, 0.08);

  const settled = run(new InfluenceMemory(), LOUD, 600).distortion.amount;
  assert.ok(
    Math.abs(result.distortion.amount) >= Math.abs(settled) * 0.5,
    `attack was too slow: ${result.distortion.amount} vs settled ${settled}`,
  );
  assert.ok(result.distortion.amount > 0, 'the hit must register a distortion');
});

test('an old event lingers — release is slow', () => {
  const memory = new InfluenceMemory();
  run(memory, LOUD, 600);
  const peak = memory.getState().distortion.amount;
  assert.ok(Math.abs(peak) > 0, 'the event must leave a trace to begin with');

  // A quarter of the release time constant must barely move the memory.
  const after = memory.update(SILENT, DEFAULT_MEMORY_CONFIG.release * 0.25).distortion.amount;
  const expected = peak * Math.exp(-0.25);

  assert.ok(
    Math.abs(after) > Math.abs(peak) * 0.7,
    `release was too fast: ${after} vs peak ${peak}`,
  );
  assert.ok(Math.abs(after) < Math.abs(peak), 'the memory must still be decaying');
  assert.ok(
    Math.abs(Math.abs(after) - Math.abs(expected)) < 1e-12,
    `release must decay exponentially: ${after} vs expected ${expected}`,
  );
});

test('attack and release are asymmetric in time', () => {
  // Attack: from the neutral baseline, one attack time constant registers
  // 1 - e^-1 of the eventual bend.
  const attacking = new InfluenceMemory();
  const afterAttack = attacking.update(LOUD, DEFAULT_MEMORY_CONFIG.attack).distortion.amount;
  const settled = run(new InfluenceMemory(), LOUD, 600).distortion.amount;
  assert.ok(
    Math.abs(Math.abs(afterAttack) - Math.abs(settled) * (1 - Math.exp(-1))) < 1e-12,
    `attack must be exponential: ${afterAttack}`,
  );

  // Release: after the event ends, one release time constant leaves
  // e^-1 of the bend. The same wall-clock time barely moves an attacker but
  // barely moves a releaser — the two constants are genuinely different.
  const releasing = new InfluenceMemory();
  run(releasing, LOUD, 600);
  const peak = releasing.getState().distortion.amount;
  const afterRelease = releasing.update(SILENT, DEFAULT_MEMORY_CONFIG.release).distortion.amount;

  assert.ok(
    Math.abs(Math.abs(afterRelease) - Math.abs(peak) * Math.exp(-1)) < 1e-12,
    `release must be exponential: ${afterRelease} vs peak ${peak}`,
  );
  assert.ok(
    DEFAULT_MEMORY_CONFIG.release > DEFAULT_MEMORY_CONFIG.attack * 10,
    'release must be far slower than attack',
  );
});

test('the distortion decays toward zero after the event ends', () => {
  const memory = new InfluenceMemory();
  run(memory, LOUD, 600);
  const peak = memory.getState().distortion.amount;
  assert.ok(Math.abs(peak) > 0, 'the event must leave a trace to begin with');

  const samples = [];
  for (let i = 0; i < 600; i += 1) {
    samples.push(Math.abs(memory.update(SILENT, DT).distortion.amount));
  }

  // Monotonically shrinking toward the baseline — never snapping or growing.
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(samples[i] <= samples[i - 1] + 1e-12, `distortion grew at frame ${i}`);
  }
  assert.ok(samples.at(-1) < Math.abs(peak) * 0.05, 'the memory must fade out');
  assert.ok(samples.at(-1) > 0, 'the decay must be gradual, never a hard cut');
});

test('the distortion is bounded under sustained maximum input', () => {
  const memory = new InfluenceMemory({ maxDistortion: 1, strength: 10 });

  for (let i = 0; i < 600; i += 1) {
    const { distortion } = memory.update(MAXIMUM, DT);
    assert.ok(
      distortion.amount >= -1 && distortion.amount <= 1,
      `amount escaped its range: ${distortion.amount}`,
    );
    assert.ok(magnitude(distortion) <= 1 + 1e-12, `vector escaped its range: ${magnitude(distortion)}`);
  }

  const state = memory.getState();
  assert.equal(state.distortion.amount, 1, 'a sustained maximum input saturates the bound');
});

test('the morph velocity floor is never lowered', () => {
  const memory = new InfluenceMemory();

  for (let i = 0; i < 600; i += 1) {
    const { influence } = memory.update(SILENT, DT);
    assert.ok(
      influence.morphVelocity >= MIN_MORPH_VELOCITY,
      `morph velocity fell to ${influence.morphVelocity}`,
    );
    assert.ok(influence.morphVelocity > 0, 'the morph must never freeze dead');
  }

  // Even a malformed influence cannot push the floor down.
  const broken = memory.update({ morphVelocity: -5 }, DT);
  assert.ok(broken.influence.morphVelocity >= MIN_MORPH_VELOCITY);
  assert.equal(broken.influence.morphVelocity, MIN_MORPH_VELOCITY);
});

test('the result is frame-rate independent', () => {
  const half = new InfluenceMemory();
  const whole = new InfluenceMemory();

  half.update(LOUD, 0.05);
  half.update(LOUD, 0.05);
  whole.update(LOUD, 0.1);

  const a = half.getState();
  const b = whole.getState();
  assert.ok(Math.abs(a.distortion.amount - b.distortion.amount) < 1e-12);
  assert.ok(Math.abs(a.distortion.x - b.distortion.x) < 1e-12);
  assert.ok(Math.abs(a.distortion.y - b.distortion.y) < 1e-12);
  assert.ok(Math.abs(a.influence.morphVelocity - b.influence.morphVelocity) < 1e-12);
  assert.ok(Math.abs(a.influence.resistance - b.influence.resistance) < 1e-12);
  assert.ok(Math.abs(a.influence.direction - b.influence.direction) < 1e-12);

  // The same must hold on the decay side.
  const halfDecay = new InfluenceMemory();
  const wholeDecay = new InfluenceMemory();
  run(halfDecay, LOUD, 60);
  run(wholeDecay, LOUD, 60);
  halfDecay.update(SILENT, 0.05);
  halfDecay.update(SILENT, 0.05);
  wholeDecay.update(SILENT, 0.1);

  assert.ok(
    Math.abs(halfDecay.getState().distortion.amount - wholeDecay.getState().distortion.amount) < 1e-12,
  );
});

test('silence decays the memory gradually rather than snapping', () => {
  const memory = new InfluenceMemory();
  run(memory, LOUD, 600);
  const peak = memory.getState().distortion.amount;

  // A single silent frame must not erase the memory.
  const one = memory.update(SILENT, DT).distortion.amount;
  assert.ok(Math.abs(one) < Math.abs(peak), 'silence must reduce the memory');
  assert.ok(Math.abs(one) > Math.abs(peak) * 0.9, 'a single frame must not snap the memory to zero');

  // It must keep decaying over time rather than sticking at the loud value.
  const later = run(memory, SILENT, 300).distortion.amount;
  assert.ok(Math.abs(later) < Math.abs(one), 'the memory must keep decaying');
  assert.ok(Math.abs(later) < Math.abs(peak) * 0.1, 'the memory must not stick at the loud value');
});

test('reset clears the memory back to the neutral baseline', () => {
  const memory = new InfluenceMemory();
  run(memory, LOUD, 600);
  assert.ok(Math.abs(memory.getState().distortion.amount) > 0);

  memory.reset();
  const state = memory.getState();

  assert.equal(state.distortion.amount, 0);
  assert.equal(state.distortion.x, 0);
  assert.equal(state.distortion.y, 0);
  assert.equal(state.influence.morphVelocity, NEUTRAL_INFLUENCE.morphVelocity);
  assert.equal(state.influence.resistance, NEUTRAL_INFLUENCE.resistance);
  assert.equal(state.influence.persistence, NEUTRAL_INFLUENCE.persistence);
  assert.equal(state.influence.direction, NEUTRAL_INFLUENCE.direction);
  assert.equal(state.influence.decay, NEUTRAL_INFLUENCE.decay);
  assert.equal(state.influence.emotionalTone, NEUTRAL_INFLUENCE.emotionalTone);
});

test('the signed distortion follows the signed direction of the influence', () => {
  const positive = new InfluenceMemory();
  const negative = new InfluenceMemory();

  run(positive, { ...LOUD, direction: 0.9 }, 120);
  run(negative, { ...LOUD, direction: -0.9 }, 120);

  assert.ok(positive.getState().distortion.amount > 0, 'a positive push must bend positively');
  assert.ok(negative.getState().distortion.amount < 0, 'a negative push must bend negatively');
});

test('the memory outputs motion state only — never appearance', () => {
  const memory = new InfluenceMemory();
  const { influence, distortion } = memory.update(LOUD, DT);

  const influenceKeys = Object.keys(influence).sort();
  assert.deepEqual(influenceKeys, [
    'decay',
    'direction',
    'emotionalTone',
    'morphVelocity',
    'persistence',
    'phase',
    'resistance',
  ]);

  const distortionKeys = Object.keys(distortion).sort();
  assert.deepEqual(distortionKeys, ['amount', 'x', 'y']);

  for (const key of Object.keys(influence)) {
    assert.ok(!/color|colour|opacity|brightness|hue/i.test(key), `${key} is an appearance channel`);
  }
  for (const key of Object.keys(distortion)) {
    assert.ok(!/color|colour|opacity|brightness|hue/i.test(key), `${key} is an appearance channel`);
  }
});

test('every output stays finite and in range for malformed input', () => {
  const memory = new InfluenceMemory();
  const malformed = [
    undefined,
    null,
    0,
    'not an object',
    [],
    {},
    { morphVelocity: Number.NaN, direction: Number.NaN, decay: Number.NaN },
    { morphVelocity: Infinity, direction: -Infinity, decay: Infinity },
    { morphVelocity: -1e9, direction: -1e9, decay: -1e9 },
    { morphVelocity: 1e9, direction: 1e9, decay: 1e9 },
  ];

  for (const influence of malformed) {
    const result = memory.update(influence, DT);
    for (const key of Object.keys(result.influence)) {
      assert.ok(Number.isFinite(result.influence[key]), `${key} must be finite`);
    }
    assert.ok(Number.isFinite(result.distortion.amount));
    assert.ok(Number.isFinite(result.distortion.x));
    assert.ok(Number.isFinite(result.distortion.y));
    assert.ok(result.influence.morphVelocity >= MIN_MORPH_VELOCITY);
    assert.ok(result.influence.direction >= -1 && result.influence.direction <= 1);
  }
});

test('the memory is deterministic for identical inputs', () => {
  const build = () => new InfluenceMemory();
  const a = build();
  const b = build();

  for (let i = 0; i < 240; i += 1) {
    const influence = i < 120 ? LOUD : SILENT;
    a.update(influence, DT);
    b.update(influence, DT);
  }

  assert.deepEqual(a.getState(), b.getState());
});

test('an invalid configuration is rejected by name', () => {
  assert.throws(() => new InfluenceMemory({ attack: 0 }), /attack/);
  assert.throws(() => new InfluenceMemory({ release: -1 }), /release/);
  assert.throws(() => new InfluenceMemory({ strength: -0.5 }), /strength/);
  assert.throws(() => new InfluenceMemory({ maxDistortion: 0 }), /maxDistortion/);
  assert.throws(() => new InfluenceMemory('nope'), TypeError);
});

test('dispose releases the memory and rejects further use', () => {
  const memory = new InfluenceMemory();
  run(memory, LOUD, 60);
  memory.dispose();

  assert.equal(memory.getState().distortion.amount, 0);
  assert.throws(() => memory.update(LOUD, DT), /disposed/);
});

test('the factory builds an equivalent memory', () => {
  const memory = createInfluenceMemory({ attack: 0.2 });
  assert.ok(memory instanceof InfluenceMemory);
  assert.equal(memory.attack, 0.2);
});
