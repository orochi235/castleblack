/** The wall's Canvas2D executor: a `PaintCommand` list drawn into a context.
 *
 *  `paint.ts` decides what to draw; this decides nothing, so a second executor
 *  can be measured against it over the identical command list.
 */
import { BADGE_FACE, BADGE_WEIGHT, THUMB_FACE, drawBadge, drawMarkShapes } from './badgeDraw';
import type { Marks } from './marks';
import { glyphBlend, WEIGHT_ID, WEIGHT_TEXT, type Caption, type PaintCommand } from './paint';
import type { Palette } from './palette';
import type { BadgeArt } from './schema';

export interface DrawOptions {
  marks: Marks;
  /** Draws a quiet cell's mark; without it the mark is drawn from `marks`. */
  drawMark?: (ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number,
              r: number) => void;
  /** What a washed cell is washed toward. */
  washColor: string;
  offset?: { x: number; y: number };
}

export const DEFAULT_WASH = '#d8d8d8';

type Box = { dx: number; dy: number; dw: number; dh: number };

/** The type size a caption is set at. */
export function captionSize(cellPx: number): number {
  return Math.max(10, Math.min(18, cellPx * 0.1));
}

/** A fraction of the cell, not of the mark: badge and caption stop scaling at
 *  their floors, and a margin measured off them crowds a small cell's corner. */
export function cornerPad(cellPx: number, size: number): number {
  return Math.max(size * 0.35, cellPx * 0.06);
}

/** How big a badge is drawn on a cell this wide and how far its center sits in
 *  from the edge. The hit test must use this too, or a click misses the disc. */
export function badgeGeometry(cellPx: number) {
  const size = captionSize(cellPx);
  const radius = size * 0.63;
  const pad = cornerPad(cellPx, size);
  return { size, radius, inset: radius + pad, rise: radius + pad, fall: radius + pad };
}

/** How far a caption's ink centers above canvas's `middle` baseline, as a
 *  fraction of the type size; measured on `THUMB_FACE`. */
export const CAPTION_INK_RISE = 0.0823;

// A stroke straddles its path, so inset by half the width or it eats into
// the neighboring cells.
export function strokeBorder(ctx: CanvasRenderingContext2D,
                             cmd: Box & { border: string | null; borderWidth: number;
                                          slash?: boolean }) {
  if (!cmd.border || cmd.borderWidth <= 0) return;
  const inset = cmd.borderWidth / 2;
  ctx.save();
  ctx.strokeStyle = cmd.border;
  ctx.lineWidth = cmd.borderWidth;
  ctx.strokeRect(cmd.dx + inset, cmd.dy + inset,
                 cmd.dw - cmd.borderWidth, cmd.dh - cmd.borderWidth);
  ctx.restore();
  if (cmd.slash) strokeSlash(ctx, cmd);
}

// Separate from the border so the hybrid executor can draw it alone:
// re-stroking a rect weasel already drew hardens that edge.
export function strokeSlash(ctx: CanvasRenderingContext2D,
                            cmd: Box & { border: string | null; borderWidth: number }) {
  if (!cmd.border || cmd.borderWidth <= 0) return;
  const inset = cmd.borderWidth / 2;
  ctx.save();
  ctx.strokeStyle = cmd.border;
  ctx.lineWidth = cmd.borderWidth;
  ctx.beginPath();
  ctx.moveTo(cmd.dx + inset, cmd.dy + inset);
  ctx.lineTo(cmd.dx + cmd.dw - inset, cmd.dy + cmd.dh - inset);
  ctx.stroke();
  ctx.restore();
}

// Outside the cell, so it never collides with an inset border.
export function strokeCaret(ctx: CanvasRenderingContext2D, cmd: Box, palette: Palette) {
  ctx.save();
  ctx.strokeStyle = palette.caret;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 2]);
  ctx.strokeRect(cmd.dx - 1, cmd.dy - 1, cmd.dw + 2, cmd.dh + 2);
  ctx.restore();
}

/** A quiet cell's mark, in the current `fillStyle`: handed to `drawMark` when
 *  given, else the named shapes filled in a unit box scaled to `r`. */
export function drawCellMark(ctx: CanvasRenderingContext2D, name: string,
                             cx: number, cy: number, r: number, options: DrawOptions) {
  if (options.drawMark) {
    options.drawMark(ctx, name, cx, cy, r);
    return;
  }
  const shapes = options.marks[name];
  if (!shapes) return;
  const fill = String(ctx.fillStyle);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r, r);
  // No field is drawn behind a quiet cell's mark, so field pieces stay unpainted.
  drawMarkShapes(ctx, shapes, (paint) => paint === 'none' || paint === 'field' ? null
    : paint === 'ink' || paint === 'accent' ? fill : paint);
  ctx.restore();
}

