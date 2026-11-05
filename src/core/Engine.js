/**
 * Deterministic orchestration layer for MORPHA.
 *
 * The Engine binds three pure pieces together:
 *
 * - `Clock` — frame timing, with tab-suspend gaps clamped.
 * - `State` — the flat, observable runtime state.
 * - `Config` — validated configuration (defaults + a strict gate).
 *
 * It contains no DOM access, no WebGL, no timers and no audio code: time is
 * always injected by the caller, so the whole engine runs headlessly under
 * `node --test`.
 *
 * Protocol invariants enforced here:
 *
 * - **Never cut, only morph.** `morphProgress` moves toward `morphTarget` at a
 *   bounded rate and is additionally capped per tick, so no frame delta — not
 *   even a huge one — can teleport the morph.
 * - **Silence is input.** Silence raises the morph's resistance, slowing it
 *   down. It never stops the morph dead: resistance is bounded, so the field
 *   keeps breathing through silence.
 * - **Influence, not command.** The engine never sets a morph target on the
 *   caller's behalf; it only accelerates or resists the target that others
 *   provide.
 */

import { Clock } from './Clock.js';
import { State } from './State.js';
import { DEFAULT_CONFIG, resolveConfig } from './Config.js';
import { clamp } from '../utils/Math.js';

/**
 * Maximum change of `morphProgress` allowed in a single tick (0..1 range).
 * This is the hard cap that keeps a morph continuous even if a caller injects
 * an enormous frame delta.
 *
 * @type {number}
 */
export const MAX_MORPH_STEP_PER_TICK = 0.2;

/**
 * Extra morph resistance applied at full silence weight. Resistance is a
 * divisor, so the morph slows but never stops: at silence weight 1 the morph
 * runs at 1 / (1 + 4) = 20% of its base rate.
 *
 * @type {number}
 */
export const SILENCE_RESISTANCE = 4;

/**
 * Rate multiplier applied when `config.reducedMotion` is enabled.
 *
 * @type {number}
 */
export const REDUCED_MOTION_FACTOR = 0.25;

/**
 * Deterministic MORPHA engine.
 */
export class Engine {
  /**
   * @param {Record<string, unknown>} [config=DEFAULT_CONFIG] Partial or full
   *   configuration. Missing keys fall back to {@link DEFAULT_CONFIG}; invalid
   *   values throw a `TypeError` naming the offending key.
   * @param {{ maxDelta?: number }} [options] Engine options.
   *   `maxDelta` — largest frame delta (seconds) the clock may report.
   */
  constructor(config = DEFAULT_CONFIG, options = {}) {
    this.config = resolveConfig(config);
    this.clock = new Clock({ maxDelta: options.maxDelta ?? 0.1 });
    this.state = new State();

    /** @type {Set<(frame: object) => void>} */
    this._observers = new Set();

    this._running = false;
    this._disposed = false;
  }

  /**
   * Start the engine and establish the clock baseline.
   *
   * @param {number} [nowMs] Timestamp in milliseconds. When omitted the
   *   clock's time source is used.
   * @returns {this} The engine, for chaining.
   */
  start(nowMs) {
    this._assertUsable();
    const start = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : this.clock.now();
    this.clock.reset(start);
    this._running = true;
    return this;
  }

  /**
   * Pause the engine and release every registered observer.
   *
   * Stopping releases observers so no callback outlives the engine. Register
   * `onFrame` handlers again after a subsequent `start()`.
   *
   * @returns {this} The engine, for chaining.
   */
  stop() {
    this._running = false;
    this._observers.clear();
    return this;
  }

  /**
   * Advance the engine by one frame.
   *
   * @param {number} [nowMs] Timestamp in milliseconds. When omitted the
   *   clock's time source is used.
   * @returns {object|null} The frame payload, or `null` when the engine is
   *   stopped or disposed.
   */
  tick(nowMs) {
    if (this._disposed || !this._running) return null;

    const frame = this.clock.tick(nowMs);
    const dt = frame.delta;

    this._updateMorph(dt);
    this._publish(frame);

    return this._framePayload(frame);
  }

  /**
   * Register a frame observer.
   *
   * @param {(frame: object) => void} observer Called once per tick with the
   *   frame payload.
   * @returns {() => void} Unsubscribe function.
   * @throws {TypeError} When `observer` is not a function.
   */
  onFrame(observer) {
    if (typeof observer !== 'function') {
      throw new TypeError('Engine.onFrame expects a function.');
    }
    this._observers.add(observer);
    return () => {
      this._observers.delete(observer);
    };
  }

  /**
   * Subscribe to state changes.
   *
   * @param {(values: Readonly<Record<string, unknown>>, patch: Record<string, unknown>) => void} fn Listener.
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(fn) {
    return this.state.subscribe(fn);
  }

  /**
   * Current state values.
   *
   * @returns {Readonly<Record<string, unknown>>} Frozen snapshot of the state.
   */
  getState() {
    return this.state.get();
  }

  /**
   * The live state store, for direct subscription or mutation.
   *
   * @returns {State} The state instance owned by this engine.
   */
  getStateStore() {
    return this.state;
  }

  /**
   * The validated configuration in use.
   *
   * @returns {Readonly<Record<string, number|boolean>>} Frozen configuration.
   */
  getConfig() {
    return this.config;
  }

