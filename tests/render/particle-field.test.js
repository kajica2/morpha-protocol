// Deterministic, layered ambient particle field.
//
// Written from the specification in docs/PHASE-3-VISUAL-ENGINE-B.md and the
// protocol rules it must not break:
//   - The same seed always produces the same field; a different seed does
//     not. A ritual must be replayable and comparable frame for frame.
//   - No particle is ever repositioned while it is visible. Particles may
//     DRIFT every frame; what they may never do is jump.
//   - Energy biases motion, not appearance: alpha and size are unaffected.
//   - Silence is input: with no energy the field settles into a slow drift
//     rather than stopping.
//   - Reduced motion damps the drift, it never freezes the field.
//
// A note on the no-cut check: it distinguishes a DRIFT from a RECYCLE by
// magnitude. A drift step is a fraction of a unit; a recycle teleports the
// particle across the field. Comparing positions with `!==` would report a
// violation on every frame of every particle, because drifting changes the
// position every frame. The check below therefore looks for jumps larger
// than JUMP_THRESHOLD, and additionally uses the life counter - which only
// ever resets on a recycle - as an independent signal.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARTICLE_CONFIG,
  ParticleField,
  createLayerConfig,
} from '../../src/render/ParticleField.js';

/**
 * A position jump larger than this is a teleport, not a drift.
 *
 * @type {number}
 */
const JUMP_THRESHOLD = 0.5;

/**
 * Copies the published state of a field into plain objects, so a snapshot
 * survives later in-place updates.
 *
 * @param {ParticleField} field The field to snapshot.
 * @returns {object[]} One plain object per particle.
 */
function snapshot(field) {
  return field.getParticles().map((p) => ({
    x: p.x,
    y: p.y,
    depth: p.depth,
    layer: p.layer,
    alpha: p.alpha,
    size: p.size,
    life: p.life,
    maxLife: p.maxLife,
    vx: p.vx,
    vy: p.vy,
  }));
}

/**
 * Total distance travelled by every particle over a run.
 *
 * Two totals are reported. `path` is every movement, including the jump a
 * particle makes when it is recycled. `drift` is the movement that is too
 * small to be a recycle - the actual drift of the field. Only `drift`
 * responds to the drift speed: a recycle happens on a schedule set by the
 * particle's life, not by how fast the field is moving, so `path` is
 * dominated by teleports and would barely move when the drift is damped.
 *
 * @param {ParticleField} field The field to run.
 * @param {number} frames How many frames to run.
 * @param {object} [options] Frame options passed to every update.
 * @returns {{ path: number, drift: number, moved: number }} The totals.
 */
function travel(field, frames, options = {}) {
  let path = 0;
  let drift = 0;
  const movedFlags = new Array(field.getParticles().length).fill(false);
  let previous = snapshot(field);

  for (let frame = 0; frame < frames; frame += 1) {
    field.update(1 / 60, options);
    const current = snapshot(field);
    for (let i = 0; i < current.length; i += 1) {
      const step = Math.hypot(current[i].x - previous[i].x, current[i].y - previous[i].y);
      path += step;
      if (step > 0 && step <= JUMP_THRESHOLD) drift += step;
      if (step > 0) movedFlags[i] = true;
    }
    previous = current;
  }

  return { path, drift, moved: movedFlags.filter(Boolean).length };
}

// ------------------------------------------------------------ determinism

test('the same seed produces an identical field', () => {
  const a = new ParticleField({ seed: 42, count: 64 });
  const b = new ParticleField({ seed: 42, count: 64 });

  assert.deepEqual(snapshot(a), snapshot(b));
});

test('the same seed produces an identical field after updating', () => {
  const a = new ParticleField({ seed: 42, count: 64 });
  const b = new ParticleField({ seed: 42, count: 64 });

  for (let frame = 0; frame < 120; frame += 1) {
    a.update(1 / 60, { energy: 0.4 });
    b.update(1 / 60, { energy: 0.4 });
  }

  assert.deepEqual(snapshot(a), snapshot(b));
});

test('a different seed produces a different field', () => {
  const a = new ParticleField({ seed: 1, count: 64 });
  const b = new ParticleField({ seed: 2, count: 64 });

  const first = snapshot(a);
  const second = snapshot(b);
  const differs = first.some((p, i) => p.x !== second[i].x || p.y !== second[i].y);

  assert.ok(differs, 'a different seed must not produce the same field');
});

test('a different seed produces a different field after updating', () => {
  const a = new ParticleField({ seed: 1, count: 64 });
  const b = new ParticleField({ seed: 2, count: 64 });

  for (let frame = 0; frame < 60; frame += 1) {
    a.update(1 / 60, { energy: 0.7 });
    b.update(1 / 60, { energy: 0.7 });
  }

  const first = snapshot(a);
  const second = snapshot(b);
  const differs = first.some((p, i) => p.x !== second[i].x || p.y !== second[i].y);

  assert.ok(differs, 'a different seed must not produce the same field');
});

