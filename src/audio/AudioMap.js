// MORPHA Audio Mapping
// Maps audio energy to semantic/visual parameters

export function mapAudioToWarp(audioData) {
  // Mid frequencies drive spatial deformation
  return audioData.mid * 0.8;
}

export function mapAudioToEmotion(audioData) {
  // Low vs High frequencies create emotional drift
  // Negative = grounded/calm, Positive = agitated/active
  return (audioData.high - audioData.low) * 2.0 - 1.0;
}

export function mapAudioToBreath(audioData, baseBreath = 0.4) {
  // Amplitude modulates breathing intensity
  return baseBreath + audioData.amp * 0.3;
}

export function mapAudioToMorphSpeed(audioData, baseDuration = 5.0) {
  // Higher energy = faster morphing
  const energyFactor = (audioData.amp + audioData.mid) / 2;
  return baseDuration * (1.0 - energyFactor * 0.5);
}

export function mapAudioToGlyphFamily(audioData) {
  // Different frequency ranges bias toward different symbol families
  const { low, mid, high, amp } = audioData;

  if (amp < 0.1) {
    return 'void';  // Silence/quiet ’ Void
  }

  if (low > mid && low > high) {
    return 'anchor';  // Low frequencies ’ grounding
  }

  if (high > mid && high > low) {
    return 'fracture';  // High frequencies ’ tension
  }

  if (mid > 0.5) {
    return 'flow';  // Mid frequencies ’ movement
  }

  return 'echo';  // Balanced frequencies ’ memory
}

export function mapAudioToResistance(audioData) {
  // Lower frequencies create more resistance to change
  return 0.3 + audioData.low * 0.6;
}

export function mapAudioToDecay(audioData, baseFade = 3.0) {
  // Quieter sounds linger longer
  const invAmp = 1.0 - audioData.amp;
  return baseFade * (0.7 + invAmp * 0.6);
}
