import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the repo under its name.
  base: process.env.GITHUB_ACTIONS ? '/pezlie/' : '/',
  resolve: { alias: { '@pezlie/wall': resolve(import.meta.dirname, '../../wall') } },
  server: { host: '::', port: 5197 },
});
