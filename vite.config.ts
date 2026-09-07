import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['app-icon.svg'],
      manifest: {
        name: 'Business Records',
        short_name: 'Records',
        description: 'Private business records and supporting evidence.',
        theme_color: '#1f4e78',
        background_color: '#f7f9fb',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
      },
    }),
    cloudflare(),
  ],
});
