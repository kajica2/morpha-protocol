import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAnalyserNode,
  getAudioContext,
  getAudioFftSize,
  getAudioSampleRate,
  initAudioInput,
  stopAudioInput,
} from '../../src/audio/AudioInput.js';

test('the module imports cleanly outside a browser', () => {
  assert.equal(typeof initAudioInput, 'function');
  assert.equal(typeof getAnalyserNode, 'function');
  assert.equal(typeof getAudioContext, 'function');
  assert.equal(typeof stopAudioInput, 'function');
  assert.equal(typeof getAudioSampleRate, 'function');
  assert.equal(typeof getAudioFftSize, 'function');
});

test('no analyser or context exists before initialisation', () => {
  assert.equal(getAnalyserNode(), null);
  assert.equal(getAudioContext(), null);
  assert.equal(getAudioSampleRate(), null);
  assert.equal(getAudioFftSize(), null);
});

test('initAudioInput fails gracefully without a browser media API', async () => {
  const result = await initAudioInput();
  assert.equal(result, false, 'initialisation must fail cleanly without mediaDevices');
  assert.equal(getAnalyserNode(), null);
});

test('stopAudioInput is safe to call twice and never throws', async () => {
  await stopAudioInput();
  await stopAudioInput();
  assert.equal(getAnalyserNode(), null);
  assert.equal(getAudioContext(), null);
});
