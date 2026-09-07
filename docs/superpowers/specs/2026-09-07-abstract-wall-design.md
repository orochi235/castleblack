# The abstract wall

**Status: designed, not built.** Nothing in this repo implements any of it.

This is the design for pulling the corpus wall out of `brick-icons` into two
domain-free packages, with the LEGO corpus as the first host. It is for whoever
implements it, and it assumes you have used the wall and know your way around
`lab/src/corpus/`.

It supersedes `wall/README.md`, which is kept in git history at `a1fffd0`.

## What is actually being extracted

The renderer is already domain-free. `PaintCommand` is geometry, colors, glyphs
and atlas source boxes — nothing about LEGO reaches it. What is bound to LEGO is
the decision layer directly above: `cellState`, `badgesFor`, `stripFor`,
`captionsFor`, `isRetired`, `glyphFor`, `markFor`, `tintFor`, and the sort,
filter and class tables in `select.ts`.

The Python bake is in the same shape. `thumbs.py` says `part_id` but means `id`:
`geometry`, `bake_part`, `compose`, edge replication and the atomic sidecar are
already generic. The LEGO lives entirely in `lab/cells.py`, which is SQL against
the brick-icons schema and stays with the host.

So this is not a rewrite. It is one new concept — a corpus schema — plus the
work of making eight hardcoded states into a table.

## The seam

A host describes its corpus as data. The wall reads that description; nothing
else crosses the boundary.

