/**
 * InfluenceMemory — temporal memory for MORPHA's influence stream.
 *
 * A sharp transient (a clap, a percussive hit) influences the morph only
 * while it is sounding: the instant the sound stops, the influence snaps
 * back and the event leaves no trace. This module gives the field a MEMORY.
 * Past sound leaves a decaying geometric distortion that keeps bending the
 * glyph after the sound has ended.
 *
 * Two mechanisms, both computed from the elapsed delta so the result is
 * frame-rate independent:
 *
 *  1. **Asymmetric envelope.** The live influence is blended into a
 *     remembered state with a fast ATTACK (a new event registers quickly)
 *     and a slow RELEASE (an old event lingers). Both time constants are
 *     independently configurable.
 *
 *  2. **Bounded signed distortion.** The remembered bend is a signed scalar
 *     resolved into a 2D offset plus a signed magnitude, clamped to
 *     `[-maxDistortion, maxDistortion]`. Once the event ends it decays
 *     exponentially toward zero — gradually, never in a single frame.
 *
 * Protocol rules honoured here:
 *
 *  - "Never cut, only morph." Every output is continuous in its inputs, and
 *    the morph velocity floor of `0.02` is never lowered by the memory.
 *  - "Silence is input." A frame without energy is not the absence of an
 *    answer: it is the signal that the memory must release, slowly, back
 *    toward its neutral baseline.
 *  - "Energy MUST bias motion, not directly map to appearance." The module
 *    emits motion state only — it never invents a visual channel.
 *
 * The module is intentionally dependency-free: no imports at all, no WebGL,
 * no browser globals, no audio dependency. It can therefore be unit-tested
 * in isolation and cannot create coupling with other layers.
 */

/**
 * Minimum morph velocity the field may ever report. Matches the floor the
 * upstream mapper already enforces: the memory must never freeze the morph.
 *
 * @type {number}
 */
export const MIN_MORPH_VELOCITY = 0.02;

/**
 * The neutral baseline the memory decays toward. This is what `reset()`
 * restores and what the remembered state approaches while silence holds.
 *
 * The morph velocity sits on the protocol floor rather than at zero: even a
 * field with nothing to remember keeps breathing.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const NEUTRAL_INFLUENCE = Object.freeze({
  morphVelocity: MIN_MORPH_VELOCITY,
  resistance: 0,
  persistence: 0,
  direction: 0,
  phase: 0,
  decay: 0,
  emotionalTone: 0,
});

/**
 * Default memory configuration.
 *
 * `attack` and `release` are time constants in seconds; `strength` is the
 * gain applied to a fully saturated event; `maxDistortion` is the hard
 * ceiling of the signed distortion magnitude.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const DEFAULT_MEMORY_CONFIG = Object.freeze({
  /** Time constant (seconds) for a new event to register. */
  attack: 0.08,
  /** Time constant (seconds) for an old event to fade out. */
  release: 1.6,
  /** Gain applied to the remembered bend before it becomes a distortion. */
  strength: 0.35,
  /** Hard ceiling of the signed distortion magnitude. */
  maxDistortion: 1,
});

/**
 * Morph rate of a frame that carries no energy. Below this the frame is
 * treated as silence and the memory releases.
 */
const ENERGY_MOTION_FLOOR = 0.1;

/** Morph rate at which the motion channel alone counts as fully energetic. */
const ENERGY_MOTION_CEILING = 0.28;

/** Decay influence of a resting frame. */
const ENERGY_DECAY_FLOOR = 0.15;

/** Decay influence at which the decay channel alone counts as fully energetic. */
const ENERGY_DECAY_CEILING = 0.3;

/** Default frame delta (seconds) used when the caller supplies none. */
const DEFAULT_DELTA = 1 / 60;

/** Influence fields that are blended into the remembered state. */
const BLENDED_FIELDS = ['morphVelocity', 'resistance', 'persistence', 'direction', 'decay', 'emotionalTone'];

/**
 * Clamps a value into [min, max]; non-finite input collapses to `min`.
 *
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
 * Clamps a value into [0, 1]; non-finite input collapses to 0.
 *
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return clamp(value, 0, 1);
}

/**
 * Clamps a value into [-1, 1]; non-finite input collapses to 0.
 *
 * @param {number} value
 * @returns {number}
 */
