# Phase 3 — Visual Engine 2.0, Milestone B: Depth and Memory

## TL;DR

Milestone A made the renderer stable. Milestone B gives the field **depth**
and **memory**:

1. **Layered particle fields** — an ambient layer of drifting points behind
   the glyphs, on several depth planes, so the field has a near/far
   structure instead of reading as a flat cut-out.
2. **Temporal memory** — the influence system keeps a decaying trace of past
   sound and turns it into a **distortion** that warps glyph geometry. A
   transient stops being over the instant it ends: it leaves a shape.

Both are grounded in existing infrastructure rather than invented beside it:
`src/utils/Noise.js` already provides deterministic gradient noise,
`src/render/Quality.js` already declares `particleCount` and
`temporalMemory` (both currently unused), and `src/audio/AudioMap.js`
already produces the `direction` and `phase` that a memory layer can carry.

## Current state (verified against the source)

| Fact | Where |
|---|---|
| `particleCount` declared, never read | `src/render/Quality.js:20,34,41,48` |
| `temporalMemory` declared, never read | `src/render/Quality.js:21,35,42,49` |
| No particle system anywhere in `src/` | `grep particle src` → only Quality.js |
| No temporal memory layer | `grep temporal src` → only Quality.js |
| Deterministic gradient noise exists | `src/utils/Noise.js` → `createNoise(seed)` |
| Seeded PRNG exists | `src/utils/Math.js` → `createSeededRandom` |
| `mapAudioToInfluence` low-pass filters `direction` (τ = 0.08 s) | `src/audio/AudioMap.js` |
| `main.js` threads `previousInfluence` by hand | `src/main.js:28,236-240` |
| `Glyph` consumes `influence` for motion only | `src/glyphs/Glyph.js` |
| `Renderer` owns one shared uniform set | `src/render/Renderer.js` |

## Design

### 1. `src/render/ParticleField.js` (new, pure)

A deterministic particle simulation with **no three.js dependency**, so it
is testable without a GPU.

- **Layers.** Particles are distributed over `layerCount` depth planes. Each
  plane has a parallax factor (far planes drift less), a size scale and an
  opacity scale, which is what produces depth rather than a flat haze.
- **Determinism.** Initial placement uses `createSeededRandom(seed)`;
  drift uses `createNoise(seed)`. The same seed always yields the same
  field — the property that lets a ritual be replayed and compared.
- **Lifecycle without cuts.** Every particle has a life. It **fades in**
  from zero and **fades out** to zero before it is recycled. A particle is
  never removed while visible — the same rule the glyph queue now follows.
- **Energy biases motion, not appearance.** Audio changes drift speed and
  direction. It does **not** change particle opacity or colour. That is
  protocol §3.3 applied to the ambient layer.
- **Silence is input.** With no energy the field settles into a slow drift
  rather than stopping.
- **Reduced motion** damps drift through the existing `uMotionScale`
  mechanism; it never freezes the field.

### 2. `shaders/particle.vert.glsl` + `particle.frag.glsl` (new)

- Per-particle `position`, `aSize`, `aAlpha`, `aDepth` attributes.
- Parallax applied in the vertex shader from `aDepth`.
- The fragment shader draws a soft round point, faded by `aAlpha`.
- Shares the renderer's `uAspect` correction so particles are not
  squashed on a non-square viewport.

### 3. `src/core/InfluenceMemory.js` (new, pure)

Turns the influence stream into a decaying **distortion**.

- Each frame, the live influence is blended into a remembered state with
  an asymmetric envelope: fast attack (a new event registers quickly) and
  slow release (it lingers).
- The remembered state is converted into a bounded signed distortion —
  direction and magnitude — which **decays over time**.
- The distortion is what reaches the glyph. A loud transient therefore
  bends the morph for a second or so after the sound stops, rather than
  the morph snapping back the instant the sound ends.
- Bounded: the distortion is clamped, so a sustained loud passage cannot
  accumulate into an unrecoverable shape.
- `strength` scales how much of the distortion reaches the glyph, and
  ties to the quality preset's `temporalMemory`.

### 4. Wiring

- `Renderer` owns a `ParticleField` and renders it behind the glyph meshes.
- `Glyph` applies the distortion to its morph position — the glyph's
  geometry bends, not just its rate.
- `main.js` feeds the memory from the influence it already computes, and
  replaces the hand-threaded `previousInfluence` with the memory object.

## Protocol rules this milestone must not break

- **Never cut, only morph.** Particles fade; they never pop. The glyph
  morph is bent by memory, never snapped.
- **Silence is input.** The field settles, it does not stop.
- **Energy biases motion, not appearance.** Particle opacity and colour
  are unaffected by audio.
- **Continuity.** Reduced motion damps; it does not freeze.

## Verification plan

| Gate | What proves it |
|---|---|
| Unit: particle determinism | same seed → identical positions; different seed → different positions |
| Unit: particle lifecycle | no particle is ever removed while visible; alpha reaches zero before recycling |
| Unit: particle layering | particles occupy several depth planes with distinct parallax factors |
| Unit: energy biases motion only | changing energy changes drift, leaves opacity and size unchanged |
| Unit: temporal memory decays | the distortion shrinks toward zero over time after an event |
| Unit: memory is bounded | a sustained maximum input never drives the distortion out of range |
| Unit: memory never freezes motion | morph velocity stays above zero throughout |
| Negative control | break the memory decay → the decay test fails; break the fade → the lifecycle test fails |
| Full suite | `npm test` — no regressions |
| Build | `npm run build` exit 0 |
| Browser smoke | dev + production + Pages sub-path, 9/9 each |
| Browser: visual | the field shows depth, and the screenshot shows more than the glyph field alone |

## Out of scope

- Camera work (`src/render/Camera.js` is still 0 bytes) — Milestone C.
- Composer / post-processing (`src/render/Composer.js` is still 0 bytes) —
  Milestone C.
- No deployment, no merge to main.
