/**
 * Deterministic, layered ambient particle field for the MORPHA renderer.
 *
 * Pure JavaScript: no three.js, no DOM, no timers, no global state. The
 * module owns the SIMULATION only - the renderer reads the particle state
 * and draws it. That split is what makes the field testable without a GPU
 * and keeps the protocol rules checkable in unit tests rather than in a
 * screenshot.
 *
 * The rules the implementation obeys:
 *
 *  - DETERMINISM: the initial placement comes from `createSeededRandom(seed)`
 *    and the drift from `createNoise(seed)`. The same seed always produces
 *    the same field, frame for frame; a different seed produces a different
 *    field. That is what makes a ritual replayable and comparable.
 *  - NO CUTS (protocol section 6, "No symbol MAY be removed without decay"):
 *    every particle has a life. It fades in from zero, holds, and fades out
 *    to exactly zero. Only then may it be re-seeded at a new position. A
 *    particle is never teleported while it is visible.
 *  - ENERGY BIASES MOTION (protocol section 3.3, "Energy MUST bias motion,
 *    not directly map to appearance"): audio energy changes the drift speed
 *    and direction. It never touches alpha or size.
 *  - SILENCE IS INPUT (protocol section 3.4, "Absence MUST NOT be treated
 *    as zero"): with no energy the field settles into a slow drift; it never
 *    stops.
 *  - CONTINUITY (protocol section 6): reduced motion damps the drift
 *    through `motionScale`; it never freezes the field.
 *
 * ALPHA IS A PURE FUNCTION OF LIFE. That is deliberate. It makes "energy
 * does not change appearance" exactly true rather than approximately true,
 * and it keeps the re-seed instant the only frame in which a position may
 * change discontinuously.
 */

import { createNoise } from '../utils/Noise.js';
import {
  clamp,
  createSeededRandom,
  lerp,
  normalizeSeed,
  wrap,
} from '../utils/Math.js';

/**
 * @typedef {object} ParticleFieldConfig
 * @property {number} count           Particles in the field.
 * @property {number} layerCount      Depth planes the particles are spread over.
 * @property {number|string} seed     Deterministic seed. Strings are hashed.
 * @property {number} width           Field width in field units.
 * @property {number} height          Field height in field units.
 * @property {number} minLife         Shortest particle life, in seconds.
 * @property {number} maxLife         Longest particle life, in seconds.
 * @property {number} driftSpeed      Base drift speed, in field units per second.
 * @property {number} noiseScale      Scale of the noise lookup, in field units.
 * @property {number} baseSize        Base particle size, in field units.
 * @property {number} sizeVariation   Relative size spread around `baseSize`.
 * @property {number} fadeInRatio     Fraction of the life spent fading in.
 * @property {number} fadeOutRatio    Fraction of the life spent fading out.
 * @property {number} parallaxMin     Parallax factor of the farthest plane.
 * @property {number} parallaxMax     Parallax factor of the nearest plane.
 * @property {number} sizeMin         Size scale of the farthest plane.
 * @property {number} sizeMax         Size scale of the nearest plane.
 * @property {number} opacityMin      Opacity scale of the farthest plane.
 * @property {number} opacityMax      Opacity scale of the nearest plane.
 * @property {number} energySpeedGain Extra drift speed at full energy.
 * @property {number} energyTurn      Drift direction rotation at full energy, radians.
 * @property {number} noiseTimeScale  How fast the noise field evolves.
 * @property {number} minMotionScale  Smallest motion scale the field accepts.
 */

/**
 * @typedef {object} ParticleLayer
 * @property {number} index         Layer index. 0 is the farthest plane.
 * @property {number} depth         Nominal depth of the plane, 0 (far) .. 1 (near).
 * @property {number} depthMin      Lower edge of the plane's depth band.
 * @property {number} depthMax      Upper edge of the plane's depth band.
 * @property {number} parallax      Parallax factor: how strongly the plane drifts.
 * @property {number} sizeScale     Multiplier applied to the particle size.
 * @property {number} opacityScale  Opacity scale of the plane. NOT baked into
 *   the particle alpha - the renderer applies it as per-layer draw state,
 *   so the particle alpha stays a pure 0..1 life envelope.
 */

