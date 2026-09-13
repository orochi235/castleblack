# The abstract wall

**Status: steps 1–4 of the order of work are built; `wall` is not.** The CEL
spike and the `bakery` package live in this repo; the paint goldens and the
state tables are in brick-icons. Steps 5–7 are unbuilt. `wall` is its own package
in this repo, depending on weasel (decided 2026-09-13). Checked against brick-icons `6bbc739`
(2026-09-13).

This is the design for pulling the corpus wall out of `brick-icons` into two
domain-free packages, with the LEGO corpus as the first host. It is for whoever
implements it, and it assumes you have used the wall and know your way around
`lab/src/corpus/`.

It supersedes `wall/README.md`, which is kept in git history at `a1fffd0`.

## What is actually being extracted

`PaintCommand` is geometry, colors, glyphs and atlas source boxes — nothing
about LEGO reaches it. What is bound to LEGO is the decision layer directly
above: the state table in `states.ts`, the sort, filter and class table in
`criteria.ts`, the tints in `tint.ts`, and `badgesFor`, `stripFor`,
`captionsFor`, `isRetired`, `glyphFor` and `markFor` in `paint.ts`.

**The wall no longer draws with one loop.** `paintCommands` is still the
boundary, but two executors now sit under it: `drawScene.ts` hands cell bodies
to weasel's scene renderer (measured faster at every level), and `draw2d.ts`
draws what weasel cannot — badges, the kind strip, captions, the caret, band
labels, the category glyph and the sticker mark — on a 2D canvas stacked over
it. `toDrawCommands.ts` maps one to the other. Both executors name two LEGO
features, the sticker mark and the category glyph, plus `RETIRED_WASH`; those
become host hooks.

The Python bake is lifted — see Bakery. The LEGO there lives entirely in
`brick_icons/lab/cells.py`, which is SQL against the brick-icons schema and
stays with the host.

So this is not a rewrite. It is one new concept — a corpus schema — over tables
that brick-icons already keeps as data.

### What the tables have grown that the interface below does not carry

The `CorpusSpec` sketch predates these, and step 5 has to give each a home:

- **Derived variants.** A state marked as having a sibling generates
  `<key>Elsewhere`: the same fill, a washed-out border, thin weight, precedence
  40 lower, matched from a list of condition keys the server computes. The
  legend folds each variant into its parent's row and count.
- **Two orders.** Matching precedence is written separately from legend order.
- **Drawn versus undrawn.** An undrawn cell with a border gets a slash; a drawn
  one wears the border color as the ground behind its tile.
- **State-keyed decoration.** `outOfScope` swaps captions and badges for a
  category initial or a sticker picture.
- **Measured tints.** Linear or log scales with constants calibrated on the
  corpus, an inverse mapping for the legend's ticks, a flat tone for a missing
  value, and an 8-step ramp picked by name. A measured tint replaces the ground,
  drops the border, and swaps the legend's state rows for a scale.
- **Classes are enforced on the server too.** The stats API filters by the
  same classes in SQL; brick-icons pins the two lists together with a test
  that compares their keys (`03de725`).

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
click. Measured with `@bufbuild/cel` on Node 26, one compiled predicate over
24,591 items costs **32 ms, about 1.3 µs each** — roughly two frames. That is
fine on a filter change and far too slow during a pan, which is the whole reason
results are derived into a facts table and read as columns thereafter.

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

Every non-test file in `lab/src/corpus/`, as of `6bbc739`:

| To `wall` unchanged | To `wall`, `Cell`→`Item` | Splits | Stays in brick-icons |
|---|---|---|---|
| `clamp` `visible` `reveal` `caret` `pinch` `sheet` `svgRaster` `levels` `natural` `useVisualViewport` `cacheReport` `CacheFailureButton` `ParamsPanel` `useParams` | `grouped` `layout` `useCells` `useSheets` `useLooseThumbs` `useVectorThumbs` `badges` `BadgeSwatch` `TintScale` | `Wall` `draw2d` `drawScene` `toDrawCommands` `paint` `palette` `params` `states` `criteria` `tint` `select` `wallHash` `markShapes` `Legend` `Sidebar` `PartCard` `CorpusWall` `corpus.css` `Lightbox` `types` | `facts` `families` `years` `catalogs` `tags` `markPaths` `flag` `slotFamily` `posed` `FilterBar` `Fingerprint` `PartOrbit` `badgesPreview` `stickerCandidates` `main` |

The splits are the work. Where a split's LEGO half is not obvious:

**`paint`** keeps `paintCommands` and every geometry helper. The badge axes
(minifig, technic, duplo, printed, retired), the category glyph and the year
and family captions leave.

**`states`, `criteria`, `palette`, `params`** — the machinery (spec shapes,
precedence, variant derivation, generated CSS variables and param rows) stays;
the rows leave. Phase 1 already made every one of these read from the rows.

**`Wall`** has one LEGO hit test: clicking the "replaced" badge jumps to
`cell.successor`. **`wallHash`** is a generic hash codec with LEGO fields in it.

**`markShapes`** holds the mark shape type, path builders and punches, which
stay, and the LEGO mark set, which goes to `hooks.mark`. `markPaths` is only
three LEGO polylines and stays whole.

**`types`** is mostly `Cell` and `PartDetail`, but `SheetManifest` — which
`sheet.ts` needs — is the generic atlas shape.

**`Lightbox`** is about 90% host: catalog links, defect filing, the 3D orbit,
slot tiles. The wall keeps the modal.

Coupling the table does not show:

