import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const logger = createLogger();
const _error = logger.error.bind(logger);
logger.error = (msg, opts) => {
  if (msg.includes('ws proxy')) return;
  _error(msg, opts);
};

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  customLogger: logger,
  build: {
    outDir: resolve(__dirname, '../resources/frontend-dist'),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws/danmaku': {
        target: 'ws://localhost:3001',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', () => {});
          });
        },
      },
    },
  },
});
