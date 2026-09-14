"""Write every Unicode code point, and the assigned ones, as wall feeds.

    hosts/unicode/.venv/bin/python hosts/unicode/make.py --out hosts/unicode/out
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from pezlie.feed import write_table

import ucd

HERE = Path(__file__).parent
COLLECTIONS = ("codepoints", "assigned")
#: The one slot each collection has until fonts are rendered into it.
SLOT = "ucd"
DICTIONARY = ["kind", "gc", "block", "script", "age"]


def columns(db: ucd.Database, keep=None) -> dict[str, list]:
    cps = [cp for cp in range(ucd.CODE_POINTS) if keep is None or keep(cp)]
    return {
        "id": [f"U+{cp:04X}" for cp in cps],
        "index": list(range(len(cps))),
        "sha": [None] * len(cps),
        "cp": cps,
        "kind": [db.kind(cp) for cp in cps],
        "gc": [db.gc[cp] for cp in cps],
        "block": [db.block[cp] for cp in cps],
        "script": [db.script[cp] for cp in cps],
        "age": [db.age[cp] for cp in cps],
        "plane": [cp >> 16 for cp in cps],
        "name": [db.name[cp] for cp in cps],
    }


def make(out: Path, cache: Path = HERE / ".ucd") -> dict[str, int]:
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    db = ucd.parse(ucd.fetch(cache))
    print(f"  1/3 parsed UCD {ucd.VERSION} in {time.perf_counter() - t0:5.1f} s")
    counts = {}
    for i, (collection, keep) in enumerate(
            [("codepoints", None), ("assigned", lambda cp: db.kind(cp) == "assigned")], 2):
        t0 = time.perf_counter()
        cols = columns(db, keep)
        write_table(out / f"{collection}.arrow", cols, dictionary=DICTIONARY)
        counts[collection] = len(cols["id"])
        print(f"  {i}/3 wrote {collection}.arrow, {counts[collection]:>9,} rows "
              f"in {time.perf_counter() - t0:5.1f} s")
    (out / "counts.json").write_text(json.dumps(counts))
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=HERE / "out")
    make(parser.parse_args().out)
