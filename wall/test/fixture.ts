import type { CorpusSpec, Item } from '../src/schema';

/** A corpus with nothing in common with any real host: every feature of the
 *  spec exercised by the smallest rule that can show it. */
export interface Thing extends Item {
  level: number;
  err: string | null;
  flagged: boolean;
  archived?: boolean;
  away: string[];
  kind: string | null;
  labels: string[];
  score: number | null;
  group: string;
}

export const thing = (id: string, index: number, overrides: Partial<Thing> = {}): Thing => ({
  id, index, sha: `sha-${id}`, level: 0, err: null, flagged: false, away: [],
  kind: null, labels: [], score: 5, group: 'north', ...overrides,
});

export const SPEC: CorpusSpec<Thing> = {
  states: [
    { key: 'idle', label: 'idle', fill: '#333333', border: null, weight: null,
      shape: 'square', precedence: 1000, match: 'true' },
    { key: 'hidden', label: 'hidden', fill: '#aaaaff', border: null, weight: null,
      shape: 'circle', precedence: 10, match: 'item.flagged', quiet: true },
    { key: 'warn', label: 'warning', fill: '#443322', border: '#ddaa22', weight: 'thick',
      shape: 'square', precedence: 20, match: 'item.level > 0', variants: ['remote'] },
    { key: 'broken', label: 'broken', fill: '#442222', border: '#e03030', weight: 'thick',
      shape: 'square', precedence: 30, match: 'item.err != null', variants: ['remote'] },
    { key: 'noted', label: 'noted', fill: '#223322', border: '#66aa77', weight: 'thin',
      shape: 'square', precedence: 50, match: 'item.level < 0' },
  ],
  variants: [
    { key: 'remote', suffix: 'Remote', label: '{label} remote', list: 'away',
      precedenceDrop: 40, weight: 'thin', wash: { s: 0.3, l: 0.675 } },
  ],
  filters: [
    { key: 'all', label: 'all', keep: 'true' },
    { key: 'drawn', label: 'drawn', keep: 'item.sha != null' },
    { key: 'broken', label: 'broken', keep: 'item.err != null' },
  ],
  classes: [
    { key: 'hidden', label: 'hidden', member: 'item.flagged', shown: true },
    { key: 'archived', label: 'archived', member: 'has(item.archived) && item.archived',
      shown: false },
  ],
  sorts: [
    { key: 'id', label: 'id', value: 'item.id', desc: false },
    { key: 'score', label: 'score', value: 'item.score', desc: true },
    { key: 'kind', label: 'kind', value: 'item.kind', desc: false },
  ],
  tags: 'item.labels',
  tagAxes: [
    { key: 'size', label: 'Size', tags: ['big', 'small'] },
    { key: 'mood', label: 'Mood', tags: ['calm', 'loud'] },
  ],
  facets: [{ key: 'group', label: 'Group', of: { expr: 'item.group' } }],
  washes: "'old' in item.labels",
  badges: [
    { tag: 'star', slot: 'corner', art: { mark: 'star', corner: 'tl', field: '#ff8800', ink: '#ffffff' } },
    { tag: 'old', slot: 'corner', art: { mark: 'box', corner: 'tr', field: '#888888', ink: '#ffffff' },
      yieldsTo: 'span' },
    { tag: 'big', slot: 'strip', art: { text: 'B', field: '#222288', ink: '#ffffff' } },
  ],
  captions: [
    { key: 'span', corner: 'tr', weight: 'text', text: { hook: 'span' } },
    { key: 'kind', corner: 'tl', weight: 'text', text: { expr: 'item.kind' } },
    { key: 'id', corner: 'bl', weight: 'id', text: { expr: 'item.id' } },
  ],
  tints: [
    { key: 'score', label: 'score', scaleLabel: 'score out of ten', log: false, reads: ['score'],
      t: (i) => (i.score === null ? null : i.score / 10), raw: (i) => i.score,
      at: (t) => t * 10, format: (v) => String(Math.round(v)) },
  ],
  glyph: { hook: 'initial' },
  mark: { hook: 'mark' },
  hooks: {
    span: (i) => (i.level === 0 ? null : `L${i.level}`),
    initial: (i) => (i.kind ? i.kind[0]!.toUpperCase() : null),
    mark: (i) => (i.kind === 'pin' ? 'pin' : null),
  },
};
