import { influenceGlyph, resolveDistortion } from './Influence.js';

// Maximum morph progress change allowed in a single frame. Keeps the
// transformation continuous even if a caller injects an enormous delta.
const MAX_MORPH_STEP = 0.2;

export class Glyph {
  constructor(geometry, family, birthTime, semanticWeight = {}) {
    this.geometry = geometry; // Float32Array of points
    this.family = family; // e.g., "flow", "anchor"
    this.birthTime = birthTime; // Timestamp when this glyph was created
    this.semanticWeight = semanticWeight; // e.g., { resistance: 0.6, fadeTime: 2.4, ... }

    // Lifecycle: the glyph morphs into its form, holds, then decays. The
    // decay only begins once the morph has completed, so the transformation
    // is actually visible before the symbol recedes.
    this.fadeTime = semanticWeight.fadeTime || 5.0; // Seconds of decay
    this.morphDuration = semanticWeight.morphDuration || 2.0; // Seconds to morph
    this.morphSpeed = 1 / this.morphDuration;

    this.currentOpacity = 1.0; // Current rendering opacity
    this.morphProgress = 0.0; // Current morph progress (0-1)
    this.targetMorphProgress = 1.0; // Target morph progress
    this.isActive = true; // Whether the glyph is still active in the queue
    this.mesh = null; // Reference to the Three.js mesh

    // Motion state. The family profile and the glyph's own semantic weight
    // set the baseline; the global influence biases it every frame. These
    // affect MOTION only - never opacity, colour or any other appearance.
    this.motionProfile = null;
    this.holdMultiplier = 1;
    this.decayMultiplier = 1;
    this.phase = 0;
    // The glyph's own bend under the temporal memory's distortion. This is
    // a geometric offset, not an appearance change.
    this.distortion = { x: 0, y: 0, amount: 0 };
    // A retiring glyph has been asked to leave. It still completes its morph
    // and still decays - it simply skips the hold and begins decaying as
    // soon as the transformation is done.
    this.isRetiring = false;
    influenceGlyph(this, family, semanticWeight, {}, 0);
  }

  /**
   * Ask this glyph to leave the field.
   *
   * The glyph is not cut away. It finishes the transformation it is already
   * performing and then decays, so the field never loses a visible symbol
   * without a decay - protocol section 6.
   */
  requestRetirement() {
    this.isRetiring = true;
  }

  // Update method for individual glyph logic (e.g., decay, morphing)
  //
  // `influence` is the global structural influence (sound plus silence). It
  // biases this glyph's MOTION - velocity, resistance, persistence, decay -
  // weighted by the glyph's family and its own semantic weight. It never
  // touches appearance: opacity and colour are not influenced by sound.
  update(deltaTime, globalTime, audioData, silenceWeight, userFingerprint, influence = {}) {
    const elapsed = globalTime - this.birthTime;

    // Re-resolve the motion profile every frame so the glyph's motion tracks
    // the live influence rather than a snapshot from birth.
    influenceGlyph(
      this,
      this.family,
      this.semanticWeight,
      influence,
      silenceWeight,
    );

    // Resolve this glyph's own bend under the temporal memory. The
    // distortion lives on the influence, so a glyph that is not influenced
    // by sound is not influenced by its memory either.
    this.distortion = resolveDistortion(
      this.family,
      this.semanticWeight,
      influence.distortion,
    );

    // Morph toward the target shape over morphDuration. Progress is derived
    // from elapsed time so it stays consistent with the decay, and the
    // per-frame step is capped so a large delta can never teleport the morph.
    if (this.morphProgress < this.targetMorphProgress) {
      const target = Math.min(1, elapsed / this.morphDuration);
      const step = Math.min(this.morphSpeed * deltaTime, MAX_MORPH_STEP);
      this.morphProgress = Math.min(target, this.morphProgress + step);
    }

    // Hold full opacity through the morph, then fade over fadeTime. A symbol
    // is never removed without decaying.
    //
    // Persistence extends the hold and decay scales the fade. Both come from
    // the motion profile, so a Void symbol lingers and a Flow symbol moves
    // on - and silence extends both. The fade itself is unchanged in shape:
    // this is a timing change, not an appearance change.
    //
    // The fade never starts before the morph completes. Persistence scales
    // how long the symbol holds at full opacity after transforming, so a
    // family with persistence below 1 fades as soon as its morph is done,
    // while Void and Echo linger.
    //
    // The clamp is what makes this safe: a persistence below 1 would
    // otherwise start the fade while the symbol was still transforming,
    // which is exactly what the protocol forbids.
    const fadeStart = this.isRetiring
      ? this.morphDuration
      : Math.max(
        this.morphDuration,
        this.morphDuration * this.holdMultiplier,
      );
    const fadeTime = this.fadeTime * this.decayMultiplier;
    const fadeElapsed = elapsed - fadeStart;
    if (fadeElapsed > 0) {
      this.currentOpacity = Math.max(0, 1 - (fadeElapsed / fadeTime));
    }

    // If opacity drops too low, deactivate
    if (this.currentOpacity < 0.01) {
      this.isActive = false;
    }
  }

  // Method to set the target geometry for morphing
  setTargetGeometry(targetGeometry) {
    // In a multi-glyph system, this glyph's geometry will become the 'positionFrom'
    // and the new targetGeometry will be 'positionTo' for its mesh.
    // This is handled more by GlyphQueue and Renderer.
  }
}
