// Structural influence applied to a single glyph's motion.
//
// protocol/MORPHA.md section 3.3: "Energy MUST bias motion, not directly map
// to appearance."
// protocol/MORPHA.md section 3.4: "Absence MUST NOT be treated as zero" and
// absence "increases persistence".
//
// Everything in this module is pure: it computes motion parameters and never
// touches opacity, colour or any other appearance value. Keeping the
// appearance boundary explicit here is what makes the "bias motion, not
// appearance" rule enforceable rather than aspirational.

import { getFamilyProfile } from './Family.js';

/**
 * @typedef {object} MotionProfile
 * @property {number} velocity    Effective morph velocity multiplier, >= 0.
 * @property {number} resistance  Effective resistance, 0..1.
 * @property {number} persistence Multiplier on hold duration, >= 0.
 * @property {number} decay       Multiplier on fade duration, >= 0.
 * @property {number} asymmetry   0..1. Directional instability.
 * @property {number} phase       Phase offset, radians.
 */

/**
 * @typedef {object} Influence
 * @property {number} [morphVelocity]
 * @property {number} [resistance]
 * @property {number} [persistence]
 * @property {number} [direction]
 * @property {number} [phase]
 * @property {number} [decay]
 * @property {{x:number, y:number, amount:number}} [distortion] The temporal
 *   memory's decaying distortion, carried in world units.
 */

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
 * Read a finite number from a source, falling back to a default.
 *
 * @param {object} source Object to read from.
 * @param {string} key Property name.
 * @param {number} fallback Value to use when absent or non-finite.
 * @returns {number}
 */
