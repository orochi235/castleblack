import { useEffect, useState } from 'react';
import { SHEET_LEVELS } from './levels';
import type { SheetManifest } from './sheet';
import type { SlotUrls } from './urls';

export interface Sheet {
  image: HTMLImageElement;
  manifest: SheetManifest;
}

/** Every sprite-sheet level for a slot, and the slot they are for.
 *
 *  A slot change keeps the old set on screen and swaps the whole new set in
 *  once it has settled: a half-swapped wall reads every cell as stale. */
export interface SheetsState { sheets: Record<number, Sheet>; slot: string }

async function fetchManifest(url: string): Promise<SheetManifest> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json() as Promise<SheetManifest>;
}

/** `urls` is an effect dependency, so a host passes a stable object. */
export function useSheets(urls: SlotUrls, slot: string): SheetsState {
  const [state, setState] = useState<SheetsState>({ sheets: {}, slot });

  useEffect(() => {
    let live = true;
    const next: Record<number, Sheet> = {};
    let pending = SHEET_LEVELS.length;
    const settle = () => {
      if (--pending > 0 || !live) return;
      setState({ sheets: next, slot });
    };
    for (const level of SHEET_LEVELS) {
      void fetchManifest(urls.manifest(slot, level)).then((manifest) => {
        if (!live) return settle();
        const img = new Image();
        img.onload = () => { next[level] = { image: img, manifest }; settle(); };
        // A slot with no sheet baked settles too, or the wall would hold the
        // previous slot's drawings for the rest of the session.
        img.onerror = () => settle();
        // Every bake rewrites the atlas at this URL; a cached image against a
        // fresh manifest reads every tile at the wrong offset.
        img.src = urls.sheet(slot, level, manifest.version);
      }).catch(settle);
    }
    return () => { live = false; };
  }, [urls, slot]);

  return state;
}
