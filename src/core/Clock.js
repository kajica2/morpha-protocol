/**
 * Deterministic frame clock for MORPHA.
 *
 * The clock converts millisecond timestamps into simulation seconds and
 * guarantees three things:
 *
 * 1. `delta` (and its alias `dt`) is never negative, even if the injected
 *    time source moves backwards.
 * 2. `delta` is clamped to `maxDelta`, so a backgrounded tab that resumes
 *    after minutes does not teleport the simulation.
 * 3. `frame` is a monotonically increasing integer counter.
 *
 * Time is always injected: `tick(nowMs)` takes an explicit timestamp, and the
 * constructor accepts a `now` function so tests never depend on wall time.
 */

/** Default maximum frame delta in seconds — clamps tab-suspend gaps. */
const DEFAULT_MAX_DELTA = 0.1;

/**
 * Default time source: `performance.now()` when available, else `Date.now()`.
 *
 * @returns {number} Milliseconds since an arbitrary origin.
 */
function defaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Frame clock producing clamped, monotonic frame deltas.
 */
export class Clock {
  /**
   * @param {{ maxDelta?: number, now?: (() => number) | null }} [options]
   *   `maxDelta` — largest delta (seconds) a single tick may report.
   *   `now` — injected millisecond time source; defaults to `performance.now()`.
   */
  constructor(options = {}) {
    const { maxDelta = DEFAULT_MAX_DELTA, now = null } = options;

    if (typeof maxDelta !== 'number' || !Number.isFinite(maxDelta) || maxDelta <= 0) {
      throw new TypeError('Clock maxDelta must be a finite number greater than 0.');
    }

    this.maxDelta = maxDelta;
    /** @type {() => number} Injected time source in milliseconds. */
    this._now = typeof now === 'function' ? now : defaultNow;

    /** Frames elapsed since the last reset (integer, monotonic). */
    this.frame = 0;
    /** Simulation time in seconds since the last reset (sum of clamped deltas). */
    this.elapsed = 0;
    /** Unclamped wall-clock seconds since the last reset. */
    this.wallElapsed = 0;
    /** Delta (seconds) reported by the most recent tick. */
    this.delta = 0;
    /** Timestamp (ms) of the most recent tick, kept as a high-water mark. */
    this.lastTime = null;
    /** Timestamp (ms) at which the current run started. */
    this.startTime = null;
  }

  /**
   * Read the current time from the injected source.
   *
   * @returns {number} Milliseconds.
   */
  now() {
    return this._now();
  }

  /**
   * Advance the clock by one frame.
   *
   * @param {number} [nowMs] Timestamp in milliseconds. When omitted the
   *   injected time source is used.
   * @returns {{ delta: number, elapsed: number, frame: number, dt: number }}
   *   `delta` and `dt` are the same clamped value in **seconds**;
   *   `elapsed` is cumulative simulation seconds; `frame` is the frame index.
   * @throws {TypeError} When `nowMs` is not a finite number.
   */
  tick(nowMs) {
    const t = nowMs === undefined ? this._now() : nowMs;
    if (typeof t !== 'number' || !Number.isFinite(t)) {
      throw new TypeError('Clock.tick expects a finite timestamp in milliseconds.');
    }

    if (this.lastTime === null) {
      // First tick establishes the baseline: zero delta, no time consumed.
      this.lastTime = t;
      this.startTime = t;
      this.frame += 1;
      this.delta = 0;
      return this.snapshot();
    }

    const rawDelta = (t - this.lastTime) / 1000;
    const clamped = rawDelta > 0 ? Math.min(rawDelta, this.maxDelta) : 0;

    this.delta = clamped;
    this.elapsed += clamped;
    this.wallElapsed = Math.max(0, (t - this.startTime) / 1000);
    // Keep the high-water mark so a backwards clock cannot cause a large
    // delta spike once time catches up again.
    if (t > this.lastTime) this.lastTime = t;
    this.frame += 1;

    return this.snapshot();
  }

  /**
   * Reset counters and optionally set a new baseline timestamp.
   *
   * @param {number} [nowMs] Baseline timestamp in milliseconds. When omitted,
   *   the next tick becomes the baseline (reporting a zero delta).
   * @returns {this} The clock, for chaining.
   */
  reset(nowMs) {
    this.frame = 0;
    this.elapsed = 0;
    this.wallElapsed = 0;
    this.delta = 0;
    this.startTime = null;
    this.lastTime = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : null;
    if (this.lastTime !== null) this.startTime = this.lastTime;
    return this;
  }

  /**
   * Snapshot of the current clock values.
   *
   * @returns {{ delta: number, elapsed: number, frame: number, dt: number }}
   *   `dt` is an alias of `delta` for main-loop call sites.
   */
  snapshot() {
    return {
      delta: this.delta,
      elapsed: this.elapsed,
      frame: this.frame,
      dt: this.delta,
    };
  }
}
