/** What `derive` costs over a corpus the size of brick-icons', column by column.
 *
 *    npx vite-node -c vitest.config.ts bench/derive.ts
 */
import { compile } from '@pezlie/wall/src/cel';
import { derive } from '@pezlie/wall/src/derive';
import type { Cell } from '@lab/corpus/types';
import { BRICK_ICONS } from '../src/spec';
import { generateCells } from '../test/cells';

const N = 24_591;
const cells = generateCells(13, N);
const c = compile(BRICK_ICONS);

const columns: [string, (cell: Cell) => unknown][] = [
  ['state', (cell) => c.byPrecedence.find((s) => s.match(cell))],
  ...Object.entries(c.filters).map(([k, f]): [string, (cell: Cell) => unknown] => [`filters.${k}`, f]),
  ...Object.entries(c.classes).map(([k, f]): [string, (cell: Cell) => unknown] => [`classes.${k}`, f]),
  ...Object.entries(c.sorts).map(([k, f]): [string, (cell: Cell) => unknown] => [`sorts.${k}`, f]),
  ['tags', c.tags!],
  ['washes', c.washes!],
  ...Object.entries(c.facets).map(([k, f]): [string, (cell: Cell) => unknown] => [`facets.${k}`, f]),
  ...Object.entries(c.captions).map(([k, f]): [string, (cell: Cell) => unknown] => [`captions.${k}`, f]),
  ['glyph', c.glyph!],
  ['mark', c.mark!],
  ...(BRICK_ICONS.tints ?? []).map((t): [string, (cell: Cell) => unknown] => [`tint.${t.key}`, t.t]),
];

derive(c, cells.slice(0, 2000).map((cell, index) => ({ ...cell, index })));

let summed = 0;
columns.forEach(([name, fn], i) => {
  const t0 = performance.now();
  for (const cell of cells) fn(cell);
  const ms = performance.now() - t0;
  summed += ms;
  console.log(`${String(i + 1).padStart(2)}/${columns.length}  ${name.padEnd(20)} ${ms.toFixed(1).padStart(7)} ms`);
});

// Fresh objects: the column loop above has already bound every one of `cells`,
// and a load always arrives as new objects.
const fresh = generateCells(13, N);
const t0 = performance.now();
derive(c, fresh);
const whole = performance.now() - t0;
console.log(`derive over ${N} items   ${whole.toFixed(1).padStart(7)} ms  (columns alone, bindings already built: ${summed.toFixed(1)} ms)`);
