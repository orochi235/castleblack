# castleblack — pickup state

**2026-09-13.** `bakery` is built and on `main`; `wall` is not. `wall` will be
its own package here, depending on weasel — decided, and recorded under the
spec's Open. The remote is `orochi235/castleblack`, private.

## Where things are

- `docs/superpowers/specs/2026-09-07-abstract-wall-design.md` — the design,
  brought up to brick-icons `6bbc739`. Read this first; its "Open" section holds
  the blocking question.
- `docs/superpowers/plans/` — Phase 1 (states as data, built in brick-icons) and
  Phase 2 (`bakery`, built here). Each ends with "What it found".
- `bakery/` — the package. `bakery/README.md` is the host contract and the
  setup commands. The venv is gitignored; recreate it before running tests.
- `scripts/brick-icons-bake-parity.py` — bakes a sample of real renders from
  every brick-icons slot through both implementations and compares bytes.
- `spike/cel/` — the CEL conformance spike.

**brick-icons** took three fixes this session asked another session for: the
stylesheet no longer overrides the state colors (`8dda179`), the stats page
takes its classes from the same table as the wall (`03de725`), and "open on the
wall" keeps the class toggles (`6bbc739`). The first two are pushed; `6bbc739`
was not at last look, and is not ours to push.

## What is decided that the code does not say

**The name.** `castleblack` for now; `yumyulack` is the alternative. Deciding
late costs a directory rename and an import sweep.

**Phase 1 stopped short of CEL on purpose.** The state table holds TypeScript
predicates. Converting them belongs with the `wall` lift, so brick-icons takes
a CEL dependency once.

## Traps

**brick-icons is shared.** Other sessions commit to its `main` and it carries
three worktrees. Read it through `git show main:<path>`; do any work there in a
worktree of your own.

**The parity test skips without a brick-icons checkout** beside castleblack (or
at `$BRICK_ICONS`). A green `bakery` suite on a machine without one has not
checked parity.

**Never prove a test can fail by editing a same-length constant on disk.**
Python's bytecode cache keys on mtime and size; two edits inside a second leave
both unchanged and the stale compile keeps running. Patch in memory.

**Other lab pages import the wall's files** (`lab/src/bench`, `lab/src/stats`),
so lifting `wall` moves their imports too.

## Next

1. **Plan step 5, lifting `wall`,** against the spec's move table and its list
   of what the tables have grown. brick-icons commits to `lab/src/corpus/`
   daily, so re-read `main` before planning.
2. Steps 6 and 7 — the demo host, then brick-icons switching to both packages.
   Step 7 needs brick-icons' render nodes able to read the private remote.
