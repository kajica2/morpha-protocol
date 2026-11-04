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
  }

  // Update method for individual glyph logic (e.g., decay, morphing)
  update(deltaTime, globalTime, audioData, silenceWeight, userFingerprint) {
    const elapsed = globalTime - this.birthTime;

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
    const fadeElapsed = elapsed - this.morphDuration;
    if (fadeElapsed > 0) {
      this.currentOpacity = Math.max(0, 1 - (fadeElapsed / this.fadeTime));
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
