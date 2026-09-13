import { unbind, type CompiledSpec } from './cel';
import type { Item } from './schema';

/** Everything the wall reads about an item, as columns parallel to `items`.
 *  CEL runs here, once per item per load; selection and paint read columns. */
export interface Facts<T extends Item> {
  items: readonly T[];
  state: string[];
  filters: Record<string, boolean[]>;
  classes: Record<string, boolean[]>;
  sorts: Record<string, unknown[]>;
  tags: string[][];
  facets: Record<string, (string | null)[]>;
  washed: boolean[];
  captions: Record<string, (string | null)[]>;
  glyph: (string | null)[];
  mark: (string | null)[];
  tint: Record<string, (number | null)[]>;
}

/** An item's sheet cell is its index, so the indices must be exactly
 *  `0..n-1`: one repeated or skipped puts sprites in the wrong cells, which
 *  reads as a rendering fault rather than a data fault. */
function assertIndices(items: readonly Item[]): void {
  const holder = new Array<string | undefined>(items.length);
  for (const item of items) {
    const i = item.index;
    if (!Number.isInteger(i) || i < 0 || i >= items.length) {
      throw new Error(`item ${item.id} has index ${i}, outside 0..${items.length - 1}`);
    }
    const held = holder[i];
    if (held !== undefined) throw new Error(`index ${i} is held by both ${held} and ${item.id}`);
    holder[i] = item.id;
  }
}

const text = (v: unknown): string | null =>
  v === null || v === undefined ? null : typeof v === 'string' ? v : String(v);

function fillRow<T extends Item>(c: CompiledSpec<T>, facts: Facts<T>, row: number): void {
  const item = facts.items[row]!;
  // With no catch-all state in the spec, the last state in match order is it.
  facts.state[row] = (c.byPrecedence.find((s) => s.match(item))
                      ?? c.byPrecedence[c.byPrecedence.length - 1]!).key;
  for (const [key, keep] of Object.entries(c.filters)) facts.filters[key]![row] = keep(item);
  for (const [key, member] of Object.entries(c.classes)) facts.classes[key]![row] = member(item);
  for (const [key, value] of Object.entries(c.sorts)) facts.sorts[key]![row] = value(item);
  facts.tags[row] = c.tags ? c.tags(item) : [];
  for (const [key, of] of Object.entries(c.facets)) facts.facets[key]![row] = text(of(item));
  facts.washed[row] = c.washes ? c.washes(item) : false;
  for (const [key, caption] of Object.entries(c.captions)) {
    facts.captions[key]![row] = text(caption(item));
  }
  facts.glyph[row] = c.glyph ? text(c.glyph(item)) : null;
  facts.mark[row] = c.mark ? text(c.mark(item)) : null;
  for (const tint of c.spec.tints ?? []) facts.tint[tint.key]![row] = tint.t(item);
}

export function derive<T extends Item>(c: CompiledSpec<T>, items: readonly T[]): Facts<T> {
  assertIndices(items);
  const n = items.length;
  const columns = <V>(keys: readonly string[]) =>
    Object.fromEntries(keys.map((k) => [k, new Array<V>(n)])) as Record<string, V[]>;
  const facts: Facts<T> = {
    items,
    state: new Array<string>(n),
    filters: columns<boolean>(Object.keys(c.filters)),
    classes: columns<boolean>(Object.keys(c.classes)),
    sorts: columns<unknown>(Object.keys(c.sorts)),
    tags: new Array<string[]>(n),
    facets: columns<string | null>(Object.keys(c.facets)),
    washed: new Array<boolean>(n),
    captions: columns<string | null>(Object.keys(c.captions)),
    glyph: new Array<string | null>(n),
    mark: new Array<string | null>(n),
    tint: columns<number | null>((c.spec.tints ?? []).map((t) => t.key)),
  };
  for (let row = 0; row < n; row++) fillRow(c, facts, row);
  return facts;
}

/** Re-derives the rows a delta touched, against the new item list. */
export function rederive<T extends Item>(c: CompiledSpec<T>, facts: Facts<T>,
                                         items: readonly T[], rows: Iterable<number>): void {
  if (items.length !== facts.items.length) {
    throw new Error(`rederive over ${items.length} items, derived over ${facts.items.length}`);
  }
  assertIndices(items);
  facts.items = items;
  for (const row of rows) {
    unbind(items[row]!);
    fillRow(c, facts, row);
  }
}
