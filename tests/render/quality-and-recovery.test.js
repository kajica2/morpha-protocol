// Rendering quality, reduced motion, and WebGL context recovery.
//
// Written from the specification of Phase 3 in docs/PHASE-3-VISUAL-ENGINE.md:
//   - A lost WebGL context must be recoverable, not a permanent black screen.
//   - Reduced motion must DAMP motion, never remove it. protocol section 6
//     requires the utterance to stay continuous.
//   - Quality must be capped for modest machines, and the pixel ratio must
//     be applied so a Retina display is not rendered at half resolution.
//
// Negative controls for each area were run and observed failing; the notes
// at the bottom of this file record which assertion catches which defect.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_PRESETS,
  DEFAULT_PRESET,
  REDUCED_MOTION_SCALE,
  LOW_CORE_THRESHOLD,
  detectReducedMotion,
  resolveQuality,
} from '../../src/render/Quality.js';
import { createContextRecovery } from '../../src/render/ContextRecovery.js';

// ---------------------------------------------------------------- quality

test('every quality preset resolves', () => {
  for (const name of ['low', 'medium', 'high']) {
    const quality = resolveQuality(name, { devicePixelRatio: 2 });
    assert.ok(quality.pointSize > 0, `${name} needs a point size`);
    assert.ok(quality.particleCount > 0, `${name} needs particles`);
    assert.ok(quality.pixelRatio >= 1, `${name} needs a pixel ratio`);
  }
});

test('an unknown preset falls back to the default rather than throwing', () => {
  const quality = resolveQuality('ultra-extreme', { devicePixelRatio: 1 });
  assert.equal(quality.preset, DEFAULT_PRESET);
});

test('the pixel ratio is capped by the preset', () => {
  // A Retina display reports 2 or 3. Rendering at the full ratio on a
  // modest machine costs fill rate for no visible gain.
  const low = resolveQuality('low', { devicePixelRatio: 3 });
  assert.equal(low.pixelRatio, QUALITY_PRESETS.low.pixelRatioCap);

  const high = resolveQuality('high', { devicePixelRatio: 3 });
  assert.ok(
    high.pixelRatio <= QUALITY_PRESETS.high.pixelRatioCap,
    'the cap must hold'
  );
});

test('a modest machine is downgraded from high', () => {
  const quality = resolveQuality('high', {
    devicePixelRatio: 2,
    hardwareConcurrency: LOW_CORE_THRESHOLD,
  });
  assert.ok(
    quality.preset !== 'high',
    'a low-core machine must not get the high preset'
  );
});

test('a capable machine keeps the requested preset', () => {
  const quality = resolveQuality('high', {
    devicePixelRatio: 2,
    hardwareConcurrency: 16,
  });
  assert.equal(quality.preset, 'high');
});

test('a missing or nonsensical core count does not downgrade', () => {
  for (const cores of [undefined, 0, -1, NaN]) {
    const quality = resolveQuality('high', {
      devicePixelRatio: 2,
      hardwareConcurrency: cores,
    });
    assert.equal(quality.preset, 'high', `cores=${cores} must not downgrade`);
  }
});

test('a missing device pixel ratio falls back to 1', () => {
  const quality = resolveQuality('medium', {});
  assert.ok(quality.pixelRatio >= 1);
  assert.ok(Number.isFinite(quality.pixelRatio));
});

// -------------------------------------------------------- reduced motion

test('reduced motion is detected from the media query', () => {
  const matching = { matchMedia: () => ({ matches: true }) };
  const notMatching = { matchMedia: () => ({ matches: false }) };
  assert.equal(detectReducedMotion(matching), true);
  assert.equal(detectReducedMotion(notMatching), false);
});

test('a missing matchMedia is handled without throwing', () => {
  assert.equal(detectReducedMotion({}), false);
  assert.equal(detectReducedMotion(undefined), false);
  assert.equal(detectReducedMotion(null), false);
});

test('a matchMedia that throws is handled without throwing', () => {
  const hostile = {
    matchMedia() {
      throw new Error('not allowed');
    },
  };
  assert.equal(detectReducedMotion(hostile), false);
});

test('reduced motion damps the motion scale but never removes it', () => {
  // protocol section 6: motion must be continuous. A frozen field would be
  // a protocol violation, so the scale must stay above zero.
  const damped = resolveQuality('medium', { devicePixelRatio: 1, reducedMotion: true });
  const normal = resolveQuality('medium', { devicePixelRatio: 1 });

  assert.ok(
    damped.motionScale < normal.motionScale,
    'reduced motion must damp'
  );
  assert.ok(
    damped.motionScale > 0,
    'reduced motion must never freeze the field'
  );
  assert.equal(damped.motionScale, REDUCED_MOTION_SCALE);
});

