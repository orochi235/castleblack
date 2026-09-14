import type { View } from '@weasel-js/core';
import type { CompiledSpec } from './cel';
import { tagsOf, tintColumn, type Facts } from './derive';
import { drawPaintCommand, type DrawOptions } from './draw2d';
import { rectAt, visiblePositions, visibleSpans, type Laid } from './layout';
import { paintCommands, STALE_WASH, type Appearance } from './paint';
import type { Palette } from './palette';
import type { Item } from './schema';
import type { SheetManifest } from './sheet';
import { ramp, STATUS, STEPS, tintFor, type RampName } from './tint';

/** A tile's edge in pixels. */
export const TILE_PX = 512;
/** Below this many tile pixels a cell is written as a run of pixels in its
 *  color: a picture that small is noise, and a draw call per cell is not. */
export const PIXEL_CELL_PX = 4;
export const MAX_TILES = 128;
const LEVELS = { min: -20, max: 12 };
/** How far down the pyramid a missing tile looks for something to stand in. */
const FALLBACK_DEPTH = 8;

/** Everything that decides a tile's pixels except where it is. A new scene is
 *  a new cache: tiles are never patched. */
export interface TileScene<T extends Item> {
  compiled: CompiledSpec<T>;
  facts: Facts<T>;
  laid: Laid;
  manifest: SheetManifest | null;
  sheet: HTMLImageElement | null;
  palette: Palette;
  options: DrawOptions;
  highlight: string | null;
  highlightTag: string | null;
  appearance: Appearance;
  tint: string;
  gradient: RampName;
  stale: boolean;
  ground: string;
}

export interface TileSurface {
  canvas: CanvasImageSource;
  ctx: CanvasRenderingContext2D;
}
export type MakeSurface = (px: number) => TileSurface;

export interface TileRef { z: number; tx: number; ty: number; key: string; x: number; y: number; size: number }

export const tileKey = (z: number, tx: number, ty: number) => `${z}/${tx}/${ty}`;

/** The pyramid level whose tiles are at least as sharp as the screen:
 *  `2^z` tile pixels per world unit. */
export function tileLevel(scale: number, dpr: number): number {
  const z = Math.ceil(Math.log2(scale * dpr) - 1e-9);
  return Math.min(LEVELS.max, Math.max(LEVELS.min, z)) + 0;
}

function ref(z: number, tx: number, ty: number): TileRef {
  const size = TILE_PX / 2 ** z;
  return { z, tx, ty, key: tileKey(z, tx, ty), x: tx * size, y: ty * size, size };
}

/** The tiles covering the viewport, in rows. */
export function coveringTiles(cam: View, viewport: { width: number; height: number },
                              dpr: number): TileRef[] {
  const z = tileLevel(cam.scale.x, dpr);
  const size = TILE_PX / 2 ** z;
  const x1 = cam.x + viewport.width / cam.scale.x;
  const y1 = cam.y + viewport.height / cam.scale.y;
  const out: TileRef[] = [];
  for (let ty = Math.floor(cam.y / size); ty * size < y1; ty++) {
    for (let tx = Math.floor(cam.x / size); tx * size < x1; tx++) out.push(ref(z, tx, ty));
  }
  return out;
}

