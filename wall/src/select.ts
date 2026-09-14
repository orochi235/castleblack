import type { CompiledSpec } from './cel';
import { rowsByIndex, sortColumn, type Facts } from './derive';
import { naturalCompare } from './natural';
import type { Item, TagAxis } from './schema';

/** Which items are on the wall, and in what order. */
export interface Selection {
  sort: string;
  filter: string;
  /** Per class; a class not named takes the spec's `shown`. */
  shown: Record<string, boolean>;
  /** Facet values to leave off, per facet. */
  exclude?: Record<string, readonly string[]>;
  tags?: readonly string[];
}

/** The picked tags, grouped by the axis each belongs to. A tag no axis claims
 *  gets an axis of its own, so it narrows rather than being dropped. */
export function byAxis(axes: readonly TagAxis[], picked: readonly string[]): string[][] {
  const out = axes
    .map((axis) => picked.filter((tag) => axis.tags.includes(tag)))
    .filter((group) => group.length > 0);
  const claimed = new Set(axes.flatMap((a) => a.tags));
  for (const tag of picked) if (!claimed.has(tag)) out.push([tag]);
  return out;
}

const none = (v: unknown) => v === null || v === undefined;

/** Every row in a sort's order, worked out once per sort and kept.
 *
 *  No answer sorts last whichever way the sort runs, strings compare
 *  naturally, and a tie keeps index order. */
export function sortOrder<T extends Item>(facts: Facts<T>, key: string): Uint32Array {
  const def = facts.compiled.spec.sorts.find((s) => s.key === key);
  if (!def) throw new Error(`no sort named ${key}`);
  let order = facts.cache.orders.get(key);
  if (order) return order;

  const { codes, values } = sortColumn(facts, key);
  const { rank, ranks } = values.every((v) => none(v) || typeof v === 'number')
    ? rankNumbers(values as (number | null)[], def.desc)
    : rankValues(values, def.desc);

  const n = facts.store.length;
  const starts = new Uint32Array(ranks + 2);
  for (let row = 0; row < n; row++) starts[rank[codes[row]!]! + 1]!++;
  for (let r = 1; r < starts.length; r++) starts[r]! += starts[r - 1]!;
  order = new Uint32Array(n);
  const byIndex = rowsByIndex(facts);
  for (let i = 0; i < n; i++) {
    const row = byIndex[i]!;
    order[starts[rank[codes[row]!]!]!++] = row;
  }
  facts.cache.orders.set(key, order);
  return order;
}

/** Ranks by a native numeric sort, which a comparator over a million
 *  distinct values is several times slower than. Nulls rank last. */
function rankNumbers(values: readonly (number | null)[], desc: boolean): { rank: Int32Array; ranks: number } {
  const present = Float64Array.from(values.filter((v): v is number => !none(v)));
  present.sort();
  let distinct = 0;
  for (let i = 0; i < present.length; i++) {
    if (i === 0 || present[i] !== present[i - 1]) present[distinct++] = present[i]!;
  }
  const rank = new Int32Array(values.length);
  values.forEach((v, code) => {
    if (none(v)) { rank[code] = distinct; return; }
    let lo = 0;
    let hi = distinct - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (present[mid]! < v!) lo = mid + 1; else hi = mid;
    }
    rank[code] = desc ? distinct - 1 - lo : lo;
  });
  return { rank, ranks: distinct };
}

function rankValues(values: readonly unknown[], desc: boolean): { rank: Int32Array; ranks: number } {
  const dir = desc ? -1 : 1;
  const byValue = Array.from(values.keys()).sort((a, b) => {
    const ka = values[a];
    const kb = values[b];
    if (none(ka)) return none(kb) ? 0 : 1;
    if (none(kb)) return -1;
    if (ka === kb) return 0;
    if (typeof ka === 'string' && typeof kb === 'string') return naturalCompare(ka, kb) * dir;
    return ((ka as number) < (kb as number) ? -1 : 1) * dir;
  });
  const rank = new Int32Array(values.length);
  let ranks = 0;
  byValue.forEach((code, i) => {
    const prev = byValue[i - 1];
    const same = prev !== undefined && (values[prev] === values[code]
      || (none(values[prev]) && none(values[code])));
    if (i > 0 && !same) ranks++;
    rank[code] = ranks;
  });
  return { rank, ranks: ranks + 1 };
}

/** The rows on the wall, in view order. */
export function applySelection<T extends Item>(c: CompiledSpec<T>, facts: Facts<T>,
                                               selection: Selection): Uint32Array {
  const keep = facts.filters[selection.filter];
  if (!keep) throw new Error(`no filter named ${selection.filter}`);
  const order = sortOrder(facts, selection.sort);

  const hidden = c.spec.classes
    .filter((cls) => !(selection.shown[cls.key] ?? cls.shown))
    .map((cls) => facts.classes[cls.key]!);
  const axes = byAxis(c.spec.tagAxes ?? [], selection.tags ?? []);
  const tagOk = axes.length === 0 ? null : Uint8Array.from(
    facts.tags.values as string[][],
    (tags) => (axes.every((group) => group.some((t) => tags.includes(t))) ? 1 : 0));
  const excluded = Object.entries(selection.exclude ?? {})
    .filter(([key, values]) => values.length > 0 && facts.facets[key])
    .map(([key, values]) => {
      const column = facts.facets[key]!;
      const off = new Set(values);
      return [column.codes, Uint8Array.from(column.values,
                                            (v) => (off.has((v as string | null) ?? '') ? 1 : 0))] as const;
    });

  const tagCodes = facts.tags.codes;
  const out = new Uint32Array(order.length);
  let count = 0;
  outer: for (let i = 0; i < order.length; i++) {
    const row = order[i]!;
    if (!keep[row]) continue;
    for (const member of hidden) if (member[row]) continue outer;
    if (tagOk && !tagOk[tagCodes[row]!]) continue;
    for (const [codes, off] of excluded) if (off[codes[row]!]) continue outer;
    out[count++] = row;
  }
  return out.slice(0, count);
}
