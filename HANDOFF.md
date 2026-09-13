# castleblack — pickup state

**2026-09-13.** `bakery` and `wall` are built and on `main`, pushed to
`orochi235/castleblack` (private), with a demo host drawing a generated corpus in
a browser. What is left is step 7: brick-icons switching to both packages.

## Where things are

- `docs/superpowers/specs/2026-09-07-abstract-wall-design.md` — the design and
  what is built of it, checked against brick-icons `fa91c59`. Read this first.
- `docs/superpowers/plans/` — Phases 1, 2, 3 (the wall core) and 3b (the view
  and the demo), each ending with "What it found".
- `wall/` — the TypeScript package. `wall/README.md` is the host contract.
- `hosts/brick-icons/` — brick-icons' spec, and the tests proving it draws what
  brick-icons drew: goldens, a differential test against the legacy code, and
  `bench/derive.ts`.
- `hosts/demo/` — a generated corpus: `make.py` bakes it, `server.py` serves it,
  `npm run dev` draws it. `hosts/demo/README.md` has the three commands.
- `bakery/` — the Python package; its README has setup.
- `scripts/brick-icons-bake-parity.py`, `spike/cel/`.

The root is an npm workspace (`wall`, `hosts/brick-icons`, `hosts/demo`):
`npm install` once at the root. `bakery/.venv` and `hosts/demo/.venv` are
gitignored and recreated from each README.

## What is decided that the code does not say

**The name.** `castleblack` for now; `yumyulack` is the alternative.

**Display projections may be hooks; predicates may not.** States, filters,
classes, sorts, tags and the wash flag are CEL so a Python feed can evaluate
them. Captions, facets, glyph, mark and tints are TypeScript.

**`WallView` keeps no address bar.** A host keeps its own hash through
`initial` and `onChange`; brick-icons' `wallHash` stays in brick-icons.

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

**A top-left badge sits on a top-left caption.** Only top-right captions make
room; brick-icons has the same overlap.

**`_pw_npm_token: command not found`** after npm commands is shell noise from
the work profile, not a failure.

## Next

1. **Plan step 7** in a brick-icons worktree: the lab's `CorpusWall` becomes a
   `WallView` host (its lightbox as `renderDetail`, `PartCard` body as
   `renderCard`, `wallHash` through `onChange`), `thumbs.py` gives way to
   `bakery`, and the brick-icons spec moves from `hosts/brick-icons/` into the
   lab. brick-icons' render nodes need read access to this private repo first.
