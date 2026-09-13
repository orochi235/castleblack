import { useId, type CSSProperties } from 'react';
import { BADGE_FACE, BADGE_WEIGHT, LABEL_GAP, LABEL_PAD, LABEL_WEIGHT,
         markClip, markInk, ringWidth, washToward } from './badgeDraw';
import type { MarkShape, Marks } from './marks';
import type { Badge } from './schema';
import './BadgeSwatch.css';

/** The legend's state swatches are 14px, and the two halves are one list. */
export const SWATCH_BOX = 14;

export interface BadgeSwatchProps {
  badge: Badge;
  /** The art `badge.mark` names. */
  marks: Marks;
  label?: string;
  box?: number;
  className?: string;
}

/** A badge as HTML: the field and word in CSS, the mark as inline SVG. The
 *  canvas and this share the mark data and the measurements, not a rasterizer. */
export function BadgeSwatch({ badge, marks, label, box = SWATCH_BOX, className }:
                            BadgeSwatchProps) {
  const radius = box / 2;
  // The type size the canvas derives from a disc of this radius.
  const size = radius / 0.72;
  const scale = badge.scale ?? 1;
  const shapes = badge.mark ? marks[badge.mark] : undefined;
  const disc = shapes != null || badge.text != null;
  const cut = cutMask(shapes, box, radius * 0.66 * scale);
  const labeled = label != null;
  const field = labeled ? badge.labelField ?? washToward(badge.field) : badge.field;
  const vars = {
    '--badge-box': `${box}px`,
    '--badge-field': field,
    '--badge-disc-field': badge.field,
    '--badge-stroke': badge.stroke ?? field,
    '--badge-ink': labeled ? badge.labelInk ?? badge.ink : badge.ink,
    '--badge-mark-ink': badge.ink,
    '--badge-line': `${ringWidth(radius, badge)}px`,
    '--badge-face': BADGE_FACE,
    '--badge-weight': `${badge.weight ?? BADGE_WEIGHT}`,
    '--badge-label-weight': `${LABEL_WEIGHT}`,
    '--badge-text': `${size * 0.92}px`,
    '--badge-gap': `${size * LABEL_GAP}px`,
    '--badge-pad': `${size * LABEL_PAD}px`,
    '--badge-glyph-face': badge.font ?? BADGE_FACE,
    '--badge-glyph': `${size * scale}px`,
    '--badge-glyph-style': badge.style ?? 'normal',
    '--badge-dx': `${size * (badge.dx ?? 0)}px`,
    '--badge-dy': `${size * (badge.dy ?? 0)}px`,
    ...(cut ? { '--badge-cut': cut } : {}),
  } as CSSProperties;
  return (
    <span className={`wall-badge ${className ?? ''}`} style={vars}
          data-disc={disc} data-label={labeled} data-cut={cut != null}
          data-ring={badge.ringOnDisc ? 'disc' : 'field'}
          aria-hidden="true">
      {disc && (
        <span className="wall-badge-disc">
          {shapes && <BadgeArt badge={badge} shapes={shapes} box={box} />}
          {badge.text && <span className="wall-badge-glyph">{badge.text}</span>}
        </span>
      )}
      {labeled && <span className="wall-badge-label">{label}</span>}
    </span>
  );
}

/** The mark in px against a `box`-wide viewBox, the frame `drawBadge` uses. */
function BadgeArt({ badge, shapes, box }:
                  { badge: Badge; shapes: readonly MarkShape[]; box: number }) {
  const id = useId();
  const radius = box / 2;
  const m = radius * 0.66 * (badge.scale ?? 1);
  return (
    <svg className="wall-badge-art" viewBox={`0 0 ${box} ${box}`}
         xmlns="http://www.w3.org/2000/svg" focusable="false">
      <clipPath id={id} clipPathUnits="userSpaceOnUse">
        <circle cx={radius} cy={radius} r={markClip(radius, badge)} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <g transform={`translate(${radius} ${radius}) scale(${m})`}>
          {shapes.filter((s) => !s.punch)
                 .map((s, i) => <MarkPath key={i} shape={s} badge={badge} />)}
        </g>
      </g>
    </svg>
  );
}

/** A punching mark as a mask image over the whole pill: what it cuts is the
 *  CSS field, which the disc's SVG does not paint. */
function cutMask(shapes: readonly MarkShape[] | undefined, box: number,
                 m: number): string | undefined {
  const cut = shapes?.filter((s) => s.punch) ?? [];
  if (cut.length === 0) return undefined;
  const r = box / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}">`
    + `<g transform="translate(${r} ${r}) scale(${m})">`
    + cut.map((s) => `<path d="${s.d}"/>`).join('')
    + '</g></svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function MarkPath({ shape, badge }: { shape: MarkShape; badge: Badge }) {
  const stroke = shape.stroke ? markInk(badge, shape.stroke) : null;
  return (
    <path d={shape.d}
          fill={markInk(badge, shape.fill ?? 'ink') ?? 'none'}
          fillRule={shape.rule}
          fillOpacity={shape.alpha}
          stroke={stroke ?? undefined}
          strokeWidth={stroke ? shape.width ?? 0.1 : undefined}
          strokeLinejoin={shape.join}
          strokeLinecap={shape.cap}
          strokeOpacity={stroke ? shape.alpha : undefined}
          transform={shape.transform ? `matrix(${shape.transform.join(' ')})` : undefined} />
  );
}
