/**
 * AudioInput — the only module in the audio layer that touches the Web Audio API.
 *
 * Responsibilities:
 *  - ask for microphone access and wire a MediaStreamSource into an AnalyserNode;
 *  - expose the sample rate / FFT size the analysis layer needs for Hz conversion;
 *  - release every resource on stop (tracks stopped, source disconnected, context closed).
 *
 * Privacy: raw microphone audio stays in memory inside the AudioContext and is
 * never written to disk, never persisted and never transmitted.
 *
 * The module is import-safe under plain Node: every browser global is touched
 * lazily inside functions, never at module evaluation time.
 */

/** FFT size used for analysis (bins = fftSize / 2). */
const FFT_SIZE = 512;

/** Analyser smoothing (0 = raw/jittery, 1 = very slow) applied to the raw bins. */
const SMOOTHING_TIME_CONSTANT = 0.8;

let audioContext = null;
let mediaStreamSource = null;
let analyserNode = null;
let mediaStream = null;

/**
 * Returns the AudioContext constructor if the host exposes one.
 * @returns {Function|null} Browser AudioContext constructor or null when unavailable.
 */
function getAudioContextConstructor() {
  const scope = typeof globalThis !== 'undefined' ? globalThis : {};
  return scope.AudioContext || scope.webkitAudioContext || null;
}

/**
 * Returns the MediaDevices API if the host exposes one.
 * @returns {MediaDevices|null} The MediaDevices interface or null when unavailable.
 */
function getMediaDevices() {
  const scope = typeof globalThis !== 'undefined' ? globalThis : {};
  const nav = scope.navigator;
  return nav && nav.mediaDevices ? nav.mediaDevices : null;
}

/**
 * Requests microphone access and builds the analysis chain.
 *
 * Safe to call repeatedly: an existing live context is reused.
 * @returns {Promise<boolean>} True when the analyser chain is live, false on failure.
 */
export async function initAudioInput() {
  const AudioContextCtor = getAudioContextConstructor();
  const mediaDevices = getMediaDevices();

  if (!AudioContextCtor || !mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    return false;
  }

  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContextCtor();
    }

    if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      await audioContext.resume();
    }

    const stream = await mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;

    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = FFT_SIZE;
    analyserNode.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;

    // The analyser is intentionally NOT connected to the destination: monitoring
    // the microphone through the speakers would create feedback.
    mediaStreamSource.connect(analyserNode);
    return true;
  } catch (err) {
    console.error('Audio input unavailable:', err && err.message ? err.message : err);
    return false;
  }
}

/**
 * Returns the live AnalyserNode, or null when audio input is not initialised.
 * @returns {AnalyserNode|null}
 */
export function getAnalyserNode() {
  return analyserNode;
}

/**
 * Returns the live AudioContext, or null when audio input is not initialised.
 * @returns {AudioContext|null}
 */
export function getAudioContext() {
  return audioContext;
}

/**
 * Returns the current context sample rate in Hz (e.g. 44100), or null when
 * no context exists yet.
 * @returns {number|null}
 */
export function getAudioSampleRate() {
  return audioContext && typeof audioContext.sampleRate === 'number' ? audioContext.sampleRate : null;
}

/**
 * Returns the FFT size currently configured on the analyser, or null when no
 * analyser exists yet.
 * @returns {number|null}
 */
export function getAudioFftSize() {
  return analyserNode && typeof analyserNode.fftSize === 'number' ? analyserNode.fftSize : null;
}

/**
 * Releases the microphone: stops every MediaStreamTrack, disconnects the source
 * and closes the AudioContext. Calling it repeatedly is safe (never throws).
 * @returns {Promise<void>|void} Resolves once the context close settles, when applicable.
 */
export function stopAudioInput() {
  try {
    if (mediaStreamSource && typeof mediaStreamSource.disconnect === 'function') {
      mediaStreamSource.disconnect();
    }
  } catch (err) {
    // A disconnected node throws in some engines; ignore — we are tearing down anyway.
  }

  const stream = mediaStream || (mediaStreamSource && mediaStreamSource.mediaStream) || null;
  if (stream && typeof stream.getTracks === 'function') {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (err) {
        // Ignore: stopping an already stopped track must not break teardown.
      }
    }
  }

  let closing = null;
  if (audioContext && audioContext.state !== 'closed' && typeof audioContext.close === 'function') {
    try {
      closing = audioContext.close();
      if (closing && typeof closing.catch === 'function') {
        closing = closing.catch(() => {});
      }
    } catch (err) {
      closing = null;
    }
  }

  audioContext = null;
  mediaStreamSource = null;
  analyserNode = null;
  mediaStream = null;

  return closing || undefined;
}
