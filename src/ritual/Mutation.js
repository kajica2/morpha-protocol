// MORPHA Mutation
// Handles spontaneous mutation of glyphs based on environmental pressures

import { mapAudioToGlyphFamily } from '../audio/AudioMap.js';

/**
 * Determines if a glyph should mutate based on current conditions
 */
export function shouldMutate(glyph, audioData, silenceWeight, userFingerprint) {
  // Mutations are rare and require specific conditions

  // Higher chance during high energy
  const energyFactor = audioData.amp * audioData.mid;

  // Lower chance during silence
  const silenceFactor = 1.0 - silenceWeight;

  // User fingerprint bias
  const userCuriosity = userFingerprint.curiosity || 0.5;

  const mutationChance = energyFactor * silenceFactor * userCuriosity * 0.01;

  return Math.random() < mutationChance;
}

/**
 * Creates a mutated version of a glyph
 */
export function mutateGlyph(sourceGlyph, audioData, timestamp) {
  // Determine new family based on current audio
  const newFamily = mapAudioToGlyphFamily(audioData);

  // Mutation preserves some characteristics but shifts family
  return {
    ...sourceGlyph,
    family: newFamily,
    birthTime: timestamp,
    mutationGeneration: (sourceGlyph.mutationGeneration || 0) + 1
  };
}

/**
 * Determines mutation pressure (environmental factors that encourage change)
 */
export function calculateMutationPressure(audioHistory, silenceHistory) {
  // Rapid changes in audio create mutation pressure
  let pressure = 0;

  if (audioHistory.length < 2) return pressure;

  // Calculate rate of change
  for (let i = audioHistory.length - 1; i > audioHistory.length - 5 && i > 0; i--) {
    const delta = Math.abs(audioHistory[i] - audioHistory[i - 1]);
    pressure += delta;
  }

  return Math.min(1.0, pressure * 0.5);
}

export default {
  shouldMutate,
  mutateGlyph,
  calculateMutationPressure
};
