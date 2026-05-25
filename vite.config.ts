import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    // Installable PWA: caches the app shell so the hub reopens (offline, from localStorage)
    // even if Cloudflare is unreachable. API calls (/api) are never cached — they hit the
    // live backend, and the app falls back to local storage when it can't reach it.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['logo.jpg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Kyusi Hatakeros Tournament Hub',
        short_name: 'Kyusi Hub',
        description: 'Tournament brackets, standings and live results',
        theme_color: '#0d0f14',
        background_color: '#0d0f14',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,jpg,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//], // never serve the app shell for API routes
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst', options: { cacheName: 'google-fonts', expiration: { maxEntries: 8 } } },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
})
