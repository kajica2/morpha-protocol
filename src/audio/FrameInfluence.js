// The per-frame influence chain.
//
// The ritual needs three things from the audio each frame: the live
// structural influence, the remembered influence, and the decaying
// distortion that the memory produces. Threading them by hand through the
// render loop is how the wrong value ends up being passed.
//
// This module owns the chain so the call site cannot misuse it. In
// particular it takes the ENGINE'S FRAME and reads the delta from it,
// rather than accepting a loose number. The bug this prevents: the render
// loop once passed `globalTime` (the total elapsed time) where the frame
// delta was expected. That made the phase accumulator integrate the whole
// runtime on every frame - at 30 seconds in, the phase had run to 22.5
// radians instead of the ~0.005 a 0.3 rad/s drift produces - and it
// saturated the direction filter's factor `(1 - exp(-dt/tau))` at 1,
// disabling the smoothing entirely.
//
// Passing the frame rather than a number means the total elapsed time
// cannot reach the integrator even by accident.

import { createInfluenceMapper } from './AudioMap.js';
import { InfluenceMemory } from '../core/InfluenceMemory.js';

/**
 * @typedef {object} InfluenceChain
 * @property {(features: object, deltaTime: number) => object} update
 *   Advance the chain by one frame. The returned influence carries a
 *   `distortion` property.
 * @property {(frame: object, features: object) => object} updateFrame
 *   Advance the chain using the engine's frame. The delta is read from
 *   the frame, so the caller cannot pass the wrong value.
 * @property {() => void} reset
 */

/**
 * Create the influence chain.
 *
 * @param {object} [options] Chain options.
 * @param {object} [options.mapper] The influence mapper. One is created if
 *   none is supplied.
 * @param {object} [options.memory] The temporal memory. One is created if
 *   none is supplied.
 * @param {number} [options.strength] The memory's strength, 0..1.
 * @returns {InfluenceChain} The chain.
 */
export function createInfluenceChain(options = {}) {
  const mapper = options.mapper ?? createInfluenceMapper();
  const memory = options.memory ?? new InfluenceMemory({ strength: options.strength });

  /**
   * Advance the chain by one frame.
   *
   * @param {object} features The audio features for this frame.
   * @param {number} deltaTime The frame delta in seconds.
   * @returns {object} The influence, carrying its distortion.
   */
  const update = (features, deltaTime) => {
    const raw = mapper.update(features, deltaTime);
    const { influence, distortion } = memory.update(raw, deltaTime);
    // The distortion rides on the influence, so every consumer of the
    // influence sees it without needing a second channel.
    return { ...influence, distortion };
  };

  return {
    update,

    /**
     * Advance the chain using the engine's frame.
     *
     * @param {object} frame The engine's frame. Only `frame.delta` is read.
     * @param {object} features The audio features for this frame.
     * @returns {object} The influence, carrying its distortion.
     */
    updateFrame(frame, features) {
      // The delta is read from the frame, never from the caller, and the
      // total elapsed time is deliberately not read at all.
      const deltaTime = Number.isFinite(frame?.delta) ? frame.delta : 0;
      return update(features, deltaTime);
    },

    /** Clears both the mapper and the memory. */
    reset() {
      mapper.reset();
      memory.reset();
    },
  };
}
