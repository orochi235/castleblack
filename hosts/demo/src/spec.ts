import type {
  BadgeDef, CorpusSpec, Item, StateDef, TintDef, VariantDef,
} from '@castleblack/wall/src/schema';
import type { Marks } from '@castleblack/wall/src/marks';

/** One item as `make.py` writes it into `items-<slot>.json`. */
export interface DemoItem extends Item {
  title: string;
  kind: 'circle' | 'square' | 'triangle' | 'star' | 'ring' | 'cross';
  hue: number;
  size: number;
  born: number;
  tags: string[];
  flagged: boolean;
  error: 'TimeoutError' | 'RenderError' | null;
  secs: number | null;
  /** The state keys that hold for this item in the other slot. */
  away: string[];
}

const ELSEWHERE: VariantDef = {
  key: 'elsewhere', suffix: 'Elsewhere', label: '{label} elsewhere', list: 'away',
  precedenceDrop: 40, weight: 'thin', wash: { s: 0.3, l: 0.675 },
};

const states: StateDef[] = [
  { key: 'unknown', label: 'ok', fill: '#23262d', border: null, weight: null,
    shape: 'square', precedence: 1000, match: 'true' },
  { key: 'flagged', label: 'not being drawn', fill: '#7c83b0', border: null, weight: null,
    shape: 'circle', precedence: 10, match: 'item.flagged', quiet: true },
  { key: 'failed', label: 'failed', fill: '#3b1f26', border: '#e5484d', weight: 'thick',
    shape: 'square', precedence: 20, match: 'item.error != null', variants: [ELSEWHERE.key] },
  { key: 'slow', label: 'slow', fill: '#362d1c', border: '#e8a93b', weight: 'thick',
    shape: 'square', precedence: 30, match: 'item.secs != null && item.secs > 60',
    variants: [ELSEWHERE.key] },
  { key: 'waiting', label: 'waiting', fill: '#1c2733', border: '#4d7ea8', weight: 'thin',
    shape: 'square', precedence: 40, match: 'item.sha == null' },
];

const badges: BadgeDef[] = [
  { tag: 'favorite', slot: 'corner',
    art: { mark: 'star', corner: 'tl', field: '#d9a21b', ink: '#fff8e1' } },
  { tag: 'big', slot: 'strip', art: { text: 'B', field: '#35508f', ink: '#ffffff' } },
];

const marks: Marks = {
  star: [{
    d: 'M0 -1 L0.247 -0.34 L0.951 -0.309 L0.399 0.13 L0.588 0.809 L0 0.42 '
      + 'L-0.588 0.809 L-0.399 0.13 L-0.951 -0.309 L-0.247 -0.34 Z',
  }],
};

function linear(key: string, label: string, scaleLabel: string, lo: number, hi: number,
                read: (item: DemoItem) => number | null): TintDef<DemoItem> {
  return {
    key, label, scaleLabel, log: false,
    t: (item) => {
      const v = read(item);
      return v === null ? null : Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    },
    raw: read,
    at: (t) => lo + t * (hi - lo),
    format: (v) => String(Math.round(v)),
  };
}

const SECS_LO = Math.log10(0.2);
const SECS_HI = Math.log10(300);

const tints: TintDef<DemoItem>[] = [
  {
    key: 'secs', label: 'render time', scaleLabel: 'seconds to render', log: true,
    t: (item) => item.secs === null ? null
      : Math.min(1, Math.max(0, (Math.log10(Math.max(0.2, item.secs)) - SECS_LO) / (SECS_HI - SECS_LO))),
    raw: (item) => item.secs,
    at: (t) => 10 ** (SECS_LO + t * (SECS_HI - SECS_LO)),
    format: (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v))),
  },
  linear('born', 'born', 'year born', 1960, 2025, (item) => item.born),
  linear('hue', 'hue', 'hue in degrees', 0, 359, (item) => item.hue),
];

export const DEMO: CorpusSpec<DemoItem> = {
  states,
  variants: [ELSEWHERE],
  filters: [
    { key: 'all', label: 'all', keep: 'true' },
    { key: 'drawn', label: 'drawn', keep: 'item.sha != null' },
    { key: 'undrawn', label: 'undrawn', keep: 'item.sha == null' },
    { key: 'failed', label: 'failed', keep: 'item.error != null' },
  ],
  classes: [{ key: 'flagged', label: 'not being drawn', member: 'item.flagged', shown: true }],
  sorts: [
    { key: 'id', label: 'id', value: 'item.id', desc: false },
    { key: 'kind', label: 'kind', value: 'item.kind', desc: false },
    { key: 'born', label: 'born', value: 'item.born', desc: false },
    { key: 'secs', label: 'render time', value: 'item.secs', desc: true },
  ],
  tags: 'item.tags',
  tagAxes: [
    { key: 'shape', label: 'Shape', tags: ['round', 'pointy'] },
    { key: 'size', label: 'Size', tags: ['big', 'tiny'] },
    { key: 'favorite', label: 'Favorite', tags: ['favorite'] },
  ],
  facets: [{ key: 'kind', label: 'kind', of: { expr: 'item.kind' } }],
  washes: "'favorite' in item.tags",
  badges,
  marks,
  captions: [
    { key: 'born', corner: 'tr', weight: 'text', text: { expr: 'string(item.born)' } },
    { key: 'kind', corner: 'tl', weight: 'text', text: { expr: 'item.kind' } },
    { key: 'id', corner: 'bl', weight: 'id', text: { expr: 'item.id' } },
  ],
  tints,
};
