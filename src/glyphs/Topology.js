// MORPHA Topology Normalization
// Ensures all glyphs have compatible vertex topology for clean morphing

import Config from '../core/Config.js';

/**
 * Rotate point array to start from the lowest Y point (leftmost if tied)
 * This ensures semantic alignment during morphs
 */
export function rotateToLowestPoint(points) {
  if (points.length === 0) return points;

  let lowestIdx = 0;
  for (let i = 1; i < points.length; i++) {
    const current = points[i];
    const lowest = points[lowestIdx];

    if (current.y < lowest.y || (current.y === lowest.y && current.x < lowest.x)) {
      lowestIdx = i;
    }
  }

  // Rotate array so lowest point is first
  return [...points.slice(lowestIdx), ...points.slice(0, lowestIdx)];
}

/**
 * Normalize points to centered coordinate space
 * Centers at (0,0) and scales to fit within [-1, 1] range
 */
export function normalizePoints(points) {
  if (points.length === 0) return new Float32Array(0);

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  // Find bounds
  points.forEach(p => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY);

  // Create output array
  const out = new Float32Array(points.length * 2);

  points.forEach((p, i) => {
    out[i * 2] = ((p.x - cx) / scale) * Config.GLYPH_NORMALIZED_SCALE;
    out[i * 2 + 1] = ((p.y - cy) / scale) * Config.GLYPH_NORMALIZED_SCALE;
  });

  return out;
}

/**
 * Ensure all glyphs have the same vertex count for morphing
 * Returns Float32Array ready for WebGL buffer
 */
export function normalizeTopology(points, targetCount = Config.GLYPH_VERTEX_COUNT) {
  if (points.length === targetCount) {
    return normalizePoints(points);
  }

  // Resample to target count
  const resampled = [];
  const step = points.length / targetCount;

  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor(i * step);
    resampled.push(points[idx % points.length]);
  }

  return normalizePoints(resampled);
}

/**
 * Validate that a glyph topology is compatible
 */
export function validateTopology(glyphData) {
  if (!glyphData || !glyphData.length) {
    return false;
  }

  // Must have even number of values (x,y pairs)
  if (glyphData.length % 2 !== 0) {
    return false;
  }

  // Must match expected vertex count
  const vertexCount = glyphData.length / 2;
  if (vertexCount !== Config.GLYPH_VERTEX_COUNT) {
    console.warn(`Glyph has ${vertexCount} vertices, expected ${Config.GLYPH_VERTEX_COUNT}`);
    return false;
  }

  return true;
}

export default {
  rotateToLowestPoint,
  normalizePoints,
  normalizeTopology,
  validateTopology
};
