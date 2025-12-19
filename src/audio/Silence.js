import { getAudioEnergy } from './Analyzer';

const SILENCE_THRESHOLD = 0.03; // Amplitude below this is considered silence
const SILENCE_SATURATION_TIME = 1.2; // Seconds of continuous silence to fully activate effect

let silenceDuration = 0;

export function updateSilence(deltaTime) {
  const { amp } = getAudioEnergy();

  if (amp < SILENCE_THRESHOLD) {
    silenceDuration += deltaTime;
  } else {
    silenceDuration = 0;
  }

  // Clamp silenceDuration to avoid excessively large values
  return Math.min(silenceDuration, SILENCE_SATURATION_TIME);
}

export function getSilenceWeight() {
  return Math.min(silenceDuration / SILENCE_SATURATION_TIME, 1.0);
}

export function isSilent() {
  return getAudioEnergy().amp < SILENCE_THRESHOLD;
}