/** A quiet cell's glyph, in the current `fillStyle`, sized to the cell and
 *  centered on its ink. */
export function drawGlyph(ctx: CanvasRenderingContext2D, glyph: string, box: Box) {
  ctx.save();
  ctx.font = `${WEIGHT_ID} ${box.dh * GLYPH_SCALE}px ${THUMB_FACE}`;
  ctx.textAlign = 'center';
  // Not `middle`: WebKit and Blink place it differently, and an emoji from a
  // fallback font landed a tenth of the cell low on a phone.
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(glyph);
  const half = (a: number, b: number) => (Number.isFinite(a - b) ? (a - b) / 2 : 0);
  ctx.fillText(glyph,
               box.dx + box.dw / 2 + half(m.actualBoundingBoxLeft, m.actualBoundingBoxRight),
               box.dy + box.dh / 2 + half(m.actualBoundingBoxAscent, m.actualBoundingBoxDescent));
  ctx.restore();
}

/** Where a corner badge's disc sits. The hit test must use this too. */
export function cornerBadgeAt(badge: BadgeArt, cmd: Box) {
  const { size, radius, inset, rise, fall } = badgeGeometry(cmd.dw);
  const right = badge.corner === 'br' || badge.corner === 'tr';
  const bottom = badge.corner === 'br';
  return {
    cx: right ? cmd.dx + cmd.dw - inset : cmd.dx + inset,
    cy: bottom ? cmd.dy + cmd.dh - fall : cmd.dy + rise,
    size, radius,
  };
}

function capHalf(ctx: CanvasRenderingContext2D, size: number): number {
  const ascent = ctx.measureText('H').actualBoundingBoxAscent;
  return Number.isFinite(ascent) && ascent > 0 ? ascent / 2 : size * 0.35;
}

// Runs along the bottom-left caption's baseline and stops short of the
// bottom-right corner badge.
function drawStrip(ctx: CanvasRenderingContext2D, strip: readonly BadgeArt[], cmd: Box,
                   startX: number, marks: Marks) {
  if (strip.length === 0) return;
  const { size, radius } = badgeGeometry(cmd.dw);
  const gap = radius * 0.5;
  const corner = badgeGeometry(cmd.dw);
  const limit = cmd.dx + cmd.dw - corner.inset - corner.radius - gap;
  ctx.save();
  ctx.font = `${BADGE_WEIGHT} ${size}px ${BADGE_FACE}`;
  const half = capHalf(ctx, size);
  ctx.restore();
  const baseline = cmd.dy + cmd.dh - cornerPad(cmd.dw, size) - size * 0.5 + half;
  const cy = baseline - half - size * CAPTION_INK_RISE;
  let cx = startX + radius;
  for (const badge of strip) {
    if (cx + radius > limit) return;
    drawBadge(ctx, badge, { cx, cy, size, radius, baseline }, marks);
    cx += radius * 2 + gap;
  }
}

/** Returns the x the caption's text ends at. */
function drawCaption(ctx: CanvasRenderingContext2D, caption: Caption, cmd: Box,
                     rightPad = 0): number {
  const size = captionSize(cmd.dw);
  const right = caption.corner === 'tr';
  const top = caption.corner[0] === 't';
  ctx.save();
  ctx.font = `${caption.weight ?? WEIGHT_TEXT} ${size}px ${THUMB_FACE}`;
  ctx.textAlign = right ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  const pad = cornerPad(cmd.dw, size);
  ctx.fillStyle = caption.ink;
  const x = right ? cmd.dx + cmd.dw - pad - rightPad : cmd.dx + pad;
  ctx.fillText(caption.text, x,
               top ? cmd.dy + pad + size * 0.5 : cmd.dy + cmd.dh - pad - size * 0.5);
  const width = ctx.measureText(caption.text).width;
  ctx.restore();
  return right ? x - width : x + width;
}

/** How much of its cell a round cell fills across, and how tall a glyph stands. */
export const CIRCLE_SCALE = 0.6;
export const GLYPH_SCALE = 0.62;

// Over the drawing rather than baked under it, so the shade is the viewer's.
function washCell(ctx: CanvasRenderingContext2D, wash: number, cmd: Box, color: string) {
  ctx.save();
  ctx.globalAlpha = (ctx.globalAlpha || 1) * wash;
  ctx.fillStyle = color;
  ctx.fillRect(cmd.dx, cmd.dy, cmd.dw, cmd.dh);
  ctx.restore();
}

/** The captions, corner badges and strip a cell wears. The strip starts where
 *  the bottom-left caption ended, so it runs after the captions. */
