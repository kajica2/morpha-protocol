# MORPHA Development Roadmap

Status legend: `[ ]` not started · `[~]` in progress · `[x]` complete

This roadmap tracks engineering progress against the MORPHA protocol. Phases
advance only when the exit criteria are met and verified — a successful
build alone is never sufficient evidence.

---

## Phase 0 — Stabilization

**Objective:** the repository installs, builds, tests and runs. No critical
runtime blockers. Deployment is reproducible.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.1 | Clean dependency installation | `[x]` | `npm ci` reproducible from lockfile. |
| 0.2 | Automated test suite | `[x]` | Node built-in runner, `npm test`. |
| 0.3 | Production build succeeds | `[x]` | `npm run build`; ships `dist/data/`. |
| 0.4 | Lint gate | `[x]` | `npm run lint` — dependency-free syntax check. |
| 0.5 | GitHub Pages workflow parses | `[x]` | `static.yml` valid YAML; gated on quality job. |
| 0.6 | Vercel deployment config | `[x]` | `vercel.json`, primary target. |
| 0.7 | Base-path correctness | `[x]` | `import.meta.env.BASE_URL`; Pages sub-path verified. |
| 0.8 | Exposed API credential remediated | `[x]` | Key removed from tree, moved to `.env`. |
| 0.9 | Critical startup blockers | `[x]` | Render draw-call, auth gate, data fetch. |
| 0.10 | Draft PR for human review | `[x]` | Draft PR #2 (open, not merged). |

**Exit criteria:** all of the above are `[x]`, the test suite is green, and
the production build output is verified by CI (`dist/index.html` and
`dist/data/*.json` must exist).

---

## Phase 1 — Engine Reconstruction

**Objective:** a deterministic, headless-testable symbolic transformation
engine that owns time, state and configuration independently of the browser.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Core clock | `[x]` | `src/core/Clock.js` — clamped, monotonic, injectable time. |
| 1.2 | State manager | `[x]` | `src/core/State.js` — flat state, subscribe/unsubscribe. |
| 1.3 | Configuration + validation | `[x]` | `src/core/Config.js` — strict, rejects NaN/Infinity. |
| 1.4 | Engine orchestration | `[x]` | `src/core/Engine.js` — continuous morph, no teleports. |
| 1.5 | Math / easing / noise / UUID utils | `[x]` | `src/utils/*` — seeded noise, deterministic UUIDs. |
| 1.6 | Glyph lifecycle | `[x]` | Mesh create/dispose, bounded overlap, GPU cleanup. |
| 1.7 | Normalized geometry | `[x]` | `src/render/GlyphGeometry.js` — pure, unit-tested. |
| 1.8 | Continuous interpolation | `[x]` | Morph step is capped per tick. |
| 1.9 | Reliable resource disposal | `[x]` | `Renderer.dispose()`, `GlyphQueue.dispose()`. |
| 1.10 | Engine wired into the runtime | `[x]` | `main.js` now drives time, silence and morph from the engine. |

**Exit criteria:** unit tests cover topology, continuity, silence behaviour,
lifecycle boundaries and numerical stability. The engine runs with no DOM and
no WebGL.

> **Note on 1.10:** `src/core/Engine.js` now drives the runtime. `main.js`
> takes its clock, silence weight and morph from the engine, and the audio
> influence mapper feeds the renderer's breath uniform. The app's frame loop
> remains a `requestAnimationFrame` loop - the engine owns the *simulation*
> inside it, not the scheduling.

---

## Phase 2 — Advanced Audio Intelligence

**Objective:** sound influences *structure*, not merely brightness. Silence is
a first-class signal.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Frequency-band analysis (Hz-based) | `[~]` | `src/audio/Analyzer.js` in progress. |
| 2.2 | Spectral centroid | `[~]` | In progress. |
| 2.3 | Spectral flux / transient detection | `[~]` | In progress. |
| 2.4 | RMS energy | `[~]` | In progress. |
| 2.5 | Silence modelling with hysteresis | `[~]` | `src/audio/Silence.js` in progress. |
| 2.6 | Envelope smoothing | `[~]` | In progress. |
| 2.7 | Structural influence mapping | `[ ]` | `src/audio/AudioMap.js` — not started. |
| 2.8 | Audio file input | `[ ]` | Not started. |
| 2.9 | Latency-aware processing | `[ ]` | Not started. |

