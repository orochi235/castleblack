import { useState } from 'react';
import type { CompiledSpec } from './cel';
import { naturalCompare } from './natural';
import { ParamsPanel, type ParamsPanelProps } from './ParamsPanel';
import type { Item } from './schema';
import type { Selection } from './select';
import { RAMP_NAMES, STATUS, type RampName } from './tint';
import './Sidebar.css';

export interface SidebarSelection extends Selection {
  tint: string;
  gradient: RampName;
  grouping: string;
  desc: boolean;
}

export interface Grouping {
  key: string;
  label: string;
  /** The direction toggle's label, for a grouping whose order has a direction. */
  desc?: string;
}

export interface SidebarFacet {
  key: string;
  label: string;
  counts: Map<string, number>;
  /** Folds values into collapsible groups; null leaves a value ungrouped.
   *  Groups keep the order their first value has in `counts`. */
  groupOf?: (value: string) => string | null;
}

export interface SidebarProps<T extends Item = Item> {
  compiled: CompiledSpec<T>;
  selection: SidebarSelection;
  onChange: (next: SidebarSelection) => void;
  groupings: Grouping[];
  facet?: SidebarFacet;
  shown: number;
  total: number;
  paramSchema: ParamsPanelProps['schema'];
  params: ParamsPanelProps['params'];
  setParam: ParamsPanelProps['setParam'];
  resetParams: ParamsPanelProps['reset'];
}

interface Member { name: string; n: number }
type Entry =
  | { kind: 'group'; name: string; total: number; members: Member[] }
  | ({ kind: 'value' } & Member);

const bySize = (a: Member, b: Member) => b.n - a.n || naturalCompare(a.name, b.name);

function facetEntries(counts: Map<string, number>,
                      groupOf: SidebarFacet['groupOf']): Entry[] {
  if (!groupOf) {
    return [...counts].map(([name, n]) => ({ name, n })).sort(bySize)
      .map((m) => ({ kind: 'value', ...m }));
  }
  const out: Entry[] = [];
  const groups = new Map<string, Extract<Entry, { kind: 'group' }>>();
  for (const [name, n] of counts) {
    const g = groupOf(name);
    if (g === null) {
      out.push({ kind: 'value', name, n });
      continue;
    }
    let entry = groups.get(g);
    if (!entry) {
      entry = { kind: 'group', name: g, total: 0, members: [] };
      groups.set(g, entry);
      out.push(entry);
    }
    entry.members.push({ name, n });
    entry.total += n;
  }
  for (const entry of groups.values()) entry.members.sort(bySize);
  return out;
}

/** HTML has no attribute for a box that is neither on nor off. */
function triState(on: boolean, partly: boolean) {
  return (node: HTMLInputElement | null) => {
    if (node) node.indeterminate = partly && !on;
  };
}

