# Phase 2 Completion — Per-Glyph Structural Influence

## TL;DR

Audio currently influences the field **globally** (one `uWarp` uniform, one `uBreath`
uniform) but reaches **no individual glyph**. `Glyph.update()` receives `audioData`
and `silenceWeight` and ignores both. The protocol requires that energy bias
**motion** — velocity, resistance, persistence, decay — per symbol, and that
absence (silence) increase persistence rather than read as zero.

This phase makes the influence reach each glyph's own motion, weighted by that
glyph's family and semantic weight. It is Phase 2 of the roadmap, and it is the
last piece before the SDK can separate protocol logic from rendering.

## Current state (verified against the source, not assumed)

| Fact | Where |
|---|---|
| `Glyph.update(deltaTime, globalTime, audioData, silenceWeight, userFingerprint)` ignores `audioData` and `silenceWeight` | `src/glyphs/Glyph.js:33` |
| `GlyphQueue.update(...)` forwards audio data but the glyph discards it | `src/glyphs/GlyphQueue.js:76` |
| `mapAudioToInfluence` already produces `morphVelocity, resistance, persistence, direction, phase, decay, emotionalTone` | `src/audio/AudioMap.js` |
| `main.js` computes `influence` but uses only `influence.persistence` for `uBreath` | `src/main.js` |
| All five protocol families exist with per-glyph `semanticWeight` (`resistance`, `fadeTime`, `warpAffinity`, `silenceAffinity`) | `data/phonemes.json` |
| `src/glyphs/Topology.js` is **0 bytes** | scaffold only |

Protocol requirements this must satisfy:

- §3.2 Motion parameters: velocity, resistance, oscillation, decay. Motion MUST be continuous.
- §3.3 Energy MUST bias motion, **not directly map to appearance**.
- §3.4 Absence alters temporal flow, modifies dominance, **increases persistence**. Absence MUST NOT be treated as zero.
- §4 Families have distinct behaviour: Anchor = high resistance / low velocity; Flow = low resistance / directional continuity; Fracture = asymmetric resistance / instability; Void = minimal mass / long decay / dominance through absence; Echo = delayed repetition / persistence.
- §6 Silence MUST influence motion before appearance; silence increases persistence, delays decay, amplifies resistance.

## Design

### 1. `src/glyphs/Family.js` (new)

A pure table of per-family motion profiles, derived from protocol §4.

```
anchor:   resistance 0.85  velocity 0.35  persistence 1.15  decay 0.85  asymmetry 0.0
flow:     resistance 0.25  velocity 1.25  persistence 0.80  decay 1.15  asymmetry 0.0
fracture: resistance 0.50  velocity 1.00  persistence 0.70  decay 1.30  asymmetry 0.6
void:     resistance 0.70  velocity 0.45  persistence 1.70  decay 0.45  asymmetry 0.0
echo:     resistance 0.55  velocity 0.80  persistence 1.45  decay 0.70  asymmetry 0.25
```

Unknown families fall back to a neutral profile rather than throwing — the queue
must not be able to break on a data typo.

### 2. `src/glyphs/Influence.js` (new)

Pure functions that combine the family profile, the glyph's own
`semanticWeight`, and the global influence into **per-glyph motion parameters**:

- `resolveMotionProfile(family, semanticWeight, influence)` → `{ velocity, resistance, persistence, decay, asymmetry, phase }`
- `applyInfluenceToGlyph(glyph, influence, silenceWeight)` → mutates the glyph's motion state

Rules:
- **Energy biases motion, never appearance.** Nothing here touches opacity, colour or `uOpacity`. Appearance stays the renderer's business.
- **Absence is not zero.** Silence raises persistence and resistance and delays decay; it never freezes the morph. `persistence` is scaled by `1 + silenceWeight * silenceAffinity`.
- **Resistance is a divisor, not a multiplier.** High resistance slows the morph; it never reverses or halts it.
- **Per-glyph `semanticWeight.resistance` composes with the family profile**, so an individual glyph can resist more than its family baseline.
- **Asymmetric resistance** (Fracture, Echo) makes the glyph's morph rate vary with the sign of `influence.direction`, giving directional instability without cutting the morph.

### 3. `src/glyphs/Glyph.js` (modify)

- Accept and store the resolved motion profile.
- `morphSpeed` becomes derived from the profile's velocity and resistance rather than a fixed `1 / morphDuration`.
- Decay timing becomes `fadeTime * profile.decay`, so Void lingers and Flow moves on.
- The existing continuity guarantees stay: morph progress is still time-derived and per-frame capped (`MAX_MORPH_STEP`), and a symbol still decays before removal.

### 4. `src/glyphs/GlyphQueue.js` (modify)

- `update()` takes the global `influence` and applies it per glyph before updating, so every glyph in the field is biased by sound **and** by its own family.

### 5. `src/main.js` (modify)

- Pass the already-computed `influence` into `glyphQueue.update(...)`. No new audio analysis — the mapper already runs.

## Verification plan

| Gate | What proves it |
|---|---|
| Unit: family profiles | Anchor resists more than Flow; Void persists longer; unknown family does not throw |
| Unit: influence resolution | velocity, resistance, persistence, decay all respond to influence; silence raises persistence; absence ≠ zero |
| Unit: appearance isolation | resolving influence changes **no** opacity/colour/emotion value |
| Unit: continuity | morph progress never jumps by more than `MAX_MORPH_STEP`; a symbol still decays before removal |
| Integration: two glyphs, one sound | two glyphs of different families reach different morph progress from the same influence — the influence is per-glyph, not global |
| Negative control | break the per-glyph application → the integration test must fail |
| Full suite | `npm test` — no regressions |
| Build | `npm run build` exit 0 |
| Browser smoke | dev + production + Pages sub-path, 9/9 each |

## Out of scope

- Not claiming full protocol compliance.
- Not touching the renderer's appearance uniforms (that would violate "energy biases motion, not appearance").
- Not implementing `src/glyphs/Topology.js` — separate milestone.
- No deployment, no merge to main.
