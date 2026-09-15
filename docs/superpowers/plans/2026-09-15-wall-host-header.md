# Host controls in WallView's header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: written 2026-09-15, not started.**

**Goal:** Let a `WallView` host draw its own slot picker and item search in the header. Use it to put brick-icons' `FilterBar` and `PartSearch` on `/wall`.

**Architecture:** pezlie's `WallView` accepts `header` as a function of a `WallHeader` object, with the slots, the slot, `setSlot` and `reveal(id)`. `slotPicker={false}` drops the built-in `<select>`. brick-icons' `BrickWall` renders its existing controls through that function. Spec: `docs/superpowers/specs/2026-09-15-wall-host-header-design.md`.

**Tech Stack:** React 19, TypeScript, vitest + Testing Library (jsdom), weasel-js. brick-icons pins pezlie as a git dependency by commit.

**Repos:** Tasks 1–3 are in `~/src/pezlie`, on `main`. Tasks 4–7 are in a brick-icons worktree. The main checkout at `~/src/brick-icons` is shared by several sessions, so never edit there.

---

### Task 1: `slotPicker` and a function `header`

**Files:**
- Modify: `wall/src/WallView.tsx` (props interface near line 76, destructure at 144–148, header JSX at 435–447)
- Test: `wall/test/WallView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `wall/test/WallView.test.tsx`, and add `act` to the Testing Library import on line 1. Add `import type { WallHeader } from '../src/WallView';` below the `WallView` import.

```tsx
it('hands a header function the slots, and lets it change the slot', async () => {
  let wall: WallHeader | undefined;
  const { fetchItems } = mount({
    defaultSlot: 'north',
    fetchSlots: vi.fn(() => Promise.resolve([{ slot: 'north', n: 3 }, { slot: 'south', n: 1 }])),
    header: (w) => { wall = w; return <span>on {w.slot} of {w.slots.length}</span>; },
  });
  await screen.findByText('on north of 2');
  act(() => wall!.setSlot('south'));
  await waitFor(() => expect(fetchItems).toHaveBeenCalledWith('south', undefined));
});

it('still renders a plain header node', async () => {
  mount({ defaultSlot: 'north', header: <span>extra</span> });
  expect(await screen.findByText('extra')).toBeTruthy();
});

// By class: the label's text also holds every option's, so no label query matches it.
it('draws its own slot picker by default', async () => {
  mount({ defaultSlot: 'north' });
  await waitFor(() => expect(document.querySelector('.wall-slot select')).toBeTruthy());
});