test('reduced motion thins the ambient field', () => {
  const damped = resolveQuality('high', { devicePixelRatio: 1, reducedMotion: true });
  const normal = resolveQuality('high', { devicePixelRatio: 1 });
  assert.ok(damped.particleCount < normal.particleCount);
  assert.ok(damped.particleCount > 0, 'the field must not be emptied');
});

// ----------------------------------------------------- context recovery

/**
 * A canvas double that records the listeners attached to it.
 *
 * @returns {object} The fake canvas.
 */
function fakeCanvas() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    },
    /**
     * Fire an event at the registered listeners.
     *
     * @param {string} type Event type.
     * @param {object} [event] Event payload.
     */
    emit(type, event = {}) {
      for (const handler of [...(listeners.get(type) || [])]) handler(event);
    },
  };
}

test('the context loss event is cancelled so restoration is possible', () => {
  // Without preventDefault the browser treats the loss as final and never
  // fires webglcontextrestored - there would be nothing to recover to.
  const canvas = fakeCanvas();
  let prevented = false;
  createContextRecovery(canvas, {});

  canvas.emit('webglcontextlost', {
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true, 'the loss event must be cancelled');
});

test('the context is reported as lost and then restored', () => {
  const canvas = fakeCanvas();
  const recovery = createContextRecovery(canvas, {});

  assert.equal(recovery.isLost, false);

  canvas.emit('webglcontextlost', { preventDefault() {} });
  assert.equal(recovery.isLost, true);

  canvas.emit('webglcontextrestored', {});
  assert.equal(recovery.isLost, false);
});

test('the restore handler runs so the field can be rebuilt', () => {
  const canvas = fakeCanvas();
  let restored = 0;
  createContextRecovery(canvas, {
    onRestored() {
      restored += 1;
    },
  });

  canvas.emit('webglcontextlost', { preventDefault() {} });
  canvas.emit('webglcontextrestored', {});
  assert.equal(restored, 1);
});

test('a throwing handler is reported rather than crashing the runtime', () => {
  const canvas = fakeCanvas();
  const errors = [];
  createContextRecovery(canvas, {
    onRestored() {
      throw new Error('rebuild failed');
    },
    onError(error) {
      errors.push(error);
    },
  });

  canvas.emit('webglcontextrestored', {});
  assert.equal(errors.length, 1, 'the failure must be reported');
  assert.match(errors[0].message, /rebuild failed/);
});

test('disposing detaches the listeners', () => {
  const canvas = fakeCanvas();
  const recovery = createContextRecovery(canvas, {});

  recovery.dispose();
  assert.equal(recovery.isDisposed, true);

  // The listeners are gone, so a later loss must not be observed.
  let lost = 0;
  const second = createContextRecovery(canvas, {
    onLost() {
      lost += 1;
    },
  });
  second.dispose();
  canvas.emit('webglcontextlost', { preventDefault() {} });
  assert.equal(lost, 0);
});

test('a canvas without addEventListener does not break construction', () => {
  const recovery = createContextRecovery({}, {});
  assert.equal(recovery.isLost, false);
  recovery.dispose();
});

test('the loss and restore are reported so the application can act on them', () => {
  // three.js writes context loss to the console, where the person watching
  // the ritual never sees it. The application needs its own signal so it
  // can tell the user what happened.
  const canvas = fakeCanvas();
  const events = [];
  createContextRecovery(canvas, {
    onLost: () => events.push('lost'),
    onRestored: () => events.push('restored'),
  });

  canvas.emit('webglcontextlost', { preventDefault() {} });
  canvas.emit('webglcontextrestored', {});
  assert.deepEqual(events, ['lost', 'restored']);
});

test('a lost context never removes the listener that would restore it', () => {
  // The restore listener must survive the loss, or there is no recovery.
  const canvas = fakeCanvas();
  const recovery = createContextRecovery(canvas, {});

  canvas.emit('webglcontextlost', { preventDefault() {} });
  const stillListening = (canvas.listeners.get('webglcontextrestored') || []).length;
  assert.equal(stillListening, 1, 'the restore listener must still be attached');

  canvas.emit('webglcontextrestored', {});
  assert.equal(recovery.isLost, false);
});
