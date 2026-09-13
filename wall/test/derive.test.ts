import { expect, it } from 'vitest';
import { compile } from '../src/cel';
import { derive, rederive } from '../src/derive';
import { SPEC, thing } from './fixture';

const compiled = compile(SPEC);

it('gives each item the first state that holds, variants included', () => {
  const facts = derive(compiled, [
    thing('a', 0),
    thing('b', 1, { level: 2 }),
    thing('c', 2, { away: ['broken'] }),
    thing('d', 3, { flagged: true, err: 'x' }),
  ]);
  expect(facts.state).toEqual(['idle', 'warn', 'brokenRemote', 'hidden']);
});

it('derives every column once', () => {
  const facts = derive(compiled, [
    thing('a', 0, { level: 2, labels: ['old', 'big'], kind: 'pin', score: 5 }),
    thing('b', 1, { sha: null, score: null, group: 'south' }),
  ]);
  expect(facts.filters.drawn).toEqual([true, false]);
  expect(facts.classes.archived).toEqual([false, false]);
  expect(facts.sorts.score).toEqual([5, null]);
  expect(facts.tags).toEqual([['old', 'big'], []]);
  expect(facts.facets.group).toEqual(['north', 'south']);
  expect(facts.washed).toEqual([true, false]);
  expect(facts.captions.span).toEqual(['L2', null]);
  expect(facts.captions.id).toEqual(['a', 'b']);
  expect(facts.glyph).toEqual(['P', null]);
  expect(facts.mark).toEqual(['pin', null]);
  expect(facts.tint.score).toEqual([0.5, null]);
});

it('refuses an index that repeats', () => {
  expect(() => derive(compiled, [thing('a', 0), thing('b', 0)])).toThrow(/index 0.*a.*b/);
});

it('refuses an index outside the corpus', () => {
  expect(() => derive(compiled, [thing('a', 0), thing('b', 2)])).toThrow(/index 2/);
});

it('sees an item that changed in place when its row is re-derived', () => {
  const items = [thing('a', 0), thing('b', 1)];
  const facts = derive(compiled, items);
  items[1]!.err = 'x';
  rederive(compiled, facts, items, [1]);
  expect(facts.state).toEqual(['idle', 'broken']);
});

it('rewrites only the rows it is given', () => {
  const items = [thing('a', 0), thing('b', 1)];
  const facts = derive(compiled, items);
  const next = [thing('a', 0, { level: 1 }), thing('b', 1, { err: 'x' })];
  rederive(compiled, facts, next, [1]);
  expect(facts.state).toEqual(['idle', 'broken']);
  expect(facts.items).toBe(next);
});
