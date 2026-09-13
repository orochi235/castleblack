import { expect, it } from 'vitest';
import { gridLayout } from '../src/layout';

const item = (id: string, index: number) => ({ id, index });

const items = [item('a', 0), item('b', 1), item('c', 2), item('d', 3)];

it('fills row-major at the given pitch', () => {
  const { rects } = gridLayout(items, { cell: 10, gap: 2, cols: 2 });
  expect(rects[0]).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  expect(rects[1]).toEqual({ x: 12, y: 0, w: 10, h: 10 });
  expect(rects[2]).toEqual({ x: 0, y: 12, w: 10, h: 10 });
});

it('reports bounds that contain every rect', () => {
  const { bounds } = gridLayout(items, { cell: 10, gap: 2, cols: 2 });
  expect(bounds).toEqual({ w: 22, h: 22 });
});

it('is a function of the array order, not of item.index', () => {
  const reversed = [...items].reverse();
  const { rects } = gridLayout(reversed, { cell: 10, gap: 2, cols: 2 });
  expect(rects[0]).toEqual({ x: 0, y: 0, w: 10, h: 10 });
});

it('lays out an empty list without dividing by zero', () => {
  expect(gridLayout([], { cell: 10, gap: 2, cols: 2 }))
    .toEqual({ rects: [], bands: [], bounds: { w: 0, h: 0 } });
});

it('reports no bands, because a dense grid has no groups', () => {
  const out = gridLayout([item('a', 0), item('b', 1)], { cell: 32, gap: 4, cols: 2 });
  expect(out.bands).toEqual([]);
});
