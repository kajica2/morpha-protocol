/**
 * AudioMap — maps audio features onto STRUCTURAL influence.
 *
 * MORPHA axiom: "Energy MUST bias motion, not directly map to appearance."
 * A volume-to-brightness mapping is therefore not a structural mapping. This
 * module instead derives a small set of continuous structural parameters that
 * a renderer can use to decide how a glyph evolves:
 *
 *   morphVelocity  how fast the morph advances (>= 0, never hard zero)
 *   resistance     how strongly the glyph resists being changed (0..1)
 *   persistence    how long the glyph holds its current form (0..1)
 *   direction      signed push of the morph (-1..1)
 *   phase          continuous phase offset driven by the sound (radians)
 *   decay          decay-rate influence (0..1)
 *   emotionalTone  signed overall emotional register (-1..1)
 *
 * Two protocol rules shape the implementation:
 *
 *  1. "Silence is input." Silence is not the absence of an answer, it is a
 *     meaningful state: it raises persistence and resistance, slows the morph
 *     without stopping it, and adds a slow inward phase drift. It is blended
 *     in through the silence weight, never switched on instantly, and never
 *     identical to neutral loud sound.
 *  2. "Never cut, only morph." Every output is continuous in its inputs. The
 *     signed direction is smoothed so a spectral reversal eases through zero
 *     instead of jumping from one sign to the other.
 *
 * The module is intentionally dependency-free (no imports) so it can be
 * unit-tested in isolation and cannot create coupling with other layers.
 */

/** Amplitude below which the energy gate considers the input absent. */
const ENERGY_GATE = 0.02;

/** Energy at which the gate is fully open. */
const ENERGY_GATE_FULL = 0.12;

/** Hz of centroid travel that maps to a full-scale signed change. */
const CENTROID_SCALE_HZ = 1200;

/** Lower reference frequency (Hz) used to normalise spectral brightness. */
const BRIGHTNESS_LO_HZ = 80;

/** Upper reference frequency (Hz) used to normalise spectral brightness. */
const BRIGHTNESS_HI_HZ = 6000;

/** Morph velocity contributed by sound alone (per second, arbitrary units). */
const MORPH_BASE = 0.18;

/** Additional morph velocity from energy. */
const MORPH_ENERGY = 0.55;

/** Additional morph velocity from spectral change. */
const MORPH_FLUX = 0.45;

/** Morph velocity during silence: slowed, but never cut to zero. */
const SILENCE_MORPH_VELOCITY = 0.1;

/** Resistance during silence (glyph holds its form). */
const SILENCE_RESISTANCE = 0.85;

/** Persistence during silence (MED-001: decay time grows with silence weight). */
const SILENCE_PERSISTENCE = 0.9;

/** Decay-rate influence during silence (slow decay). */
const SILENCE_DECAY = 0.15;

/** Signed inward push contributed by silence. */
const SILENCE_DIRECTION = -0.15;

/** Signed emotional register contributed by silence (dim, not neutral). */
const SILENCE_EMOTIONAL = -0.2;

/** Phase drift (rad/s) contributed by sound. */
const PHASE_BASE = 0.3;

/** Additional phase drift from energy. */
const PHASE_ENERGY = 0.8;

/** Additional phase drift from spectral change. */
const PHASE_FLUX = 0.5;

/** Phase drift (rad/s) during silence: slow, inward, never still. */
const SILENCE_PHASE_RATE = -0.12;

/** Time constant (seconds) of the direction smoothing filter. */
const DIRECTION_TAU = 0.08;

/** Default frame delta (seconds) used when no elapsed time is supplied. */
const DEFAULT_DELTA = 1 / 60;

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
 * Clamps a value into [0, 1]; non-finite input collapses to 0.
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return clamp(value, 0, 1);
}

/**
 * Clamps a value into [-1, 1]; non-finite input collapses to 0.
 * @param {number} value
 * @returns {number}
 */
function clampSigned(value) {
  return clamp(value, -1, 1);
}

/**
 * Reads a finite number from a possibly malformed container.
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
 * Smoothstep between two edges.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} value
 * @returns {number} A value in 0..1.
 */
function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Normalises the incoming features into a safe, finite, bounded shape.
 *
 * Accepts anything: `null`, arrays, strings, NaN/Infinity members. Unknown
 * or malformed members fall back to zero.
 *
 * @param {unknown} features
 * @returns {{amp:number, low:number, mid:number, high:number, centroid:number, flux:number, rms:number, silenceWeight:number, hasSilenceWeight:boolean}}
 */
