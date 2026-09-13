# Phase 2: lift `bakery` — Implementation Plan

> **IN PROGRESS — 2026-09-13**, branch `phase-2-bakery`. Update this line when it lands.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a domain-free Python package, `castleblack/bakery`, that bakes one slot's renders into the wall's mip chain and serves it — producing byte-identical output to brick-icons' `brick_icons/thumbs.py`, with two failures made loud that are silent today.

**Architecture:** `thumbs.py` is split by responsibility into `sheet` (geometry), `sidecar` (the sha map), `bake` (rasterize and compose), `lock` (single writer), `batch` (the per-slot loop that lives in `scripts/bake-thumbs.py` today) and `routes` (the sheet, tile and render endpoints from `brick_icons/lab/app.py`, as mountable FastAPI routers). The host supplies three things: the list of renders for a slot, the full item order, and the lookups the routes need. A parity test bakes the same inputs through brick-icons' file and through `bakery` and compares bytes.

**Tech Stack:** Python ≥3.11 (developed on 3.14), Pillow, `resvg` on `PATH`, FastAPI for the optional routes, pytest, `uv` for the environment.

**Read against:** brick-icons `main` at `df62a42` (2026-09-13). The files lifted are `brick_icons/thumbs.py`, `scripts/bake-thumbs.py`, and the `/api/thumbs/*` and `/api/corpus/render/*` routes in `brick_icons/lab/app.py`, with their tests in `tests/test_thumbs.py` and `tests/test_lab_app.py`.

---

## What changed since the spec was written

**The ground-color change is moot.** The spec had `bakery` declare a ground and the manifest report it. brick-icons has since stopped baking a ground at all: `GROUND` is transparent, the wall paints the ground under every rung, and `test_no_ground_is_baked_in_either_language` pins both sides. `bakery` keeps the transparent ground and asserts it at the pixel. The half of that test that parses `paint.ts` stays in brick-icons until the wall moves.

**brick-icons does not switch over in this phase.** A path dependency from brick-icons' `pyproject.toml` onto `castleblack` would break `uv sync` on every fleet node without a castleblack checkout, and castleblack has no remote. Switching stays spec step 7. Until then the parity test is what keeps the two copies honest.

## Scope

In: the six modules above, their tests, the parity test, a README, and a one-off parity check against real renders.

Out: the item feed (`/api/corpus/cells`) — it is the host's SQL today and becomes `derive` over a schema in Phase 3. Anything TypeScript.

## New behavior, and why

1. **Single writer.** `bake_item`, `compose` and `bake_slot` take an exclusive non-blocking `flock` on `<slot>/.bake.lock` and raise `BakeInProgress` rather than interleave. brick-icons' `test_a_truncated_sidecar_is_a_cache_miss_not_a_crash` exists because two bakes overlapped; that test tolerates the damage, and this prevents it.
2. **A repeated id in `order` is refused.** An index is a position in the full order, so a duplicate shifts every later cell one place — which reads as a rendering fault, not a data fault. `compose` raises `ValueError` naming the repeats.

Everything else is a rename (`part_id` → `item_id`, `bake_part` → `bake_item`) and must not move a byte.

## File structure

**Created, all under `castleblack/bakery/`:**
- `pyproject.toml` — package `bakery`, extras `routes` and `test`.
- `README.md` — the contract a host signs up to, and setup.
- `src/bakery/__init__.py`
- `src/bakery/sheet.py` — `SHEET_LEVELS`, `LOOSE_LEVEL`, `LEVELS`, `GUTTER`, `GROUND`, `Geometry`, `geometry`.
- `src/bakery/sidecar.py` — `BAKED`, `read_json`, `write_json`, `baked_shas`.
- `src/bakery/lock.py` — `slot_lock`, `BakeInProgress`.
- `src/bakery/bake.py` — `THUMB_EXT`, `THUMB_SAVE`, `bake_item`, `compose`.
- `src/bakery/batch.py` — `Render`, `bake_slot`.
- `src/bakery/routes.py` — `thumbs_router`, `render_router`, `MEDIA_TYPES`.
- `tests/conftest.py`, `tests/test_sheet.py`, `tests/test_bake.py`, `tests/test_lock.py`, `tests/test_batch.py`, `tests/test_routes.py`, `tests/test_parity.py`.

**Modified:** `castleblack/.gitignore`.

---

## Task 0: Scaffold

**Files:** Create `bakery/pyproject.toml`, `bakery/src/bakery/__init__.py`, `bakery/tests/conftest.py`; modify `.gitignore`.

- [ ] **Step 1: Write `bakery/pyproject.toml`**

```toml
[project]
name = "bakery"
version = "0.1.0"
description = "Bake per-item renders into a mip chain of sprite sheets, and serve them"
requires-python = ">=3.11"
dependencies = ["pillow>=10"]

[project.optional-dependencies]
routes = ["fastapi>=0.110"]
test = ["pytest>=8", "fastapi>=0.110", "httpx>=0.27"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/bakery"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Write `src/bakery/__init__.py`**

```python
"""Bake per-item renders into a mip chain of sprite sheets, and serve them."""
```

- [ ] **Step 3: Write `tests/conftest.py`**

```python
import pytest

SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 170">'
       '<rect x="0" y="0" width="256" height="170" fill="black"/></svg>')


@pytest.fixture
def svg(tmp_path):
    path = tmp_path / "render.svg"
    path.write_text(SVG)
    return path
```

- [ ] **Step 4: Ignore the environment** — append to `.gitignore`:

```
bakery/.venv/
__pycache__/
```

- [ ] **Step 5: Create the environment**

Run: `uv venv bakery/.venv --python 3.14 && uv pip install --python bakery/.venv/bin/python -e 'bakery[test]'`
Then: `bakery/.venv/bin/python -m pytest bakery -q` — Expected: `no tests ran`.

- [ ] **Step 6: Commit** — `git add .gitignore bakery && git commit -m "scaffold the bakery package"`

## Task 1: Sheet geometry

**Files:** Create `src/bakery/sheet.py`; test `tests/test_sheet.py`.

- [ ] **Step 1: Write the failing tests** — ported from brick-icons `tests/test_thumbs.py`, names kept so the two suites can be read side by side.

```python
import pytest

from bakery import sheet


def test_levels_are_the_two_sheets_and_the_loose_one():
    assert sheet.SHEET_LEVELS == (8, 32)
    assert sheet.LOOSE_LEVEL == 128


def test_the_grid_is_square_enough_to_hold_every_item():
    g = sheet.geometry(24591, level=32)
    assert (g.cols, g.rows) == (157, 157)


def test_the_coarsest_level_has_no_gutter():
    assert sheet.geometry(100, level=8).gutter == 0
    assert sheet.geometry(100, level=32).gutter == 2


def test_pitch_is_the_cell_plus_both_gutters():
    g = sheet.geometry(100, level=32)
    assert g.pitch == 36
    assert g.size == g.cols * 36


def test_a_cell_lands_row_major_inside_its_gutter():
    g = sheet.geometry(100, level=32)  # cols == 10
    assert g.cell_box(0) == (2, 2, 34, 34)
    assert g.cell_box(1) == (38, 2, 70, 34)
    assert g.cell_box(10) == (2, 38, 34, 70)


def test_an_index_past_the_grid_is_an_error():
    g = sheet.geometry(4, level=8)
    with pytest.raises(IndexError):
        g.cell_box(g.cols * g.rows)


def test_the_loose_level_is_not_a_sheet():
    with pytest.raises(ValueError):
        sheet.geometry(100, level=sheet.LOOSE_LEVEL)


def test_a_square_sheet_never_crops_an_uneven_grid():
    g = sheet.geometry(82, level=32)
    assert (g.cols, g.rows) == (10, 9)
    assert g.cell_box(81)[3] <= g.size


def test_a_tiny_corpus_still_has_a_grid():
    for count in (0, 1):
        g = sheet.geometry(count, level=8)
        assert (g.cols, g.rows) == (1, 1)


def test_the_ground_is_transparent():
    assert sheet.GROUND == (0, 0, 0, 0)
```

- [ ] **Step 2: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_sheet.py -q` — Expected: collection error, `cannot import name 'sheet'`.

- [ ] **Step 3: Implement `src/bakery/sheet.py`**

```python
"""Where a cell sits on a sheet: the level chain and the grid geometry."""
from __future__ import annotations

import math
from dataclasses import dataclass

SHEET_LEVELS = (8, 32)
LOOSE_LEVEL = 128
#: The coarsest sheet ends the mip chain, so it cannot bleed and needs no
#: padding. Every finer sheet does.
GUTTER = 2
LEVELS = (*SHEET_LEVELS, LOOSE_LEVEL)

#: The bake owns the ink and the wall owns the ground. A baked ground makes
#: the zoom rungs disagree, and a cell changes shade on one wheel notch.
GROUND = (0, 0, 0, 0)


@dataclass(frozen=True)
class Geometry:
    count: int
    level: int
    cols: int
    rows: int
    gutter: int

    @property
    def pitch(self) -> int:
        return self.level + 2 * self.gutter

    @property
    def size(self) -> int:
        return self.cols * self.pitch

    def cell_box(self, index: int) -> tuple[int, int, int, int]:
        """The cell's (left, top, right, bottom) on the sheet, gutters excluded."""
        if not 0 <= index < self.cols * self.rows:
            raise IndexError(f"cell {index} is outside a {self.cols}x{self.rows} grid")
        col, row = index % self.cols, index // self.cols
        x = col * self.pitch + self.gutter
        y = row * self.pitch + self.gutter
        return (x, y, x + self.level, y + self.level)


def geometry(count: int, level: int) -> Geometry:
    if level not in SHEET_LEVELS:
        raise ValueError(f"{level} is not a sheet level; sheets are {SHEET_LEVELS}")
    cols = max(1, math.ceil(math.sqrt(count)))
    # cols >= sqrt(count) keeps rows <= cols, so the square sheet never crops.
    rows = max(1, math.ceil(count / cols))
    gutter = 0 if level == min(SHEET_LEVELS) else GUTTER
    return Geometry(count=count, level=level, cols=cols, rows=rows, gutter=gutter)
```

- [ ] **Step 4: Run** the same command — Expected: `10 passed`.
- [ ] **Step 5: Commit** — `git commit -m "lift the sheet geometry into bakery"`

