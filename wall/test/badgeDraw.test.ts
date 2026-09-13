import { expect, it, vi } from 'vitest';
import { drawBadge, markInk, washToward } from '../src/badgeDraw';
import { punches, type Marks } from '../src/marks';

vi.stubGlobal('Path2D', class { constructor(readonly d: string) {} });

interface Call { name: string; args: unknown[]; fillStyle: unknown; strokeStyle: unknown }

function recorder() {
  const calls: Call[] = [];
  let state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000',
                                         globalAlpha: 1 };
  const stack: Record<string, unknown>[] = [];
  const ctx = new Proxy({}, {
    get(_, prop: string) {
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle });
        if (prop === 'save') stack.push({ ...state });
        if (prop === 'restore') state = stack.pop() ?? state;
        if (prop === 'measureText') {
          return { width: 8, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 };
        }
        if (prop === 'getTransform') return { a: 1 };
        return undefined;
      };
    },
    set(_, prop: string, value) { state[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  const pathOps = (name: string) => calls
    .filter((c) => c.name === name && (c.args[0] as { d?: string })?.d !== undefined);
  return { ctx, calls, pathOps };
}

const MARKS: Marks = {
  star: [
    { d: 'M0 -1L1 1L-1 1Z' },
    { d: 'M-1 0H1', fill: 'none', stroke: 'accent', width: 0.2 },
  ],
  hole: [{ d: 'M0 0H1V1Z' }, { d: 'M0 0H0.5V0.5Z', punch: true }],
};

const AT = { cx: 20, cy: 20, size: 12, radius: 8 };

it('asks the passed set whether a mark punches', () => {
  expect(punches(MARKS, 'hole')).toBe(true);
  expect(punches(MARKS, 'star')).toBe(false);
  expect(punches(MARKS, 'absent')).toBe(false);
  expect(punches(MARKS, undefined)).toBe(false);
  expect(punches({ star: [{ d: 'M0 0', punch: true }] }, 'star')).toBe(true);
});

it('fills and strokes the mark\'s shapes from the passed set, in the badge\'s inks', () => {
  const { ctx, pathOps } = recorder();
  drawBadge(ctx, { mark: 'star', field: '#ff8800', ink: '#ffffff', accent: '#00ff00' },
            AT, MARKS);
  expect(pathOps('fill').map((c) => [(c.args[0] as { d: string }).d, c.fillStyle]))
    .toEqual([['M0 -1L1 1L-1 1Z', '#ffffff']]);
  expect(pathOps('stroke').map((c) => [(c.args[0] as { d: string }).d, c.strokeStyle]))
    .toEqual([['M-1 0H1', '#00ff00']]);
});

it('draws no artwork for a mark the passed set does not hold', () => {
  const { ctx, pathOps } = recorder();
  drawBadge(ctx, { mark: 'star', field: '#ff8800', ink: '#ffffff' }, AT, {});
  expect(pathOps('fill')).toEqual([]);
});

it('sets a text badge\'s letter and touches no mark', () => {
  const { ctx, calls, pathOps } = recorder();
  drawBadge(ctx, { text: 'B', field: '#222288', ink: '#ffffff' }, AT, MARKS);
  expect(pathOps('fill')).toEqual([]);
  expect(pathOps('stroke')).toEqual([]);
  expect(calls.filter((c) => c.name === 'translate')).toEqual([]);
  expect(calls.find((c) => c.name === 'fillText')).toMatchObject({
    args: ['B', 20, expect.any(Number)], fillStyle: '#ffffff',
  });
});

it('resolves a piece\'s paint against the badge', () => {
  const badge = { field: '#111111', ink: '#222222', accent: '#333333' };
  expect(markInk(badge, 'ink')).toBe('#222222');
  expect(markInk(badge, 'field')).toBe('#111111');
  expect(markInk(badge, 'accent')).toBe('#333333');
  expect(markInk({ field: '#111111', ink: '#222222' }, 'accent')).toBe('#111111');
  expect(markInk(badge, '#abcdef')).toBe('#abcdef');
  expect(markInk(badge, 'none')).toBeNull();
});

it('washes a hex or oklch color toward white', () => {
  expect(washToward('#000000', 0.5)).toBe('#808080');
  expect(washToward('oklch(0.4 0.1 30)', 0.5)).toBe('oklch(0.7000 0.1 30)');
  expect(washToward('red')).toBe('red');
});
