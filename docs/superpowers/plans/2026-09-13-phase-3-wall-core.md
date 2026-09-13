# Phase 3: the `wall` core — Implementation Plan

> **BUILT — 2026-09-13**, branch `phase-3-wall` fast-forwarded to `main`. Phase
> 3b (React, canvas, loaders, chrome) is not built. See "What it found" at the
> foot.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a TypeScript package, `pezlie/wall`, holding the wall's geometry and its whole decision layer — states, selection, tints, and `paintCommands` — driven by a `CorpusSpec` whose predicates are CEL. brick-icons' spec, written against it, reproduces all 55 paint goldens, and matches the legacy code on generated corpora too.

**Architecture:** An npm workspace at the pezlie root with two members. `wall/` knows items, states and slots in the abstract, and its test suite names nothing from LEGO; a test enforces that. `hosts/brick-icons/` is the first host adapter — the LEGO `CorpusSpec` and its hooks — plus the parity tests, which import brick-icons' own `lab/src/corpus/` through an alias and run old and new side by side. At step 7 the adapter moves into brick-icons.

**Tech Stack:** TypeScript 5, Vitest, `@bufbuild/cel` 0.6.1, `@weasel-js/core` 1.4.4 (view math only). Node 26.

**Read against:** brick-icons `main` at `f3ca333` (2026-09-13).

---

## Scope

**In:** the pure modules. Geometry that moves unchanged (`layout`, `sheet`, `visible`, `clamp`, `reveal`, `caret`, `pinch`, `natural`, `levels`, `grouped`); the schema; CEL compilation; `derive`; the state machinery and palette; selection; tints; `paintCommands`.

**Out, and next (Phase 3b):** everything that touches React, the DOM or a canvas — `Wall.tsx`, the two executors (`draw2d`, `drawScene`, `toDrawCommands`), `badges.ts` drawing, the loaders (`useCells`, `useSheets`, `useLooseThumbs`, `useVectorThumbs`), and the chrome (`Legend`, `Sidebar`, `PartCard`, `ParamsPanel`, `useParams`, `CorpusWall`). They consume this phase's output and cannot be written before it.

## Decisions

**Predicates are CEL; display projections may be hooks.** States, filters, classes, sorts, tags and the wash flag are CEL, because the Python feed will need to evaluate the same rules. Caption text, facet values, the quiet-state glyph and mark, and tints are TS hooks: they are display-only, and CEL has no regex replace to strip an LDraw sigil with.

**CEL runs in `derive`, once per item, never in paint.** `derive` returns column arrays parallel to the items; `select` and `paintCommands` read columns. `rederive` updates the rows a poll delta changed.

**Variants are generated.** A state lists the variants it takes (`variants: ['elsewhere']`); a `VariantDef` says how: key suffix, label template, the list field whose membership matches, precedence drop, weight, and the wash applied to the border. That is brick-icons' `<key>Elsewhere` rule as data.

**The wall owns the look of a cell, not its meaning.** Badge art, caption text and state colors come from the host. Size gates (`BADGE_MIN_PX` 56, `LABEL_MIN_PX` 88, `GLYPH_MIN_PX` 22), border factors, caption inks and weights are wall defaults, overridable through `Appearance`.

**A badge may yield to a caption.** `yieldsTo: 'years'` drops the badge wherever that caption is drawn with text — brick-icons' "no retired disc beside the years" rule, generically.

**The palette reads through a function, not an element.** `readPalette(read, table)` takes `(prop) => string`, so the core needs no DOM; the CSS variable prefix is the host's (`--corpus-cell-` for brick-icons).

**Parity reads brick-icons' source, not a copy.** The host tests alias `@lab` to `$BRICK_ICONS/lab/src` (default: a `brick-icons` checkout beside pezlie) and skip without one.

## The contract — `wall/src/schema.ts`

