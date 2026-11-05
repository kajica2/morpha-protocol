# Phase 3 — Visual Engine 2.0, Milestone A: Runtime Resilience

## TL;DR

Phase 3 asks for graceful WebGL context recovery, reduced-motion support,
responsive rendering and configurable quality. The first three are not
cosmetic — they are **runtime failures**:

- **A lost WebGL context is invisible to the user.** There is no
  `webglcontextlost` handler anywhere in `src/`. A GPU reset, a driver
  hiccup, or a laptop switching GPUs blanks the canvas, and nothing is
  shown or logged by the application.

  **Correction, verified during implementation:** three.js 0.160.1 already
  handles the hard part. `WebGLRenderer` registers its own
  `webglcontextlost` / `webglcontextrestored` listeners, calls
  `preventDefault()`, skips rendering while the context is gone, and
  re-initialises the GL state when it returns. Measured in a real browser
  with `WEBGL_lose_context`: lit pixels went 53253 → 0 → 68473 across a
  forced loss and restore **with no application handler at all**.

  So the handler in this milestone is **not** preventing a black screen —
  three.js already does that. What it adds is the thing three.js cannot:
  three.js writes "Context Lost." to the console, where nobody watching
  the ritual will ever see it. The handler surfaces the loss to the user
  and gives the application a signal it can act on.
- **`reducedMotion` is dead config.** `src/core/Config.js` defines it,
  `src/core/Engine.js` honours it (`REDUCED_MOTION_FACTOR = 0.25`), and
  **nothing ever sets it**. A user with `prefers-reduced-motion: reduce`
  gets the full motion anyway. The protocol's continuity rule makes this
  worse, not better: reduced motion must *damp* motion, never remove it.
- **The canvas ignores device pixel ratio.** `setSize` is called without
  `setPixelRatio`, so on a Retina display the glyphs render at half
  resolution and the field looks soft and aliased.

This milestone fixes all three and adds configurable quality. Layered
particle fields and temporal memory are deferred to Milestone B — they are
visual work with no failure behind them, and they deserve the renderer to
be stable first.

## Current state (verified against the source)

| Fact | Where |
|---|---|
| No `webglcontextlost` / `webglcontextrestored` handler | absent from `src/` |
| `reducedMotion: false` in config, never overridden | `src/core/Config.js` |
| Engine honours `config.reducedMotion` at 0.25× | `src/core/Engine.js:318` |
| No `setPixelRatio` call | `src/render/Renderer.js` |
| `gl_PointSize = 9.0 + uAudio * 16.0` — fixed, not quality-aware | `shaders/glyph.vert.glsl` |
| No renderer unit test exists | `tests/` has no `render/` directory |
| `onWindowResize` uses `window.innerWidth/Height` only | `src/render/Renderer.js` |

## Design

### 1. `src/render/Quality.js` (new, pure)

A pure module so the policy is testable without a GPU:

- `QUALITY_PRESETS` — `low`, `medium`, `high`, each with
  `pixelRatioCap`, `pointSize`, `particleCount`, `temporalMemory`.
- `resolveQuality(presetName, { devicePixelRatio, reducedMotion, hardwareConcurrency })`
  → the effective settings, including auto-downgrade when
  `hardwareConcurrency` is low or the device reports a small screen.
- `detectReducedMotion(win)` → reads `prefers-reduced-motion` safely,
  returning `false` when the API is absent (older browsers, Node).

Auto-downgrade rules, all deterministic:
- `hardwareConcurrency <= 4` → at most `medium`.
- `reducedMotion` → `low` particle count and damped motion.
- Pixel ratio capped at 2 on high, 1.5 on medium, 1 on low — beyond 2 the
  fill cost buys nothing visible for a field of glowing points.

### 2. `src/render/ContextRecovery.js` (new, pure-ish)

The diagnostics policy, separated from three.js so it can be tested:

- `createContextRecovery(canvas, { onLost, onRestored, onError })`
- Handles `webglcontextlost` (calls `preventDefault()` — without it the
  browser will not fire `webglcontextrestored`) and
  `webglcontextrestored`.
- Reports the loss and the restoration to the application, so the runtime
  can tell the user what happened.
- A throwing handler is reported through `onError` rather than taking the
  runtime down.

The renderer additionally rebuilds the glyph meshes on restore. three.js
re-uploads lazily, so this is a safety net rather than a requirement — but
it guarantees the field returns even if three.js's own restore path is
incomplete.

### 3. `src/render/Renderer.js` (modify)

- `setPixelRatio` from the resolved quality, capped by the preset.
- Wire `createContextRecovery` to the canvas.
- On restore, rebuild every glyph mesh from the geometry the glyphs still
  hold, so the field comes back rather than restarting.
- `gl_PointSize` becomes a uniform (`uPointSize`) driven by quality, so
  quality changes do not require a shader recompile.
- Expose `isContextLost` so the runtime can skip drawing.

### 4. `src/core/Config.js` + `src/main.js` (modify)

- `main.js` reads `prefers-reduced-motion` at start-up and sets
  `engine.config.reducedMotion` accordingly (through the engine's own
  config API, not by mutating the object).
- Reduced motion damps the *renderer's* motion too — the wave amplitude
  and warp — not only the engine's morph rate, because the shader's wave
  is the most visible motion in the field.

### 5. `shaders/glyph.vert.glsl` (modify)

- `uniform float uPointSize;` replaces the hard-coded `9.0`.
- `uniform float uMotionScale;` scales the wave and warp, so reduced
  motion damps the shader motion as well.

## Verification plan

| Gate | What proves it |
|---|---|
| Unit: quality resolution | presets resolve; auto-downgrade on low core count; pixel ratio capped; unknown preset falls back safely |
| Unit: reduced-motion detection | true / false / API absent, all handled without throwing |
| Unit: context recovery | `preventDefault` called on loss; `isLost` set; restore triggers rebuild; render is skipped while lost |
| Unit: renderer survives a simulated loss | glyph meshes rebuilt, `isContextLost` clears |
| Unit: reduced motion damps, never removes | motion scale < 1 under reduced motion; morph still advances |
| Negative control | break the recovery → the recovery test fails; break the damp → the damp test fails |
| Full suite | `npm test` — no regressions |
| Build | `npm run build` exit 0 |
| Browser smoke | dev + production + Pages sub-path, 9/9 each |
| Browser: forced context loss | lose the context in the real browser with `WEBGL_lose_context`; confirm the field blanks, the status message appears, the field returns, and the message clears |
| Browser: reduced motion | launch with `prefers-reduced-motion: reduce`; confirm the field still moves |

## Out of scope

- Layered particle fields, temporal memory, camera work — Milestone B.
- No deployment, no merge to main.
- Reduced motion damps; it never freezes the field. The protocol requires
  continuity, so a frozen field would be a protocol violation.
