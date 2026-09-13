import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import './ItemCard.css';

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 190;
export const CARD_MARGIN = 8;
/** Past the clicked point, so the card never lands on what was clicked. */
export const CARD_OFFSET = 16;

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

export interface ItemCardProps {
  at: Point;
  viewport: Size;
  onClose: () => void;
  /** Whether the pointer is over the card: a zoom drops the card, except the
   *  one being read. */
  onHoverChange?: (over: boolean) => void;
  label?: string;
  children: ReactNode;
}

export function ItemCard({ at, viewport, onClose, onHoverChange, label = 'item card',
                           children }: ItemCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = placeCard(at, viewport, {
      width: el.offsetWidth || CARD_WIDTH,
      height: el.offsetHeight || CARD_HEIGHT,
    });
    el.style.setProperty('--card-x', `${x}px`);
    el.style.setProperty('--card-y', `${y}px`);
  }, [at, viewport]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Capture, so a handler that stops propagation cannot keep a stale card up.
    document.addEventListener('pointerdown', onPress, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress, true);
    };
  }, [onClose]);

  return (
    <div className="wall-card" ref={ref} role="dialog" aria-label={label}
         onPointerEnter={() => onHoverChange?.(true)}
         onPointerLeave={() => onHoverChange?.(false)}>
      {children}
    </div>
  );
}
