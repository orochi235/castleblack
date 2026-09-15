import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Rect } from './layout';
import './ItemCard.css';

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 190;
export const CARD_MARGIN = 8;
/** Past the clicked point, so the card never lands on what was clicked. */
export const CARD_OFFSET = 16;
/** Frame left around the opening on every side. */
export const CARD_PAD = 12;
/** The details column's text width, inside its own pad on either side. */
export const CARD_DETAILS = 200;

interface Size { width: number; height: number }
interface Point { x: number; y: number }

function axis(at: number, span: number, room: number): number {
  const after = at + CARD_OFFSET;
  if (after + span <= room - CARD_MARGIN) return after;
  const before = at - CARD_OFFSET - span;
  if (before >= CARD_MARGIN) return before;
  return Math.max(CARD_MARGIN, Math.min(after, room - span - CARD_MARGIN));
}

/** Below and right of the point; flipped to the other side of it on an axis
 *  without room; clamped inside the viewport where neither side has room. */
export function placeCard(at: Point, viewport: Size, card: Size): Point {
  return { x: axis(at.x, card.width, viewport.width),
           y: axis(at.y, card.height, viewport.height) };
}

export interface CardFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the cell shows through, in the same screen coordinates as `x`/`y`. */
  opening: { x: number; y: number; width: number; height: number };
  /** Which side of the opening the details column is on. */
  side: 'left' | 'right';
}

/** The frame around a cell's on-screen rect: the opening is the rect itself,
 *  with a pad on every side and the details column past one of them.
 *
 *  Never clamped into the viewport -- a frame that slid off its cell would
 *  point at the wrong one. Only the side the details take flips. */
export function frameCard(cell: Rect, viewport: Size,
                          details = CARD_DETAILS, pad = CARD_PAD): CardFrame {
  const column = details + 2 * pad;
  const width = cell.w + column + pad;
  const height = cell.h + 2 * pad;
  const fitsRight = cell.x + cell.w + column <= viewport.width - CARD_MARGIN;
  const fitsLeft = cell.x - column >= CARD_MARGIN;
  const side = fitsRight || !fitsLeft ? 'right' : 'left';
  const x = side === 'right' ? cell.x - pad : cell.x - column;
  return {
    x, y: cell.y - pad, width, height, side,
    opening: { x: cell.x, y: cell.y, width: cell.w, height: cell.h },
  };
}

export interface ItemCardProps {
  /** Where the card sits when there is no cell to frame. */
  at?: Point;
  /** The cell's on-screen rect. Given one, the card is a frame around it. */
  cell?: Rect;
  viewport: Size;
  onClose: () => void;
  /** Whether the pointer is over the card: a zoom drops the card, except the
   *  one being read. */
  onHoverChange?: (over: boolean) => void;
  label?: string;
  children: ReactNode;
}

const ORIGIN: Point = { x: 0, y: 0 };

export function ItemCard({ at, cell, viewport, onClose, onHoverChange, label = 'item card',
                           children }: ItemCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const openingRef = useRef<HTMLDivElement>(null);
  const frame = cell ? frameCard(cell, viewport) : null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--card-pad', `${CARD_PAD}px`);
    if (cell) {
      const box = frameCard(cell, viewport);
      el.style.setProperty('--card-x', `${box.x}px`);
      el.style.setProperty('--card-y', `${box.y}px`);
      el.style.setProperty('--card-w', `${box.width}px`);
      el.style.setProperty('--card-h', `${box.height}px`);
      el.style.setProperty('--open-w', `${box.opening.width}px`);
      el.style.setProperty('--open-h', `${box.opening.height}px`);
      return;
    }
    const { x, y } = placeCard(at ?? ORIGIN, viewport, {
      width: el.offsetWidth || CARD_WIDTH,
      height: el.offsetHeight || CARD_HEIGHT,
    });
    el.style.setProperty('--card-x', `${x}px`);
    el.style.setProperty('--card-y', `${y}px`);
  }, [at, cell, viewport]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPress = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      // The opening lets the press through to the wall; the card it belongs to
      // must not read that as a press outside itself.
      const open = openingRef.current?.getBoundingClientRect();
      if (open && e.clientX >= open.left && e.clientX <= open.right
          && e.clientY >= open.top && e.clientY <= open.bottom) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    // Capture, so a handler that stops propagation cannot keep a stale card up.
    document.addEventListener('pointerdown', onPress, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress, true);
    };
  }, [onClose]);

  const className = ['wall-card', frame ? 'wall-card--framed' : '',
                     frame?.side === 'left' ? 'wall-card--left' : ''].filter(Boolean).join(' ');

  return (
    <div className={className} ref={ref} role="dialog" aria-label={label}
         onPointerEnter={() => onHoverChange?.(true)}
         onPointerLeave={() => onHoverChange?.(false)}>
      {frame ? (
        <>
          <div className="wall-card__pane wall-card__pane--top" />
          <div className="wall-card__pane wall-card__pane--side" />
          <div className="wall-card__opening" ref={openingRef} aria-hidden="true" />
          <div className="wall-card__details">{children}</div>
          <div className="wall-card__pane wall-card__pane--bottom" />
        </>
      ) : children}
    </div>
  );
}
