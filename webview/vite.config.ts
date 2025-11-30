import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Build webview assets to ../media so extension can load them.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  base: '',
  build: {
    outDir: path.resolve(__dirname, '..', 'media'),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: `webview.js`,
        assetFileNames: `[name].[ext]`
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  }
});
