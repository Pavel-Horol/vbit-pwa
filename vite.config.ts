import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: BASE_PATH=/<repo>/ ; APK (этап 3): BASE_PATH=/ и NATIVE=1.
const base = process.env.BASE_PATH ?? '/';
// В APK файлы и так лежат в самом приложении — service worker только мешал бы обновлениям.
const native = process.env.NATIVE === '1';

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      disable: native,
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: {
        name: 'В бит',
        short_name: 'В бит',
        description: 'Тренажёр читки рэпа в бит',
        lang: 'ru',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#17131c',
        theme_color: '#17131c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,json,txt}'],
        // словарь ударений (REQ-STR-4) ~3,7 МБ без сжатия — должен попасть в офлайн-кэш
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
