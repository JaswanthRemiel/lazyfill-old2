import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'LazyfillContent',
      fileName: () => 'content.js',
    },
    cssCodeSplit: false,
    rollupOptions: { output: { assetFileNames: 'content[extname]' } },
  },
});
