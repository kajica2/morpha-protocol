// src/render/GlyphGeometry.js
//
// Pure geometry helpers for glyph rendering.
//
// Kept free of THREE and of the DOM so the maths can be unit tested under
// plain `node --test`. Renderer.js turns these arrays into BufferAttributes.
//
// Glyph geometry arrives as a flat Float32Array of interleaved x/y pairs:
//   [x0, y0, x1, y1, ...]
// The shader interpolates between two such buffers (positionFrom/positionTo).

/** Number of numeric components per glyph point. */
export const GLYPH_COMPONENTS = 2;

/**
 * Validate a flat glyph geometry buffer.
 *
 * @param {ArrayLike<number>} flat Interleaved x/y pairs.
 * @param {string} [label] Name used in the error message.
 * @returns {number} The number of points in the buffer.
 * @throws {TypeError} If the buffer is missing, has an odd length, or holds
 *   a non-finite coordinate.
 */
export function assertValidGeometry(flat, label = 'glyph geometry') {
  if (!flat || typeof flat.length !== 'number') {
    throw new TypeError(`${label} must be an array-like buffer of coordinate pairs`);
  }
  if (flat.length === 0 || flat.length % GLYPH_COMPONENTS !== 0) {
    throw new TypeError(`${label} must contain a non-zero, even number of components`);
  }
  for (let i = 0; i < flat.length; i++) {
    if (!Number.isFinite(flat[i])) {
      throw new TypeError(`${label} contains a non-finite coordinate at index ${i}`);
    }
  }
  return flat.length / GLYPH_COMPONENTS;
}

/**
 * Expand a flat x/y buffer into an interleaved x/y/z buffer.
 *
 * THREE.Points derives its vertex count from the `position` attribute, and
 * three.js reads the z component when it computes a bounding sphere. A
 * two-component `position` therefore yields a NaN radius and the draw is
 * skipped entirely, so the glyph never appears.
 *
 * @param {ArrayLike<number>} flat Interleaved x/y pairs.
 * @returns {Float32Array} Interleaved x/y/z triples.
 */
export function toXYZ(flat) {
  const count = flat.length / GLYPH_COMPONENTS;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    out[i * 3] = flat[i * 2];
    out[i * 3 + 1] = flat[i * 2 + 1];
    out[i * 3 + 2] = 0;
  }
  return out;
}

/**
 * Build the three attribute buffers a glyph mesh needs.
 *
 * @param {ArrayLike<number>} from Geometry the morph starts from.
 * @param {ArrayLike<number>} to Geometry the morph ends on.
 * @returns {{position: Float32Array, positionFrom: Float32Array, positionTo: Float32Array}}
 */
export function buildGlyphAttributes(from, to) {
  const fromPoints = assertValidGeometry(from, 'glyph geometry (from)');
  const toPoints = assertValidGeometry(to, 'glyph geometry (to)');
  if (fromPoints !== toPoints) {
    throw new TypeError(
      `glyph geometry point counts differ: from=${fromPoints} to=${toPoints}`
    );
  }
  return {
    position: toXYZ(from),
    positionFrom: Float32Array.from(from),
    positionTo: Float32Array.from(to),
  };
}

/**
 * Mix two glyph geometries by a morph factor.
 *
 * @param {ArrayLike<number>} from Geometry the morph starts from.
 * @param {ArrayLike<number>} to Geometry the morph ends on.
 * @param {number} t Morph factor, clamped to 0..1.
 * @returns {Float32Array} The interpolated geometry.
 */
export function mixGeometry(from, to, t) {
  const count = assertValidGeometry(from, 'glyph geometry (from)');
  assertValidGeometry(to, 'glyph geometry (to)');
  const m = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), 1);
  const out = new Float32Array(count * GLYPH_COMPONENTS);
  for (let i = 0; i < out.length; i++) {
    out[i] = from[i] + (to[i] - from[i]) * m;
  }
  return out;
}
