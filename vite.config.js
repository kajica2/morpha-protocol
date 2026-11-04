import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// The app fetches glyph data at runtime from <base>data/*.json. Vite only
// emits `public/` into the build output, so copy data/ into dist/ as part of
// the build. Without this the production bundle 404s on its own glyph data.
function copyDataDir() {
  return {
    name: 'morpha-copy-data',
    apply: 'build',
    closeBundle() {
      const from = path.resolve(process.cwd(), 'data')
      const to = path.resolve(process.cwd(), 'dist/data')
      if (!fs.existsSync(from)) return
      fs.rmSync(to, { recursive: true, force: true })
      fs.cpSync(from, to, { recursive: true })
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the project from a sub-path; Vercel serves from root.
  base: process.env.VITE_BASE_PATH || '/',
  build: { sourcemap: false },
  plugins: [copyDataDir()],
})
