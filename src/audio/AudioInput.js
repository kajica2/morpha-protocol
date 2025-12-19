let audioContext;
let mediaStreamSource;
let analyserNode;

export async function initAudioInput() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512; // Set FFT size for frequency analysis

    mediaStreamSource.connect(analyserNode);
    console.log("Microphone access granted and audio input initialized.");
    return true;
  } catch (err) {
    console.error("Error accessing microphone:", err);
    return false;
  }
}

export function getAnalyserNode() {
  return analyserNode;
}

export function getAudioContext() {
  return audioContext;
}

export function stopAudioInput() {
  if (mediaStreamSource && mediaStreamSource.mediaStream) {
    mediaStreamSource.mediaStream.getTracks().forEach(track => track.stop());
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  audioContext = null;
  mediaStreamSource = null;
  analyserNode = null;
  console.log("Audio input stopped and context closed.");
}
