import { celEnv, celMap, isCelError, isCelList, parse, plan } from '@bufbuild/cel';
import { strings } from '@bufbuild/cel/ext';
import type { CorpusSpec, Item, Projection } from './schema';
import { byPrecedence, expandStates, type StateSpec } from './states';

export type Predicate<T> = (item: T) => boolean;
export type Value<T> = (item: T) => unknown;

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
  tags: ((item: T) => string[]) | null;
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
      const run = plan(ENV, parse(expr));
      return (item) => {
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
      };
    } catch (e) {
      errors.push({ table, key, expr, message: e instanceof Error ? e.message : String(e) });
      return () => FAILED;
    }
  };
  const predicate = (table: string, key: string, expr: string): Predicate<T> => {
    const run = program(table, key, expr);
    return (item) => run(item) === true;
  };
  const value = (table: string, key: string, expr: string): Value<T> => {
    const run = program(table, key, expr);
    return (item) => {
      const out = run(item);
      return out === FAILED ? null : out;
    };
  };
  const projection = (table: string, key: string, p: Projection): Value<T> => {
    if ('expr' in p) return value(table, key, p.expr);
    const hook = spec.hooks?.[p.hook];
    if (!hook) {
      errors.push({ table, key, expr: `hook ${p.hook}`, message: `no hook named ${p.hook}` });
      return () => null;
    }
    return (item) => hook(item) ?? null;
  };
  const table = <D extends { key: string }>(name: string, defs: readonly D[],
                                            make: (d: D) => (item: T) => unknown) =>
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
    compiled.tags = (item) => {
      const out = tags(item);
      return Array.isArray(out) ? out as string[] : [];
    };
  }
  compiled.facets = table('facets', spec.facets ?? [], (f) => projection('facets', f.key, f.of));
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
