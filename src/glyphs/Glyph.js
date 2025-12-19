export class Glyph {
  constructor(geometry, family, birthTime, semanticWeight = {}) {
    this.geometry = geometry; // Float32Array of points
    this.family = family; // e.g., "flow", "anchor"
    this.birthTime = birthTime; // Timestamp when this glyph was created
    this.decayTime = birthTime; // Will be updated to reflect when it starts decaying
    this.semanticWeight = semanticWeight; // e.g., { resistance: 0.6, fadeTime: 2.4, ... }
    this.currentOpacity = 1.0; // Current rendering opacity
    this.morphProgress = 0.0; // Current morph progress (0-1)
    this.targetMorphProgress = 0.0; // Target morph progress
    this.morphSpeed = 0.0; // Speed at which morphProgress changes
    this.isActive = true; // Whether the glyph is still active in the queue
    this.mesh = null; // Reference to the Three.js mesh
  }

  // Update method for individual glyph logic (e.g., decay, morphing)
  update(deltaTime, globalTime, audioData, silenceWeight, userFingerprint) {
    // Example: Decay over time
    const fadeDuration = this.semanticWeight.fadeTime || 5.0; // Default 5 seconds
    if (globalTime > this.decayTime) {
      const timeSinceDecay = globalTime - this.decayTime;
      this.currentOpacity = Math.max(0, 1 - (timeSinceDecay / fadeDuration));
    }

    // Example: Morphing logic
    // This will be more complex with actual glyph transitions
    this.morphProgress += this.morphSpeed * deltaTime;
    this.morphProgress = Math.min(this.morphProgress, 1.0);

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