## Task 2: Bake and compose, ported unchanged

**Files:** Create `src/bakery/sidecar.py`, `src/bakery/bake.py`; test `tests/test_bake.py`.

`bake.py` is written with the lock already wired in Task 3's shape, but `lock.py` does not exist yet — so this task gives `bake.py` plain internals and Task 3 adds the public wrappers' locking. To keep one version of the file in this plan, Task 2 creates `lock.py` as a no-op context manager and Task 3 replaces it with the real one under its own failing test.

- [ ] **Step 1: Write the failing tests**

```python
import json

import pytest
from PIL import Image

from bakery import bake
from bakery.sheet import LEVELS, geometry
from bakery.sidecar import BAKED, baked_shas, write_json


def test_it_rasterizes_every_level_for_one_item(tmp_path, svg):
    out = tmp_path / "slot"
    assert sorted(bake.bake_item("3001", svg, out, sha="abc123")) == [8, 32, 128]
    for level in (8, 32, 128):
        with Image.open(out / str(level) / f"3001.{bake.THUMB_EXT}") as img:
            assert img.size == (level, level)


def test_a_baked_cell_is_letterboxed_square_with_ink_and_no_ground(tmp_path, svg):
    out = tmp_path / "slot"
    bake.bake_item("3001", svg, out, sha="abc123")
    with Image.open(out / "128" / f"3001.{bake.THUMB_EXT}") as img:
        rgba = img.convert("RGBA")
        assert rgba.size == (128, 128)
        assert rgba.getpixel((2, 2))[3] == 0
        assert rgba.getpixel((64, 64))[3] == 255


def test_it_bakes_a_raster_render_without_going_near_resvg(tmp_path):
    src = tmp_path / "3001.webp"
    Image.new("RGBA", (256, 170), (0, 0, 0, 255)).save(src, "WEBP")
    out = tmp_path / "slot"
    assert sorted(bake.bake_item("3001", src, out, sha="abc123")) == [8, 32, 128]
    with Image.open(out / "128" / f"3001.{bake.THUMB_EXT}") as img:
        assert img.convert("RGBA").getpixel((2, 2))[3] == 0
        assert img.convert("RGBA").getpixel((64, 64))[3] == 255


def test_it_skips_an_item_whose_sha_is_unchanged(tmp_path, svg):
    out = tmp_path / "slot"
    bake.bake_item("3001", svg, out, sha="abc123")
    assert bake.bake_item("3001", svg, out, sha="abc123") == []
    assert bake.bake_item("3001", svg, out, sha="different") != []


def test_the_baked_sha_is_readable_back(tmp_path, svg):
    out = tmp_path / "slot"
    bake.bake_item("3001", svg, out, sha="abc123")
    assert baked_shas(out) == {"3001": "abc123"}


def _baked(tmp_path, svg, ids):
    out = tmp_path / "slot"
    for item_id in ids:
        bake.bake_item(item_id, svg, out, sha=f"sha-{item_id}")
    return out


def test_the_sheet_is_one_page_sized_from_the_item_count(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a", "b", "c"])
    bake.compose(out, order=["a", "b", "c", "d"])
    for level in (8, 32):
        with Image.open(out / f"sheet-{level}.{bake.THUMB_EXT}") as img:
            assert img.size == (geometry(4, level).size,) * 2


def test_the_manifest_names_the_geometry_and_what_is_baked(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a", "c"])
    bake.compose(out, order=["a", "b", "c", "d"])
    m = json.loads((out / "sheet-32.json").read_text())
    assert (m["level"], m["gutter"], m["pitch"], m["cols"], m["count"]) == (32, 2, 36, 2, 4)
    assert m["baked"] == {"a": "sha-a", "c": "sha-c"}


def test_an_item_with_no_tile_leaves_its_cell_empty(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a"])
    bake.compose(out, order=["a", "b"])
    g = geometry(2, 32)
    with Image.open(out / f"sheet-32.{bake.THUMB_EXT}") as img:
        assert img.crop(g.cell_box(0)).getextrema()[3][1] > 0
        assert img.crop(g.cell_box(1)).getextrema()[3][1] == 0


def test_the_gutter_replicates_the_cell_edge(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a"])
    bake.compose(out, order=["a", "b"])
    x0, y0, _, _ = geometry(2, 32).cell_box(0)
    with Image.open(out / f"sheet-32.{bake.THUMB_EXT}") as img:
        assert img.getpixel((x0 - 1, y0)) == img.getpixel((x0, y0))


def test_a_truncated_sidecar_is_a_cache_miss_not_a_crash(tmp_path):
    (tmp_path / BAKED).write_text("")
    assert baked_shas(tmp_path) == {}
    (tmp_path / BAKED).write_text("{oh no")
    assert baked_shas(tmp_path) == {}


def test_a_sidecar_is_written_whole_or_not_at_all(tmp_path):
    write_json(tmp_path / "x.json", {"a": "1"})
    assert json.loads((tmp_path / "x.json").read_text()) == {"a": "1"}
    assert not list(tmp_path.glob("*.tmp"))


def test_a_format_change_rebakes_rather_than_composing_missing_tiles(
        tmp_path, svg, monkeypatch):
    out = tmp_path / "slot"
    assert bake.bake_item("3001", svg, out, sha="abc") == list(LEVELS)
    assert bake.bake_item("3001", svg, out, sha="abc") == []
    monkeypatch.setattr(bake, "THUMB_EXT", "png")
    monkeypatch.setattr(bake, "THUMB_SAVE", {"format": "PNG"})
    assert bake.bake_item("3001", svg, out, sha="abc") == list(LEVELS)
    for level in LEVELS:
        assert (out / str(level) / "3001.png").is_file()
```

