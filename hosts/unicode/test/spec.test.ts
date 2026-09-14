import { compile, derive, stateKey, tintAt } from '@pezlie/wall/src/index';
import { describe, expect, it } from 'vitest';
import { UNICODE, type CodePoint } from '../src/spec';

const cp = (index: number, code: number, over: Partial<CodePoint> = {}): CodePoint => ({
  id: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`, index, sha: null, cp: code,
  kind: 'assigned', gc: 'Lu', block: 'Basic Latin', block_start: 0, script: 'Latin', age: '1.1',
  plane: code >> 16, name: '', ...over,
});

describe('the Unicode spec', () => {
  const compiled = compile(UNICODE);

  it('puts each code point in the state its kind and category describe', () => {
    const items = [
      cp(0, 0x41), cp(1, 0x300, { gc: 'Mn' }), cp(2, 0x30, { gc: 'Nd' }), cp(3, 0x21, { gc: 'Po' }),
      cp(4, 0x2b, { gc: 'Sm' }), cp(5, 0x20, { gc: 'Zs' }), cp(6, 0x0, { gc: 'Cc' }),
      cp(7, 0xe000, { kind: 'private', gc: 'Co' }), cp(8, 0xd800, { kind: 'surrogate', gc: 'Cs' }),
      cp(9, 0xfffe, { kind: 'noncharacter', gc: 'Cn' }), cp(10, 0x378, { kind: 'unassigned', gc: 'Cn', age: null }),
    ];
    const facts = derive(compiled, items);
    expect(items.map((_, row) => stateKey(facts, row))).toEqual([
      'letter', 'mark', 'number', 'punctuation', 'symbol', 'separator', 'control',
      'private', 'surrogate', 'noncharacter', 'unassigned']);
  });

  it('tints by version and plane, and draws the character itself', () => {
    const items = [cp(0, 0x1f600, { age: '17.0', gc: 'So' }), cp(1, 0x378, { kind: 'unassigned', age: null })];
    const facts = derive(compiled, items);
    expect(tintAt(facts, 'age', 0)).toBeCloseTo(1);
    expect(tintAt(facts, 'age', 1)).toBeNull();
    expect(tintAt(facts, 'plane', 0)).toBeCloseTo(1 / 16);
    expect(compiled.glyph!(items[0]!)).toBe('😀');
    expect(compiled.glyph!(items[1]!)).toBeNull();
  });
});
