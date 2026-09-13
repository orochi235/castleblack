/** Badges, as the wall's canvas draws them.
 *
 *  A mark draws in a unit box centered on the origin; `drawBadge` translates to
 *  the disc's center and scales, so the mark is centered against its field by
 *  construction.
 */
import { punches, type Marks, type MarkShape, type Paint } from './marks';
import { WEIGHT_ID, WEIGHT_TEXT } from './paint';
import type { BadgeArt } from './schema';

/** Condensed, so an identifier fits a small cell at a readable size. */
export const THUMB_FACE = "'Oswald', ui-sans-serif, system-ui, sans-serif";

/** Canvas does not wait for a webfont and the wall paints once, so without
 *  this the grid stays in the fallback face. Resolves either way. */
export function thumbFontReady(): Promise<void> {
  const fonts = (globalThis as { document?: Document }).document?.fonts;
  if (!fonts) return Promise.resolve();
  return Promise.all([
    fonts.load(`${WEIGHT_ID} 16px Oswald`),
    fonts.load(`${WEIGHT_TEXT} 16px Oswald`),
    fonts.load(`${LABEL_WEIGHT} 16px Oswald`),
  ]).then(() => undefined, () => undefined);
}

// Reversed type out of a solid field gains weight optically.
export const BADGE_WEIGHT = WEIGHT_TEXT;
/** Caps at the badge weight go thin beside a reversed letter. */
export const LABEL_WEIGHT = 400;
export const BADGE_FACE = THUMB_FACE;

export function markInk(badge: Pick<BadgeArt, 'ink' | 'field' | 'accent'>,
                        paint: Paint | 'none'): string | null {
  if (paint === 'none') return null;
  if (paint === 'ink') return badge.ink;
  if (paint === 'field') return badge.field;
  if (paint === 'accent') return badge.accent ?? badge.field;
  return paint;
}

const parsed = new Map<string, Path2D>();

function pathOf(d: string): Path2D {
  let path = parsed.get(d);
  if (!path) { path = new Path2D(d); parsed.set(d, path); }
  return path;
}

/** How far the labeled field is let down toward white. */
export const LABEL_WASH = 0.25;

/** OKLCH raises lightness and keeps hue; a six-digit hex mixes in sRGB. */
export function washToward(color: string, amount = LABEL_WASH): string {
  const lch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(color);
  if (lch) {
    const l = Number(lch[1]);
    return `oklch(${(l + (1 - l) * amount).toFixed(4)} ${lch[2]} ${lch[3]})`;
  }
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const out = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
  return `#${out.toString(16).padStart(6, '0')}`;
}

/** Drawn inside the radius, so `strokeScale` changes the line and never the
 *  footprint. A DOM swatch painting the same ring must use this. */
export function ringWidth(radius: number, badge: BadgeArt): number {
  return Math.max(1, radius * 0.16 * (badge.strokeScale ?? 1));
}

/** How far out the mark may run; a DOM swatch clipping the same art must agree. */
export function markClip(radius: number, badge: BadgeArt): number {
  return badge.ringOnDisc ? radius - ringWidth(radius, badge) : radius;
}

/** Fill and stroke a mark's pieces in the current transform, each piece's
 *  paint resolved by `ink`. */
export function drawMarkShapes(ctx: CanvasRenderingContext2D, shapes: readonly MarkShape[],
                               ink: (paint: Paint | 'none') => string | null) {
  for (const shape of shapes) {
    const path = pathOf(shape.d);
    ctx.save();
    if (shape.transform) ctx.transform(...shape.transform);
    if (shape.alpha != null) ctx.globalAlpha = shape.alpha;
    if (shape.punch) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000000';
      ctx.fill(path);
    } else {
      const fill = ink(shape.fill ?? 'ink');
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill(path, shape.rule ?? 'nonzero');
      }
      const stroke = shape.stroke ? ink(shape.stroke) : null;
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = shape.width ?? 0.1;
        ctx.lineJoin = shape.join ?? 'miter';
        ctx.lineCap = shape.cap ?? 'butt';
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }
}

let scratch: HTMLCanvasElement | null = null;

// Allocated at device size: a CSS-sized scratch stamped into a dpr-scaled
// context upsamples and renders soft.
function scratchOf(size: number, dpr: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  scratch ??= document.createElement('canvas');
  const need = Math.ceil(size * dpr);
  if (scratch.width < need || scratch.height < need) {
    scratch.width = scratch.height = need;
  }
  const sctx = scratch.getContext('2d');
  if (!sctx) return null;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, scratch.width / dpr, scratch.height / dpr);
  return sctx;
}

function scaleOf(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform?.();
  return m && Number.isFinite(m.a) && m.a > 0 ? m.a : 1;
}

export interface BadgeAt {
  cx: number; cy: number; size: number; radius: number; baseline?: number;
  /** A word set on the badge's own field, stretched to a stadium to hold it.
   *  The wall never passes one; a detail view may. */
  label?: string;
}

/** Measured with the ctx the badge will be drawn on. */
export function badgeWidth(ctx: CanvasRenderingContext2D, badge: BadgeArt,
                           at: BadgeAt): number {
  if (!at.label) return at.radius * 2;
  ctx.save();
  ctx.font = labelFont(at.size);
  const w = ctx.measureText(labelText(at.label)).width;
  ctx.restore();
  return at.radius + labelX(badge, at) - at.cx + w + LABEL_PAD * at.size;
}

