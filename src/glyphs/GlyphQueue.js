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
    // protocol section 6: "No symbol MAY be removed without decay". A
    // visible symbol is never cut away to make room for a new one. The
    // oldest symbol is instead asked to retire: it completes the
    // transformation it is performing and then decays away, releasing its
    // mesh when it goes.
    //
    // The ceiling is therefore a bound on the field's steady-state size, not
    // a reason to break the grammar rule.
    // Only as many glyphs as are needed are asked to leave, oldest first.
    // Marking every glyph would empty the field and break the overlap rule.
    //
    // A glyph that is already retiring counts towards the excess: it is
    // already on its way out and does not need to be asked twice.
    let excess = this.queue.length - this.maxGlyphs;
    for (const glyph of this.queue) {
      if (excess <= 0) break;
      if (glyph.isRetiring) {
        excess -= 1;
        continue;
      }
      glyph.requestRetirement();
      excess -= 1;
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

  /**
   * Whether the field needs a new symbol to stay compliant.
   *
   * protocol section 6 requires at least two overlapping symbols at all
   * times. A glyph can complete its decay and be removed on any update, so
   * holding exactly the minimum is not enough: removing one would leave the
   * field with a single symbol. The field therefore needs one symbol of
   * headroom over the minimum for the guarantee to hold across a removal.
   *
   * @returns {boolean}
   */
  needsReplenishment() {
    return this.getActiveGlyphs().length < this.minOverlap + 1;
  }

  update(deltaTime, time, audioData, silenceWeight, fingerprint = {}, influence = {}) {
    for (const glyph of this.queue) {
      glyph.update(deltaTime, time, audioData, silenceWeight, fingerprint, influence);
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