function clampSigned(value) {
  return clamp(value, -1, 1);
}

/**
 * Reads a finite number from a possibly malformed container.
 *
 * @param {unknown} source
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function readNumber(source, key, fallback) {
  if (!source || typeof source !== 'object') return fallback;
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Whether a value is a plain object (not null, not an array).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalises an incoming influence into a safe, finite, bounded shape.
 *
 * Accepts anything: `null`, arrays, strings, `NaN`/`Infinity` members.
 * Unknown or malformed members fall back to the neutral baseline. The morph
 * velocity is floored at {@link MIN_MORPH_VELOCITY}: the memory may never
 * lower the protocol floor.
 *
 * @param {unknown} influence
 * @returns {{morphVelocity:number, resistance:number, persistence:number, direction:number, phase:number, decay:number, emotionalTone:number}}
 */
function sanitizeInfluence(influence) {
  const source = isPlainObject(influence) ? influence : {};
  const morphVelocity = Math.max(
    MIN_MORPH_VELOCITY,
    clamp(readNumber(source, 'morphVelocity', MIN_MORPH_VELOCITY), MIN_MORPH_VELOCITY, 1e6),
  );

  return {
    morphVelocity,
    resistance: clamp01(readNumber(source, 'resistance', 0)),
    persistence: clamp01(readNumber(source, 'persistence', 0)),
    direction: clampSigned(readNumber(source, 'direction', 0)),
    phase: clamp(readNumber(source, 'phase', 0), -1e6, 1e6),
    decay: clamp01(readNumber(source, 'decay', 0)),
    emotionalTone: clampSigned(readNumber(source, 'emotionalTone', 0)),
  };
}

/**
 * Energy carried by a frame, 0..1.
 *
 * Energy is read from the two structural channels that move when sound is
 * present — the morph rate and the decay rate — and never from an
 * appearance channel. A frame counts as silent only while both channels sit
 * at their resting values, so silence is a real input rather than a guess.
 *
 * @param {object} influence Sanitised influence.
 * @returns {number} Energy in 0..1.
 */
function computeEnergy(influence) {
  const motion = clamp01(
    (influence.morphVelocity - ENERGY_MOTION_FLOOR) / (ENERGY_MOTION_CEILING - ENERGY_MOTION_FLOOR),
  );
  const decay = clamp01(
    (influence.decay - ENERGY_DECAY_FLOOR) / (ENERGY_DECAY_CEILING - ENERGY_DECAY_FLOOR),
  );
  return Math.max(motion, decay);
}

/**
 * The signed push of a frame, -1..1.
 *
 * The morph direction is the primary sign. When the direction is neutral the
 * signed emotional register takes over, so an energetic frame always leaves
 * a trace instead of silently evaporating.
 *
 * @param {object} influence Sanitised influence.
 * @returns {number} Signed push in -1..1.
 */
function signedPush(influence) {
  if (influence.direction !== 0) return influence.direction;
  return influence.emotionalTone;
}

/**
 * Reads a frame delta in seconds. Undefined falls back to the default frame;
 * anything non-finite or negative means no time passed.
 *
 * @param {unknown} deltaTime
 * @returns {number} Delta in seconds, >= 0.
 */
function readDelta(deltaTime) {
  if (deltaTime === undefined || deltaTime === null) return DEFAULT_DELTA;
  if (typeof deltaTime !== 'number' || !Number.isFinite(deltaTime)) return 0;
  return Math.max(0, deltaTime);
}

/**
 * Exponential approach of `current` toward `target`.
 *
 * The retention factor is `exp(-dt / tau)`, so two half steps compose into
 * exactly one full step: the result never depends on the frame rate.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} retention `exp(-dt / tau)`, in 0..1.
 * @returns {number}
 */
function approach(current, target, retention) {
  return target + (current - target) * retention;
}

/**
 * Merges and validates a memory configuration.
 *
 * @param {Record<string, unknown>} [config] Partial configuration.
 * @returns {Readonly<Record<string, number>>} A frozen, validated config.
 * @throws {TypeError} When the config or one of its values is invalid.
 */