function sanitizeFeatures(features) {
  const source = features && typeof features === 'object' && !Array.isArray(features) ? features : {};

  const amp = clamp01(readNumber(source, 'amp', 0));
  const low = clamp01(readNumber(source, 'low', 0));
  const mid = clamp01(readNumber(source, 'mid', 0));
  const high = clamp01(readNumber(source, 'high', 0));
  const centroid = clamp(readNumber(source, 'centroid', 0), 0, 24000);
  const flux = clamp01(readNumber(source, 'flux', 0));
  const rms = clamp01(readNumber(source, 'rms', 0));

  const rawSilence = readNumber(source, 'silenceWeight', NaN);
  const hasSilenceWeight = Number.isFinite(rawSilence);
  const silenceWeight = hasSilenceWeight ? clamp01(rawSilence) : 0;

  return {
    amp,
    low,
    mid,
    high,
    centroid,
    flux,
    rms,
    silenceWeight,
    hasSilenceWeight,
  };
}

/**
 * Maps audio features onto continuous structural influence.
 *
 * @param {object} features Feature object (amp, low, mid, high, centroid, flux,
 *   rms, and optionally `silenceWeight` in 0..1). Malformed input is tolerated.
 * @param {{previous?:object|null, elapsed?:number}} [options]
 *   `previous` may carry `centroid` (for signed spectral change), `direction`
 *   (for temporal smoothing) and `phase` (for phase accumulation).
 *   `elapsed` is the frame delta in seconds.
 * @returns {{morphVelocity:number, resistance:number, persistence:number, direction:number, phase:number, decay:number, emotionalTone:number}}
 */
export function mapAudioToInfluence(features, { previous = null, elapsed = 0 } = {}) {
  const f = sanitizeFeatures(features);
  const prev = previous && typeof previous === 'object' ? previous : null;

  const dt = Math.max(0, readNumber({ elapsed }, 'elapsed', 0));
  const step = dt > 0 ? dt : DEFAULT_DELTA;

  // ---- silence weight -------------------------------------------------
  // An explicit weight always wins. Without one, a signal with essentially
  // no energy IS silence: absence of sound is meaningful input.
  const energy = f.amp;
  const presence = smoothstep(ENERGY_GATE, ENERGY_GATE_FULL, energy);
  const implicitSilence = 1 - presence;
  const silenceWeight = f.hasSilenceWeight ? f.silenceWeight : implicitSilence;

  // ---- signed spectral change -----------------------------------------
  const prevCentroid = readNumber(prev, 'centroid', NaN);
  const centroidDelta = Number.isFinite(prevCentroid) ? f.centroid - prevCentroid : 0;
  const signedChange = Math.tanh(centroidDelta / CENTROID_SCALE_HZ);
  // No energy means no meaningful spectral movement to read a direction from.
  const directionTarget = signedChange * presence;

  const prevDirection = readNumber(prev, 'direction', NaN);
  const k = 1 - Math.exp(-step / DIRECTION_TAU);
  const smoothedDirection = Number.isFinite(prevDirection)
    ? prevDirection + (directionTarget - prevDirection) * k
    : directionTarget;

  // ---- spectral tilt and brightness -----------------------------------
  const tilt = clampSigned((f.high - f.low) * 2);
  const brightness = clamp01(
    Math.log2(Math.max(f.centroid, BRIGHTNESS_LO_HZ) / BRIGHTNESS_LO_HZ)
      / Math.log2(BRIGHTNESS_HI_HZ / BRIGHTNESS_LO_HZ),
  );

  // ---- influence while sound is present --------------------------------
  const soundMorphVelocity = MORPH_BASE + MORPH_ENERGY * energy + MORPH_FLUX * f.flux;
  const soundResistance = clamp01(0.55 - 0.25 * energy - 0.2 * f.flux);
  const soundPersistence = clamp01(0.35 + 0.3 * (1 - f.flux) + 0.1 * (1 - energy));
  const soundDecay = clamp01(0.45 + 0.35 * f.flux + 0.2 * energy);
  const soundPhaseRate = PHASE_BASE + PHASE_ENERGY * energy + PHASE_FLUX * f.flux;
  const soundEmotional = clampSigned(
    0.55 * tilt * presence + 0.3 * (brightness - 0.5) * presence,
  );

  // ---- influence while silence holds ----------------------------------
  const silenceMorphVelocity = SILENCE_MORPH_VELOCITY;
  const silenceResistance = SILENCE_RESISTANCE;
  const silencePersistence = SILENCE_PERSISTENCE;
  const silenceDecay = SILENCE_DECAY;
  const silencePhaseRate = SILENCE_PHASE_RATE;

  // ---- blend: silence is blended in, never switched on ---------------
  const w = clamp01(silenceWeight);
  const morphVelocity = Math.max(
    0.02,
    soundMorphVelocity * (1 - w) + silenceMorphVelocity * w,
  );
  const resistance = clamp01(soundResistance * (1 - w) + SILENCE_RESISTANCE * w);
  const persistence = clamp01(soundPersistence * (1 - w) + SILENCE_PERSISTENCE * w);
  const decay = clamp01(soundDecay * (1 - w) + SILENCE_DECAY * w);
  const emotionalTone = clampSigned(soundEmotional * (1 - w) + SILENCE_EMOTIONAL * w);
  const direction = clampSigned(smoothedDirection * (1 - w) + SILENCE_DIRECTION * w);

  // Silence keeps a slow inward drift instead of freezing the phase.
  const phaseRate = soundPhaseRate * (1 - w) + silencePhaseRate * w;

  const prevPhase = readNumber(prev, 'phase', NaN);
  const phaseBase = Number.isFinite(prevPhase) ? prevPhase : 0;
  const phase = phaseBase + phaseRate * dt;

  return {
    morphVelocity,
    resistance,
    persistence,
    direction,
    phase,
    decay,
    emotionalTone,
  };
}

