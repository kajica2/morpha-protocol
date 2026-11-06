// Per-glyph structural influence.
//
// These tests are written from protocol/MORPHA.md, not from the implementation:
//   section 3.2 - motion parameters: velocity, resistance, oscillation, decay.
//                 Motion MUST be continuous.
//   section 3.3 - Energy MUST bias motion, not directly map to appearance.
//   section 3.4 - Absence alters temporal flow, modifies dominance, increases
//                 persistence. Absence MUST NOT be treated as zero.
//   section 4   - families have distinct behavioural signatures.
//
// The negative-control note at the bottom records that the integration test
// was observed failing against the un-influenced implementation.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAMILY_PROFILES,
  NEUTRAL_PROFILE,
  getFamilyProfile,
  isKnownFamily,
} from '../../src/glyphs/Family.js';
import {
  resolveMotionProfile,
  applyInfluenceToGlyph,
  influenceGlyph,
  resolveDistortion,
} from '../../src/glyphs/Influence.js';
import { Glyph } from '../../src/glyphs/Glyph.js';
import { GlyphQueue } from '../../src/glyphs/GlyphQueue.js';

/**
 * A minimal renderer double. The queue writes uMorph, uOpacity and uEmotion to
 * each mesh's material uniforms, so the mock must provide them.
 *
 * @returns {object} A mesh-shaped object.
 */
function mockMesh() {
  return {
    material: {
      uniforms: {
        uMorph: { value: 0 },
        uOpacity: { value: 0 },
        uEmotion: { value: 0 },
      },
    },
  };
}

/**
 * A renderer double that tracks the meshes it hands out and disposes of.
 *
 * @returns {object} Mock renderer.
 */
function mockRenderer() {
  const meshes = [];
  return {
    meshes,
    addGlyphMesh() {
      const mesh = mockMesh();
      meshes.push(mesh);
      return mesh;
    },
    removeGlyphMesh(mesh) {
      const i = meshes.indexOf(mesh);
      if (i >= 0) meshes.splice(i, 1);
    },
  };
}

// ---------------------------------------------------------------- families

test('every protocol family has a distinct motion profile', () => {
  const families = ['anchor', 'flow', 'fracture', 'void', 'echo'];
  for (const family of families) {
    assert.ok(isKnownFamily(family), `${family} should be a known family`);
    assert.ok(getFamilyProfile(family), `${family} should have a profile`);
  }
  assert.equal(Object.keys(FAMILY_PROFILES).length, 5);
});

test('Anchor resists more than Flow and moves slower', () => {
  // protocol section 4: Anchor - "high resistance, low velocity".
  //                       Flow   - "low resistance, directional continuity".
  const anchor = getFamilyProfile('anchor');
  const flow = getFamilyProfile('flow');
  assert.ok(anchor.resistance > flow.resistance, 'Anchor must resist more');
  assert.ok(anchor.velocity < flow.velocity, 'Anchor must move slower');
});

test('Void persists longer than Flow', () => {
  // protocol section 4: Void - "minimal mass, long decay".
  const voidProfile = getFamilyProfile('void');
  const flow = getFamilyProfile('flow');
  assert.ok(
    voidProfile.persistence > flow.persistence,
    'Void must hold longer than Flow'
  );
  // The decay multiplier DELAYS the decay (protocol section 7: "delayed
  // decay"), so a higher value means the symbol lingers longer.
  assert.ok(
    voidProfile.decay > flow.decay,
    'Void must linger longer than Flow'
  );
});

test('Echo persists longer than Fracture', () => {
  // protocol section 4: Echo - "delayed repetition, persistence".
  const echo = getFamilyProfile('echo');
  const fracture = getFamilyProfile('fracture');
  assert.ok(echo.persistence > fracture.persistence);
});

test('Fracture and Echo carry asymmetric resistance; the others do not', () => {
  // protocol section 4: Fracture - "asymmetric resistance, instability".
  assert.ok(getFamilyProfile('fracture').asymmetry > 0);
  assert.ok(getFamilyProfile('echo').asymmetry > 0);
  assert.equal(getFamilyProfile('anchor').asymmetry, 0);
  assert.equal(getFamilyProfile('flow').asymmetry, 0);
  assert.equal(getFamilyProfile('void').asymmetry, 0);
});

test('an unknown family degrades to the neutral profile instead of throwing', () => {
  assert.equal(getFamilyProfile('nonexistent'), NEUTRAL_PROFILE);
  assert.equal(getFamilyProfile(undefined), NEUTRAL_PROFILE);
  assert.equal(getFamilyProfile(42), NEUTRAL_PROFILE);
  assert.equal(isKnownFamily('nonexistent'), false);
});