```ts
export type Expr = string;
export type Projection = { expr: Expr } | { hook: string };

export interface Item { id: string; index: number; sha: string | null }

export type Weight = 'thick' | 'thin' | null;
export type Shape = 'square' | 'circle';

export interface StateDef {
  key: string; label: string;
  fill: string; border: string | null; weight: Weight; shape: Shape;
  /** Lower matches first. Listing order is legend order. */
  precedence: number;
  match: Expr;
  variants?: string[];
  /** Draws no captions or badges, and wears the glyph or mark instead. */
  quiet?: boolean;
}

export interface VariantDef {
  key: string;
  suffix: string;            // 'Elsewhere'
  label: string;             // '{label} elsewhere'
  list: string;              // item field holding matching state keys
  precedenceDrop: number;
  weight: Weight;
  wash: { s: number; l: number };
}

export interface FilterDef { key: string; label: string; keep: Expr }
export interface ClassDef { key: string; label: string; member: Expr; shown: boolean }
export interface SortDef { key: string; label: string; value: Expr; desc: boolean }
export interface FacetDef { key: string; label: string; of: Projection }
export interface TagAxis { key: string; label: string; tags: string[] }

export interface BadgeArt {
  text?: string; mark?: string; corner?: 'tl' | 'tr' | 'br';
  field: string; ink: string; stroke?: string; strokeScale?: number;
  ringOnDisc?: boolean; labelField?: string; labelInk?: string; accent?: string;
  font?: string; weight?: number; style?: string; scale?: number; dx?: number; dy?: number;
}
export type Badge = BadgeArt & { tag: string };
export interface BadgeDef { tag: string; slot: 'corner' | 'strip'; art: BadgeArt; yieldsTo?: string }

export interface CaptionDef { key: string; corner: 'tl' | 'tr' | 'bl'; weight: 'id' | 'text'; text: Projection }

export interface TintDef<T> {
  key: string; label: string; scaleLabel: string; log: boolean;
  t(item: T): number | null;
  raw(item: T): number | null;
  at(t: number): number;
  format(v: number): string;
}

export interface CorpusSpec<T extends Item = Item> {
  states: StateDef[];
  variants?: VariantDef[];
  filters: FilterDef[];
  classes: ClassDef[];
  sorts: SortDef[];
  tags?: Expr;
  tagAxes?: TagAxis[];
  facets?: FacetDef[];
  washes?: Expr;
  badges?: BadgeDef[];
  captions?: CaptionDef[];
  tints?: TintDef<T>[];
  glyph?: Projection;
  mark?: Projection;
  hooks?: Record<string, (item: T) => unknown>;
}
```

## Public surface, by module

| module | exports |
|---|---|
| `states` | `expandStates(spec) → StateSpec[]`, `byPrecedence`, `familyTable`, `conditionKeys`, `styleTable`, `shapeTable`, `labelTable`, `cssVarTable(states, prefix)`, `paramKeys`, `kebabKey`, `washOut` |
| `palette` | `Palette`, `CellStyle`, `defaultPalette(states, chrome?)`, `readPalette(read, states, prefix)` |
| `cel` | `compileSpec(spec) → { compiled, errors }`, `SpecError` (every bad expression, not the first) |
| `derive` | `Facts`, `derive(spec, items) → Facts`, `rederive(facts, items, rows)`; asserts indices dense and unique |
| `select` | `Selection`, `applySelection(facts, spec, selection) → number[]` |
| `tint` | `RAMPS`, `RampName`, `ramp`, `STEPS`, `tintFor(facts, row, mode, palette, gradient)` |
| `paint` | `Appearance`, `DEFAULT_APPEARANCE`, `PaintCommand`, `paintCommands(input)`, `tally(facts)`, size and ink constants |

## Tasks

Each task is test-first: write the tests named, watch them fail on the missing export, implement, watch them pass, commit. Iterate with `npx vitest run <file>` from the member directory; the whole workspace suite is the gate at the end.

### Task 0: Workspace

- [ ] Root `package.json` with `"workspaces": ["wall", "hosts/brick-icons"]`, `private: true`.
- [ ] `wall/package.json` (`@pezlie/wall`, private, `type: module`, scripts `test`, `typecheck`; deps `@bufbuild/cel@^0.6.1`, `@weasel-js/core@^1.4.4`; dev `typescript`, `vitest`), `wall/tsconfig.json` (strict, `noUncheckedIndexedAccess`, `moduleResolution: bundler`, `noEmit`), `wall/vitest.config.ts` (node environment).
- [ ] `hosts/brick-icons/` the same shape, depending on `@pezlie/wall`, with `@lab` aliased in both `tsconfig` and `vitest.config.ts` to `$BRICK_ICONS/lab/src`.
- [ ] `.gitignore`: `node_modules/`. `npm install` at the root. Commit.

### Task 1: Geometry, lifted unchanged

Copy from brick-icons `lab/src/corpus/` with their tests: `layout`, `sheet` (plus `SheetManifest` from `types.ts`), `visible`, `clamp`, `reveal`, `caret`, `pinch`, `natural`, `levels`, `grouped`. Imports become relative. `Cell` becomes a generic item type. `levels` takes its hysteresis defaults from a local `DEFAULT_HYSTERESIS = { up: 1.5, down: 0.67 }`; `grouped` takes `UNKNOWN_GROUP = 'unknown'` locally. Test fixtures that use part numbers or LEGO words are rewritten with neutral ids — behavior assertions unchanged.

- [ ] Add `wall/test/leak.test.ts`: every file under `wall/src` and `wall/test` is free of `/\b(lego|ldraw|bricks?|minifig|technic|duplo|occt|rebrickable|bricklink|brick-icons)\b/i`, excluding this test file.
- [ ] Lift, run each test file, commit.

### Task 2: States and palette

Tests, against a neutral fixture spec (states `ok`, `warn` with variant `remote`, `off` quiet circle):

