import { screenToWorld, viewToTransform, type View } from '@weasel-js/core';
import type { Facts } from './derive';
import type { Item } from './schema';

export interface Rect { x: number; y: number; w: number; h: number }

export interface LayoutOptions {
  /** Edge of one cell in world units. */
  cell: number;
  /** Space between cells in world units. */
  gap: number;
  cols: number;
}

/** A group header a layout wants drawn. `depth` 0 is the outer band, 1 an
 *  inner block inside it -- so paint styles the two without a second field,
 *  and a third level costs the type nothing. */
export interface Band {
  key: string;
  label: string;
  count: number;
  rect: Rect;
  depth: 0 | 1;
  /** World space the layout kept clear above the block's first cell row. The
   *  label is set to fit this, so the two cannot disagree about how much room
   *  the text has. */
  header: number;
}

/** A rectangle of cells filled row-major: positions `start..start+count` of
 *  the laid order, `cols` to a row, the first at (`x`, `y`). */
export interface Block { x: number; y: number; cols: number; start: number; count: number }

/** Where every cell sits, as blocks rather than a rect per item. `order[p]`
 *  is the row drawn at position `p`. */
export interface Laid {
  order: Uint32Array;
  blocks: Block[];
  bands: Band[];
  bounds: { w: number; h: number };
  cell: number;
  pitch: number;
}

export interface LayoutInput<T extends Item> {
  /** The selection, in view order. */
  rows: Uint32Array;
  facts?: Facts<T>;
}

/** A layout answers where each item's cell sits, and nothing else. It never
 *  touches the atlas, so re-sorting or regrouping the wall rebakes nothing. */
export type Layout<T extends Item = Item> = (input: LayoutInput<T>, opts: LayoutOptions) => Laid;

export const gridLayout: Layout = ({ rows }, { cell, gap, cols }) => {
  const pitch = cell + gap;
  const n = rows.length;
  return {
    order: rows,
    blocks: n ? [{ x: 0, y: 0, cols, start: 0, count: n }] : [],
    bands: [],
    bounds: n ? { w: Math.min(n, cols) * pitch - gap, h: Math.ceil(n / cols) * pitch - gap }
      : { w: 0, h: 0 },
    cell,
    pitch,
  };
};

function blockOf(laid: Laid, position: number): Block | undefined {
  const { blocks } = laid;
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = blocks[mid]!;
    if (position < b.start) hi = mid - 1;
    else if (position >= b.start + b.count) lo = mid + 1;
    else return b;
  }
  return undefined;
}

export function rectAt(laid: Laid, position: number): Rect | undefined {
  const b = blockOf(laid, position);
  if (!b) return undefined;
  const i = position - b.start;
  return { x: b.x + (i % b.cols) * laid.pitch, y: b.y + Math.floor(i / b.cols) * laid.pitch,
           w: laid.cell, h: laid.cell };
}

/** The position whose cell holds the world point. A gap belongs to the cell
 *  before it: at a few pixels a cell, the gaps are much of what gets clicked. */
export function positionAt(laid: Laid, x: number, y: number): number | null {
  for (const b of laid.blocks) {
    const col = Math.floor((x - b.x) / laid.pitch);
    const row = Math.floor((y - b.y) / laid.pitch);
    if (col < 0 || row < 0 || col >= b.cols) continue;
    const i = row * b.cols + col;
    if (i >= b.count) continue;
    return b.start + i;
  }
  return null;
}

export interface Viewport { width: number; height: number; x?: number; y?: number }

/** Per block, the column and row span of cells touching the viewport. */
export function visibleSpans(laid: Laid, view: View, viewport: Viewport):
    { block: Block; c0: number; c1: number; r0: number; r1: number }[] {
  const transform = viewToTransform(view);
  const x0 = viewport.x ?? 0;
  const y0 = viewport.y ?? 0;
  const [tlX, tlY] = screenToWorld(x0, y0, transform);
  const [brX, brY] = screenToWorld(x0 + viewport.width, y0 + viewport.height, transform);
  const { pitch, cell } = laid;
  const out = [];
  for (const block of laid.blocks) {
    if (block.count === 0) continue;
    const rows = Math.ceil(block.count / block.cols);
    // A cell at column c spans [x + c*pitch, x + c*pitch + cell).
    const c0 = Math.max(0, Math.floor((tlX - block.x - cell) / pitch) + 1);
    const c1 = Math.min(block.cols - 1, Math.ceil((brX - block.x) / pitch) - 1);
    const r0 = Math.max(0, Math.floor((tlY - block.y - cell) / pitch) + 1);
    const r1 = Math.min(rows - 1, Math.ceil((brY - block.y) / pitch) - 1);
    if (c0 > c1 || r0 > r1) continue;
    out.push({ block, c0, c1, r0, r1 });
  }
  return out;
}

/** Positions of the cells touching the viewport, or null when there are more
 *  than `limit` of them.
 *
 *  `viewport` may carry an origin, in the same CSS pixels as its size and
 *  measured from the canvas's own top-left. A pinch leaves only part of the
 *  canvas on screen, and that part is not at its corner; without the origin
 *  the range covers the whole canvas, which is how a pinched wall would fetch
 *  a sharper tile for every cell including the ones nobody can see. */
export function visiblePositions(laid: Laid, view: View, viewport: Viewport,
                                 limit = Infinity): number[] | null {
  const spans = visibleSpans(laid, view, viewport);
  let total = 0;
  for (const s of spans) total += (s.c1 - s.c0 + 1) * (s.r1 - s.r0 + 1);
  if (total > limit) return null;
  const out: number[] = [];
  for (const { block, c0, c1, r0, r1 } of spans) {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * block.cols + c;
        if (i < block.count) out.push(block.start + i);
      }
    }
  }
  return out;
}

/** How many cells touch the viewport, without listing them. */
export function visibleCount(laid: Laid, view: View, viewport: Viewport): number {
  let total = 0;
  for (const s of visibleSpans(laid, view, viewport)) {
    const lastRowCells = s.block.count - s.r1 * s.block.cols;
    total += (s.c1 - s.c0 + 1) * (s.r1 - s.r0)
      + Math.max(0, Math.min(s.c1 + 1, lastRowCells) - s.c0);
  }
  return total;
}