**Exit criteria:** pure DSP separated from browser capture; all outputs finite
for any input; silence produces a distinct influence from loud sound; raw
microphone audio never leaves the device.

---

## Phase 3 — Visual Engine 2.0

| # | Task | Status |
|---|------|--------|
| 3.1 | Layered particle fields | `[~]` `src/render/ParticleField.js` — deterministic depth planes, no-cut lifecycle. Shaders and renderer wiring land with this branch. |
| 3.2 | Organic motion / temporal memory | `[~]` `src/core/InfluenceMemory.js` — asymmetric envelope, decaying distortion. Per-family `distortionAffinity` in `src/glyphs/Family.js`. |
| 3.3 | Configurable rendering quality | `[x]` `src/render/Quality.js` — presets, pixel-ratio cap, auto-downgrade on ≤4 cores. |
| 3.4 | Camera and viewport management | `[~]` Aspect correction and resize handling exist. The particle field's projection is now explicit in `src/render/Projection.js`. Full camera work is Milestone C. |
| 3.5 | WebGL context-loss recovery | `[x]` `src/render/ContextRecovery.js` — the loss is surfaced to the user, which three.js cannot do. See the note in `docs/PHASE-3-VISUAL-ENGINE.md`: three.js already prevents the permanent black screen. |
| 3.6 | Reduced-motion support | `[x]` Detected from `prefers-reduced-motion` and applied to both the engine's morph rate and the renderer's shader motion. Damps; never freezes. |
| 3.7 | Responsive rendering (desktop + mobile) | `[~]` Pixel ratio applied and capped by quality. A full mobile pass is Milestone C. |

### Two protocol bugs found while building Milestone B

Both pre-existed on `main` and were found by measurement, not by reading the
code:

1. **The phase accumulator integrated the whole runtime every frame.**
   `main.js` passed `elapsed: globalTime` where the mapper expects the
   FRAME DELTA. At 30 seconds in, the phase had run to 22.5 radians
   instead of the ~0.005 a 0.3 rad/s drift produces, and the direction
   filter's factor `(1 - exp(-dt/tau))` had saturated at 1, disabling the
   smoothing entirely.

2. **The signed direction was always zero.** `main.js` passed the previous
   *influence* back as `previous`, but the mapper reads `previous.centroid`
   — and the influence object does not carry one. So the signed spectral
   change was never computed, and Fracture's and Echo's directional
   asymmetry could not activate. The runtime now uses the mapper's own
   stateful `createInfluenceMapper()`.

Both are covered by `tests/integration/influence-wiring.test.js`.

---

## Phase 4 — MORPHA Studio

Immersive landing, ritual mode, live audio-reactive mode, silent exploration,
glyph laboratory, preset management, session controls, artifact export,
responsive configuration panels, keyboard and assistive accessibility.

Visual identity: dark atmospheric environments, restrained light, deep purple,
teal, warm metallic highlights, subtle grain, spatial depth, organic
typography. Avoid generic SaaS dashboards, excessive neon, overdecorated
interfaces, and motion that distracts from symbolic communication.

**Status:** `[ ]` not started.

---

## Phase 5 — Creative Export System

PNG capture · SVG export · short WebM recordings · configurable aspect ratios ·
export metadata · reproducible seeds · local artifact downloads · optional
authenticated cloud storage.

No silent automatic uploads. Validate MIME types, browser support, export
completion and recording cleanup.

**Status:** `[~]` WebM capture exists in `src/export/Capture.js`; PNG, SVG,
seeds, metadata and aspect-ratio control not started.

---

## Phase 6 — Protocol SDK

