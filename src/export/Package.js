// MORPHA Package
// Assembles ritual artifacts for storage/export

import { generateTimestampID } from '../utils/UUID.js';

/**
 * Creates a complete ritual package for export
 */
export function createRitualPackage(videoBlob, audioData, glyphHistory, userFingerprint) {
  const packageId = generateTimestampID();

  return {
    id: packageId,
    timestamp: Date.now(),
    video: videoBlob,
    metadata: {
      duration: videoBlob.size / (1024 * 1024), // rough estimate
      glyphCount: glyphHistory.length,
      dominantFamily: getDominantFamily(glyphHistory),
      emotionalRange: calculateEmotionalRange(glyphHistory),
      silenceRatio: calculateSilenceRatio(audioData)
    },
    fingerprint: userFingerprint,
    protocol: 'MORPHA v0.1'
  };
}

/**
 * Determines which symbol family was most prominent
 */
function getDominantFamily(glyphHistory) {
  const familyCounts = {};

  glyphHistory.forEach(glyph => {
    const family = glyph.family || 'unknown';
    familyCounts[family] = (familyCounts[family] || 0) + 1;
  });

  let dominant = 'void';
  let maxCount = 0;

  Object.entries(familyCounts).forEach(([family, count]) => {
    if (count > maxCount) {
      maxCount = count;
      dominant = family;
    }
  });

  return dominant;
}

/**
 * Calculates emotional range (variation in emotion)
 */
function calculateEmotionalRange(glyphHistory) {
  if (glyphHistory.length === 0) return 0;

  const emotions = glyphHistory.map(g => g.emotionBias || 0);
  const min = Math.min(...emotions);
  const max = Math.max(...emotions);

  return max - min;
}

/**
 * Calculates what portion of the ritual was silence
 */
function calculateSilenceRatio(audioData) {
  if (!audioData || audioData.length === 0) return 0;

  const silenceFrames = audioData.filter(frame => frame.amp < 0.03).length;
  return silenceFrames / audioData.length;
}

/**
 * Converts package to JSON for storage
 */
export function packageToJSON(pkg) {
  return {
    id: pkg.id,
    timestamp: pkg.timestamp,
    metadata: pkg.metadata,
    fingerprint: pkg.fingerprint,
    protocol: pkg.protocol
  };
}

export default {
  createRitualPackage,
  packageToJSON
};
