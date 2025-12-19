// MORPHA Ritual States
// Defines the ritual state machine

export const RitualPhase = {
  DORMANT: 'dormant',
  ENTRY: 'entry',
  EMERGENCE: 'emergence',
  NEGOTIATION: 'negotiation',
  RESOLUTION: 'resolution',
  LISTENING: 'listening',
  SAVING: 'saving',
  DISSOLVING: 'dissolving'
};

export function getRitualPhase(globalTime, silenceWeight, glyphCount) {
  // Simple phase detection based on time and state

  if (globalTime < 3) {
    return RitualPhase.ENTRY;
  }

  if (silenceWeight > 0.8) {
    return RitualPhase.LISTENING;
  }

  if (glyphCount < 2) {
    return RitualPhase.EMERGENCE;
  }

  if (glyphCount >= 2 && glyphCount < 4) {
    return RitualPhase.NEGOTIATION;
  }

  return RitualPhase.RESOLUTION;
}

export default {
  RitualPhase,
  getRitualPhase
};
