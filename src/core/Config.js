// MORPHA Core Configuration
// Global constants and configuration for the MORPHA protocol

export const Config = {
  // Timing
  DEFAULT_MORPH_DURATION: 5.0,  // seconds
  MIN_GLYPH_OVERLAP: 2,          // minimum overlapping glyphs
  MAX_GLYPH_OVERLAP: 4,          // maximum overlapping glyphs
  GLYPH_ADD_INTERVAL_MIN: 2.0,   // seconds
  GLYPH_ADD_INTERVAL_MAX: 5.0,   // seconds

  // Audio
  SILENCE_THRESHOLD: 0.03,       // amplitude threshold for silence detection
  SILENCE_SATURATION_TIME: 3.0,  // seconds for full silence weight
  FFT_SIZE: 512,                 // analyzer FFT size

  // Glyphs
  GLYPH_VERTEX_COUNT: 256,       // normalized vertex count per glyph
  GLYPH_NORMALIZED_SCALE: 2.0,   // normalized coordinate space (-1 to 1)

  // Visual
  DEFAULT_BREATH: 0.4,           // breathing motion intensity
  DEFAULT_WARP: 0.3,             // deformation intensity
  SILENCE_WARP_REDUCTION: 0.1,   // warp during silence
  SILENCE_OPACITY: 0.7,          // opacity during silence

  // User Fingerprint
  DEFAULT_COLOR_A: [0.9, 0.9, 1.0],  // cool white
  DEFAULT_COLOR_B: [1.0, 0.9, 0.8],  // warm white
  EMOTION_DRIFT_SPEED: 0.01,     // how fast emotion changes
  FINGERPRINT_STORAGE_KEY: 'morpha_user_fingerprint',

  // Capture
  CAPTURE_DURATION: 6.0,         // seconds for loop capture
  CAPTURE_FPS: 30,               // frames per second

  // Ritual
  LONG_PRESS_DURATION: 1000,     // milliseconds
  ENTRY_FADE_DURATION: 3000,     // milliseconds
};

export default Config;
