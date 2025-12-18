Project

Symbol–Sound Language
A WebGL system for communicating meaning through morphing glyphs and sound influence.

This is not a visualizer.
It is a symbolic instrument.

Requirements

- modern browser with WebGL
- microphone access
- Google Drive account (optional for saving)

Install
```bash
npm install
npm run dev
```
Local dev uses Vite for fast shader reload.

Build
```bash
npm run build
```
Outputs static assets suitable for:

- Netlify
- Vercel
- static hosting
- Electron wrapper

Folder responsibilities (short)

- `src/core` → time, state, lifecycle
- `src/glyphs` → symbolic language engine
- `src/audio` → hearing + silence
- `src/render` → WebGL + shaders
- `src/ritual` → experience logic
- `src/export` → capture + packaging
- `src/storage` → Google Drive integration

If something feels wrong, it is probably in ritual or glyphs, not render.

Philosophy (important to keep)

- never cut, only morph
- silence is input
- controls are influence, not command
- save moments, not sessions

If you break these, the system becomes a toy.