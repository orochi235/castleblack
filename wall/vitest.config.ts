import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // A component or hook test is a .tsx file and gets a DOM.
    environmentMatchGlobs: [['test/**/*.test.tsx', 'jsdom']],
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