/**
 * @typedef {object} Particle
 * @property {number} x        Position along x, in field units. Always inside the bounds.
 * @property {number} y        Position along y, in field units. Always inside the bounds.
 * @property {number} depth    Per-particle depth, 0 (far) .. 1 (near).
 * @property {number} layer    Index of the depth plane the particle belongs to.
 * @property {number} alpha    Opacity, 0..1. Reaches exactly 0 before the particle is re-seeded.
 * @property {number} size     Size in field units. Never affected by energy.
 * @property {number} life     Seconds elapsed in the current life.
 * @property {number} maxLife  Total length of the current life, in seconds.
 * @property {number} vx       Current drift velocity along x, in field units per second.
 * @property {number} vy       Current drift velocity along y, in field units per second.
 */

/**
 * Default configuration of the ambient particle field.
 *
 * The field is 2x2 field units so that it maps one-to-one onto the
 * renderer's normalised viewport; the renderer is free to scale it.
 *
 * @type {Readonly<ParticleFieldConfig>}
 */
export const DEFAULT_PARTICLE_CONFIG = Object.freeze({
  count: 320,
  layerCount: 3,
  seed: 1,
  width: 2,
  height: 2,
  minLife: 6,
  maxLife: 18,
  driftSpeed: 0.06,
  noiseScale: 0.35,
  baseSize: 1,
  sizeVariation: 0.4,
  fadeInRatio: 0.25,
  fadeOutRatio: 0.35,
  parallaxMin: 0.25,
  parallaxMax: 1,
  sizeMin: 0.5,
  sizeMax: 1.5,
  opacityMin: 0.35,
  opacityMax: 1,
  energySpeedGain: 1.5,
  energyTurn: 0.9,
  noiseTimeScale: 0.08,
  minMotionScale: 0.05,
});

/** A particle that is alive: visible, or fading in. */
const STATE_ALIVE = 'alive';

/** A particle whose fade-out has completed: invisible, awaiting re-seeding. */
const STATE_HIDDEN = 'hidden';

/**
 * Returns `value` when it is a finite number, otherwise `fallback`.
 *
 * @param {unknown} value Value to check.
 * @param {number} [fallback=0] Value used when `value` is not finite.
 * @returns {number} A finite number.
 */
function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Smoothstep curve, clamped to 0..1. C1 continuous, so the fade has no
 * visible kink where it meets the hold.
 *
 * @param {number} t Input, normally 0..1.
 * @returns {number} Eased value in 0..1.
 */
function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * The opacity envelope of a particle's life.
 *
 * The particle fades in over the first `fadeInRatio` of its life, holds at
 * full opacity, then fades out over the last `fadeOutRatio`. It is exactly
 * 0 before the life starts and exactly 0 once the life is over, so the
 * re-seed instant is always invisible.
 *
 * @param {number} phase        Normalised life, 0..1.
 * @param {number} fadeInRatio  Fraction of the life spent fading in.
 * @param {number} fadeOutRatio Fraction of the life spent fading out.
 * @returns {number} Opacity in 0..1.
 */
function fadeCurve(phase, fadeInRatio, fadeOutRatio) {
  if (!(phase > 0) || phase >= 1) return 0;
  if (phase < fadeInRatio) return smoothstep(phase / fadeInRatio);
  const out = (1 - phase) / fadeOutRatio;
  if (out < 1) return smoothstep(out);
  return 1;
}

/**
 * Build the per-layer draw configuration for a stack of depth planes.
 *
 * Layer 0 is the FAR plane and the last layer is the NEAR one. Far planes
 * drift less (a smaller parallax factor), are smaller and are dimmer, which
 * is what gives the field depth instead of a flat haze.
 *
 * @param {number} [layerCount=3] Number of depth planes.
 * @param {object} [options] Scale options.
 * @param {number} [options.parallaxMin=0.25] Parallax factor of the farthest plane.
 * @param {number} [options.parallaxMax=1] Parallax factor of the nearest plane.
 * @param {number} [options.sizeMin=0.5] Size scale of the farthest plane.
 * @param {number} [options.sizeMax=1.5] Size scale of the nearest plane.
 * @param {number} [options.opacityMin=0.35] Opacity scale of the farthest plane.
 * @param {number} [options.opacityMax=1] Opacity scale of the nearest plane.
 * @returns {ReadonlyArray<ParticleLayer>} Frozen layer descriptors, far to near.
 */
