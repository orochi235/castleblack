import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // A static build under GitHub Pages sits below the emoji wall.
  base: process.env.UNICODE_BASE ?? '/',
  resolve: { alias: { '@pezlie/wall': resolve(import.meta.dirname, '../../wall') } },
  server: {
    host: '::',
    port: 5196,
    proxy: { '/api': 'http://127.0.0.1:8796' },
  },
});