function GroupRow({ group, off, open, onOpen, onToggle }: {
  group: Extract<Entry, { kind: 'group' }>;
  off: ReadonlySet<string>;
  open: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const anyOn = group.members.some((m) => !off.has(m.name));
  const allOn = group.members.every((m) => !off.has(m.name));
  return (
    <div className="wall-side__fam">
      <button type="button" className="wall-side__twisty" aria-expanded={open}
              aria-label={`${group.name} members`} onClick={onOpen}>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M4 2.5 L8.5 6 L4 9.5 Z" />
        </svg>
      </button>
      <label>
        <input type="checkbox" name={group.name} checked={allOn}
               ref={triState(allOn, anyOn)} onChange={onToggle} />
        <span>{group.name}</span>
        <em>{group.total.toLocaleString()}</em>
      </label>
    </div>
  );
}

function ValueRow({ member, on, onToggle }: { member: Member; on: boolean; onToggle: () => void }) {
  return (
    <label>
      <input type="checkbox" name={member.name} checked={on} onChange={onToggle} />
      <span>{member.name}</span>
      <em>{member.n.toLocaleString()}</em>
    </label>
  );
}

export function Sidebar<T extends Item>({
  compiled, selection, onChange, groupings, facet, shown, total,
  paramSchema, params, setParam, resetParams,
}: SidebarProps<T>) {
  const { spec } = compiled;
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const off = new Set(facet ? selection.exclude?.[facet.key] ?? [] : []);
  const entries = facet ? facetEntries(facet.counts, facet.groupOf) : [];
  // One canonical order, so the same cleared boxes always write the same list.
  const ordered = entries.flatMap((e) => (e.kind === 'group' ? e.members.map((m) => m.name)
                                                             : [e.name]));
  const grouping = groupings.find((g) => g.key === selection.grouping);

  const exclude = (next: ReadonlySet<string>) => {
    if (!facet) return;
    onChange({ ...selection,
               exclude: { ...selection.exclude, [facet.key]: ordered.filter((v) => next.has(v)) } });
  };

  const toggleValue = (name: string) => {
    const next = new Set(off);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    exclude(next);
  };

  // A group box clears the whole group unless it is already clear, the only
  // reading under which one click always changes something.
  const toggleGroup = (members: Member[]) => {
    const next = new Set(off);
    const anyOn = members.some((m) => !next.has(m.name));
    for (const m of members) {
      if (anyOn) next.add(m.name);
      else next.delete(m.name);
    }
    exclude(next);
  };

  const toggleOpen = (name: string) => setOpen((was) => {
    const next = new Set(was);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  return (
    <aside className="wall-side">
      <label className="wall-side__row">Group
        <select value={selection.grouping}
                onChange={(e) => onChange({ ...selection, grouping: e.target.value })}>
          {groupings.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
      </label>

      {grouping?.desc && (
        <label className="wall-side__check">
          <input type="checkbox" checked={selection.desc}
                 onChange={(e) => onChange({ ...selection, desc: e.target.checked })} />
          {grouping.desc}
        </label>
      )}

      <label className="wall-side__row">Order
        <select value={selection.sort}
                onChange={(e) => onChange({ ...selection, sort: e.target.value })}>
          {spec.sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>

      <label className="wall-side__row">Color
        <select value={selection.tint}
                onChange={(e) => onChange({ ...selection, tint: e.target.value })}>
          <option value={STATUS}>status</option>
          {(spec.tints ?? []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>

      {/* `status` paints from the state palette, so a gradient has nothing to color. */}
      {selection.tint !== STATUS && (
        <label className="wall-side__row">Gradient
          <select value={selection.gradient}
                  onChange={(e) => onChange({ ...selection,
                                              gradient: e.target.value as RampName })}>
            {RAMP_NAMES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      )}

      <label className="wall-side__row">Show
        <select value={selection.filter}
                onChange={(e) => onChange({ ...selection, filter: e.target.value })}>
          {spec.filters.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </label>

      {facet && (
        <>
          <h3>
            {facet.label}
            <button type="button" onClick={() => exclude(new Set())}>all</button>
            <button type="button" onClick={() => exclude(new Set(ordered))}>none</button>
          </h3>
          <ul className="wall-side__facets">
            {entries.map((entry) => (
              <li key={`${entry.kind}:${entry.name}`}>
                {entry.kind === 'group' ? (
                  <>
                    <GroupRow group={entry} off={off} open={open.has(entry.name)}
                              onOpen={() => toggleOpen(entry.name)}
                              onToggle={() => toggleGroup(entry.members)} />
                    {open.has(entry.name) && (
                      <ul className="wall-side__members">
                        {entry.members.map((m) => (
                          <li key={m.name}>
                            <ValueRow member={m} on={!off.has(m.name)}
                                      onToggle={() => toggleValue(m.name)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <ValueRow member={entry} on={!off.has(entry.name)}
                            onToggle={() => toggleValue(entry.name)} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Classes</h3>
      <ul className="wall-side__facets">
        {spec.classes.map((cls) => (
          <li key={cls.key}>
            <label>
              <input type="checkbox" name={cls.key}
                     checked={selection.shown[cls.key] ?? cls.shown}
                     onChange={(e) => onChange({
                       ...selection,
                       shown: { ...selection.shown, [cls.key]: e.target.checked },
                     })} />
              <span>{cls.label}</span>
            </label>
          </li>
        ))}
      </ul>

      <p className="wall-side__count">{shown} of {total}</p>

      <ParamsPanel schema={paramSchema} params={params} setParam={setParam}
                   reset={resetParams} />
    </aside>
  );
}
