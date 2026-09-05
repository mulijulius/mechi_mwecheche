
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Separate from vite.config.ts on purpose: the app's Vite config wires in
// TanStackRouterVite + Tailwind + the checkers/ludo `external` rollup
// options, none of which matter for unit tests and some of which
// (route-tree generation) just slow test startup down for no benefit.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '#': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
})
