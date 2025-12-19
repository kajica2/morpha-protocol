// MORPHA Engine
// Core lifecycle and orchestration

import Clock from './Clock.js';
import State, { RitualState } from './State.js';

class Engine {
  constructor() {
    this.clock = new Clock();
    this.state = new State();
    this.isRunning = false;
    this.animationFrameId = null;
    this.updateCallbacks = [];
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.state.setState(RitualState.ACTIVE, this.clock.getGlobalTime());
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.state.setState(RitualState.DORMANT, this.clock.getGlobalTime());
  }

  loop(timestamp = 0) {
    if (!this.isRunning) return;

    // Update clock
    const deltaTime = this.clock.update(timestamp);
    const globalTime = this.clock.getGlobalTime();

    // Call all registered update callbacks
    this.updateCallbacks.forEach(callback => {
      callback(deltaTime, globalTime);
    });

    // Continue loop
    this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
  }

  onUpdate(callback) {
    this.updateCallbacks.push(callback);
  }

  removeUpdateCallback(callback) {
    this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
  }

  setClock(clock) {
    this.clock = clock;
  }

  setState(state) {
    this.state.setState(state, this.clock.getGlobalTime());
  }

  getState() {
    return this.state.getState();
  }

  reset() {
    this.stop();
    this.clock.reset();
    this.state = new State();
    this.updateCallbacks = [];
  }
}

export default Engine;
