# The wall at a million items — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `WallView` draws all 1,114,112 Unicode code points within the gates in
`docs/superpowers/specs/2026-09-13-wall-at-a-million-design.md`.

**Architecture:** Items live in an `ItemStore` of columns (from Arrow or from
objects). `derive` evaluates each expression once per distinct combination of
the fields it reads and writes typed columns. Selection reads cached sort
orders; layouts return blocks; below `BADGE_MIN_PX` the wall draws a tile
pyramid rendered in the browser. `hosts/unicode` replaces `hosts/demo`.

**Tech Stack:** TypeScript 5, React 19, Vitest 2, `@bufbuild/cel` 0.6.1,
`apache-arrow` 21, `@weasel-js/*` 1.4.4; Python 3.14, `pyarrow` 25, FastAPI;
Playwright for the browser bench.

---

## File map

| file | responsibility |
|---|---|
| `hosts/unicode/ucd.py` | download and hash-check the UCD files; parse them into per-code-point properties |
| `hosts/unicode/make.py` | write `codepoints.arrow` and `assigned.arrow` |
| `hosts/unicode/server.py` | one FastAPI app, a feed and slots per collection |
| `hosts/unicode/src/{spec.ts,main.tsx}` | the spec, and the page with its collection picker |
| `hosts/unicode/bench/browser.mjs` | Playwright gates |
| `bakery/src/pezlie/feed.py` | write an item table as Arrow IPC |
| `wall/src/store.ts` | `ItemStore`: columns, row access, patches |
| `wall/src/reads.ts` | the item fields a CEL expression reads |
| `wall/src/cel.ts` | compile; every program carries its `reads` |
| `wall/src/derive.ts` | grouped evaluation into typed `Facts` |
| `wall/src/select.ts` | cached sort orders, selection as `Uint32Array` |
| `wall/src/layout.ts`, `grouped.ts` | block layouts, rect and hit arithmetic |
| `wall/src/tiles.ts` | the tile pyramid |
| `wall/bench/scale.ts` | per-stage timings at three sizes |

## Phase A — the Arrow trial

### Task 1: Unicode generator

- [ ] `ucd.py`: fetch `UnicodeData.txt`, `Blocks.txt`, `Scripts.txt`,
  `DerivedAge.txt` from `https://www.unicode.org/Public/17.0.0/ucd/` into
  `hosts/unicode/.ucd/` (gitignored); verify against sha256 sums pinned in the
  module. Parse ranges (`First>`/`Last>` pairs in `UnicodeData.txt`, `..` ranges
  elsewhere).
- [ ] `make.py`: one row per code point with `id`, `index`, `sha` (null),
  `kind`, `gc`, `block`, `script`, `age`, `plane`, `name`; strings
  dictionary-encoded except `id` and `name`. `assigned.arrow` keeps
  `kind == 'assigned'` and renumbers `index`. Progress line per plane.
- [ ] `bakery/src/pezlie/feed.py`: `write_table(path, columns, dictionary=[...])`,
  rows sorted by `index`, asserting indices are `0..n-1`.
- [ ] Tests (`hosts/unicode/tests/test_make.py`): 1,114,112 rows; U+0041 is
  `assigned`/`Lu`/`Latin`/`1.1`/`LATIN CAPITAL LETTER A`; U+D800 `surrogate`;
  U+E000 `private`; U+FFFE and U+FDD0 `noncharacter`; U+0378 `unassigned`;
  `assigned` row count equals the code points `UnicodeData.txt` names outside
  surrogates and private use; indices are exactly `0..n-1` in both.

### Task 2: decode trial

- [ ] `wall/bench/arrow-trial.ts`: read `codepoints.arrow`, `tableFromIPC`, touch
  every column's codes once; print the time.
- [ ] Same in headless Chromium through Playwright against the file served
  statically. Gate: ≤ 200 ms. Record the result in the spec; on a miss, stop and
  replace Arrow with the custom format before Task 3.

## Phase B — the data path

### Task 3: `ItemStore`

```ts
export interface Column {
  /** Per row, a code into `values`; `ABSENT` where the field is missing. */
  codes: Int32Array;
  values: readonly unknown[];
}
export interface ItemStore<T extends Item> {
  readonly length: number;
  id(row: number): string;
  sha(row: number): string | null;
  index(row: number): number;
  get(row: number): T;            // built on demand
  column(field: string): Column;  // cached; ABSENT everywhere for a field no row has
  fields(): readonly string[];
  /** A store with `delta` replacing rows by id; `changed` are those rows. */
  patch(delta: readonly T[]): { store: ItemStore<T>; changed: number[] };
}
export const ABSENT = -1;
export function storeFromItems<T extends Item>(items: readonly T[]): ItemStore<T>;
export function storeFromArrow<T extends Item>(table: Table): ItemStore<T>;
```

