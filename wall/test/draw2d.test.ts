import { expect, it, vi } from 'vitest';
import { CIRCLE_SCALE, DEFAULT_WASH, drawPaintCommand, type DrawOptions } from '../src/draw2d';
import type { Marks } from '../src/marks';
import type { PaintCommand } from '../src/paint';
import type { Palette } from '../src/palette';

vi.stubGlobal('Path2D', class { constructor(readonly d: string) {} });

interface Call {
  name: string; args: unknown[];
  fillStyle: unknown; strokeStyle: unknown; globalAlpha: unknown;
}

/** A context that logs every call alongside the style it was made under. */
function recorder() {
  const calls: Call[] = [];
  let state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000',
                                         globalAlpha: 1 };
  const stack: Record<string, unknown>[] = [];
  const ctx = new Proxy({}, {
    get(_, prop: string) {
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args, fillStyle: state.fillStyle,
                     strokeStyle: state.strokeStyle, globalAlpha: state.globalAlpha });
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
  const named = (name: string) => calls.filter((c) => c.name === name);
  return { ctx, calls, named };
}

const PALETTE: Palette = {
  states: {},
  caret: '#00ffff',
  label: { fill: '#eeeeee', border: null, weight: null },
  sublabel: { fill: '#777777', border: null, weight: null },
  unmatched: { fill: '#222222', border: null, weight: null },
};

const MARKS: Marks = { pin: [{ d: 'M0 -1L1 1L-1 1Z' }] };
const OPTIONS: DrawOptions = { marks: MARKS, washColor: '#123456' };
const SHEET = {} as HTMLImageElement;

const fill = (over: Partial<Extract<PaintCommand, { kind: 'fill' }>> = {}): PaintCommand => ({
  kind: 'fill', dx: 0, dy: 0, dw: 40, dh: 40, fill: '#aabbcc',
  border: null, borderWidth: 0, shape: 'square', slash: false, ...over,
});

const sprite = (over: Partial<Extract<PaintCommand, { kind: 'sprite' }>> = {}): PaintCommand => ({
  kind: 'sprite', dx: 10, dy: 20, dw: 60, dh: 60,
  sx: 4, sy: 8, sw: 32, sh: 32, ground: '#eeeeee', ...over,
});

const image = (over: Partial<Extract<PaintCommand, { kind: 'image' }>> = {}): PaintCommand => ({
  kind: 'image', dx: 5, dy: 6, dw: 50, dh: 50, ground: '#ffffff',
  image: {} as CanvasImageSource, ...over,
});

it('strokes a bordered fill\'s border, inset by half its width', () => {
  const { ctx, named } = recorder();
  drawPaintCommand(ctx, fill({ border: '#111111', borderWidth: 2 }), null, PALETTE, OPTIONS);
  expect(named('strokeRect')).toMatchObject([{ args: [1, 1, 38, 38], strokeStyle: '#111111' }]);
  expect(named('stroke')).toEqual([]);
});

it('slashes a bordered undrawn fill corner to corner', () => {
  const { ctx, named } = recorder();
  drawPaintCommand(ctx, fill({ border: '#111111', borderWidth: 2, slash: true }),
                   null, PALETTE, OPTIONS);
  expect(named('moveTo')).toMatchObject([{ args: [1, 1] }]);
  expect(named('lineTo')).toMatchObject([{ args: [39, 39] }]);
  expect(named('stroke')).toMatchObject([{ strokeStyle: '#111111' }]);
});

it('hands a quiet cell\'s mark to drawMark at the cell center and circle radius', () => {
  const { ctx, named } = recorder();
  const drawMark = vi.fn();
  drawPaintCommand(ctx, fill({ mark: 'pin', dx: 10, dy: 30 }), null, PALETTE,
                   { ...OPTIONS, drawMark });
  expect(drawMark).toHaveBeenCalledOnce();
  const [target, ...rest] = drawMark.mock.calls[0]!;
  expect(target).toBe(ctx);
  expect(rest).toEqual(['pin', 30, 50, 40 * CIRCLE_SCALE / 2]);
  expect(named('fill')).toEqual([]);
});

