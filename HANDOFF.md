# castleblack — pickup state

**2026-09-07.** Phase 1 of the wall extraction is built and green. Nothing is
pushed anywhere; castleblack has no remote.

## Where things are

**`castleblack`** (branch `main`, clean) holds the design and the plans:

- `docs/superpowers/specs/2026-09-07-abstract-wall-design.md` — the design. Read
  this first.
- `docs/superpowers/plans/2026-09-07-phase-1-states-as-data.md` — Phase 1, marked
  **BUILT**, with a "What it found" section at the foot that the design does not
  repeat.
- `spike/cel/` — the CEL conformance spike. Runnable: `node run.mjs buf`,
  `.venv/bin/python run.py`, `.venv/bin/python compare.py`. `node_modules` and
  `.venv` are gitignored, so reinstall before running (`README.md` has the
  commands).

**`brick-icons`** — Phase 1 lives on branch `states-as-data`, worktree
`.claude/worktrees/states-as-data`, forked from `main` at `eb22311`. Seven
commits, `0890700` through `859b148`. **Not merged.** The worktree has its own
`node_modules`; never symlink it, because a shared `node_modules/.vite` serves
modules from the wrong tree with no error.

## What is decided that the code does not say

**The name.** `castleblack` for now; `yumyulack` is the alternative, recorded
under the README title. Deciding late costs a directory rename and an import
sweep.

**CEL implementation: `@bufbuild/cel`**, and the reason is not in the spike's
result table. The expression corpus agreed 105/108 across all three
implementations and did not separate the candidates. RE2 versus JavaScript
`RegExp` did, via a probe written after the corpus came back clean.

**Phase 1 stopped short of CEL on purpose.** The state table holds TypeScript
predicates. Converting them belongs with the `wall` lift, because adding a CEL
dependency to `brick-icons` before the package exists means adding it twice.

## Traps

**Do not delete the hand-written paint loop in `Wall.tsx`.** Branch `wall-scene`
is benchmarking it against a scene-graph replacement and needs both alive,
interleaved in one process. That work replaces the *drawing*; Phase 1 changed the
*deciding*; `paintCommands` is the boundary and the goldens pin it for both.

**Four other sessions share `~/src/brick-icons`.** Work in the
worktree, never the shared tree.

**Run one test file, not the suite.** `npx vitest run src/corpus/goldens.test.ts`
is the gate — 45 must pass. A full vitest run takes nearly every core on a box
that usually has someone else's suite on it.

**The cell colors are declared twice and CSS wins.** `corpus.css:21-34`
re-declares all fourteen `--corpus-cell-*` hexes and `readPalette` prefers a
declared value, so editing a color in `states.ts` alone will not move the wall.

## In flight

**The selection vocabulary is being given the same treatment as the states** —
`select.ts`'s `SORTS`, `FILTERS` and `CLASSES` becoming declarative tables, on
the same `states-as-data` branch. One difference worth knowing: the goldens do
not cover `applySelection`, so `select.test.ts` is the only net, and that work
starts by auditing it rather than trusting it.

Also queued, needing the worktree free: brick-icons' `HANDOFF.md` has a stale
paragraph (around line 1862) pointing at `~/src/castleblack/wall/README.md`,
saying nothing is built and that the extraction should wait for the census. The
file was superseded — it is only in git history at `a1fffd0` — and Phase 1 is
built.

## Next

1. **Decide whether Phase 1 merges to `brick-icons` `main`** — it is green and
   self-contained, but it is also a large diff in a file other sessions touch.
2. **Fix the `accepted` legend swatch.** `Legend.css` has a
   `[data-state=...]` rule for seven of the eight states; "known issue, not
   fixing" renders as a bare transparent box. One CSS block. Found during Phase 1
   and deliberately left, because that phase was a pure refactor.
3. **Phase 2 — lift `bakery`** (Python): `thumbs.py` nearly whole, plus a
   mountable route module, the ground color moving into the manifest, and a
   single-writer lock. No plan written yet.
4. Phases 3 and 4 — lift `wall`, then the demo host and switchover. Order and
   scope are in the spec's "Order of work".

The stylesheets are the one thing in this design that fails silently when a
state is added. If Phase 3 does nothing else about it, make that failure loud.
