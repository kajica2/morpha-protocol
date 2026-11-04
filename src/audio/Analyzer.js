/**
 * Analyzer — audio feature extraction for MORPHA.
 *
 * Two layers live here:
 *
 *  1. Pure DSP helpers (`computeBandEnergies`, `computeSpectralFlux`,
 *     `computeWaveformStats`, `analyzeFrame`) that operate on plain numeric
 *     arrays. They contain no browser references at all and are therefore
 *     unit-testable under plain `node --test`.
 *  2. A thin browser-facing wrapper (`getAudioEnergy`) that pulls the current
 *     frame from the live AnalyserNode and feeds it to the pure layer.
 *
 * Units:
 *  - amp / low / mid / high / rms : normalised magnitudes in 0..1
 *  - centroid : Hz
 *  - flux     : mean positive spectral change per bin, 0..1 (fluxSum: raw sum)
 *
 * Privacy: frames are read from the analyser and immediately reduced to
 * numbers; nothing is persisted or transmitted.
 */

import {
  getAnalyserNode,
  getAudioSampleRate,
  getAudioFftSize,
} from './AudioInput.js';

/** Fallback sample rate (Hz) used when the host does not report one. */
export const DEFAULT_SAMPLE_RATE = 44100;

/** Fallback FFT size used when the host does not report one. */
export const DEFAULT_FFT_SIZE = 512;

/** Lower edge of the audible band (Hz). Bins below this are ignored. */
export const MIN_FREQUENCY_HZ = 20;

/** Upper edge of the audible band (Hz); effectively capped at Nyquist. */
export const MAX_FREQUENCY_HZ = 20000;

/** Upper edge (exclusive) of the low band, in Hz. */
export const LOW_BAND_MAX_HZ = 250;

/** Upper edge (exclusive) of the mid band, in Hz. */
export const MID_BAND_MAX_HZ = 2500;

/**
 * Clamps a value into [min, max]; non-finite input collapses to `min`.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * Clamps a value into [0, 1]; non-finite input collapses to 0.
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return clamp(value, 0, 1);
}

/**
 * Returns `value` when it is a finite number, otherwise `fallback`.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Resolves how many leading bins of a frame should be analysed.
 * @param {{length:number}|null|undefined} data
 * @param {number} sampleCount
 * @returns {number} A non-negative bin count.
 */
function resolveSampleCount(data, sampleCount) {
  const available = data && typeof data.length === 'number' ? data.length : 0;
  const requested = finite(sampleCount, available);
  if (requested <= 0) return 0;
  return Math.min(Math.floor(requested), available);
}

/**
 * Decides the normalisation scale for a magnitude frame.
 *
 * Byte frames (Uint8Array, 0..255) are divided by 255. Float frames whose
 * peak is <= 1 are treated as already-normalised.
 *
 * @param {{length:number}|null} data
 * @param {number} count
 * @returns {number} The divisor to apply to raw magnitudes.
 */
function resolveScale(data, count) {
  if (!data || count <= 0) return 255;
  const isByteArray = typeof Uint8Array !== 'undefined' && (data instanceof Uint8Array || data instanceof Uint8ClampedArray);
  if (isByteArray) return 255;

  let peak = 0;
  for (let i = 0; i < count; i++) {
    const raw = finite(data[i], 0);
    if (raw > peak) peak = raw;
  }
  return peak <= 1 ? 1 : 255;
}

/**
 * Computes the frequency (Hz) represented by an FFT bin.
 * @param {number} index
 * @param {number} sampleRate
 * @param {number} fftSize
 * @returns {number}
 */
export function binToFrequency(index, sampleRate, fftSize) {
  const rate = finite(sampleRate, DEFAULT_SAMPLE_RATE);
  const size = finite(fftSize, DEFAULT_FFT_SIZE);
  if (size <= 0) return 0;
  return (index * rate) / size;
}

