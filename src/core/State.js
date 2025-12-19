// MORPHA State Management
// Manages the current ritual state

export const RitualState = {
  DORMANT: 'dormant',         // Before ritual starts
  AWAKENING: 'awakening',     // Entry ritual
  ACTIVE: 'active',           // Main ritual running
  LISTENING: 'listening',     // Deep silence state
  SAVING: 'saving',           // Capturing moment
  DISSOLVING: 'dissolving'    // Ending ritual
};

class State {
  constructor() {
    this.current = RitualState.DORMANT;
    this.previousState = null;
    this.stateStartTime = 0;
    this.listeners = [];
  }

  setState(newState, timestamp = 0) {
    if (this.current !== newState) {
      this.previousState = this.current;
      this.current = newState;
      this.stateStartTime = timestamp;
      this.notifyListeners(newState, this.previousState);
    }
  }

  getState() {
    return this.current;
  }

  getTimeInState(currentTime) {
    return currentTime - this.stateStartTime;
  }

  is(state) {
    return this.current === state;
  }

  wasInState(state) {
    return this.previousState === state;
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  notifyListeners(newState, oldState) {
    this.listeners.forEach(listener => {
      listener(newState, oldState);
    });
  }
}

export default State;
