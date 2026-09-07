# Phase 1: the state vocabulary as data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** brick-icons' corpus wall behaves identically, but its eight cell states — and the ten places that currently enumerate them by hand — come from one ordered table, behind a golden net that proves nothing moved.

**Architecture:** No package is created and nothing moves repositories. A `StateSpec[]` is introduced inside `lab/src/corpus/`, still holding the LEGO predicates, and `palette.ts`, `params.ts`, `paint.ts` and `useParams.ts` are rewritten to derive from it (`ParamsPanel.tsx` and `Legend.tsx` already read the generated tables and need no edit). A separate, self-contained CEL conformance spike in `castleblack` settles which CEL implementation the later phases use, before that choice is load-bearing.

**Tech Stack:** TypeScript, React 19, Vitest, `@weasel-js/labkit`; Python 3.10+ with `cel-python` and Node with `@bufbuild/cel` / `@marcbachmann/cel-js` for the spike only.

**Why this phase first:** it is the risky edit, and it is the one that can be checked against a working wall. Steps 4–8 change how a color is looked up, in a file the census instrument is being read from daily. The goldens in Tasks 2–3 are what make that survivable, so they come first and are never skipped.

---

## Scope

This plan covers spec steps 1–3 only. Three later plans follow, each producing working software on its own:

- **Phase 2** — lift `bakery` (Python), with the ground-color and single-writer changes.
- **Phase 3** — lift `wall` (TypeScript), converting the host table to CEL.
- **Phase 4** — demo host, leak check, and brick-icons switching over.

## File structure

**Created:**
- `castleblack/spike/cel/expressions.json` — the expression corpus and its fixtures. One file, read by all three runners, so no runner can quietly test a different set.
- `castleblack/spike/cel/run.mjs` — evaluates the corpus under each JS candidate.
- `castleblack/spike/cel/run.py` — evaluates it under `cel-python`.
- `castleblack/spike/cel/compare.py` — diffs the three result sets, prints the table, exits non-zero on disagreement.
- `castleblack/spike/cel/README.md` — what the spike concluded.
- `brick-icons/lab/src/corpus/goldens/` — captured `paintCommands` output, one JSON per scenario.
- `brick-icons/lab/src/corpus/goldens.fixture.ts` — the scenarios, shared by the capture script and the assertion test.
- `brick-icons/lab/src/corpus/goldens.test.ts` — asserts current output matches the captured files.
- `brick-icons/scripts/capture-paint-goldens.mts` — writes the goldens.
- `brick-icons/lab/src/corpus/states.ts` — the `StateSpec` type and the LEGO state table.
- `brick-icons/lab/src/corpus/states.test.ts`

**Modified:**
- `brick-icons/lab/src/corpus/palette.ts` — everything keyed by state derives from `STATES`.
- `brick-icons/lab/src/corpus/params.ts` — color fields, defaults, keys and labels generate from `STATES`.
- `brick-icons/lab/src/corpus/paint.ts` — `cellState` walks `STATES`.
- `brick-icons/lab/src/corpus/useParams.ts` — iterate generated keys.
- `brick-icons/lab/src/corpus/ParamsPanel.tsx` — no change expected; verified by test.
- `brick-icons/lab/src/corpus/Legend.test.tsx` — no component change expected; the test pins the order.

---

## Task 1: CEL conformance spike

Self-contained and separable — nothing else in this plan depends on its outcome, but Phase 3's shape does.

**Files:**
- Create: `castleblack/spike/cel/expressions.json`
- Create: `castleblack/spike/cel/run.mjs`
- Create: `castleblack/spike/cel/run.py`
- Create: `castleblack/spike/cel/compare.py`
- Create: `castleblack/spike/cel/package.json`
- Create: `castleblack/spike/cel/README.md`

- [ ] **Step 1: Write the expression corpus**

Every expression the brick-icons spec will need, plus the fixtures that exercise
their edges. `absent` fixtures deliberately omit fields, which is the case
`types.ts` already warns about.

```json
{
  "fixtures": {
    "plain":    { "id": "3001", "index": 0, "title": "Brick 2 x 4", "sha": "abc",
                  "category": "Brick", "tags": ["popular"], "error": null,
                  "open_defects": 0, "accepted_defects": 0,
                  "open_defects_elsewhere": 0, "error_elsewhere": false,
                  "out_of_scope": false, "moved": false, "printed": false,
                  "obsolete": false, "base": true,
                  "year_from": 1958, "year_to": null, "sets": 4021, "colors": 41,
                  "extra_d99": 0.4, "secs": 1.2, "made_at": "2026-09-01",
                  "status": "ok" },
    "timeout":  { "id": "9999", "index": 1, "title": "Slow", "sha": null,
                  "category": "~Moved", "tags": [], "error": "TimeoutError",
                  "open_defects": 0, "accepted_defects": 0,
                  "open_defects_elsewhere": 0, "error_elsewhere": false,
                  "out_of_scope": false, "moved": true, "printed": false,
                  "obsolete": false, "base": false,
                  "year_from": null, "year_to": null, "sets": null, "colors": null,
                  "extra_d99": null, "secs": null, "made_at": null,
                  "status": "error" },
    "sticker":  { "id": "3001d01", "index": 2, "title": "Sticker", "sha": null,
                  "category": "_Sticker", "tags": ["retired", "printed"],
                  "error": null, "open_defects": 2, "accepted_defects": 1,
                  "open_defects_elsewhere": 3, "error_elsewhere": true,
                  "out_of_scope": true, "moved": false, "printed": true,
                  "obsolete": true, "base": false,
                  "year_from": 1999, "year_to": 2004, "sets": 1, "colors": 1,
                  "extra_d99": 12.5, "secs": 30.0, "made_at": "2026-08-01",
                  "status": "ok" },
    "absent":   { "id": "4740", "index": 3, "title": "Dome", "sha": "def" }
  },
  "expressions": [
    { "key": "state.outOfScope",       "expr": "item.out_of_scope" },
    { "key": "state.defect",           "expr": "item.open_defects > 0" },
    { "key": "state.timeout",          "expr": "item.error == 'TimeoutError'" },
    { "key": "state.failed",           "expr": "item.error != null" },
    { "key": "state.accepted",         "expr": "item.accepted_defects > 0" },
    { "key": "state.defectElsewhere",  "expr": "item.open_defects_elsewhere > 0" },
    { "key": "state.problemElsewhere", "expr": "item.error_elsewhere" },

    { "key": "filter.rendered",        "expr": "item.sha != null" },
    { "key": "filter.unrendered",      "expr": "item.sha == null" },
    { "key": "filter.errors",          "expr": "item.error != null" },
    { "key": "filter.printed",         "expr": "item.printed" },
    { "key": "filter.obsolete",        "expr": "item.obsolete" },
    { "key": "filter.base",            "expr": "item.base" },

    { "key": "class.moved",            "expr": "item.moved" },

    { "key": "badge.popular",          "expr": "'popular' in item.tags" },
    { "key": "badge.retired",          "expr": "'retired' in item.tags" },

    { "key": "sort.id",                "expr": "item.id" },
    { "key": "sort.year",              "expr": "item.year_from" },
    { "key": "sort.sets",              "expr": "item.sets" },

    { "key": "field.title",            "expr": "item.title" },
    { "key": "renderable",             "expr": "'/api/corpus/render/' + slot + '/' + item.id + '.svg'" },

    { "key": "guard.has",              "expr": "has(item.tags)" },
    { "key": "guard.absentField",      "expr": "item.tags" },
    { "key": "guard.absentGuarded",    "expr": "has(item.tags) && 'popular' in item.tags" },

    { "key": "str.lower",              "expr": "item.category.lowerAscii()" },
    { "key": "str.startsWith",         "expr": "item.category.startsWith('~')" },
    { "key": "str.matches",            "expr": "item.category.matches('^[~=_|]')" }
  ],
  "bindings": { "slot": "census-naive" }
}
```

