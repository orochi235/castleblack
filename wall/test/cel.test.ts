import { afterEach, expect, it, vi } from 'vitest';
import { compile, compileSpec, SpecError } from '../src/cel';
import { SPEC, thing } from './fixture';

afterEach(() => { vi.restoreAllMocks(); });

it('compiles a valid spec with no errors', () => {
  const { compiled, errors } = compileSpec(SPEC);
  expect(errors).toEqual([]);
  expect(compiled).not.toBeNull();
});

it('reports every bad expression, not the first', () => {
  const bad = {
    ...SPEC,
    states: SPEC.states.map((s) => s.key === 'warn' ? { ...s, match: 'item.level >' } : s),
    sorts: SPEC.sorts.map((s) => s.key === 'score' ? { ...s, value: 'item.(' } : s),
  };
  const { compiled, errors } = compileSpec(bad);
  expect(compiled).toBeNull();
  expect(errors.map((e) => [e.table, e.key])).toEqual([['states', 'warn'], ['sorts', 'score']]);
  expect(errors.every((e) => e.message.length > 0)).toBe(true);
  expect(() => compile(bad)).toThrow(SpecError);
});

it('reports a hook the spec names and does not supply', () => {
  const { errors } = compileSpec({ ...SPEC, hooks: {} });
  expect(errors.map((e) => `${e.table}.${e.key}`)).toEqual(
    ['captions.span', 'glyph.glyph', 'mark.mark']);
});

it('evaluates predicates, values and projections', () => {
  const c = compile(SPEC);
  const t = thing('a', 0, { level: 2, labels: ['old', 'big'], kind: 'pin' });
  expect(c.filters.drawn!(t)).toBe(true);
  expect(c.sorts.score!(t)).toBe(5);
  expect(c.tags!(t)).toEqual(['old', 'big']);
  expect(c.washes!(t)).toBe(true);
  expect(c.captions.span!(t)).toBe('L2');
  expect(c.captions.id!(t)).toBe('a');
  expect(c.mark!(t)).toBe('pin');
  expect(c.facets.group!(t)).toBe('north');
});

it('takes the first state that matches, variants included', () => {
  const c = compile(SPEC);
  const stateOf = (t: ReturnType<typeof thing>) => c.byPrecedence.find((s) => s.match(t))!.key;
  expect(stateOf(thing('a', 0))).toBe('idle');
  expect(stateOf(thing('a', 0, { level: 1, err: 'x' }))).toBe('warn');
  expect(stateOf(thing('a', 0, { away: ['broken'] }))).toBe('brokenRemote');
  expect(stateOf(thing('a', 0, { flagged: true, level: 3 }))).toBe('hidden');
});

it('reads a field the item lacks as false or null, and says so once', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const c = compile(SPEC);
  const bare = { id: 'b', index: 0, sha: null } as unknown as ReturnType<typeof thing>;
  for (let i = 0; i < 3; i++) {
    expect(c.filters.broken!(bare)).toBe(false);
    expect(c.sorts.score!(bare)).toBeNull();
  }
  expect(warn).toHaveBeenCalledTimes(2);
});
