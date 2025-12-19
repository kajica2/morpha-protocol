const FINGERPRINT_KEY = 'morpha_user_fingerprint';

export function loadUserFingerprint() {
  try {
    const storedFingerprint = localStorage.getItem(FINGERPRINT_KEY);
    if (storedFingerprint) {
      return JSON.parse(storedFingerprint);
    }
  } catch (error) {
    console.error("Error loading user fingerprint from localStorage:", error);
  }
  // Return a default fingerprint if none found or error
  return {
    breath: 0.4,
    colorA: 0xffffff,
    colorB: 0x000000,
    emotionBias: 0,
    silenceTolerance: 0.5, // Default value
    tempoTolerance: 0.5,   // Default value
    morphSoftness: 0.5,    // Default value
    colorDriftSpeed: 0.01  // Default value
  };
}

export function saveUserFingerprint(fingerprint) {
  try {
    localStorage.setItem(FINGERPRINT_KEY, JSON.stringify(fingerprint));
    console.log("User fingerprint saved.", fingerprint);
  } catch (error) {
    console.error("Error saving user fingerprint to localStorage:", error);
  }
}

// Function to subtly update fingerprint based on interaction
export function updateUserFingerprint(currentFingerprint, audioData, silenceWeight, morphProgress) {
  const newFingerprint = { ...currentFingerprint };

  // Example: Adjust silenceTolerance based on how much silence is used
  newFingerprint.silenceTolerance = newFingerprint.silenceTolerance * 0.99 + silenceWeight * 0.01;

  // Example: Adjust tempoTolerance based on average audio amplitude
  newFingerprint.tempoTolerance = newFingerprint.tempoTolerance * 0.99 + audioData.amp * 0.01;

  // Example: Adjust emotionBias based on current emotion value
  newFingerprint.emotionBias = newFingerprint.emotionBias * 0.99 + (audioData.low - audioData.high) * 0.01;

  // Clamp values to a reasonable range (e.g., 0-1 or -1 to 1)
  newFingerprint.silenceTolerance = Math.max(0, Math.min(1, newFingerprint.silenceTolerance));
  newFingerprint.tempoTolerance = Math.max(0, Math.min(1, newFingerprint.tempoTolerance));
  newFingerprint.emotionBias = Math.max(-1, Math.min(1, newFingerprint.emotionBias));

  return newFingerprint;
}
