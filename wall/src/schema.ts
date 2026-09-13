/** What a host tells the wall about its corpus.
 *
 *  Predicates and sort keys are CEL over `item`, so a Python feed can evaluate
 *  the same rule. Display projections may name a TypeScript hook instead.
 */

import type { Marks } from './marks';

export type Expr = string;
export type Projection = { expr: Expr } | { hook: string };

/** What the wall requires of an item. Hosts extend it. */
export interface Item {
  id: string;
  /** Position in the full corpus order: the item's cell on every sheet. */
  index: number;
  /** Content sha of the current render; null means never rendered. */
  sha: string | null;
}

export type Weight = 'thick' | 'thin' | null;
export type Shape = 'square' | 'circle';

export interface StateDef {
  key: string;
  label: string;
  fill: string;
  /** null: no border, and so no slash on an undrawn cell. */
  border: string | null;
  weight: Weight;
  shape: Shape;
  /** Lower matches first. Listing order is legend order. */
  precedence: number;
  match: Expr;
  /** Keys of the `VariantDef`s this state generates. */
  variants?: string[];
  /** Draws no captions or badges, and wears the glyph or mark instead. */
  quiet?: boolean;
}

/** A state seen from somewhere else, generated for each state that names it. */
export interface VariantDef {
  key: string;
  /** Appended to the state key: `failed` + `Elsewhere`. */
  suffix: string;
  /** `{label}` is replaced by the state's label. */
  label: string;
  /** The item field listing the state keys that hold elsewhere. */
  list: string;
  precedenceDrop: number;
  weight: Weight;
  /** The border keeps its hue and takes this saturation and lightness. */
  wash: { s: number; l: number };
}

export interface FilterDef { key: string; label: string; keep: Expr }
export interface ClassDef { key: string; label: string; member: Expr; shown: boolean }
export interface SortDef { key: string; label: string; value: Expr; desc: boolean }
export interface FacetDef { key: string; label: string; of: Projection }

/** Tags picked within one axis are alternatives; across axes they narrow. */
export interface TagAxis { key: string; label: string; tags: string[] }

export interface BadgeArt {
  text?: string;
  mark?: string;
  corner?: 'tl' | 'tr' | 'br';
  field: string;
  ink: string;
  stroke?: string;
  strokeScale?: number;
  ringOnDisc?: boolean;
  labelField?: string;
  labelInk?: string;
  accent?: string;
  font?: string;
  weight?: number;
  style?: string;
  scale?: number;
  dx?: number;
  dy?: number;
}

export type Badge = { tag: string } & BadgeArt;

export interface BadgeDef {
  tag: string;
  slot: 'corner' | 'strip';
  art: BadgeArt;
  /** Dropped wherever this caption is drawn with text. */
  yieldsTo?: string;
}

export interface CaptionDef {
  key: string;
  corner: 'tl' | 'tr' | 'bl';
  weight: 'id' | 'text';
  text: Projection;
}

export interface TintDef<T> {
  key: string;
  label: string;
  /** What the ramp measures, as a reader would say it. */
  scaleLabel: string;
  log: boolean;
  /** Where the item sits on the ramp, 0..1, or null for no value. */
  t(item: T): number | null;
  /** The unnormalized value, for a card to report. */
  raw(item: T): number | null;
  /** The inverse of `t`, for the scale's ticks. */
  at(t: number): number;
  format(v: number): string;
}

export interface CorpusSpec<T extends Item = Item> {
  states: StateDef[];
  variants?: VariantDef[];
  filters: FilterDef[];
  classes: ClassDef[];
  sorts: SortDef[];
  /** A list of strings. */
  tags?: Expr;
  tagAxes?: TagAxis[];
  facets?: FacetDef[];
  /** Whether an item is washed when `Appearance.wash` is on. */
  washes?: Expr;
  badges?: BadgeDef[];
  captions?: CaptionDef[];
  tints?: TintDef<T>[];
  /** What a quiet cell wears: a mark if it has one, else a glyph. */
  glyph?: Projection;
  mark?: Projection;
  /** The art a badge's or quiet cell's `mark` names. */
  marks?: Marks;
  hooks?: Record<string, (item: T) => unknown>;
}