function num(source, key, fallback) {
  const value = source?.[key];
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Resolve the motion profile for one glyph.
 *
 * The family profile provides the behavioural baseline. The glyph's own
 * `semanticWeight` composes on top: an individual symbol may resist more or
 * persist longer than its family default. The global influence then biases
 * the result, and silence raises persistence and resistance without ever
 * stopping the morph.
 *
 * @param {string} family Symbol family name.
 * @param {object} [semanticWeight] The glyph's own semantic weight.
 * @param {Influence} [influence] The global structural influence.
 * @param {number} [silenceWeight] Continuous silence weight, 0..1.
 * @returns {MotionProfile}
 */
export function resolveMotionProfile(
  family,
  semanticWeight = {},
  influence = {},
  silenceWeight = 0,
) {
  const base = getFamilyProfile(family);
  const silence = clamp(num({ silenceWeight }, 'silenceWeight', 0), 0, 1);

  // The glyph's own resistance composes with the family baseline. A glyph
  // with resistance 0.8 in a high-resistance family resists more than one
  // with resistance 0.1 in the same family.
  const ownResistance = clamp(num(semanticWeight, 'resistance', 0), 0, 1);
  const resistance = clamp(
    base.resistance * (1 + ownResistance) * 0.5
      + ownResistance * 0.5,
    0,
    1,
  );

  // The influence's resistance multiplies rather than replaces, so the
  // family's character survives.
  const influenceResistance = clamp(num(influence, 'resistance', 0), 0, 1);
  const effectiveResistance = clamp(
    resistance * (1 + influenceResistance * 0.5),
    0,
    1,
  );

  // Resistance is a divisor on velocity: it slows the morph, it never
  // reverses or halts it.
  const influenceVelocity = Math.max(
    0,
    num(influence, 'morphVelocity', 1),
  );
  const velocity = Math.max(
    0,
    (base.velocity * influenceVelocity) / (1 + effectiveResistance),
  );

  // Absence increases persistence. Silence never reads as zero.
  const silenceAffinity = clamp(num(semanticWeight, 'silenceAffinity', 0), 0, 1);
  const influencePersistence = Math.max(
    0,
    num(influence, 'persistence', 1),
  );
  const persistence = Math.max(
    0,
    base.persistence * influencePersistence * (1 + silence * silenceAffinity),
  );

  // Decay: how long the symbol takes to fade once it starts. Void lingers,
  // Flow moves on.
  const influenceDecay = Math.max(0, num(influence, 'decay', 1));
  const decay = Math.max(0, base.decay * influenceDecay);

  // Asymmetric resistance makes the morph rate depend on the sign of the
  // influence's direction. Fracture and Echo are unstable in this way; the
  // others are not.
  const direction = num(influence, 'direction', 0);
  const asymmetry = clamp(
    base.asymmetry * clamp(Math.abs(direction), 0, 1),
    0,
    1,
  );

  // The asymmetry is folded into the velocity here so the resolved profile
  // fully determines the motion. Applying it later, at the point of use,
  // would leave the profile's own velocity direction-independent and split
  // the motion rule across two places.
  const asymmetryFactor = 1 + asymmetry * Math.tanh(direction) * 0.35;

  const phase = num(influence, 'phase', 0);

  return {
    velocity: velocity * asymmetryFactor,
    resistance: effectiveResistance,
    persistence,
    decay,
    asymmetry,
    phase,
  };
}

/**
 * Resolve how far one glyph bends under the temporal memory's distortion.
 *
 * The distortion is a global memory of past sound. Each family receives it
 * differently: an Anchor holds its shape, an Echo - the family that IS
 * memory - bends the most. The glyph's own semantic weight composes on top
 * in the same way its resistance does.
 *
 * This is a geometric bend. It changes where the symbol's points are, never
 * how they look: opacity, colour and emotion are untouched.
 *
 * @param {string} family Symbol family name.
 * @param {object} [semanticWeight] The glyph's own semantic weight.
 * @param {{x?:number, y?:number, amount?:number}} [distortion] The global
 *   distortion from the temporal memory.
 * @returns {{x:number, y:number, amount:number}} The glyph's own distortion.
 */
export function resolveDistortion(family, semanticWeight = {}, distortion = {}) {
  const base = getFamilyProfile(family);

  const amount = num(distortion, 'amount', 0);
  const x = num(distortion, 'x', 0);
  const y = num(distortion, 'y', 0);

  // The family's affinity scales the bend, and the glyph's own weight
  // composes with it. A glyph that resists motion resists the bend too.
  const ownAffinity = clamp(num(semanticWeight, 'distortionAffinity', 0), 0, 1);
  const affinity = clamp(base.distortionAffinity * (0.5 + ownAffinity * 0.5), 0, 1);

  return {
    x: x * affinity,
    y: y * affinity,
    amount: amount * affinity,
  };
}

/**
 * Apply a resolved motion profile to a glyph.
 *
 * This mutates only the glyph's motion state. It deliberately does not touch
 * `currentOpacity`, `morphProgress` visibility targets, or any mesh uniform
 * that represents appearance.
 *
 * @param {object} glyph The glyph to influence.
 * @param {MotionProfile} profile Resolved motion profile.
 * @returns {object} The glyph, for chaining.
 */
export function applyInfluenceToGlyph(glyph, profile) {
  if (!glyph || typeof glyph !== 'object') return glyph;

  glyph.motionProfile = profile;
  // The effective morph rate is the profile's velocity divided by its
  // resistance. Resistance is applied here as well as in the profile so the
  // glyph's own per-frame step reflects it directly.
  const effectiveSpeed = profile.velocity / (1 + profile.resistance);
  glyph.morphSpeed = Math.max(0, effectiveSpeed);
  glyph.holdMultiplier = profile.persistence;
  glyph.decayMultiplier = profile.decay;
  glyph.phase = profile.phase;

  return glyph;
}

/**
 * Compute and apply a glyph's motion profile in one step.
 *
 * @param {object} glyph The glyph to influence.
 * @param {string} family Symbol family name.
 * @param {object} [semanticWeight] The glyph's semantic weight.
 * @param {Influence} [influence] The global structural influence.
 * @param {number} [silenceWeight] Continuous silence weight, 0..1.
 * @returns {MotionProfile} The applied profile.
 */
export function influenceGlyph(
  glyph,
  family,
  semanticWeight = {},
  influence = {},
  silenceWeight = 0,
) {
  const profile = resolveMotionProfile(
    family,
    semanticWeight,
    influence,
    silenceWeight,
  );
  applyInfluenceToGlyph(glyph, profile);
  return profile;
}