function parseColor(css: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(css.trim());
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.replace(/./g, '$&$&') : hex[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(css.trim());
  if (fn) {
    const [r = 128, g = 128, b = 128] = fn[1]!.split(/[\s,/]+/).map(Number);
    return [r, g, b];
  }
  return [128, 128, 128];
}

/** Every cell in the tile as a run of its color: its state's border where it
 *  has one, else its fill, dimmed and washed as `paint` would. */
function pixelTile<T extends Item>(scene: TileScene<T>, ctx: CanvasRenderingContext2D, view: View) {
  const { compiled, facts, laid, palette, tint, gradient, highlight, highlightTag, appearance,
          stale, options } = scene;
  const img = ctx.createImageData(TILE_PX, TILE_PX);
  const data = img.data;
  const scale = view.scale.x;
  const side = Math.max(1, Math.round(laid.cell * scale));
  const fallback = compiled.states.findIndex(
    (s) => s.key === compiled.byPrecedence[compiled.byPrecedence.length - 1]!.key);
  const wash = parseColor(options.washColor);
  const rgba = new Map<string, number[]>();
  const colorOf = (css: string, washBy: number, alpha: number) => {
    const key = `${css}|${washBy}|${alpha}`;
    let out = rgba.get(key);
    if (!out) {
      const c = parseColor(css);
      out = [0, 1, 2].map((i) => Math.round(c[i]! + (wash[i]! - c[i]!) * washBy));
      out.push(Math.round(alpha * 255));
      rgba.set(key, out);
    }
    return out;
  };
  const plain = highlight === null && highlightTag === null && !stale && !appearance.wash;
  const byState = compiled.states.map((s) => {
    const style = palette.states[s.key]!;
    return colorOf(style.border ?? style.fill, 0, 1);
  });
  // A ramp has STEPS swatches, so a measure is a lookup, as `tintFor` would draw it.
  const measured = plain && tint !== STATUS ? tintColumn(facts, tint) : null;
  const swatches = Array.from({ length: STEPS }, (_, s) => colorOf(ramp(s / (STEPS - 1), gradient), 0, 1));
  const unmatched = colorOf(palette.unmatched.fill, 0, 1);

  for (const { block, c0, c1, r0, r1 } of visibleSpans(laid, view, { width: TILE_PX, height: TILE_PX })) {
    for (let r = r0; r <= r1; r++) {
      const py0 = Math.floor((block.y + r * laid.pitch - view.y) * scale);
      for (let c = c0; c <= c1; c++) {
        const i = r * block.cols + c;
        if (i >= block.count) break;
        const row = laid.order[block.start + i]!;
        let color: number[];
        if (measured) {
          const t = measured[row]!;
          color = Number.isNaN(t) ? unmatched
            : swatches[Math.round(Math.max(0, Math.min(1, t)) * (STEPS - 1))]!;
        } else if (plain) {
          color = byState[facts.state[row]!]!;
        } else {
          const state = compiled.states[facts.state[row]!]!;
          const dimmed = (highlight !== null && state.family !== highlight)
            || (highlightTag !== null && !tagsOf(facts, row).includes(highlightTag));
          const style = dimmed ? palette.states[compiled.states[fallback]!.key]!
            : tintFor(facts, row, tint, palette, gradient);
          const washBy = stale ? Math.max(STALE_WASH, appearance.washStrength)
            : appearance.wash && facts.washed[row] ? appearance.washStrength : 0;
          color = colorOf(tint === STATUS ? style.border ?? style.fill : style.fill, washBy,
                          dimmed ? appearance.dimAlpha : 1);
        }
        const px0 = Math.floor((block.x + c * laid.pitch - view.x) * scale);
        const x0 = Math.max(0, px0);
        const x1 = Math.min(TILE_PX, px0 + side);
        const y0 = Math.max(0, py0);
        const y1 = Math.min(TILE_PX, py0 + side);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const at = (y * TILE_PX + x) * 4;
            data[at] = color[0]!;
            data[at + 1] = color[1]!;
            data[at + 2] = color[2]!;
            data[at + 3] = color[3]!;
          }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function renderTile<T extends Item>(scene: TileScene<T>, ctx: CanvasRenderingContext2D,
                                           tile: TileRef): void {
  const scale = 2 ** tile.z;
  const view: View = { x: tile.x, y: tile.y, scale: { x: scale, y: scale } };
  ctx.clearRect(0, 0, TILE_PX, TILE_PX);
  if (scene.laid.cell * scale < PIXEL_CELL_PX) {
    pixelTile(scene, ctx, view);
    return;
  }
  const { compiled, facts, laid, manifest, palette, highlight, highlightTag, tint, gradient,
          stale, ground, sheet, options } = scene;
  const cmds = paintCommands({
    compiled, facts, order: laid.order, rect: (p) => rectAt(laid, p),
    visible: visiblePositions(laid, view, { width: TILE_PX, height: TILE_PX }) ?? [],
    cam: view, manifest, palette, highlight, highlightTag, caret: null, tint, gradient, stale,
    ground,
    // Below the size tiles are drawn at, the wall shows neither.
    appearance: { ...scene.appearance, showBadges: false, showCaptions: false },
  });
  ctx.imageSmoothingEnabled = true;
  for (const cmd of cmds) drawPaintCommand(ctx, cmd, sheet, palette, options);
}

/** The wall below badge size, as square tiles at power-of-two zoom levels,
 *  rendered on demand and kept least recently used first out. */
export class TileCache<T extends Item> {
  readonly #tiles = new Map<string, TileSurface>();
  #previous: TileCache<T> | null;

  /** `previous` stands in for tiles this scene has not rendered yet, so a
   *  filter change redraws in place instead of blanking. */
  constructor(readonly scene: TileScene<T>, readonly make: MakeSurface,
              previous: TileCache<T> | null = null, readonly max = MAX_TILES) {
    this.#previous = previous;
    previous?.forget();
  }

  get size() { return this.#tiles.size; }

  has(key: string) { return this.#tiles.has(key); }

  /** Lets go of the scene before, once there is no call to stand in for it. */
  forget() { this.#previous = null; }

  peek(key: string): TileSurface | undefined { return this.#tiles.get(key); }

  #use(key: string): TileSurface | undefined {
    const hit = this.#tiles.get(key);
    if (hit) { this.#tiles.delete(key); this.#tiles.set(key, hit); }
    return hit;
  }

  render(tile: TileRef): TileSurface {
    const surface = this.make(TILE_PX);
    renderTile(this.scene, surface.ctx, tile);
    this.#tiles.set(tile.key, surface);
    while (this.#tiles.size > this.max) this.#tiles.delete(this.#tiles.keys().next().value!);
    return surface;
  }

  /** Draws the tiles covering the view onto `ctx`, in CSS pixels. Renders the
   *  missing ones nearest the center first until `budgetMs` has passed (always
   *  at least one), standing in for the rest with a coarser tile or the
   *  previous scene's. Returns whether every tile drawn was this scene's own. */
  draw(ctx: CanvasRenderingContext2D, cam: View, viewport: { width: number; height: number },
       dpr: number, budgetMs = 8, now: () => number = () => performance.now()): boolean {
    const start = now();
    const tiles = coveringTiles(cam, viewport, dpr);
    const cx = cam.x + viewport.width / cam.scale.x / 2;
    const cy = cam.y + viewport.height / cam.scale.y / 2;
    const missing = tiles.filter((t) => !this.#tiles.has(t.key)).sort((a, b) =>
      Math.hypot(a.x + a.size / 2 - cx, a.y + a.size / 2 - cy)
      - Math.hypot(b.x + b.size / 2 - cx, b.y + b.size / 2 - cy));
    let rendered = 0;
    for (const tile of missing) {
      if (rendered > 0 && now() - start >= budgetMs) break;
      this.render(tile);
      rendered++;
    }

    let complete = true;
    ctx.imageSmoothingEnabled = true;
    for (const tile of tiles) {
      const dx = (tile.x - cam.x) * cam.scale.x;
      const dy = (tile.y - cam.y) * cam.scale.y;
      const dw = tile.size * cam.scale.x;
      const dh = tile.size * cam.scale.y;
      const hit = this.#use(tile.key);
      if (hit) { ctx.drawImage(hit.canvas, dx, dy, dw, dh); continue; }
      complete = false;
      this.#standIn(ctx, tile, dx, dy, dw, dh);
    }
    return complete;
  }

  #standIn(ctx: CanvasRenderingContext2D, tile: TileRef, dx: number, dy: number,
           dw: number, dh: number) {
    const before = this.#previous?.peek(tile.key);
    if (before) { ctx.drawImage(before.canvas, dx, dy, dw, dh); return; }
    for (let k = 1; k <= FALLBACK_DEPTH; k++) {
      const step = 2 ** k;
      const px = Math.floor(tile.tx / step);
      const py = Math.floor(tile.ty / step);
      const key = tileKey(tile.z - k, px, py);
      const parent = this.#tiles.get(key) ?? this.#previous?.peek(key);
      if (!parent) continue;
      const sub = TILE_PX / step;
      ctx.drawImage(parent.canvas, (tile.tx - px * step) * sub, (tile.ty - py * step) * sub,
                    sub, sub, dx, dy, dw, dh);
      return;
    }
  }
}

/** A tile surface on an offscreen canvas where there is one. */
export const offscreenSurface: MakeSurface = (px) => {
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(px, px)
    : Object.assign(document.createElement('canvas'), { width: px, height: px });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return { canvas: canvas as CanvasImageSource, ctx };
};
