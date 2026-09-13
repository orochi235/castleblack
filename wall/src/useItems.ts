import { useEffect, useRef, useState } from 'react';
import type { Item } from './schema';

export const POLL_MS = 10_000;

/** A host's item feed: the full list, or with `since` only what changed. */
export type FetchItems<T extends Item> =
  (slot: string, since?: string) => Promise<{ items: T[]; version: string }>;

/** Fold a delta into the wall's items.
 *
 *  Untouched items keep their identity, and `changed` names the rows replaced,
 *  so a caller re-derives only those. */
export function mergeItems<T extends Item>(current: T[], delta: readonly T[]):
    { items: T[]; changed: number[] } {
  if (delta.length === 0) return { items: current, changed: [] };
  const byId = new Map(delta.map((d) => [d.id, d]));
  const changed: number[] = [];
  const items = current.map((item, row) => {
    const next = byId.get(item.id);
    if (next === undefined) return item;
    changed.push(row);
    return next;
  });
  return { items: changed.length > 0 ? items : current, changed };
}

/** The wall's items, the slot they are for, and the rows the last poll replaced.
 *
 *  Items and slot travel together: a new slot beside the old slot's items
 *  fetches pictures that do not exist. Keeping both until the new ones arrive
 *  also stops the wall blanking on every switch. `changed` is null after a
 *  full load. */
export interface ItemsState<T extends Item> {
  items: T[] | null;
  slot: string;
  changed: number[] | null;
}

/** `fetchItems` is an effect dependency, so a host passes a stable function. */
export function useItems<T extends Item>(fetchItems: FetchItems<T>, slot: string,
                                         pollMs = POLL_MS): ItemsState<T> {
  const [state, setState] = useState<ItemsState<T>>({ items: null, slot, changed: null });
  const version = useRef('');

  useEffect(() => {
    let live = true;
    version.current = '';
    void fetchItems(slot).then((body) => {
      if (!live) return;
      version.current = body.version;
      setState({ items: body.items, slot, changed: null });
    });
    const timer = setInterval(() => {
      void fetchItems(slot, version.current).then((body) => {
        if (!live || body.items.length === 0) return;
        version.current = body.version;
        setState((prev) => {
          if (prev.slot !== slot || !prev.items) return prev;
          const merged = mergeItems(prev.items, body.items);
          return merged.changed.length > 0 ? { slot, ...merged } : prev;
        });
      });
    }, pollMs);
    return () => { live = false; clearInterval(timer); };
  }, [fetchItems, slot, pollMs]);

  return state;
}