- expansion appends each variant after all conditions, keyed `warnRemote`, labeled from the template, border washed, weight from the variant, precedence raised by the drop
- `byPrecedence` sorts by precedence, not listing order
- `familyTable` maps a variant to its condition
- `cssVarTable(states, '--x-cell-')` kebab-cases keys and gives borderless states no border variable
- `defaultPalette` holds every state plus `caret`, `label`, `sublabel`, `unmatched`
- `readPalette` prefers a declared value and falls back per property
- `washOut('#e03030')` keeps hue and sets saturation and lightness

### Task 3: CEL

Tests:

- `compileSpec` on a valid spec returns no errors
- two bad expressions in different tables are both reported, each naming its table and key
- a field the item lacks evaluates to `false` for a predicate and `null` for a value, and warns once per expression, not per item

### Task 4: `derive`

`Facts` columns: `state: string[]`, `filters: Record<key, boolean[]>`, `classes: Record<key, boolean[]>`, `sorts: Record<key, (string|number|null)[]>`, `tags: string[][]`, `facets: Record<key, string[]>`, `washed: boolean[]`, `captions: Record<key, (string|null)[]>`, `glyph`, `mark: (string|null)[]`, `tint: Record<key, (number|null)[]>`; plus `items`.

Tests:

- the first matching state by precedence wins; a variant matches through its list field
- an index repeated or missing throws, naming it
- `rederive` rewrites only the rows it is given

### Task 5: Selection

`Selection = { sort, filter, shown: Record<classKey, boolean>, exclude: Record<facetKey, string[]>, tags: string[] }`.

Tests: filter keeps; a hidden class drops its members; an excluded facet value drops; tags narrow across axes and alternate within one, and an unclaimed tag is its own axis; nulls sort last both ways; ties break by natural id order; strings compare naturally.

### Task 6: Tints

Tests: `ramp` quantizes to 8 steps and interpolates stops; `status` returns the state's palette style; a measured mode with no value returns `unmatched`; a value returns the ramp fill with no border.

### Task 7: `paintCommands`

Port `paint.ts`'s command logic onto facts. Tests, against the neutral spec: sprite when the sheet has a tile, image when a loose or vector image exists, fill otherwise; a quiet state drops captions and badges and wears the glyph above `GLYPH_MIN_PX` unless it has a mark; a yielding badge drops only where its caption is drawn; dimming by family and by tag; stale wash beats the per-cell wash; a measured tint takes the ground; band labels below their minimum width or size are skipped; `tally` counts by state.

### Task 8: The brick-icons host, and parity

- [ ] `hosts/brick-icons/src/spec.ts`: brick-icons' states, variants, filters, classes and sorts as CEL; badges from `@lab/corpus/paint`'s `CORNER_BADGES` and `STRIP_BADGES`, with `retired` yielding to `years`; captions (years through `yearRange`, family, id); tints from `@lab/corpus/tint`; glyph and mark through `glyphFor` / `markFor`-equivalent hooks; facet `category` through `categoryOf`.
- [ ] `test/goldens.test.ts`: rebuild the 55 scenarios of `goldens.fixture.ts` on the new API and compare with `$BRICK_ICONS/lab/src/corpus/goldens/*.json`.
- [ ] `test/differential.test.ts`: a seeded generator of cells covering every state, tag, null field and variant; for each of several seeds, legacy `paintCommands`, `tally` and `applySelection` (every sort, filter and class combination) against the new ones.

### Task 9: Cost

- [ ] `wall/bench/derive.mjs`: `derive` over 24,591 generated items with the brick-icons spec, reported per column. Record the number in "What it found".

### Task 10: Docs

- [ ] `wall/README.md` — the host contract. Spec: step 5 split into 5a (built) and 5b. `HANDOFF.md`, `PROJECTS.md`, this plan's status line.

## What this phase does not do

- No React, DOM or canvas code (Phase 3b).
- brick-icons does not consume the package (step 7).
- No Python evaluation of the spec; the conformance spike covers the CEL implementations, and the feed's side lands with the switchover.

## What it found

**Parity held from the first run.** The brick-icons spec reproduced all 55
goldens; breaking one predicate (`timeout` to `false`) made 30 of them fail. The
differential test covers 735 frames, 7,560 selections and the tallies over three
seeds, and caught a tint scaled by 0.97 and a sort's direction flipped.

**`@bufbuild/cel` rebuilds the item on every evaluation.** A plain object is
turned into a CEL map per call, so `item.id` cost 1.1 µs on a one-field object
and 20 µs on a 33-field one, and `derive` over 24,591 items took 6.6 s. Binding
each item once, cached by object identity, brought it to 307–330 ms over three
runs on an idle box. `rederive` drops a row's binding first, so an item changed
in place is seen.

**The host reads brick-icons' own tables** — colors, labels, badge art, sort
directions, class defaults — and restates only the predicates, as CEL. The one
copy is tint calibration (`FIRST_YEAR`, the log maxima), private to brick-icons'
`tint.ts`; the differential test fails if it drifts.

**Lifted layouts are generic,** so a key function handed to `blockLayout` or
`bandedLayout` needs its parameter typed; it cannot be inferred from the items
passed later.
