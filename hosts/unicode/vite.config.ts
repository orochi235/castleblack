import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@pezlie/wall': resolve(import.meta.dirname, '../../wall') } },
  server: {
    host: '::',
    port: 5196,
    proxy: { '/api': 'http://127.0.0.1:8796' },
  },
});