- [ ] **Step 2: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_bake.py -q` — Expected: collection error, `cannot import name 'bake'`.

- [ ] **Step 3: Implement `src/bakery/sidecar.py`**

```python
"""The slot's JSON sidecars: which sha each item was baked from."""
from __future__ import annotations

import json
import os
from pathlib import Path

BAKED = "baked.json"


def read_json(path: Path) -> dict:
    """An unreadable sidecar is a cache miss, not a crash: baking again
    recovers every value in it."""
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        return {}


def write_json(path: Path, data: dict) -> None:
    """Whole or not at all: `write_text` truncates first, and a reader that
    arrives mid-write takes the empty file for the truth."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    os.replace(tmp, path)


def baked_shas(out: Path | str) -> dict[str, str]:
    return read_json(Path(out) / BAKED)
```

- [ ] **Step 4: Implement a placeholder `src/bakery/lock.py`** (replaced in Task 3)

```python
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def slot_lock(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    yield
```

- [ ] **Step 5: Implement `src/bakery/bake.py`**

```python
"""Rasterize an item at every level, and compose the levels into sheets.

An item's cell is its position in the host's full order, so a render landing
later fills the cell it already had rather than renumbering the sheet.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image

from bakery.lock import slot_lock
from bakery.sheet import GROUND, LEVELS, LOOSE_LEVEL, SHEET_LEVELS, geometry
from bakery.sidecar import BAKED, baked_shas, write_json

#: WebP q90 halves sheet-32 against PNG, and the wall fetches it on every open.
THUMB_EXT = "webp"
THUMB_SAVE = {"format": "WEBP", "quality": 90, "method": 4}


def bake_item(item_id: str, render: Path | str, out: Path | str,
              sha: str) -> list[int]:
    """Rasterize one item at every level. Returns the levels written; an
    unchanged sha writes nothing."""
    out = Path(out)
    with slot_lock(out):
        return _bake_item(item_id, Path(render), out, sha)


def compose(out: Path | str, order: list[str]) -> list[Path]:
    """Paste every baked tile onto its sheet at its index in `order`.

    `order` is every item, drawn or not: an index is a position in the corpus.
    """
    out = Path(out)
    with slot_lock(out):
        return _compose(out, order)


def _bake_item(item_id: str, render: Path, out: Path, sha: str) -> list[int]:
    shas = baked_shas(out)
    # The sha covers the render, not the encoding: a tile in an old format is a miss.
    if shas.get(item_id) == sha and all(
            (out / str(level) / f"{item_id}.{THUMB_EXT}").is_file()
            for level in LEVELS):
        return []
    drawn = _drawn(item_id, render, out)
    for level in LEVELS:
        path = out / str(level) / f"{item_id}.{THUMB_EXT}"
        path.parent.mkdir(parents=True, exist_ok=True)
        _square(drawn, level).save(path, **THUMB_SAVE)
    write_json(out / BAKED, {**shas, item_id: sha})
    return list(LEVELS)


def _compose(out: Path, order: list[str]) -> list[Path]:
    shas = baked_shas(out)
    written = []
    for level in SHEET_LEVELS:
        g = geometry(len(order), level)
        sheet = Image.new("RGBA", (g.size, g.size), (0, 0, 0, 0))
        for index, item_id in enumerate(order):
            tile = out / str(level) / f"{item_id}.{THUMB_EXT}"
            if not tile.is_file():
                continue
            with Image.open(tile) as img:
                cell = img.convert("RGBA")
            x0, y0, _, _ = g.cell_box(index)
            sheet.paste(cell, (x0, y0))
            if g.gutter:
                _replicate_edges(sheet, cell, x0, y0, g.gutter)
        path = out / f"sheet-{level}.{THUMB_EXT}"
        sheet.save(path, **THUMB_SAVE)
        write_json(out / f"sheet-{level}.json", {
            "level": level, "gutter": g.gutter, "pitch": g.pitch,
            "cols": g.cols, "rows": g.rows, "count": len(order),
            "size": g.size, "baked": shas,
        })
        written.append(path)
    return written


def _drawn(item_id: str, render: Path, out: Path) -> Image.Image:
    """The render at `LOOSE_LEVEL` wide, as RGBA.

    resvg has no letterbox flag, and passing both -w and -h stretches, so it is
    asked for a width and `_square` pads. A raster render skips resvg, which
    rejects one as "not an UTF-8 encoding" -- reading like a corrupt file.
    """
    if render.suffix.lower() != ".svg":
        with Image.open(render) as img:
            return img.convert("RGBA")
    wide = out / f".{item_id}.wide.png"
    proc = subprocess.run(
        ["resvg", "--width", str(LOOSE_LEVEL), str(render), str(wide)],
        capture_output=True, text=True)
    if proc.returncode != 0 or not wide.is_file():
        raise RuntimeError(f"resvg failed on {item_id}: "
                           f"{(proc.stderr or proc.stdout).strip()[:200]}")
    try:
        with Image.open(wide) as img:
            return img.convert("RGBA")
    finally:
        wide.unlink(missing_ok=True)


