import { Renderer } from './render/Renderer';
import { Glyph } from './glyphs/Glyph';
import { GlyphQueue } from './glyphs/GlyphQueue';
import { loadGlyphData, createGlyphFromPhoneme, getRandomPhoneme } from './glyphs/GlyphFactory';
import { initAudioInput, stopAudioInput } from './audio/AudioInput';
import { getAudioEnergy } from './audio/Analyzer';
import { updateSilence, getSilenceWeight } from './audio/Silence';
import { loadUserFingerprint, saveUserFingerprint, updateUserFingerprint } from './storage/SessionStore';
import { CanvasCapture } from './export/Capture';
import { initGoogleAuth, handleAuthClick, isAuthorized, isAuthAvailable } from './storage/DriveAuth';
import { uploadFileToDrive } from './storage/DriveUpload';

console.log("MORPHA Implementation Initialized");

let renderer;
let glyphQueue;
let animationFrameId;
let lastTime = 0;
let globalTime = 0;
let nextGlyphTime = 0; // Timer for adding new glyphs
let userFingerprint = {}; // Loaded from session store
let canvasCapture;

let longPressTimer = null;
const LONG_PRESS_DURATION = 1000; // 1 second for long press

const entryRitual = document.getElementById('entry-ritual');
const authButton = document.createElement('button');
authButton.textContent = 'Link Google Drive';
authButton.style.cssText = 'position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 10px 20px; background: #333; color: #e6e6e6; border: none; cursor: pointer; opacity: 0.7;';
authButton.onclick = async () => {
  try {
    await handleAuthClick();
    authButton.style.display = 'none';
    console.log("Google Drive authorized.");
  } catch (error) {
    console.error("Google Drive authorization failed:", error);
    alert("Failed to authorize Google Drive.");
  }
};

// Append auth button to body, but keep it hidden initially
document.body.appendChild(authButton);
authButton.style.display = 'none';

entryRitual.addEventListener('click', async () => {
  entryRitual.style.display = 'none';
  userFingerprint = loadUserFingerprint(); // Load fingerprint at start

  // The ritual starts on its own terms: microphone + glyph data.
  const audioReady = await initAudioInput();
  if (!audioReady) {
    alert("Microphone access denied. Cannot start MORPHA ritual.");
    return;
  }

  await loadGlyphData(); // Load glyph data before starting ritual
  startRitual();

  // Google Drive linking is optional and runs in the background. A missing or
  // expired API key must never delay or block the ritual.
  initGoogleAuth()
    .then(() => {
      // Only offer the button when Drive is actually usable. With a missing
      // or expired key the link cannot succeed, so do not present a dead
      // control.
      if (isAuthAvailable() && !isAuthorized()) {
        authButton.style.display = 'block';
      }
    })
    .catch((error) => {
      console.warn('MORPHA: Google Drive linking unavailable.', error?.message || error);
    });
}, { once: true });

function startRitual() {
  const appContainer = document.getElementById('app');
  renderer = new Renderer(appContainer);
  glyphQueue = new GlyphQueue(renderer); // Initialize GlyphQueue with the renderer
  canvasCapture = new CanvasCapture(renderer.renderer.domElement); // Initialize capture

  // Protocol grammar: "At least two symbol instances MUST overlap at all
  // times." An utterance opens with overlapping symbols, not a lone glyph.
  addRandomGlyph();
  addRandomGlyph();

  setupInteractionListeners();
  animate();
}

function setupInteractionListeners() {
  const canvas = renderer.renderer.domElement;

  canvas.addEventListener('mousedown', startLongPress);
  canvas.addEventListener('touchstart', startLongPress);

  canvas.addEventListener('mouseup', cancelLongPress);
  canvas.addEventListener('touchend', cancelLongPress);
  canvas.addEventListener('mouseout', cancelLongPress); // Cancel if mouse leaves canvas
  canvas.addEventListener('touchcancel', cancelLongPress);
}

