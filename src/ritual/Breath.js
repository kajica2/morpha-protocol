// MORPHA Breath
// Detects and interprets breathing patterns from audio

/**
 * Analyzes audio patterns for breath-like rhythms
 * Returns a breath coefficient that influences visual breathing
 */
export function detectBreathPattern(audioHistory, windowSize = 30) {
  if (audioHistory.length < windowSize) {
    return 0.4; // default breath
  }

  // Look at recent amplitude history
  const recent = audioHistory.slice(-windowSize);

  // Calculate variance (how much amplitude changes)
  const mean = recent.reduce((sum, val) => sum + val, 0) / recent.length;
  const variance = recent.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recent.length;

  // More variance = more breath-like
  // Map variance to breath intensity
  const breathIntensity = Math.sqrt(variance) * 2;

  return Math.min(1.0, 0.3 + breathIntensity);
}

/**
 * Detects if user is sustaining a tone (singing/humming)
 */
export function detectSustainedTone(audioHistory, threshold = 0.1, duration = 10) {
  if (audioHistory.length < duration) {
    return false;
  }

  const recent = audioHistory.slice(-duration);

  // Check if amplitude stays above threshold
  const sustained = recent.every(val => val > threshold);

  return sustained;
}

export default {
  detectBreathPattern,
  detectSustainedTone
};
