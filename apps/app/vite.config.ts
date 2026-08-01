import { createRequire } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH ?? '/'
const { version: appVersion } = createRequire(import.meta.url)('./package.json') as {
  version: string
}

// https://vite.dev/config/
export default defineConfig({
  base,
  // Stamped into backup files so a bundle records which build wrote it.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'manifest.webmanifest',
        'assets/fons/*',
        'assets/mac-hello-1984.svg',
        'assets/player-bg.webp',
        'fonts/*',
        'icons/*',
      ],
      manifest: false,
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{css,html,ico,js,png,svg,webmanifest,webp,woff,woff2}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api\//, /^\/supabase\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'font' || request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'umbra-silico-static-assets',
              expiration: {
                maxAgeSeconds: 60 * 60 * 24 * 30,
                maxEntries: 96,
              },
            },
          },
        ],
        skipWaiting: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
