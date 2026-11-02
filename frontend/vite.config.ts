import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/mediasoup-client')) {
            return 'mediasoup-client';
          }
        },
      },
    },
  },
  server: {
    // Слушать 0.0.0.0 — доступ с телефона/другого ПК по IP в LAN (см. README).
    host: true,
    port: 5173,
    proxy: {
      // При пустом VITE_API_URL фронт ходит на относительный `/api/...` — без прокси Vite отдаёт HTML.
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
        // Иначе backend видит у всех LAN-клиентов 127.0.0.1 и отдаёт им loopback-ICE (голос не поднимается).
        xfwd: true,
      },
    },
  },
});
