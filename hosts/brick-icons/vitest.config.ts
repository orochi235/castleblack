import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const LAB = resolve(
  process.env.BRICK_ICONS ?? resolve(import.meta.dirname, '../../../brick-icons'), 'lab/src');

export default defineConfig({
  resolve: {
    alias: {
      '@lab': LAB,
      // The wall's source, under the specifier brick-icons' lab also aliases.
      '@pezlie/wall': resolve(import.meta.dirname, '../../wall'),
      // brick-icons' source resolves its own imports from wherever it sits,
      // which need not have a node_modules; use this workspace's copy.
      '@weasel-js/core': resolve(import.meta.dirname, '../../node_modules/@weasel-js/core'),
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
