import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '::',
    port: 5195,
    proxy: { '/api': 'http://127.0.0.1:8795' },
  },
});
