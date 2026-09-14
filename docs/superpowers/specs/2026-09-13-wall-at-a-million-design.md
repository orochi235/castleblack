# The wall at a million items

**Status: designed 2026-09-13, not built.** Nothing below exists in the code
yet. The wall today holds each item as a JS object and runs CEL per item, which
tops out well short of a million.

This is the design for making `wall` fast at 1,114,112 items, with every
Unicode code point as the corpus that proves it. It is for whoever implements
it, and assumes the abstract-wall spec
(`2026-09-07-abstract-wall-design.md`) and the `wall/` package.

## Goal and gates

The corpus is every code point, U+0000 to U+10FFFF. It passes when, against a
warm local server in headless Chromium:

| gate | first bar | target |
|---|---:|---:|
| first paint of the whole wall | ≤ 3 s | < 1 s |
| pan and zoom, whole wall on screen | 60 fps | 60 fps |
| filter, class, tag or sort change redrawn | ≤ 250 ms | ≤ 250 ms |

State matching may run off the main thread if the page stays usable meanwhile.

## Why the current path cannot

Measured on an Apple M2 Max, Node 26.0.0, over 1,114,112 generated items with
Unicode-shaped fields:

| step | cost |
|---|---:|
| items as JSON | 162.9 MB raw, 6.3 MB gzipped |
| `JSON.parse` | 767 ms, 386 MB heap |
| `derive`, a 5-state spec with 2 filters and 2 sorts | 3,127 ms (2.8 µs per item) |

On top of that, `applySelection` sorts every visible row with a comparator on
every selection change, `gridLayout` allocates a `Rect` per item,
`visibleRange` scans every rect, and at full zoom-out `paintCommands` emits a
command for every cell, because every cell is visible.

## Design

### Feed: Arrow

A collection's items arrive as an Arrow IPC table, one column per field.
Strings that repeat (`kind`, `block`, `script`) are dictionary-encoded, lists
(tags) are Arrow lists, and nulls are validity bitmaps. The wall keeps the
columns as Arrow gave them and reads dictionary codes straight from the
buffers; it never builds an object per item.

- **Python:** `bakery` gains `pezlie.feed`, which writes a table with `pyarrow`.
- **JS:** `apache-arrow` (21.2.0) decodes it.
- **Small hosts keep objects.** `columnsFromItems(items)` builds the same column
  store from `T[]`, so a host with tens of thousands of items can go on sending
  JSON. brick-icons' parity tests use this path.
- **Poll deltas** arrive as a table of changed rows and are applied by `index`.
  A delta drops the cached sort orders and tiles that read a column it changed.

Arrow is on trial. The first build step decodes the 1,114,112-row Unicode table
in headless Chromium and reads every column once; if that takes more than
200 ms, a custom binary format (a JSON header of dictionaries plus
one typed-array buffer) replaces it before anything is built on top.

### State matching grouped by value

When a spec compiles, the wall walks each CEL expression's parse tree and
collects the fields it reads: `item.f`, `item['f']` with a constant key, and
`has(item.f)`. An expression that uses `item` any other way is marked
ungroupable.