test('family profiles are frozen so a caller cannot mutate the protocol', () => {
  assert.throws(() => {
    FAMILY_PROFILES.anchor.resistance = 0;
  }, TypeError);
  assert.throws(() => {
    NEUTRAL_PROFILE.velocity = 99;
  }, TypeError);
});

// ------------------------------------------------------- motion resolution

test('the influence raises resistance and lowers velocity', () => {
  const base = resolveMotionProfile('flow', {}, {}, 0);
  const resistant = resolveMotionProfile(
    'flow',
    {},
    { resistance: 1, morphVelocity: 1 },
    0,
  );
  assert.ok(resistant.resistance > base.resistance, 'resistance must rise');
  assert.ok(resistant.velocity < base.velocity, 'velocity must fall');
});

test('resistance slows the morph but never halts or reverses it', () => {
  const free = resolveMotionProfile('anchor', {}, { resistance: 0, morphVelocity: 1 }, 0);
  const locked = resolveMotionProfile('anchor', {}, { resistance: 1, morphVelocity: 1 }, 0);
  assert.ok(locked.velocity > 0, 'even maximal resistance leaves motion');
  assert.ok(locked.velocity < free.velocity);
});

test('silence increases persistence - absence is not zero', () => {
  // protocol section 3.4: absence "increases persistence".
  const silent = resolveMotionProfile(
    'void',
    { silenceAffinity: 1 },
    {},
    1,
  );
  const sounding = resolveMotionProfile(
    'void',
    { silenceAffinity: 1 },
    {},
    0,
  );
  assert.ok(
    silent.persistence > sounding.persistence,
    'silence must increase persistence'
  );
  assert.ok(silent.persistence > 0, 'absence must never read as zero');
});

test('silence never stops the morph', () => {
  const silent = resolveMotionProfile('flow', {}, {}, 1);
  assert.ok(silent.velocity > 0, 'silence must leave motion possible');
});

test('a glyph own semantic weight composes with its family baseline', () => {
  const light = resolveMotionProfile('anchor', { resistance: 0 }, {}, 0);
  const heavy = resolveMotionProfile('anchor', { resistance: 1 }, {}, 0);
  assert.ok(heavy.resistance > light.resistance);
  assert.ok(heavy.velocity < light.velocity);
});

test('the influence scales persistence and decay', () => {
  const base = resolveMotionProfile('flow', {}, {}, 0);
  const persistent = resolveMotionProfile('flow', {}, { persistence: 2 }, 0);
  const decaying = resolveMotionProfile('flow', {}, { decay: 2 }, 0);
  assert.ok(persistent.persistence > base.persistence);
  assert.ok(decaying.decay > base.decay);
});

test('asymmetric resistance makes the morph rate depend on direction', () => {
  const forward = resolveMotionProfile('fracture', {}, { direction: 1 }, 0);
  const backward = resolveMotionProfile('fracture', {}, { direction: -1 }, 0);
  assert.notEqual(forward.velocity, backward.velocity);

  // A family with no asymmetry is direction-independent.
  const flowForward = resolveMotionProfile('flow', {}, { direction: 1 }, 0);
  const flowBackward = resolveMotionProfile('flow', {}, { direction: -1 }, 0);
  assert.equal(flowForward.velocity, flowBackward.velocity);
});

test('malformed influence input does not produce NaN', () => {
  const profile = resolveMotionProfile(
    'flow',
    { resistance: 'x' },
    { morphVelocity: NaN, resistance: Infinity, persistence: undefined },
    NaN,
  );
  for (const [key, value] of Object.entries(profile)) {
    assert.ok(Number.isFinite(value), `${key} must be finite, got ${value}`);
  }
});

// ------------------------------------------------- motion, not appearance

test('applying influence changes motion state and nothing else', () => {
  // protocol section 3.3: energy biases motion, not appearance.
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'flow',
    0,
    { resistance: 0.4, fadeTime: 5 },
  );

  const before = {
    currentOpacity: glyph.currentOpacity,
    morphProgress: glyph.morphProgress,
  };

  applyInfluenceToGlyph(
    glyph,
    resolveMotionProfile('flow', glyph.semanticWeight, { resistance: 1 }, 0),
    { resistance: 1 },
  );

  // Motion changed.
  assert.ok(glyph.motionProfile, 'motion profile must be recorded');
  assert.ok(glyph.morphSpeed > 0, 'morph speed must be set');

  // Appearance did not.
  assert.equal(glyph.currentOpacity, before.currentOpacity);
  assert.equal(glyph.morphProgress, before.morphProgress);
});