// --------------------------------------------------------------- layering

test('the field is spread over three depth planes by default', () => {
  const field = new ParticleField({ seed: 5, count: 90 });

  assert.equal(field.getLayerCount(), 3);
  assert.equal(field.getLayers().length, 3);
});

test('each depth plane has its own parallax factor', () => {
  const layers = new ParticleField({ seed: 5, count: 90 }).getLayers();
  const parallax = new Set(layers.map((l) => l.parallax));

  assert.equal(parallax.size, layers.length, 'every plane needs a distinct parallax');
});

test('far planes drift less than near planes', () => {
  const layers = new ParticleField({ seed: 5, count: 90 }).getLayers();

  for (let i = 1; i < layers.length; i += 1) {
    assert.ok(
      layers[i].parallax > layers[i - 1].parallax,
      'a nearer plane must drift more than the plane behind it'
    );
  }
});

test('particles occupy every depth plane', () => {
  const field = new ParticleField({ seed: 5, count: 90 });
  const used = new Set(field.getParticles().map((p) => p.layer));

  assert.equal(used.size, 3);
});

test('depth is roughly uniform across the field', () => {
  const field = new ParticleField({ seed: 5, count: 300 });
  const particles = field.getParticles();
  const layers = field.getLayers();

  const depths = particles.map((p) => p.depth);
  assert.ok(Math.min(...depths) < 0.34, 'some particles must sit in the far plane');
  assert.ok(Math.max(...depths) > 0.66, 'some particles must sit in the near plane');

  for (const p of particles) {
    const layer = layers[p.layer];
    assert.ok(
      p.depth >= layer.depthMin && p.depth <= layer.depthMax,
      'a particle depth must stay inside the band of its own plane'
    );
  }
});

test('the layer configuration is exported for per-layer draw state', () => {
  const layers = createLayerConfig(4);

  assert.equal(layers.length, 4);
  for (const layer of layers) {
    assert.equal(typeof layer.parallax, 'number');
    assert.equal(typeof layer.sizeScale, 'number');
    assert.equal(typeof layer.opacityScale, 'number');
    assert.ok(layer.sizeScale > 0);
    assert.ok(layer.opacityScale > 0);
  }
});

// --------------------------------------------------- lifecycle without cuts

test('a particle is never repositioned while it is visible', () => {
  const field = new ParticleField({
    seed: 7,
    count: 80,
    minLife: 0.4,
    maxLife: 1.0,
    driftSpeed: 0.5,
  });

  let previous = snapshot(field);
  let jumps = 0;

  for (let frame = 0; frame < 300; frame += 1) {
    field.update(1 / 60);
    const current = snapshot(field);

    for (let i = 0; i < current.length; i += 1) {
      const jump = Math.hypot(
        current[i].x - previous[i].x,
        current[i].y - previous[i].y,
      );

      if (jump > JUMP_THRESHOLD) {
        jumps += 1;
        assert.equal(
          previous[i].alpha,
          0,
          'a particle must be invisible in the frame before it is recycled',
        );
        assert.equal(current[i].alpha, 0, 'a recycled particle must fade in from zero');
      }
    }

    previous = current;
  }

  assert.ok(jumps > 0, 'the run must actually recycle particles');
});

test('a particle is never recycled while its alpha is above zero', () => {
  // The life counter only resets on a recycle, so it is an independent
  // signal: if life went backwards, the particle was re-seeded.
  const field = new ParticleField({
    seed: 7,
    count: 80,
    minLife: 0.4,
    maxLife: 1.0,
    driftSpeed: 0.5,
  });

  let previous = snapshot(field);
  let recycles = 0;

  for (let frame = 0; frame < 300; frame += 1) {
    field.update(1 / 60);
    const current = snapshot(field);

    for (let i = 0; i < current.length; i += 1) {
      if (current[i].life < previous[i].life) {
        recycles += 1;
        assert.equal(
          previous[i].alpha,
          0,
          'a particle must fade out to zero before it is recycled',
        );
        assert.equal(current[i].alpha, 0, 'a recycled particle starts invisible');
        assert.ok(current[i].life < current[i].maxLife, 'a recycled particle starts a new life');
      }
    }

    previous = current;
  }

  assert.ok(recycles > 0, 'the run must actually recycle particles');
});

test('alpha always stays within 0..1', () => {
  const field = new ParticleField({ seed: 7, count: 60, minLife: 0.3, maxLife: 0.8 });

  for (let frame = 0; frame < 240; frame += 1) {
    field.update(1 / 60);
    for (const p of field.getParticles()) {
      assert.ok(p.alpha >= 0 && p.alpha <= 1, `alpha out of range: ${p.alpha}`);
    }
  }
});