export function createLayerConfig(layerCount = 3, options = {}) {
  const count = Math.max(1, Math.floor(finite(layerCount, 3)));
  const parallaxMin = finite(options.parallaxMin, 0.25);
  const parallaxMax = finite(options.parallaxMax, 1);
  const sizeMin = finite(options.sizeMin, 0.5);
  const sizeMax = finite(options.sizeMax, 1.5);
  const opacityMin = finite(options.opacityMin, 0.35);
  const opacityMax = finite(options.opacityMax, 1);

  const layers = [];
  for (let i = 0; i < count; i += 1) {
    const depthMin = i / count;
    const depthMax = (i + 1) / count;
    const depth = (depthMin + depthMax) / 2;
    layers.push(Object.freeze({
      index: i,
      depth,
      depthMin,
      depthMax,
      parallax: lerp(parallaxMin, parallaxMax, depth),
      sizeScale: lerp(sizeMin, sizeMax, depth),
      opacityScale: lerp(opacityMin, opacityMax, depth),
    }));
  }
  return Object.freeze(layers);
}

/**
 * Normalise a user configuration into a complete, sane configuration.
 *
 * Every value is finite and inside a usable range, so a malformed
 * configuration degrades to the default rather than producing a field that
 * cannot be drawn.
 *
 * @param {Partial<ParticleFieldConfig>} [config] User configuration.
 * @returns {ParticleFieldConfig} The resolved configuration.
 */
function resolveConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const pick = (key, fallback) => (
    Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback
  );

  const width = Math.max(1e-3, finite(pick('width', DEFAULT_PARTICLE_CONFIG.width), DEFAULT_PARTICLE_CONFIG.width));
  const height = Math.max(1e-3, finite(pick('height', DEFAULT_PARTICLE_CONFIG.height), DEFAULT_PARTICLE_CONFIG.height));
  const minLife = Math.max(1e-3, finite(pick('minLife', DEFAULT_PARTICLE_CONFIG.minLife), DEFAULT_PARTICLE_CONFIG.minLife));
  const maxLife = Math.max(minLife, finite(pick('maxLife', DEFAULT_PARTICLE_CONFIG.maxLife), DEFAULT_PARTICLE_CONFIG.maxLife));

  return {
    count: Math.max(0, Math.floor(finite(pick('count', DEFAULT_PARTICLE_CONFIG.count), DEFAULT_PARTICLE_CONFIG.count))),
    layerCount: Math.max(1, Math.floor(finite(pick('layerCount', DEFAULT_PARTICLE_CONFIG.layerCount), DEFAULT_PARTICLE_CONFIG.layerCount))),
    seed: pick('seed', DEFAULT_PARTICLE_CONFIG.seed),
    width,
    height,
    minLife,
    maxLife,
    driftSpeed: Math.max(0, finite(pick('driftSpeed', DEFAULT_PARTICLE_CONFIG.driftSpeed), DEFAULT_PARTICLE_CONFIG.driftSpeed)),
    noiseScale: Math.max(1e-4, finite(pick('noiseScale', DEFAULT_PARTICLE_CONFIG.noiseScale), DEFAULT_PARTICLE_CONFIG.noiseScale)),
    baseSize: Math.max(0, finite(pick('baseSize', DEFAULT_PARTICLE_CONFIG.baseSize), DEFAULT_PARTICLE_CONFIG.baseSize)),
    sizeVariation: Math.max(0, finite(pick('sizeVariation', DEFAULT_PARTICLE_CONFIG.sizeVariation), DEFAULT_PARTICLE_CONFIG.sizeVariation)),
    fadeInRatio: clamp(finite(pick('fadeInRatio', DEFAULT_PARTICLE_CONFIG.fadeInRatio), DEFAULT_PARTICLE_CONFIG.fadeInRatio), 0.01, 0.9),
    fadeOutRatio: clamp(finite(pick('fadeOutRatio', DEFAULT_PARTICLE_CONFIG.fadeOutRatio), DEFAULT_PARTICLE_CONFIG.fadeOutRatio), 0.01, 0.9),
    parallaxMin: finite(pick('parallaxMin', DEFAULT_PARTICLE_CONFIG.parallaxMin), DEFAULT_PARTICLE_CONFIG.parallaxMin),
    parallaxMax: finite(pick('parallaxMax', DEFAULT_PARTICLE_CONFIG.parallaxMax), DEFAULT_PARTICLE_CONFIG.parallaxMax),
    sizeMin: finite(pick('sizeMin', DEFAULT_PARTICLE_CONFIG.sizeMin), DEFAULT_PARTICLE_CONFIG.sizeMin),
    sizeMax: finite(pick('sizeMax', DEFAULT_PARTICLE_CONFIG.sizeMax), DEFAULT_PARTICLE_CONFIG.sizeMax),
    opacityMin: finite(pick('opacityMin', DEFAULT_PARTICLE_CONFIG.opacityMin), DEFAULT_PARTICLE_CONFIG.opacityMin),
    opacityMax: finite(pick('opacityMax', DEFAULT_PARTICLE_CONFIG.opacityMax), DEFAULT_PARTICLE_CONFIG.opacityMax),
    energySpeedGain: Math.max(0, finite(pick('energySpeedGain', DEFAULT_PARTICLE_CONFIG.energySpeedGain), DEFAULT_PARTICLE_CONFIG.energySpeedGain)),
    energyTurn: finite(pick('energyTurn', DEFAULT_PARTICLE_CONFIG.energyTurn), DEFAULT_PARTICLE_CONFIG.energyTurn),
    noiseTimeScale: finite(pick('noiseTimeScale', DEFAULT_PARTICLE_CONFIG.noiseTimeScale), DEFAULT_PARTICLE_CONFIG.noiseTimeScale),
    minMotionScale: clamp(finite(pick('minMotionScale', DEFAULT_PARTICLE_CONFIG.minMotionScale), DEFAULT_PARTICLE_CONFIG.minMotionScale), 0, 1),
  };
}

