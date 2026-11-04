import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blendInfluence,
  createInfluenceMapper,
  mapAudioToInfluence,
} from '../../src/audio/AudioMap.js';

const DT = 1 / 60;

/** A loud, spectrally rich frame. */
const LOUD = {
  amp: 0.8,
  low: 0.5,
  mid: 0.6,
  high: 0.4,
  centroid: 1200,
  flux: 0.2,
  rms: 0.7,
};

/** A silent frame: no energy at all. */
const SILENT = {
  amp: 0,
  low: 0,
  mid: 0,
  high: 0,
  centroid: 0,
  flux: 0,
  rms: 0,
};

const INFLUENCE_KEYS = [
  'morphVelocity',
  'resistance',
  'persistence',
  'direction',
  'phase',
  'decay',
  'emotionalTone',
];

/**
 * Asserts that every influence value is a finite number inside its range.
 * @param {object} influence
 */
function assertFiniteInfluence(influence) {
  assert.equal(typeof influence, 'object');
  for (const key of INFLUENCE_KEYS) {
    assert.equal(typeof influence[key], 'number', `${key} must be a number`);
    assert.ok(Number.isFinite(influence[key]), `${key} must be finite`);
  }
  assert.ok(influence.morphVelocity >= 0, 'morphVelocity must not be negative');
  assert.ok(influence.resistance >= 0 && influence.resistance <= 1);
  assert.ok(influence.persistence >= 0 && influence.persistence <= 1);
  assert.ok(influence.decay >= 0 && influence.decay <= 1);
  assert.ok(influence.direction >= -1 && influence.direction <= 1);
  assert.ok(influence.emotionalTone >= -1 && influence.emotionalTone <= 1);
}

test('the influence object exposes exactly the structural parameters', () => {
  const influence = mapAudioToInfluence(LOUD, { elapsed: DT });
  for (const key of INFLUENCE_KEYS) {
    assert.ok(key in influence, `${key} must be present`);
  }
  assertFiniteInfluence(influence);
});

test('influence stays finite for zero, maximum and malformed input', () => {
  const malformed = [
    undefined,
    null,
    0,
    'not an object',
    [],
    {},
    { amp: Number.NaN, centroid: Number.NaN, flux: Number.NaN, rms: Number.NaN },
    { amp: Infinity, centroid: -Infinity, flux: Infinity, rms: -Infinity },
    { amp: [], centroid: {}, flux: 'x', rms: true },
    { amp: 1e9, centroid: 1e9, flux: 1e9, rms: 1e9 },
    { amp: -1e9, centroid: -1e9, flux: -1e9, rms: -1e9 },
    { amp: 255, centroid: 24000, flux: 255, rms: 255 },
  ];

  for (const features of malformed) {
    const influence = mapAudioToInfluence(features, { elapsed: DT });
    assertFiniteInfluence(influence);
  }

  // Malformed options too.
  assertFiniteInfluence(mapAudioToInfluence(LOUD, { previous: 'nope', elapsed: Number.NaN }));
  assertFiniteInfluence(mapAudioToInfluence(LOUD, { previous: { centroid: Number.NaN } }));
});

test('the mapping is deterministic for the same input', () => {
  const a = mapAudioToInfluence(LOUD, { elapsed: DT });
  const b = mapAudioToInfluence(LOUD, { elapsed: DT });
  assert.deepEqual(a, b);
});

test('silence produces a distinct influence from loud sound', () => {
  const loud = mapAudioToInfluence({ ...LOUD, silenceWeight: 0 }, { elapsed: DT });
  const silence = mapAudioToInfluence({ ...SILENT, silenceWeight: 1 }, { elapsed: DT });

  assertFiniteInfluence(loud);
  assertFiniteInfluence(silence);

  assert.ok(silence.persistence > loud.persistence, 'silence must increase persistence');
  assert.ok(silence.resistance > loud.resistance, 'silence must increase resistance');
  assert.ok(silence.morphVelocity < loud.morphVelocity, 'silence must slow the morph');
  assert.ok(silence.morphVelocity > 0, 'silence must never hard-cut the morph to zero');
  assert.ok(silence.direction < 0, 'silence must pull the morph inward');
  assert.ok(silence.emotionalTone !== loud.emotionalTone, 'silence is not a neutral register');

  // The two states must not be the same object in disguise.
  for (const key of INFLUENCE_KEYS) {
    assert.notEqual(silence[key], loud[key], `${key} must differ between silence and sound`);
  }
});