/**
 * Computes the frequency band energies and spectral descriptors of one frame.
 *
 * Bands are split by FREQUENCY (Hz), not by equal FFT index thirds:
 * low < 250 Hz, mid 250..2500 Hz, high > 2500 Hz. Only bins inside the
 * audible band (20 Hz .. min(20000 Hz, Nyquist)) contribute.
 *
 * @param {Uint8Array|number[]} frequencyData Byte magnitudes (0..255) from an analyser.
 * @param {number} sampleCount Number of leading bins to analyse.
 * @param {number} sampleRate Context sample rate in Hz.
 * @param {number} fftSize Analyser FFT size.
 * @param {Uint8Array|number[]|null} [previousFrequencyData] Previous frame, used for flux.
 * @returns {{amp:number, low:number, mid:number, high:number, centroid:number, flux:number, fluxSum:number, rms:number}}
 */
export function computeBandEnergies(frequencyData, sampleCount, sampleRate, fftSize, previousFrequencyData = null) {
  const data = frequencyData && typeof frequencyData.length === 'number' ? frequencyData : null;
  const count = resolveSampleCount(data, sampleCount);
  const rateValue = finite(sampleRate, DEFAULT_SAMPLE_RATE);
  const rate = rateValue > 0 ? rateValue : DEFAULT_SAMPLE_RATE;
  const sizeValue = finite(fftSize, DEFAULT_FFT_SIZE);
  const size = sizeValue > 0 ? sizeValue : DEFAULT_FFT_SIZE;

  const scale = resolveScale(data, count);
  const binWidth = rate / size;
  const topHz = Math.min(MAX_FREQUENCY_HZ, rate / 2);

  let lowSum = 0;
  let lowCount = 0;
  let midSum = 0;
  let midCount = 0;
  let highSum = 0;
  let highCount = 0;
  let magnitudeSum = 0;
  let magnitudeCount = 0;
  let squareSum = 0;
  let weightedFrequencySum = 0;

  for (let i = 0; i < count; i++) {
    const frequency = i * binWidth;
    if (frequency < MIN_FREQUENCY_HZ || frequency > topHz) continue;

    const magnitude = clamp01(finite(data[i], 0) / scale);
    magnitudeSum += magnitude;
    magnitudeCount += 1;
    squareSum += magnitude * magnitude;
    weightedFrequencySum += magnitude * frequency;

    if (frequency < LOW_BAND_MAX_HZ) {
      lowSum += magnitude;
      lowCount += 1;
    } else if (frequency < MID_BAND_MAX_HZ) {
      midSum += magnitude;
      midCount += 1;
    } else {
      highSum += magnitude;
      highCount += 1;
    }
  }

  const low = lowCount > 0 ? lowSum / lowCount : 0;
  const mid = midCount > 0 ? midSum / midCount : 0;
  const high = highCount > 0 ? highSum / highCount : 0;
  const amp = (low + mid + high) / 3;
  const centroid = magnitudeSum > 0 ? weightedFrequencySum / magnitudeSum : 0;
  const rms = magnitudeCount > 0 ? Math.sqrt(squareSum / magnitudeCount) : 0;

  const flux = computeSpectralFlux(data, previousFrequencyData, count);

  return { amp, low, mid, high, centroid, flux: flux.flux, fluxSum: flux.sum, rms };
}

/**
 * Computes positive spectral flux between two frames: the amount of energy
 * that APPEARED since the previous frame (onset / change detection).
 *
 * Only positive differences contribute; decays are ignored.
 *
 * @param {Uint8Array|number[]|null} currentFrame
 * @param {Uint8Array|number[]|null} previousFrame
 * @param {number} [sampleCount]
 * @param {number|null} [scale] Optional shared normalisation divisor. When
 *   omitted, each frame is normalised by its own type-aware rule, so a byte
 *   frame (0..255) and a normalised float frame (0..1) end up on the same
 *   0..1 scale and are directly comparable.
 * @returns {{flux:number, sum:number}} Normalised mean positive change and its raw sum.
 */