/**
 * A deterministic, layered ambient particle field.
 *
 * The field owns the simulation; the renderer owns the drawing. Every
 * particle lives on a depth plane, fades in and out, and drifts through a
 * deterministic noise field. Energy biases the drift; it never changes how a
 * particle looks.
 */
export class ParticleField {
  /**
   * @param {Partial<ParticleFieldConfig>} [config] Configuration overrides.
   */
  constructor(config = {}) {
    /** @type {ParticleFieldConfig} The resolved configuration. */
    this.config = Object.freeze(resolveConfig(config));

    const {
      count, layerCount, seed, width, height,
      driftSpeed, noiseScale, baseSize, sizeVariation,
      fadeInRatio, fadeOutRatio,
      parallaxMin, parallaxMax, sizeMin, sizeMax, opacityMin, opacityMax,
      energySpeedGain, energyTurn, noiseTimeScale, minMotionScale,
    } = this.config;

    /** @type {number} Field width in field units. */
    this.width = width;
    /** @type {number} Field height in field units. */
    this.height = height;
    /** @type {number} Base drift speed in field units per second. */
    this.driftSpeed = driftSpeed;
    /** @type {number} Scale of the noise lookup. */
    this.noiseScale = noiseScale;
    /** @type {number} Fraction of the life spent fading in. */
    this.fadeInRatio = fadeInRatio;
    /** @type {number} Fraction of the life spent fading out. */
    this.fadeOutRatio = fadeOutRatio;
    /** @type {number} Extra drift speed at full energy. */
    this.energySpeedGain = energySpeedGain;
    /** @type {number} Drift direction rotation at full energy, radians. */
    this.energyTurn = energyTurn;
    /** @type {number} How fast the noise field evolves. */
    this.noiseTimeScale = noiseTimeScale;
    /** @type {number} Smallest motion scale the field accepts. */
    this.minMotionScale = minMotionScale;

    /** @type {ReadonlyArray<ParticleLayer>} Depth planes, far to near. */
    this.layers = createLayerConfig(layerCount, {
      parallaxMin, parallaxMax, sizeMin, sizeMax, opacityMin, opacityMax,
    });

    /** @type {number} Number of depth planes. */
    this.layerCount = this.layers.length;

    /** @type {number} Simulation time in seconds since construction. */
    this.time = 0;
    /** @type {number} The delta of the most recent frame, in seconds. */
    this.lastDelta = 0;
    /** @type {number} How many particles have been re-seeded. */
    this.recycleCount = 0;
    /** @type {boolean} Whether the field has been disposed. */
    this.disposed = false;

    // The seeded stream drives every random decision - placement, life
    // length, re-seed position - so the same seed replays exactly.
    /** @type {() => number} The field's deterministic random stream. */
    this._random = createSeededRandom(normalizeSeed(seed));
    /** @type {(x: number, y: number) => number} The field's deterministic noise. */
    this._noise = createNoise(seed);

    /** @type {Particle[]} The published particles, updated in place. */
    this._particles = [];
    /**
     * Internal per-particle bookkeeping, parallel to `_particles`.
     *
     * @type {object[]}
     */
    this._states = [];

    for (let i = 0; i < count; i += 1) {
      const layerIndex = i % this.layerCount;
      const layer = this.layers[layerIndex];

      const depth = lerp(layer.depthMin, layer.depthMax, this._random());
      const maxLife = lerp(this.config.minLife, this.config.maxLife, this._random());
      const sizeScale = 1 - sizeVariation + this._random() * 2 * sizeVariation;
      const x = this._random() * width;
      const y = this._random() * height;

      this._particles.push({
        x,
        y,
        depth,
        layer: layerIndex,
        alpha: 0,
        size: baseSize * layer.sizeScale * sizeScale,
        // The initial life is staggered so the field is already populated on
        // the first frame instead of blooming in from nothing.
        life: this._random() * maxLife,
        maxLife,
        vx: 0,
        vy: 0,
      });

      this._states.push({
        state: STATE_ALIVE,
        // Per-particle bias on the drift direction, so energy does not turn
        // every particle the same way.
        turnBias: this._random() * 2 - 1,
        // How far the particle has tried to travel past each edge while it
        // was held there. Applied as a wrap when the particle is re-seeded.
        overflowX: 0,
        overflowY: 0,
      });
    }
  }

