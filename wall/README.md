# wall

The decision layer and geometry of a pan/zoom wall over tens of thousands of
items: which state each item is in, which items are on the wall and in what
order, what color each cell is, and the list of draw commands for a frame. It
knows nothing about what the items are.

The React component, the canvas executors, the loaders and the chrome are not
here yet — see the spec's order of work, step 5b.

## What a host supplies

A `CorpusSpec` (`src/schema.ts`):

- **States**, each with a CEL `match`, colors, weight, shape and precedence.
  The first to hold by precedence is the item's state; the last one matched is
  the catch-all, and a dimmed cell wears it. A state can name **variants** —
  the same condition holding somewhere else — which the wall generates.
- **Filters, classes and sorts**, as CEL. A sort value of `null` sorts last in
  both directions.
- **Tags** (a CEL list) and the **axes** they are picked along: alternatives
  within an axis, narrowing across axes.
- **Facets, captions, glyph and mark** — display projections, as CEL or as a
  named TypeScript hook.
- **Badges**: art per tag, in a corner or the strip. A badge can yield to a
  caption, and drops wherever that caption is drawn.
- **Tints**: TypeScript functions placing an item on a ramp.

## Rules a spec has to follow

- **Items carry `index`, and the indices are exactly `0..n-1`.** An item's cell
  on every sheet is its index. `derive` throws on a repeat or a gap.
- **Guard optional fields with `has()`.** Reading a field an item lacks is an
  error in CEL; the wall reads it as `false` or `null` and warns once per
  expression, so a missing guard shows up as one console line rather than a
  wrong wall.
- **Compile once.** `compile(spec)` reports every bad expression and every
  missing hook together, and throws `SpecError`.

## Use

```ts
import { applySelection, compile, defaultPalette, derive, gridLayout, paintCommands } from '@castleblack/wall';

const compiled = compile(spec);
const facts = derive(compiled, items);            // once per load; rederive() for a delta
const order = applySelection(compiled, facts, selection);
const { rects } = gridLayout(order, { cell: 32, gap: 4, cols: 120 });
const commands = paintCommands({ compiled, facts, order, rects, visible, cam, manifest,
                                 palette: defaultPalette(compiled.states) });
```

## Develop

```bash
npm install          # at the castleblack root
npx vitest run       # in wall/
npx tsc --noEmit
```

`test/leak.test.ts` fails if a host's vocabulary appears anywhere in the
package. The first host, and the tests proving it draws what brick-icons drew,
are in `hosts/brick-icons/`.
