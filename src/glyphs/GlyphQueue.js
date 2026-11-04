import { Glyph } from './Glyph';

const MAX_GLYPHS = 4;

/**
 * Maintains overlapping glyph instances. Each glyph owns a WebGL mesh;
 * retiring a glyph disposes of its GPU resources through Renderer.
 */
export class GlyphQueue {
  constructor(renderer) {
    this.queue = [];
    this.renderer = renderer;
    this.currentGlyphGeometry = null;
  }

  addGlyph(geometry, family, time, semanticWeight = {}) {
    if (!geometry || geometry.length < 2 || geometry.length % 2 !== 0) {
      throw new TypeError('Glyph geometry must contain pairs of coordinates');
    }
    const glyph = new Glyph(geometry, family, time, semanticWeight);
    const from = this.currentGlyphGeometry || geometry;
    glyph.mesh = this.renderer.addGlyphMesh(from, geometry, 0, 0);
    glyph.morphSpeed = 1 / Math.max(0.1, semanticWeight.fadeTime || 5);
    this.queue.push(glyph);
    this.currentGlyphGeometry = geometry;
    while (this.queue.length > MAX_GLYPHS) {
      this.removeGlyph(this.queue.shift());
    }
    return glyph;
  }

  removeGlyph(glyph) {
    if (glyph.mesh) {
      this.renderer.removeGlyphMesh(glyph.mesh);
      glyph.mesh = null;
    }
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