  /**
   * Advance the simulation by one frame.
   *
   * `energy` biases the drift speed and direction and nothing else. The
   * alpha and the size of a particle are functions of its life alone, so
   * the same seed produces the same appearance whether the field is silent
   * or loud.
   *
   * @param {number} [deltaTime=0] Elapsed time in seconds.
   * @param {object} [options] Frame inputs.
   * @param {number} [options.time] Absolute simulation time in seconds,
   *   used to evolve the noise field. Defaults to the field's own clock.
   * @param {number} [options.energy=0] Normalised audio energy, 0..1.
   * @param {number} [options.motionScale=1] Multiplier on the drift speed.
   *   0.25 damps the field without freezing it.
   * @param {number} [options.driftX=0] Global drift along x, in field units per second.
   * @param {number} [options.driftY=0] Global drift along y, in field units per second.
   * @returns {Particle[]} The live particle array.
   */
  update(deltaTime = 0, options = {}) {
    if (this.disposed) return this._particles;

    const opts = options && typeof options === 'object' ? options : {};
    const dt = finite(deltaTime, 0) > 0 ? finite(deltaTime, 0) : 0;

    this.time += dt;
    this.lastDelta = dt;

    const time = Number.isFinite(opts.time) ? opts.time : this.time;
    const energy = clamp(finite(opts.energy, 0), 0, 1);
    // The floor keeps the field moving: protocol section 6 requires the
    // utterance to stay continuous, so motion is damped, never removed.
    const motionScale = clamp(
      finite(opts.motionScale, 1),
      this.minMotionScale,
      1,
    );
    const driftX = finite(opts.driftX, 0);
    const driftY = finite(opts.driftY, 0);

    const {
      noiseScale, noiseTimeScale, driftSpeed, energySpeedGain, energyTurn,
      fadeInRatio, fadeOutRatio,
    } = this.config;

    for (let i = 0; i < this._particles.length; i += 1) {
      const p = this._particles[i];
      const st = this._states[i];

      if (st.state === STATE_HIDDEN) {
        // Re-seed the particle here, while it is invisible. The previous
        // frame already published alpha 0, so the jump cannot be seen. The
        // particle does not drift on this frame: it fades in from zero.
        this._reseed(p, st);
        continue;
      }

      const layer = this.layers[p.layer];

      // Drift direction from the deterministic noise field, sampled at the
      // particle's own position: the field reads as a flow, not as noise.
      const n = this._noise(
        p.x * noiseScale + time * noiseTimeScale,
        p.y * noiseScale - time * noiseTimeScale,
      );

      // Energy biases the motion: it turns the drift and it speeds it up.
      // It touches nothing else.
      const angle = n * Math.PI + st.turnBias * energy * energyTurn;
      const speed = driftSpeed * layer.parallax * (1 + energySpeedGain * energy) * motionScale;

      p.vx = Math.cos(angle) * speed + driftX * motionScale;
      p.vy = Math.sin(angle) * speed + driftY * motionScale;

      p.life += dt;
      this._integrate(p, st, dt);

      // Alpha depends on the life alone - never on energy, never on the
      // position. That is what makes "energy biases motion, not appearance"
      // exactly true.
      p.alpha = fadeCurve(p.life / p.maxLife, fadeInRatio, fadeOutRatio);

      if (p.life >= p.maxLife) {
        // The fade-out has completed. The particle stays exactly here,
        // invisible, until the next frame re-seeds it.
        p.alpha = 0;
        st.state = STATE_HIDDEN;
      }
    }

    return this._particles;
  }

