import { describe, expect, it } from 'vitest';
import { compile } from '../src/cel';
import { derive } from '../src/derive';
import { gridLayout, rectAt } from '../src/layout';
import {
  DEFAULT_APPEARANCE, paintCommands, tally, type PaintCommand, type PaintInput,
} from '../src/paint';
import { defaultPalette } from '../src/palette';
import type { SheetManifest } from '../src/sheet';
import { ramp } from '../src/tint';
import { SPEC, thing, type Thing } from './fixture';

const compiled = compile(SPEC);
const palette = defaultPalette(compiled.states);

function manifest(items: Thing[]): SheetManifest {
  return {
    level: 32, gutter: 2, pitch: 36, cols: 4, rows: 4, count: items.length, size: 144,
    baked: Object.fromEntries(items.filter((t) => t.sha).map((t) => [t.id, t.sha!])),
  };
}

function paint(items: Thing[], size = 120,
               extra: Partial<PaintInput<Thing>> = {}): PaintCommand[] {
  return paintCommands({
    compiled,
    facts: derive(compiled, items),
    rect: (p) => rectAt(gridLayout({ rows: Uint32Array.from(items, (_, i) => i) },
                                   { cell: size, gap: 4, cols: 4 }), p),
    visible: items.map((_, i) => i),
    cam: { x: 0, y: 0, scale: { x: 1, y: 1 } },
    manifest: manifest(items),
    palette,
    ...extra,
  });
}

const one = (items: Thing[], size?: number, extra?: Partial<PaintInput<Thing>>) =>
  paint(items, size, extra)[0]! as Record<string, unknown>;

describe('which picture a cell draws', () => {
  it('draws a sheet tile when the sheet has one, and a fill when it has none', () => {
    const [a, b] = paint([thing('a', 0), thing('b', 1, { sha: null })]);
    expect(a).toMatchObject({ kind: 'sprite', sx: 2, sy: 2, sw: 32, sh: 32 });
    expect(b).toMatchObject({ kind: 'fill' });
  });

  it('prefers a vector image, then a loose one, over the sheet', () => {
    const vec = {} as CanvasImageSource;
    const loose = {} as CanvasImageSource;
    const items = [thing('a', 0)];
    expect(one(items, 120, { loose: new Map([['a', loose]]) })).toMatchObject(
      { kind: 'image', image: loose });
    expect(one(items, 120, { loose: new Map([['a', loose]]), vector: new Map([['a', vec]]) }))
      .toMatchObject({ kind: 'image', image: vec });
  });

  it('grounds a drawn cell in its state border, or the plain ground', () => {
    expect(one([thing('a', 0, { level: 1 })]).ground).toBe('#ddaa22');
    expect(one([thing('a', 0)]).ground).toBe('#ffffff');
    expect(one([thing('a', 0)], 120, { ground: '#fafafa' }).ground).toBe('#fafafa');
  });
});

describe('a quiet state', () => {
  it('draws a mark, with no captions or badges', () => {
    const cmd = one([thing('a', 0, { flagged: true, sha: null, kind: 'pin', labels: ['star'] })]);
    expect(cmd).toMatchObject({ kind: 'fill', shape: 'circle', mark: 'pin', slash: false });
    expect(cmd.glyph).toBeUndefined();
    expect(cmd.captions).toBeUndefined();
    expect(cmd.badges).toBeUndefined();
    expect(cmd.strip).toBeUndefined();
  });

  it('draws a glyph where there is room and no mark', () => {
    const owl = [thing('a', 0, { flagged: true, sha: null, kind: 'owl' })];
    expect(one(owl).glyph).toBe('O');
    expect(one(owl, 16).glyph).toBeUndefined();
  });
});

