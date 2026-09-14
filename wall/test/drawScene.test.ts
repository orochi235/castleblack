import { expect, test, vi } from 'vitest';
import type { DrawOptions } from '../src/draw2d';
import { drawResidue, paintOverlay } from '../src/drawScene';
import type { PaintCommand } from '../src/paint';
import type { Palette } from '../src/palette';
import { toDrawCommands } from '../src/toDrawCommands';

vi.stubGlobal('Path2D', class { constructor(readonly d: string) {} });

const PALETTE: Palette = {
  states: {},
  caret: '#ffffff',
  label: { fill: '#e8e8ea', border: null, weight: null },
  sublabel: { fill: '#7e7e88', border: null, weight: null },
  unmatched: { fill: '#2a2a2e', border: null, weight: null },
};

const OPTIONS: DrawOptions = {
  marks: { pin: [{ d: 'M0 -1L1 1L-1 1Z' }] },
  washColor: '#d8d8d8',
};

/** A canvas that counts assignments to `width`, which reallocates its backing store. */
function sizedCanvas(width: number, height: number) {
  let w = width;
  let h = height;
  return {
    writes: 0,
    get width() { return w; },
    set width(v: number) { w = v; this.writes++; },
    get height() { return h; },
    set height(v: number) { h = v; },
    style: {} as Record<string, string>,
  };
}

/** Records only the calls that put ink on the canvas. */
function recorder(canvas: unknown = { width: 100, height: 100, style: {} }) {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop === 'canvas') return canvas;
      if (prop === 'measureText') {
        return () => ({ width: 8, actualBoundingBoxAscent: 6,
                        actualBoundingBoxDescent: 2 });
      }
      if (!(prop in target)) {
        target[prop] = (...args: unknown[]) => {
          if (['fillRect', 'strokeRect', 'drawImage', 'fillText', 'stroke',
               'fill', 'ellipse', 'clearRect'].includes(prop)) {
            calls.push(`${prop}(${args.join(',')})`);
          }
          return undefined;
        };
      }
      return target[prop];
    },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const fill = (over: Partial<Extract<PaintCommand, { kind: 'fill' }>> = {}): PaintCommand => ({
  kind: 'fill', dx: 0, dy: 0, dw: 40, dh: 40, fill: '#aabbcc',
  border: null, borderWidth: 0, shape: 'square', slash: false, ...over,
});

const sprite = (over: Partial<Extract<PaintCommand, { kind: 'sprite' }>> = {}): PaintCommand => ({
  kind: 'sprite', dx: 10, dy: 20, dw: 60, dh: 60,
  sx: 4, sy: 8, sw: 32, sh: 32, ground: '#eeeeee', ...over,
});

test('a body weasel already drew is not drawn again', () => {
  const { ctx, calls } = recorder();
  drawResidue(ctx, fill(), null, PALETTE, OPTIONS);
  expect(calls).toEqual([]);
});

test('a plain sprite leaves nothing behind either', () => {
  const { ctx, calls } = recorder();
  drawResidue(ctx, sprite(), null, PALETTE, OPTIONS);
  expect(calls).toEqual([]);
});

test('a slashed cell gets the diagonal and not a second border rect', () => {
  const { ctx, calls } = recorder();
  drawResidue(ctx, fill({ border: '#111111', borderWidth: 2, slash: true }),
              null, PALETTE, OPTIONS);
  expect(calls.filter((c) => c.startsWith('strokeRect'))).toEqual([]);
  expect(calls.filter((c) => c.startsWith('stroke('))).toHaveLength(1);
});

test('a glyphed cell leaves only its glyph, since weasel draws the ground', () => {
  const { ctx, calls } = recorder();
  drawResidue(ctx, fill({ glyph: 'G' }), null, PALETTE, OPTIONS);
  expect(calls.some((c) => c.startsWith('fillText(G'))).toBe(true);
  expect(calls.filter((c) => c.startsWith('fillRect'))).toEqual([]);
});

test('a quiet cell\'s mark goes to drawMark when one is given', () => {
  const { ctx } = recorder();
  const drawMark = vi.fn();
  drawResidue(ctx, fill({ mark: 'pin' }), null, PALETTE, { ...OPTIONS, drawMark });
  expect(drawMark).toHaveBeenCalledOnce();
  const [target, ...rest] = drawMark.mock.calls[0]!;
  expect(target).toBe(ctx);
  expect(rest).toEqual(['pin', 20, 20, expect.any(Number)]);
});

test('a captioned sprite draws its caption', () => {
  const { ctx, calls } = recorder();
  drawResidue(ctx, sprite({
    captions: [{ text: 'A1', corner: 'bl', ink: '#222222' }],
  }), null, PALETTE, OPTIONS);
  expect(calls.some((c) => c.startsWith('fillText(A1'))).toBe(true);
});

test('every feature the mapping declines has a branch here -- a command list '
   + 'the two halves share must come out fully painted', () => {
  const cmds: PaintCommand[] = [
    fill({ glyph: 'G' }),
    fill({ mark: 'pin' }),
    fill({ border: '#111111', borderWidth: 2, slash: true }),
    sprite({ caret: true }),
    sprite({ captions: [{ text: 'A1', corner: 'bl', ink: '#222222' }] }),
    sprite({ badges: [{ tag: 't', ink: '#000000', field: '#ffffff', corner: 'tr' }] }),
    sprite({ strip: [{ tag: 't', ink: '#000000', field: '#ffffff' }] }),
    { kind: 'image', dx: 0, dy: 0, dw: 40, dh: 40, ground: '#ffffff',
      image: {} as CanvasImageSource },
    { kind: 'label', text: 'Things', count: 12, dx: 0, dy: 0, size: 14, depth: 0 },
  ];
  const { unsupported } = toDrawCommands(cmds, {} as ImageBitmap);
  expect(unsupported.size).toBeGreaterThan(0);
  for (const cmd of cmds) {
    const { ctx, calls } = recorder();
    drawResidue(ctx, cmd, null, PALETTE, OPTIONS);
    expect(calls.length, `${cmd.kind} left nothing on the overlay`)
      .toBeGreaterThan(0);
  }
});

const FRAME = { width: 1200, height: 900, dpr: 1 };

const badged = () => sprite({
  badges: [{ tag: 't', ink: '#000000', field: '#ffffff', corner: 'tr' }],
});

test('the overlay pass clears before it draws, so the frame before it does '
   + 'not ghost through', () => {
  const { ctx, calls } = recorder();
  paintOverlay(ctx, [badged()], FRAME, null, PALETTE, OPTIONS);
  expect(calls[0]).toMatch(/^clearRect/);
  expect(calls.length).toBeGreaterThan(1);
});

test('the overlay keeps its backing store when the frame has not moved', () => {
  const canvas = sizedCanvas(1200, 900);
  const { ctx } = recorder(canvas);
  paintOverlay(ctx, [badged()], FRAME, null, PALETTE, OPTIONS);
  expect(canvas.writes).toBe(0);
});

test('the overlay is resized when the frame has moved', () => {
  const canvas = sizedCanvas(600, 400);
  const { ctx } = recorder(canvas);
  paintOverlay(ctx, [badged()], FRAME, null, PALETTE, OPTIONS);
  expect(canvas.width).toBe(1200);
  expect(canvas.height).toBe(900);
});
