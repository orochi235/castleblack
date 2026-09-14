/** What each stage of the wall costs over the Unicode feed at three sizes.
 *
 *    npx vite-node bench/scale.ts [path/to/codepoints.arrow]
 *
 *  One line per stage as it finishes. The browser's own numbers, first paint
 *  and frame rate included, come from `hosts/unicode/bench/browser.mjs`.
 */
import { readFileSync } from 'node:fs';
import { tableFromIPC } from 'apache-arrow';
import { UNICODE, type CodePoint } from '../../hosts/unicode/src/spec';
import { compile } from '../src/cel';
import { derive, tintColumn } from '../src/derive';
import { DEFAULT_WASH } from '../src/draw2d';
import { bandedLayout, blockLayout } from '../src/grouped';
import { gridLayout, visibleCount } from '../src/layout';
import { DEFAULT_APPEARANCE } from '../src/paint';
import { defaultPalette } from '../src/palette';
import { applySelection, sortOrder } from '../src/select';
import { storeFromArrow } from '../src/store';
import { coveringTiles, renderTile } from '../src/tiles';

const path = process.argv[2] ?? '../hosts/unicode/out/codepoints.arrow';
const SIZES = [25_000, 250_000, 1_114_112];
const bytes = readFileSync(path);
const compiled = compile(UNICODE);
const palette = defaultPalette(compiled.states);

const planeKey = { reads: ['plane'], of: (c: CodePoint) => String(c.plane).padStart(2, '0') };
const blockKey = {
  reads: ['block_start', 'block'],
  of: (c: CodePoint) => `${String(c.block_start ?? 0x10ffff).padStart(7, '0')} ${c.block}`,
};

/** A 2D context that keeps pixels and ignores everything else. */
const pixelContext = () => new Proxy({
  createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
}, { get: (t, p: string) => (p in t ? t[p as keyof typeof t] : () => {}) }) as unknown as CanvasRenderingContext2D;

const stages = 17;
let at = 0;
function time<V>(name: string, n: number, fn: () => V): V {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  console.log(`${String(++at).padStart(2)}/${stages * SIZES.length}  ${name.padEnd(26)} `
    + `${String(n).padStart(9)}  ${ms.toFixed(1).padStart(8)} ms`);
  return out;
}

for (const n of SIZES) {
  const whole = time('decode', n, () => tableFromIPC(bytes));
  const table = n < whole.numRows ? whole.slice(0, n) : whole;
  const store = time('store', n, () => storeFromArrow<CodePoint>(table));
  const facts = time('derive', n, () => derive(compiled, store));
  time('sort by code point', n, () => sortOrder(facts, 'cp'));
  time('sort by age', n, () => sortOrder(facts, 'age'));
  time('sort by name', n, () => sortOrder(facts, 'name'));
  const all = time('select everything', n, () =>
    applySelection(compiled, facts, { sort: 'cp', filter: 'all', shown: {} }));
  time('select assigned', n, () =>
    applySelection(compiled, facts, { sort: 'cp', filter: 'assigned', shown: {} }));
  time('select, a script left out', n, () =>
    applySelection(compiled, facts, { sort: 'cp', filter: 'all', shown: {}, exclude: { script: ['Han'] } }));
  const opts = { cell: 32, gap: 4, cols: Math.ceil(Math.sqrt(all.length)) };
  const laid = time('grid layout', n, () => gridLayout({ rows: all }, opts));
  time('group by plane', n, () => blockLayout(planeKey, [])({ rows: all, facts }, opts));
  time('band by plane and block', n, () => bandedLayout(planeKey, blockKey, false)({ rows: all, facts }, opts));
  time('tint by age', n, () => tintColumn(facts, 'age'));
  const width = 1600;
  const height = 1000;
  const scale = width / laid.bounds.w;
  const cam = { x: 0, y: 0, scale: { x: scale, y: scale } };
  time('count visible cells', n, () => visibleCount(laid, cam, { width, height }));
  const tiles = coveringTiles(cam, { width, height }, 1);
  const scene = {
    compiled, facts, laid, manifest: null, sheet: null, palette,
    options: { marks: {}, washColor: DEFAULT_WASH }, highlight: null, highlightTag: null,
    appearance: DEFAULT_APPEARANCE, tint: 'status', gradient: 'ember' as const, stale: false,
    ground: '#ffffff',
  };
  time(`render ${tiles.length} tiles, fitted`, n, () => {
    for (const tile of tiles) renderTile(scene, pixelContext(), tile);
  });
  const tinted = { ...scene, tint: 'age' };
  time(`render ${tiles.length} tiles, by age`, n, () => {
    for (const tile of tiles) renderTile(tinted, pixelContext(), tile);
  });
}
