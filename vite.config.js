import { defineConfig } from 'vite'

export default defineConfig({
  base: '/morpha-protocol/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  }
})
