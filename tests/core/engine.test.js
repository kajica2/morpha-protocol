import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, MAX_MORPH_STEP_PER_TICK, SILENCE_RESISTANCE } from '../../src/core/Engine.js';
import { DEFAULT_CONFIG } from '../../src/core/Config.js';

/** Drive an engine for a fixed number of 60fps frames. */
function run(engine, frames, startMs = 0, stepMs = 1000 / 60) {
  let t = startMs;
  engine.start(t);
  for (let i = 0; i < frames; i += 1) {
    t += stepMs;
    engine.tick(t);
  }
  return t;
}

test('the engine exposes its configuration and state', () => {
  const engine = new Engine();
  assert.equal(engine.getConfig().morphDuration, DEFAULT_CONFIG.morphDuration);
  assert.equal(typeof engine.getState().morphProgress, 'number');
  assert.equal(typeof engine.getState().breath, 'number');
});

test('the engine runs headlessly with no DOM and no WebGL', () => {
  const source = readFileSync(new URL('../../src/core/Engine.js', import.meta.url), 'utf8');
  assert.ok(!source.includes("from 'three'"));
  assert.ok(!source.includes('document.'));
  assert.ok(!source.includes('window.'));
  assert.ok(!/from '\.\.\/(render|audio|glyphs)\//.test(source));
});

test('ticking before start does nothing', () => {
  const engine = new Engine();
  assert.equal(engine.tick(100), null);
});

test('the frame counter advances while running', () => {
  const engine = new Engine();
  engine.start(0);
  engine.tick(16);
  engine.tick(32);
  assert.equal(engine.clock.frame, 2);
  assert.equal(engine.isRunning(), true);
});

test('morphProgress advances toward the target', () => {
  const engine = new Engine();
  engine.setMorphTarget(1);
  run(engine, 30);
  const progress = engine.getState().morphProgress;
  assert.ok(progress > 0, 'morph should have progressed');
  assert.ok(progress < 1, 'morph should not have completed instantly');
});

test('the morph is continuous — no tick may jump beyond the cap', () => {
  const engine = new Engine({ ...DEFAULT_CONFIG, morphDuration: 0.05 });
  engine.setMorphTarget(1);
  engine.start(0);
  let previous = engine.getState().morphProgress;
  for (let i = 1; i <= 120; i += 1) {
    engine.tick(i * 16);
    const current = engine.getState().morphProgress;
    assert.ok(
      Math.abs(current - previous) <= MAX_MORPH_STEP_PER_TICK + 1e-9,
      `jump of ${current - previous} exceeded the per-tick cap`
    );
    previous = current;
  }
});

test('a huge injected delta cannot teleport the morph', () => {
  const engine = new Engine({ ...DEFAULT_CONFIG, morphDuration: 0.01 }, { maxDelta: 30 });
  engine.setMorphTarget(1);
  engine.start(0);
  engine.tick(30_000);
  const progress = engine.getState().morphProgress;
  assert.ok(progress <= MAX_MORPH_STEP_PER_TICK + 1e-9, `progress jumped to ${progress}`);
});

test('the morph never overshoots its target', () => {
  const engine = new Engine();
  engine.setMorphTarget(0.5);
  run(engine, 600);
  const progress = engine.getState().morphProgress;
  assert.ok(progress <= 0.5 + 1e-9, `progress overshot to ${progress}`);
});

test('the morph stops at the target', () => {
  const engine = new Engine();
  engine.setMorphTarget(0.25);
  run(engine, 600);
  assert.ok(Math.abs(engine.getState().morphProgress - 0.25) < 1e-6);
});

test('silence raises resistance and slows the morph', () => {
  const loud = new Engine();
  loud.setMorphTarget(1);
  run(loud, 60);

  const quiet = new Engine();
  quiet.setMorphTarget(1);
  quiet.start(0);
  quiet.setSilenceWeight(1);
  for (let i = 1; i <= 60; i += 1) quiet.tick(i * (1000 / 60));

  assert.ok(
    quiet.getState().morphProgress < loud.getState().morphProgress,
    'silence should slow the morph'
  );
  // Resistance is bounded, so the morph still moves: silence slows, it never freezes.
  assert.ok(quiet.getState().morphProgress > 0, 'silence must not stop the morph dead');
  assert.equal(SILENCE_RESISTANCE, 4);
});

test('silence slows the morph by the documented factor', () => {
  const base = new Engine();
  base.setMorphTarget(1);
  run(base, 60);
  const baseProgress = base.getState().morphProgress;

  const quiet = new Engine();
  quiet.setMorphTarget(1);
  quiet.start(0);
  quiet.setSilenceWeight(1);
  for (let i = 1; i <= 60; i += 1) quiet.tick(i * (1000 / 60));

  const ratio = quiet.getState().morphProgress / baseProgress;
  assert.ok(Math.abs(ratio - 1 / (1 + SILENCE_RESISTANCE)) < 1e-6, `ratio was ${ratio}`);
});

test('reducedMotion damps the per-tick change rate', () => {
  const normal = new Engine();
  normal.setMorphTarget(1);
  run(normal, 30);

  const damped = new Engine({ ...DEFAULT_CONFIG, reducedMotion: true });
  damped.setMorphTarget(1);
  run(damped, 30);

  assert.ok(damped.getState().morphProgress < normal.getState().morphProgress);
});

test('silence accumulates and saturates at the configured time', () => {
  const engine = new Engine({ ...DEFAULT_CONFIG, silenceSaturationTime: 1 });
  // silenceTolerance lives in state, not config: zero tolerance means the
  // config's silenceSaturationTime is used verbatim.
  engine.getStateStore().set({ silenceTolerance: 0 });
  engine.start(0);
  engine.tick(16);
  const weight = engine.updateSilence(0.5, true);
  assert.ok(Math.abs(weight - 0.5) < 1e-9);
  const saturated = engine.updateSilence(10, true);
  assert.equal(saturated, 1);
  assert.equal(engine.getSilenceWeight(), 1);
  assert.equal(engine.getState().silenceWeight, 1);
});

test('a higher silence tolerance delays saturation', () => {
  const engine = new Engine({ ...DEFAULT_CONFIG, silenceSaturationTime: 1 });
  engine.getStateStore().set({ silenceTolerance: 1 });
  engine.start(0);
  engine.tick(16);
  const weight = engine.updateSilence(1, true);
  assert.ok(Math.abs(weight - 0.5) < 1e-9, `weight was ${weight}`);
});

test('sound clears the accumulated silence', () => {
  const engine = new Engine();
  engine.start(0);
  engine.updateSilence(1, true);
  const weight = engine.updateSilence(0.016, false);
  assert.equal(weight, 0);
  assert.equal(engine.getState().silenceDuration, 0);
});

test('setSilenceWeight clamps out-of-range input', () => {
  const engine = new Engine();
  assert.equal(engine.setSilenceWeight(5), 1);
  assert.equal(engine.setSilenceWeight(-2), 0);
  assert.equal(engine.setSilenceWeight(Number.NaN), 0);
});

test('frame observers receive the frame payload', () => {
  const engine = new Engine();
  const frames = [];
  engine.onFrame((frame) => frames.push(frame));
  engine.start(0);
  engine.tick(16);
  engine.tick(32);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].frame, 1);
  assert.equal(frames[1].frame, 2);
  assert.ok(frames[1].delta > 0);
  assert.equal(typeof frames[1].state.morphProgress, 'number');
});

