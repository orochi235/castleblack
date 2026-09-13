# wall

A pan/zoom wall over tens of thousands of items: which state each item is in,
which items are on the wall and in what order, what color each cell is, how a
frame is drawn, where the pictures come from, and the React page around it all.
It knows nothing about what the items are.

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
- **Badges**: art per tag, in a corner or the strip, with the mark art in
  `marks`. A badge can yield to a caption, and drops wherever that caption is
  drawn. Only a top-right caption moves aside for a corner badge.
- **Tints**: TypeScript functions placing an item on a ramp.

For the page, `WallView` also takes the item and slot fetchers, a `SlotUrls`
(`defaultUrls('/api')` matches `bakery`'s routes), groupings, a facet for the
sidebar, and render props for the card and the detail view.

## Rules a spec has to follow

- **Items carry `index`, and the indices are exactly `0..n-1`.** An item's cell
  on every sheet is its index. `derive` throws on a repeat or a gap.
- **Guard optional fields with `has()`.** Reading a field an item lacks is an
  error in CEL; the wall reads it as `false` or `null` and warns once per
  expression.
- **Compile once.** `compile(spec)` reports every bad expression and every
  missing hook together, and throws `SpecError`. `WallView` shows the list in
  place of the wall.
- **Pass stable fetchers and URLs.** The loaders refetch when they change.

## Use

The whole page:

```tsx
<WallView title="things" spec={spec} urls={defaultUrls('/api')}
          fetchItems={fetchItems} fetchSlots={fetchSlots} storageKey="things.params"
          renderCard={(item) => <Card item={item} />} />
```

The pieces, for a host that builds its own page:

```ts
const compiled = compile(spec);
const facts = derive(compiled, items);            // once per load; rederive() for a delta
const order = applySelection(compiled, facts, selection);
const commands = paintCommands({ compiled, facts, order, rects, visible, cam, manifest,
                                 palette: defaultPalette(compiled.states) });
```

`Wall` draws those commands on a canvas and handles pan, pinch, keyboard and
clicks; `useItems`, `useSheets`, `useLooseThumbs` and `useVectorThumbs` load
what it draws; `Legend`, `Sidebar`, `ItemCard` and `ParamsPanel` are the chrome.
CSS classes are `wall-*`; colors can be overridden with custom properties under
`--wall`.

## Develop

```bash
npm install          # at the castleblack root
npx vitest run       # in wall/
npx tsc --noEmit
```

`test/leak.test.ts` fails if a host's vocabulary appears anywhere in the
package. `hosts/brick-icons/` proves brick-icons' spec draws what brick-icons
drew; `hosts/demo/` is a working page.
