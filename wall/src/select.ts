import type { CompiledSpec } from './cel';
import type { Facts } from './derive';
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

/** The rows of `facts.items` on the wall, in view order. */
export function applySelection<T extends Item>(c: CompiledSpec<T>, facts: Facts<T>,
                                               selection: Selection): number[] {
  const keep = facts.filters[selection.filter];
  if (!keep) throw new Error(`no filter named ${selection.filter}`);
  const sort = c.spec.sorts.find((s) => s.key === selection.sort);
  if (!sort) throw new Error(`no sort named ${selection.sort}`);

  const hidden = c.spec.classes
    .filter((cls) => !(selection.shown[cls.key] ?? cls.shown))
    .map((cls) => facts.classes[cls.key]!);
  const excluded = Object.entries(selection.exclude ?? {})
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => [facts.facets[key] ?? [], new Set(values)] as const);
  const axes = byAxis(c.spec.tagAxes ?? [], selection.tags ?? []);

  const rows: number[] = [];
  for (let row = 0; row < facts.items.length; row++) {
    if (!keep[row]) continue;
    if (hidden.some((member) => member[row])) continue;
    const tags = facts.tags[row]!;
    if (!axes.every((group) => group.some((t) => tags.includes(t)))) continue;
    if (excluded.some(([values, off]) => off.has(values[row] ?? ''))) continue;
    rows.push(row);
  }

  const values = facts.sorts[selection.sort]!;
  const dir = sort.desc ? -1 : 1;
  return rows.sort((a, b) => {
    const ka = values[a];
    const kb = values[b];
    // No answer sorts last whichever way the sort runs.
    if (ka === null || ka === undefined) return kb === null ? 0 : 1;
    if (kb === null || kb === undefined) return -1;
    if (ka === kb) return naturalCompare(facts.items[a]!.id, facts.items[b]!.id);
    if (typeof ka === 'string' && typeof kb === 'string') return naturalCompare(ka, kb) * dir;
    return ((ka as number) < (kb as number) ? -1 : 1) * dir;
  });
}