export function computeSpectralFlux(currentFrame, previousFrame, sampleCount, scale = null) {
  if (!currentFrame || !previousFrame) return { flux: 0, sum: 0 };
  if (typeof previousFrame.length !== 'number') return { flux: 0, sum: 0 };

  const count = resolveSampleCount(currentFrame, sampleCount);
  const shared = scale === null ? null : finite(scale, 255);
  const currentDivisor = shared !== null && shared > 0 ? shared : resolveScale(currentFrame, count);
  const previousDivisor = shared !== null && shared > 0 ? shared : resolveScale(previousFrame, count);

  let sum = 0;
  let considered = 0;

  for (let i = 0; i < count; i++) {
    const current = finite(currentFrame[i], 0) / currentDivisor;
    const previous = finite(previousFrame[i], 0) / previousDivisor;
    const delta = current - previous;
    if (delta > 0) sum += delta;
    considered += 1;
  }

  return { flux: considered > 0 ? sum / considered : 0, sum };
}

/**
 * Computes RMS and peak of a time-domain frame.
 *
 * Accepts float frames in -1..1 (getFloatTimeDomainData) as well as byte
 * frames in 0..255 (getByteTimeDomainData); the scale is detected from the peak.
 *
 * @param {Float32Array|number[]|null} timeDomainData
 * @returns {{rms:number, peak:number}} Both normalised to 0..1.
 */
export function computeWaveformStats(timeDomainData) {
  if (!timeDomainData || typeof timeDomainData.length !== 'number' || timeDomainData.length === 0) {
    return { rms: 0, peak: 0 };
  }

  let peak = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const raw = Math.abs(finite(timeDomainData[i], 0));
    if (raw > peak) peak = raw;
  }
  if (peak === 0) return { rms: 0, peak: 0 };

  const byteScaled = peak > 1.5;
  let squareSum = 0;
  let normalisedPeak = 0;

  for (let i = 0; i < timeDomainData.length; i++) {
    const raw = finite(timeDomainData[i], 0);
    const value = byteScaled ? (raw - 128) / 127 : raw;
    const magnitude = Math.abs(value);
    if (magnitude > normalisedPeak) normalisedPeak = magnitude;
    squareSum += value * value;
  }

  return {
    rms: clamp01(Math.sqrt(squareSum / timeDomainData.length)),
    peak: clamp01(normalisedPeak),
  };
}

/**
 * Analyses one complete frame (spectrum + optional waveform) into the full
 * MORPHA feature object. Pure: no state, no browser access.
 *
 * @param {Uint8Array|number[]} frequencyData Byte magnitudes (0..255).
 * @param {Float32Array|number[]|null} [timeDomainData] Optional waveform samples.
 * @param {number} sampleRate Context sample rate in Hz.
 * @param {number} fftSize Analyser FFT size.
 * @param {Uint8Array|number[]|null} [previousFrequencyData] Previous spectrum frame (for flux).
 * @returns {{amp:number, low:number, mid:number, high:number, centroid:number, flux:number, fluxSum:number, rms:number, waveRms:number, peak:number}}
 */
export function analyzeFrame(frequencyData, timeDomainData, sampleRate, fftSize, previousFrequencyData = null) {
  const hasSpectrum = frequencyData && typeof frequencyData.length === 'number';
  const count = resolveSampleCount(hasSpectrum ? frequencyData : null, hasSpectrum ? frequencyData.length : 0);

  const bands = computeBandEnergies(frequencyData, count, sampleRate, fftSize, previousFrequencyData);
  const wave = computeWaveformStats(timeDomainData);

  return {
    ...bands,
    waveRms: wave.rms,
    peak: wave.peak,
  };
}

/**
 * Creates a stateful analyser that remembers the previous spectrum frame so
 * that spectral flux can be computed frame after frame.
 *
 * @param {{sampleRate?:number, fftSize?:number}} [options]
 * @returns {{update:(frequencyData:Uint8Array|number[], timeDomainData?:Float32Array|number[]|null)=>object, reset:()=>void, configure:(next:{sampleRate?:number, fftSize?:number})=>void, getSampleRate:()=>number, getFftSize:()=>number}}
 */