function resolveMemoryConfig(config = {}) {
  if (!isPlainObject(config)) {
    throw new TypeError('InfluenceMemory configuration must be a plain object.');
  }

  const attack = readNumber(config, 'attack', DEFAULT_MEMORY_CONFIG.attack);
  const release = readNumber(config, 'release', DEFAULT_MEMORY_CONFIG.release);
  const strength = readNumber(config, 'strength', DEFAULT_MEMORY_CONFIG.strength);
  const maxDistortion = readNumber(config, 'maxDistortion', DEFAULT_MEMORY_CONFIG.maxDistortion);

  if (!(attack > 0)) {
    throw new TypeError('InfluenceMemory config key "attack" must be a finite number greater than 0.');
  }
  if (!(release > 0)) {
    throw new TypeError('InfluenceMemory config key "release" must be a finite number greater than 0.');
  }
  if (strength < 0) {
    throw new TypeError('InfluenceMemory config key "strength" must be a finite number of at least 0.');
  }
  if (!(maxDistortion > 0)) {
    throw new TypeError('InfluenceMemory config key "maxDistortion" must be a finite number greater than 0.');
  }

  return Object.freeze({ attack, release, strength, maxDistortion });
}

/**
 * A temporal memory layer over MORPHA's influence stream.
 *
 * The memory is pure: it holds no timers, touches no browser globals and
 * reads no audio. The caller feeds it an already-mapped influence and the
 * elapsed frame delta, and receives back a remembered influence plus a
 * bounded signed distortion for the glyph geometry.
 */
export class InfluenceMemory {
  /**
   * @param {Record<string, unknown>} [config] Partial configuration.
   *   `attack` — seconds for a new event to register (default 0.08).
   *   `release` — seconds for an old event to fade (default 1.6).
   *   `strength` — gain applied to a saturated event (default 0.35).
   *   `maxDistortion` — ceiling of the signed distortion (default 1).
   * @throws {TypeError} When the configuration is invalid.
   */
  constructor(config = {}) {
    /** @type {Readonly<Record<string, number>>} Frozen configuration in use. */
    this.config = resolveMemoryConfig(config);

    /** @type {Record<string, number>} Remembered influence fields. */
    this._influence = { ...NEUTRAL_INFLUENCE };

    /** Remembered signed bend, in distortion units. */
    this._bend = 0;

    /** Phase of the most recent frame (an accumulator, never rewritten). */
    this._phase = 0;

    this._disposed = false;
  }

  /**
   * Attack time constant in seconds: how fast a new event registers.
   *
   * @returns {number} Attack time constant.
   */
  get attack() {
    return this.config.attack;
  }

  /**
   * Release time constant in seconds: how slowly an old event fades.
   *
   * @returns {number} Release time constant.
   */
  get release() {
    return this.config.release;
  }

  /**
   * The configuration in use.
   *
   * @returns {Readonly<Record<string, number>>} Frozen configuration.
   */
  getConfig() {
    return this.config;
  }

  /**
   * Folds one frame of influence into the memory.
   *
   * While the frame carries energy the live influence is blended into the
   * remembered state with the attack constant. Once the frame falls silent
   * the remembered state releases back toward the neutral baseline with the
   * release constant, so an old event lingers instead of vanishing.
   *
   * The remembered bend follows the same envelope and is the source of the
   * signed distortion: it is clamped to `[-maxDistortion, maxDistortion]` and
   * resolved along the axis the morph is currently travelling.
   *
   * @param {object} influence Mapped influence: `morphVelocity`,
   *   `resistance`, `persistence`, `direction`, `phase`, `decay` and
   *   `emotionalTone`. Malformed input is tolerated.
   * @param {number} [deltaTime] Elapsed frame time in seconds.
   * @returns {{influence: {morphVelocity:number, resistance:number, persistence:number, direction:number, phase:number, decay:number, emotionalTone:number}, distortion: {x:number, y:number, amount:number}}}
   *   `influence` is the remembered influence (motion state only) and
   *   `distortion` is the bounded signed bend for the glyph geometry.
   * @throws {Error} When the memory has been disposed.
   */
  update(influence, deltaTime) {
    this._assertUsable();

    const dt = readDelta(deltaTime);
    const live = sanitizeInfluence(influence);
    const energy = computeEnergy(live);
    const energetic = energy > 0;

    // Attack while the frame carries energy, release once it is gone.
    const tau = energetic ? this.config.attack : this.config.release;
    const retention = Math.exp(-dt / tau);

    // 1. Remembered influence: fast toward the live frame, slow back to the
    //    neutral baseline. The phase is an accumulator rather than a memory
    //    field, so it is carried through untouched and never rewinds.
    const target = energetic ? live : NEUTRAL_INFLUENCE;
    for (const field of BLENDED_FIELDS) {
      this._influence[field] = approach(this._influence[field], target[field], retention);
    }
    this._phase = live.phase;

    // 2. Remembered bend: the signed geometric trace of the event. An
    //    energetic frame with no directional information still registers,
    //    pointing along the positive morph axis.
    const push = signedPush(live);
    const bendTarget = energetic ? (push !== 0 ? push : 1) * energy : 0;
    this._bend = approach(this._bend, bendTarget, retention);

    return {
      influence: this._influenceSnapshot(),
      distortion: this._distortion(),
    };
  }

