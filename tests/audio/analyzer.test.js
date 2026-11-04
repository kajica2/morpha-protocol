import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeFrame,
  binToFrequency,
  computeBandEnergies,
  computeSpectralFlux,
  computeWaveformStats,
  createAnalyzer,
  getAudioEnergy,
} from '../../src/audio/Analyzer.js';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 512;
const BINS = FFT_SIZE / 2;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE;

/**
 * Builds a synthetic byte spectrum with a single spike at the given bin.
 * @param {number} bin
 * @param {number} [value]
 * @returns {Uint8Array}
 */
function spike(bin, value = 255) {
  const data = new Uint8Array(BINS);
  data[bin] = value;
  return data;
}

/**
 * Builds a synthetic byte spectrum with a flat band of energy.
 * @param {number} fromBin
 * @param {number} toBin
 * @param {number} [value]
 * @returns {Uint8Array}
 */
function band(fromBin, toBin, value = 200) {
  const data = new Uint8Array(BINS);
  for (let i = fromBin; i <= toBin; i++) data[i] = value;
  return data;
}

test('band energies place energy in the expected frequency band', () => {
  // Low band: bins below 250 Hz (bin 1 = 86 Hz, bin 2 = 172 Hz).
  const low = computeBandEnergies(spike(1), BINS, SAMPLE_RATE, FFT_SIZE);
  assert.ok(low.low > 0, 'low band must receive the energy');
  assert.equal(low.mid, 0, 'mid band must stay empty');
  assert.equal(low.high, 0, 'high band must stay empty');

  // Mid band: 250 Hz .. 2500 Hz.
  const mid = computeBandEnergies(spike(10), BINS, SAMPLE_RATE, FFT_SIZE);
  assert.ok(mid.mid > 0, 'mid band must receive the energy');
  assert.equal(mid.low, 0, 'low band must stay empty');
  assert.equal(mid.high, 0, 'high band must stay empty');

  // High band: above 2500 Hz.
  const high = computeBandEnergies(spike(60), BINS, SAMPLE_RATE, FFT_SIZE);
  assert.ok(high.high > 0, 'high band must receive the energy');
  assert.equal(high.low, 0, 'low band must stay empty');
  assert.equal(high.mid, 0, 'mid band must stay empty');
});

test('band boundaries follow frequency, not equal FFT index thirds', () => {
  // A tone at ~5 kHz sits in the high band even though it lives in the first
  // third of the FFT, which the old index-based split mis-classified.
  const highTone = computeBandEnergies(spike(60), BINS, SAMPLE_RATE, FFT_SIZE);
  const lowTone = computeBandEnergies(spike(1), BINS, SAMPLE_RATE, FFT_SIZE);
  assert.ok(highTone.high > lowTone.high);
  assert.ok(lowTone.low > highTone.low);
});

test('amp is the mean of the three band energies and stays in 0..1', () => {
  const result = computeBandEnergies(band(1, 120), BINS, SAMPLE_RATE, FFT_SIZE);
  assert.ok(result.amp >= 0 && result.amp <= 1);
  assert.ok(Math.abs(result.amp - (result.low + result.mid + result.high) / 3) < 1e-12);
});

test('centroid is zero for silence and plausible for a synthetic tone', () => {
  const silence = computeBandEnergies(new Uint8Array(BINS), BINS, SAMPLE_RATE, FFT_SIZE);
  assert.equal(silence.centroid, 0);
  assert.equal(silence.amp, 0);
  assert.equal(silence.rms, 0);

  const toneBin = 20;
  const tone = computeBandEnergies(spike(toneBin), BINS, SAMPLE_RATE, FFT_SIZE);
  const expected = binToFrequency(toneBin, SAMPLE_RATE, FFT_SIZE);
  assert.ok(Math.abs(tone.centroid - expected) < 1, `centroid ${tone.centroid} vs ${expected}`);
  assert.ok(tone.centroid > 1600 && tone.centroid < 1850, `unexpected centroid ${tone.centroid}`);
});

test('centroid of a two-tone spectrum sits between the tones', () => {
  const data = new Uint8Array(BINS);
  data[5] = 255;
  data[40] = 255;
  const result = computeBandEnergies(data, BINS, SAMPLE_RATE, FFT_SIZE);
  const low = binToFrequency(5, SAMPLE_RATE, FFT_SIZE);
  const high = binToFrequency(40, SAMPLE_RATE, FFT_SIZE);
  assert.ok(result.centroid > low && result.centroid < high);
});

test('flux is zero for an identical repeated frame', () => {
  const frame = band(3, 30, 120);
  const first = computeBandEnergies(frame, BINS, SAMPLE_RATE, FFT_SIZE, frame);
  assert.equal(first.flux, 0);
  assert.equal(first.fluxSum, 0);

  const second = computeBandEnergies(frame, BINS, SAMPLE_RATE, FFT_SIZE, frame);
  assert.equal(second.flux, 0);
});

test('flux is positive when a band jumps and zero without a previous frame', () => {
  const previous = new Uint8Array(BINS);
  const current = band(10, 20, 255);

  const withPrevious = computeBandEnergies(current, BINS, SAMPLE_RATE, FFT_SIZE, previous);
  assert.ok(withPrevious.flux > 0, 'flux must react to the jump');
  assert.ok(withPrevious.fluxSum > 0);

  const withoutPrevious = computeBandEnergies(current, BINS, SAMPLE_RATE, FFT_SIZE, null);
  assert.equal(withoutPrevious.flux, 0);
});

