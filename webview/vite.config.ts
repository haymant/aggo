import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Build webview assets to ../media so extension can load them.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      // Ensure the editor and app use the same React instances to avoid invalid hook calls
      react: path.resolve(__dirname, '../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, '../node_modules/react-dom/client')
    }
  },
  base: '',
  build: {
    outDir: path.resolve(__dirname, '..', 'media'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        cpn: path.resolve(__dirname, 'cpn.html'),
        graphql: path.resolve(__dirname, 'graphql.html')
      },
      output: {
        entryFileNames: `[name].webview.js`,
        assetFileNames: `[name].[ext]`
      }
    }
  },
  server: {
    // Port can be overridden via environment variable VITE_DEV_SERVER_PORT or VITE_DEV_SERVER_URL
    port: Number(process.env.VITE_DEV_SERVER_PORT || (process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL).port : undefined)) || 5173,
    // IMPORTANT: the extension hardcodes localhost:5173 as the default dev server URL.
    // If Vite auto-picks another port, the webview will try the wrong port and fail.
    strictPort: true,
    // Allow vscode-webview:// origins to load modules from the dev server.
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  }
});
