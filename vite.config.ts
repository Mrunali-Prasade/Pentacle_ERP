import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Auto-update: when a new version is deployed, the service worker fetches it and swaps in
        // on the next visit — so nobody gets stuck on a stale build of a payroll app.
        registerType: 'autoUpdate',
        includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png', 'logo-light.png', 'logo-dark.png'],
        manifest: {
          name: 'Pentacle Payroll',
          short_name: 'Pentacle',
          description: 'Pentacle payroll, attendance & reimbursement system',
          theme_color: '#021934',
          background_color: '#021934',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Serve the app shell for client-side routes when offline, but NEVER for /api — those
          // must always reach the server.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              // Live data only: API responses are never served from cache, so no stale payroll,
              // attendance or reimbursement data can ever be shown.
              urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api'),
              handler: 'NetworkOnly',
            },
          ],
          cleanupOutdatedCaches: true,
        },
        // No service worker while developing — avoids confusing cache behaviour during local work.
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:3001'
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/server/uploads/**']
      },
    },
  };
});
