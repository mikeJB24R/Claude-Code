import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: false },
  // Three.js ist von Haus aus groß – Warnung erst ab 1,2 MB
  build: { chunkSizeWarningLimit: 1200 },
});
