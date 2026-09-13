import { useEffect, useState } from 'react';

/** The part of the page a pinch has left on screen.
 *
 *  Chrome's pinch zoom moves neither `devicePixelRatio` nor `innerWidth` --
 *  only `visualViewport` -- so a canvas that ignores this keeps drawing at its
 *  unpinched resolution and the compositor blows it up.
 *
 *  `left`/`top`/`width`/`height` are client CSS pixels; `scale` is the
 *  magnification.
 */
export interface VisualViewport2 {
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function read(): VisualViewport2 {
  const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
  if (!vv) {
    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    const h = typeof window !== 'undefined' ? window.innerHeight : 0;
    return { scale: 1, left: 0, top: 0, width: w, height: h };
  }
  return { scale: vv.scale, left: vv.offsetLeft, top: vv.offsetTop,
           width: vv.width, height: vv.height };
}

function same(a: VisualViewport2, b: VisualViewport2): boolean {
  return a.scale === b.scale && a.left === b.left && a.top === b.top
      && a.width === b.width && a.height === b.height;
}

export function useVisualViewport(): VisualViewport2 {
  const [state, setState] = useState<VisualViewport2>(read);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    // A pinch fires continuously, and each event would resize the canvas.
    const sync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setState((current) => {
          const next = read();
          return same(current, next) ? current : next;
        });
      });
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  return state;
}