`Expr` is a [CEL](https://cel.dev) expression over `item`. Anything yielding a
boolean or a scalar is data. Anything doing arithmetic or producing a React node
is a named hook the host supplies; a `HookKey` names one in `hooks`, so the rest
of the spec stays serializable.

```ts
/** What the wall requires of an item. Hosts extend it. */
interface Item {
  id: string;
  /** Position in the FULL corpus order. See "The index invariant". */
  index: number;
  title: string;
  /** Content sha for the current slot; null means never rendered. */
  sha: string | null;
}

interface CorpusSpec<T extends Item> {
  /** Ordered = precedence. The wall takes the first match. */
  states:  { key; label; fill; border?; weight?; shape?;   match: Expr }[];
  filters: { key; label;                                    keep: Expr }[];
  classes: { key; label; on: boolean;                      match: Expr }[];
  badges:  { key; label; slot: 'tl'|'br'|'strip'; art: HookKey;
                                                           match: Expr }[];
  /** Generates a checkbox list per distinct value. */
  facets:  { key; label;                                      of: Expr }[];
  sorts:   { key; label; desc?;                            value: Expr }[];
  fields:  { key; label; show?: ('caption'|'card'|'modal')[]; corner?;
             value: Expr; link?: Expr;
             format?: HookKey; render?: HookKey }[];
  /** TS, not CEL: sets and colors are log-scaled and CEL has no math library. */
  tints:   { key; label; value: (item: T) => number | null }[];

  slots: { name; label }[];
  /** `item` and `slot` in scope; yields the vector rung's URL. */
  renderable: Expr;

  hooks: {
    format: Record<string, (v: Value) => string>;
    render: Record<string, (item: T) => ReactNode>;
    mark:   Record<string, MarkArt>;
  };
}
```

`fields` is one declaration read three ways. A field shown as `caption` with a
corner becomes a cell caption; shown as `card` or `modal` it is a row in the
hover card or the detail view. `render` is the escape hatch — it names a hook
returning a node, which the wall places without interpreting. brick-icons'
defect table and run history are two `render` fields, not two components.

Filtering is generated in full. `filters`, `sorts`, `classes`, `facets` and
`badges` between them produce the entire filter rail and the legend's tallied
rows. A host writes no filter UI.

### Why CEL rather than closures

The spec is data, not code, and three things follow. The Python feed and the TS
wall evaluate the identical predicate, which closes the two-language constant
problem rather than moving it. The spec can be a file both the demo host and
brick-icons load. And a user-typed filter expression becomes a small feature
instead of an eval sandbox, since CEL is non-Turing-complete and always
terminates.

Registering shared math extensions to keep tints in CEL too was considered and
rejected: every extension is a thing kept in sync across two languages, which is
the trap being extracted away from.

## Data flow

CEL runs **once per item per data load** — never per frame, never per filter
click. Per-evaluation cost is unmeasured; the spike in step 1 measures it over
the real corpus size. The design does not depend on the number, because deriving
once is right at any plausible cost: a per-frame `states.match` walk over the
visible set cannot be cheaper than a column read, and a per-click re-filter over
24,591 items cannot be cheaper than filtering precomputed booleans.

```
spec (JSON + hooks)
  │  compile: every Expr → a CEL program, once
  ▼
items from the feed ──► derive
                          │  one pass over every item: state key, class flags,
                          │  filter flags, badge keys, facet values, sort keys,
                          │  field values
                          ▼
                        facts table (columns parallel to items)
                          │
      selection ─────────►│  filter + sort over precomputed columns
                          ▼
                        view order (indices)
                          │
      layout ────────────►│  rects + bands
                          ▼
      paintCommands ─────►│  reads facts[i], never the item
                          ▼
                        canvas
```

This is faster than what exists today: the per-frame `cellState(cell)` walk in
`paintCommands` becomes a column read.

### The index invariant

A cell's atlas index is its position in the full corpus order, and the baker and
the feed must derive it identically or every sprite lands one cell off — which
reads as a rendering fault, not a data fault.

`derive` is the only stage that sees the whole corpus, so it is where the
invariant is asserted: indices dense, unique, `0..n-1`. Everything downstream
filters the *view order*, never the index. That is why `~Moved to` redirects are
hidden in the front end rather than dropped from the parts table.

## What moves where

| To `wall` unchanged | To `wall`, `Cell`→`Item` | Splits | Stays in brick-icons |
|---|---|---|---|
| `levels` `visible` `clamp` `reveal` `caret` `sheet` `svgRaster` `grouped` (`flowBlocks`) | `layout` `Wall.tsx` `useCells` `useSheets` `useLooseThumbs` `useVectorThumbs` `badges` (disc drawing) | `paint` `palette` `params` `select` `markPaths` `Legend` `Sidebar` `Lightbox` `PartCard` | `types` `facts` `families` `years` `catalogs` `tags` `cells.py` |

The four splits are the work:

**`paint`** keeps `paintCommands` and every geometry helper. The deciders leave.

**`palette` + `params`** are the expensive half. Eight states are hand-enumerated
five times today — the union, `CELL_PALETTE`, `PROPERTY`'s CSS variable names,
`PARAM_CSS_VAR` and `STATE_LABEL`. All of it derives from `states` instead, and
the params panel's color rows generate from that list rather than from a fixed
`ColorParamKey`. This single change touches `palette.ts`, `params.ts`,
`useParams.ts`, `ParamsPanel.tsx`, `Legend.tsx` and every test over them.

**`select`** loses `SORTS`, `FILTERS`, `CLASSES`, `KEEP` and `key` — every one is
a LEGO field name. The machinery stays and reads the spec.

**`markPaths`** is badge art, and most of it is LEGO: `minifig`, `technic`,
`duplo`, `brush`, `magnet`, `composite` go to the host's `hooks.mark`.
`star`, `archive` and `redo` are generic enough to keep as a starter set.

**Chrome** — the wall owns the hover card, modal, filter rail and legend,
driven by `fields`. The host supplies bodies only through `hooks.render`.

## Bakery

`thumbs.py` lifts nearly whole, joined by a mountable route module for the four
`/api/corpus/*` endpoint shapes. The host supplies the item feed and the
renderable lookup; `cells.py` does not move.

Two changes go in with the lift:

**Ground color stops being a shared constant.** `bakery` declares `GROUND`, the
sheet manifest reports it, and the wall reads it from the manifest instead of
`THUMB_GROUND`. The Python test that parses the TypeScript to pin the two
together is deleted.

**Single writer.** Two bakers over one output directory corrupt it. `compose`
takes a lockfile in the out directory and refuses rather than interleaving.

## Failure modes

**A bad expression.** Compile every `Expr` at spec load, collect *all* errors,
and render a spec-validation panel in place of the wall. A filter that silently
keeps nothing is an hour of chasing.

**A field the feed does not send.** The lab server outlives the page in front of
it — `types.ts` already carries that scar on `tags` and `successor`. An unknown
field resolves to absent and yields `false`, logged once, never thrown per item
per frame.

**A lost sidecar entry** is today indistinguishable from "never rendered": both
draw a blank cell. An item carrying a sha with no manifest entry means the bake
is missing, and that gets its own visible state.

**Staleness.** The manifest carries the sha each cell was baked from; the wall
compares it to the item's current sha. Disagreement means fall back a rung
rather than draw a lie.

**Index drift**, asserted in `derive` as above.

## Testing

**Capture the migration net first.** `paintCommands` is pure and returns plain
data, so golden command lists are cheap. Capture them from the *current*
brick-icons code before touching anything — each level, stale and fresh, every
state, badges on and off, each tint, grouped and dense — and require the
extracted wall to reproduce them exactly.

**Tests split along the same seam as the code.** Machinery assertions go to
`wall`, rewritten against the demo spec. Policy assertions — *does an open
defect turn a cell red* — stay in brick-icons. **`wall`'s suite must contain no
LEGO assertion at all**; one appearing there means something leaked, which is a
better detector than reading imports.

**The demo host ships as a fixture.** A few thousand generated SVGs, two slots,
its own state table, exercised bake → compose → feed → wall end to end. It is
the only spec `wall`'s tests are allowed to import.

**Cross-language conformance.** The expressions the spec uses, evaluated in the
chosen JS implementation and in `cel-python`, asserted equal. The spike that
picks the implementation becomes this test rather than being discarded.

While iterating, the scope is `lab/src/corpus/` on the brick-icons side and the
one package on the castleblack side. The full brick-icons suite is a pre-push
gate.

## Order of work

1. **CEL conformance spike.** Write the expressions the spec needs; run them
   through `@bufbuild/cel`, `@marcbachmann/cel-js` and `cel-python`; pick on
   agreement rather than on bundle size, and time an evaluation over 24,591
   items while there. Promote to a permanent test.
2. **Capture paint goldens** from brick-icons as it stands.
3. **States to a table**, in place in brick-icons, still with the LEGO table.
   Goldens must not move. This is the risky edit and it happens where it can be
   checked against a working wall.
4. **Lift `bakery`**, with the ground color and lock changes.
5. **Lift `wall`**, host adapter written against `CorpusSpec`.
6. **Demo host**, and the leak check that `wall`'s suite names nothing LEGO.
7. **brick-icons switches** to consuming both by path, deletes its copy.

## Open

**Name.** `castleblack` for now; `yumyulack` is the alternative, recorded under
the README title. Deciding it late costs a directory rename and an import path
sweep.

**CEL implementation**, settled by step 1.

**Timing.** The earlier writeup argued for waiting until the census stops
landing renders, on the grounds that the wall is the instrument being used to
watch it. That argument has not been retired — step 3 is a live edit to a live
instrument, and the goldens in step 2 are what make it survivable.
