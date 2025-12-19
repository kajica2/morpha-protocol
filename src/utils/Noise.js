// MORPHA Noise Utilities
// Simple noise functions for organic variation

// Simple hash function for pseudo-random values
function hash(x, y = 0) {
  const h = (x * 374761393 + y * 668265263) & 0xffffffff;
  return (h ^ (h >>> 13)) / 0xffffffff;
}

// 1D Perlin-like noise
export function noise1D(x) {
  const xi = Math.floor(x);
  const xf = x - xi;

  const v1 = hash(xi);
  const v2 = hash(xi + 1);

  // Smooth interpolation
  const u = xf * xf * (3.0 - 2.0 * xf);
  return v1 * (1 - u) + v2 * u;
}

// 2D Perlin-like noise
export function noise2D(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const v00 = hash(xi, yi);
  const v10 = hash(xi + 1, yi);
  const v01 = hash(xi, yi + 1);
  const v11 = hash(xi + 1, yi + 1);

  // Smooth interpolation
  const ux = xf * xf * (3.0 - 2.0 * xf);
  const uy = yf * yf * (3.0 - 2.0 * yf);

  const v0 = v00 * (1 - ux) + v10 * ux;
  const v1 = v01 * (1 - ux) + v11 * ux;

  return v0 * (1 - uy) + v1 * uy;
}

// Fractal noise (multiple octaves)
export function fractalNoise2D(x, y, octaves = 4) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

// Simplex-like noise for organic deformation
export function organicNoise(x, y, time) {
  const n1 = noise2D(x + time * 0.1, y);
  const n2 = noise2D(x, y + time * 0.1);
  const n3 = noise2D(x + time * 0.05, y + time * 0.05);

  return (n1 + n2 + n3) / 3;
}

// For audio-reactive subtle variation
export function audioNoise(seed, audioEnergy) {
  return noise1D(seed + audioEnergy * 10) * audioEnergy;
}