Values are keyed for coding by identity for primitives and by JSON for lists.
Tests: codes and values round-trip `get`; absent vs null differ; `patch`
changes only named rows and leaves the base store untouched; an Arrow table
and the same items as objects give equal `get` results and equal columns.

### Task 4: `reads`

`readsOf(parsed): string[] | null` — fields from `item.f`, `item['f']`, and
`has(item.f)`; `null` when `item` appears any other way. Tests for each form,
comprehensions over `item.tags`, and `null` for `item` passed whole.

### Task 5: compile carries reads

`Program<T> = { reads: string[] | null; run: (item) => unknown }` for every
predicate and value in `CompiledSpec`. Hook projections take `reads` from
`{ hook, reads }`; `TintDef` gains `reads`. A facet hook or tint without
`reads` is a `CompileError`. Tests for both errors and for reads propagation.

### Task 6: grouped `derive`

`Facts` becomes typed: `state: Uint8Array` (codes into `compiled.states`),
`filters`/`classes`/`washed` as `Uint8Array`, `sorts` as `{ codes: Int32Array;
values: unknown[] }`, `tags` as codes into tag lists, `facets` as `Column`,
`tint` as `Float32Array` with `NaN` for none; captions, glyph and mark as
per-row lazy lookups with a cache. Accessors `stateKey(facts, row)`,
`tagsOf(facts, row)`, `facetOf(facts, key, row)`. Grouping: the key is the
tuple of codes of a program's reads; one evaluation per distinct key against
an object holding only those fields. Tests: on the shared fixture and on
random items, every column equals per-row evaluation of the same spec.

### Task 7: selection

`applySelection` returns `Uint32Array`. Sort orders cached per `(facts, sort)`:
values ranked once (natural order for strings, numeric otherwise, nulls last
in both directions), rows counting-sorted by rank, ties by row. Tests: equal to
the old comparator on fixtures with ties, nulls and descending sorts; a second
call with another filter does not re-sort (spy).

### Task 8: block layouts

```ts
export interface Block { x: number; y: number; cols: number; start: number; count: number }
export interface Laid { blocks: Block[]; bands: Band[]; bounds: { w: number; h: number };
                        cell: number; pitch: number; count: number }
export function rectAt(laid: Laid, position: number): Rect;
export function positionAt(laid: Laid, world: { x: number; y: number }): number | null;
export function visibleCount(laid: Laid, cam: View, viewport): number;
export function visiblePositions(laid: Laid, cam: View, viewport, limit: number): number[] | null;
```

Grouped layouts take the selection order and per-row group codes. Caret and
reveal work from `rectAt` and blocks. Tests: grid and grouped layouts place
every position where the old rect layouts did on the old fixtures; hit and
visibility agree with a brute-force scan.

### Task 9: consumers

`paint.ts`, `tint.ts`, `Legend`, `Sidebar`, `cacheReport`, `sheet.staleCount`,
the thumb loaders read the new facts and store. `hosts/brick-icons` spec hooks
gain `reads`; its test adapter builds a store. Gate: `hosts/brick-icons` goldens
and differential tests pass unchanged.

## Phase C — drawing

### Task 10: tile pyramid

`TileCache` keyed by a generation object (laid, facts, order, palette, tint,
highlight, appearance, sheet, stale). Level `z` renders 512 px tiles at
`2^z` device px per world unit; a tile draws `paintCommands` for its positions,
or, when cells are under 2 px, writes colors straight into `ImageData`. A frame
draws the covering tiles at the best level held, renders missing ones nearest
the center first within a time budget, and requests another frame while any
are missing. Least-recently-used eviction. Tests with a recording fake canvas:
covering set, fallback to a coarser level, budget respected, eviction.

### Task 11: `Wall` and `WallView`

`Wall` draws tiles when the drawn cell is under `BADGE_MIN_PX`, cells above;
hit-testing through `positionAt`. `WallView` takes `fetchItems` (objects) or
`fetchTable` (Arrow bytes), holds an `ItemStore`, computes visible positions
only under a cap, and hands loaders row accessors.

## Phase D — host and gates

### Task 12: Unicode host

Server, spec (states per `kind`, filters, sorts by code point and age, facet by
script, groupings by plane and block), page with the collection picker. Delete
`hosts/demo`; update the workspace, README and `PROJECTS.md`.

### Task 13: `wall/bench/scale.ts`

Stages at 25k, 250k and 1,114,112 rows, one line each as it finishes.

### Task 14: browser gates

`browser.mjs` measures first paint, frame time over a scripted pan and zoom,
and filter/sort latency; exits nonzero on a miss. Fix what misses. Record the
numbers in the spec and mark what is built.
