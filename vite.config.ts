import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '#': resolve(__dirname, 'src'),
    },
  },

  // Serve the vanilla 3D engine as static files under /checkers/
  // so the dynamic import('/checkers/js/GameEngine.js') works at runtime.
  publicDir: 'public',

  // Additional static assets: copy checkers/ folder into public/ at build time
  // via the assetsInclude option — Vite will copy the checkers/ directory from
  // the project root into the output dist/checkers/ path.
  // In dev, the checkers/ directory is served by the devServer via the alias below.
  server: {
    fs: {
      // Allow serving files from the project root (for /checkers/ assets)
      allow: ['..'],
    },
  },

  build: {
    rollupOptions: {
      // The checkers JS files are vanilla ES modules — exclude them from bundling
      // so they can be dynamically imported at runtime with their own module graph.
      external: [
        '/checkers/js/GameEngine.js',
        '/checkers/js/Renderer3D.js',
        '/checkers/js/Modules.js',
        '/checkers/js/RuleProcessor.js',
      ],
    },
  },
})