it('fills the mark\'s shapes from the set when no drawMark is given', () => {
  const { ctx, named } = recorder();
  drawPaintCommand(ctx, fill({ mark: 'pin' }), null, PALETTE, OPTIONS);
  expect(named('translate')).toMatchObject([{ args: [20, 20] }]);
  const r = 40 * CIRCLE_SCALE / 2;
  expect(named('scale')).toMatchObject([{ args: [r, r] }]);
  expect(named('fill').map((c) => [(c.args[0] as { d: string }).d, c.fillStyle]))
    .toEqual([['M0 -1L1 1L-1 1Z', '#aabbcc']]);
});

it('washes a sprite, an image and a fill in the wash color at the wash alpha', () => {
  const cases: [Exclude<PaintCommand, { kind: 'label' }>, number][] = [
    [sprite({ wash: 0.75 }) as Extract<PaintCommand, { kind: 'sprite' }>, 0.75],
    [image({ wash: 0.5, alpha: 0.5 }) as Extract<PaintCommand, { kind: 'image' }>, 0.25],
    [fill({ wash: 0.6 }) as Extract<PaintCommand, { kind: 'fill' }>, 0.6],
  ];
  for (const [cmd, alpha] of cases) {
    const { ctx, named } = recorder();
    drawPaintCommand(ctx, cmd, SHEET, PALETTE, OPTIONS);
    const washes = named('fillRect').filter((c) => c.fillStyle === '#123456');
    expect(washes, cmd.kind).toMatchObject([{ args: [cmd.dx, cmd.dy, cmd.dw, cmd.dh] }]);
    expect(washes[0]!.globalAlpha).toBeCloseTo(alpha);
  }
});

it('defaults the wash color', () => {
  expect(DEFAULT_WASH).toBe('#d8d8d8');
});

it('shifts every draw by the offset', () => {
  const offset = { x: 100, y: 50 };
  const a = recorder();
  drawPaintCommand(a.ctx, fill({ border: '#111111', borderWidth: 2, caret: true }),
                   null, PALETTE, { ...OPTIONS, offset });
  expect(a.named('fillRect')).toMatchObject([{ args: [100, 50, 40, 40] }]);
  expect(a.named('strokeRect')).toMatchObject([
    { args: [101, 51, 38, 38] }, { args: [99, 49, 42, 42] },
  ]);
  const b = recorder();
  drawPaintCommand(b.ctx, sprite(), SHEET, PALETTE, { ...OPTIONS, offset });
  expect(b.named('drawImage')).toMatchObject([{ args: [SHEET, 4, 8, 32, 32, 110, 70, 60, 60] }]);
  const c = recorder();
  drawPaintCommand(c.ctx, { kind: 'label', text: 'north', count: 3, dx: 1, dy: 2,
                            size: 12, depth: 1 }, null, PALETTE, { ...OPTIONS, offset });
  expect(c.named('fillText')).toMatchObject([{ args: ['north', 101, 52] }]);
});

it('strokes the caret in the palette\'s caret color', () => {
  const { ctx, named } = recorder();
  drawPaintCommand(ctx, sprite({ caret: true }), SHEET, PALETTE, OPTIONS);
  expect(named('strokeRect')).toMatchObject([{ args: [9, 19, 62, 62], strokeStyle: '#00ffff' }]);
});

it('sets an outer band label in label ink and an inner one in sublabel ink', () => {
  const outer = recorder();
  drawPaintCommand(outer.ctx, { kind: 'label', text: 'north', count: 1200, dx: 0, dy: 10,
                                size: 14, depth: 0 }, null, PALETTE, OPTIONS);
  expect(outer.named('fillText')).toMatchObject([
    { args: [`north  ${(1200).toLocaleString()}`, 0, 10], fillStyle: '#eeeeee' },
  ]);
  const inner = recorder();
  drawPaintCommand(inner.ctx, { kind: 'label', text: 'south', count: 4, dx: 0, dy: 10,
                                size: 12, depth: 1 }, null, PALETTE, OPTIONS);
  expect(inner.named('fillText')).toMatchObject([
    { args: ['south', 0, 10], fillStyle: '#777777' },
  ]);
});

it('centers a glyph on its measured ink, not on a baseline', () => {
  const { ctx, named } = recorder();
  drawPaintCommand(ctx, fill({ glyph: 'G' }), null, PALETTE, OPTIONS);
  // The recorder's ink rises 6 above the baseline and falls 2 below it.
  expect(named('fillText')).toMatchObject([{ args: ['G', 20, 22] }]);
});
