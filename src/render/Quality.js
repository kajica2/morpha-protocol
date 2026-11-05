// Rendering quality policy.
//
// Pure functions: no three.js, no DOM beyond the single window-like object
// passed in. That keeps the policy testable without a GPU, which matters
// because the browser smoke gate can only tell you that something rendered,
// not that the quality rules were applied correctly.
//
// The rules exist for three reasons:
//   - A Retina display should get a crisp field, not a half-resolution one.
//   - A modest machine should not be asked to shade a field it cannot.
//   - A user with reduced-motion sensitivity should get damped motion, not
//     no motion. protocol section 6 requires motion to stay continuous, so
//     reduced motion damps rather than freezes.

/**
 * @typedef {object} QualitySettings
 * @property {number} pixelRatioCap   Maximum device pixel ratio to render at.
 * @property {number} pointSize       Base glyph point size in pixels.
 * @property {number} particleCount   Particles for the ambient field.
 * @property {number} temporalMemory  0..1. How much previous-frame influence persists.
 * @property {number} motionScale     Multiplier on all visible motion.
 */

/**
 * The three quality presets.
 *
 * @type {Readonly<Record<string, QualitySettings>>}
 */
export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    pixelRatioCap: 1,
    pointSize: 7,
    particleCount: 120,
    temporalMemory: 0,
    motionScale: 1,
  }),
  medium: Object.freeze({
    pixelRatioCap: 1.5,
    pointSize: 9,
    particleCount: 320,
    temporalMemory: 0.35,
    motionScale: 1,
  }),
  high: Object.freeze({
    pixelRatioCap: 2,
    pointSize: 11,
    particleCount: 700,
    temporalMemory: 0.6,
    motionScale: 1,
  }),
});

/**
 * The default preset.
 *
 * @type {string}
 */
export const DEFAULT_PRESET = 'medium';

/**
 * Motion scale applied when reduced motion is requested.
 *
 * The field still moves; it moves less. This mirrors the engine's
 * REDUCED_MOTION_FACTOR (0.25) but is kept separate so the renderer's
 * damping can be tuned without touching the simulation.
 *
 * @type {number}
 */
export const REDUCED_MOTION_SCALE = 0.25;

/**
 * Core count at or below which the quality is downgraded.
 *
 * @type {number}
 */
export const LOW_CORE_THRESHOLD = 4;

/**
 * Clamp a number into a range.
 *
 * @param {number} value Value to clamp.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number}
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Whether the environment asks for reduced motion.
 *
 * Reads `prefers-reduced-motion` when the API exists and answers without
 * throwing when it does not - older browsers and non-browser environments
 * simply report false.
 *
 * @param {object} [win] A window-like object. Defaults to globalThis.
 * @returns {boolean}
 */
export function detectReducedMotion(win = globalThis) {
  try {
    const matchMedia = win?.matchMedia;
    if (typeof matchMedia !== 'function') return false;
    const query = matchMedia.call(win, '(prefers-reduced-motion: reduce)');
    return Boolean(query?.matches);
  } catch {
    return false;
  }
}

/**
 * Resolve the effective rendering quality.
 *
 * An explicit preset is honoured unless the machine looks too modest, in
 * which case it is downgraded - a field that does not render at all is
 * worse than a simpler one that does.
 *
 * @param {string} [presetName] Requested preset.
 * @param {object} [options] Environment facts.
 * @param {number} [options.devicePixelRatio] The display's pixel ratio.
 * @param {boolean} [options.reducedMotion] Whether reduced motion is on.
 * @param {number} [options.hardwareConcurrency] Logical CPU count.
 * @returns {QualitySettings}
 */
export function resolveQuality(presetName = DEFAULT_PRESET, options = {}) {
  const name = typeof presetName === 'string' && presetName in QUALITY_PRESETS
    ? presetName
    : DEFAULT_PRESET;

  let effective = name;

  // A modest machine cannot shade a high-quality field. Downgrade rather
  // than fail to render at all.
  const cores = options.hardwareConcurrency;
  if (Number.isFinite(cores) && cores > 0 && cores <= LOW_CORE_THRESHOLD
      && effective === 'high') {
    effective = 'medium';
  }

  const preset = QUALITY_PRESETS[effective];
  const reducedMotion = options.reducedMotion === true;

  const devicePixelRatio = clamp(options.devicePixelRatio, 1, 3);
  const pixelRatio = Math.min(devicePixelRatio, preset.pixelRatioCap);

  // Reduced motion damps the visible motion and thins the ambient field.
  // It never removes motion entirely - protocol section 6 requires the
  // utterance to stay continuous.
  const motionScale = reducedMotion ? REDUCED_MOTION_SCALE : preset.motionScale;
  const particleCount = reducedMotion
    ? Math.round(preset.particleCount * 0.5)
    : preset.particleCount;

  return {
    preset: effective,
    pixelRatio,
    pointSize: preset.pointSize,
    particleCount,
    temporalMemory: preset.temporalMemory,
    motionScale,
    reducedMotion,
  };
}