Separate protocol logic from browser-specific rendering. Versioned API for
symbol families, glyph states, motion parameters, energy influences, silence
semantics, serialization, extension registration and event observation, with
examples and compatibility tests.

**Status:** `[ ]` not started. Full protocol compliance is not claimed until
mandatory invariants have automated conformance coverage.

---

## Phase 7 — Extension Ecosystem

Music performance / MIDI · interactive installations · collaborative rituals ·
creative education · visual performance software · external AV applications.

Domain-specific semantics stay outside the core protocol. One reference
extension is developed end-to-end before expanding further.

**Status:** `[ ]` not started.

---

## Phase 8 — Production Hardening

Unit and integration tests · browser smoke tests · visual regression ·
accessibility testing · dependency security auditing · performance budgets ·
error boundaries · structured diagnostics · release procedures · rollback
documentation · operational runbooks · versioned releases.

**Status:** `[~]` unit tests, a CI quality gate and a dependency audit exist.
Browser smoke testing is currently manual. Visual regression, performance
budgets, release and rollback procedures are not started.

---

## Known Risks and Limitations

| Risk | Severity | Status |
|------|----------|--------|
| Google API key was committed in git history | High | Key removed from the working tree and expired upstream. **History rewrite or explicit revocation is still recommended.** |
| `node --test <dir>` behaves inconsistently across Node builds | Low | The test script pins an explicit glob. |
| Vite 5 depended on an `esbuild` version with a moderate advisory and a Vite path-traversal advisory | High | **Resolved** - upgraded to Vite 8. `npm audit` reports 0 vulnerabilities. Node floor raised to `^20.19.0 || >=22.12.0`. |
| App runtime does not yet use `src/core/Engine.js` | Moderate | Phase 1.10. |
| `src/main.ts`, `src/counter.ts`, `src/style.css`, `src/typescript.svg` are unused Vite starter leftovers | Low | Left in place for now; not referenced by any entry point. |
| `demo/` contains an unrelated AI gateway experiment | Low | Out of scope for the protocol implementation. |

---

## Verification Evidence

Recorded from the working branch at commit `7840519`.

| Gate | Command | Result |
|------|---------|--------|
| Syntax | `npm run lint` | 52 files checked, 0 failures |
| Unit suite | `npm test` | 163 tests, 163 pass, 0 fail |
| Production build | `npm run build` | exit 0; `dist/data/` emitted |
| Browser smoke (dev) | `npm run smoke -- --url http://127.0.0.1:5174` | 9/9 checks pass |
| Browser smoke (production build) | `npm run smoke -- --url http://127.0.0.1:5177` | 9/9 checks pass |
| Browser smoke (Pages sub-path) | `npm run smoke -- --url http://127.0.0.1:5178/morpha-protocol/` | 9/9 checks pass |
| Negative control | smoke vs. deliberately broken build | **fails, exit 1** - the gate is real |
| Dependency audit | `npm audit` | **0 vulnerabilities** (after the Vite 8 upgrade) |
| CI | GitHub Actions on PR #2 | queued at time of writing - **not verified** |
| Deployment | Vercel / GitHub Pages | **not deployed** - configs only, locally validated |

### What the smoke test asserts

`scripts/browser-smoke.js` drives the real application in headless Chrome
over the DevTools Protocol, with no new dependencies:

1. the page loads,
2. the entry ritual can be entered,
3. a WebGL context is created,
4. the rendered output **changes over time** (the morph is alive, not frozen),
5. glyph pixels are present and reach visible luminance,
6. no uncaught exceptions, unhandled rejections or console errors.

## Verification Commands

```bash
npm ci          # reproducible install
npm run lint    # dependency-free syntax gate
npm test        # unit suite (Node built-in runner)
npm run glyphs  # regenerate data/processed-glyphs.json
npm run build   # production build (emits dist/data/)
npm run check   # lint + test + build
```

Browser smoke test: `npm run dev`, open the printed URL, click **enter
quietly**, grant microphone access, and confirm a glyph renders with no
console errors.
