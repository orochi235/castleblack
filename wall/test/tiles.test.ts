import { describe, expect, it } from 'vitest';
import { compile } from '../src/cel';
import { derive } from '../src/derive';
import { DEFAULT_WASH } from '../src/draw2d';
import { gridLayout } from '../src/layout';
import { DEFAULT_APPEARANCE } from '../src/paint';
import { defaultPalette } from '../src/palette';
import {
  coveringTiles, TILE_PX, TileCache, tileKey, tileLevel, type TileScene, type TileSurface,
} from '../src/tiles';
import { ramp, STATUS } from '../src/tint';
import { SPEC, thing, type Thing } from './fixture';

const compiled = compile(SPEC);

/** A context that records every call and hands back real pixel buffers. */
function fakeContext() {
  const calls: [string, unknown[]][] = [];
  const target: Record<string, unknown> = {
    calls,
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img: unknown) => { target.image = img; },
  };
  return new Proxy(target, {
    get: (t, p: string) => (p in t ? t[p] : (...args: unknown[]) => { calls.push([p, args]); }),
    set: (t, p: string, v) => { t[p] = v; return true; },
  }) as unknown as CanvasRenderingContext2D & { calls: typeof calls; image?: ImageData };
}

function scene(items: Thing[], cell: number, cols = 4): TileScene<Thing> {
  const facts = derive(compiled, items);
  return {
    compiled, facts, manifest: null, sheet: null,
    laid: gridLayout({ rows: Uint32Array.from(items, (_, i) => i) }, { cell, gap: 0, cols }),
    palette: defaultPalette(compiled.states),
    options: { marks: {}, washColor: DEFAULT_WASH },
    highlight: null, highlightTag: null, appearance: DEFAULT_APPEARANCE, tint: STATUS,
    gradient: 'ember', stale: false, ground: '#ffffff',
  };
}

const surfaces = () => {
  const made: TileSurface[] = [];
  const make = () => {
    const ctx = fakeContext();
    const s = { canvas: { id: made.length } as unknown as CanvasImageSource, ctx };
    made.push(s);
    return s;
  };
  return { made, make };
};

const cam = (x: number, y: number, s: number) => ({ x, y, scale: { x: s, y: s } });

describe('coveringTiles', () => {
  it('picks the level at least as sharp as the screen', () => {
    expect(tileLevel(1, 1)).toBe(0);
    expect(tileLevel(0.25, 1)).toBe(-2);
    expect(tileLevel(0.3, 2)).toBe(0);
    expect(tileLevel(3, 1)).toBe(2);
  });

  it('covers the viewport, negative tiles included', () => {
    expect(coveringTiles(cam(0, 0, 1), { width: 1024, height: 512 }, 1).map((t) => t.key))
      .toEqual(['0/0/0', '0/1/0']);
    expect(coveringTiles(cam(-10, 0, 1), { width: 600, height: 100 }, 1).map((t) => t.key))
      .toEqual(['0/-1/0', '0/0/0', '0/1/0']);
    const far = coveringTiles(cam(0, 0, 0.125), { width: 512, height: 512 }, 1);
    expect(far.map((t) => [t.key, t.size])).toEqual([['-3/0/0', 4096]]);
  });
});