Three of these exist to fail informatively rather than to pass:
`guard.absentField` is an unguarded read of a field the `absent` fixture omits;
`str.lower` needs `lowerAscii`, which is core CEL but not universally
implemented; and `str.matches` needs a regex engine, which is where a
lightweight JS port is most likely to diverge from `cel-python`.

- [ ] **Step 2: Write the JS runner**

```js
// castleblack/spike/cel/run.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const IMPLS = {
  buf: async () => {
    const { createEnv } = await import('@bufbuild/cel');
    const env = createEnv();
    return (expr, vars) => env.compile(expr).eval(vars);
  },
  marc: async () => {
    const cel = await import('@marcbachmann/cel-js');
    return (expr, vars) => cel.evaluate(expr, vars);
  },
};

const which = process.argv[2];
if (!IMPLS[which]) {
  console.error(`usage: run.mjs <${Object.keys(IMPLS).join('|')}>`);
  process.exit(2);
}

const corpus = JSON.parse(readFileSync(new URL('./expressions.json', import.meta.url)));
const evaluate = await IMPLS[which]();
const out = {};

for (const { key, expr } of corpus.expressions) {
  for (const [name, item] of Object.entries(corpus.fixtures)) {
    const cell = `${key}@${name}`;
    try {
      const v = evaluate(expr, { item, ...corpus.bindings });
      out[cell] = { ok: true, value: normalize(v) };
    } catch (e) {
      out[cell] = { ok: false, error: String(e.message ?? e).slice(0, 120) };
    }
  }
}

// CEL integers may arrive as BigInt; JSON cannot carry one, and a 4021 that
// serializes differently per implementation is a false disagreement.
function normalize(v) {
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(normalize);
  return v;
}

writeFileSync(new URL(`./results.${which}.json`, import.meta.url),
              JSON.stringify(out, null, 2));
console.log(`${which}: ${Object.keys(out).length} cells`);
```

- [ ] **Step 3: Write the Python runner**

