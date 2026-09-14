import { compile, derive, stateKey } from '@pezlie/wall/src/index';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain script, typed by its use here
import { parse } from '../scripts/emoji.mjs';
import { EMOJI, type Emoji } from '../src/spec';

const SAMPLE = `# group: Smileys & Emotion
# subgroup: face-smiling
1F600                                                  ; fully-qualified     # 😀 E1.0 grinning face
263A                                                   ; unqualified         # ☺ E0.6 smiling face
# group: People & Body
# subgroup: hand-fingers-open
1F44B 1F3FB                                            ; fully-qualified     # 👋🏻 E1.0 waving hand: light skin tone
# group: Component
1F3FB                                                  ; component           # 🏻 E1.0 light skin tone
# group: Flags
# subgroup: country-flag
1F1E6 1F1E8                                            ; fully-qualified     # 🇦🇨 E2.0 flag: Ascension Island
`;

describe('parse', () => {
  it('keeps fully-qualified emoji only, in order, under their group', () => {
    const items = parse(SAMPLE) as Emoji[];
    expect(items.map((e) => [e.id, e.index, e.emoji, e.group, e.version, e.tone])).toEqual([
      ['1F600', 0, '😀', 'Smileys & Emotion', 1, false],
      ['1F44B-1F3FB', 1, '👋🏻', 'People & Body', 1, true],
      ['1F1E6-1F1E8', 2, '🇦🇨', 'Flags', 2, false],
    ]);
    expect(items[1]!.name).toBe('waving hand: light skin tone');
    expect(items[2]!.subgroup).toBe('country-flag');
  });
});

describe('the emoji spec', () => {
  const compiled = compile(EMOJI);

  it('colors each emoji by its group and draws the emoji itself', () => {
    const items = parse(SAMPLE) as Emoji[];
    const facts = derive(compiled, items);
    expect(items.map((_, row) => stateKey(facts, row))).toEqual(['smileys', 'people', 'flags']);
    expect(compiled.glyph!(items[1]!)).toBe('👋🏻');
  });
});
