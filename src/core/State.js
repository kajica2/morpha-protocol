/**
 * Runtime state for MORPHA.
 *
 * State is the single source of truth for mutable runtime values. It is
 * **flat by design**: every value is a primitive (number, string, boolean or
 * null). Nested objects are rejected, because a nested object would let a
 * caller mutate state in place without notifying subscribers — the silent
 * mutation that breaks observability and replay.
 *
 * Subscribers are notified synchronously after every change.
 */

/**
 * Default state values.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const DEFAULT_STATE = Object.freeze({
  /** Breath phase, 0..1 — slow rhythmic motion of the field. */
  breath: 0,
  /** Primary colour as a 24-bit hex integer (0xRRGGBB). */
  colorA: 0x3355ff,
  /** Secondary colour as a 24-bit hex integer (0xRRGGBB). */
  colorB: 0xff5599,
  /** Emotional bias, 0..1 — bias toward a dominant emotional register. */
  emotionBias: 0,
  /** How much silence is tolerated before the field reacts, 0..1. */
  silenceTolerance: 0.5,
  /** How much tempo variance is tolerated, 0..1. */
  tempoTolerance: 0.5,
  /** Morph resistance, 0..1 — 0 free, 1 maximally resistant (slowest). */
  morphSoftness: 0.5,
  /** Colour drift speed in normalised units per second (>= 0). */
  colorDriftSpeed: 0.1,
  /** Silence weight, 0..1 — 1 means fully saturated silence. */
  silenceWeight: 0,
  /** Current morph progress, 0..1 — continuous, never set discontinuously. */
  morphProgress: 0,
  /** Morph target, 0..1 — where `morphProgress` is heading. */
  morphTarget: 0,
  /** Accumulated silence duration in seconds. */
  silenceDuration: 0,
});

/**
 * Assert that a value may be stored in the flat state shape.
 *
 * @param {string} key State key being written.
 * @param {unknown} value Candidate value.
 * @throws {TypeError} When the value is not a finite primitive.
 */
function assertFlatValue(key, value) {
  if (value === null) return;
  if (value === undefined) {
    throw new TypeError(`State value "${key}" must be a primitive, received undefined.`);
  }
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`State value "${key}" must be a finite number, received ${value}.`);
    }
    return;
  }
  if (type === 'string' || type === 'boolean') return;
  throw new TypeError(
    `State value "${key}" must be a primitive (number, string, boolean or null); ` +
      `received ${type}. MORPHA state is flat by design so nested mutation cannot happen silently.`
  );
}

/**
 * Mutable runtime state with shallow-merge updates and change notification.
 */
export class State {
  /**
   * @param {Record<string, unknown>} [initial] Optional initial overrides,
   *   validated with the same rules as {@link State#set}.
   */
  constructor(initial = {}) {
    /** @type {Record<string, unknown>} */
    this._values = { ...DEFAULT_STATE };
    /** @type {Set<(values: Readonly<Record<string, unknown>>, patch: Record<string, unknown>) => void>} */
    this._subscribers = new Set();

    if (initial && typeof initial === 'object' && Object.keys(initial).length > 0) {
      this.set(initial);
    }
  }

  /**
   * Read a snapshot of the current values.
   *
   * @returns {Readonly<Record<string, unknown>>} Frozen shallow copy — mutating
   *   it never affects the live state.
   */
  get() {
    return Object.freeze({ ...this._values });
  }

  /**
   * Shallow-merge a patch into the state.
   *
   * @param {Record<string, unknown>} patch Values to merge. Values must be
   *   finite primitives; nested objects are rejected.
   * @returns {this} The state, for chaining.
   * @throws {TypeError} When the patch or one of its values is invalid.
   */
  set(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('State.set expects a plain object patch.');
    }

    const keys = Object.keys(patch);
    for (const key of keys) {
      assertFlatValue(key, patch[key]);
    }
    for (const key of keys) {
      this._values[key] = patch[key];
    }

    this._notify(patch);
    return this;
  }

  /**
   * Subscribe to state changes.
   *
   * @param {(values: Readonly<Record<string, unknown>>, patch: Record<string, unknown>) => void} fn
   *   Listener invoked synchronously after every `set` and `reset`.
   * @returns {() => void} Unsubscribe function.
   * @throws {TypeError} When `fn` is not a function.
   */
  subscribe(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('State.subscribe expects a function.');
    }
    this._subscribers.add(fn);
    return () => {
      this._subscribers.delete(fn);
    };
  }

  /**
   * Restore the default values.
   *
   * @returns {this} The state, for chaining.
   */
  reset() {
    this._values = { ...DEFAULT_STATE };
    this._notify({});
    return this;
  }

  /**
   * Drop every subscriber. Used by the engine's `dispose()` so no listener
   * outlives the engine.
   */
  dispose() {
    this._subscribers.clear();
  }

  /**
   * Notify subscribers, isolating listener failures so one bad listener
   * cannot stop the others from being called.
   *
   * @param {Record<string, unknown>} patch The applied patch.
   * @throws {unknown} The first listener error, rethrown after all listeners ran.
   */
  _notify(patch) {
    if (this._subscribers.size === 0) return;
    const snapshot = this.get();
    let firstError = null;
    for (const fn of [...this._subscribers]) {
      try {
        fn(snapshot, patch);
      } catch (error) {
        if (firstError === null) firstError = error;
      }
    }
    if (firstError !== null) throw firstError;
  }
}

/**
 * Factory for a new state instance.
 *
 * @param {Record<string, unknown>} [initial] Optional initial overrides.
 * @returns {State} A new state.
 */
export function createState(initial = {}) {
  return new State(initial);
}
