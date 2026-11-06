// The runtime's influence wiring.
//
// The pure mapping in src/audio/AudioMap.js is unit tested on its own. This
// file covers the WIRING - the chain that turns audio features into the
// influence the glyphs receive.
//
// Two bugs this file was written for:
//
// 1. The render loop passed `elapsed: globalTime` where the mapper expects
//    the FRAME DELTA. The mapper integrates the phase and smooths the
//    direction using that value, so passing the total elapsed time made the
//    phase run away (22.5 radians at 30 seconds, instead of the ~0.005 a
//    0.3 rad/s drift produces) and turned the direction filter into a
//    no-op, because its factor (1 - exp(-dt/tau)) saturated at 1.
//
// 2. The render loop passed the previous INFLUENCE back as `previous`, but
//    the mapper reads `previous.centroid` - and the influence object does
//    not carry one. The signed spectral change was therefore always zero,
//    and Fracture's and Echo's directional asymmetry could never activate.
//
// Both are now fixed structurally: the chain reads the delta from the
// engine's frame, so the total elapsed time cannot reach it by mistake.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInfluenceChain } from '../../src/audio/FrameInfluence.js';
import { createInfluenceMapper, mapAudioToInfluence } from '../../src/audio/AudioMap.js';
import { GlyphQueue } from '../../src/glyphs/GlyphQueue.js';

const FEATURES = {
  amp: 0.5, low: 0.2, mid: 0.4, high: 0.3, centroid: 900, flux: 0.1, rms: 0.3,
};

test('the phase accumulates at the rate the drift implies', () => {
  const chain = createInfluenceChain();
  let phase = 0;

  for (let i = 0; i < 60; i += 1) {
    // The engine's frame carries both the elapsed time and the delta.
    phase = chain.updateFrame({ delta: 1 / 60, elapsed: i / 60 }, FEATURES).phase;
  }

  // The drift rate is PHASE_BASE + PHASE_ENERGY * amp + PHASE_FLUX * flux
  // = 0.3 + 0.8*0.5 + 0.5*0.1 = 0.75 rad/s, so one second is ~0.75 rad.
  assert.ok(
    phase > 0.5 && phase < 1.0,
    `one second of phase drift should be around 0.75 rad, got ${phase}`,
  );
});

test('the chain ignores the total elapsed time on the frame', () => {
  // The regression. The frame carries `elapsed` as well as `delta`; the
  // chain must use only the delta.
  const chain = createInfluenceChain();
  let phase = 0;

  for (let i = 1; i <= 60; i += 1) {
    // `elapsed` grows without bound, exactly as the render loop's clock did.
    phase = chain.updateFrame({ delta: 1 / 60, elapsed: i }, FEATURES).phase;
  }

  assert.ok(
    phase < 5,
    `the phase must not run away; got ${phase} after one second of frames`,
  );
});

test('the phase grows proportionally to elapsed time, not to its square', () => {
  const run = (frameFor) => {
    const chain = createInfluenceChain();
    let phase = 0;
    for (let i = 1; i <= 60; i += 1) phase = chain.updateFrame(frameFor(i), FEATURES).phase;
    return phase;
  };

  const correct = run(i => ({ delta: 1 / 60, elapsed: i / 60 }));
  const wrong = run(i => ({ delta: i / 60, elapsed: i / 60 }));

  assert.ok(correct > 0.5 && correct < 1.0, `correct usage: ${correct}`);
  assert.ok(
    wrong > correct * 5,
    `the wrong usage must be far larger, got ${wrong} vs ${correct}`,
  );
});

test('the direction is non-zero once the centroid moves', () => {
  const chain = createInfluenceChain();

  chain.updateFrame({ delta: 1 / 60 }, { amp: 0.5, centroid: 300, flux: 0.1 });
  const after = chain.updateFrame(
    { delta: 1 / 60 },
    { amp: 0.5, centroid: 3000, flux: 0.1 },
  );

  assert.ok(
    Math.abs(after.direction) > 0,
    'a large spectral jump must produce a non-zero direction',
  );
});

test('the direction filter smooths rather than snapping', () => {
  const chain = createInfluenceChain();

  chain.updateFrame({ delta: 1 / 60 }, { amp: 0.5, centroid: 300, flux: 0.1 });
  const after = chain.updateFrame(
    { delta: 1 / 60 },
    { amp: 0.5, centroid: 3000, flux: 0.1 },
  );

  const target = Math.tanh((3000 - 300) / 1200);
  assert.ok(
    Math.abs(after.direction) < Math.abs(target),
    'the direction must be smoothed, not snapped to the target',
  );
});

test('the direction does not depend on the frame rate', () => {
  const drive = (frames, delta) => {
    const chain = createInfluenceChain();
    for (let i = 0; i < frames; i += 1) {
      chain.updateFrame({ delta }, { amp: 0.5, centroid: 300 + i * 20, flux: 0.1 });
    }
    return chain.updateFrame(
      { delta },
      { amp: 0.5, centroid: 300 + frames * 20, flux: 0.1 },
    ).direction;
  };

  const slow = drive(30, 1 / 30);
  const fast = drive(120, 1 /120);

  assert.ok(
    Math.abs(slow - fast) < 0.05,
    `the direction must not depend on the frame rate: ${slow} vs ${fast}`,
  );
});

test('the influence reaches the glyphs through the queue', () => {
  const mesh = () => ({
    material: {
      uniforms: {
        uMorph: { value: 0 },
        uOpacity: { value: 1 },
        uEmotion: { value: 0 },
        uDistortion: { value: { set: () => {} } },
      },
    },
  });
  const renderer = { addGlyphMesh: mesh, removeGlyphMesh: () => {} };

  const queue = new GlyphQueue(renderer);
  queue.addGlyph(new Float32Array([0, 0, 1, 0, 1, 1]), 'echo', 0, { fadeTime: 6 });

  const chain = createInfluenceChain();
  const influence = chain.updateFrame({ delta: 1 / 60 }, {
    amp: 0.5, centroid: 300, flux: 0.1,
  });

  queue.update(1 / 60, 0.5, { amp: 0.4 }, 0, {}, influence);

  const glyph = queue.queue[0];
  assert.ok(glyph.motionProfile.velocity > 0, 'the influence must reach the glyph motion');

  // The distortion is a SIGNED quantity - a bend in one direction or the
  // other - so it is checked for finiteness and magnitude, not sign.
  assert.ok(
    Number.isFinite(glyph.distortion.amount),
    'the distortion must reach the glyph as a finite number',
  );
  assert.ok(
    Math.abs(glyph.distortion.amount) > 0,
    'the distortion must be non-zero when the sound is',
  );
});

test('the mapper alone still honours its own contract', () => {
  const withCentroid = mapAudioToInfluence(
    { amp: 0.5, centroid: 3000, flux: 0.1 },
    { previous: { centroid: 300 }, elapsed: 1 / 60 },
  );
  assert.ok(Math.abs(withCentroid.direction) > 0);

  const mapper = createInfluenceMapper();
  mapper.update({ amp: 0.5, centroid: 300, flux: 0.1 }, 1 / 60);
  mapper.update({ amp: 0.5, centroid: 3000, flux: 0.1 }, 1 / 60);
  assert.equal(mapper.getState().centroid, 3000);
});
