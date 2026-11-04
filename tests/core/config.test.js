import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, validateConfig, resolveConfig } from '../../src/core/Config.js';

test('the default configuration is frozen and valid', () => {
  assert.ok(Object.isFrozen(DEFAULT_CONFIG));
  const result = validateConfig(DEFAULT_CONFIG);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('the default configuration covers every documented key', () => {
  for (const key of [
    'maxOverlappingGlyphs',
    'glyphFadeTime',
    'morphDuration',
    'silenceThreshold',
    'silenceSaturationTime',
    'pointSize',
    'sampleRate',
    'enableAudio',
    'reducedMotion',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key), `missing ${key}`);
  }
});

test('a missing key is reported by name', () => {
  const cfg = { ...DEFAULT_CONFIG };
  delete cfg.sampleRate;
  const result = validateConfig(cfg);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /sampleRate/);
});

test('wrong types are rejected and named', () => {
  const result = validateConfig({ ...DEFAULT_CONFIG, pointSize: '2' });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /pointSize/);
  assert.match(result.errors[0], /number/);
});

test('booleans are enforced for flags', () => {
  const result = validateConfig({ ...DEFAULT_CONFIG, enableAudio: 'yes', reducedMotion: 1 });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /enableAudio/);
  assert.match(result.errors[1], /reducedMotion/);
});

test('maxOverlappingGlyphs must be a positive integer', () => {
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, maxOverlappingGlyphs: 0 }).valid, false);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, maxOverlappingGlyphs: -3 }).valid, false);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, maxOverlappingGlyphs: 2.5 }).valid, false);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, maxOverlappingGlyphs: 4 }).valid, true);
});

test('durations must be finite and greater than zero', () => {
  for (const key of ['glyphFadeTime', 'morphDuration', 'silenceSaturationTime', 'pointSize']) {
    assert.equal(validateConfig({ ...DEFAULT_CONFIG, [key]: 0 }).valid, false, key);
    assert.equal(validateConfig({ ...DEFAULT_CONFIG, [key]: -1 }).valid, false, key);
    assert.equal(validateConfig({ ...DEFAULT_CONFIG, [key]: Number.NaN }).valid, false, key);
    assert.equal(validateConfig({ ...DEFAULT_CONFIG, [key]: Number.POSITIVE_INFINITY }).valid, false, key);
  }
});

test('silenceThreshold must sit between zero and one', () => {
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, silenceThreshold: 0 }).valid, true);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, silenceThreshold: 1 }).valid, true);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, silenceThreshold: -0.1 }).valid, false);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, silenceThreshold: 1.1 }).valid, false);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, silenceThreshold: Number.NaN }).valid, false);
});

test('sampleRate must be a positive integer within range', () => {
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, sampleRate: 48000 }).valid, true);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, sampleRate: 0 }).valid, false);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, sampleRate: 44100.5 }).valid, false);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, sampleRate: 1e9 }).valid, false);
});

test('a non-object configuration is rejected', () => {
  for (const bad of [null, undefined, 42, 'cfg', []]) {
    const result = validateConfig(bad);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
  }
});

test('unknown keys are reported without invalidating the config', () => {
  const result = validateConfig({ ...DEFAULT_CONFIG, wibble: 1 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.unknownKeys, ['wibble']);
});

test('every error names the offending key', () => {
  const result = validateConfig({
    ...DEFAULT_CONFIG,
    maxOverlappingGlyphs: 0,
    glyphFadeTime: -1,
    pointSize: 'x',
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.some((e) => e.includes('maxOverlappingGlyphs')));
  assert.ok(result.errors.some((e) => e.includes('glyphFadeTime')));
  assert.ok(result.errors.some((e) => e.includes('pointSize')));
});

test('resolveConfig merges partial configs over the defaults', () => {
  const cfg = resolveConfig({ pointSize: 4 });
  assert.equal(cfg.pointSize, 4);
  assert.equal(cfg.morphDuration, DEFAULT_CONFIG.morphDuration);
  assert.ok(Object.isFrozen(cfg));
});

test('resolveConfig throws on an invalid value', () => {
  assert.throws(() => resolveConfig({ pointSize: -1 }), TypeError);
});
