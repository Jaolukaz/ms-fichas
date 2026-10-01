/**
 * Build do PWA (versão hospedada): `npm run build:pwa` gera a pasta dist/.
 * O service worker (Workbox) pré-armazena todos os arquivos, inclusive fontes e o gerador de PDF,
 * para que a aplicação funcione sem internet depois da primeira abertura.
 */
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: ['es2020', 'safari15', 'chrome100'], assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        id: './',
        name: 'Fichas de treino · Matheus Scaldini',
        short_name: 'Fichas MS',
        description: 'Montagem de fichas de treino com PDF A4 vetorial, offline no celular e no computador.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#141517',
        theme_color: '#141517',
        categories: ['health', 'sports', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ttf,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