  /**
   * Clears the memory back to the neutral baseline.
   *
   * @returns {this} The memory, for chaining.
   */
  reset() {
    this._influence = { ...NEUTRAL_INFLUENCE };
    this._bend = 0;
    this._phase = 0;
    return this;
  }

  /**
   * A snapshot of the remembered state.
   *
   * The distortion fields are exposed both nested and flat so a caller can
   * read `state.distortion.amount` or `state.amount` interchangeably.
   *
   * @returns {{influence: {morphVelocity:number, resistance:number, persistence:number, direction:number, phase:number, decay:number, emotionalTone:number}, distortion: {x:number, y:number, amount:number}, x:number, y:number, amount:number}}
   *   A fresh copy — mutating it never affects the live state.
   */
  getState() {
    const distortion = this._distortion();
    return {
      influence: this._influenceSnapshot(),
      distortion,
      x: distortion.x,
      y: distortion.y,
      amount: distortion.amount,
    };
  }

  /**
   * Releases the remembered state. The memory cannot be used afterwards.
   *
   * @returns {this} The memory, for chaining.
   */
  dispose() {
    this.reset();
    this._disposed = true;
    return this;
  }

  /**
   * The remembered influence, with the morph velocity floor enforced.
   *
   * @returns {{morphVelocity:number, resistance:number, persistence:number, direction:number, phase:number, decay:number, emotionalTone:number}}
   */
  _influenceSnapshot() {
    return {
      morphVelocity: Math.max(MIN_MORPH_VELOCITY, this._influence.morphVelocity),
      resistance: clamp01(this._influence.resistance),
      persistence: clamp01(this._influence.persistence),
      direction: clampSigned(this._influence.direction),
      phase: this._phase,
      decay: clamp01(this._influence.decay),
      emotionalTone: clampSigned(this._influence.emotionalTone),
    };
  }

  /**
   * The bounded signed distortion for the glyph geometry.
   *
   * `amount` is the signed magnitude of the bend, clamped to
   * `[-maxDistortion, maxDistortion]`. The bend is resolved along the axis
   * the morph is currently travelling (the current phase), so `x` and `y`
   * are the components of a vector whose length is `|amount|`.
   *
   * @returns {{x:number, y:number, amount:number}}
   */
  _distortion() {
    const limit = this.config.maxDistortion;
    const amount = clamp(this._bend * this.config.strength, -limit, limit);
    return {
      x: amount * Math.cos(this._phase),
      y: amount * Math.sin(this._phase),
      amount,
    };
  }

  /**
   * Throw when the memory can no longer be used.
   *
   * @throws {Error} When the memory has been disposed.
   */
  _assertUsable() {
    if (this._disposed) {
      throw new Error('InfluenceMemory has been disposed and can no longer be used.');
    }
  }
}

/**
 * Factory for a new memory instance.
 *
 * @param {Record<string, unknown>} [config] Partial configuration.
 * @returns {InfluenceMemory} A new memory.
 */
export function createInfluenceMemory(config = {}) {
  return new InfluenceMemory(config);
}
