// MORPHA Clock
// Time management with silence influence

import Config from './Config.js';

class Clock {
  constructor() {
    this.globalTime = 0;
    this.deltaTime = 0;
    this.lastFrameTime = 0;
    this.silenceInfluence = 0;  // 0 to 1
    this.timeScale = 1.0;        // Can be modified by silence
  }

  update(timestamp) {
    // timestamp in milliseconds, convert to seconds
    const currentTime = timestamp * 0.001;
    this.deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Apply time scaling (influenced by silence)
    const scaledDelta = this.deltaTime * this.timeScale;
    this.globalTime += scaledDelta;

    return scaledDelta;
  }

  setSilenceInfluence(silenceWeight) {
    // Silence stretches time by reducing time scale
    this.silenceInfluence = silenceWeight;

    // When silence is strong, slow down time significantly
    // Map silence weight 0-1 to time scale 1.0-0.3
    this.timeScale = 1.0 - (silenceWeight * 0.7);
  }

  getGlobalTime() {
    return this.globalTime;
  }

  getDeltaTime() {
    return this.deltaTime;
  }

  getTimeScale() {
    return this.timeScale;
  }

  reset() {
    this.globalTime = 0;
    this.deltaTime = 0;
    this.lastFrameTime = 0;
    this.silenceInfluence = 0;
    this.timeScale = 1.0;
  }
}

export default Clock;
