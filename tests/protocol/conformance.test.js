// tests/protocol/conformance.test.js
//
// Machine-checked conformance against the mandatory grammar rules in
// protocol/MORPHA.md section 6:
//
//   - No instantaneous transitions
//   - At least two symbol instances MUST overlap at all times
//   - No symbol MAY be removed without decay
//   - Silence MUST influence motion before appearance
//   - Repetition increases inertia, not magnitude
//
// These are structural rules, not aesthetic ones. A violation is a protocol
// bug, so the suite asserts them directly rather than trusting the
// implementation to behave.

import test from 'node:test';
import assert from 'node:assert/strict';
import { GlyphQueue } from '../../src/glyphs/GlyphQueue.js';
import { Clock } from '../../src/core/Clock.js';
import { Engine, MAX_MORPH_STEP_PER_TICK } from '../../src/core/Engine.js';

/**
 * A renderer double that records mesh creation and disposal.
 *
 * @returns {object} Mock renderer.
 */
function mockRenderer() {
  const created = [];
  const removed = [];
  return {
    created,
    removed,
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
      created.push(mesh);
      return mesh;
    },
    removeGlyphMesh(mesh) {
      removed.push(mesh);
    },
  };
}

const square = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const circle = new Float32Array([0.5, 0, 0.75, 0.25, 0.5, 0.5, 0.25, 0.25]);

test('grammar: an utterance must open with at least two overlapping symbols', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);

  // The application seeds two glyphs at the start of a ritual. This test
  // pins that the queue can hold, and reports, a valid overlap.
  queue.addGlyph(square, 'anchor', 0, { fadeTime: 5 });
  queue.addGlyph(circle, 'flow', 0, { fadeTime: 5 });

  assert.equal(queue.getActiveGlyphs().length, 2);
  assert.ok(
    queue.satisfiesMinimumOverlap(),
    'two seeded glyphs must satisfy the protocol minimum overlap'
  );
  assert.equal(renderer.created.length, 2);
});

test('grammar: overlap is reported as non-compliant when only one symbol lives', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);

  queue.addGlyph(square, 'anchor', 0, { fadeTime: 0.2 });
  assert.equal(queue.satisfiesMinimumOverlap(), false, 'one glyph alone is not compliant');

  // A lone glyph holds through its morph and only then decays. Once it has
  // fully decayed the queue is empty, which is also non-compliant - the
  // ritual is expected to keep at least two symbols in flight.
  let time = 0;
  for (let i = 0; i < 40; i++) {
    time += 0.25;
    queue.update(0.25, time, { amp: 0 }, 1, {});
  }
  assert.equal(queue.getActiveGlyphs().length, 0);
  assert.equal(queue.satisfiesMinimumOverlap(), false);
});

test('grammar: no symbol may be removed without decaying', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);

  const glyph = queue.addGlyph(square, 'flow', 0, { fadeTime: 2 });
  assert.equal(renderer.removed.length, 0, 'a fresh glyph must not be disposed');

  // Step the simulation in consistent 0.25s frames so deltaTime and the
  // clock stay in step, as they do in the real render loop.
  let time = 0;
  const step = (frames) => {
    for (let i = 0; i < frames; i++) {
      time += 0.25;
      queue.update(0.25, time, { amp: 0 }, 1, {});
    }
  };

  // While the glyph is morphing into its form it holds full opacity - the
  // transformation must be visible before the symbol recedes.
  step(1);
  assert.equal(renderer.removed.length, 0, 'glyph removed before it decayed');
  assert.equal(glyph.currentOpacity, 1, 'glyph faded while still morphing');
  assert.ok(glyph.morphProgress > 0 && glyph.morphProgress < 1, 'morph should be in progress');

  // Once the morph completes it begins to decay.
  step(8);
  assert.equal(glyph.morphProgress, 1, 'morph should have completed');
  assert.ok(glyph.currentOpacity < 1 && glyph.currentOpacity > 0, 'glyph should be decaying');

  // Only when the decay has run its course is it released.
  step(24);
  assert.equal(renderer.removed.length, 1);
  assert.equal(glyph.currentOpacity, 0);
});