test('a particle fades in from zero and fades out to zero', () => {
  const field = new ParticleField({ seed: 7, count: 1, minLife: 1, maxLife: 1 });
  const p = field.getParticles()[0];

  const alphas = [];
  for (let frame = 0; frame < 200; frame += 1) {
    field.update(1 / 60);
    alphas.push(p.alpha);
  }

  // The particle recycles several times over this window, so the sequence
  // must contain the full envelope: exactly zero at the end of a life,
  // full opacity in the middle of one.
  assert.ok(
    alphas.some((a) => a === 0),
    'the fade-out must reach exactly zero',
  );
  assert.ok(
    alphas.some((a) => a > 0.9),
    'the particle must reach full opacity during its life',
  );
});

test('the field keeps its population over time', () => {
  const field = new ParticleField({ seed: 7, count: 40, minLife: 0.2, maxLife: 0.6 });

  for (let frame = 0; frame < 200; frame += 1) {
    field.update(1 / 60);
    assert.equal(field.getParticles().length, 40);
  }
});

// ------------------------------------------------- energy biases motion only

test('energy changes the drift but not the appearance', () => {
  const quiet = new ParticleField({ seed: 11, count: 64 });
  const loud = new ParticleField({ seed: 11, count: 64 });

  for (let frame = 0; frame < 120; frame += 1) {
    quiet.update(1 / 60, { energy: 0 });
    loud.update(1 / 60, { energy: 1 });
  }

  const q = snapshot(quiet);
  const l = snapshot(loud);

  for (let i = 0; i < q.length; i += 1) {
    assert.equal(q[i].alpha, l[i].alpha, 'energy must not change alpha');
    assert.equal(q[i].size, l[i].size, 'energy must not change size');
    assert.equal(q[i].depth, l[i].depth, 'energy must not change depth');
  }

  const moved = q.some((p, i) => p.x !== l[i].x || p.y !== l[i].y);
  assert.ok(moved, 'energy must change the drift');
});

test('energy does not change the lifetime schedule', () => {
  const quiet = new ParticleField({ seed: 11, count: 32, minLife: 0.5, maxLife: 1.5 });
  const loud = new ParticleField({ seed: 11, count: 32, minLife: 0.5, maxLife: 1.5 });

  for (let frame = 0; frame < 120; frame += 1) {
    quiet.update(1 / 60, { energy: 0 });
    loud.update(1 / 60, { energy: 0.9 });
  }

  const q = snapshot(quiet);
  const l = snapshot(loud);
  for (let i = 0; i < q.length; i += 1) {
    assert.equal(q[i].life, l[i].life);
    assert.equal(q[i].maxLife, l[i].maxLife);
  }
});

// ----------------------------------------------- silence is input, damping

test('the field still drifts at zero energy', () => {
  const field = new ParticleField({ seed: 3, count: 64 });
  const { drift, moved } = travel(field, 60, { energy: 0 });

  assert.ok(moved > 0, 'the field must keep moving in silence');
  assert.ok(drift > 0, 'the field must keep drifting in silence');
});

test('the field still drifts with no options at all', () => {
  const field = new ParticleField({ seed: 3, count: 64 });
  const { drift } = travel(field, 60);

  assert.ok(drift > 0, 'the default field must drift');
});

test('motionScale damps the drift without freezing it', () => {
  const slow = new ParticleField({ seed: 5, count: 64, width: 20, height: 20 });
  const fast = new ParticleField({ seed: 5, count: 64, width: 20, height: 20 });

  const damped = travel(slow, 60, { motionScale: 0.25 });
  const full = travel(fast, 60, { motionScale: 1 });

  assert.ok(damped.drift > 0, 'reduced motion must not freeze the field');
  assert.ok(
    damped.drift < full.drift,
    `reduced motion must damp the drift (damped=${damped.drift}, full=${full.drift})`,
  );
  // The drift speed is scaled directly, so a quarter scale must travel
  // roughly a quarter as far. A loose bound: the noise field bends the
  // path, so the ratio is close to but not exactly 0.25.
  assert.ok(
    damped.drift < full.drift * 0.6,
    `reduced motion must damp the drift substantially (damped=${damped.drift}, full=${full.drift})`,
  );
});

test('a reduced motion scale still moves every particle', () => {
  const field = new ParticleField({ seed: 5, count: 64, width: 20, height: 20 });
  const { moved } = travel(field, 60, { motionScale: 0.25 });

  assert.equal(moved, 64, 'every particle must still drift under reduced motion');
});

// -------------------------------------------------------------- bounds

