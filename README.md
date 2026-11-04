# MORPHA — Reference Implementation

The reference implementation of the MORPHA protocol: a system for non-verbal
symbolic communication through morphing glyphs and sound influence.

The full protocol specification is in [`/protocol`](protocol/MORPHA.md).
Engineering progress is tracked in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Status

Under active development. This implementation is a testbed for the concepts
defined in the MORPHA protocol — a practical guide, not a finished product.

**Protocol conformance is partial.** The mandatory grammar rules in
`protocol/MORPHA.md` §6 are machine-checked by
[`tests/protocol/conformance.test.js`](tests/protocol/conformance.test.js),
but full compliance requires coverage of every axiom, not just the grammar
rules. See the roadmap for what is verified and what is not.

## Tech Stack

- **Vite** — development server and production bundler.
- **Three.js** — WebGL rendering context.
- **GLSL** — custom shaders for glyph morphing and rendering.
- **Vanilla JavaScript** — no framework, keeping the core logic transparent.
- **Node built-in test runner** — unit tests with zero test dependencies.

## Getting Started

### Prerequisites

- Node.js 18 or higher (22 recommended)
- npm

### Installation

```bash
git clone https://github.com/kajica2/morpha-protocol.git
cd morpha-protocol
npm ci
```

### Development

```bash
npm run dev      # dev server with hot reload (http://localhost:5173)
npm run glyphs   # regenerate data/processed-glyphs.json from base glyphs
```

Open the URL, click **enter quietly**, and grant microphone access. Glyphs
will begin to morph in response to sound and silence.

> Microphone input is analysed locally and never leaves your device. You can
> also inspect the app without a microphone by using the static ritual page in
> `/demo`.

### Verification

```bash
npm run lint     # dependency-free syntax gate over every source file
npm test         # unit suite
npm run build    # production build (emits dist/, including dist/data/)
npm run check    # lint + test + build
```

### Deployment

**Vercel** (primary) — `vercel.json` is included. Connect the repository and
deploy; the build command runs `npm run glyphs && npm run build` and serves
`dist/`.

**GitHub Pages** (secondary) — `.github/workflows/static.yml` builds the site
with `VITE_BASE_PATH=/morpha-protocol/` and deploys it on push to `main`.
The quality job (lint, test, build, output verification) gates the deploy.

## Configuration

Google Drive linking is **optional**. Without credentials the ritual runs
completely and saved artifacts fall back to a local download.

```bash
cp .env.example .env
# then fill in VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY
```

`.env` is gitignored. Never commit credentials.

> **Security note.** An API key was previously committed to this repository
> and remains visible in git history. It was expired upstream and has been
> removed from the working tree, but it should still be revoked in the Google
> Cloud console and the history rewritten if that is acceptable to you.

## Project Structure

| Path | Contents |
|------|----------|
| `/protocol` | The open protocol specification, governance, and extensions. |
| `/src/core` | Deterministic engine: clock, state, configuration, orchestration. |
| `/src/glyphs` | Symbolic language: generation, resampling, queueing, lifecycle. |
| `/src/audio` | Microphone input, frequency analysis, silence detection, influence mapping. |
| `/src/render` | Three.js/WebGL setup, geometry helpers, mesh and material handling. |
| `/src/storage` | Session persistence and optional Drive integration. |
| `/src/export` | Canvas capture and artifact packaging. |
| `/src/utils` | Math, easing, noise, and identifier helpers. |
| `/shaders` | GLSL vertex and fragment shaders. |
| `/data` | Static glyph, phoneme, and emotion data. |
| `/scripts` | Build-time tasks (`build-glyphs.js`, `check-syntax.js`). |
| `/tests` | Unit, protocol-conformance, and audio test suites. |
| `/docs` | Roadmap and engineering documentation. |
| `/demo` | Standalone ritual page and an unrelated sandbox experiment. |

## Philosophy

This implementation adheres to the core principles of the MORPHA protocol:

- **Never cut, only morph** — all transitions are continuous; morph progress
  is capped per frame so no discontinuity can occur.
- **Silence is input** — absence of sound is a meaningful signal that alters
  motion, not a missing value.
- **Influence, not command** — user interactions are treated as environmental
  pressure rather than direct control.
- **Overlap creates semantics** — at least two symbols are in flight at all
  times; an utterance is a field event, not a sequence.
- **Transformation creates meaning** — interpretation stays open.
- **Save moments, not sessions** — artifacts are captured, not sessions
  persisted.

## Licence

The protocol is released under Creative Commons CC0. See
[`protocol/MORPHA.md`](protocol/MORPHA.md) §14.
