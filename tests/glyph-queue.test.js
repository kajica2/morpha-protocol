import test from 'node:test';
import assert from 'node:assert/strict';
import { GlyphQueue } from '../src/glyphs/GlyphQueue.js';

function mockRenderer() {
  const removed = [];
  return {
    removed,
    addGlyphMesh() {
      return { material: { uniforms: { uMorph: { value: 0 }, uOpacity: { value: 0 }, uEmotion: { value: 0 } } } };
    },
    removeGlyphMesh(mesh) { removed.push(mesh); },
  };
}

test('glyph queue creates meshes, bounds overlap and disposes retired glyphs', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);
  const geometry = new Float32Array([0, 0, 1, 1]);
  for (let i = 0; i < 5; i++) queue.addGlyph(geometry, 'flow', i, { fadeTime: 5 });

  // protocol section 6: "No symbol MAY be removed without decay". A visible
  // symbol is not cut away to respect the ceiling - the oldest is asked to
  // retire, completes its morph, and decays away.
  assert.equal(queue.getActiveGlyphs().length, 5, 'no glyph is cut away');
  assert.equal(renderer.removed.length, 0, 'no mesh is released before decay');
  assert.equal(queue.queue[0].isRetiring, true, 'the oldest glyph is retiring');

  // Once it has decayed, its mesh is released.
  let time = 0;
  for (let i = 0; i < 200; i++) {
    time += 0.25;
    queue.update(0.25, time, { amp: 0 }, 0, {});
  }
  assert.ok(renderer.removed.length >= 1, 'the decayed glyph released its mesh');

  queue.dispose();
  assert.equal(queue.queue.length, 0);
});

test('invalid coordinate buffers are rejected', () => {
  const queue = new GlyphQueue(mockRenderer());
  assert.throws(() => queue.addGlyph(new Float32Array([0, 1, 2]), 'flow', 0), TypeError);
});

test('expired glyphs release meshes', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);
  const glyph = queue.addGlyph(new Float32Array([0, 0, 1, 1]), 'echo', 0, { fadeTime: 2 });
  queue.update(0.5, 0.5, { amp: 0 }, 1, { emotionBias: 0.25 });
  assert.equal(glyph.mesh.material.uniforms.uEmotion.value, 0.25);

  // A glyph holds full opacity while it morphs, then decays over fadeTime.
  // Step the clock in consistent frames until the decay has run its course.
  let time = 0.5;
  for (let i = 0; i < 40; i++) {
    time += 0.25;
    queue.update(0.25, time, { amp: 0 }, 1, {});
  }
  assert.equal(queue.queue.length, 0);
  assert.equal(renderer.removed.length, 1);
});