describe('TileCache', () => {
  const items = Array.from({ length: 64 }, (_, i) => thing(`t${i}`, i, i % 5 === 0 ? { err: 'x' } : {}));

  it('renders nearest the center first, and stops at the budget', () => {
    const { made, make } = surfaces();
    const cache = new TileCache(scene(items, 1, 8), make);
    let t = 0;
    const done = cache.draw(fakeContext(), cam(-512, -512, 1), { width: 1536, height: 1536 }, 1, 10, () => (t += 6));
    expect(done).toBe(false);
    expect(made.length).toBe(2);
    expect(cache.has(tileKey(0, 0, 0))).toBe(true);
  });

  it('says it is complete once every tile is its own, and renders nothing more', () => {
    const { made, make } = surfaces();
    const cache = new TileCache(scene(items, 1, 8), make);
    const view = cam(0, 0, 1);
    expect(cache.draw(fakeContext(), view, { width: 512, height: 512 }, 1, 1000)).toBe(true);
    const before = made.length;
    expect(cache.draw(fakeContext(), view, { width: 512, height: 512 }, 1, 1000)).toBe(true);
    expect(made.length).toBe(before);
  });

  it('stands in for a missing tile with the part of a coarser one it covers', () => {
    const { make } = surfaces();
    const cache = new TileCache(scene(items, 1, 8), make);
    cache.draw(fakeContext(), cam(0, 0, 0.5), { width: 512, height: 512 }, 1, 1000);
    expect(cache.has(tileKey(-1, 0, 0))).toBe(true);
    const ctx = fakeContext();
    let t = 0;
    cache.draw(ctx, cam(0, 0, 1), { width: 1024, height: 512 }, 1, 0, () => (t += 1));
    const quarter = ctx.calls.filter(([name, args]) => name === 'drawImage' && args.length === 9);
    expect(quarter.map(([, args]) => args.slice(1, 5))).toContainEqual([TILE_PX / 2, 0, TILE_PX / 2, TILE_PX / 2]);
  });

  it('stands in with the scene before while this one renders', () => {
    const { make } = surfaces();
    const old = new TileCache(scene(items, 1, 8), make);
    old.draw(fakeContext(), cam(0, 0, 1), { width: 1024, height: 512 }, 1, 1000);
    const next = new TileCache(scene(items, 1, 8), make, old);
    const ctx = fakeContext();
    let t = 0;
    expect(next.draw(ctx, cam(0, 0, 1), { width: 1024, height: 512 }, 1, 0, () => (t += 1))).toBe(false);
    const drawn = ctx.calls.filter(([name]) => name === 'drawImage').map(([, args]) => args[0]);
    expect(drawn).toContain(old.peek(tileKey(0, 1, 0))!.canvas);
  });

  it('lets the least recently used tile go past its limit', () => {
    const { make } = surfaces();
    const cache = new TileCache(scene(items, 1, 8), make, null, 2);
    cache.draw(fakeContext(), cam(0, 0, 1), { width: 1024, height: 512 }, 1, 1000);
    cache.draw(fakeContext(), cam(0, 0, 1), { width: 512, height: 512 }, 1, 1000);
    cache.draw(fakeContext(), cam(0, 512, 1), { width: 512, height: 512 }, 1, 1000);
    expect(cache.size).toBe(2);
    expect(cache.has(tileKey(0, 1, 0))).toBe(false);
    expect(cache.has(tileKey(0, 0, 0))).toBe(true);
  });

  it('writes small cells as pixels in their state color', () => {
    const s = scene(items, 2, 8);
    const { made, make } = surfaces();
    new TileCache(s, make).draw(fakeContext(), cam(0, 0, 1), { width: 512, height: 512 }, 1, 1000);
    const image = (made[0]!.ctx as ReturnType<typeof fakeContext>).image!;
    const px = (x: number, y: number) => Array.from(image.data.slice((y * TILE_PX + x) * 4, (y * TILE_PX + x) * 4 + 4));
    const broken = s.palette.states.broken!;
    const idle = s.palette.states.idle!;
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    expect(px(0, 0)).toEqual([...hex(broken.border!), 255]);
    expect(px(3, 1)).toEqual([...hex(idle.fill), 255]);
    expect(px(100, 100)[3]).toBe(0);
  });

  it('writes a measured tint as its ramp swatch, and no value as unmatched', () => {
    const tinted = [thing('a', 0, { score: 10 }), thing('b', 1, { score: null })];
    const s = { ...scene(tinted, 2, 8), tint: 'score' };
    const { made, make } = surfaces();
    new TileCache(s, make).draw(fakeContext(), cam(0, 0, 1), { width: 512, height: 512 }, 1, 1000);
    const image = (made[0]!.ctx as ReturnType<typeof fakeContext>).image!;
    const px = (x: number) => Array.from(image.data.slice(x * 4, x * 4 + 3));
    const rgb = (css: string) => css.match(/\d+/g)!.map(Number);
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    expect(px(0)).toEqual(rgb(ramp(1)));
    expect(px(2)).toEqual(hex(s.palette.unmatched.fill));
  });

  it('draws larger cells through paint, without badges or captions', () => {
    const s = scene(items.slice(0, 4), 64, 2);
    const { made, make } = surfaces();
    new TileCache(s, make).draw(fakeContext(), cam(0, 0, 1), { width: 512, height: 512 }, 1, 1000);
    const names = (made[0]!.ctx as ReturnType<typeof fakeContext>).calls.map(([name]) => name);
    expect(names).toContain('fillRect');
    expect(names).not.toContain('putImageData');
    expect(names).not.toContain('fillText');
  });
});