export function drawOverlays(ctx: CanvasRenderingContext2D,
                             cmd: { captions?: readonly Caption[];
                                    badges?: readonly BadgeArt[];
                                    strip?: readonly BadgeArt[] },
                             box: Box, options: DrawOptions) {
  const { size, radius } = badgeGeometry(box.dw);
  let stripX = box.dx + cornerPad(box.dw, size);
  const topRight = (cmd.badges ?? []).filter((b) => b.corner === 'tr').length;
  const trPad = topRight === 0 ? 0
    : topRight * badgeGeometry(box.dw).radius * 2 + radius * 0.6;
  for (const caption of cmd.captions ?? []) {
    const end = drawCaption(ctx, caption, box, caption.corner === 'tr' ? trPad : 0);
    if (caption.corner === 'bl') stripX = end + radius * 0.6;
  }
  for (const badge of cmd.badges ?? []) {
    drawBadge(ctx, badge, cornerBadgeAt(badge, box), options.marks);
  }
  drawStrip(ctx, cmd.strip ?? [], box, stripX, options.marks);
}

/** One paint command, shifted by `options.offset` -- how a loupe redraws the
 *  same commands recentered in its own canvas. */
export function drawPaintCommand(ctx: CanvasRenderingContext2D, cmd: PaintCommand,
                                 sheet: HTMLImageElement | null, palette: Palette,
                                 options: DrawOptions) {
  const offset = options.offset ?? { x: 0, y: 0 };
  const dx = cmd.dx + offset.x;
  const dy = cmd.dy + offset.y;
  if (cmd.kind === 'sprite' && sheet) {
    const box = { dx, dy, dw: cmd.dw, dh: cmd.dh };
    ctx.save();
    ctx.globalAlpha = cmd.alpha ?? 1;
    ctx.fillStyle = cmd.ground;
    ctx.fillRect(dx, dy, cmd.dw, cmd.dh);
    ctx.drawImage(sheet, cmd.sx, cmd.sy, cmd.sw, cmd.sh, dx, dy, cmd.dw, cmd.dh);
    if (cmd.wash) washCell(ctx, cmd.wash, box, options.washColor);
    drawOverlays(ctx, cmd, box, options);
    ctx.restore();
    if (cmd.caret) strokeCaret(ctx, box, palette);
  } else if (cmd.kind === 'image') {
    const box = { dx, dy, dw: cmd.dw, dh: cmd.dh };
    ctx.save();
    // Under the image's alpha, so a dimmed cell fades whole.
    ctx.globalAlpha = cmd.alpha ?? 1;
    ctx.fillStyle = cmd.ground;
    ctx.fillRect(dx, dy, cmd.dw, cmd.dh);
    ctx.drawImage(cmd.image, dx, dy, cmd.dw, cmd.dh);
    if (cmd.wash) washCell(ctx, cmd.wash, box, options.washColor);
    drawOverlays(ctx, cmd, box, options);
    ctx.restore();
    if (cmd.caret) strokeCaret(ctx, box, palette);
  } else if (cmd.kind === 'fill') {
    const box = { dx, dy, dw: cmd.dw, dh: cmd.dh };
    ctx.fillStyle = cmd.fill;
    if (cmd.mark) {
      drawCellMark(ctx, cmd.mark, dx + cmd.dw / 2, dy + cmd.dh / 2,
                   cmd.dw * CIRCLE_SCALE / 2, options);
    } else if (cmd.glyph) {
      const { ground, ink } = glyphBlend(cmd.dw, cmd.cover);
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * ground;
      ctx.fillRect(dx, dy, cmd.dw, cmd.dh);
      if (ink > 0) {
        ctx.globalAlpha = alpha * ink;
        drawGlyph(ctx, cmd.glyph, box);
      }
      ctx.globalAlpha = alpha;
    } else if (cmd.shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(dx + cmd.dw / 2, dy + cmd.dh / 2,
                  cmd.dw * CIRCLE_SCALE / 2, cmd.dh * CIRCLE_SCALE / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(dx, dy, cmd.dw, cmd.dh);
    }
    strokeBorder(ctx, { ...cmd, ...box });
    if (cmd.wash) washCell(ctx, cmd.wash, box, options.washColor);
    drawOverlays(ctx, cmd, box, options);
    if (cmd.caret) strokeCaret(ctx, box, palette);
  } else if (cmd.kind === 'label') {
    ctx.save();
    ctx.fillStyle = cmd.depth === 0 ? palette.label.fill : palette.sublabel.fill;
    ctx.font = `${cmd.depth === 0 ? 700 : 600} ${cmd.size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(cmd.depth === 0 ? `${cmd.text}  ${cmd.count.toLocaleString()}`
                                 : cmd.text, dx, dy);
    ctx.restore();
  }
}
