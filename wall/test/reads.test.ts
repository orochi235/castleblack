import { parse } from '@bufbuild/cel';
import { describe, expect, it } from 'vitest';
import { readsOf } from '../src/reads';

const reads = (src: string) => readsOf(parse(src));

describe('readsOf', () => {
  it.each([
    ["item.kind == 'x'", ['kind']],
    ["item['kind'] == 'x'", ['kind']],
    ['has(item.sha) && item.secs > 60', ['secs', 'sha']],
    ["item.tags.exists(t, t == 'a')", ['tags']],
    ["'failed' in item.away", ['away']],
    ['item.a.b > 1', ['a']],
    ['[item.x, {"k": item.y}]', ['x', 'y']],
    ['true', []],
  ])('%s reads %j', (src, want) => {
    expect(reads(src)).toEqual(want);
  });

  it.each([
    'size(item) > 2',
    "item[item.key] == 1",
    'item.xs.exists(item, item > 1)',
  ])('%s cannot be narrowed', (src) => {
    expect(reads(src)).toBeNull();
  });
});
