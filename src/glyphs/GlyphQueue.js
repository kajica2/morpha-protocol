import { Glyph } from './Glyph.js';

// Protocol grammar rule: "At least two symbol instances MUST overlap at all
// times" and "No symbol MAY be removed without decay".
const MAX_GLYPHS = 4;
const MIN_OVERLAP = 2;

/**
 * Maintains overlapping glyph instances. Each glyph owns a WebGL mesh;
 * retiring a glyph disposes of its GPU resources through Renderer.
 */
export class GlyphQueue {
  constructor(renderer, options = {}) {
    this.queue = [];
    this.renderer = renderer;
    this.currentGlyphGeometry = null;
    this.maxGlyphs = options.maxGlyphs ?? MAX_GLYPHS;
    this.minOverlap = options.minOverlap ?? MIN_OVERLAP;
  }

  addGlyph(geometry, family, time, semanticWeight = {}) {
    if (!geometry || geometry.length < 2 || geometry.length % 2 !== 0) {
      throw new TypeError('Glyph geometry must contain pairs of coordinates');
    }
    const glyph = new Glyph(geometry, family, time, semanticWeight);
    // The new glyph morphs from whatever shape is currently on screen, so an
    // arriving symbol never cuts into the one it overlaps with.
    const from = this.currentGlyphGeometry || geometry;
    glyph.mesh = this.renderer.addGlyphMesh(from, geometry, 0, 0);
    this.queue.push(glyph);
    this.currentGlyphGeometry = geometry;
    this.evictIfNeeded();
    return glyph;
  }

  removeGlyph(glyph) {
    if (glyph.mesh) {
      this.renderer.removeGlyphMesh(glyph.mesh);
      glyph.mesh = null;
    }
  }

  /**
   * Enforce the overlap bounds. The oldest glyph is only retired once the
   * queue exceeds the maximum; it decays on its own before removal, so no
   * symbol disappears without a decay.
   */
  evictIfNeeded() {
    while (this.queue.length > this.maxGlyphs) {
      this.removeGlyph(this.queue.shift());
    }
  }

  /**
   * Whether the queue currently satisfies the protocol's minimum overlap.
   * The ritual is only compliant while this is true.
   *
   * @returns {boolean}
   */
  satisfiesMinimumOverlap() {
    return this.getActiveGlyphs().length >= this.minOverlap;
  }

  update(deltaTime, time, audioData, silenceWeight, fingerprint = {}) {
    for (const glyph of this.queue) {
      glyph.update(deltaTime, time, audioData, silenceWeight, fingerprint);
      if (glyph.mesh) {
        glyph.mesh.material.uniforms.uMorph.value = glyph.morphProgress;
        glyph.mesh.material.uniforms.uOpacity.value = glyph.currentOpacity;
        glyph.mesh.material.uniforms.uEmotion.value = fingerprint.emotionBias || 0;
      }
    }
    for (const glyph of this.queue.filter(item => !item.isActive)) this.removeGlyph(glyph);
    this.queue = this.queue.filter(item => item.isActive);
  }

  getActiveGlyphs() {
    return this.queue.filter(glyph => glyph.isActive);
  }

  dispose() {
    for (const glyph of this.queue) this.removeGlyph(glyph);
    this.queue = [];
    this.currentGlyphGeometry = null;
  }
}
