import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Build webview assets to ../media so extension can load them.
export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  plugins: [react()],
  base: '',
  build: {
    outDir: path.resolve(__dirname, '..', 'media'),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src', 'index.html'),
      output: {
        entryFileNames: `webview.js`,
        assetFileNames: `[name].[ext]`
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
