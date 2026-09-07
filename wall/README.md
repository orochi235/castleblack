# The wall, as its own thing

**Nothing here is built.** This is a writeup of what it would take to pull the
corpus wall out of `brick-icons` and make the LEGO corpus one instance of it,
written the day the wall grew tags, badges and per-slot state. It is for
whoever picks the extraction up — including me in a month — and it assumes you
have used the wall.

## What the wall actually is

A pan/zoom canvas showing tens of thousands of items as one cell each, drawn
from a mip chain of baked sprites, with a live status color per cell and a
detail view behind a click. Nothing in that sentence is about LEGO.

The parts worth keeping are the ones that were expensive to get right:

- **The mip chain.** Two sprite sheets (8px, 32px), loose PNGs at 128px, and
  live vector past that, with hysteresis on the level so a zoom parked on a
  boundary does not thrash. Residency is a pixel budget, not a cell count.
- **The bake.** SVG in, per-level PNGs and one atlas page per level out,
  freshness keyed on a content sha, sidecars written atomically because two
  bakes at once silently ate 5,000 entries the first time it happened.
- **Paint as data.** `paintCommands` decides what every visible cell shows —
  sprite or image or fill, border, slash, shape, corner badges, a label, a
  wash — and the canvas renderer only draws it. Every decision is testable
  without a rendering context, which is why the state rules have tests at all.
- **Everything around the grid**: keyboard caret with reveal-on-move, hover
  card, modal detail, loupe, legend with live tallies, filters, sorts,
  hidden-class checkboxes, and a params panel that tunes color and feel at
  runtime and persists it.

## What is LEGO, and has to leave

- Part ids, the LDraw library, its category sigils (`~`, `=`, `_`, `|`) and
  its `~Moved to` redirects.
- The scope rule (stickers), the tag rules (retired, popular, obscure) and the
  Rebrickable years and set counts they read.
- Slots as engine×style, `extra_d99` and `secs` as the metrics, defects, and
  the census that produces all of it.

## The seam

A host provides four things:

1. **Items.** An ordered list with a stable id, an index, a title, and a
   content sha per slot. The index is load-bearing: it is the cell's position
   in the atlas, and the bake and the item feed must derive it the same way or
   every sprite lands one cell off.
2. **Slots.** Named variants of the same corpus — engines here, but anything
   that draws the same items differently. Every thumbnail, metric and detail
   is per slot.
3. **A state vocabulary.** An ordered list of states, each with a fill, an
   optional border and weight, a label, and a predicate over an item. The
   wall's precedence chain — out of scope, then live faults here, then
   accepted ones, then trouble elsewhere — is *policy*, not machinery, and it
   is exactly what a second host would want to write itself.
4. **Renderables.** Whatever produces an SVG (or a raster) per item per slot,
   plus the URL the vector rung can fetch one from.

Two packages fall out of that:

- **`wall`** (TypeScript): the canvas, the hooks, the layout, the level
  chain, the chrome. Knows about items, slots and states in the abstract, and
  nothing else. React, canvas 2D, no domain types.
- **`bakery`** (Python): rasterize, square, compose atlases, serve them and
  the item feed. This is the half people underestimate — resvg invocation,
  letterboxing, gutters and edge replication, sha freshness, atomic sidecars,
  and the endpoints the wall polls.

`brick-icons` stays the first host and keeps its census, its tags and its
state table.

## What will bite

- **The atlas index invariant.** Cell index = position in the full corpus
  order, shared by the baker and the feed. Anything that filters items must
  filter the *view*, never the index — which is why `~Moved` redirects are
  hidden in the front end rather than dropped from the parts table.
- **The staleness channel.** A sheet manifest carries the sha each cell was
  baked from, and the wall compares it to the item's current sha. That is also
  how a lost sidecar entry turns into a blank cell, so it needs to be a
  designed contract in a library, not an accident.
- **State precedence is not generic.** Ship the mechanism and an example
  table; do not try to ship the table.
- **Two-language constants.** The bake's ground color and the canvas's have to
  agree; today a test reads the TypeScript from Python to pin it. A library
  should pass it in one direction instead — the bake declares it, the feed
  reports it.
- **Concurrency.** Two bakers over one output directory corrupt it. Either
  lock, or make the runner the only writer.

## Doing it

Not while the census is still landing renders — the wall is the instrument
being used to watch it, and an extraction is a week of breakage in exactly the
thing that shows you whether anything broke. After it settles: lift `wall`
first with `brick-icons` as its only consumer, keep the API surface honest by
resisting a second host until the first one is boring, then lift `bakery`.

A good second host is the test: something with tens of thousands of items,
several renderings of each, and a per-item verdict worth coloring. If nothing
like that exists, the extraction is speculative and the wall should stay where
it is.
