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
