import { describe, expect, it } from 'vitest';
import { bandedLayout, blockLayout, flowBlocks } from '../src/grouped';

const opts = { cell: 10, gap: 0, cols: 10 };   // pitch 10, 100 wide

describe('flowBlocks', () => {
  it('places a group\'s cells row-major under its own header', () => {
    const out = flowBlocks([{ key: 'a', items: [0, 1, 2, 3] }], opts, 0, 1);
    // 4 items -> ceil(sqrt(4 * 1.35)) = 3 columns
    expect(out.placed.map((p) => [p.index, p.rect.x, p.rect.y])).toEqual([
      [0, 0, 10], [1, 10, 10], [2, 20, 10], [3, 0, 20],
    ]);
  });

  it('reserves the header rows above each block', () => {
    const out = flowBlocks([{ key: 'a', items: [0] }], opts, 0, 2);
    expect(out.placed[0]!.rect.y).toBe(20);
  });

  it('says how much world space it reserved above each block', () => {
    const out = flowBlocks([{ key: 'a', items: [0] }], opts, 0, 2);
    expect(out.bands[0]!.header).toBe(20);
  });

  it('wraps to a new row when the next block would overrun', () => {
    const wide = { key: 'w', items: [...Array(64).keys()] };       // 10 cols
    const next = { key: 'n', items: [0] };                          // 1 col
    const out = flowBlocks([wide, next], opts, 0, 1);
    const band = out.bands.find((b) => b.key === 'n')!;
    expect(band.rect.x).toBe(0);
    expect(band.rect.y).toBeGreaterThan(0);
  });

  it('never gives a block more columns than the width allows', () => {
    const out = flowBlocks([{ key: 'a', items: [...Array(400).keys()] }],
                           opts, 0, 1);
    expect(Math.max(...out.placed.map((p) => p.rect.x))).toBeLessThan(100);
  });

  it('reports a band per group, with its count and its own box', () => {
    const out = flowBlocks([{ key: 'a', items: [0, 1] }], opts, 0, 1);
    expect(out.bands).toHaveLength(1);
    expect(out.bands[0]).toMatchObject({ key: 'a', count: 2, depth: 1 });
  });

  it('is empty for no groups, and reports no height', () => {
    const out = flowBlocks([], opts, 0, 1);
    expect(out.placed).toEqual([]);
    expect(out.height).toBe(0);
  });
});

interface Item { id: string; sha: string | null; year: number | null }

const c = (over: Partial<Item>): Item => ({ id: 'x', sha: null, year: null, ...over });

describe('blockLayout', () => {
  const drawnOrNot = (x: Item) => (x.sha ? 'drawn' : 'untried');

  it('returns one rect per item, in the order it was given them', () => {
    const items = [c({ id: 'a', sha: 'x' }), c({ id: 'b' }), c({ id: 'd', sha: 'x' })];
    const out = blockLayout(drawnOrNot, ['drawn', 'untried'])(items, opts);
    expect(out.rects).toHaveLength(3);
    // Item 'b' is in the second block, so it sits right of or below 'a'.
    expect(out.rects[1]!.x + out.rects[1]!.y)
      .toBeGreaterThan(out.rects[0]!.x + out.rects[0]!.y);
  });

  it('orders its blocks by the order it is given, not by size', () => {
    const items = [c({ id: 'a' }), c({ id: 'b', sha: 'x' }), c({ id: 'd', sha: 'x' })];
    const out = blockLayout(drawnOrNot, ['drawn', 'untried'])(items, opts);
    expect(out.bands.map((b) => b.key)).toEqual(['drawn', 'untried']);
  });

  it('keeps a named group nothing falls into, in its place', () => {
    // A group that vanished when it hit zero would reflow every block after
    // it, moving items across the screen for no reason of their own.
    const out = blockLayout((_: Item) => 'drawn', ['drawn', 'untried'])([c({})], opts);
    expect(out.bands.map((b) => b.key)).toEqual(['drawn', 'untried']);
    expect(out.bands.find((b) => b.key === 'untried')!.count).toBe(0);
  });

  it('leaves an unnamed group out when it is empty, having no place to keep', () => {
    // With no order, the groups are whatever the items have, so none is empty.
    const out = blockLayout(drawnOrNot, [])([c({})], opts);
    expect(out.bands.map((b) => b.key)).toEqual(['untried']);
  });
});

describe('bandedLayout', () => {
  const byDecade = (x: Item) =>
    (x.year ? `${Math.floor(x.year / 10) * 10}s` : 'unknown');
  const byYear = (x: Item) => (x.year ? String(x.year) : 'unknown');

  it('stacks the outer groups and puts the newest first when descending', () => {
    const items = [c({ year: 1974 }), c({ year: 2011 })];
    const out = bandedLayout(byDecade, byYear, true)(items, opts);
    const outer = out.bands.filter((b) => b.depth === 0);
    expect(outer.map((b) => b.key)).toEqual(['2010s', '1970s']);
    expect(outer[0]!.rect.y).toBeLessThan(outer[1]!.rect.y);
  });

  it('runs oldest first when ascending', () => {
    const items = [c({ year: 1974 }), c({ year: 2011 })];
    const out = bandedLayout(byDecade, byYear, false)(items, opts);
    expect(out.bands.filter((b) => b.depth === 0).map((b) => b.key))
      .toEqual(['1970s', '2010s']);
  });

  it('sorts the undated band last whichever way the rest runs', () => {
    const items = [c({ year: 1974 }), c({})];
    for (const desc of [true, false]) {
      const out = bandedLayout(byDecade, byYear, desc)(items, opts);
      const outer = out.bands.filter((b) => b.depth === 0);
      expect(outer[outer.length - 1]!.key).toBe('unknown');
    }
  });

  it('breaks a band into its inner groups at depth 1', () => {
    const items = [c({ year: 1974 }), c({ year: 1978 })];
    const out = bandedLayout(byDecade, byYear, true)(items, opts);
    expect(out.bands.filter((b) => b.depth === 1).map((b) => b.key))
      .toEqual(['1978', '1974']);
  });

  it('bounds the whole wall, not just the last band', () => {
    const items = [c({ year: 1974 }), c({ year: 2011 })];
    const out = bandedLayout(byDecade, byYear, true)(items, opts);
    const lowest = Math.max(...out.rects.map((r) => r.y + r.h));
    expect(out.bounds.h).toBeGreaterThanOrEqual(lowest);
  });
});
