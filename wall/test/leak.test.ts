import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const DOMAIN = /\b(lego|ldraw|bricks?|minifig|technic|duplo|occt|rebrickable|bricklink|brick-icons)\b/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(e.name) && path !== SELF ? [path] : [];
  });
}

it('keeps every domain word out of the package source and tests', () => {
  const hits: string[] = [];
  for (const file of ['src', 'test'].flatMap((d) => sourceFiles(join(ROOT, d)))) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (DOMAIN.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(hits).toEqual([]);
});
