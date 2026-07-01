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

  // Serve the vanilla engines as static files under /checkers/ and /ludo/
  // so the dynamic import('/checkers/js/GameEngine.js') / import('/ludo/js/GameEngine.js')
  // calls work at runtime.
  publicDir: 'public',

  // Additional static assets: copy checkers/ and ludo/ folders into public/ at
  // build time via the assetsInclude option — Vite will copy these directories
  // from the project root into the output dist/checkers/ and dist/ludo/ paths.
  // In dev, these directories are served by the devServer via the alias below.
  server: {
    fs: {
      // Allow serving files from the project root (for /checkers/ and /ludo/ assets)
      allow: ['..'],
    },
  },

  build: {
    rollupOptions: {
      // The checkers/ludo JS files are vanilla ES modules — exclude them from
      // bundling so they can be dynamically imported at runtime with their
      // own module graph.
      external: [
        '/checkers/js/GameEngine.js',
        '/checkers/js/Renderer3D.js',
        '/checkers/js/Modules.js',
        '/checkers/js/RuleProcessor.js',
        '/ludo/js/GameEngine.js',
        '/ludo/js/Renderer2D.js',
        '/ludo/js/Modules.js',
        '/ludo/js/RuleProcessor.js',
      ],
    },
  },
})
