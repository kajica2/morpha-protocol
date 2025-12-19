import { Glyph } from './Glyph';

const MAX_GLYPHS = 4; // Max number of overlapping glyphs

export class GlyphQueue {
  constructor(renderer) {
    this.queue = []; // Stores active Glyph instances
    this.renderer = renderer; // Reference to the renderer to manage meshes
    this.currentGlyphGeometry = null; // The geometry currently being displayed/morphed from
  }

  addGlyph(newGlyphGeometry, family, globalTime, semanticWeight) {
    // If there's an existing glyph, its geometry becomes the 'positionFrom' for the new one
    const prevGlyphGeometry = this.currentGlyphGeometry;

    // Create a new Glyph instance
    const newGlyph = new Glyph(newGlyphGeometry, family, globalTime, semanticWeight);
    this.queue.push(newGlyph);

    // Update the renderer with the new morph target
    if (prevGlyphGeometry) {
      this.renderer.setGlyphGeometry(prevGlyphGeometry, newGlyphGeometry);
    } else {
      // First glyph, no morphing yet, just set its geometry as both from and to
      this.renderer.setGlyphGeometry(newGlyphGeometry, newGlyphGeometry);
    }
    this.currentGlyphGeometry = newGlyphGeometry;

    // Manage queue size (remove oldest if exceeding MAX_GLYPHS)
    while (this.queue.length > MAX_GLYPHS) {
      const oldestGlyph = this.queue.shift();
      // Optionally, remove its mesh from the scene if it had a dedicated mesh
      if (oldestGlyph.mesh) {
        this.renderer.scene.remove(oldestGlyph.mesh);
        oldestGlyph.mesh.geometry.dispose();
      }
    }

    return newGlyph;
  }

  update(deltaTime, globalTime, audioData, silenceWeight, userFingerprint) {
    // Update each glyph in the queue
    this.queue.forEach(glyph => {
      if (glyph.isActive) {
        glyph.update(deltaTime, globalTime, audioData, silenceWeight, userFingerprint);
        // Update mesh uniforms for this glyph if it has a dedicated mesh
        // For now, we're using a single mesh in Renderer, so we'll update global uniforms
      }
    });

    // Filter out inactive glyphs
    this.queue = this.queue.filter(glyph => glyph.isActive);

    // Update global morph progress based on the latest glyph in the queue
    // This is a simplified approach for now, a more complex system would manage individual glyph morphs
    if (this.queue.length > 0) {
      const latestGlyph = this.queue[this.queue.length - 1];
      this.renderer.uniforms.uMorph.value = latestGlyph.morphProgress;
      this.renderer.uniforms.uOpacity.value = latestGlyph.currentOpacity;
      // Update color/emotion based on latest glyph or a blend of active glyphs
      this.renderer.uniforms.uEmotion.value = userFingerprint.emotionBias || 0;
    }
  }

  // Get the current active glyphs for rendering (if needed for individual meshes)
  getActiveGlyphs() {
    return this.queue.filter(glyph => glyph.isActive);
  }
}