def _replicate_edges(sheet: Image.Image, cell: Image.Image,
                     x0: int, y0: int, gutter: int) -> None:
    """Pad a cell with its own edge pixels, or each mip reduction averages it
    against its neighbor and the wall reads as halos."""
    w, h = cell.size
    for d in range(1, gutter + 1):
        sheet.paste(cell.crop((0, 0, w, 1)), (x0, y0 - d))
        sheet.paste(cell.crop((0, h - 1, w, h)), (x0, y0 + h + d - 1))
        sheet.paste(cell.crop((0, 0, 1, h)), (x0 - d, y0))
        sheet.paste(cell.crop((w - 1, 0, w, h)), (x0 + w + d - 1, y0))


def _square(drawn: Image.Image, level: int) -> Image.Image:
    """Fit a render, centered, inside a `GROUND` square of `level` px."""
    scale = level / max(drawn.size)
    size = (max(1, round(drawn.width * scale)), max(1, round(drawn.height * scale)))
    cell = Image.new("RGBA", (level, level), GROUND)
    fitted = drawn.resize(size, Image.LANCZOS)
    cell.paste(fitted, ((level - size[0]) // 2, (level - size[1]) // 2), fitted)
    return cell
```

- [ ] **Step 6: Run** the test command — Expected: `12 passed`.
- [ ] **Step 7: Commit** — `git commit -m "lift bake and compose into bakery, item for part"`

## Task 3: A repeated id is refused

**Files:** Modify `src/bakery/bake.py`; test `tests/test_bake.py`.

- [ ] **Step 1: Append the failing test to `tests/test_bake.py`**

```python
def test_compose_refuses_an_order_that_repeats_an_id(tmp_path):
    with pytest.raises(ValueError, match="repeats 1 id"):
        bake.compose(tmp_path, order=["a", "b", "a"])
```

- [ ] **Step 2: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_bake.py -q -k repeats` — Expected: FAIL, `DID NOT RAISE`.

- [ ] **Step 3: Implement** — at the top of `_compose`, and add `from collections import Counter` to the imports:

```python
    repeated = [item_id for item_id, n in Counter(order).items() if n > 1]
    if repeated:
        raise ValueError(f"order repeats {len(repeated)} id(s), first {repeated[:3]}: "
                         "every cell after one lands a place off")
```

- [ ] **Step 4: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_bake.py -q` — Expected: `13 passed`.
- [ ] **Step 5: Commit** — `git commit -m "refuse an order that repeats an id"`

## Task 4: Single writer

**Files:** Replace `src/bakery/lock.py`; test `tests/test_lock.py`.

- [ ] **Step 1: Write the failing tests**

```python
import pytest

from bakery import bake
from bakery.lock import BakeInProgress, slot_lock


def test_compose_refuses_while_another_bake_holds_the_slot(tmp_path):
    with slot_lock(tmp_path):
        with pytest.raises(BakeInProgress):
            bake.compose(tmp_path, order=["a"])


def test_bake_item_refuses_while_another_bake_holds_the_slot(tmp_path, svg):
    out = tmp_path / "slot"
    with slot_lock(out):
        with pytest.raises(BakeInProgress):
            bake.bake_item("a", svg, out, sha="x")


def test_a_failed_bake_releases_the_slot(tmp_path):
    with pytest.raises(ValueError):
        bake.compose(tmp_path, order=["a", "a"])
    assert bake.compose(tmp_path, order=["a"])
```

- [ ] **Step 2: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_lock.py -q` — Expected: collection error, `cannot import name 'BakeInProgress'`.

- [ ] **Step 3: Replace `src/bakery/lock.py`**

```python
"""One writer per slot. Two bakers over one directory interleave their
sidecar writes and leave a sheet that matches neither."""
from __future__ import annotations

import fcntl
import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

LOCK = ".bake.lock"


class BakeInProgress(RuntimeError):
    """Another bake holds the slot. Refused rather than queued: a baker that
    waits would compose a sheet from whatever the other left behind."""


@contextmanager
def slot_lock(out: Path) -> Iterator[None]:
    out.mkdir(parents=True, exist_ok=True)
    fd = os.open(out / LOCK, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BakeInProgress(f"another bake holds {out / LOCK}") from None
        yield
    finally:
        os.close(fd)
```

- [ ] **Step 4: Run** `bakery/.venv/bin/python -m pytest bakery -q` — Expected: `26 passed`.
- [ ] **Step 5: Commit** — `git commit -m "take a lock per slot, and refuse a second baker"`

## Task 5: The per-slot loop

**Files:** Create `src/bakery/batch.py`; test `tests/test_batch.py`.

- [ ] **Step 1: Write the failing tests**

```python
import pytest

from bakery.batch import Render, bake_slot
from bakery.lock import BakeInProgress, slot_lock
from bakery.sidecar import baked_shas


def test_it_bakes_every_render_and_composes_the_sheets(tmp_path, svg):
    out, lines = tmp_path / "slot", []
    got = bake_slot([Render("a", svg, "s1"), Render("b", svg, "s2")], out,
                    order=["a", "b", "c"], log=lines.append)
    assert got == (2, 2)
    assert baked_shas(out) == {"a": "s1", "b": "s2"}
    assert (out / "sheet-32.webp").is_file()
    assert lines[0] == "  1/2 a baked"


def test_a_second_run_bakes_nothing(tmp_path, svg):
    out, lines = tmp_path / "slot", []
    renders = [Render("a", svg, "s1")]
    bake_slot(renders, out, order=["a"], log=lambda _: None)
    assert bake_slot(renders, out, order=["a"], log=lines.append) == (0, 1)
    assert lines[0] == "  1/1 a fresh"


def test_a_missing_render_is_reported_and_the_slot_goes_on(tmp_path, svg):
    out, lines = tmp_path / "slot", []
    got = bake_slot([Render("gone", tmp_path / "nope.svg", "s"), Render("a", svg, "s")],
                    out, order=["gone", "a"], log=lines.append)
    assert got == (1, 2)
    assert "MISSING" in lines[0]
    assert (out / "sheet-8.webp").is_file()


def test_an_unreadable_render_does_not_abandon_the_rest(tmp_path, svg):
    empty = tmp_path / "empty.svg"
    empty.write_text("")
    out, lines = tmp_path / "slot", []
    got = bake_slot([Render("bad", empty, "s"), Render("a", svg, "s")],
                    out, order=["bad", "a"], log=lines.append)
    assert got == (1, 2)
    assert "UNREADABLE" in lines[0]


def test_it_refuses_a_slot_another_bake_holds(tmp_path, svg):
    out = tmp_path / "slot"
    with slot_lock(out):
        with pytest.raises(BakeInProgress):
            bake_slot([Render("a", svg, "s")], out, order=["a"], log=lambda _: None)
```

- [ ] **Step 2: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_batch.py -q` — Expected: collection error, `No module named 'bakery.batch'`.

- [ ] **Step 3: Implement `src/bakery/batch.py`**

```python
"""Bake one slot: every render the host has for it, then the sheets."""
from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

from bakery.bake import _bake_item, _compose
from bakery.lock import slot_lock


@dataclass(frozen=True)
class Render:
    id: str
    path: Path
    sha: str


def bake_slot(renders: Iterable[Render], out: Path | str, order: list[str],
              log: Callable[[str], None] = print) -> tuple[int, int]:
    """Returns (baked, total). One line per render as it completes.

    A render that is missing or will not rasterize is reported and skipped:
    an interrupted fetch leaves zero-byte files, and one of them is not a
    reason to abandon the thousands after it.
    """
    out, renders = Path(out), list(renders)
    total, baked = len(renders), 0
    with slot_lock(out):
        for i, r in enumerate(renders, 1):
            if not r.path.is_file():
                log(f"  {i}/{total} {r.id} MISSING {r.path}")
                continue
            try:
                made = _bake_item(r.id, r.path, out, r.sha)
            except Exception as e:  # noqa: BLE001
                log(f"  {i}/{total} {r.id} UNREADABLE {type(e).__name__}: {e}")
                continue
            baked += bool(made)
            log(f"  {i}/{total} {r.id} {'baked' if made else 'fresh'}")
        for path in _compose(out, order):
            log(f"  wrote {path}")
    return baked, total
```

- [ ] **Step 4: Run** `bakery/.venv/bin/python -m pytest bakery -q` — Expected: `31 passed`.
- [ ] **Step 5: Commit** — `git commit -m "lift the per-slot bake loop into bakery"`

## Task 6: Routes

**Files:** Create `src/bakery/routes.py`; test `tests/test_routes.py`.

- [ ] **Step 1: Write the failing tests**

```python
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from bakery.routes import render_router, thumbs_router


@pytest.fixture
def client(tmp_path):
    slot = tmp_path / "thumbs" / "naive"
    (slot / "128").mkdir(parents=True)
    Image.new("RGBA", (128, 128)).save(slot / "128" / "3001.webp", "WEBP")
    Image.new("RGBA", (8, 8)).save(slot / "sheet-8.webp", "WEBP")
    (slot / "sheet-8.json").write_text('{"level": 8}')
    (slot / "baked.json").write_text("{}")

    store = tmp_path / "store"
    (store / "naive").mkdir(parents=True)
    (store / "naive" / "3001.svg").write_text("<svg viewBox='0 0 256 170'></svg>")
    (store / "naive" / "3002.webp").write_bytes(b"RIFF\x00\x00\x00\x00WEBPVP8 ")
    (tmp_path / "outside.svg").write_text("<svg>not in the store</svg>")
    renders = {("naive", "3001"): store / "naive" / "3001.svg",
               ("naive", "3002"): store / "naive" / "3002.webp",
               ("naive", "escape"): store / ".." / "outside.svg"}

    slots = {"naive"}
    app = FastAPI()
    app.include_router(thumbs_router(
        lambda s: tmp_path / "thumbs" / s if s in slots else None), prefix="/api/thumbs")
    app.include_router(render_router(
        lambda s, i: renders.get((s, i)), store, lambda s: s in slots),
        prefix="/api/corpus/render")
    return TestClient(app)


def test_a_loose_tile_is_served_whatever_extension_was_asked(client):
    r = client.get("/api/thumbs/naive/128/3001.png")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/webp"


def test_a_sheet_is_served(client):
    assert client.get("/api/thumbs/naive/sheet-8.webp").status_code == 200


def test_a_manifest_carries_its_image_version(client):
    body = client.get("/api/thumbs/naive/sheet-8.json").json()
    assert body["level"] == 8
    assert body["version"].isdigit()


def test_a_missing_manifest_is_404(client):
    assert client.get("/api/thumbs/naive/sheet-32.json").status_code == 404


def test_an_unknown_slot_is_400(client):
    assert client.get("/api/thumbs/nonsense/128/3001.png").status_code == 400


def test_a_tile_route_serves_images_only(client):
    assert client.get("/api/thumbs/naive/128/baked.json").status_code == 400


def test_a_tile_route_refuses_traversal(client):
    assert client.get(
        "/api/thumbs/naive/128/..%2F..%2Fbaked.json").status_code in (400, 404)


def test_a_render_is_served(client):
    r = client.get("/api/corpus/render/naive/3001.svg")
    assert r.status_code == 200
    assert "<svg" in r.text


def test_a_render_is_typed_by_what_it_is_not_by_its_url(client):
    r = client.get("/api/corpus/render/naive/3002.svg")
    assert r.headers["content-type"] == "image/webp"


def test_an_unknown_render_is_404(client):
    assert client.get("/api/corpus/render/naive/9999.svg").status_code == 404


def test_a_render_in_an_unknown_slot_is_400(client):
    assert client.get("/api/corpus/render/nonsense/3001.svg").status_code == 400


def test_a_render_outside_the_store_is_404(client):
    assert client.get("/api/corpus/render/naive/escape.svg").status_code == 404
```

- [ ] **Step 2: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_routes.py -q` — Expected: collection error, `No module named 'bakery.routes'`.

- [ ] **Step 3: Implement `src/bakery/routes.py`**

```python
"""Mountable routes for a baked slot and the renders behind it.

    app.include_router(thumbs_router(slot_dir), prefix="/api/thumbs")
    app.include_router(render_router(render_file, root, known_slot),
                       prefix="/api/corpus/render")
"""
from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

MEDIA_TYPES = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}


def _tile(base: Path, stem: str) -> Path | None:
    """The file for `stem` in whichever format it was baked: slots baked
    before WebP are PNG, so a request's extension is a name, not a format."""
    for ext in ("webp", "png"):
        path = base / f"{stem}.{ext}"
        if path.is_file():
            return path
    return None


def thumbs_router(slot_dir: Callable[[str], Path | None]) -> APIRouter:
    """`slot_dir` maps a slot name to its bake directory, or None for a slot
    the host does not have."""
    router = APIRouter()

    def _slot(slot: str) -> Path:
        base = slot_dir(slot)
        if base is None:
            raise HTTPException(400, f"no such slot: {slot}")
        return base

    @router.get("/{slot}/sheet-{level}.{ext}")
    def get_sheet(slot: str, level: int, ext: str):
        base = _slot(slot)
        if ext == "json":
            path = base / f"sheet-{level}.json"
            if not path.is_file():
                raise HTTPException(404, "no such sheet manifest")
            manifest = json.loads(path.read_text())
            # The image is rewritten at a URL the client never varies, so a
            # browser can hold last week's atlas against this manifest.
            image = _tile(base, f"sheet-{level}")
            if image is not None:
                manifest["version"] = str(int(image.stat().st_mtime))
            return JSONResponse(manifest)
        path = _tile(base, f"sheet-{level}")
        if path is None:
            raise HTTPException(404, "no such sheet")
        return FileResponse(path)

    @router.get("/{slot}/{level}/{name}")
    def get_tile(slot: str, level: int, name: str):
        if "/" in name or ".." in name or not name.endswith((".png", ".webp")):
            raise HTTPException(400, "bad thumbnail path")
        path = _tile(_slot(slot) / str(level), Path(name).stem)
        if path is None:
            raise HTTPException(404, "no such thumbnail")
        return FileResponse(path)

    return router


def render_router(render_file: Callable[[str, str], Path | None], root: Path,
                  known_slot: Callable[[str], bool]) -> APIRouter:
    """`render_file` names the render the host holds for an item in a slot.
    Only its answer reaches the filesystem, and it must resolve inside `root`."""
    router = APIRouter()
    store = Path(root).resolve()

    @router.get("/{slot}/{item_id}.svg")
    def get_render(slot: str, item_id: str):
        if not known_slot(slot):
            raise HTTPException(400, f"no such slot: {slot}")
        found = render_file(slot, item_id)
        path = found.resolve() if found is not None else None
        if path is None or store not in path.parents or not path.is_file():
            raise HTTPException(404, "no such render")
        # `.svg` is the wall's URL for a render, not a claim about the bytes.
        return FileResponse(path, media_type=MEDIA_TYPES.get(
            path.suffix, "application/octet-stream"))

    return router
```

- [ ] **Step 4: Run** `bakery/.venv/bin/python -m pytest bakery -q` — Expected: `43 passed`.
- [ ] **Step 5: Commit** — `git commit -m "serve a baked slot and its renders as mountable routes"`

## Task 7: Parity with brick-icons

**Files:** Create `tests/test_parity.py`.

This is a characterization test, so it is expected to pass on first run. Prove it can fail before trusting it by patching `bake.THUMB_SAVE` to quality 89 **in memory** and calling the test function. Do not edit `bake.py` for this: `89` and `90` are the same length, two edits inside one second leave the file's mtime and size unchanged, and Python keeps serving the bytecode compiled from the mutated source.

- [ ] **Step 1: Write the test**

```python
"""The lift renamed things and moved nothing: bakery and the brick-icons file
it came from bake the same inputs to the same bytes. Skips without a
brick-icons checkout beside castleblack, or at $BRICK_ICONS."""
import importlib.util
import os
from pathlib import Path

import pytest
from PIL import Image

from bakery import bake

LEGACY = (Path(os.environ.get("BRICK_ICONS")
               or Path(__file__).resolve().parents[3] / "brick-icons")
          / "brick_icons" / "thumbs.py")


def _legacy():
    if not LEGACY.is_file():
        pytest.skip(f"no brick-icons thumbs.py at {LEGACY}")
    spec = importlib.util.spec_from_file_location("legacy_thumbs", LEGACY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _renders(root: Path) -> dict[str, Path]:
    root.mkdir()
    wide = root / "wide.svg"
    wide.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 170">'
                    '<rect x="20" y="10" width="200" height="150" fill="#c33"/>'
                    '<circle cx="128" cy="85" r="60" fill="#36c"/></svg>')
    tall = root / "tall.svg"
    tall.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 240">'
                    '<path d="M0 240 L45 0 L90 240 Z" fill="#2a2"/></svg>')
    raster = root / "raster.webp"
    img = Image.new("RGBA", (256, 170))
    for x in range(256):
        for y in range(0, 170, 3):
            img.putpixel((x, y), (x, 255 - x, y, 255))
    img.save(raster, "WEBP")
    return {"a": wide, "b": tall, "c": raster}


def _files(root: Path) -> dict[str, bytes]:
    return {str(p.relative_to(root)): p.read_bytes()
            for p in sorted(root.rglob("*")) if p.is_file() and p.name != ".bake.lock"}


def test_a_slot_bakes_to_the_same_bytes_as_the_code_it_was_lifted_from(tmp_path):
    legacy = _legacy()
    renders = _renders(tmp_path / "src")
    order = ["a", "never-drawn", "b", "c"]

    for item_id, path in renders.items():
        legacy.bake_part(item_id, path, tmp_path / "legacy", sha=f"sha-{item_id}")
        bake.bake_item(item_id, path, tmp_path / "lifted", sha=f"sha-{item_id}")
    legacy.compose(tmp_path / "legacy", order)
    bake.compose(tmp_path / "lifted", order)

    before, after = _files(tmp_path / "legacy"), _files(tmp_path / "lifted")
    assert sorted(before) == sorted(after)
    assert [name for name in before if before[name] != after[name]] == []
```

- [ ] **Step 2: Run** `bakery/.venv/bin/python -m pytest bakery/tests/test_parity.py -q` — Expected: `1 passed`.
- [ ] **Step 3: Prove it can fail**

```bash
cd bakery && .venv/bin/python - <<'EOF'
import tempfile
from pathlib import Path
from bakery import bake
import tests.test_parity as t
bake.THUMB_SAVE = {**bake.THUMB_SAVE, "quality": 89}
try:
    t.test_a_slot_bakes_to_the_same_bytes_as_the_code_it_was_lifted_from(Path(tempfile.mkdtemp()))
    print("PASSED -- the test cannot see an encoding change")
except AssertionError:
    print("FAILED, as it should")
EOF
```

Expected: `FAILED, as it should`.
- [ ] **Step 4: Commit** — `git commit -m "pin bakery's output to the brick-icons bake it was lifted from"`

## Task 8: Parity on real renders

A one-off, not committed code: bake a sample of real renders from each slot through both implementations into the scratchpad and compare bytes. Read-only against brick-icons — renders are read from `out/`, never written, and nothing is baked into `out/thumbs`.

- [ ] **Step 1:** pick up to 200 rendered parts per slot from `corpus.db` (`SELECT part_id, path, sha256 FROM renders WHERE source = ?`), including every raster slot, over the full `parts` order.
- [ ] **Step 2:** run both implementations, compose, compare every file. Record the count of items, slots and differing files in "What it found".

## Task 9: Docs

- [ ] `bakery/README.md` — what the package does, the host contract (renders, full order, lookups; ink not ground; the index invariant; one writer), setup and test commands, `resvg` requirement.
- [ ] Spec — mark step 4 built; replace the ground-color paragraph with what is true; refresh the move table and the renderer section against brick-icons `df62a42`; record the weasel question as Open.
- [ ] `HANDOFF.md` and `~/src/PROJECTS.md` — current state.
- [ ] Update this plan's status line, and add "What it found".

## What this phase does not do

- brick-icons does not import `bakery` yet (see "What changed since the spec was written").
- No item feed, no schema, no CEL.
- No reader-side atomicity for sheet images: a route serving a sheet mid-write can still hand out a partial file. The lock stops writers colliding, not readers.
