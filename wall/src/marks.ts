/** Badge and quiet-cell mark art, as path data in the unit box a mark draws in.
 *
 *  One definition, two renderers: the canvas fills these for the wall, and the
 *  DOM emits them as `<path>` for the legend. The box is centered on the origin
 *  and the field's edge sits at `FIELD_R`, so a mark may run past 1 and be
 *  clipped by its own disc. The host supplies the set as `CorpusSpec.marks`.
 */

/** Which of the badge's inks a piece takes; a literal color is for a material
 *  that is not the badge's own. */
export type Paint = 'ink' | 'field' | 'accent' | (string & {});

export interface MarkShape {
  /** SVG path data. Both renderers take it verbatim. */
  d: string;
  /** Omitted means `ink`; `none` is for a piece that is only stroked. */
  fill?: Paint | 'none';
  rule?: 'evenodd';
  stroke?: Paint;
  /** In mark units, the same as the path's own coordinates. */
  width?: number;
  join?: 'round' | 'miter';
  cap?: 'round' | 'butt';
  alpha?: number;
  /** Applied to this piece alone, for a stroke that must be transformed with
   *  its path. */
  transform?: readonly [number, number, number, number, number, number];
  /** Erases rather than paints: a hole through the badge. */
  punch?: true;
}

export type Marks = Readonly<Record<string, readonly MarkShape[]>>;

/** The radius of a badge's field in mark units. */
export const FIELD_R = 1.515;

/** Whether a mark erases part of its own badge, and so needs a layer of its
 *  own: badges paint straight over the picture, and an erase there would cut
 *  through it. */
export function punches(marks: Marks, mark: string | undefined): boolean {
  return !!mark && (marks[mark]?.some((s) => s.punch) ?? false);
}
