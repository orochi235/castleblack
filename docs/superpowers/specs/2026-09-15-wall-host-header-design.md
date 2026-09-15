# Host controls in WallView's header

**Status: pezlie side built 2026-09-15; brick-icons side not yet.**

This is the design for letting a host put its own slot picker and item search
in `WallView`'s header. It is for whoever implements it, and assumes the
`wall/` package and `wall/README.md`'s host contract.

The first host that needs it is brick-icons. Its `/wall` page draws the corpus
through `WallView`, but it lacks two controls the older `/corpus` page has:
- a slot picker split into an engine toggle and a style dropdown (`FilterBar`)
- a part search that flies to the part (`PartSearch`)

`WallView` today draws its own single `<select>` of slots, and `header` only
appends controls after it. Nothing lets a host change the slot or move the
camera.

## Decisions

**The slot picker's engine × style split stays in brick-icons.** The emoji and
unicode hosts have one slot each, so a multi-axis picker in the library would
be shaped by one host. If a second host needs one, `FilterBar` can move into
`wall` behind the API below without breaking anyone.

**`WallView` keeps its state.** A host reads and drives the slot and camera
through a function passed to `header`, not through controlled props or a ref.
That matches the existing rule: a host starts `WallView` with `initial` and
follows it with `onChange`.

## The pezlie side

Two props on `WallViewProps`. `WallHeader` is exported from `index.ts`.

```ts
header?: ReactNode | ((wall: WallHeader) => ReactNode);
/** Default true. False drops the built-in slot <select>. */
slotPicker?: boolean;

export interface WallHeader {
  slots: { slot: string; n: number }[];
  slot: string;
  setSlot: (slot: string) => void;
  reveal: (id: string) => 'shown' | 'filtered' | 'absent';
}
```

A plain node renders as today. A function renders in the same place: after the
slot picker when there is one, before Legend and Cache failure.

`reveal(id)` acts on the slot being drawn:

- **`absent`:** `rowOfId` finds no row, or the items have not loaded yet.
- **`filtered`:** the row exists but is not in the current layout's order.
- **`shown`:** the camera animates to `centerReveal(rect, cam, size, 0.5)`,
  zooming until the cell fills at least half the viewport's height. The
  position becomes the explicit caret, and the item's card opens at the
  viewport's center. The move counts as the reader touching the camera, so a
  later regroup does not refit the wall.

`0.5` is the value brick-icons' `/corpus` search uses today
(`JUMP_MIN_CELL_HEIGHT`).

Tests, in `wall/test/WallView.test.tsx`:

- a `header` function receives the slots and the current slot, and its `setSlot` changes the slot
- `slotPicker={false}` renders no `<select>`
- `reveal` answers `absent`, `filtered` and `shown`, and `shown` opens the card

`wall/README.md` gets a sentence on both props in its `WallView` paragraph.

## The brick-icons side

`lab/src/wall/BrickWall.tsx` passes `slotPicker={false}`, and a `header`
function rendering:

- `FilterBar`, with `sources` mapped from `wall.slots`, `source={wall.slot}` and `onSource={wall.setSlot}`
- `PartSearch`, whose `onOpen` calls `wall.reveal(id)`
- a status notice held in `BrickWall`: "`<id>` is hidden by the current filter"
  for `filtered`, "`<id>` is not drawn in this slot" for `absent`, cleared on
  `shown`

`FilterBar` and `PartSearch` are used unchanged. `/corpus` stays as it is.

`lab/package.json` moves pezlie's pin from `9127ab7` to the commit that lands
the pezlie side. That brings in the commits between, which add `compact`,
`mode`, `paramDefaults`, tiles and the WebGL cell bodies. The test for
`BrickWall` renders it against a stub client, and checks that the engine
toggle is present and that a search for a part not in the slot shows the notice.
The notice's wording is its own small function with its own test.

## Order and verification

1. pezlie, on `main`: the props, their tests and the README. Commit and push.
2. brick-icons, in its own worktree: the pin, `BrickWall` and its test. Run
   only the tests for the files touched.
3. Load `/wall` headless from that worktree's dev server. Check that:
   - the engine toggle and style dropdown replace the `slot` select
   - switching engine changes the slot
   - a search opens a drawn part and reports a filtered one

   Post a labeled before/after of the header to the slopboard wall.
