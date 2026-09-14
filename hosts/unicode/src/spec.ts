import type { CorpusSpec, Item, StateDef, TintDef } from '@pezlie/wall/src/schema';

export const COLLECTIONS = ['codepoints', 'assigned'] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const COLLECTION_LABELS: Record<Collection, string> = {
  codepoints: 'every code point',
  assigned: 'assigned characters',
};

export type Kind = 'assigned' | 'unassigned' | 'private' | 'surrogate' | 'noncharacter';

/** One row of `codepoints.arrow` or `assigned.arrow`. */
export interface CodePoint extends Item {
  cp: number;
  kind: Kind;
  /** General category, two letters. */
  gc: string;
  block: string;
  block_start: number | null;
  script: string;
  /** The Unicode version that assigned it. */
  age: string | null;
  plane: number;
  name: string;
}

const category = (gc: string) => `item.kind == 'assigned' && item.gc.startsWith('${gc}')`;

const state = (key: string, label: string, fill: string, precedence: number, match: string,
               quiet = false): StateDef =>
  ({ key, label, fill, border: null, weight: null, shape: 'square', precedence, match, quiet });

// A character's cell wears the character, so the assigned states are quiet.
const states: StateDef[] = [
  state('letter', 'letter', '#4f7fd9', 10, category('L'), true),
  state('mark', 'combining mark', '#a570d9', 20, category('M'), true),
  state('number', 'number', '#35a67a', 30, category('N'), true),
  state('punctuation', 'punctuation', '#d6962e', 40, category('P'), true),
  state('symbol', 'symbol', '#d45c80', 50, category('S'), true),
  state('separator', 'separator', '#7f8794', 60, category('Z'), true),
  state('control', 'control or format', '#5c636e', 70, "item.kind == 'assigned'"),
  state('private', 'private use', '#44365a', 80, "item.kind == 'private'"),
  state('surrogate', 'surrogate', '#553a2b', 90, "item.kind == 'surrogate'"),
  state('noncharacter', 'noncharacter', '#63303a', 100, "item.kind == 'noncharacter'"),
  state('unassigned', 'unassigned', '#1c1f26', 1000, 'true'),
];

const FIRST_VERSION = 1.1;
const LAST_VERSION = 17;

const tints: TintDef<CodePoint>[] = [
  {
    key: 'age', label: 'age', scaleLabel: 'Unicode version', log: false, reads: ['age'],
    t: (c) => (c.age === null ? null : (parseFloat(c.age) - FIRST_VERSION) / (LAST_VERSION - FIRST_VERSION)),
    raw: (c) => (c.age === null ? null : parseFloat(c.age)),
    at: (t) => FIRST_VERSION + t * (LAST_VERSION - FIRST_VERSION),
    format: (v) => v.toFixed(1),
  },
  {
    key: 'plane', label: 'plane', scaleLabel: 'plane', log: false, reads: ['plane'],
    t: (c) => c.plane / 16, raw: (c) => c.plane, at: (t) => t * 16, format: (v) => String(Math.round(v)),
  },
];

export const UNICODE: CorpusSpec<CodePoint> = {
  states,
  filters: [
    { key: 'all', label: 'everything', keep: 'true' },
    { key: 'assigned', label: 'assigned', keep: "item.kind == 'assigned'" },
    { key: 'unassigned', label: 'unassigned', keep: "item.kind == 'unassigned'" },
  ],
  classes: [
    { key: 'unassigned', label: 'unassigned', member: "item.kind == 'unassigned'", shown: true },
    { key: 'private', label: 'private use', member: "item.kind == 'private'", shown: true },
  ],
  sorts: [
    { key: 'cp', label: 'code point', value: 'item.cp', desc: false },
    { key: 'age', label: 'age', value: 'item.age', desc: false },
    { key: 'name', label: 'name', value: 'item.name', desc: false },
    { key: 'script', label: 'script', value: 'item.script', desc: false },
    { key: 'gc', label: 'category', value: 'item.gc', desc: false },
  ],
  facets: [{ key: 'script', label: 'script', of: { expr: 'item.script' } }],
  captions: [
    { key: 'name', corner: 'tl', weight: 'text', text: { expr: 'item.name' } },
    { key: 'id', corner: 'bl', weight: 'id', text: { expr: 'item.id' } },
  ],
  tints,
  // Measured over every 16th assigned character in Chrome on macOS.
  glyph: { hook: 'character', cover: 0.228 },
  hooks: {
    character: (c) => (c.kind === 'assigned' ? String.fromCodePoint(c.cp) : null),
  },
};

export const PLANES = [
  'Basic Multilingual', 'Supplementary Multilingual', 'Supplementary Ideographic',
  'Tertiary Ideographic', ...Array.from({ length: 10 }, (_, i) => `plane ${i + 4}`),
  'Supplementary Special-purpose', 'Supplementary Private Use A', 'Supplementary Private Use B',
];

export const planeKey = (plane: number) => String(plane).padStart(2, '0');
export const planeLabel = (key: string) => `${Number(key)}: ${PLANES[Number(key)]}`;