export function labelText(label: string): string {
  return label.toUpperCase();
}

/** Multiples of the type size: mark to word, and word to the field's end. */
export const LABEL_GAP = 0.32;
export const LABEL_PAD = 0.55;

// An empty disc gets the field's padding, not a mark's width of empty room.
function labelX(badge: BadgeArt, at: BadgeAt): number {
  const filled = badge.mark != null || badge.text != null;
  return filled ? at.cx + at.radius + LABEL_GAP * at.size
                : at.cx - at.radius + LABEL_PAD * at.size;
}

function labelFont(size: number) {
  return `${LABEL_WEIGHT} ${size * 0.92}px ${BADGE_FACE}`;
}

export function drawBadge(ctx: CanvasRenderingContext2D, badge: BadgeArt,
                          at: BadgeAt, marks: Marks) {
  // Composited aside and stamped back, so the punched hole shows what is
  // behind the badge rather than cutting through the picture under it.
  if (punches(marks, badge.mark)) {
    const w = Math.ceil(badgeWidth(ctx, badge, at)) + 2;
    const h = Math.ceil(at.radius * 2) + 2;
    const dpr = scaleOf(ctx);
    const sctx = scratchOf(Math.max(w, h), dpr);
    if (sctx) {
      drawBadgeDirect(sctx, badge, { ...at, cx: at.radius + 1, cy: h / 2,
                                     baseline: undefined }, marks);
      ctx.drawImage(scratch!, 0, 0, w * dpr, h * dpr,
                    at.cx - at.radius - 1, at.cy - h / 2, w, h);
      return;
    }
  }
  drawBadgeDirect(ctx, badge, at, marks);
}

function drawBadgeDirect(ctx: CanvasRenderingContext2D, badge: BadgeArt,
                         at: BadgeAt, marks: Marks) {
  const { cx, cy, size, radius } = at;
  const font = `${badge.style ?? 'normal'} ${badge.weight ?? BADGE_WEIGHT} `
    + `${size * (badge.scale ?? 1)}px ${badge.font ?? BADGE_FACE}`;
  // Each glyph centered on its own ink box: an ascender on one shared
  // baseline puts its disc at a different height from a capital's.
  let textY = at.baseline ?? cy;
  if (badge.text) {
    ctx.save();
    ctx.font = font;
    // `actualBoundingBoxAscent` is measured from the current baseline.
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(badge.text);
    const asc = m.actualBoundingBoxAscent;
    const desc = m.actualBoundingBoxDescent;
    ctx.restore();
    if (Number.isFinite(asc) && Number.isFinite(desc)) textY = cy + (asc - desc) / 2;
    textY += size * (badge.dy ?? 0);
  }
  ctx.save();
  const line = ringWidth(radius, badge);
  const r = radius - line / 2;
  ctx.beginPath();
  if (at.label) {
    const end = cx + badgeWidth(ctx, badge, at) - radius * 2 + line / 2;
    ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2);
    ctx.arc(end, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
  } else {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  const labeled = at.label != null;
  const field = labeled
    ? badge.labelField ?? washToward(badge.field) : badge.field;
  ctx.fillStyle = field;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = badge.stroke ?? field;
  if (!badge.ringOnDisc) ctx.stroke();
  if (badge.ringOnDisc) {
    // Two filled discs, not a stroke over the field's edge: stacked
    // antialiasing leaks a rim of the field's color round the badge.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = badge.stroke ?? badge.field;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, markClip(radius, badge), 0, Math.PI * 2);
    ctx.fillStyle = badge.field;
    ctx.fill();
  } else if (labeled && field !== badge.field) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = badge.field;
    ctx.fill();
  }
  ctx.fillStyle = badge.ink;
  const mark = badge.mark ? marks[badge.mark] : undefined;
  if (mark) {
    ctx.save();
    // Inside the ring: clipped at the ring's own radius, the two antialiased
    // edges share pixels and the rim reads as transparent.
    ctx.beginPath();
    ctx.arc(cx, cy, markClip(radius, badge), 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    const s = radius * 0.66 * (badge.scale ?? 1);
    ctx.scale(s, s);
    drawMarkShapes(ctx, mark, (paint) => markInk(badge, paint));
    ctx.restore();
  } else if (badge.text) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(badge.text, cx + size * (badge.dx ?? 0), textY);
  }
  if (badge.ringOnDisc) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = line;
    ctx.strokeStyle = badge.stroke ?? badge.field;
    ctx.stroke();
  }
  if (at.label) {
    ctx.font = labelFont(size);
    ctx.fillStyle = badge.labelInk ?? badge.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Centered on the ink box, measured under the baseline it is painted on.
    const text = labelText(at.label);
    const m = ctx.measureText(text);
    const asc = m.actualBoundingBoxAscent;
    const desc = m.actualBoundingBoxDescent;
    const y = Number.isFinite(asc) && Number.isFinite(desc)
      ? cy + (asc - desc) / 2 : cy;
    ctx.fillText(text, labelX(badge, at), y);
  }
  ctx.restore();
}
