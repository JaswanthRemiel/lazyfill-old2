import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Static build of the UI against a mocked chrome.* API, for screenshots and visual checks only.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-dev',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: { input: { panel: resolve(__dirname, 'dev/panel.html'), dashboard: resolve(__dirname, 'dev/dashboard.html'), frame: resolve(__dirname, 'dev/frame.html'), sheet: resolve(__dirname, 'dev/sheet.html'), hints: resolve(__dirname, 'dev/hints.html'), resume: resolve(__dirname, 'dev/resume.html'), review: resolve(__dirname, 'dev/review.html'), generate: resolve(__dirname, 'dev/generate.html') } },
  },
});
