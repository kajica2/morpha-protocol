// Mapping the particle field onto the viewport.
//
// The particle simulation works in field units (0..width, 0..height). The
// camera works in NDC. This module owns the mapping between them.
//
// It is a separate module, free of three.js and of the DOM, for one
// concrete reason: `Renderer.js` imports the GLSL with Vite's `?raw`
// suffix, so it cannot be imported under plain `node --test`. A mapping
// with real arithmetic in it deserves a test, so it lives here where it
// can be tested.
//
// The aspect handling is the subtle part. The vertex shader multiplies y
// by the aspect ratio so that round sprites do not read as wide ellipses.
// That means the visible y range, in the shader's own units, is
// -1/aspect .. 1/aspect rather than -1 .. 1. Mapping the field onto
// -1 .. 1 in y would therefore leave a gap at the top and bottom of the
// viewport, and mapping it onto the visible range keeps the field filling
// the screen at any window shape.

/**
 * A mapping from the simulation's field units to the shader's units.
 *
 * @typedef {object} FieldProjection
 * @property {number} scaleX     Multiplier applied to the field's x.
 * @property {number} scaleY     Multiplier applied to the field's y.
 * @property {number} offsetX    Added to the scaled x.
 * @property {number} offsetY    Added to the scaled y.
 */

/**
 * Build the projection from the simulation's field to the viewport.
 *
 * @param {object} bounds The simulation's bounds.
 * @param {number} bounds.width Field width in field units.
 * @param {number} bounds.height Field height in field units.
 * @param {number} aspect Viewport width divided by height.
 * @returns {FieldProjection} The projection.
 */
export function createFieldProjection(bounds, aspect) {
  const width = Math.max(Number(bounds?.width) || 0, 1e-6);
  const height = Math.max(Number(bounds?.height) || 0, 1e-6);
  const safeAspect = Math.max(Number(aspect) || 0, 1e-6);

  return {
    scaleX: 2 / width,
    // The shader multiplies y by the aspect ratio, so the visible y range
    // is -1/aspect .. 1/aspect.
    scaleY: (2 / safeAspect) / height,
    offsetX: -1,
    offsetY: -1 / safeAspect,
  };
}

/**
 * Project a point from field units to the shader's units.
 *
 * @param {number} x The field x.
 * @param {number} y The field y.
 * @param {FieldProjection} projection The projection.
 * @returns {{x:number, y:number}} The projected point.
 */
export function projectFieldPoint(x, y, projection) {
  return {
    x: x * projection.scaleX + projection.offsetX,
    y: y * projection.scaleY + projection.offsetY,
  };
}