`derive` then groups rows by the codes of an expression's fields and runs the
expression once per distinct group, writing the result to every row in it. For
Unicode the states read only `kind`, so they cost five evaluations. An
ungroupable expression, or one whose fields have nearly as many distinct values
as rows (brick-icons' `item.secs > 60`), runs per row, in a worker.

TypeScript hooks (tints, facets, grouping keys) declare `reads: string[]` and
are grouped the same way; a hook is called with an object holding only those
fields. One of these without `reads` is a spec error. Caption, glyph and mark
hooks need no `reads`: they run for visible rows only and get the whole item.

Results are typed columns: the state as a `Uint8Array` of state codes, each
filter and class as a bit array, each facet as codes into its value list.

### Selection without re-sorting

Each sort key's order is computed the first time that sort is used and cached
as a `Uint32Array` of rows. A dictionary-encoded key sorts its dictionary once
and orders rows by code rank; a numeric key sorts `(value, index)`. Ties break
by `index`, where today they break by natural id order; hosts compose `index`
in id order, and brick-icons' parity tests confirm the two agree.

A filter, class, facet or tag change is then one linear pass over the cached
order, writing the rows it keeps into a reused `Uint32Array`.

### Layout as blocks

A layout returns blocks and bands, not a rect per item. A block is a rectangle
of cells: its origin, column count, the first view position it holds, and its
count. A grid is one block; `blockLayout` and `bandedLayout` produce one block
per group. A cell's rect is arithmetic on its block, and the visible range is
the blocks that intersect the viewport, then the cell range inside each.

Grouping keys become projections (CEL, or a hook with `reads`), so grouping
uses the same value-grouped evaluation as everything else.

### Drawing: a tile pyramid built in the browser

Below the drawn size at which badges appear (`BADGE_MIN_PX`, 56 px), the wall
draws from world-space tiles instead of cells:

- Tiles are 512 px squares at power-of-two zoom levels, rendered on demand and
  keyed by layout version, slot, tint, highlight and wash. A frame draws the few
  dozen tiles covering the screen, each at the nearest level.
- A missing tile is drawn from the next coarser level scaled up while it
  renders. Rendering takes a fixed time budget per frame, nearest the center
  first.
- At the coarsest levels a tile is the one-pixel-per-cell image: each cell's
  state or tint color written straight into `ImageData`. Levels between that and
  sprites are composed from the 8 px and 32 px sheets.
- A cache of tiles is evicted least recently used, with its size in the params
  panel.
- The caret and band labels draw over the tiles each frame, as they do now.

At and above `BADGE_MIN_PX` so few cells fit on screen that they draw one by
one as now, with captions, glyphs and marks computed for visible rows only and
cached per row. A card or detail view builds its item object from the columns
for that one row.

### Unicode host

`hosts/unicode/` replaces `hosts/demo/`, which is deleted.

- **Data:** the Unicode 17.0.0 UCD files (`UnicodeData.txt`, `Blocks.txt`,
  `Scripts.txt`, `DerivedAge.txt`, `PropList.txt`), downloaded once into a
  gitignored cache and checked against pinned sha256 sums.
- **Items:** `id` `U+XXXX`, `index` (in `codepoints`, the code point), `sha` null, and
  `kind` (`assigned`, `unassigned`, `private`, `surrogate`, `noncharacter`),
  general category, block, script, age, plane and name.
- **Collections:** one generator pass writes `codepoints` (1,114,112 items) and
  `assigned` (every code point whose `kind` is `assigned`, re-indexed from 0).
  Each has a single slot, baked from no renders, so every sheet is empty.
- **Server:** one FastAPI app mounts each collection's feed, slots and sheet
  routes under `/api/<collection>/`.
- **Page:** a collection picker in the `WallView` header, held in the hash
  (`#codepoints`, `#assigned`). Switching remounts `WallView` with that
  collection's spec, URLs and `storageKey`.

### Measurement

- **`wall/bench/scale.ts`** times decode, derive, sort, select, layout and one
  full-wall tile render over the Unicode table at 25k, 250k and 1,114,112 rows,
  printing each stage as it finishes (`3/18  derive  1114112  41.2 ms`).
- **`hosts/unicode/bench/browser.mjs`** drives headless Chromium through
  Playwright: time from navigation to the first frame with every cell drawn;
  frame times over a scripted pan and zoom with the whole wall on screen; and
  the time from a filter or sort click to the next complete frame. It prints
  each against its gate and exits nonzero on a miss.

### brick-icons

brick-icons pins pezlie by sha, so it sees none of this until it moves the pin.
Before this merges, `hosts/brick-icons`' goldens and differential tests pass on
the new path through `columnsFromItems`, with its hooks given `reads`. Moving
its feed to Arrow is its own later change.

## Not in this spec

Each is its own spec, in this order:

1. **Paged sheets.** One square atlas per level caps the 32 px sheet at about
   207k items (WebP's 16,383 px side over a 36 px pitch). Sheets become
   fixed-size pages addressed by index.
2. **Font renders** for both Unicode collections, a slot per font.
3. **Emoji** (Noto Color Emoji, Twemoji, OpenMoji as slots) and **Material
   Symbols** as further collections on the same page.
4. **Rules evaluated by the server**, possibly: the feed ships derived state,
   filter and sort columns, computed by `cel-python` or over Arrow directly.