test('the glyph update never changes opacity in response to influence alone', () => {
  // The fade is driven by elapsed time, not by sound.
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'flow',
    0,
    { fadeTime: 5 },
  );

  // Two glyphs, identical timing, wildly different influence.
  const quiet = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'flow',
    0,
    { fadeTime: 5 },
  );

  glyph.update(0.016, 0.1, {}, 0, {}, { resistance: 1, morphVelocity: 0.1 });
  quiet.update(0.016, 0.1, {}, 0, {}, { resistance: 0, morphVelocity: 3 });

  assert.equal(
    glyph.currentOpacity,
    quiet.currentOpacity,
    'opacity must not be influenced by sound'
  );
});

// ------------------------------------------------------- continuity rules

test('morph progress stays continuous under a large delta', () => {
  // protocol section 3.2: "Motion MUST be continuous. Instantaneous state
  // changes are forbidden."
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'flow',
    0,
    { fadeTime: 5 },
  );

  let previous = glyph.morphProgress;
  for (let i = 1; i <= 60; i++) {
    glyph.update(0.5, i * 0.5, {}, 0, {}, { resistance: 0.2, morphVelocity: 2 });
    assert.ok(
      glyph.morphProgress >= previous,
      'morph must never go backwards'
    );
    assert.ok(
      glyph.morphProgress - previous <= 0.2 + 1e-9,
      `morph jumped by ${glyph.morphProgress - previous}`
    );
    previous = glyph.morphProgress;
  }
});

test('a symbol still decays before it is removed', () => {
  // protocol section 6: "No symbol MAY be removed without decay."
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'flow',
    0,
    { fadeTime: 2 },
  );

  let sawPartialOpacity = false;
  for (let i = 1; i <= 400; i++) {
    glyph.update(0.05, i * 0.05, {}, 0, {}, {});
    if (glyph.currentOpacity > 0.01 && glyph.currentOpacity < 0.99) {
      sawPartialOpacity = true;
    }
    if (!glyph.isActive) break;
  }

  assert.ok(sawPartialOpacity, 'the glyph must visibly decay');
  assert.equal(glyph.isActive, false, 'the glyph must eventually deactivate');
});

test('silence extends the hold but does not prevent decay', () => {
  const sounding = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'void',
    0,
    { fadeTime: 2, silenceAffinity: 1 },
  );
  const silent = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'void',
    0,
    { fadeTime: 2, silenceAffinity: 1 },
  );

  for (let i = 1; i <= 100; i++) {
    sounding.update(0.05, i * 0.05, {}, 0, {}, {});
    silent.update(0.05, i * 0.05, {}, 1, {}, {});
  }

  assert.ok(
    silent.currentOpacity >= sounding.currentOpacity,
    'silence must extend the symbol life'
  );

  // But it must still decay eventually.
  for (let i = 101; i <= 800; i++) {
    silent.update(0.05, i * 0.05, {}, 1, {}, {});
  }
  assert.equal(silent.isActive, false, 'silence must not prevent decay');
});

// ---------------------------------------------------------- integration

test('two glyphs of different families respond differently to one influence', () => {
  // The influence must be PER GLYPH, weighted by family. If both glyphs
  // behaved identically, the influence would still only be global.
  const queue = new GlyphQueue(mockRenderer());
  const geometry = new Float32Array([0, 0, 1, 0, 1, 1]);

  const anchor = queue.addGlyph(geometry, 'anchor', 0, { resistance: 0.2, fadeTime: 6 });
  const flow = queue.addGlyph(geometry, 'flow', 0, { resistance: 0.2, fadeTime: 6 });

  const influence = { resistance: 0.3, morphVelocity: 1.4, persistence: 1, decay: 1 };

  let time = 0;
  for (let i = 0; i < 20; i++) {
    time += 0.1;
    queue.update(0.1, time, {}, 0, {}, influence);
  }

  assert.ok(
    flow.morphProgress > anchor.morphProgress,
    `Flow (${flow.morphProgress}) must morph faster than Anchor (${anchor.morphProgress})`
  );
  assert.ok(
    anchor.morphSpeed < flow.morphSpeed,
    'Anchor must move slower than Flow under the same influence'
  );
});

