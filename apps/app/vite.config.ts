import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        globPatterns: ['**/*.{css,html,ico,js,png,svg,webmanifest,webp,woff}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/supabase\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'font' || request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'silicon-nostalgia-static-assets',
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