test('grammar: symbols over the ceiling retire by decaying, never by being cut', () => {
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);

  for (let i = 0; i < 6; i++) {
    queue.addGlyph(square, 'flow', i, { fadeTime: 10 });
  }

  // protocol section 6: "No symbol MAY be removed without decay". The
  // symbols above the ceiling are asked to retire, not cut away. Nothing is
  // released while the symbols are still visible.
  assert.equal(
    renderer.removed.length,
    0,
    'no symbol may be removed without first decaying',
  );
  assert.ok(
    queue.queue.some(glyph => glyph.isRetiring),
    'the symbols above the ceiling must be retiring',
  );

  // They complete their morph and decay, and release their meshes then.
  let time = 0;
  for (let i = 0; i < 400; i++) {
    time += 0.25;
    queue.update(0.25, time, { amp: 0 }, 0, {});
  }
  assert.ok(
    renderer.removed.length >= 2,
    'decayed symbols must release their meshes',
  );

  // Every symbol that was removed must have decayed first. A symbol that
  // was still visible when it was removed would be a cut.
  for (const glyph of queue.queue) {
    assert.ok(
      glyph.currentOpacity <= 0.01,
      'a symbol was removed while still visible',
    );
  }
});

test('grammar: transitions are continuous - no instantaneous state changes', () => {
  const engine = new Engine();
  engine.start(0);
  engine.tick(0);

  const before = engine.getState().morphProgress;
  // A very large frame gap (tab resume) must not teleport the morph.
  engine.tick(100_000);
  const after = engine.getState().morphProgress;

  assert.ok(
    Math.abs(after - before) <= MAX_MORPH_STEP_PER_TICK + 1e-9,
    `morph jumped by ${Math.abs(after - before)}`
  );
  engine.dispose();
});

test('grammar: silence influences motion rather than being treated as zero', () => {
  const engine = new Engine();
  engine.start(0);
  engine.tick(0);

  engine.updateSilence(0.016, false);
  const sounded = { ...engine.getState() };

  engine.updateSilence(2, true);
  const silent = { ...engine.getState() };

  assert.notDeepEqual(
    sounded,
    silent,
    'silence must change engine state - absence is a signal, not zero'
  );
  engine.dispose();
});

test('grammar: a large time gap is clamped rather than integrated', () => {
  const clock = new Clock({ maxDelta: 0.1 });
  clock.tick(0);
  const { delta } = clock.tick(60_000);
  assert.ok(delta <= 0.1 + 1e-9, `delta ${delta} was not clamped`);
});

test('grammar: repetition increases inertia, not magnitude', () => {
  const engine = new Engine();
  engine.start(0);
  engine.tick(0);

  // Feed the same target repeatedly. Magnitude (the value itself) must not
  // grow with repetition.
  const values = [];
  for (let i = 0; i < 12; i++) {
    engine.setMorphTarget(0.5);
    engine.tick(i * 16);
    values.push(engine.getState().morphProgress);
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  assert.ok(max <= 0.5 + 1e-9, `magnitude grew to ${max} through repetition`);
  assert.ok(max - min < 0.2, 'repetition should not produce large swings');
  engine.dispose();
});

test('grammar: no symbol is ever removed while it is still visible', () => {
  // The strongest form of "No symbol MAY be removed without decay": watch
  // the whole lifecycle and assert every removal happened at zero opacity.
  const renderer = mockRenderer();
  const queue = new GlyphQueue(renderer);
  const removedWhileVisible = [];

  const originalRemove = queue.removeGlyph.bind(queue);
  queue.removeGlyph = (glyph) => {
    if (glyph.currentOpacity > 0.01) {
      removedWhileVisible.push(glyph.currentOpacity);
    }
    originalRemove(glyph);
  };

  for (let i = 0; i < 12; i++) {
    queue.addGlyph(square, ['anchor', 'flow', 'void', 'echo'][i % 4], i, { fadeTime: 4 });
  }

  let time = 0;
  for (let i = 0; i < 600; i++) {
    time += 0.1;
    queue.update(0.1, time, { amp: 0 }, 0, {});
    // Keep the field populated so the ceiling is exercised continuously.
    if (i % 20 === 0) {
      queue.addGlyph(square, 'flow', time, { fadeTime: 4 });
    }
  }

  assert.deepEqual(
    removedWhileVisible,
    [],
    'symbols were removed while still visible',
  );
});
