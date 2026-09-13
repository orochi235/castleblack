# castleblack — pickup state

**2026-09-13.** `bakery` and `wall`'s core are built and on `main`, pushed to
`orochi235/castleblack` (private). Next is Phase 3b: the React component, the
canvas executors, the loaders and the chrome, onto the core.

## Where things are

- `docs/superpowers/specs/2026-09-07-abstract-wall-design.md` — the design and
  what is built of it, checked against brick-icons `f3ca333`. Read this first.
- `docs/superpowers/plans/` — Phases 1, 2 and 3 (the wall core), each ending
  with "What it found".
- `wall/` — the TypeScript package. `wall/README.md` is the host contract.
- `hosts/brick-icons/` — brick-icons' spec, and the tests proving it draws
  what brick-icons drew: goldens, a differential test against the legacy code,
  and `bench/derive.ts`.
- `bakery/` — the Python package; its README has setup.
- `scripts/brick-icons-bake-parity.py`, `spike/cel/`.

The root is an npm workspace (`wall`, `hosts/brick-icons`): `npm install` once
at the root.

## What is decided that the code does not say

**The name.** `castleblack` for now; `yumyulack` is the alternative.

**Display projections may be hooks; predicates may not.** States, filters,
classes, sorts, tags and the wash flag are CEL so the Python feed can evaluate
them. Captions, facets, glyph, mark and tints are TypeScript.

## Traps

**The host tests read brick-icons' source at `$BRICK_ICONS`**, defaulting to
the checkout beside castleblack — which other sessions edit. For a clean read,
point it at a snapshot: `git -C ~/src/brick-icons archive main lab | tar -x -C
<dir>` and `BRICK_ICONS=<dir>`.

**brick-icons is shared.** Other sessions commit to its `main`. Read it through
`git show main:<path>` or a snapshot; work there only in a worktree.

**The `bakery` parity test skips without a brick-icons checkout.** A green suite
on such a machine has not checked parity.

**Never prove a test can fail by editing a same-length constant on disk.**
Python's bytecode cache keys on mtime and size. Patch in memory.

**`_pw_npm_token: command not found`** after npm commands is shell noise from
the work profile, not a failure.

## Next

1. **Plan and build 5b** from brick-icons' `Wall.tsx`, `draw2d`, `drawScene`,
   `toDrawCommands`, the loaders and the chrome. Re-snapshot brick-icons first;
   it commits to `lab/src/corpus/` daily.
2. Step 6, the demo host; step 7, brick-icons switching to both packages, which
   needs its render nodes able to read the private remote.
