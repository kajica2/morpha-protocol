// Per-family motion profiles.
//
// protocol/MORPHA.md section 4 defines five symbol families, each with a
// distinct behavioural signature:
//
//   Anchor   - presence, grounding, identity. High resistance, low velocity.
//   Flow     - movement, time, becoming. Low resistance, directional continuity.
//   Fracture - rupture, decision, conflict. Asymmetric resistance, instability.
//   Void     - silence, waiting, surrender. Minimal mass, long decay, dominance
//              through absence.
//   Echo     - memory, reflection, longing. Delayed repetition, persistence.
//
// These profiles bias MOTION. They never touch appearance: protocol section 3.3
// requires energy to bias motion rather than map directly to appearance, and
// the same principle applies to a symbol's family.

/**
 * @typedef {object} FamilyProfile
 * @property {number} resistance   Base resistance, 0..1. Higher resists change.
 * @property {number} velocity     Base morph velocity multiplier. Higher moves faster.
 * @property {number} persistence  Multiplier on how long the symbol holds.
 * @property {number} decay        Multiplier on fade duration. A higher value
 *                                 DELAYS the decay, so the symbol lingers.
 *                                 protocol section 7 lists "delayed decay" as
 *                                 a means of emphasis.
 * @property {number} asymmetry    0..1. How strongly the morph rate depends on
 *                                 the direction of the influence.
 */

/**
 * The neutral profile. Used for families the protocol does not define, so an
 * unexpected family in the data degrades gracefully instead of throwing.
 *
 * @type {FamilyProfile}
 */
export const NEUTRAL_PROFILE = Object.freeze({
  resistance: 0.5,
  velocity: 1.0,
  persistence: 1.0,
  decay: 1.0,
  asymmetry: 0.0,
});

/**
 * The five protocol families.
 *
 * @type {Readonly<Record<string, FamilyProfile>>}
 */
export const FAMILY_PROFILES = Object.freeze({
  // Anchor - "presence, grounding, identity". High resistance, low velocity.
  anchor: Object.freeze({
    resistance: 0.85,
    velocity: 0.35,
    persistence: 1.15,
    decay: 0.85,
    asymmetry: 0.0,
  }),
  // Flow - "movement, time, becoming". Low resistance, directional continuity.
  // It passes through rather than lingering.
  flow: Object.freeze({
    resistance: 0.25,
    velocity: 1.25,
    persistence: 0.7,
    decay: 0.75,
    asymmetry: 0.0,
  }),
  // Fracture - "rupture, decision, conflict". Asymmetric resistance and
  // instability; it does not settle.
  fracture: Object.freeze({
    resistance: 0.5,
    velocity: 1.0,
    persistence: 0.6,
    decay: 0.7,
    asymmetry: 0.6,
  }),
  // Void - "silence, waiting, surrender". Minimal mass, LONG DECAY and
  // dominance through absence. It must outlive the other families.
  void: Object.freeze({
    resistance: 0.7,
    velocity: 0.45,
    persistence: 1.7,
    decay: 1.5,
    asymmetry: 0.0,
  }),
  // Echo - "memory, reflection, longing". Delayed repetition and persistence.
  echo: Object.freeze({
    resistance: 0.55,
    velocity: 0.8,
    persistence: 1.45,
    decay: 1.25,
    asymmetry: 0.25,
  }),
});

/**
 * Look up a family's motion profile.
 *
 * An unknown family returns the neutral profile rather than throwing. A
 * family typo in the glyph data must not be able to stop the ritual.
 *
 * @param {string} family Symbol family name.
 * @returns {FamilyProfile} The family's profile, or the neutral profile.
 */
export function getFamilyProfile(family) {
  if (typeof family !== 'string') return NEUTRAL_PROFILE;
  return FAMILY_PROFILES[family.toLowerCase()] ?? NEUTRAL_PROFILE;
}

/**
 * Whether a family name is one the protocol defines.
 *
 * @param {string} family Symbol family name.
 * @returns {boolean}
 */
export function isKnownFamily(family) {
  return typeof family === 'string'
    && Object.prototype.hasOwnProperty.call(FAMILY_PROFILES, family.toLowerCase());
}