test('the glyphs decay at different rates because their families differ', () => {
  const queue = new GlyphQueue(mockRenderer());
  const geometry = new Float32Array([0, 0, 1, 0, 1, 1]);

  const voidGlyph = queue.addGlyph(geometry, 'void', 0, { fadeTime: 4 });
  const flowGlyph = queue.addGlyph(geometry, 'flow', 0, { fadeTime: 4 });

  let time = 0;
  for (let i = 0; i < 40; i++) {
    time += 0.1;
    queue.update(0.1, time, {}, 0, {}, {});
  }

  assert.ok(
    voidGlyph.currentOpacity > flowGlyph.currentOpacity,
    `Void (${voidGlyph.currentOpacity}) must outlive Flow (${flowGlyph.currentOpacity})`
  );
});

test('the queue reports when the field needs replenishment', () => {
  const queue = new GlyphQueue(mockRenderer());
  const geometry = new Float32Array([0, 0, 1, 0, 1, 1]);

  // An empty field needs glyphs.
  assert.equal(queue.needsReplenishment(), true);

  queue.addGlyph(geometry, 'anchor', 0, { fadeTime: 5 });
  assert.equal(queue.needsReplenishment(), true, 'one glyph is not enough');

  // Two symbols is the protocol minimum, but a glyph can be removed on any
  // update, so the field needs one symbol of headroom over the minimum.
  queue.addGlyph(geometry, 'flow', 0, { fadeTime: 5 });
  assert.equal(queue.needsReplenishment(), true, 'two symbols have no headroom');

  queue.addGlyph(geometry, 'void', 0, { fadeTime: 5 });
  assert.equal(queue.needsReplenishment(), false, 'three symbols have headroom');
});

test('the field holds the protocol overlap minimum when replenished on demand', () => {
  // protocol section 6: "At least two symbol instances MUST overlap at all
  // times". The queue holds the symbols; the runtime must add a new one
  // before the field can fall below two.
  const queue = new GlyphQueue(mockRenderer());
  const geometry = new Float32Array([0, 0, 1, 0, 1, 1]);
  const families = ['anchor', 'flow', 'fracture', 'void', 'echo'];

  // The ritual opens with overlapping symbols, as the runtime does.
  queue.addGlyph(geometry, 'anchor', 0, { fadeTime: 6 });
  queue.addGlyph(geometry, 'flow', 0, { fadeTime: 6 });
  queue.addGlyph(geometry, 'void', 0, { fadeTime: 6 });

  let time = 0;
  let next = 2;
  let i = 0;

  for (let step = 0; step < 1200; step++) {
    time += 0.05;

    // Replenish BEFORE the update, exactly as the runtime does, so a
    // replacement symbol is in place before a decaying one is removed.
    if (time >= next || queue.needsReplenishment()) {
      queue.addGlyph(geometry, families[i++ % families.length], time, { fadeTime: 6 });
      if (time >= next) next = time + (Math.random() * 3 + 2);
    }

    queue.update(0.05, time, {}, 0, {}, { resistance: 0.2, morphVelocity: 1.2 });

    assert.ok(
      queue.satisfiesMinimumOverlap(),
      `overlap dropped at t=${time.toFixed(2)}`
    );
  }
});

test('a LIVE influence change alters the glyph motion on the next update', () => {
  // The constructor sets an initial profile. What matters is that a change
  // in the live influence reaches the glyph on the NEXT update - otherwise
  // the influence would only be sampled once at birth and the glyph would
  // never respond to sound.
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'flow',
    0,
    { fadeTime: 6 },
  );

  glyph.update(0.016, 0.016, {}, 0, {}, { resistance: 0, morphVelocity: 1 });
  const fast = glyph.morphSpeed;

  glyph.update(0.016, 0.032, {}, 0, {}, { resistance: 1, morphVelocity: 0.2 });
  const slow = glyph.morphSpeed;

  assert.ok(
    slow < fast,
    `a resistant influence must slow the glyph: ${fast} -> ${slow}`
  );
});

test('a LIVE silence change alters the glyph persistence on the next update', () => {
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'void',
    0,
    { fadeTime: 6, silenceAffinity: 1 },
  );

  glyph.update(0.016, 0.016, {}, 0, {}, {});
  const sounding = glyph.holdMultiplier;

  glyph.update(0.016, 0.032, {}, 1, {}, {});
  const silent = glyph.holdMultiplier;

  assert.ok(
    silent > sounding,
    `silence must raise persistence live: ${sounding} -> ${silent}`
  );
});

