import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:2567',
      '/matchmake': 'http://127.0.0.1:2567',
      '/game': {
        target: 'ws://127.0.0.1:2567',
        ws: true,
        rewrite: (path) => path.replace(/^\/game/, ''),
      },
    },
  },
});
