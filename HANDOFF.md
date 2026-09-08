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
commits, `0890700` through `5f33804`. **Not merged, not pushed.** The states
are one table (`states.ts`), the sorts/filters/classes another
(`criteria.ts`), behind 45 `paintCommands` goldens. The worktree has its own
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

## The trap the selection work found

**A ninth hidden class fails silently across three layers, and only one of them
is TypeScript.** Adding one to `criteria.ts` gets you the type, the default, the
checkbox and the filtering. But `lab/src/stats/workingSet.ts` keeps a
hand-written parallel copy — `moved` and `outOfScope` as *named fields* — and
serializes exactly those two into the URL, which `brick_icons/lab/app.py`'s
`get_corpus_stats(kind, moved, out_of_scope, …)` receives as named parameters.
A ninth class is invisible to all of it. Nothing errors; the stats page simply
keeps counting parts the wall has begun hiding.

It cannot be derived away as things stand, because that shape is a URL and an
API contract rather than a UI list. It is the sharpest argument yet for the
spec's schema: this is the same class list written down three times in two
languages, which is exactly what a shared CEL-backed spec exists to stop.

## Next

1. **Decide whether Phase 1 merges to `brick-icons` `main`** — it is green and
   self-contained, but it is also a large diff in a file other sessions touch.
2. **Decide what to do about the stats page's parallel class list** — see the
   trap above. It crosses into Python, so it is bigger than a cleanup.
3. **Fix the `accepted` legend swatch.** `Legend.css` has a
   `[data-state=...]` rule for seven of the eight states; "known issue, not
   fixing" renders as a bare transparent box. One CSS block. Found during Phase 1
   and deliberately left, because that phase was a pure refactor.
4. **Phase 2 — lift `bakery`** (Python): `thumbs.py` nearly whole, plus a
   mountable route module, the ground color moving into the manifest, and a
   single-writer lock. No plan written yet.
5. Phases 3 and 4 — lift `wall`, then the demo host and switchover. Order and
   scope are in the spec's "Order of work".

The stylesheets are the one thing in this design that fails silently when a
state is added. If Phase 3 does nothing else about it, make that failure loud.
