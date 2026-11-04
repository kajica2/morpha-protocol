/**
 * Silence — treats absence of sound as a first-class, meaningful signal.
 *
 * Two levels are exported:
 *  - a pure detector factory (`createSilenceDetector`) that takes an amplitude
 *    value directly, so it can be unit-tested without any browser;
 *  - the historical module-level API (`updateSilence`, `getSilenceWeight`,
 *    `isSilent`) which reads the live microphone through the Analyzer and
 *    keeps its original signatures.
 *
 * The detector uses HYSTERESIS: silence is entered below `threshold` and only
 * left again once the amplitude rises above `threshold + hysteresis`. That
 * stops the silence state from chattering on a live microphone when the
 * amplitude hovers around the threshold.
 *
 * The silence weight rises smoothly towards 1 while silence persists and
 * falls smoothly when sound returns — it is never a hard 0/1 step.
 */

import { getAudioEnergy } from './Analyzer.js';

/** Amplitude below which input counts as silence. */
export const SILENCE_THRESHOLD = 0.03;

/** Seconds of continuous silence needed to fully saturate the silence weight. */
export const SILENCE_SATURATION_TIME = 1.2;

/** Extra amplitude margin required to leave the silence state. */
export const SILENCE_HYSTERESIS = 0.01;

/** Smoothing time constant (seconds) while the silence weight rises. */
const RISE_TAU = 0.25;

/** Smoothing time constant (seconds) while the silence weight falls. */
const FALL_TAU = 0.35;

/**
 * Clamps a value into [min, max]; non-finite input collapses to `min`.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * Returns `value` when it is a finite number, otherwise `fallback`.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Creates a hysteresis-aware silence detector.
 *
 * @param {{threshold?:number, saturationTime?:number, hysteresis?:number}} [options]
 * @returns {{update:(amp:number, deltaTime:number)=>{isSilent:boolean, weight:number, duration:number, sinceLastSound:number}, peek:(amp:number)=>boolean, reset:()=>void, getWeight:()=>number, getDuration:()=>number, getIsSilent:()=>boolean}}
 */
export function createSilenceDetector({
  threshold = SILENCE_THRESHOLD,
  saturationTime = SILENCE_SATURATION_TIME,
  hysteresis = SILENCE_HYSTERESIS,
} = {}) {
  const thresholdValue = Math.max(0, finite(threshold, SILENCE_THRESHOLD));
  const saturation = Math.max(1e-3, finite(saturationTime, SILENCE_SATURATION_TIME));
  const margin = Math.max(0, finite(hysteresis, SILENCE_HYSTERESIS));

  let silent = false;
  let silenceTime = 0;
  let timeSinceSound = 0;
  let weight = 0;

  return {
    /**
     * Advances the detector by one frame.
     *
     * @param {number} amp Normalised amplitude in 0..1.
     * @param {number} deltaTime Elapsed time in seconds.
     * @returns {{isSilent:boolean, weight:number, duration:number, sinceLastSound:number}}
     *   `weight` is the smoothed silence weight (0..1), `duration` the continuous
     *   silence time in seconds and `sinceLastSound` the time since audible input.
     */
    update(amp, deltaTime) {
      const amplitude = clamp(finite(amp, 0), 0, 1);
      const dt = clamp(finite(deltaTime, 0), 0, 1);

      if (silent) {
        // Only a clearly audible signal ends the silence state.
        if (amplitude > thresholdValue + margin) silent = false;
      } else if (amplitude < thresholdValue) {
        silent = true;
        silenceTime = 0;
      }

      const audible = amplitude >= thresholdValue;
      if (audible) {
        timeSinceSound = 0;
      } else {
        timeSinceSound += dt;
      }

      if (silent) {
        silenceTime += dt;
      } else {
        silenceTime = 0;
      }

      // Target weight follows the MED-001 model (SD / saturation), the exposed
      // weight is an exponentially smoothed follower of that target so it can
      // never step discontinuously.
      const target = silent ? clamp(silenceTime / saturation, 0, 1) : 0;
      const tau = target > weight ? RISE_TAU : FALL_TAU;
      const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
      weight = clamp(weight + (target - weight) * k, 0, 1);

      return {
        isSilent: silent,
        weight,
        duration: silenceTime,
        sinceLastSound: timeSinceSound,
      };
    },

    /**
     * Returns the silence state that the given amplitude would produce,
     * without advancing any timers.
     *
     * @param {number} amp Normalised amplitude in 0..1.
     * @returns {boolean} True when the input would be considered silent.
     */
    peek(amp) {
      const amplitude = clamp(finite(amp, 0), 0, 1);
      if (silent) return !(amplitude > thresholdValue + margin);
      return amplitude < thresholdValue;
    },

    /** Resets the detector to its initial state. */
    reset() {
      silent = false;
      silenceTime = 0;
      timeSinceSound = 0;
      weight = 0;
    },

    /** @returns {number} The current smoothed silence weight (0..1). */
    getWeight() {
      return weight;
    },

    /** @returns {number} The current continuous silence duration in seconds. */
    getDuration() {
      return silenceTime;
    },

    /** @returns {boolean} The current silence state. */
    getIsSilent() {
      return silent;
    },
  };
}

/** The detector backing the module-level API. */
const detector = createSilenceDetector();

/**
 * Advances the silence state using the live microphone amplitude.
 *
 * @param {number} deltaTime Elapsed time in seconds.
 * @returns {number} Continuous silence duration in seconds (capped at the saturation time).
 */
export function updateSilence(deltaTime) {
  const { amp } = getAudioEnergy();
  const state = detector.update(amp, deltaTime);
  return Math.min(state.duration, SILENCE_SATURATION_TIME);
}

/**
 * Returns the smoothed silence weight (0..1) of the live input.
 *
 * @returns {number}
 */
export function getSilenceWeight() {
  return detector.getWeight();
}

/**
 * Returns whether the live input currently counts as silence.
 *
 * @returns {boolean}
 */
export function isSilent() {
  const { amp } = getAudioEnergy();
  return detector.peek(amp);
}
