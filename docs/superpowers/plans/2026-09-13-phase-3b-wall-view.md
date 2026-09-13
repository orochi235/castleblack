# Phase 3b: the wall on screen, and a demo host — Implementation Plan

> **BUILT — 2026-09-13**, branch `phase-3b-wall-view` fast-forwarded to `main`. See "What it
> found" at the foot.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** everything between `paintCommands` and a working page — drawing, loading, the `Wall` component, its chrome, and a `WallView` shell — in `wall/`, driven by any `CorpusSpec`; proven end to end by a demo host whose corpus is generated, baked by `bakery`, served by FastAPI and drawn in a browser.

**Architecture:** Five layers, each consuming the last. Drawing and loading are split out of brick-icons' `lab/src/corpus/` with every brick-icons name replaced by something the host passes in. `WallView` is `CorpusWall.tsx` with the LEGO taken out: a host gives it a spec, a `SlotUrls`, an item fetcher, a slot list, layouts to group by, and render props for the card and the detail view.

**Tech Stack:** React 19, `@weasel-js/core`/`labkit`/`ui` 1.4.4, Vitest with jsdom for components, Vite for the demo page, FastAPI and `bakery` for the demo server.

**Read against:** brick-icons `main` at `fa91c59` (2026-09-13); `lab/src/corpus/` unchanged since `f3ca333`.

---

## Contracts every layer shares

- **`marks.ts`** — `Paint`, `MarkShape`, `FIELD_R`, `punches(marks, name)`. Mark art is host data: `CorpusSpec.marks: Record<string, MarkShape[]>`.
- **`urls.ts`** — `SlotUrls { manifest(slot, level); sheet(slot, level, version?); tile(slot, level, id); render(slot, id) }`. `bakery`'s routes answer the defaults `defaultUrls('/api')`.
- **`DrawOptions`** — `{ marks, drawMark?, washColor, offset? }`, passed to both executors. `drawMark(ctx, name, cx, cy, r)` draws a quiet cell's mark; without it a mark is drawn from `marks`.
- **CSS** — class prefix `wall-`, custom properties under `--wall`. brick-icons keeps `corpus-` until step 7 passes its own root.

## Layers and who builds them

| layer | files (in `wall/src/`) | from brick-icons | builder |
|---|---|---|---|
| draw | `marks`, `badgeDraw`, `draw2d`, `toDrawCommands`, `drawScene` | `markShapes` (types only), `badges`, `draw2d`, `toDrawCommands`, `drawScene` | agent A |
| load | `urls`, `svgRaster`, `useSheets`, `useLooseThumbs`, `useVectorThumbs`, `useItems`, `useVisualViewport`, `cacheReport`, `CacheFailureButton` | same names; `useCells` → `useItems` | agent B |
| chrome | `params`, `useParams`, `ParamsPanel`, `BadgeSwatch`, `TintScale`, `Legend`, `Sidebar`, `ItemCard` | same; `PartCard` → `ItemCard` | agent C |
| view | `Wall.tsx`, `WallView.tsx` | `Wall.tsx`, `CorpusWall.tsx` | lead, after A–C |
| demo | `hosts/demo/` | new | agent E, in parallel |

Each agent ports the brick-icons tests for its files, rewritten against neutral fixtures, and adds tests for every generalization it makes. `wall/test/leak.test.ts` covers `.ts`, `.tsx` and `.css`.

## What changes on the way over

- `CellBadge` → `Badge`; `MARK_SHAPES` → `marks` passed in; `drawSticker` → `drawMark`; `RETIRED_WASH` → `washColor`; `'sticker mark'`/`'category glyph'` → `'mark'`/`'glyph'`.
- `LabClient` → `SlotUrls` plus `fetchItems(slot, since?) → { items, version }`.
- `Wall`: `onPick`/`onOpen` report rows; the one linked badge becomes `linkTarget(row, tag) → row | null` over `linkedBadges`.
- `Legend`: state rows from `compiled.states`, tag rows from `spec.tagAxes` and `spec.badges`, scale from `TintDef`.
- `Sidebar`: sorts, filters, classes and tints from the spec; groupings and facet grouping from props.
- `ItemCard`: the body is a render prop; the wall owns placement, dismissal and hover.
- `params`: color rows generated from `compiled.states`; storage key from props.
- `WallView`: slot polling, the sheet/items pairing that keeps a slot change from blanking, selection, grouping, camera fit and clamp, level picking, the three image rungs, legend, sidebar, card, stale notice, cache report. No hash codec: `initial` and `onChange` let a host keep its own.

## The demo host — `hosts/demo/`

- `make.py` — generates N items across two slots as SVG (deterministic shapes and colors from the id), some undrawn, some failing, some slow; bakes each slot with `bakery.batch.bake_slot`; writes `out/items-<slot>.json`.
- `server.py` — FastAPI: `bakery` routes at `/api/thumbs` and `/api/corpus/render`, `/api/slots`, `/api/items/{slot}`.
- `src/spec.ts` — a `CorpusSpec` with its own states, a variant, tags, badges with marks, a tint.
- `index.html`, `src/main.tsx`, `vite.config.ts` — `WallView` against the server.
- Tests: the Python side asserts the feed's indices match the order `bake_slot` composed with; the TS side compiles the spec and renders `WallView` in jsdom against a fake fetcher.

## Verification

- Every ported test green; `tsc` clean in `wall` and both hosts; leak test green.
- brick-icons parity (goldens, differential) still green — nothing in 3b may change `paintCommands`.
- The demo page loads in a headless browser: cells draw from sheets, zoom reaches loose tiles and vectors, legend and sidebar work. Screenshots at three zoom levels.

## What this phase does not do

- brick-icons does not consume `WallView` (step 7), so its lightbox, search, filter bar and hash codec stay there.

## What it found

**The demo runs in a browser.** In headless Chromium at 1400×900, the fitted
wall drew all 3,000 items from the sheets, with state colors, marks and the
legend's counts adding up to 3,000. Zooming in loaded 128px tiles once cells
passed about 96px and SVG renders past about 192px; a click opened the card; a
slot change showed "still showing outline while filled loads" for 283 ms.

**The stale-sheet warning counted undrawn items as missing tiles** — 384 of
3,000 on the demo, enough to trip it on every load. brick-icons' `staleCount`
does the same. A tile is now missing only for an item with a sha.

**Only a top-right caption makes room for a corner badge.** A top-left badge
sits on a top-left caption, as it does in brick-icons. The demo puts its badge
top-right; a host with a top-left badge and a top-left caption will see the
overlap.
