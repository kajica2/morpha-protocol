/**
 * Small, dependency-free numeric helpers shared by the MORPHA core.
 *
 * Every function here is pure: no DOM, no WebGL, no timers, no global state.
 * Units are documented per function (unitless, seconds, or 0..1 normalised).
 */

/**
 * Clamp a value into the inclusive range [min, max].
 *
 * @param {number} value Value to clamp (unitless).
 * @param {number} min Lower bound (unitless).
 * @param {number} max Upper bound (unitless).
 * @returns {number} `value` limited to the range. NaN resolves to `min`;
 *   an inverted range (min > max) is swapped so the result is always inside
 *   the well-formed range.
 */
export function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  let lo = min;
  let hi = max;
  if (lo > hi) {
    const swap = lo;
    lo = hi;
    hi = swap;
  }
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/**
 * Linear interpolation between two numbers.
 *
 * @param {number} a Start value (unitless).
 * @param {number} b End value (unitless).
 * @param {number} t Interpolation factor, 0 = `a`, 1 = `b`. Not clamped by
 *   design so callers can extrapolate.
 * @returns {number} Interpolated value (unitless).
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Remap a value from one range into another, linearly.
 *
 * @param {number} value Input value (unitless).
 * @param {number} inMin Lower bound of the input range.
 * @param {number} inMax Upper bound of the input range.
 * @param {number} outMin Lower bound of the output range.
 * @param {number} outMax Upper bound of the output range.
 * @returns {number} Remapped value. A degenerate input range (inMin === inMax)
 *   resolves to `outMin` instead of dividing by zero.
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMin === inMax) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

/**
 * Inverse of {@link mapRange}: where does `value` sit between `a` and `b`?
 *
 * @param {number} a Range start (unitless).
 * @param {number} b Range end (unitless).
 * @param {number} value Value to locate (unitless).
 * @returns {number} Normalised position, 0 at `a` and 1 at `b`. Not clamped.
 *   A degenerate range (a === b) resolves to 0.
 */
export function inverseLerp(a, b, value) {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

/**
 * Wrap a value into the half-open range [min, max).
 *
 * @param {number} value Value to wrap (unitless).
 * @param {number} min Lower bound (inclusive).
 * @param {number} max Upper bound (exclusive).
 * @returns {number} Wrapped value. A degenerate or inverted range resolves to `min`.
 */
export function wrap(value, min, max) {
  const range = max - min;
  if (!(range > 0)) return min;
  const offset = ((value - min) % range + range) % range;
  return min + offset;
}

/**
 * Compare two numbers with a tolerance.
 *
 * @param {number} a First value (unitless).
 * @param {number} b Second value (unitless).
 * @param {number} [epsilon=1e-9] Absolute tolerance.
 * @returns {boolean} True when the values are within `epsilon` of each other.
 *   NaN never compares equal to anything, including itself.
 */
export function approximateEquals(a, b, epsilon = 1e-9) {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= epsilon;
}

/**
 * Normalise an arbitrary seed into a 32-bit unsigned integer.
 *
 * Strings are hashed with FNV-1a so that textual seeds ("ritual", "void")
 * produce stable, distinct streams.
 *
 * @param {number|string} seed Seed value.
 * @returns {number} Unsigned 32-bit seed.
 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) return 0;
    return Math.abs(Math.trunc(seed)) >>> 0;
  }
  if (typeof seed === 'string') {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }
  return 0;
}

/**
 * Create a deterministic pseudo-random generator (mulberry32).
 *
 * The generator is reproducible: the same seed always yields the same
 * sequence, which makes simulated MORPHA runs replayable.
 *
 * @param {number|string} [seed=1] Seed for the stream.
 * @returns {() => number} Function returning floats in [0, 1).
 */
export function createSeededRandom(seed = 1) {
  let state = normalizeSeed(seed);
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