test('an observer can unsubscribe', () => {
  const engine = new Engine();
  let count = 0;
  const off = engine.onFrame(() => {
    count += 1;
  });
  engine.start(0);
  engine.tick(16);
  off();
  engine.tick(32);
  assert.equal(count, 1);
});

test('a non-function observer is rejected', () => {
  const engine = new Engine();
  assert.throws(() => engine.onFrame('nope'), TypeError);
});

test('stop halts ticking and releases observers', () => {
  const engine = new Engine();
  let count = 0;
  engine.onFrame(() => {
    count += 1;
  });
  engine.start(0);
  engine.tick(16);
  engine.stop();
  assert.equal(engine.tick(32), null);
  assert.equal(count, 1);
  assert.equal(engine.isRunning(), false);
});

test('dispose releases observers and subscribers', () => {
  const engine = new Engine();
  let frames = 0;
  let updates = 0;
  // Set the target before subscribing so the tick below is the only mutation
  // the subscriber can observe.
  engine.setMorphTarget(0.5);
  engine.onFrame(() => {
    frames += 1;
  });
  engine.subscribe(() => {
    updates += 1;
  });
  engine.start(0);
  engine.tick(16);
  assert.equal(frames, 1);
  assert.equal(updates, 1);
  engine.dispose();
  assert.equal(engine.tick(32), null);
  // A disposed engine rejects further mutation.
  assert.throws(() => engine.setMorphTarget(1), /disposed/);
  // ...and the state store no longer notifies subscribers.
  engine.getStateStore().set({ breath: 0.5 });
  assert.equal(frames, 1);
  assert.equal(updates, 1);
});

test('a disposed engine rejects further use', () => {
  const engine = new Engine();
  engine.dispose();
  assert.throws(() => engine.start(0), /disposed/);
  assert.throws(() => engine.updateSilence(1, true), /disposed/);
  assert.throws(() => engine.setMorphTarget(1), /disposed/);
});

test('the engine is deterministic for identical inputs', () => {
  const build = () => {
    const engine = new Engine();
    engine.setMorphTarget(0.8);
    engine.start(0);
    return engine;
  };
  const a = build();
  const b = build();
  for (let i = 1; i <= 120; i += 1) {
    a.tick(i * 16);
    b.tick(i * 16);
  }
  assert.deepEqual(a.getState(), b.getState());
});
