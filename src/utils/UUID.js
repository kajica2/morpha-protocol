/**
 * Identifier helpers for MORPHA moments.
 *
 * "Save moments, not sessions" — every saved artefact is keyed by a UUID so
 * that two participants saving the same moment never collide.
 */

import { createSeededRandom, normalizeSeed } from './Math.js';

/** Hex digit lookup table for fast UUID formatting. */
const HEX = [];
for (let i = 0; i < 256; i += 1) HEX.push((i + 0x100).toString(16).slice(1));

/**
 * Format 16 random bytes as a version-4 UUID string.
 *
 * @param {Uint8Array} bytes 16 bytes (mutated: version and variant bits set).
 * @returns {string} UUID string, e.g. `1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`.
 */
function formatUuid(bytes) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  return (
    HEX[bytes[0]] + HEX[bytes[1]] + HEX[bytes[2]] + HEX[bytes[3]] + '-' +
    HEX[bytes[4]] + HEX[bytes[5]] + '-' +
    HEX[bytes[6]] + HEX[bytes[7]] + '-' +
    HEX[bytes[8]] + HEX[bytes[9]] + '-' +
    HEX[bytes[10]] + HEX[bytes[11]] + HEX[bytes[12]] + HEX[bytes[13]] + HEX[bytes[14]] + HEX[bytes[15]]
  );
}

/**
 * Check whether a string looks like a UUID.
 *
 * @param {unknown} value Candidate identifier.
 * @returns {boolean} True for a canonical 8-4-4-4-12 hex UUID string.
 */
export function isValidUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Create a deterministic UUID generator.
 *
 * @param {number|string} [seed=0] Seed for the sequence.
 * @returns {() => string} Generator producing unique version-4 UUID strings.
 *   The same seed always replays the same sequence.
 */
export function createSeededUuidFactory(seed = 0) {
  const random = createSeededRandom(normalizeSeed(seed));
  return function nextUuid() {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(random() * 256);
    }
    return formatUuid(bytes);
  };
}

/**
 * Create a UUID.
 *
 * Uses `crypto.randomUUID()` when the platform provides it. A seeded
 * deterministic fallback is used when a seed is supplied (tests, replay) or
 * when no crypto implementation is available.
 *
 * @param {{ seed?: number|string }} [options] Options.
 * @returns {string} UUID string.
 */
export function createUuid(options = {}) {
  const seed = options && options.seed !== undefined ? options.seed : undefined;
  if (seed !== undefined) return createSeededUuidFactory(seed)();

  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  // Deterministic fallback: seed from the clock so successive calls differ.
  const fallback = createSeededUuidFactory(Date.now() >>> 0);
  return fallback();
}
