import { getAnalyserNode } from './AudioInput';

const dataArray = new Uint8Array(512); // Max FFT size for analyserNode

export function getAudioEnergy() {
  const analyser = getAnalyserNode();
  if (!analyser) {
    return { amp: 0, low: 0, mid: 0, high: 0 };
  }

  analyser.getByteFrequencyData(dataArray);

  let low = 0, mid = 0, high = 0;
  const third = dataArray.length / 3;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 255; // Normalize to 0-1
    if (i < third) low += v;
    else if (i < third * 2) mid += v;
    else high += v;
  }

  low /= third;
  mid /= third;
  high /= third;

  const amp = (low + mid + high) / 3;

  return { amp, low, mid, high };
}
