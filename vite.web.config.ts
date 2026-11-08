import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The tracker website published to GitHub Pages. It reuses the dashboard's Applications page, with
// the extension messaging swapped for direct Firestore calls (web/src/messages.ts).
export default defineConfig({
  root: 'web',
  base: './', // works under any Pages path, e.g. /lazyfill/
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /^(\.\.\/)+shared\/messages$/, replacement: resolve(__dirname, 'web/src/messages.ts') }],
  },
  build: { outDir: '../dist-web', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
