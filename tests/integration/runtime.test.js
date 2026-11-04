// tests/integration/runtime.test.js
//
// Integration checks for the wiring between the engine, the audio influence
// mapper, the glyph queue and the renderer. These assert that the pieces
// actually cooperate - the unit suites prove each part in isolation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../../src/core/Engine.js';
import { mapAudioToInfluence } from '../../src/audio/AudioMap.js';
import { GlyphQueue } from '../../src/glyphs/GlyphQueue.js';

/**
 * A renderer double that records the meshes it is given.
 *
 * @returns {object} Mock renderer.
 */
function mockRenderer() {
  const meshes = [];
  return {
    meshes,
    addGlyphMesh(from, to) {
      const mesh = {
        from,
        to,
        material: {
          uniforms: {
            uMorph: { value: 0 },
            uOpacity: { value: 0 },
            uEmotion: { value: 0 },
          },
        },
      };
      meshes.push(mesh);
      return mesh;
    },
    removeGlyphMesh(mesh) {
      const i = meshes.indexOf(mesh);
      if (i >= 0) meshes.splice(i, 1);
    },
  };
}

const square = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

test('the engine drives a continuous morph across its lifetime', () => {
  const engine = new Engine();
  engine.start(0);
  engine.setMorphTarget(1);

  const samples = [];
  for (let i = 1; i <= 40; i++) {
    engine.tick(i * 16);
    samples.push(engine.getState().morphProgress);
  }

  assert.ok(samples[0] > 0, 'morph should advance on the first tick');
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1], 'morph must never go backwards');
    assert.ok(
      samples[i] - samples[i - 1] <= 0.2 + 1e-9,
      'morph step exceeded the continuity cap'
    );
  }
  engine.dispose();
});

test('a tab-suspend gap does not teleport the engine morph', () => {
  const engine = new Engine();
  engine.start(0);
  engine.tick(0);
  const before = engine.getState().morphProgress;
  engine.tick(5 * 60 * 1000); // five minutes
  const after = engine.getState().morphProgress;
  assert.ok(
    Math.abs(after - before) <= 0.2 + 1e-9,
    `morph jumped by ${Math.abs(after - before)} across a suspend`
  );
  engine.dispose();
});

test('silence entered through the engine slows the morph', () => {
  const loud = new Engine();
  loud.start(0);
  loud.setMorphTarget(1);
  loud.tick(0);
  loud.updateSilence(0.016, false);
  for (let i = 1; i <= 20; i++) loud.tick(i * 16);
  const loudProgress = loud.getState().morphProgress;

  const silent = new Engine();
  silent.start(0);
  silent.setMorphTarget(1);
  silent.tick(0);
  silent.updateSilence(0.016, false);
  for (let i = 1; i <= 20; i++) {
    silent.updateSilence(0.016, true);
    silent.tick(i * 16);
  }
  const silentProgress = silent.getState().morphProgress;

  assert.ok(
    silentProgress < loudProgress,
    `silence must slow the morph: silent=${silentProgress} loud=${loudProgress}`
  );
  assert.ok(silentProgress > 0, 'silence must not stop the morph entirely');
  loud.dispose();
  silent.dispose();
});

test('audio influence is finite and biases motion', () => {
  const engine = new Engine();
  engine.start(0);
  engine.setMorphTarget(1);

  const influence = mapAudioToInfluence(
    { amp: 0.8, low: 0.4, mid: 0.6, high: 0.5, centroid: 1500, flux: 0.4, rms: 0.6 },
    { elapsed: 1 },
  );

  for (const [key, value] of Object.entries(influence)) {
    assert.ok(Number.isFinite(value), `influence.${key} is not finite`);
  }
  assert.ok(influence.morphVelocity > 0, 'influence must allow motion');
  assert.ok(influence.resistance >= 0 && influence.resistance <= 1);
  engine.dispose();
});

test('the glyph queue keeps two symbols overlapping for the whole utterance', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);

  // The ritual opens with an overlapping pair.
  queue.addGlyph(square, 'anchor', 0, { fadeTime: 5 });
  queue.addGlyph(square, 'flow', 0, { fadeTime: 5 });
  assert.ok(queue.satisfiesMinimumOverlap());

  // Over a normal utterance the overlap must hold as glyphs arrive and fade.
  let time = 0;
  for (let i = 0; i < 60; i++) {
    time += 0.1;
    queue.update(0.1, time, { amp: 0.1 }, 0, {});
    if (i % 10 === 0) {
      queue.addGlyph(square, 'flow', time, { fadeTime: 5 });
    }
    assert.ok(
      queue.satisfiesMinimumOverlap(),
      `overlap dropped below the protocol minimum at t=${time.toFixed(1)}`
    );
  }
});

test('a glyph mesh receives its own morph and opacity', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);
  const glyph = queue.addGlyph(square, 'flow', 0, { fadeTime: 4 });

  let time = 0;
  for (let i = 0; i < 8; i++) {
    time += 0.25;
    queue.update(0.25, time, { amp: 0 }, 0, { emotionBias: 0.4 });
  }

  assert.ok(glyph.mesh, 'glyph should own a mesh');
  assert.ok(glyph.mesh.material.uniforms.uMorph.value > 0, 'mesh morph should advance');
  assert.equal(glyph.mesh.material.uniforms.uEmotion.value, 0.4);
});