describe('badges', () => {
  const item = [thing('a', 0, { level: 2, labels: ['old', 'star', 'big'] })];

  it('drops a badge only where the caption it yields to is drawn', () => {
    expect((one(item, 120).badges as { tag: string }[]).map((b) => b.tag)).toEqual(['star']);
    expect((one(item, 60).badges as { tag: string }[]).map((b) => b.tag)).toEqual(['old', 'star']);
    const uncaptioned = { appearance: { ...DEFAULT_APPEARANCE, showCaptions: false } };
    expect((one(item, 120, uncaptioned).badges as { tag: string }[]).map((b) => b.tag))
      .toEqual(['old', 'star']);
  });

  it('carries the art, and puts strip badges in the strip', () => {
    expect(one(item, 120).badges).toEqual([
      { tag: 'star', mark: 'star', corner: 'tl', field: '#ff8800', ink: '#ffffff' }]);
    expect(one(item, 120).strip).toEqual([
      { tag: 'big', text: 'B', field: '#222288', ink: '#ffffff' }]);
  });

  it('wears none below the badge size, and none when switched off', () => {
    expect(one(item, 40)).toMatchObject({ badges: [], strip: [] });
    const off = { appearance: { ...DEFAULT_APPEARANCE, showBadges: false } };
    expect(one(item, 120, off)).toMatchObject({ badges: [], strip: [] });
  });
});

it('captions a cell big enough to read, in spec order, inked for its ground', () => {
  const items = [thing('a', 0, { level: 2, kind: 'owl' }), thing('b', 1, { sha: null })];
  const [a, b] = paint(items, 120);
  expect(a!.kind === 'sprite' && a!.captions).toEqual([
    { text: 'L2', corner: 'tr', ink: '#4a4a4f', weight: 300 },
    { text: 'owl', corner: 'tl', ink: '#4a4a4f', weight: 300 },
    { text: 'a', corner: 'bl', ink: '#4a4a4f', weight: 500 },
  ]);
  expect(b!.kind === 'fill' && b!.captions).toEqual([
    { text: 'b', corner: 'bl', ink: '#ffffff', weight: 500 }]);
  expect(one(items, 80).captions).toEqual([]);
});

describe('dimming', () => {
  it('raises a whole family when a legend row is highlighted', () => {
    const items = [thing('a', 0, { away: ['warn'] }), thing('b', 1), thing('c', 2, { sha: null })];
    const [a, b, c] = paint(items, 120, { highlight: 'warn' }) as Record<string, unknown>[];
    expect(a!.alpha).toBeUndefined();
    expect(b!.alpha).toBe(DEFAULT_APPEARANCE.dimAlpha);
    expect(c).toMatchObject({ kind: 'fill', fill: '#333333' });
  });

  it('dims what lacks a highlighted tag', () => {
    const [a, b] = paint([thing('a', 0, { labels: ['big'] }), thing('b', 1)], 120,
                         { highlightTag: 'big' }) as Record<string, unknown>[];
    expect(a!.alpha).toBeUndefined();
    expect(b!.alpha).toBe(DEFAULT_APPEARANCE.dimAlpha);
  });
});

it('washes a stale wall harder than a washed item', () => {
  const items = [thing('a', 0, { labels: ['old'] }), thing('b', 1)];
  const on = { appearance: { ...DEFAULT_APPEARANCE, wash: true } };
  const [a, b] = paint(items, 120, on) as Record<string, unknown>[];
  expect(a!.wash).toBe(DEFAULT_APPEARANCE.washStrength);
  expect(b!.wash).toBeUndefined();
  expect(one(items, 120, { ...on, stale: true }).wash).toBe(0.85);
});

it('grounds a drawn cell in the ramp under a measured tint', () => {
  expect(one([thing('a', 0, { level: 1 })], 120, { tint: 'score' }).ground).toBe(ramp(0.5));
});

it('marks the caret cell', () => {
  const [a, b] = paint([thing('a', 0), thing('b', 1)], 120, { caret: 1 }) as
    Record<string, unknown>[];
  expect(a!.caret).toBeUndefined();
  expect(b!.caret).toBe(true);
});

it('labels a band only when it is wide and tall enough to read', () => {
  const band = (w: number, header: number) => ({
    key: 'k', label: 'north', count: 3, depth: 0 as const, header,
    rect: { x: 0, y: 10, w, h: 100 },
  });
  const labels = paint([], 32, { bands: [band(30, 40), band(200, 5), band(200, 40)] });
  expect(labels).toEqual([
    { kind: 'label', text: 'north', count: 3, dx: 0, dy: 10 + 32, size: 32, depth: 0 }]);
});

it('tallies items by state', () => {
  const facts = derive(compiled, [thing('a', 0), thing('b', 1, { level: 1 }), thing('c', 2)]);
  expect(tally(compiled, facts)).toMatchObject({ idle: 2, warn: 1, broken: 0, warnRemote: 0 });
});