```python
# castleblack/spike/cel/run.py
"""Evaluate the shared expression corpus under cel-python."""
from __future__ import annotations

import json
from pathlib import Path

import celpy

HERE = Path(__file__).parent


def main() -> int:
    corpus = json.loads((HERE / "expressions.json").read_text())
    env = celpy.Environment()
    out: dict[str, dict] = {}

    for spec in corpus["expressions"]:
        key, expr = spec["key"], spec["expr"]
        try:
            program = env.program(env.compile(expr))
        except celpy.CELParseError as e:
            for name in corpus["fixtures"]:
                out[f"{key}@{name}"] = {"ok": False, "error": f"parse: {e}"[:120]}
            continue
        for name, item in corpus["fixtures"].items():
            activation = celpy.json_to_cel({"item": item, **corpus["bindings"]})
            try:
                value = program.evaluate(activation)
                out[f"{key}@{name}"] = {"ok": True, "value": _plain(value)}
            except Exception as e:  # celpy raises several unrelated types
                out[f"{key}@{name}"] = {"ok": False, "error": str(e)[:120]}

    (HERE / "results.celpy.json").write_text(json.dumps(out, indent=2))
    print(f"celpy: {len(out)} cells")
    return 0


def _plain(v):
    """celpy wraps results in its own types; compare on plain JSON values."""
    if isinstance(v, celpy.celtypes.BoolType):
        return bool(v)
    if isinstance(v, (celpy.celtypes.IntType, celpy.celtypes.UintType)):
        return int(v)
    if isinstance(v, celpy.celtypes.DoubleType):
        return float(v)
    if isinstance(v, celpy.celtypes.StringType):
        return str(v)
    if isinstance(v, celpy.celtypes.ListType):
        return [_plain(x) for x in v]
    if v is None or isinstance(v, celpy.celtypes.NullType):
        return None
    return str(v)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Write the comparison**

Prints one line per expression as it goes, per the progress rule — a silent
runner is indistinguishable from a hung one.

```python
# castleblack/spike/cel/compare.py
"""Diff the three result sets and report per-expression agreement."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
IMPLS = ["buf", "marc", "celpy"]


def main() -> int:
    results = {}
    for impl in IMPLS:
        path = HERE / f"results.{impl}.json"
        if not path.is_file():
            print(f"missing {path.name} -- run its runner first")
            return 2
        results[impl] = json.loads(path.read_text())

    corpus = json.loads((HERE / "expressions.json").read_text())
    cells = [f"{s['key']}@{n}"
             for s in corpus["expressions"] for n in corpus["fixtures"]]

    disagreements = 0
    for i, cell in enumerate(cells, 1):
        got = {impl: results[impl].get(cell) for impl in IMPLS}
        values = {impl: (r or {}).get("value") if (r or {}).get("ok") else "ERR"
                  for impl, r in got.items()}
        agree = len(set(map(repr, values.values()))) == 1
        if not agree:
            disagreements += 1
        mark = "  " if agree else "!!"
        print(f"{mark} {i}/{len(cells)} {cell}: "
              + "  ".join(f"{k}={v!r}" for k, v in values.items()))

    print(f"\n{len(cells) - disagreements}/{len(cells)} agree, "
          f"{disagreements} disagree")
    return 1 if disagreements else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Install and run all three**

```bash
cd castleblack/spike/cel
npm init -y >/dev/null
npm i @bufbuild/cel@0.6.1 @marcbachmann/cel-js@8.0.0
python3 -m venv .venv && .venv/bin/pip -q install 'cel-python==0.5.0'

node run.mjs buf
node run.mjs marc
.venv/bin/python run.py
.venv/bin/python compare.py
```

Expected: a table with one line per expression/fixture pair, ending in an
agreement count. Disagreement is a finding, not a failure — record it.

- [ ] **Step 6: Time an evaluation at corpus scale**

```bash
node -e "
const { createEnv } = require('@bufbuild/cel');
const env = createEnv();
const p = env.compile('item.open_defects > 0');
const item = { open_defects: 0 };
const N = 24591;
const t = process.hrtime.bigint();
for (let i = 0; i < N; i++) p.eval({ item });
const ms = Number(process.hrtime.bigint() - t) / 1e6;
console.log(\`\${N} evals in \${ms.toFixed(1)}ms (\${(ms*1000/N).toFixed(2)}us each)\`);
"
```

Expected: a number. Record it; the spec asserts nothing about it on purpose.

- [ ] **Step 7: Write the conclusion**

`castleblack/spike/cel/README.md` states, in order: which implementation was
chosen and on what evidence; every expression that disagreed and what the
difference was; the measured per-evaluation cost; and which of the three
deliberate edge expressions (`guard.absentField`, `str.lower`, `str.matches`)
need a TS hook instead because no implementation handles them compatibly.

- [ ] **Step 8: Commit**

```bash
cd castleblack
printf 'spike/cel/node_modules/\nspike/cel/.venv/\nspike/cel/results.*.json\n' >> .gitignore
git add spike/cel .gitignore
git commit -m "settle the CEL implementation with a conformance spike

Evaluates one shared expression corpus under @bufbuild/cel,
@marcbachmann/cel-js and cel-python, and reports per-expression
agreement. The corpus deliberately includes an unguarded read of an
absent field, lowerAscii and a regex match -- the three places a
lightweight port is most likely to diverge."
```

---

## Task 2: The golden capture harness

**Files:**
- Create: `brick-icons/lab/src/corpus/goldens.fixture.ts`
- Create: `brick-icons/scripts/capture-paint-goldens.mts`

Captured from a worktree at `HEAD`, not from the working tree — `lab/src/corpus/`
currently has eight uncommitted files mid-feature, and a golden taken from a
half-landed change pins half a change.

- [ ] **Step 1: Create the capture worktree**

```bash
cd ~/src/brick-icons
git worktree add ../brick-icons-goldens HEAD
cd ../brick-icons-goldens/lab && npm ci
```

Expected: a clean tree at `HEAD` with `lab/node_modules` installed. Every
remaining step in Tasks 2 and 3 runs in `brick-icons-goldens`, and the results
are copied back.

- [ ] **Step 2: Write the scenario fixture**

One `Cell[]` covering every state, and a scenario list crossing it with the
axes `paintCommands` actually branches on.

```ts
// lab/src/corpus/goldens.fixture.ts
import { gridLayout } from '@lab/corpus/layout';
import { DEFAULT_PALETTE } from '@lab/corpus/palette';
import { DEFAULT_APPEARANCE, type PaintInput } from '@lab/corpus/paint';
import { TINT_MODES } from '@lab/corpus/tint';
import type { Cell, SheetManifest } from '@lab/corpus/types';

function cell(over: Partial<Cell> & Pick<Cell, 'id' | 'index'>): Cell {
  return {
    title: `part ${over.id}`, category: 'Brick', printed: false, obsolete: false,
    base: true, out_of_scope: false, moved: false, year_from: 1990, year_to: null,
    sets: 12, colors: 4, tags: [], status: 'ok', sha: 'sha-' + over.id,
    made_at: '2026-09-01', extra_d99: 0.5, secs: 1.0, error: null,
    open_defects: 0, open_defects_elsewhere: 0, accepted_defects: 0,
    error_elsewhere: false, ...over,
  };
}

/** One cell per state, in `CELL_STATES` order, plus the tag-driven variants. */
export const GOLDEN_CELLS: Cell[] = [
  cell({ id: 'unknown', index: 0 }),
  cell({ id: 'oos', index: 1, out_of_scope: true, category: '_Sticker' }),
  cell({ id: 'timeout', index: 2, error: 'TimeoutError' }),
  cell({ id: 'failed', index: 3, error: 'RuntimeError' }),
  cell({ id: 'defect', index: 4, open_defects: 2 }),
  cell({ id: 'accepted', index: 5, accepted_defects: 1 }),
  cell({ id: 'probelse', index: 6, error_elsewhere: true }),
  cell({ id: 'defelse', index: 7, open_defects_elsewhere: 1 }),
  cell({ id: 'retired', index: 8, tags: ['retired'] }),
  cell({ id: 'popular', index: 9, tags: ['popular', 'technic'] }),
  cell({ id: 'replaced', index: 10, tags: ['replaced'], successor: '3002' }),
  cell({ id: 'unrendered', index: 11, sha: null }),
  cell({ id: 'nodata', index: 12, year_from: null, sets: null, colors: null }),
];

const MANIFEST: SheetManifest = {
  level: 32, gutter: 2, pitch: 36, cols: 4, rows: 4,
  count: GOLDEN_CELLS.length, size: 144,
  baked: Object.fromEntries(GOLDEN_CELLS
    .filter((c) => c.sha)
    .map((c) => [c.id, c.sha as string])),
};

/** The same manifest with one cell's sha out of date, and one entry lost. */
const STALE_MANIFEST: SheetManifest = {
  ...MANIFEST,
  baked: { ...MANIFEST.baked, unknown: 'sha-stale', defect: undefined as never },
};

export interface Scenario { name: string; input: PaintInput }

/** Every axis `paintCommands` branches on, crossed sparsely rather than fully:
 *  cell size (which gates badges, captions and glyphs), manifest freshness,
 *  tint, highlight and caret. */
export function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  const visible = GOLDEN_CELLS.map((_, i) => i);

  for (const cellPx of [8, 32, 64, 120, 200]) {
    const { rects } = gridLayout(GOLDEN_CELLS, { cell: cellPx, gap: 4, cols: 4 });
    const base: PaintInput = {
      cells: GOLDEN_CELLS, rects, visible,
      cam: { offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
      manifest: MANIFEST, palette: DEFAULT_PALETTE,
      appearance: DEFAULT_APPEARANCE,
    };
    out.push({ name: `px${cellPx}-fresh`, input: base });
    out.push({ name: `px${cellPx}-stale`,
               input: { ...base, manifest: STALE_MANIFEST } });
    out.push({ name: `px${cellPx}-nobadges`,
               input: { ...base,
                        appearance: { ...DEFAULT_APPEARANCE,
                                      showBadges: false, showCaptions: false } } });
    out.push({ name: `px${cellPx}-highlight-defect`,
               input: { ...base, highlight: 'defect' } });
    out.push({ name: `px${cellPx}-caret`, input: { ...base, caret: 4 } });
    for (const tint of TINT_MODES) {
      out.push({ name: `px${cellPx}-tint-${tint}`, input: { ...base, tint } });
    }
  }
  return out;
}
```

- [ ] **Step 3: Write the capture script**

Emits one line per scenario as it writes it.

```ts
// scripts/capture-paint-goldens.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import { paintCommands } from '../lab/src/corpus/paint.ts';
import { scenarios } from '../lab/src/corpus/goldens.fixture.ts';

const DIR = new URL('../lab/src/corpus/goldens/', import.meta.url);
mkdirSync(DIR, { recursive: true });

const all = scenarios();
all.forEach((s, i) => {
  const commands = paintCommands(s.input);
  writeFileSync(new URL(`${s.name}.json`, DIR),
                JSON.stringify(commands, null, 2) + '\n');
  console.log(`${i + 1}/${all.length} ${s.name} — ${commands.length} commands`);
});
```

- [ ] **Step 4: Add the npm script**

In `brick-icons/lab/package.json`, add to `scripts`:

```json
"capture-goldens": "vite-node ../scripts/capture-paint-goldens.mts"
```

Then install the runner:

```bash
cd ~/src/brick-icons-goldens/lab && npm i -D vite-node
```

- [ ] **Step 5: Commit the harness**

```bash
cd ~/src/brick-icons-goldens
git add lab/src/corpus/goldens.fixture.ts scripts/capture-paint-goldens.mts lab/package.json lab/package-lock.json
git commit -m "add a paintCommands golden capture harness

One fixture crossing cell size, manifest freshness, tint, highlight and
caret -- the axes paintCommands actually branches on. Pure data in,
pure data out, so a golden is a plain JSON compare with no canvas."
```

---

## Task 3: Capture the goldens

**Files:**
- Create: `brick-icons/lab/src/corpus/goldens/*.json`
- Create: `brick-icons/lab/src/corpus/goldens.test.ts`

- [ ] **Step 1: Run the capture**

```bash
cd ~/src/brick-icons-goldens/lab && npm run capture-goldens
```

Expected: 50 lines (`1/50 px8-fresh — N commands` … `50/50 px200-tint-colors — N commands`) and 50 files under `lab/src/corpus/goldens/`.

- [ ] **Step 2: Eyeball one golden before trusting all fifty**

```bash
cd ~/src/brick-icons-goldens
head -40 lab/src/corpus/goldens/px120-fresh.json
```

Expected: `kind: "sprite"` entries carrying `badges`, `captions` and a
`borderWidth`; a `kind: "fill"` entry for the out-of-scope cell with
`shape: "circle"`. If every command is `kind: "fill"` with no badges, the
fixture's manifest is not matching and the goldens are worthless — fix the
fixture before continuing.

- [ ] **Step 3: Write the assertion test**

```ts
// lab/src/corpus/goldens.test.ts
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { paintCommands } from '@lab/corpus/paint';
import { scenarios } from '@lab/corpus/goldens.fixture';

const DIR = new URL('./goldens/', import.meta.url);

// One test per scenario rather than a loop inside one test: a failure names
// the scenario that moved, which is the only thing you want to know.
for (const s of scenarios()) {
  it(`paints ${s.name} as captured`, () => {
    const want = JSON.parse(readFileSync(new URL(`${s.name}.json`, DIR), 'utf8'));
    expect(JSON.parse(JSON.stringify(paintCommands(s.input)))).toEqual(want);
  });
}
```

`JSON.parse(JSON.stringify(...))` is not ceremony: a `PaintCommand` of kind
`image` carries a live `CanvasImageSource`, and only the serialized form is
comparable. No scenario in this fixture supplies `loose` or `vector`, so no
command of that kind is produced — but the round-trip keeps that true if one
is added later.

- [ ] **Step 4: Run the test — it must pass immediately**

```bash
cd ~/src/brick-icons-goldens/lab && npx vitest run src/corpus/goldens.test.ts
```

Expected: 50 passed. A failure here means the capture and the assertion
disagree about the fixture, which makes the net useless.

- [ ] **Step 5: Prove the net actually catches a change**

Temporarily break one thing and confirm it fails:

```bash
cd ~/src/brick-icons-goldens
sed -i '' 's/export const THUMB_GROUND = .#ffffff.;/export const THUMB_GROUND = "#ff0000";/' lab/src/corpus/paint.ts
cd lab && npx vitest run src/corpus/goldens.test.ts
```

Expected: failures. Then revert:

```bash
cd ~/src/brick-icons-goldens && git checkout lab/src/corpus/paint.ts
```

A golden net nobody has seen fail is not known to be a net.

- [ ] **Step 6: Commit and carry back to the main worktree**

```bash
cd ~/src/brick-icons-goldens
git add lab/src/corpus/goldens lab/src/corpus/goldens.test.ts
git commit -m "capture paintCommands goldens across 50 scenarios

The net for the state-table rewrite: paint decisions are pure data, so
the extraction has to reproduce them exactly rather than look right."
```

Then bring the two commits onto the branch the work will happen on:

```bash
cd ~/src/brick-icons
git log --oneline -2 ../brick-icons-goldens   # note the two SHAs
git cherry-pick <harness-sha> <goldens-sha>
```

Cherry-pick rather than merge, because the main worktree has unrelated
uncommitted work in the same directory and a merge would want it clean.

- [ ] **Step 7: Confirm the goldens still pass against the working tree**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/goldens.test.ts
```

Expected: 50 passed. **If any fail, stop.** It means the eight uncommitted
files already change paint behavior, and the golden baseline has to be taken
from the working tree instead — a decision for the repo owner, not for this
plan.

---

## Task 4: The state table

**Files:**
- Create: `brick-icons/lab/src/corpus/states.ts`
- Create: `brick-icons/lab/src/corpus/states.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lab/src/corpus/states.test.ts
import { expect, it } from 'vitest';
import { STATES, stateKeys, styleTable, labelTable, cssVarTable } from '@lab/corpus/states';

it('lists states worst-first, out of scope ahead of every fault', () => {
  expect(stateKeys()).toEqual([
    'unknown', 'outOfScope', 'timeout', 'failed', 'defect',
    'accepted', 'problemElsewhere', 'defectElsewhere',
  ]);
});

it('gives every state a fill, and a border only where it has one', () => {
  const styles = styleTable();
  expect(styles.unknown).toEqual({ fill: '#3a3a3f', border: null, weight: null });
  expect(styles.defect.border).toBe('#daa520');
  expect(styles.defect.weight).toBe('thick');
  expect(styles.accepted.weight).toBe('thin');
});

it('derives one CSS custom property per color a state actually has', () => {
  const vars = cssVarTable();
  expect(vars.unknown).toEqual({ fill: '--corpus-cell-unknown-fill', border: null });
  expect(vars.timeout).toEqual({
    fill: '--corpus-cell-timeout-fill',
    border: '--corpus-cell-timeout-border',
  });
});

it('labels every state for the legend', () => {
  expect(labelTable().outOfScope).toBe('currently out of scope');
});

it('matches a cell to the first state whose predicate holds', () => {
  const first = (c: Parameters<typeof STATES[number]['match']>[0]) =>
    STATES.find((s) => s.match(c))!.key;
  const base = { out_of_scope: false, open_defects: 0, error: null,
                 accepted_defects: 0, open_defects_elsewhere: 0,
                 error_elsewhere: false };
  expect(first({ ...base })).toBe('unknown');
  expect(first({ ...base, out_of_scope: true, open_defects: 9 })).toBe('outOfScope');
  expect(first({ ...base, open_defects: 1, error: 'TimeoutError' })).toBe('defect');
  expect(first({ ...base, error: 'TimeoutError' })).toBe('timeout');
  expect(first({ ...base, error: 'Boom' })).toBe('failed');
  expect(first({ ...base, accepted_defects: 1, error_elsewhere: true })).toBe('accepted');
  expect(first({ ...base, open_defects_elsewhere: 1, error_elsewhere: true }))
    .toBe('defectElsewhere');
  expect(first({ ...base, error_elsewhere: true })).toBe('problemElsewhere');
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/states.test.ts
```

Expected: FAIL — `Failed to resolve import "@lab/corpus/states"`.

- [ ] **Step 3: Write the table**

Note the ordering: `unknown` is listed first because it is the legend's first
row and `CELL_STATES`' first key, but it must be *matched* last. The table
carries both facts rather than making a reader infer one from the other.

```ts
// lab/src/corpus/states.ts
import type { CellStyle } from '@lab/corpus/palette';

/** The subset of a cell a state predicate is allowed to read. Narrower than
 *  `Cell` on purpose: it is what a host would have to supply, and keeping it
 *  narrow is what stops a predicate reaching for a field the extraction will
 *  not carry. */
export interface StateFacts {
  out_of_scope: boolean;
  open_defects: number;
  error: string | null;
  accepted_defects: number;
  open_defects_elsewhere: number;
  error_elsewhere: boolean;
}

export interface StateSpec {
  key: string;
  label: string;
  fill: string;
  border: string | null;
  weight: CellStyle['weight'];
  /** Where this state sits when a cell is matched. Lower runs first.
   *  Separate from listing order, which the legend uses. */
  precedence: number;
  match: (c: StateFacts) => boolean;
}

/** Listed in legend order; matched in `precedence` order. The two differ for
 *  exactly one state -- `unknown` is shown first and matched last, being the
 *  absence of every other. */
export const STATES: readonly StateSpec[] = [
  { key: 'unknown', label: 'unknown',
    fill: '#3a3a3f', border: null, weight: null,
    precedence: 100, match: () => true },
  // Ahead of every problem state: a part the project is not drawing yet has
  // not failed at anything, and a wall of red stickers would say it had.
  { key: 'outOfScope', label: 'currently out of scope',
    fill: '#b2a3dd', border: null, weight: null,
    precedence: 0, match: (c) => c.out_of_scope },
  { key: 'timeout', label: 'timed out',
    fill: '#26383f', border: '#30b0d0', weight: 'thick',
    precedence: 2, match: (c) => c.error === 'TimeoutError' },
  { key: 'failed', label: 'render error',
    fill: '#4a2626', border: '#e03030', weight: 'thick',
    precedence: 3, match: (c) => c.error !== null },
  { key: 'defect', label: 'open defect',
    fill: '#453c27', border: '#daa520', weight: 'thick',
    precedence: 1, match: (c) => c.open_defects > 0 },
  // Thin, because nothing here needs doing: the fault is known and the
  // decision was to keep it.
  { key: 'accepted', label: 'known issue, not fixing',
    fill: '#26382c', border: '#6f9e78', weight: 'thin',
    precedence: 4, match: (c) => c.accepted_defects > 0 },
  { key: 'problemElsewhere', label: 'problem in another slot',
    fill: '#26383f', border: '#97bcc5', weight: 'thin',
    precedence: 6, match: (c) => c.error_elsewhere },
  { key: 'defectElsewhere', label: 'defect in another slot',
    fill: '#453c27', border: '#c7b78f', weight: 'thin',
    precedence: 5, match: (c) => c.open_defects_elsewhere > 0 },
];

/** Matching order. Sorted once at module load, not per cell. */
export const BY_PRECEDENCE: readonly StateSpec[] =
  [...STATES].sort((a, b) => a.precedence - b.precedence);

export function stateKeys(): string[] {
  return STATES.map((s) => s.key);
}

export function styleTable(): Record<string, CellStyle> {
  return Object.fromEntries(
    STATES.map((s) => [s.key, { fill: s.fill, border: s.border, weight: s.weight }]));
}

export function labelTable(): Record<string, string> {
  return Object.fromEntries(STATES.map((s) => [s.key, s.label]));
}

/** A state's CSS custom properties, named from its key. `outOfScope` becomes
 *  `--corpus-cell-out-of-scope-fill`, which is the name the stylesheet
 *  already declares -- so this generates the existing vocabulary rather than
 *  renaming it. */
export function cssVarTable(): Record<string, { fill: string; border: string | null }> {
  return Object.fromEntries(STATES.map((s) => [s.key, {
    fill: `--corpus-cell-${kebab(s.key)}-fill`,
    border: s.border === null ? null : `--corpus-cell-${kebab(s.key)}-border`,
  }]));
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/** The params key a state's fill and border are tuned under -- `timeoutFill`,
 *  `timeoutBorder`. Generated so a new state cannot be added to the table and
 *  forgotten in the panel. */
export function paramKeys(s: StateSpec): { fill: string; border: string | null } {
  return { fill: `${s.key}Fill`, border: s.border === null ? null : `${s.key}Border` };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/states.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Confirm nothing else moved**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/
```

Expected: all pass, including the 50 goldens. Nothing consumes `states.ts` yet,
so this is a check that adding the file broke nothing.

- [ ] **Step 6: Commit**

```bash
cd ~/src/brick-icons
git add lab/src/corpus/states.ts lab/src/corpus/states.test.ts
git commit -m "add the cell-state table

One ordered list carrying each state's color, label, legend position and
match predicate, plus generators for the tables keyed by state. Nothing
reads it yet."
```

---

## Task 5: Derive the palette from the table

**Files:**
- Modify: `brick-icons/lab/src/corpus/palette.ts`

- [ ] **Step 1: Write the failing test**

Add to `lab/src/corpus/palette.test.ts`:

```ts
import { STATES, stateKeys } from '@lab/corpus/states';

it('exposes exactly the states the table declares, in its order', () => {
  expect(CELL_STATES).toEqual(stateKeys());
});

it('takes every fill and label from the table, not from a second copy', () => {
  for (const s of STATES) {
    expect(DEFAULT_PALETTE[s.key].fill).toBe(s.fill);
    expect(STATE_LABEL[s.key]).toBe(s.label);
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/palette.test.ts
```

Expected: FAIL — `STATES` is not imported in the test file yet, then a type
error on indexing `DEFAULT_PALETTE` by a `string`.

- [ ] **Step 3: Rewrite palette.ts to derive**

Replace the `CellState` union, `CELL_PALETTE`, `PROPERTY`, `PARAM_CSS_VAR`,
`STATE_LABEL` and `CELL_STATES` declarations with derivations. Keep every
exported name — this task changes where the values come from, not what the
module offers.

```ts
import { cssVarTable, labelTable, paramKeys, stateKeys, STATES, styleTable }
  from '@lab/corpus/states';

/** A key in the state table. No longer a closed union: the table is the
 *  authority, and a host in a later phase declares its own. */
export type CellState = string;

export interface CellStyle {
  fill: string;
  /** null means the state gets no border at all -- the unknown field color
   *  recedes rather than competing with everything drawn on top of it. */
  border: string | null;
  weight: 'thick' | 'thin' | null;
}

export type Palette = Record<CellState, CellStyle> & {
  caret: string;
  label: CellStyle;
  sublabel: CellStyle;
  unmatched: CellStyle;
};

const CARET_PROPERTY = '--corpus-caret-color';
const LABEL_PROPERTY = '--corpus-label';
const SUBLABEL_PROPERTY = '--corpus-sublabel';
const UNMATCHED_PROPERTY = '--corpus-unmatched';

const PROPERTY = cssVarTable();

export const DEFAULT_PALETTE: Palette = {
  ...styleTable(),
  caret: '#ffffff',
  label: { fill: '#e8e8ea', border: null, weight: null },
  sublabel: { fill: '#7e7e88', border: null, weight: null },
  unmatched: { fill: '#2a2a2e', border: null, weight: null },
};

export const PARAM_CSS_VAR: Record<string, string> = {
  ...Object.fromEntries(STATES.flatMap((s) => {
    const keys = paramKeys(s);
    const vars = PROPERTY[s.key]!;
    return keys.border === null
      ? [[keys.fill, vars.fill]]
      : [[keys.fill, vars.fill], [keys.border, vars.border as string]];
  })),
  caretColor: CARET_PROPERTY,
};

export const CELL_STATES: CellState[] = stateKeys();
export const STATE_LABEL: Record<CellState, string> = labelTable();
```

`readPalette` keeps its body unchanged — it already iterates `CELL_STATES` and
looks each state up in `PROPERTY` and `DEFAULT_PALETTE`, both of which are now
generated.

- [ ] **Step 4: Run the palette tests**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/palette.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run the goldens — the real check**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/goldens.test.ts
```

Expected: 50 passed. Any failure means a color or border weight moved, and the
diff names which scenario.

- [ ] **Step 6: Commit**

```bash
cd ~/src/brick-icons
git add lab/src/corpus/palette.ts lab/src/corpus/palette.test.ts
git commit -m "derive the palette from the state table

CELL_STATES, CELL_PALETTE, the CSS custom property names, PARAM_CSS_VAR
and STATE_LABEL were five hand-maintained copies of one list. Goldens
unchanged."
```

---

## Task 6: Generate the params color rows

**Files:**
- Modify: `brick-icons/lab/src/corpus/params.ts`
- Modify: `brick-icons/lab/src/corpus/useParams.ts`

- [ ] **Step 1: Write the failing test**

Add to `lab/src/corpus/params.test.ts`:

```ts
import { paramKeys, STATES } from '@lab/corpus/states';

it('has one color param per color a state declares, and no orphans', () => {
  const want = STATES.flatMap((s) => {
    const k = paramKeys(s);
    return k.border === null ? [k.fill] : [k.fill, k.border];
  }).concat('caretColor');
  expect([...COLOR_PARAM_KEYS]).toEqual(want);
});

it('defaults every state color to the table value', () => {
  for (const s of STATES) {
    const k = paramKeys(s);
    expect(DEFAULT_PARAMS[k.fill as keyof Params]).toBe(s.fill);
    if (k.border) expect(DEFAULT_PARAMS[k.border as keyof Params]).toBe(s.border);
  }
});

it('gives every color row a label the panel can show', () => {
  for (const key of COLOR_PARAM_KEYS) {
    const field = APPEARANCE_FIELDS.find((f) => f.key === key);
    expect(field, `no field for ${key}`).toBeTruthy();
    expect(field!.label.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/params.test.ts
```

Expected: FAIL on the first assertion — `COLOR_PARAM_KEYS` is a hand-written
literal and its order will not match the generated one exactly.

- [ ] **Step 3: Generate the color half of Params**

In `params.ts`, replace the fifteen hand-written color fields on the `Params`
interface with an index signature over the generated keys, replace the color
block in `DEFAULT_PARAMS`, and generate `COLOR_PARAM_KEYS`, `COLOR_LABEL` and
the color rows of `APPEARANCE_FIELDS`.

```ts
import { paramKeys, STATES } from '@lab/corpus/states';

/** Generated: one `<state>Fill`, and `<state>Border` where the state has one,
 *  plus the caret. Order follows the state table so the panel's rows and the
 *  legend's rows read down the page together. */
export const COLOR_PARAM_KEYS: readonly string[] = [
  ...STATES.flatMap((s) => {
    const k = paramKeys(s);
    return k.border === null ? [k.fill] : [k.fill, k.border];
  }),
  'caretColor',
];

export type ColorParamKey = string;

export interface Params {
  cell: number;
  gap: number;
  /** 0 means auto: `ceil(sqrt(n))`. */
  cols: number;

  /** Every key in `COLOR_PARAM_KEYS`. Typed loosely because the state table
   *  decides the set at runtime; `COLOR_PARAM_KEYS` is the authority on which
   *  keys are actually present. */
  [color: string]: number | string | boolean;

  showBadges: boolean;
  showCaptions: boolean;
  thickBorderFactor: number;
  thinBorderFactor: number;
  maxBorderPx: number;
  dimAlpha: number;
  retiredWash: number;
  dragThresholdPx: number;
  levelUpHysteresis: number;
  levelDownHysteresis: number;
  pollMs: number;
}

const STATE_COLOR_DEFAULTS: Record<string, string> =
  Object.fromEntries(STATES.flatMap((s) => {
    const k = paramKeys(s);
    return k.border === null
      ? [[k.fill, s.fill]]
      : [[k.fill, s.fill], [k.border, s.border as string]];
  }));

export const DEFAULT_PARAMS: Params = {
  cell: 32,
  gap: 4,
  cols: 0,
  ...STATE_COLOR_DEFAULTS,
  caretColor: '#ffffff',
  showBadges: true,
  showCaptions: true,
  thickBorderFactor: 0.18,
  thinBorderFactor: 0.09,
  maxBorderPx: 6,
  dimAlpha: 0.25,
  retiredWash: 0.5,
  dragThresholdPx: 4,
  levelUpHysteresis: 1.5,
  levelDownHysteresis: 0.67,
  pollMs: 10_000,
};

/** "Timeout border", "Out-of-scope fill" -- sentence case off the state's own
 *  key, so a new state gets a readable row without a second table. */
const COLOR_LABEL: Record<string, string> = {
  ...Object.fromEntries(STATES.flatMap((s) => {
    const k = paramKeys(s);
    const name = s.key.replace(/[A-Z]/g, (ch) => ` ${ch.toLowerCase()}`);
    const title = name.charAt(0).toUpperCase() + name.slice(1);
    return k.border === null
      ? [[k.fill, `${title} fill`]]
      : [[k.fill, `${title} fill`], [k.border, `${title} border`]];
  })),
  caretColor: 'Caret color',
};
```

`APPEARANCE_FIELDS` keeps its existing shape — it already maps
`COLOR_PARAM_KEYS` through `COLOR_LABEL`, and both are now generated.

- [ ] **Step 4: Loosen useParams' iteration**

In `useParams.ts`, `writeColorVars` indexes `params[key]` with a
`ColorParamKey`. With the key type widened it needs a cast at the one place
the value is read:

```ts
function writeColorVars(params: Params): void {
  const root = document.querySelector<HTMLElement>('.lk-root');
  if (!root) return;
  for (const key of COLOR_PARAM_KEYS) {
    const prop = PARAM_CSS_VAR[key];
    const value = params[key];
    if (prop && typeof value === 'string') root.style.setProperty(prop, value);
  }
}
```

The `typeof value === 'string'` guard is not defensive padding — `Params` now
has an index signature covering numbers and booleans, and a non-string reaching
`setProperty` would write `"undefined"` into a CSS variable and silently gray
the wall.

- [ ] **Step 5: Run params, useParams and ParamsPanel tests**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/params.test.ts src/corpus/useParams.test.ts src/corpus/ParamsPanel.test.tsx
```

Expected: all pass.

- [ ] **Step 6: Typecheck — the index signature is the risk here**

```bash
cd ~/src/brick-icons/lab && npm run typecheck
```

Expected: clean. An index signature on `Params` makes every previously-typed
access assignable to `number | string | boolean`, so any consumer doing
arithmetic on `params.cell` may now need a narrowing. Fix each at the call
site rather than casting `Params` itself.

- [ ] **Step 7: Run the goldens**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/goldens.test.ts
```

Expected: 50 passed.

- [ ] **Step 8: Commit**

```bash
cd ~/src/brick-icons
git add lab/src/corpus/params.ts lab/src/corpus/params.test.ts lab/src/corpus/useParams.ts
git commit -m "generate the params color rows from the state table

COLOR_PARAM_KEYS, the Params color fields, their defaults and their
labels were four more copies of the state list. A new state now gets a
tuning row without touching this file."
```

---

## Task 7: Move the precedence chain onto the table

**Files:**
- Modify: `brick-icons/lab/src/corpus/paint.ts`

- [ ] **Step 1: Write the failing test**

Add to `lab/src/corpus/paint.test.ts`:

```ts
import { BY_PRECEDENCE } from '@lab/corpus/states';

it('resolves a cell to the first matching state in precedence order', () => {
  const cell = { ...baseCell, out_of_scope: true, open_defects: 4,
                 error: 'TimeoutError' };
  expect(cellState(cell)).toBe('outOfScope');
  expect(cellState({ ...cell, out_of_scope: false })).toBe('defect');
});

it('reads its precedence from the table rather than a private chain', () => {
  // Every state the table can match must be reachable through cellState.
  const reachable = new Set(BY_PRECEDENCE.map((s) => s.key));
  expect(reachable.has('unknown')).toBe(true);
  expect(BY_PRECEDENCE[0].key).toBe('outOfScope');
  expect(BY_PRECEDENCE[BY_PRECEDENCE.length - 1].key).toBe('unknown');
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/paint.test.ts -t "precedence"
```

Expected: FAIL — `@lab/corpus/states` exports `BY_PRECEDENCE`, but
`paint.test.ts` does not import it yet, and the first test may already pass by
coincidence. Both must be present and passing before Step 3 counts as done.

- [ ] **Step 3: Replace the chain**

In `paint.ts`, replace the body of `cellState`:

```ts
import { BY_PRECEDENCE } from '@lab/corpus/states';

/** What a cell's color says about it: out of scope first, then
 *  worst-here-first and worst-elsewhere.
 *  The single precedence table -- `fillFor`, the legend and `PartCard` all
 *  read a cell's state through this, so they cannot drift apart. */
export function cellState(cell: Cell): CellState {
  return BY_PRECEDENCE.find((s) => s.match(cell))!.key;
}
```

The non-null assertion is safe by construction: `unknown` matches
unconditionally and sorts last. `states.test.ts` pins both facts.

- [ ] **Step 4: Run the paint tests**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/paint.test.ts
```

Expected: all pass, including the existing precedence assertions that were
written against the hand-rolled chain.

- [ ] **Step 5: Run the goldens**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/goldens.test.ts
```

Expected: 50 passed.

- [ ] **Step 6: Commit**

```bash
cd ~/src/brick-icons
git add lab/src/corpus/paint.ts lab/src/corpus/paint.test.ts
git commit -m "resolve a cell's state through the table's precedence order

The tenth and last copy of the state list. cellState is now a find over
BY_PRECEDENCE rather than an if-chain that had to be kept in step with
the palette by hand."
```

---

## Task 8: Pin the Legend, and verify the phase

**Files:**
- Modify: `brick-icons/lab/src/corpus/Legend.test.tsx`

`Legend.tsx` needs **no change**: it already maps `CELL_STATES` and looks
labels up in `STATE_LABEL`, both of which Task 5 turned into generated tables.
This task adds the test that says so, so a later edit cannot reintroduce a
private copy of the order without failing.

- [ ] **Step 1: Write the regression test**

Add to `lab/src/corpus/Legend.test.tsx`. Query on `data-state` rather than by
role: a state row is a `div` with `tabIndex`, and the only `button`s in the
panel are the close button and the badge rows, so a role query would assert
against the wrong list.

```tsx
import { STATES } from '@lab/corpus/states';

it('renders one row per state, in the state table\'s order', () => {
  const { container } = render(
    <Legend cells={cells} highlight={null} onHighlight={() => {}}
            badges={[]} onBadges={vi.fn()}
            highlightTag={null} onHighlightTag={vi.fn()}
            onClose={vi.fn()} />);
  const rows = [...container.querySelectorAll('[data-state]')];
  expect(rows.map((r) => r.getAttribute('data-state')))
    .toEqual(STATES.map((s) => s.key));
});

it('names each row with the table\'s own label', () => {
  const { container } = render(
    <Legend cells={cells} highlight={null} onHighlight={() => {}}
            badges={[]} onBadges={vi.fn()}
            highlightTag={null} onHighlightTag={vi.fn()}
            onClose={vi.fn()} />);
  for (const s of STATES) {
    const row = container.querySelector(`[data-state="${s.key}"]`);
    expect(row?.getAttribute('aria-label')).toMatch(
      new RegExp(`^${s.label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}, `));
  }
});
```

- [ ] **Step 2: Run it — it should pass without touching Legend.tsx**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/Legend.test.tsx
```

Expected: all pass. **If it fails**, the component grew its own copy of the
order or labels since this plan was written — point it back at `CELL_STATES`
and `STATE_LABEL`, and change nothing about the tally logic, the hover/focus
handlers, or the badge rows from the in-flight feature.

- [ ] **Step 3: Confirm the props list is still current**

The test above passes eight props. `LegendProps` also declares an optional
`tagCells`. If `npm run typecheck` reports a missing required prop, the
component gained one after this plan was written — add it to both renders
rather than making it optional.

- [ ] **Step 4: Run the whole corpus directory**

```bash
cd ~/src/brick-icons/lab && npx vitest run src/corpus/
```

Expected: everything passes, goldens included. This is the phase's own gate,
and it is one directory — not the repo suite.

- [ ] **Step 5: Typecheck**

```bash
cd ~/src/brick-icons/lab && npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Look at the wall**

```bash
cd ~/src/brick-icons/lab && npm run dev
```

Open `http://localhost:5178/corpus.html`. Confirm by eye: legend rows in the
same order with the same counts; the params panel's color rows present and
labeled; dragging a color swatch still repaints the wall live. The goldens
prove `paintCommands` did not move, but they say nothing about the CSS custom
property path, which is the one thing in this phase they cannot cover.

- [ ] **Step 7: Pre-push gate**

Only now, once, before pushing:

```bash
cd ~/src/brick-icons/lab && npm test
cd ~/src/brick-icons && python -m pytest -q
```

- [ ] **Step 8: Commit and clean up the worktree**

```bash
cd ~/src/brick-icons
git add lab/src/corpus/Legend.test.tsx
git commit -m "pin the legend's rows to the state table's order

Legend already read CELL_STATES and STATE_LABEL, so this is the test
that keeps it that way now those two are generated."
git worktree remove ../brick-icons-goldens
```

---

## What this phase does not do

The state table still holds TypeScript predicates, not CEL. That conversion
belongs with the `wall` lift in Phase 3, because introducing a CEL dependency
into `brick-icons` before the package exists means adding it twice. Task 1
exists to settle *which* CEL, cheaply and early, so Phase 3 is not the place
that discovers the two languages disagree.

`select.ts`'s sorts, filters and classes are also untouched. They are the same
shape of change as the states, but they have no golden covering them and no
equivalent of the ten-copy problem — one table each, read in one place. They
convert in Phase 3 along with the rest of the spec.
