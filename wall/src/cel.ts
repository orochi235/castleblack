import { celEnv, celMap, isCelError, isCelList, parse, plan } from '@bufbuild/cel';
import { strings } from '@bufbuild/cel/ext';
import { readsOf } from './reads';
import type { CorpusSpec, Item, Projection } from './schema';
import { byPrecedence, expandStates, type StateSpec } from './states';

/** `reads` is the item fields the rule uses, or null when that cannot be
 *  told; `derive` groups rows by those fields' values. */
export type Predicate<T> = ((item: T) => boolean) & { reads: string[] | null };
export type Value<T> = ((item: T) => unknown) & { reads: string[] | null };

const withReads = <F extends object>(fn: F, reads: string[] | null) => Object.assign(fn, { reads });

export interface CompileError {
  table: string;
  key: string;
  expr: string;
  message: string;
}

export class SpecError extends Error {
  constructor(readonly errors: CompileError[]) {
    super(`${errors.length} problem(s) in the corpus spec:\n`
      + errors.map((e) => `  ${e.table}.${e.key}: ${e.message}`).join('\n'));
    this.name = 'SpecError';
  }
}

/** Every expression in a spec, turned into a function once. */
export interface CompiledSpec<T extends Item> {
  spec: CorpusSpec<T>;
  /** Legend order. */
  states: StateSpec[];
  /** Match order: the first that holds is the item's state. */
  byPrecedence: { key: string; match: Predicate<T> }[];
  filters: Record<string, Predicate<T>>;
  classes: Record<string, Predicate<T>>;
  sorts: Record<string, Value<T>>;
  tags: (((item: T) => string[]) & { reads: string[] | null }) | null;
  washes: Predicate<T> | null;
  facets: Record<string, Value<T>>;
  captions: Record<string, Value<T>>;
  glyph: Value<T> | null;
  mark: Value<T> | null;
}

const ENV = celEnv({ funcs: strings });
const FAILED = Symbol('failed');

// The evaluator rebuilds a plain object into a CEL map on every call, which
// costs 20 us on an item of 33 fields; a map built once is used as it is.
const bindings = new WeakMap<object, unknown>();

/** Forgets an item's binding, for an item changed in place. */
export function unbind(item: object): void {
  bindings.delete(item);
}

function bind(item: object): unknown {
  let bound = bindings.get(item);
  if (bound === undefined) {
    bound = celMap(new Map(Object.entries(item)) as Parameters<typeof celMap>[0]);
    bindings.set(item, bound);
  }
  return bound;
}

function plain(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (isCelList(v)) return Array.from(v as Iterable<unknown>, plain);
  return v;
}

/** Compiles every expression and hook reference, collecting every problem
 *  rather than stopping at the first: a spec with three mistakes should say
 *  three things. */
export function compileSpec<T extends Item>(spec: CorpusSpec<T>):
    { compiled: CompiledSpec<T> | null; errors: CompileError[] } {
  const errors: CompileError[] = [];
  const warned = new Set<string>();

  const program = (table: string, key: string, expr: string): Value<T> => {
    try {
      const parsed = parse(expr);
      const run = plan(ENV, parsed);
      return withReads((item: T) => {
        const out = run({ item: bind(item) } as unknown as Parameters<typeof run>[0]);
        if (!isCelError(out)) return plain(out);
        // A field the feed does not send is absent, not fatal: the server can
        // be older than the page reading it.
        const where = `${table}.${key}`;
        if (!warned.has(where)) {
          warned.add(where);
          console.warn(`${where}: ${out.message}; reading it as absent`);
        }
        return FAILED;
      }, readsOf(parsed));
    } catch (e) {
      errors.push({ table, key, expr, message: e instanceof Error ? e.message : String(e) });
      return withReads(() => FAILED, []);
    }
  };
  const predicate = (table: string, key: string, expr: string): Predicate<T> => {
    const run = program(table, key, expr);
    return withReads((item: T) => run(item) === true, run.reads);
  };
  const value = (table: string, key: string, expr: string): Value<T> => {
    const run = program(table, key, expr);
    return withReads((item: T) => {
      const out = run(item);
      return out === FAILED ? null : out;
    }, run.reads);
  };
  const projection = (table: string, key: string, p: Projection): Value<T> => {
    if ('expr' in p) return value(table, key, p.expr);
    const hook = spec.hooks?.[p.hook];
    if (!hook) {
      errors.push({ table, key, expr: `hook ${p.hook}`, message: `no hook named ${p.hook}` });
      return withReads(() => null, []);
    }
    return withReads((item: T) => hook(item) ?? null, p.reads ?? null);
  };
  const table = <D extends { key: string }, F>(name: string, defs: readonly D[],
                                               make: (d: D) => F): Record<string, F> =>
    Object.fromEntries(defs.map((d) => [d.key, make(d)]));

  let states: StateSpec[] = [];
  try {
    states = expandStates(spec);
  } catch (e) {
    errors.push({ table: 'states', key: '*', expr: '',
                  message: e instanceof Error ? e.message : String(e) });
  }
  const matchers = new Map(states.map((s) => [s.key, predicate('states', s.key, s.match)]));

  const compiled: CompiledSpec<T> = {
    spec,
    states,
    byPrecedence: byPrecedence(states).map((s) => ({ key: s.key, match: matchers.get(s.key)! })),
    filters: table('filters', spec.filters, (f) => predicate('filters', f.key, f.keep)) as
      Record<string, Predicate<T>>,
    classes: table('classes', spec.classes, (c) => predicate('classes', c.key, c.member)) as
      Record<string, Predicate<T>>,
    sorts: table('sorts', spec.sorts, (s) => value('sorts', s.key, s.value)),
    tags: null,
    washes: spec.washes === undefined ? null : predicate('washes', 'washes', spec.washes),
    facets: {},
    captions: {},
    glyph: null,
    mark: null,
  };
  if (spec.tags !== undefined) {
    const tags = value('tags', 'tags', spec.tags);
    compiled.tags = withReads((item: T) => {
      const out = tags(item);
      return Array.isArray(out) ? out as string[] : [];
    }, tags.reads);
  }
  compiled.facets = table('facets', spec.facets ?? [], (f) => projection('facets', f.key, f.of));
  for (const f of spec.facets ?? []) {
    if ('hook' in f.of && !Array.isArray(f.of.reads)) {
      errors.push({ table: 'facets', key: f.key, expr: `hook ${f.of.hook}`,
                    message: 'a facet hook needs reads: the item fields it uses' });
    }
  }
  for (const t of spec.tints ?? []) {
    if (!Array.isArray(t.reads)) {
      errors.push({ table: 'tints', key: t.key, expr: 't',
                    message: 'a tint needs reads: the item fields t uses' });
    }
  }
  compiled.captions = table('captions', spec.captions ?? [],
                            (c) => projection('captions', c.key, c.text));
  if (spec.glyph) compiled.glyph = projection('glyph', 'glyph', spec.glyph);
  if (spec.mark) compiled.mark = projection('mark', 'mark', spec.mark);

  return { compiled: errors.length ? null : compiled, errors };
}

export function compile<T extends Item>(spec: CorpusSpec<T>): CompiledSpec<T> {
  const { compiled, errors } = compileSpec(spec);
  if (!compiled) throw new SpecError(errors);
  return compiled;
}