test('particles stay inside the bounds', () => {
  const field = new ParticleField({
    seed: 13,
    count: 100,
    width: 2,
    height: 2,
    driftSpeed: 5,
    minLife: 0.5,
    maxLife: 1,
  });
  const bounds = field.getBounds();

  for (let frame = 0; frame < 300; frame += 1) {
    field.update(1 / 60);
    for (const p of field.getParticles()) {
      assert.ok(p.x >= bounds.minX && p.x <= bounds.maxX, `x out of bounds: ${p.x}`);
      assert.ok(p.y >= bounds.minY && p.y <= bounds.maxY, `y out of bounds: ${p.y}`);
    }
  }
});

test('the bounds are reported for the renderer', () => {
  const field = new ParticleField({ seed: 13, count: 10, width: 4, height: 3 });
  const bounds = field.getBounds();

  assert.equal(bounds.minX, 0);
  assert.equal(bounds.minY, 0);
  assert.equal(bounds.maxX, 4);
  assert.equal(bounds.maxY, 3);
  assert.equal(bounds.width, 4);
  assert.equal(bounds.height, 3);
});

// ------------------------------------------------- regression: it moves

test('the particles actually move after a run of updates', () => {
  // Regression: an earlier build computed the drift but never wrote the
  // integrated position back, so the field only ever appeared to move when
  // a particle was recycled.
  //
  // Counting "particles whose position changed" is not enough: a recycled
  // particle teleports, so it would satisfy that check even with the
  // integration broken. What the bug destroyed is the DRIFT - the small
  // per-frame step between teleports. So this counts drift steps: movement
  // that is too small to be a recycle.
  const field = new ParticleField({ seed: 9, count: 64 });

  let driftSteps = 0;
  let previous = snapshot(field);

  for (let frame = 0; frame < 60; frame += 1) {
    field.update(1 / 60, { energy: 0 });
    const current = snapshot(field);

    for (let i = 0; i < current.length; i += 1) {
      const step = Math.hypot(current[i].x - previous[i].x, current[i].y - previous[i].y);
      if (step > 0 && step <= JUMP_THRESHOLD) driftSteps += 1;
    }

    previous = current;
  }

  assert.ok(
    driftSteps > 100,
    `the particles must drift every frame (drift steps=${driftSteps})`,
  );
});

test('a higher energy produces a different position than zero energy', () => {
  // Regression for the same defect: with no integration the two runs ended
  // up in exactly the same place.
  const quiet = new ParticleField({ seed: 9, count: 64 });
  const loud = new ParticleField({ seed: 9, count: 64 });

  for (let frame = 0; frame < 60; frame += 1) {
    quiet.update(1 / 60, { energy: 0 });
    loud.update(1 / 60, { energy: 1 });
  }

  const q = snapshot(quiet);
  const l = snapshot(loud);
  const differs = q.some((p, i) => p.x !== l[i].x || p.y !== l[i].y);

  assert.ok(differs, 'energy must move the particles somewhere else');
});

test('a higher energy moves the particles further', () => {
  // The drift speed scales with the energy, so the loud field must cover
  // more ground than the quiet one over the same number of frames.
  const quiet = new ParticleField({ seed: 9, count: 64, width: 20, height: 20 });
  const loud = new ParticleField({ seed: 9, count: 64, width: 20, height: 20 });

  const still = travel(quiet, 60, { energy: 0 });
  const busy = travel(loud, 60, { energy: 1 });

  assert.ok(
    busy.drift > still.drift,
    `energy must speed the drift up (quiet=${still.drift}, loud=${busy.drift})`,
  );
});

// ------------------------------------------------------------- lifecycle

test('the default configuration exposes the documented knobs', () => {
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.count, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.layerCount, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.seed, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.width, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.height, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.minLife, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.maxLife, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.driftSpeed, 'number');
  assert.equal(typeof DEFAULT_PARTICLE_CONFIG.noiseScale, 'number');
});

test('a malformed configuration degrades instead of throwing', () => {
  const field = new ParticleField({ count: NaN, layerCount: -3, width: 'wide', seed: 'ritual' });

  // A count that is not a number falls back to the default; a negative
  // layer count is clamped to a single plane; a width that is not a number
  // falls back to the default.
  assert.equal(field.getParticles().length, DEFAULT_PARTICLE_CONFIG.count);
  assert.equal(field.getLayerCount(), 1);
  assert.equal(field.width, DEFAULT_PARTICLE_CONFIG.width);
  assert.ok(Number.isFinite(field.width));
});

test('disposing releases the particles and stops the simulation', () => {
  const field = new ParticleField({ seed: 9, count: 20 });

  field.dispose();
  assert.equal(field.getParticles().length, 0);

  field.update(1 / 60);
  assert.equal(field.getParticles().length, 0);
});