it('draws no slot picker when the host takes it over', async () => {
  const { fetchSlots } = mount({ defaultSlot: 'north', slotPicker: false });
  await waitFor(() => expect(fetchSlots).toHaveBeenCalled());
  await screen.findByText('warning');
  expect(document.querySelector('.wall-slot')).toBeNull();
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `cd ~/src/pezlie/wall && npx vitest run test/WallView.test.tsx`
Expected: FAIL. TypeScript reports no export named `WallHeader`. At runtime the function header renders nothing, and `draws no slot picker` still finds `.wall-slot`.

- [ ] **Step 3: Implement**

In `wall/src/WallView.tsx`, replace the `header` prop (lines 75–76):

```tsx
  /** Controls between the slot picker and the panels toggle. A function gets
   *  the slot state and `reveal`, for a host drawing its own picker or search. */
  header?: ReactNode | ((wall: WallHeader) => ReactNode);
  /** False drops the built-in slot select, for a host that draws its own. */
  slotPicker?: boolean;
```

Add above `export interface WallViewState`:

```tsx
/** What `reveal` found: drawn and now centered, loaded but hidden by the
 *  selection, or not in the drawn slot at all. */
export type RevealResult = 'shown' | 'filtered' | 'absent';

/** The slot state a host's header controls read and drive. */
export interface WallHeader {
  slots: { slot: string; n: number }[];
  slot: string;
  setSlot: (slot: string) => void;
  reveal: (id: string) => RevealResult;
}
```

Add `slotPicker = true` to the destructure at line 147, after `paramDefaults`.

Replace lines 437–447 (the `slots.length > 0 && (...)` block and `{header}`) with:

```tsx
                  {slotPicker && slots.length > 0 && (
                    <label className="wall-slot">
                      <span>slot</span>
                      <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                        {slots.map((s) => (
                          <option key={s.slot} value={s.slot}>{s.slot} ({s.n.toLocaleString()})</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {typeof header === 'function' ? header({ slots, slot, setSlot, reveal }) : header}
```

Task 2 defines `reveal`. For this task alone, add a stub just above the `return (` at line 433, and Task 2 replaces it:

```tsx
  const reveal = (_id: string): RevealResult => 'absent';
```

- [ ] **Step 4: Run them and check they pass**

Run: `cd ~/src/pezlie/wall && npx vitest run test/WallView.test.tsx`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/src/pezlie
git add wall/src/WallView.tsx wall/test/WallView.test.tsx
git commit -m "let a WallView host take over the slot picker through a header function"
```

---

### Task 2: `reveal`

**Files:**
- Modify: `wall/src/WallView.tsx` (imports at lines 13–16, the stub from Task 1)
- Test: `wall/test/WallView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append:

```tsx
async function mountRevealing(overrides: Partial<Parameters<typeof WallView<Thing>>[0]> = {}) {
  let wall: WallHeader | undefined;
  const out = mount({
    defaultSlot: 'north',
    renderCard: (item) => <span>card {item.id}</span>,
    header: (w) => { wall = w; return null; },
    ...overrides,
  });
  await screen.findByText('warning');
  return { ...out, reveal: (id: string) => { let r = ''; act(() => { r = wall!.reveal(id); }); return r; } };
}

it('reveals a drawn item and opens its card', async () => {
  const { reveal } = await mountRevealing();
  expect(reveal('b')).toBe('shown');
  expect(await screen.findByText('card b')).toBeTruthy();
});

it('says an id is absent when the drawn slot has no such item', async () => {
  const { reveal } = await mountRevealing();
  expect(reveal('nope')).toBe('absent');
  expect(screen.queryByText(/^card /)).toBeNull();
});

it('says an item is filtered when the selection hides it', async () => {
  const withUndrawn = [...items, thing('d', 3, { sha: null })];
  const { reveal } = await mountRevealing({
    fetchItems: vi.fn(() => Promise.resolve({ items: withUndrawn, version: 'v1' })),
    initial: { selection: { filter: 'drawn' } },
  });
  expect(reveal('d')).toBe('filtered');
  expect(reveal('a')).toBe('shown');
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `cd ~/src/pezlie/wall && npx vitest run test/WallView.test.tsx`
Expected: FAIL on `reveals a drawn item` and `filtered`, because the stub answers `absent`.

- [ ] **Step 3: Implement**

Extend the imports:

```tsx
import { gridLayout, rectAt, visibleCount, visiblePositions, type Layout } from './layout';
import { centerReveal } from './reveal';
```

Add below `MAX_THUMB_CELLS` near line 46:

```tsx
/** How much of the viewport's height a revealed cell fills at least. A search
 *  hit landing on a 32px cell in a wall of tens of thousands lands nowhere. */
const REVEAL_MIN_HEIGHT = 0.5;
```

Replace the Task 1 stub with:

```tsx
  // What a host's search calls. The caret and card follow the pointer's own
  // path; the camera move counts as the reader's, so a regroup keeps it.
  const reveal = (id: string): RevealResult => {
    if (!facts) return 'absent';
    const row = rowOfId(facts, id);
    if (row === undefined) return 'absent';
    const position = laid.order.indexOf(row);
    if (position < 0) return 'filtered';
    const rect = rectAt(laid, position);
    if (rect && cam) {
      touched.current = true;
      camAnim.animate(centerReveal(rect, cam, size, REVEAL_MIN_HEIGHT));
    }
    setExplicitCaret(position);
    setCarded({ id, row, at: { x: size.width / 2, y: size.height / 2 } });
    return 'shown';
  };
```

Delete the `void camAnim;` line after `const camAnim = useViewAnimation(...)`, since `reveal` now uses it.

- [ ] **Step 4: Run them and check they pass**

Run: `cd ~/src/pezlie/wall && npx vitest run test/WallView.test.tsx && npm run typecheck`
Expected: PASS, all 12 tests; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
cd ~/src/pezlie
git add wall/src/WallView.tsx wall/test/WallView.test.tsx
git commit -m "add reveal(id) to WallView's header, for a host's search"
```

---

### Task 3: Document and publish the pezlie side

**Files:**
- Modify: `wall/README.md` (the `WallView` paragraph, lines 37–41)
- Modify: `docs/superpowers/specs/2026-09-15-wall-host-header-design.md` (status line)

- [ ] **Step 1: Add to the README paragraph**

After the sentence ending `paramDefaults` sets what a first visit starts from.`, add:

```markdown
`header` takes controls for the top bar, or a function of `WallHeader` — the
slots, the current slot, `setSlot` and `reveal(id)` — for a host drawing its
own slot picker or search; `slotPicker={false}` drops the built-in one.
`reveal` centers a drawn item and opens its card, and answers `'filtered'` or
`'absent'` when it cannot.
```

- [ ] **Step 2: Mark the spec's pezlie half built**

Change the status line to:

```markdown
**Status: pezlie side built 2026-09-15; brick-icons side not yet.**
```

- [ ] **Step 3: Commit and push**

```bash
cd ~/src/pezlie
git add wall/README.md docs/superpowers/specs/2026-09-15-wall-host-header-design.md
git commit -m "document WallView's header function and slotPicker"
git push origin main
git rev-parse HEAD
```

Expected: the push succeeds. Keep the printed sha, since Task 4 pins it.

---

### Task 4: brick-icons worktree and the new pin

**Files:**
- Modify: `lab/package.json`, `lab/package-lock.json`

- [ ] **Step 1: Create the worktree and move the session into it**

```bash
cd ~/src/brick-icons
git worktree add .claude/worktrees/wall-header -b wall-header main
```

Then call `EnterWorktree` with path `/Users/mike/src/brick-icons/.claude/worktrees/wall-header`, and say in chat that the session moved.

- [ ] **Step 2: Install, then pin pezlie at Task 3's sha**

```bash
cd lab
npm install
npm install "pezlie@github:orochi235/pezlie#<sha from Task 3>"
grep -n pezlie package.json
```

Expected: `"pezlie": "github:orochi235/pezlie#<sha>"`.

- [ ] **Step 3: Run the wall's existing tests on the new pin**

Run: `npx vitest run src/wall`
Expected: PASS (`hash.test.ts`, `host.test.ts`). A failure here comes from the 15 pezlie commits since `9127ab7`, not this work. Stop and report it.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "pin pezlie at <short sha>, which lets the host draw the header's slot picker"
```

---

### Task 5: The search notice's wording

**Files:**
- Create: `lab/src/wall/searchNotice.ts`
- Test: `lab/src/wall/searchNotice.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest';
import { searchNotice } from '@lab/wall/searchNotice';

it('says why a searched part did not open, and nothing when it did', () => {
  expect(searchNotice('3001', 'shown')).toBeNull();
  expect(searchNotice('3001', 'filtered')).toBe('3001 is hidden by the current filter');
  expect(searchNotice('3001', 'absent')).toBe('3001 is not drawn in this slot');
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd lab && npx vitest run src/wall/searchNotice.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import type { RevealResult } from '@pezlie/wall/src/WallView';

/** `/corpus`'s wording, so the two pages say the same thing. */
export function searchNotice(part: string, result: RevealResult): string | null {
  if (result === 'filtered') return `${part} is hidden by the current filter`;
  if (result === 'absent') return `${part} is not drawn in this slot`;
  return null;
}
```

- [ ] **Step 4: Run it and check it passes**

Run: `npx vitest run src/wall/searchNotice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/searchNotice.ts src/wall/searchNotice.test.ts
git commit -m "word a wall search's miss the way the corpus page does"
```

---

### Task 6: `BrickWall` draws `FilterBar` and `PartSearch`

**Files:**
- Modify: `lab/src/wall/BrickWall.tsx`
- Test: `lab/src/wall/BrickWall.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrickWall } from '@lab/wall/BrickWall';

// The real search is an async ComboBox; the wiring under test is what its
// commit does, so a button stands in for it.
vi.mock('@lab/shared/PartSearch', () => ({
  PartSearch: ({ onOpen }: { onOpen: (part: string) => void }) => (
    <button type="button" onClick={() => onOpen('nope')}>search</button>
  ),
}));

const client = {
  corpusSources: () => Promise.resolve({
    sources: [{ source: 'occt', n: 0 }, { source: 'silhouette-occt', n: 0 },
              { source: 'naive', n: 0 }],
  }),
  cells: () => Promise.resolve({ cells: [], count: 0, version: 'v1', source: 'occt' }),
  corpusPart: () => new Promise(() => {}),
  searchParts: () => Promise.resolve([]),
} as any;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('puts the engine toggle where pezlie drew its slot select', async () => {
  render(<BrickWall client={client} />);
  expect(await screen.findByRole('radio', { name: 'Engine' })).toBeTruthy();
  expect(document.querySelector('.wall-slot')).toBeNull();
});

it('says when a searched part is not in the slot', async () => {
  render(<BrickWall client={client} />);
  fireEvent.click(await screen.findByRole('button', { name: 'search' }));
  expect(await screen.findByText('nope is not drawn in this slot')).toBeTruthy();
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd lab && npx vitest run src/wall/BrickWall.test.tsx`
Expected: FAIL. No `Engine` radio exists, pezlie's `slot` select is still there, and no search button is rendered.

- [ ] **Step 3: Implement**

In `lab/src/wall/BrickWall.tsx`, change the first import line and add the new imports:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WallView, type WallHeader, type WallViewState } from '@pezlie/wall/src/WallView';
import '@lab/corpus/corpus.css';
import { FilterBar } from '@lab/corpus/FilterBar';
import { PartSearch } from '@lab/shared/PartSearch';
import { searchNotice } from '@lab/wall/searchNotice';
```

Replace the existing `WallView` import line with the one above, and keep every other import. Inside `BrickWall`, after `onChange`, add:

```tsx
  const [notice, setNotice] = useState<string | null>(null);
  const header = useCallback((wall: WallHeader) => (
    <>
      <FilterBar sources={wall.slots.map(({ slot, n }) => ({ source: slot, n }))}
                 source={wall.slot} onSource={wall.setSlot} />
      <PartSearch client={client} onOpen={(part) => setNotice(searchNotice(part, wall.reveal(part)))} />
      {notice && <span className="corpus-search-notice" role="status">{notice}</span>}
    </>
  ), [client, notice]);
```

Add two props to the `<WallView ...>` element, after `onChange={onChange}`:

```tsx
              slotPicker={false} header={header}
```

- [ ] **Step 4: Run it and check it passes**

Run: `npx vitest run src/wall && npm run typecheck`
Expected: PASS for all `src/wall` tests; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/wall/BrickWall.tsx src/wall/BrickWall.test.tsx
git commit -m "draw the corpus page's engine toggle and part search on /wall"
```

---

### Task 7: Check the page, and post the before/after

- [ ] **Step 1: Start this worktree's dev server on its own port**

Run in the background, so the processes panel can see it:

```bash
cd ~/src/brick-icons/.claude/worktrees/wall-header/lab
npm run dev -- --port 5190
```

It proxies `/api` to the shared lab API on 8792. If `curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8792/api/defects?status=open'` is not 200, start the API from the main checkout: `.venv/bin/python -m brick_icons.lab --port 8792`.

- [ ] **Step 2: Screenshot before and after**

With the headless playwright MCP:
- **Before:** open `http://localhost:5178/wall` (the main checkout's server, still on the old pin) and save a viewport screenshot to `.playwright-mcp/wall-header-before.png`.
- **After:** open `http://localhost:5190/wall` and save `.playwright-mcp/wall-header-after.png`.

- [ ] **Step 3: Drive the after page**

On `http://localhost:5190/wall`:
1. Click the `Legacy` radio. The style dropdown now lists the naive facets, and the URL hash changes to a naive slot.
2. Type `3001` in the search and press Enter. A card for 3001 opens mid-screen.
3. Pick `filter: drawn` in the sidebar if the slot has undrawn parts, search one of them, and check the notice says it is hidden.

Check for console errors (the playwright console messages tool at level `error`). Only the `favicon.ico` 404 is expected.

- [ ] **Step 4: Post a labeled pair to the slopboard wall**

```bash
cd ~/src/brick-icons/.claude/worktrees/wall-header
magick montage -label 'before: pezlie slot select' .playwright-mcp/wall-header-before.png \
  -label 'after: engine toggle, style, part search' .playwright-mcp/wall-header-after.png \
  -tile 1x2 -geometry +0+12 -pointsize 18 -title '/wall header' .playwright-mcp/wall-header-pair.png
~/src/slopboard/bin/slop .playwright-mcp/wall-header-pair.png
```

- [ ] **Step 5: Mark the spec built**

In `~/src/pezlie/docs/superpowers/specs/2026-09-15-wall-host-header-design.md`, change the status line to `**Status: built 2026-09-15.**`. Set this plan's status line to `**Status: done 2026-09-15.**`. Then:

```bash
cd ~/src/pezlie
git add docs/superpowers
git commit -m "mark the WallView header work built"
git push origin main
```

- [ ] **Step 6: Stop the worktree's dev server**, and report back. Opening a brick-icons PR needs a separate go-ahead.
