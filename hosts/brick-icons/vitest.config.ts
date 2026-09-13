import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export const LAB = resolve(process.env.BRICK_ICONS ?? resolve(__dirname, '../../../brick-icons'), 'lab/src');

if (!existsSync(LAB)) {
  console.warn(`no brick-icons lab source at ${LAB}: parity tests will fail to import`);
}

export default defineConfig({
  resolve: { alias: { '@lab': LAB } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
