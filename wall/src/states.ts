import type { CorpusSpec, Item, Shape, StateDef, Weight } from './schema';

/** How a cell is drawn: the ground it sits on and the border that carries its
 *  state. */
export interface CellStyle {
  fill: string;
  border: string | null;
  weight: Weight;
}

/** A state as the wall uses it: a condition from the spec, or a variant
 *  generated from one. `family` is the condition a legend row counts it under. */
export interface StateSpec extends StateDef {
  family: string;
}

/** Every condition in listing order, then every variant in the order of the
 *  conditions that take it. */
export function expandStates<T extends Item>(spec: CorpusSpec<T>): StateSpec[] {
  const defs = new Map((spec.variants ?? []).map((v) => [v.key, v]));
  const conditions: StateSpec[] = spec.states.map((s) => ({ ...s, family: s.key }));
  const variants: StateSpec[] = [];
  for (const s of spec.states) {
    for (const name of s.variants ?? []) {
      const v = defs.get(name);
      if (!v) {
        throw new Error(`state ${s.key} takes variant ${name}, which the spec does not define`);
      }
      if (s.border === null) {
        throw new Error(`state ${s.key} takes variant ${name} but has no border to wash`);
      }
      variants.push({
        key: `${s.key}${v.suffix}`,
        label: v.label.replace('{label}', s.label),
        fill: s.fill,
        border: washOut(s.border, v.wash.s, v.wash.l),
        weight: v.weight,
        shape: s.shape,
        precedence: s.precedence + v.precedenceDrop,
        match: `'${s.key}' in item.${v.list}`,
        family: s.key,
      });
    }
  }
  return [...conditions, ...variants];
}

export function byPrecedence<S extends { precedence: number }>(states: readonly S[]): S[] {
  return [...states].sort((a, b) => a.precedence - b.precedence);
}

export function familyTable(states: readonly StateSpec[]): Record<string, string> {
  return Object.fromEntries(states.map((s) => [s.key, s.family]));
}

/** The legend's rows: conditions, no variants. */
export function conditionKeys(states: readonly StateSpec[]): string[] {
  return states.filter((s) => s.family === s.key).map((s) => s.key);
}

export function styleTable(states: readonly StateSpec[]): Record<string, CellStyle> {
  return Object.fromEntries(states.map(
    (s) => [s.key, { fill: s.fill, border: s.border, weight: s.weight }]));
}

export function shapeTable(states: readonly StateSpec[]): Record<string, Shape> {
  return Object.fromEntries(states.map((s) => [s.key, s.shape]));
}

export function labelTable(states: readonly StateSpec[]): Record<string, string> {
  return Object.fromEntries(states.map((s) => [s.key, s.label]));
}

export function kebabKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** The CSS custom property each state color is read from, under the host's
 *  root: `--corpus` gives `--corpus-cell-failed-fill`. */
export function cssVarTable(states: readonly StateSpec[], root: string):
    Record<string, { fill: string; border: string | null }> {
  return Object.fromEntries(states.map((s) => [s.key, {
    fill: `${root}-cell-${kebabKey(s.key)}-fill`,
    border: s.border === null ? null : `${root}-cell-${kebabKey(s.key)}-border`,
  }]));
}

export function paramKeys(state: StateDef): { fill: string; border: string | null } {
  return {
    fill: `${state.key}Fill`,
    border: state.border === null ? null : `${state.key}Border`,
  };
}

function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as
    [number, number, number];
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);
  if (span === 0) return 0;
  const h = max === r ? (g - b) / span + (g < b ? 6 : 0)
    : max === g ? (b - r) / span + 2
    : (r - g) / span + 4;
  return h / 6;
}

/** Hue kept, saturation and lightness replaced. */
export function washOut(hex: string, s = 0.30, l = 0.675): string {
  const h = hueOf(hex);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  const wheel: [number, number, number][] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = wheel[Math.floor(h * 6) % 6]!;
  return '#' + [r, g, b].map((v) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