test('the glyph tracks the influence, not a snapshot taken at birth', () => {
  // A glyph born under a quiet influence must speed up when sound arrives.
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'flow',
    0,
    { fadeTime: 6 },
  );

  glyph.update(0.016, 0.016, {}, 0, {}, { resistance: 1, morphVelocity: 0.1 });
  const quiet = glyph.morphSpeed;

  glyph.update(0.016, 0.032, {}, 0, {}, { resistance: 0, morphVelocity: 3 });
  const loud = glyph.morphSpeed;

  assert.ok(
    loud > quiet,
    `the glyph must respond to sound arriving later: ${quiet} -> ${loud}`
  );
});

test('influenceGlyph records the profile on the glyph', () => {
  const glyph = new Glyph(
    new Float32Array([0, 0, 1, 0, 1, 1]),
    'echo',
    0,
    {},
  );
  const profile = influenceGlyph(glyph, 'echo', {}, { persistence: 2 }, 0.5);
  assert.equal(glyph.motionProfile, profile);
  assert.ok(glyph.holdMultiplier > 0);
  assert.ok(glyph.decayMultiplier > 0);
});

// ------------------------------------------------------------- distortion
//
// The temporal memory's distortion bends a glyph's GEOMETRY. It never
// changes opacity, colour or emotion. These tests are written from the
// protocol rule rather than from the implementation.

test('the distortion is scaled by the family affinity', () => {
  const distortion = { x: 0.1, y: 0.05, amount: 0.8 };

  // Echo is "memory, reflection, longing" - the family the temporal memory
  // speaks to - so it bends the most.
  const echo = resolveDistortion('echo', {}, distortion);
  // Anchor is "presence, grounding, identity" - it holds its shape.
  const anchor = resolveDistortion('anchor', {}, distortion);

  assert.ok(
    Math.abs(echo.x) > Math.abs(anchor.x),
    `echo must bend more than anchor: ${echo.x} vs ${anchor.x}`
  );
  assert.ok(echo.amount > anchor.amount);
});

test('the distortion scales the magnitude, not just the offset', () => {
  const full = resolveDistortion('flow', {}, { x: 0.2, y: 0.2, amount: 1 });
  const half = resolveDistortion('flow', {}, { x: 0.1, y: 0.1, amount: 0.5 });

  assert.ok(full.amount > half.amount);
  assert.ok(Math.abs(full.x) > Math.abs(half.x));
});

test('a glyph own distortion affinity composes with its family', () => {
  const distortion = { x: 0.2, y: 0, amount: 1 };
  const plain = resolveDistortion('flow', {}, distortion);
  const sensitive = resolveDistortion('flow', { distortionAffinity: 1 }, distortion);

  assert.ok(
    sensitive.amount > plain.amount,
    'a more sensitive glyph must bend further'
  );
});

test('no distortion means no bend', () => {
  const none = resolveDistortion('echo', {}, {});
  assert.equal(none.x, 0);
  assert.equal(none.y, 0);
  assert.equal(none.amount, 0);
});

test('a malformed distortion degrades to no bend rather than NaN', () => {
  for (const bad of [null, undefined, { x: NaN, y: Infinity, amount: 'x' }]) {
    const result = resolveDistortion('echo', {}, bad);
    assert.ok(Number.isFinite(result.x), 'x must be finite');
    assert.ok(Number.isFinite(result.y), 'y must be finite');
    assert.ok(Number.isFinite(result.amount), 'amount must be finite');
  }
});

test('the distortion does not change how a glyph looks', () => {
  // The bend is geometric. Opacity and morph progress are appearance and
  // must be untouched by it.
  //
  // Two glyphs are compared at the SAME elapsed time, so the only
  // difference between them is the distortion. Comparing a glyph against
  // itself at two different times would confound the distortion with the
  // morph's own progress.
  const geometry = new Float32Array([0, 0, 1, 0, 1, 1]);
  const plain = new Glyph(geometry, 'echo', 0, { fadeTime: 6 });
  const bent = new Glyph(geometry, 'echo', 0, { fadeTime: 6 });

  plain.update(0.016, 0.5, {}, 0, {}, {});
  bent.update(0.016, 0.5, {}, 0, {}, {
    distortion: { x: 0.5, y: 0.5, amount: 1 },
  });

  assert.equal(bent.currentOpacity, plain.currentOpacity, 'opacity must not change');
  assert.equal(bent.morphProgress, plain.morphProgress, 'morph progress must not change');
  assert.equal(bent.morphSpeed, plain.morphSpeed, 'morph rate must not change');
  assert.ok(
    Math.abs(bent.distortion.x) > 0,
    'the glyph must actually bend'
  );
  assert.equal(plain.distortion.x, 0, 'the unbent glyph must not bend');
});