test('silence blends in smoothly instead of switching instantly', () => {
  const weights = [0, 0.25, 0.5, 0.75, 1];
  const results = weights.map((w) => mapAudioToInfluence({ ...LOUD, silenceWeight: w }, { elapsed: DT }));

  const endpoints = mapAudioToInfluence({ ...LOUD, silenceWeight: 0 }, { elapsed: DT });
  const fullSilence = mapAudioToInfluence({ ...SILENT, silenceWeight: 1 }, { elapsed: DT });

  // Every intermediate value sits strictly between the two ends.
  for (const result of results) {
    assert.ok(result.persistence >= endpoints.persistence - 1e-9, 'persistence must not undershoot the loud end');
    assert.ok(result.persistence <= fullSilence.persistence + 1e-9, 'persistence must not overshoot the silent end');
  }

  // Persistence rises monotonically with the silence weight.
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i].persistence >= results[i - 1].persistence - 1e-12, `persistence dipped at weight ${weights[i]}`);
    assert.ok(results[i].morphVelocity <= results[i - 1].morphVelocity + 1e-12, `morph velocity rose at weight ${weights[i]}`);
    assert.ok(results[i].resistance >= results[i - 1].resistance - 1e-12, `resistance dipped at weight ${weights[i]}`);
  }

  // The blend is gradual: no step may move more than a third of the span.
  const span = Math.abs(fullSilence.persistence - endpoints.persistence);
  for (let i = 1; i < results.length; i++) {
    const step = Math.abs(results[i].persistence - results[i - 1].persistence);
    assert.ok(step <= span * 0.3 + 1e-9, `blend jumped at weight ${weights[i]}`);
  }
});

test('silence produces a slow inward phase drift instead of freezing', () => {
  const first = mapAudioToInfluence({ ...SILENT, silenceWeight: 1 }, { previous: { phase: 1 }, elapsed: 0.5 });
  const second = mapAudioToInfluence({ ...SILENT, silenceWeight: 1 }, { previous: { phase: 1 }, elapsed: 1.0 });

  assert.ok(first.phase < 1, 'the phase must drift inward during silence');
  assert.ok(second.phase < first.phase, 'the inward drift must continue');
  assert.ok(Math.abs(first.phase - 1) < 0.2, 'the drift must be slow');
});

test('direction is signed by the direction of spectral change', () => {
  const rising = mapAudioToInfluence({ ...LOUD, centroid: 2000 }, { previous: { centroid: 1000 } });
  const falling = mapAudioToInfluence({ ...LOUD, centroid: 1000 }, { previous: { centroid: 2000 } });

  assert.ok(rising.direction > 0, 'a rising centroid must push the morph positive');
  assert.ok(falling.direction < 0, 'a falling centroid must push the morph negative');
});

test('direction crosses zero continuously when the centroid reverses', () => {
  const mapper = createInfluenceMapper();
  const centroids = [400, 800, 1200, 1600, 2000, 1600, 1200, 800, 400];
  const directions = centroids.map((centroid) => {
    const influence = mapper.update({ ...LOUD, centroid }, DT);
    assertFiniteInfluence(influence);
    return influence.direction;
  });

  // The morph is pushed positive while the spectrum rises...
  assert.ok(directions[4] > 0.05, `expected a positive push, got ${directions[4]}`);
  // ...and negative once it falls again.
  assert.ok(directions[8] < 0, `expected a negative push, got ${directions[8]}`);

  // The sign change happens through zero rather than jumping across it.
  let smallest = Infinity;
  for (const value of directions) smallest = Math.min(smallest, Math.abs(value));
  assert.ok(smallest < 0.05, `expected a pass through zero, smallest magnitude was ${smallest}`);

  // And every frame-to-frame step stays small: the reversal is a morph, not a cut.
  for (let i = 1; i < directions.length; i++) {
    const step = Math.abs(directions[i] - directions[i - 1]);
    assert.ok(step < 0.2, `direction jumped by ${step} at frame ${i}`);
  }
});

test('a silent frame never produces a spurious direction', () => {
  const silence = mapAudioToInfluence({ ...SILENT, silenceWeight: 1 }, { previous: { centroid: 3000 } });
  assert.ok(Math.abs(silence.direction) <= 1);
  assert.ok(silence.direction < 0, 'silence keeps a gentle inward bias');
});

test('the stateful mapper accumulates phase across frames', () => {
  const mapper = createInfluenceMapper();
  let previous = mapper.update(LOUD, DT);
  const start = previous.phase;
  for (let i = 0; i < 30; i++) previous = mapper.update(LOUD, DT);

  assert.ok(previous.phase > start, 'the phase must advance with the sound');
  assert.ok(Math.abs(mapper.getState().phase - previous.phase) < 1e-12);

  mapper.reset();
  assert.ok(Number.isNaN(mapper.getState().centroid), 'reset clears the carried centroid');
});

test('blendInfluence interpolates without producing out-of-range values', () => {
  const a = mapAudioToInfluence(LOUD, { elapsed: DT });
  const b = mapAudioToInfluence({ ...SILENT, silenceWeight: 1 }, { elapsed: DT });
  const mid = blendInfluence(a, b, 0.5);

  assertFiniteInfluence(mid);
  assert.ok(Math.abs(mid.persistence - (a.persistence + b.persistence) / 2) < 1e-9);
  assert.ok(Math.abs(mid.direction - (a.direction + b.direction) / 2) < 1e-9);

  const edge = blendInfluence(a, b, 5);
  assertFiniteInfluence(edge);
});
