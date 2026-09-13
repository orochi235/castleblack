import { cssVarTable, styleTable, type CellStyle, type StateSpec } from './states';

export type { CellStyle } from './states';

/** What the wall draws that is not a cell state. */
export interface Chrome {
  caret: string;
  /** An outer band's header. */
  label: CellStyle;
  /** An inner block's header, which must not compete with it. */
  sublabel: CellStyle;
  /** An item a measured tint has no value for: its own flat tone, so absence
   *  never reads as the low end of a ramp. */
  unmatched: CellStyle;
}

export interface Palette extends Chrome {
  states: Record<string, CellStyle>;
}

export const DEFAULT_CHROME: Chrome = {
  caret: '#ffffff',
  label: { fill: '#e8e8ea', border: null, weight: null },
  sublabel: { fill: '#7e7e88', border: null, weight: null },
  unmatched: { fill: '#2a2a2e', border: null, weight: null },
};

export function defaultPalette(states: readonly StateSpec[],
                               chrome: Chrome = DEFAULT_CHROME): Palette {
  return { states: styleTable(states), ...chrome };
}

/** The palette with any color the host declared as a CSS custom property
 *  taking the place of the default. `read` is `getComputedStyle(el)
 *  .getPropertyValue` in a browser; canvas fills cannot see CSS any other way. */
export function readPalette(read: (prop: string) => string,
                            states: readonly StateSpec[], root: string,
                            fallback: Palette = defaultPalette(states)): Palette {
  const pick = (prop: string, dflt: string) => {
    const value = read(prop).trim();
    return value.length > 0 ? value : dflt;
  };
  const vars = cssVarTable(states, root);
  const out: Record<string, CellStyle> = {};
  for (const s of states) {
    const fb = fallback.states[s.key]!;
    const prop = vars[s.key]!;
    out[s.key] = {
      fill: pick(prop.fill, fb.fill),
      border: prop.border ? pick(prop.border, fb.border as string) : null,
      weight: fb.weight,
    };
  }
  const flat = (prop: string, style: CellStyle): CellStyle =>
    ({ fill: pick(prop, style.fill), border: null, weight: null });
  return {
    states: out,
    caret: pick(`${root}-caret-color`, fallback.caret),
    label: flat(`${root}-label`, fallback.label),
    sublabel: flat(`${root}-sublabel`, fallback.sublabel),
    unmatched: flat(`${root}-unmatched`, fallback.unmatched),
  };
}