  /**
   * Accumulate (or clear) silence and recompute the silence weight.
   *
   * This is the documented way silence enters the engine. The resulting
   * weight is mirrored into `state.silenceWeight` and `state.silenceDuration`
   * so observers can see it.
   *
   * @param {number} dt Elapsed time in seconds.
   * @param {boolean} silent True when the input is currently silent.
   * @returns {number} The new silence weight, 0..1.
   */
  updateSilence(dt, silent) {
    this._assertUsable();
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const snapshot = this.state.get();

    const duration = silent ? snapshot.silenceDuration + step : 0;
    const saturation = this.config.silenceSaturationTime * (1 + snapshot.silenceTolerance);
    const weight = clamp(duration / Math.max(saturation, 1e-6), 0, 1);

    this.state.set({ silenceDuration: duration, silenceWeight: weight });

    return weight;
  }

  /**
   * Set the silence weight directly, bypassing accumulation.
   *
   * Useful when an external analyser already computed a weight.
   *
   * @param {number} weight Silence weight, 0..1 (values outside are clamped).
   * @returns {number} The applied silence weight.
   */
  setSilenceWeight(weight) {
    this._assertUsable();
    const value = clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
    this.state.set({ silenceWeight: value });
    return value;
  }

  /**
   * Feed silence into the engine from an external detector.
   *
   * Two values are supplied deliberately. `isSilent` is the detector's
   * hysteresis-aware boolean, which drives the duration accumulator so a
   * borderline input does not chatter it on and off. `weight` is the
   * detector's continuous value, which overrides the engine's own coarse
   * ramp so the resistance the morph feels is smooth.
   *
   * Passing only a boolean would discard the smoothing and make resistance
   * step, which the protocol treats as silence halting the morph rather than
   * biasing it.
   *
   * @param {number} dt Frame delta in seconds.
   * @param {boolean} isSilent Whether the detector currently reads silence.
   * @param {number} weight Continuous silence weight, 0..1.
   * @returns {number} The applied silence weight, 0..1.
   */
  feedSilence(dt, isSilent, weight) {
    this._assertUsable();
    this.updateSilence(dt, isSilent === true);
    return this.setSilenceWeight(weight);
  }

  /**
   * The current silence weight, 0..1.
   *
   * @returns {number} Silence weight.
   */
  getSilenceWeight() {
    return this.state.get().silenceWeight;
  }

  /**
   * Set the morph target (where `morphProgress` is heading).
   *
   * The engine never sets this itself: a target is an influence offered from
   * outside, and the engine only decides how quickly the field travels there.
   *
   * @param {number} target Target progress, 0..1 (values outside are clamped).
   * @returns {number} The applied target.
   */
  setMorphTarget(target) {
    this._assertUsable();
    const value = clamp(Number.isFinite(target) ? target : 0, 0, 1);
    this.state.set({ morphTarget: value });
    return value;
  }

  /**
   * Release every observer and subscriber. The engine cannot be used after
   * disposal.
   *
   * @returns {this} The engine, for chaining.
   */
  dispose() {
    this._observers.clear();
    this.state.dispose();
    this._running = false;
    this._disposed = true;
    return this;
  }

  /**
   * Whether the engine is currently running.
   *
   * @returns {boolean} True between `start()` and `stop()`/`dispose()`.
   */
  isRunning() {
    return this._running;
  }

  /**
   * Advance `morphProgress` toward `morphTarget` at a bounded rate.
   *
   * The morph moves linearly toward the target at `rate` progress units per
   * second, where the rate is the base rate (`1 / morphDuration`) softened by
   * `morphSoftness`, divided by the silence resistance, and dampened by
   * `reducedMotion`. The per-tick change is finally capped by
   * {@link MAX_MORPH_STEP_PER_TICK}.
   *
   * @param {number} dt Frame delta in seconds.
   */
  _updateMorph(dt) {
    const snapshot = this.state.get();
    const current = clamp(snapshot.morphProgress, 0, 1);
    const target = clamp(snapshot.morphTarget, 0, 1);
    const remaining = target - current;

    if (remaining === 0) return;

    const baseRate = 1 / this.config.morphDuration;
    const softnessFactor = 1 - 0.5 * clamp(snapshot.morphSoftness, 0, 1);
    const resistance = 1 + SILENCE_RESISTANCE * clamp(snapshot.silenceWeight, 0, 1);
    const motionFactor = this.config.reducedMotion ? REDUCED_MOTION_FACTOR : 1;

    const rate = (baseRate * softnessFactor * motionFactor) / resistance;
    const step = clamp(remaining, -rate * dt, rate * dt);
    const capped = clamp(step, -MAX_MORPH_STEP_PER_TICK, MAX_MORPH_STEP_PER_TICK);

    this.state.set({ morphProgress: clamp(current + capped, 0, 1) });
  }

  /**
   * Notify observers of a completed frame.
   *
   * @param {{ delta: number, elapsed: number, frame: number, dt: number }} frame Clock frame.
   */
  _publish(frame) {
    if (this._observers.size === 0) return;
    const payload = this._framePayload(frame);
    for (const observer of [...this._observers]) {
      observer(payload);
    }
  }

  /**
   * Build the frame payload handed to observers.
   *
   * @param {{ delta: number, elapsed: number, frame: number, dt: number }} frame Clock frame.
   * @returns {object} Frame payload.
   */
  _framePayload(frame) {
    const snapshot = this.state.get();
    return {
      frame: frame.frame,
      delta: frame.delta,
      dt: frame.dt,
      elapsed: frame.elapsed,
      silenceWeight: snapshot.silenceWeight,
      silenceDuration: snapshot.silenceDuration,
      state: snapshot,
    };
  }

  /**
   * Throw when the engine can no longer be used.
   *
   * @throws {Error} When the engine has been disposed.
   */
  _assertUsable() {
    if (this._disposed) {
      throw new Error('Engine has been disposed and can no longer be used.');
    }
  }
}
