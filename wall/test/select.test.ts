import { expect, it } from 'vitest';
import { compile } from '../src/cel';
import { derive } from '../src/derive';
import { applySelection, byAxis, type Selection } from '../src/select';
import { SPEC, thing, type Thing } from './fixture';

const compiled = compile(SPEC);
const ALL: Selection = { sort: 'id', filter: 'all', shown: { hidden: true, archived: true } };

function ids(items: Thing[], selection: Selection): string[] {
  const facts = derive(compiled, items);
  return applySelection(compiled, facts, selection).map((row) => items[row]!.id);
}

it('keeps what the filter keeps', () => {
  const items = [thing('a', 0), thing('b', 1, { err: 'x' })];
  expect(ids(items, { ...ALL, filter: 'broken' })).toEqual(['b']);
});

it('drops a hidden class', () => {
  const items = [thing('a', 0), thing('b', 1, { flagged: true })];
  expect(ids(items, { ...ALL, shown: { hidden: false, archived: true } })).toEqual(['a']);
});

it('takes the spec default for a class the selection does not mention', () => {
  const items = [thing('a', 0), thing('b', 1, { archived: true })];
  expect(ids(items, { ...ALL, shown: {} })).toEqual(['a']);
});

it('drops an excluded facet value', () => {
  const items = [thing('a', 0), thing('b', 1, { group: 'south' })];
  expect(ids(items, { ...ALL, exclude: { group: ['north'] } })).toEqual(['b']);
});

it('reads picked tags as alternatives within an axis and narrowing across', () => {
  const items = [
    thing('a', 0, { labels: ['big', 'calm'] }),
    thing('b', 1, { labels: ['small', 'calm'] }),
    thing('c', 2, { labels: ['big', 'loud'] }),
    thing('d', 3, { labels: ['calm'] }),
  ];
  expect(ids(items, { ...ALL, tags: ['big', 'small'] })).toEqual(['a', 'b', 'c']);
  expect(ids(items, { ...ALL, tags: ['big', 'small', 'calm'] })).toEqual(['a', 'b']);
});

it('gives a tag no axis claims an axis of its own', () => {
  expect(byAxis(SPEC.tagAxes!, ['loud', 'odd', 'big'])).toEqual([['big'], ['loud'], ['odd']]);
});

it('sorts nulls last in both directions', () => {
  const items = [thing('a', 0, { score: null }), thing('b', 1, { score: 1 }),
                 thing('c', 2, { score: 9 })];
  expect(ids(items, { ...ALL, sort: 'score' })).toEqual(['c', 'b', 'a']);
  expect(ids(items, { ...ALL, sort: 'kind' })).toEqual(['a', 'b', 'c']);
});

it('breaks a tie by natural id order, and compares strings naturally', () => {
  const tied = [thing('x10', 0), thing('x9', 1), thing('x9b', 2)];
  expect(ids(tied, { ...ALL, sort: 'score' })).toEqual(['x9', 'x9b', 'x10']);
  const kinds = [thing('a', 0, { kind: 'k10' }), thing('b', 1, { kind: 'k2' })];
  expect(ids(kinds, { ...ALL, sort: 'kind' })).toEqual(['b', 'a']);
});