/**
 * Creates a stateful mapper that carries centroid, direction and phase
 * between frames, so callers do not have to thread state themselves.
 *
 * @param {{tau?:number}} [options] `tau` is the direction smoothing constant
 *   in seconds (default 0.08).
 * @returns {{update:(features:object, elapsed?:number)=>object, reset:()=>void, getState:()=>object}}
 */
export function createInfluenceMapper({ tau = DIRECTION_TAU } = {}) {
  const tauValue = Math.max(1e-3, readNumber({ tau }, 'tau', DIRECTION_TAU));
  let centroid = NaN;
  let direction = NaN;
  let phase = 0;
  let initialised = false;

  return {
    /**
     * Maps one frame of features, carrying state forward.
     * @param {object} features
     * @param {number} [elapsed] Frame delta in seconds.
     * @returns {object} The influence object for this frame.
     */
    update(features, elapsed = DEFAULT_DELTA) {
      const f = sanitizeFeatures(features);
      const previous = initialised ? { centroid, direction, phase } : null;
      const influence = mapAudioToInfluence(f, { previous, elapsed });
      centroid = f.centroid;
      direction = influence.direction;
      phase = influence.phase;
      initialised = true;
      return influence;
    },

    /** Clears the carried state. */
    reset() {
      centroid = NaN;
      direction = NaN;
      phase = 0;
      initialised = false;
    },

    /**
     * Returns the carried state (useful for tests and debugging).
     * @returns {{centroid:number, direction:number, phase:number}}
     */
    getState() {
      return { centroid, direction, phase };
    },
  };
}

/**
 * Blends two influence objects. Useful when composing influence from more
 * than one source without ever producing a hard cut.
 *
 * @param {object} a
 * @param {object} b
 * @param {number} t Blend factor in 0..1 (0 = a, 1 = b).
 * @returns {{morphVelocity:number, resistance:number, persistence:number, direction:number, phase:number, decay:number, emotionalTone:number}}
 */
export function blendInfluence(a, b, t) {
  const factor = clamp01(readNumber({ t }, 't', 0));
  const pick = (key, min, max) => clamp(
    readNumber(a, key, 0) * (1 - factor) + readNumber(b, key, 0) * factor,
    min,
    max,
  );

  return {
    morphVelocity: Math.max(0.02, pick('morphVelocity', 0, Number.MAX_SAFE_INTEGER)),
    resistance: pick('resistance', 0, 1),
    persistence: pick('persistence', 0, 1),
    direction: pick('direction', -1, 1),
    phase: pick('phase', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    decay: pick('decay', 0, 1),
    emotionalTone: pick('emotionalTone', -1, 1),
  };
}
