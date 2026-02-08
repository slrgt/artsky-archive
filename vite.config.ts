import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// GitHub project pages: main → /artsky/, dev → /artsky-dev/ (set VITE_BASE_PATH in CI)
const isProd = process.env.NODE_ENV === 'production'
const base = process.env.VITE_BASE_PATH ?? (isProd ? '/artsky/' : '/')
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ArtSky',
        short_name: 'ArtSky',
        description: 'Bluesky feed & artboards',
        theme_color: '#1a1a2e',
        background_color: '#0f0f1a',
        display: 'standalone',
        orientation: 'portrait',
        scope: './',
        start_url: './',
        icons: [
          { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: './index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB (main chunk exceeds 2 MiB default)
      },
    }),
  ],
})