function startLongPress(event) {
  event.preventDefault(); // Prevent default touch behavior like scrolling
  longPressTimer = setTimeout(() => {
    console.log("Long press detected - initiating save ritual.");
    saveCurrentRitual();
    longPressTimer = null; // Reset timer after action
  }, LONG_PRESS_DURATION);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

async function saveCurrentRitual() {
  console.log("Saving ritual...");
  canvasCapture.start(async (videoBlob) => {
    console.log("Video captured:", videoBlob);

    if (isAuthorized()) {
      try {
        const fileName = `morpha_ritual_${Date.now()}.webm`;
        const metadata = { description: "MORPHA ritual video artifact" };
        await uploadFileToDrive(videoBlob, fileName, 'video/webm', metadata);
        alert("Ritual saved to Google Drive!");
      } catch (error) {
        console.error("Failed to upload to Google Drive:", error);
        alert("Failed to save ritual to Google Drive. Check console for details.");
      }
    } else {
      alert("Google Drive not linked. Please link your Google Drive to save rituals.");
      authButton.style.display = 'block'; // Show auth button again
      // Fallback to local download if not authorized
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `morpha_ritual_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Also save the current user fingerprint after a significant interaction
    saveUserFingerprint(userFingerprint);
  });
}

function addRandomGlyph() {
  const phoneme = getRandomPhoneme();
  const newGlyph = createGlyphFromPhoneme(phoneme, globalTime, userFingerprint);
  if (newGlyph) {
    glyphQueue.addGlyph(newGlyph.geometry, newGlyph.family, globalTime, newGlyph.semanticWeight);
  }
  nextGlyphTime = globalTime + (Math.random() * 3 + 2); // Next glyph in 2-5 seconds
}

function animate(time = 0) {
  animationFrameId = requestAnimationFrame(animate);
  const deltaTime = (time - lastTime) * 0.001; // Convert to seconds
  lastTime = time;
  globalTime += deltaTime;

  const audioData = getAudioEnergy();
  const silenceDuration = updateSilence(deltaTime);
  const silenceWeight = getSilenceWeight();

  // Update user fingerprint dynamically
  userFingerprint = updateUserFingerprint(userFingerprint, audioData, silenceWeight, glyphQueue.queue.length > 0 ? glyphQueue.queue[glyphQueue.queue.length - 1].morphProgress : 0);

  // Morph progress influenced by silence. Silence is input, not an absence:
  // it slows the warp and dims the field rather than halting it.
  let morphProgress = (Math.sin(globalTime * 0.0005) + 1) / 2; // Base morph
  if (silenceDuration > 0.5) { // If silence is detected for a significant duration
    morphProgress = glyphQueue.queue.length > 0 ? glyphQueue.queue[glyphQueue.queue.length - 1].morphProgress : 0; // Keep current morph value
    renderer.sharedUniforms.uWarp.value = 0.1; // Reduce warp during silence
  } else {
    renderer.sharedUniforms.uWarp.value = audioData.mid * 0.8; // Resume audio-driven warp
  }

  // Update glyph queue and individual glyphs
  glyphQueue.update(deltaTime, globalTime, audioData, silenceWeight, userFingerprint);

  // Update renderer global uniforms (e.g., uTime, uAudio, uWarp, uBreath, uColorA, uColorB)
  if (renderer) {
    renderer.update(deltaTime, audioData, globalTime, userFingerprint);

    // Per-glyph uniforms only. The global ones (uTime, uAudio, uWarp,
    // uBreath, uColorA, uColorB) are shared by reference across every glyph
    // material, so renderer.update() already reaches them.
    glyphQueue.queue.forEach(glyph => {
      if (glyph.mesh) {
        glyph.mesh.material.uniforms.uMorph.value = glyph.morphProgress;
        glyph.mesh.material.uniforms.uOpacity.value = glyph.currentOpacity;
        glyph.mesh.material.uniforms.uEmotion.value = userFingerprint.emotionBias || 0;
      }
    });

    // Remove inactive glyphs from the scene
    glyphQueue.queue.filter(g => !g.isActive).forEach(g => {
      if (g.mesh) {
        renderer.removeGlyphMesh(g.mesh);
        g.mesh = null; // Clear reference
      }
    });
  }

  // Add new glyphs based on time
  if (globalTime >= nextGlyphTime) {
    addRandomGlyph();
  }
}

// Optional: Stop animation if needed
export function stopRitual() {
  cancelAnimationFrame(animationFrameId);
  stopAudioInput();
  if (glyphQueue) {
    glyphQueue.dispose();
    glyphQueue = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
}