// MORPHA Loop
// Ensures captured video loops seamlessly

import Config from '../core/Config.js';

/**
 * Determines the ideal loop point for seamless playback
 * Returns timestamp where glyph state is most similar to start
 */
export function findLoopPoint(glyphStates, startState, minDuration = 3.0) {
  if (glyphStates.length < 2) return glyphStates.length - 1;

  let bestIdx = Math.floor(minDuration * Config.CAPTURE_FPS);
  let lowestDifference = Infinity;

  // Search for state most similar to start state
  for (let i = bestIdx; i < glyphStates.length; i++) {
    const difference = calculateStateDifference(startState, glyphStates[i]);

    if (difference < lowestDifference) {
      lowestDifference = difference;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Calculates difference between two glyph states
 */
function calculateStateDifference(stateA, stateB) {
  // Compare morph progress, opacity, and other visual properties
  let diff = 0;

  diff += Math.abs((stateA.morphProgress || 0) - (stateB.morphProgress || 0));
  diff += Math.abs((stateA.opacity || 1) - (stateB.opacity || 1));
  diff += Math.abs((stateA.glyphCount || 0) - (stateB.glyphCount || 0));

  return diff;
}

/**
 * Creates smooth transition frames between end and start for perfect loop
 */
export function createLoopTransition(endFrame, startFrame, transitionFrames = 5) {
  const transition = [];

  for (let i = 0; i < transitionFrames; i++) {
    const t = i / transitionFrames;
    // Simple linear interpolation for now
    // Could use easing for smoother transition
    transition.push({
      morphProgress: endFrame.morphProgress * (1 - t) + startFrame.morphProgress * t,
      opacity: endFrame.opacity * (1 - t) + startFrame.opacity * t
    });
  }

  return transition;
}

export default {
  findLoopPoint,
  createLoopTransition
};