export function createAnalyzer({ sampleRate = DEFAULT_SAMPLE_RATE, fftSize = DEFAULT_FFT_SIZE } = {}) {
  let previousFrame = null;
  let rate = finite(sampleRate, DEFAULT_SAMPLE_RATE) > 0 ? finite(sampleRate, DEFAULT_SAMPLE_RATE) : DEFAULT_SAMPLE_RATE;
  let size = finite(fftSize, DEFAULT_FFT_SIZE) > 0 ? finite(fftSize, DEFAULT_FFT_SIZE) : DEFAULT_FFT_SIZE;

  return {
    /**
     * Analyses a frame and stores it as the reference for the next flux computation.
     * @param {Uint8Array|number[]} frequencyData
     * @param {Float32Array|number[]|null} [timeDomainData]
     * @returns {object} The feature object for this frame.
     */
    update(frequencyData, timeDomainData = null) {
      const features = analyzeFrame(frequencyData, timeDomainData, rate, size, previousFrame);
      previousFrame = frequencyData && typeof frequencyData.length === 'number'
        ? frequencyData.slice()
        : null;
      return features;
    },

    /** Forgets the previous frame (the next update reports zero flux). */
    reset() {
      previousFrame = null;
    },

    /** @returns {number} The sample rate (Hz) used for bin-to-Hz conversion. */
    getSampleRate() {
      return rate;
    },

    /** @returns {number} The FFT size used for bin-to-Hz conversion. */
    getFftSize() {
      return size;
    },

    /**
     * Updates the sample rate / FFT size (e.g. after the context was recreated).
     * @param {{sampleRate?:number, fftSize?:number}} next
     */
    configure(next = {}) {
      const nextRate = finite(next.sampleRate, rate);
      const nextSize = finite(next.fftSize, size);
      if (nextRate > 0) rate = nextRate;
      if (nextSize > 0) size = nextSize;
    },
  };
}

/** Reusable buffers for the live analyser path. */
let liveFrequencyBuffer = null;
let liveTimeBuffer = null;

/** Previous live spectrum frame, kept for flux across calls. */
let livePreviousFrame = null;

/**
 * Returns a byte buffer sized for the analyser's frequency bin count.
 * @param {number} length
 * @returns {Uint8Array}
 */
function getFrequencyBuffer(length) {
  if (!liveFrequencyBuffer || liveFrequencyBuffer.length !== length) {
    liveFrequencyBuffer = new Uint8Array(length);
  }
  return liveFrequencyBuffer;
}

/**
 * Returns a float buffer sized for the analyser's time domain length.
 * @param {number} length
 * @returns {Float32Array}
 */
function getTimeBuffer(length) {
  if (!liveTimeBuffer || liveTimeBuffer.length !== length) {
    liveTimeBuffer = new Float32Array(length);
  }
  return liveTimeBuffer;
}

/**
 * Backwards-compatible live energy accessor.
 *
 * Reads the current frame from the live AnalyserNode and reduces it to the
 * band energies. When no analyser exists (no microphone, or a non-browser
 * environment) a zeroed feature object is returned.
 *
 * @returns {{amp:number, low:number, mid:number, high:number, centroid:number, flux:number, fluxSum:number, rms:number, waveRms:number, peak:number}}
 */
export function getAudioEnergy() {
  const analyser = getAnalyserNode();
  if (!analyser) {
    return {
      amp: 0, low: 0, mid: 0, high: 0,
      centroid: 0, flux: 0, fluxSum: 0, rms: 0,
      waveRms: 0, peak: 0,
    };
  }

  const sampleRate = getAudioSampleRate()
    || (analyser.context && typeof analyser.context.sampleRate === 'number' ? analyser.context.sampleRate : null)
    || DEFAULT_SAMPLE_RATE;
  const fftSize = getAudioFftSize() || analyser.fftSize || DEFAULT_FFT_SIZE;
  const binCount = typeof analyser.frequencyBinCount === 'number'
    ? analyser.frequencyBinCount
    : Math.floor(fftSize / 2);

  const frequencyData = getFrequencyBuffer(Math.max(1, binCount));
  analyser.getByteFrequencyData(frequencyData);

  let timeDomainData = null;
  if (typeof analyser.getFloatTimeDomainData === 'function' && typeof analyser.fftSize === 'number') {
    timeDomainData = getTimeBuffer(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeDomainData);
  }

  const features = analyzeFrame(frequencyData, timeDomainData, sampleRate, fftSize, livePreviousFrame);
  livePreviousFrame = frequencyData.slice();
  return features;
}
