import { compile, derive } from '@pezlie/wall';
import { describe, expect, it } from 'vitest';
import { DEMO, type DemoItem } from '../src/spec';

const item = (index: number, overrides: Partial<DemoItem> = {}): DemoItem => ({
  id: `item-${String(index + 1).padStart(4, '0')}`, index, sha: 'abc', title: 't',
  kind: 'star', hue: 120, size: 0.9, born: 1987, tags: ['pointy', 'big'], flagged: false,
  error: null, secs: 3.5, away: [], ...overrides,
});

describe('the demo spec', () => {
  const compiled = compile(DEMO);

  it('puts each item in the state its fields describe', () => {
    const items = [
      item(0),
      item(1, { flagged: true, sha: null, secs: null }),
      item(2, { sha: null, error: 'TimeoutError', secs: 300 }),
      item(3, { secs: 120 }),
      item(4, { sha: null, secs: null }),
      item(5, { away: ['failed'] }),
      item(6, { away: ['slow'] }),
    ];
    expect(derive(compiled, items).state).toEqual(
      ['unknown', 'flagged', 'failed', 'slow', 'waiting', 'failedElsewhere', 'slowElsewhere']);
  });

  it('projects captions, tags, washes and tints', () => {
    const facts = derive(compiled, [item(0, { tags: ['round', 'favorite'], secs: 300 })]);
    expect(facts.captions.born).toEqual(['1987']);
    expect(facts.captions.kind).toEqual(['star']);
    expect(facts.tags[0]).toEqual(['round', 'favorite']);
    expect(facts.washed).toEqual([true]);
    expect(facts.tint.secs![0]).toBeCloseTo(1);
    expect(facts.tint.born![0]).toBeCloseTo(27 / 65);
  });
});
