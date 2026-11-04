/**
 * Configuration defaults and validation for MORPHA.
 *
 * `validateConfig` is a robustness gate: it rejects wrong types, out-of-range
 * numbers, `NaN` and `Infinity` with human-readable messages that name the
 * offending key. Callers should validate before using a configuration rather
 * than trusting it.
 */

/**
 * Default configuration.
 *
 * @type {Readonly<Record<string, number|boolean>>}
 */
export const DEFAULT_CONFIG = Object.freeze({
  /** Maximum number of glyphs allowed to overlap at once (integer > 0). */
  maxOverlappingGlyphs: 4,
  /** Time in seconds for a glyph to fade out (must be > 0). */
  glyphFadeTime: 5,
  /** Duration in seconds of a full morph (must be > 0). */
  morphDuration: 3,
  /** Amplitude below which input counts as silence, 0..1. */
  silenceThreshold: 0.03,
  /** Seconds of continuous silence needed to fully saturate silence weight. */
  silenceSaturationTime: 1.2,
  /** Rendered point size in pixels (must be > 0). */
  pointSize: 2,
  /** Audio sample rate in Hz (integer > 0). */
  sampleRate: 44100,
  /** Whether audio input is enabled. */
  enableAudio: true,
  /** Whether to damp motion for reduced-motion sensitivity. */
  reducedMotion: false,
});

/**
 * Check that a value is a plain object (not null, not an array).
 *
 * @param {unknown} value Candidate object.
 * @returns {boolean} True when the value is a plain object.
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Describe a value for an error message.
 *
 * @param {unknown} value Value to describe.
 * @returns {string} Short human-readable description.
 */
function describe(value) {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return String(value);
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/**
 * Validate a configuration object.
 *
 * Every key in {@link DEFAULT_CONFIG} must be present and valid. Unknown keys
 * are reported separately in `unknownKeys` — they do not make the config
 * invalid, but callers that care about typos can inspect them.
 *
 * @param {unknown} cfg Configuration to validate.
 * @returns {{ valid: boolean, errors: string[], unknownKeys: string[] }}
 *   `errors` contains one human-readable message per problem, each naming the
 *   offending key.
 */
export function validateConfig(cfg) {
  /** @type {string[]} */
  const errors = [];

  if (!isPlainObject(cfg)) {
    return {
      valid: false,
      errors: [`Configuration must be a plain object, received ${describe(cfg)}.`],
      unknownKeys: [],
    };
  }

  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (!Object.prototype.hasOwnProperty.call(cfg, key)) {
      errors.push(`Missing required configuration key "${key}".`);
      continue;
    }

    const value = cfg[key];

    switch (key) {
      case 'maxOverlappingGlyphs': {
        if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
          errors.push(
            `Configuration key "${key}" must be an integer greater than 0, received ${describe(value)}.`
          );
        }
        break;
      }
      case 'glyphFadeTime': {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(
            `Configuration key "${key}" must be a finite number of seconds greater than 0, received ${describe(value)}.`
          );
        }
        break;
      }
      case 'morphDuration': {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(
            `Configuration key "${key}" must be a finite number of seconds greater than 0, received ${describe(value)}.`
          );
        }
        break;
      }
      case 'silenceThreshold': {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          errors.push(
            `Configuration key "${key}" must be a finite number between 0 and 1, received ${describe(value)}.`
          );
        }
        break;
      }
      case 'silenceSaturationTime': {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(
            `Configuration key "${key}" must be a finite number of seconds greater than 0, received ${describe(value)}.`
          );
        }
        break;
      }
      case 'pointSize': {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(
            `Configuration key "${key}" must be a finite number greater than 0, received ${describe(value)}.`
          );
        }
        break;
      }
      case 'sampleRate': {
        if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 192000) {
          errors.push(
            `Configuration key "${key}" must be an integer between 1 and 192000 Hz, received ${describe(value)}.`
          );
        }
        break;
      }
      case 'enableAudio': {
        if (typeof value !== 'boolean') {
          errors.push(`Configuration key "${key}" must be a boolean, received ${describe(value)}.`);
        }
        break;
      }
      case 'reducedMotion': {
        if (typeof value !== 'boolean') {
          errors.push(`Configuration key "${key}" must be a boolean, received ${describe(value)}.`);
        }
        break;
      }
      default:
        break;
    }
  }

  const unknownKeys = Object.keys(cfg).filter((key) => !(key in DEFAULT_CONFIG));

  return { valid: errors.length === 0, errors, unknownKeys };
}

/**
 * Merge a partial configuration over the defaults and validate the result.
 *
 * @param {Record<string, unknown>} [cfg] Partial configuration.
 * @returns {Readonly<Record<string, number|boolean>>} A frozen, validated
 *   configuration.
 * @throws {TypeError} When the merged configuration is invalid.
 */
export function resolveConfig(cfg = {}) {
  if (!isPlainObject(cfg)) {
    throw new TypeError(`Configuration must be a plain object, received ${describe(cfg)}.`);
  }
  const merged = { ...DEFAULT_CONFIG, ...cfg };
  const { valid, errors } = validateConfig(merged);
  if (!valid) {
    throw new TypeError(`Invalid configuration:\n - ${errors.join('\n - ')}`);
  }
  return Object.freeze(merged);
}