- **The loaders hard-code brick-icons URLs** (`/api/thumbs/...`,
  `/api/corpus/render/...`). They need a URL builder from the host; `bakery`'s
  routes are mounted at those prefixes so brick-icons' URLs can stay as they are.
- **Files marked unchanged still reach into splits.** `levels` and `useCells`
  read `DEFAULT_PARAMS`, whose color defaults come from the LEGO state rows, and
  `grouped` imports `UNKNOWN` from `facts`.
- **Other lab pages import the wall.** `lab/src/bench` uses `layout`, `paint`,
  `palette`, `useSheets`, `levels`, `visible` and all three executors;
  `lab/src/stats` uses `criteria`, `wallHash` and `facts`.
- **The weasel dependency.** `clamp`, `visible`, `reveal`, `caret`, `pinch`,
  `paint`, `drawScene` and `toDrawCommands` use `@weasel-js/core`; `Wall`,
  `Legend`, `ParamsPanel` and `CorpusWall` use `@weasel-js/labkit` (the loupe
  and panels); `CorpusWall` and `FilterBar` use `@weasel-js/ui`.

**Chrome** — the wall owns the hover card, modal, filter rail and legend,
driven by `fields`. The host supplies bodies only through `hooks.render`.

## Bakery

**Built** — `bakery/`, plan at
`docs/superpowers/plans/2026-09-13-phase-2-bakery.md`. `thumbs.py`, the per-slot
loop from `scripts/bake-thumbs.py`, and the sheet, tile and render routes from
the lab server, renamed from part to item. `bakery/README.md` is the host
contract. A test bakes the same inputs through brick-icons' `thumbs.py` and
`bakery` and requires identical bytes.

**Single writer.** Baking and composing take a lock in the slot directory and
raise rather than interleave. **A repeated id in the order is refused**, since
it would shift every later cell.

**The ground-color change was dropped.** brick-icons stopped baking a ground at
all: the bake is transparent and the wall paints the ground under every rung.
`bakery` keeps that and asserts it at the pixel.

**brick-icons does not import `bakery` yet.** A path dependency onto castleblack
would break `uv sync` on every render node without a castleblack checkout. The
private remote makes a git dependency possible, once the nodes can read it.
That is step 7.

The item feed, `/api/corpus/cells`, did not move: it becomes `derive` over the
schema in step 5.

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

1. ~~**CEL conformance spike.**~~ **Done** — `spike/cel/`, see Open below. It
   also carries the lesson that a conformance corpus only catches what someone
   thought to write down: the corpus passed both candidates, and the probe that
   separated them (`regex-probe.mjs` / `regex-probe.py`) had to be written after
   the corpus came back clean.
2. ~~**Capture paint goldens**~~ **Done** — 45 at capture, 55 now, in
   brick-icons `lab/src/corpus/goldens/`.
3. ~~**States to a table**~~ **Done** in brick-icons (Phase 1), and the sort,
   filter and class vocabulary with it.
4. ~~**Lift `bakery`**~~ **Done** — see Bakery.
5. **Lift `wall`**, host adapter written against `CorpusSpec`. Its own package
   here, depending on weasel.
6. **Demo host**, and the leak check that `wall`'s suite names nothing LEGO.
7. **brick-icons switches** to consuming both by path, deletes its copy.

## Open

**Where `wall` sits relative to weasel: decided 2026-09-13 — a separate package
in castleblack**, depending on `@weasel-js/core`, `labkit` and `ui` from npm. It
owns both executors, and the demo host's leak check runs here. Folding it into
weasel was weighed and turned down. What follows from that: brick-icons installs
`wall` and `bakery` from castleblack's private GitHub repo, so its render nodes
need read access to it before step 7 — and any renderer feature the 2D overlay covers
today lands as a weasel release that `wall` then picks up.

**Name.** `castleblack` for now; `yumyulack` is the alternative, recorded under
the README title. Deciding it late costs a directory rename and an import path
sweep.

**CEL implementation: settled — `@bufbuild/cel`.** Not on the expression corpus,
which failed to separate the candidates: both JS implementations agreed with
`cel-python` on 105 of 108 cells. It was settled on the regex engine.
`cel-python` and `@bufbuild/cel` both use RE2; `@marcbachmann/cel-js` hands the
pattern to JavaScript's `RegExp`, and the two diverge in both directions —
`(?i)brick` works under RE2 and throws under `RegExp`, while `^(?!_).*` is a
valid JS lookahead that RE2 rejects. A pattern that works in the browser and
throws in the feed is exactly the failure the shared schema exists to prevent,
and it surfaces only when someone writes that pattern. The cost of the choice is
real and worth stating: `@bufbuild/cel` is ~4x slower per evaluation and pulls
10.6 MB of dependencies against 272 KB and none, which will matter if the wall's
bundle size ever binds.

**Two expressions need host support, neither of them a TypeScript hook.**
`lowerAscii` is a CEL string extension rather than core: `@bufbuild/cel` has it
via the `strings` bundle from `@bufbuild/cel/ext`, and `cel-python` needs it
registered as a host function (`env.program(ast, functions={...})`, verified to
return the same string). Reading a field an item omits errors identically in all
three, and `has()`-guarding returns `false` in all three — so that is a
schema-authoring rule, not code.

**Timing.** The earlier writeup argued for waiting until the census stops
landing renders, on the grounds that the wall is the instrument being used to
watch it. That argument has not been retired — step 3 is a live edit to a live
instrument, and the goldens in step 2 are what make it survivable. The week
after Phase 1 landed, brick-icons committed to `lab/src/corpus/` every day, so
lifting `wall` means lifting a moving target.
