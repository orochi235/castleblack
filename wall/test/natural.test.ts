import { describe, expect, it } from 'vitest';

import { naturalCompare } from '../src/natural';

const sorted = (ids: string[]) => ids.slice().sort(naturalCompare);

describe('naturalCompare', () => {
  it('orders a digit run by its value, not its first character', () => {
    expect(sorted(['10250', '2', '1', '9', '4100'])).toEqual(
      ['1', '2', '9', '4100', '10250']);
  });

  it('keeps a bare id ahead of its own suffixed variants', () => {
    expect(sorted(['4100b', '4100', '4100a', '4101'])).toEqual(
      ['4100', '4100a', '4100b', '4101']);
  });

  it('compares each component in turn, not one digit', () => {
    expect(sorted(['5200cq01', '5200cq0a', '5200cq2', '5200cq10'])).toEqual(
      ['5200cq0a', '5200cq01', '5200cq2', '5200cq10']);
  });

  it('leaves a sigil after every letter, as a sort on raw group names needs', () => {
    expect(sorted(['~Apple', 'Pear', 'Apple'])).toEqual(
      ['Apple', 'Pear', '~Apple']);
  });

  it('reads a leading-zero run as its value', () => {
    expect(naturalCompare('6200k03', '6200k3')).toBe(0);
    expect(sorted(['6200k010', '6200k03'])).toEqual(['6200k03', '6200k010']);
  });

  it('orders a prefixed id by the number inside it', () => {
    expect(sorted(['n7085', 'n708', 'n7'])).toEqual(['n7', 'n708', 'n7085']);
  });
});
