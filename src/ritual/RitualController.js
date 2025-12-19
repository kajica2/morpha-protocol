// MORPHA Ritual Controller
// Orchestrates the ritual experience

import { getRitualPhase, RitualPhase } from './States.js';

class RitualController {
  constructor() {
    this.currentPhase = RitualPhase.DORMANT;
    this.phaseStartTime = 0;
    this.phaseListeners = [];
  }

  update(globalTime, silenceWeight, glyphCount) {
    const newPhase = getRitualPhase(globalTime, silenceWeight, glyphCount);

    if (newPhase !== this.currentPhase) {
      this.onPhaseChange(newPhase, globalTime);
    }

    return this.currentPhase;
  }

  onPhaseChange(newPhase, timestamp) {
    const oldPhase = this.currentPhase;
    this.currentPhase = newPhase;
    this.phaseStartTime = timestamp;

    console.log(`Ritual phase: ${oldPhase} ’ ${newPhase}`);

    // Notify listeners
    this.phaseListeners.forEach(listener => {
      listener(newPhase, oldPhase, timestamp);
    });
  }

  addPhaseListener(callback) {
    this.phaseListeners.push(callback);
  }

  getCurrentPhase() {
    return this.currentPhase;
  }

  getTimeInPhase(currentTime) {
    return currentTime - this.phaseStartTime;
  }
}

export default RitualController;