test('flux ignores decay: a falling frame yields no positive flux', () => {
  const loud = band(10, 20, 255);
  const quiet = band(10, 20, 40);
  const result = computeBandEnergies(quiet, BINS, SAMPLE_RATE, FFT_SIZE, loud);
  assert.equal(result.flux, 0);
  assert.equal(result.fluxSum, 0);
});

test('computeSpectralFlux is a pure function of the two frames', () => {
  const a = new Uint8Array(BINS);
  const b = new Uint8Array(BINS);
  b[4] = 100;
  assert.equal(computeSpectralFlux(a, b, BINS, 255).sum, 0);
  const result = computeSpectralFlux(b, a, BINS, 255);
  assert.ok(result.sum > 0);
  assert.equal(result.flux, result.sum / BINS);
  assert.equal(computeSpectralFlux(null, a, BINS, 255).sum, 0);
  assert.equal(computeSpectralFlux(a, null, BINS, 255).sum, 0);
});

test('analyzeFrame combines spectrum and waveform into one feature object', () => {
  const frame = band(10, 30, 200);
  const waveform = new Float32Array(FFT_SIZE).fill(0.5);
  const features = analyzeFrame(frame, waveform, SAMPLE_RATE, FFT_SIZE, null);

  for (const key of ['amp', 'low', 'mid', 'high', 'centroid', 'flux', 'rms', 'waveRms', 'peak']) {
    assert.equal(typeof features[key], 'number', `${key} must be a number`);
    assert.ok(Number.isFinite(features[key]), `${key} must be finite`);
  }
  assert.ok(features.peak > 0.49 && features.peak < 0.51);
  assert.ok(features.waveRms > 0.49 && features.waveRms < 0.51);
  assert.ok(features.centroid > 0);
});

test('analyzeFrame tolerates missing waveform data', () => {
  const features = analyzeFrame(band(3, 9, 100), null, SAMPLE_RATE, FFT_SIZE, null);
  assert.equal(features.waveRms, 0);
  assert.equal(features.peak, 0);
  assert.ok(features.amp > 0);
});

test('createAnalyzer tracks the previous frame for flux and resets cleanly', () => {
  const analyzer = createAnalyzer({ sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE });
  const quiet = new Uint8Array(BINS);
  const loud = band(10, 40, 255);

  const first = analyzer.update(quiet, null);
  assert.equal(first.flux, 0);

  const second = analyzer.update(loud, null);
  assert.ok(second.flux > 0, 'the stateful analyser must detect the jump');

  const third = analyzer.update(loud, null);
  assert.equal(third.flux, 0, 'an unchanged frame has no flux');

  analyzer.reset();
  const afterReset = analyzer.update(loud, null);
  assert.equal(afterReset.flux, 0, 'reset drops the previous frame');

  assert.equal(analyzer.getSampleRate(), SAMPLE_RATE);
  assert.equal(analyzer.getFftSize(), FFT_SIZE);
});

test('computeWaveformStats handles float and byte frames', () => {
  const float = new Float32Array(16).fill(0.25);
  const floatStats = computeWaveformStats(float);
  assert.ok(Math.abs(floatStats.rms - 0.25) < 1e-6);
  assert.ok(Math.abs(floatStats.peak - 0.25) < 1e-6);

  const bytes = new Uint8Array(16).fill(128);
  const byteStats = computeWaveformStats(bytes);
  assert.ok(byteStats.rms < 0.02);

  assert.deepEqual(computeWaveformStats(null), { rms: 0, peak: 0 });
  assert.deepEqual(computeWaveformStats(new Float32Array(0)), { rms: 0, peak: 0 });
});

test('flux compares both frames on one shared scale', () => {
  // A byte frame and a float frame must still be compared on the same 0..1
  // scale, otherwise a quiet float frame would look like a huge jump.
  const byteFrame = new Uint8Array(BINS);
  byteFrame[10] = 255;

  const floatFrame = new Float32Array(BINS);
  floatFrame[10] = 1;

  // Both peak at 1.0 in normalised terms, so there is no positive change.
  const byteVsFloat = computeSpectralFlux(byteFrame, floatFrame, BINS);
  assert.ok(byteVsFloat.sum >= 0);
  assert.ok(byteVsFloat.sum < 0.05, `expected no jump, got ${byteVsFloat.sum}`);
});

test('an all-zero frame reports zero amplitude, centroid and rms', () => {
  const result = computeBandEnergies(new Uint8Array(BINS), BINS, SAMPLE_RATE, FFT_SIZE);
  assert.equal(result.amp, 0);
  assert.equal(result.low, 0);
  assert.equal(result.mid, 0);
  assert.equal(result.high, 0);
  assert.equal(result.centroid, 0);
  assert.equal(result.rms, 0);
  assert.equal(result.flux, 0);
});

test('malformed frames are tolerated without throwing', () => {
  const result = computeBandEnergies(null, BINS, SAMPLE_RATE, FFT_SIZE);
  assert.equal(result.amp, 0);
  assert.equal(result.centroid, 0);

  const empty = computeBandEnergies(new Uint8Array(0), 0, SAMPLE_RATE, FFT_SIZE);
  assert.equal(empty.amp, 0);

  const bad = computeBandEnergies([Number.NaN, Number.NaN], 2, SAMPLE_RATE, FFT_SIZE);
  assert.ok(Number.isFinite(bad.amp));
  assert.equal(bad.centroid, 0);
});

test('getAudioEnergy returns a zeroed feature set without a microphone', () => {
  const energy = getAudioEnergy();
  for (const key of ['amp', 'low', 'mid', 'high', 'centroid', 'flux', 'rms']) {
    assert.equal(energy[key], 0);
    assert.ok(Number.isFinite(energy[key]));
  }
});
