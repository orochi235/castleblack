import type { CorpusSpec, Item, StateDef, TintDef } from '@pezlie/wall/src/schema';

/** One emoji, as `scripts/emoji.mjs` writes it. */
export interface Emoji extends Item {
  emoji: string;
  name: string;
  group: string;
  subgroup: string;
  /** The Emoji version that added it. */
  version: number;
  tone: boolean;
}

const GROUPS: [key: string, group: string, fill: string][] = [
  ['smileys', 'Smileys & Emotion', '#d9a62e'],
  ['people', 'People & Body', '#c9785a'],
  ['animals', 'Animals & Nature', '#4e9e62'],
  ['food', 'Food & Drink', '#c2553f'],
  ['travel', 'Travel & Places', '#4f86c6'],
  ['activities', 'Activities', '#8e62c4'],
  ['objects', 'Objects', '#6f7c8f'],
  ['symbols', 'Symbols', '#bf4f86'],
  ['flags', 'Flags', '#3a9a9e'],
];

// Every cell wears its emoji, so every state is quiet.
const states: StateDef[] = GROUPS.map(([key, group, fill], i) => ({
  key, label: group, fill, border: null, weight: null, shape: 'square',
  precedence: 10 * (i + 1), match: `item.group == '${group}'`, quiet: true,
}));
states.push({ key: 'other', label: 'other', fill: '#3a3d45', border: null, weight: null,
              shape: 'square', precedence: 1000, match: 'true', quiet: true });

const FIRST = 0.6;
const LAST = 17;

const tints: TintDef<Emoji>[] = [{
  key: 'version', label: 'version', scaleLabel: 'Emoji version', log: false, reads: ['version'],
  t: (e) => (e.version - FIRST) / (LAST - FIRST), raw: (e) => e.version,
  at: (t) => FIRST + t * (LAST - FIRST), format: (v) => v.toFixed(1),
}];

export const EMOJI: CorpusSpec<Emoji> = {
  states,
  filters: [{ key: 'all', label: 'every emoji', keep: 'true' }],
  classes: [],
  sorts: [
    { key: 'order', label: 'emoji order', value: 'item.index', desc: false },
    { key: 'version', label: 'version', value: 'item.version', desc: false },
    { key: 'name', label: 'name', value: 'item.name', desc: false },
  ],
  tints,
  glyph: { hook: 'emoji' },
  hooks: { emoji: (e) => e.emoji },
};
