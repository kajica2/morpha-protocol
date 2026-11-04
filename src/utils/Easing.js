/**
 * Easing curves used to keep MORPHA motion continuous.
 *
 * Every curve takes a normalised progress `t` in [0, 1] and returns an eased
 * value in [0, 1]. Input outside [0, 1] is clamped: MORPHA forbids
 * instantaneous transitions, so curves never extrapolate past their domain.
 *
 * This module is intentionally free of maths helpers — see `Math.js` for
 * `clamp` / `lerp` / `mapRange`.
 */

import { clamp } from './Math.js';

/**
 * Clamp a normalised curve parameter into [0, 1].
 *
 * @param {number} t Curve parameter (unitless, expected 0..1).
 * @returns {number} Clamped parameter (unitless).
 */
function unit(t) {
  return clamp(t, 0, 1);
}

/**
 * Identity easing — constant velocity.
 *
 * @param {number} t Progress 0..1 (unitless).
 * @returns {number} `t`, unchanged.
 */
export function linear(t) {
  return unit(t);
}

/**
 * Accelerating easing (cubic in) — slow start, fast finish.
 *
 * @param {number} t Progress 0..1 (unitless).
 * @returns {number} Eased value 0..1.
 */
export function easeIn(t) {
  const x = unit(t);
  return x * x * x;
}

/**
 * Decelerating easing (cubic out) — fast start, slow finish.
 *
 * @param {number} t Progress 0..1 (unitless).
 * @returns {number} Eased value 0..1.
 */
export function easeOut(t) {
  const x = unit(t);
  const inv = 1 - x;
  return 1 - inv * inv * inv;
}

/**
 * Symmetric easing (cubic in-out) — slow start, fast middle, slow finish.
 *
 * @param {number} t Progress 0..1 (unitless).
 * @returns {number} Eased value 0..1.
 */
export function easeInOut(t) {
  const x = unit(t);
  if (x < 0.5) return 4 * x * x * x;
  const inv = -2 * x + 2;
  return 1 - (inv * inv * inv) / 2;
}

/**
 * Smoothstep — the classic hermite curve, C1 continuous at both ends.
 *
 * @param {number} t Progress 0..1 (unitless).
 * @returns {number} Eased value 0..1.
 */
export function smoothstep(t) {
  const x = unit(t);
  return x * x * (3 - 2 * x);
}

/**
 * Registry of the available easing curves, keyed by name.
 *
 * @type {Readonly<Record<string, (t: number) => number>>}
 */
export const EASINGS = Object.freeze({
  linear,
  easeIn,
  easeOut,
  easeInOut,
  smoothstep,
});

/**
 * Look up an easing curve by name.
 *
 * @param {string} name One of `linear`, `easeIn`, `easeOut`, `easeInOut`, `smoothstep`.
 * @returns {(t: number) => number} The easing function.
 * @throws {RangeError} When the name is unknown.
 */
export function getEasing(name) {
  const easing = Object.prototype.hasOwnProperty.call(EASINGS, name) ? EASINGS[name] : null;
  if (!easing) {
    throw new RangeError(`Unknown easing "${name}". Known easings: ${Object.keys(EASINGS).join(', ')}`);
  }
  return easing;
}
