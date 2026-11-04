/**
 * Deterministic gradient noise for MORPHA.
 *
 * The noise field is built from a seeded permutation table, so the same seed
 * always produces the same field. That determinism is what lets a rendered
 * ritual be replayed, snapshotted and compared field-for-field.
 */

import { createSeededRandom, normalizeSeed } from './Math.js';

/** Size of the permutation table (must be a power of two). */
const TABLE_SIZE = 256;

/**
 * Quintic fade curve — C2 continuous, so the noise field has no visible
 * lattice creases.
 *
 * @param {number} t Fractional coordinate (unitless).
 * @returns {number} Fade value 0..1.
 */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Gradient selection for a hashed lattice point.
 *
 * @param {number} hash Lattice hash (integer).
 * @param {number} x Offset along x (unitless).
 * @param {number} y Offset along y (unitless).
 * @returns {number} Gradient projection (unitless).
 */
function grad(hash, x, y) {
  switch (hash & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

/**
 * Create a deterministic 2D gradient-noise sampler.
 *
 * @param {number|string} [seed=0] Seed for the permutation table. Two samplers
 *   built from the same seed produce identical output; different seeds
 *   produce different fields.
 * @returns {(x: number, y: number) => number} Sampler returning values roughly
 *   in [-1, 1]. Coordinates are unitless.
 */
export function createNoise(seed = 0) {
  const random = createSeededRandom(normalizeSeed(seed));

  const base = new Uint8Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i += 1) base[i] = i;

  // Fisher-Yates shuffle driven by the seeded PRNG: deterministic per seed.
  for (let i = TABLE_SIZE - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = base[i];
    base[i] = base[j];
    base[j] = swap;
  }

  const perm = new Uint8Array(TABLE_SIZE * 2);
  for (let i = 0; i < perm.length; i += 1) perm[i] = base[i & (TABLE_SIZE - 1)];

  /**
   * Sample the noise field.
   *
   * @param {number} x Sample coordinate along x (unitless).
   * @param {number} y Sample coordinate along y (unitless).
   * @returns {number} Noise value, approximately in [-1, 1].
   */
  function noise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    const X = xi & (TABLE_SIZE - 1);
    const Y = yi & (TABLE_SIZE - 1);

    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];

    const top = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const bottom = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));

    return top + v * (bottom - top);
  }

  /** The seed this field was built from (useful for provenance in snapshots). */
  noise2D.seed = seed;

  return noise2D;
}