  /**
   * Move a particle by its current velocity, keeping it inside the bounds.
   *
   * A particle that reaches an edge is held there while it is visible, and
   * the distance it tried to travel past the edge is remembered. When it is
   * re-seeded - while it is invisible - that distance is applied as a wrap,
   * so the particle re-enters on the opposite side without ever popping.
   *
   * @param {Particle} p The particle to move.
   * @param {object} st The particle's internal state.
   * @param {number} dt Elapsed time in seconds.
   * @returns {void}
   */
  _integrate(p, st, dt) {
    let nx = p.x + p.vx * dt;
    let ny = p.y + p.vy * dt;

    if (nx < 0) {
      // Held at the left edge. Remember how far past it tried to go.
      st.overflowX += nx;
      nx = 0;
      p.vx = 0;
    } else if (nx > this.width) {
      st.overflowX += nx - this.width;
      nx = this.width;
      p.vx = 0;
    } else {
      st.overflowX = 0;
    }

    if (ny < 0) {
      st.overflowY += ny;
      ny = 0;
      p.vy = 0;
    } else if (ny > this.height) {
      st.overflowY += ny - this.height;
      ny = this.height;
      p.vy = 0;
    } else {
      st.overflowY = 0;
    }

    p.x = nx;
    p.y = ny;
  }

  /**
   * Re-seed a particle at a new position with a new life.
   *
   * Called only for a particle whose alpha is already 0, so a particle is
   * never moved while it is visible - protocol section 6.
   *
   * @param {Particle} p The particle to re-seed.
   * @param {object} st The particle's internal state.
   * @returns {void}
   */
  _reseed(p, st) {
    // Always draw the same number of values, whatever happens next. Two
    // fields that differ only in energy therefore consume the stream in
    // lockstep and keep identical life lengths - which is what makes their
    // alpha sequences identical.
    const drawX = this._random();
    const drawY = this._random();
    const drawLife = this._random();

    if (st.overflowX !== 0 || st.overflowY !== 0) {
      // The particle ran off the edge: it re-enters on the opposite side.
      // The jump happens now, while the particle is invisible.
      p.x = wrap(p.x + st.overflowX, 0, this.width);
      p.y = wrap(p.y + st.overflowY, 0, this.height);
      st.overflowX = 0;
      st.overflowY = 0;
    } else {
      // It ended its life inside the field, so it is re-seeded elsewhere.
      p.x = drawX * this.width;
      p.y = drawY * this.height;
    }

    p.maxLife = lerp(this.config.minLife, this.config.maxLife, drawLife);
    p.life = 0;
    p.alpha = 0;
    st.state = STATE_ALIVE;
    this.recycleCount += 1;
  }

  /**
   * The live particle array.
   *
   * The array and the particles in it are live: they are updated in place by
   * {@link ParticleField#update}. Read them, do not mutate them.
   *
   * @returns {Particle[]} The particles of this field.
   */
  getParticles() {
    return this._particles;
  }

  /**
   * The per-layer draw configuration, far plane first.
   *
   * @returns {ReadonlyArray<ParticleLayer>} The layer descriptors.
   */
  getLayers() {
    return this.layers;
  }

  /**
   * The number of depth planes.
   *
   * @returns {number} The layer count.
   */
  getLayerCount() {
    return this.layerCount;
  }

  /**
   * The bounds of the field.
   *
   * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
   *   The bounds in field units.
   */
  getBounds() {
    return {
      minX: 0,
      minY: 0,
      maxX: this.width,
      maxY: this.height,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Release the field. The particles are dropped and further updates are
   * ignored.
   *
   * @returns {void}
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._particles.length = 0;
    this._states.length = 0;
  }
}
