"""The Unicode Character Database, fetched once and parsed per code point."""
from __future__ import annotations

import hashlib
import urllib.request
from dataclasses import dataclass
from pathlib import Path

VERSION = "17.0.0"
BASE = f"https://www.unicode.org/Public/{VERSION}/ucd/"
SHA256 = {
    "UnicodeData.txt": "2e1efc1dcb59c575eedf5ccae60f95229f706ee6d031835247d843c11d96470c",
    "Blocks.txt": "c0edefaf1a19771e830a82735472716af6bf3c3975f6c2a23ffbe2580fbbcb15",
    "Scripts.txt": "9f5e50d3abaee7d6ce09480f325c706f485ae3240912527e651954d2d6b035bf",
    "DerivedAge.txt": "f8ecdf768bdc210f201abd271d9bc587825618a86a7046a8146cc816393f1998",
}
CODE_POINTS = 0x110000
KINDS = ("assigned", "unassigned", "private", "surrogate", "noncharacter")

_L = ["G", "GG", "N", "D", "DD", "R", "M", "B", "BB", "S", "SS", "", "J", "JJ", "C",
      "K", "T", "P", "H"]
_V = ["A", "AE", "YA", "YAE", "EO", "E", "YEO", "YE", "O", "WA", "WAE", "OE", "YO",
      "U", "WEO", "WE", "WI", "YU", "EU", "YI", "I"]
_T = ["", "G", "GG", "GS", "N", "NJ", "NH", "D", "L", "LG", "LM", "LB", "LS", "LT",
      "LP", "LH", "M", "B", "BS", "S", "SS", "NG", "J", "C", "K", "T", "P", "H"]


def fetch(cache: Path) -> Path:
    """Every file in `SHA256` under `cache`, downloaded if absent, checked always."""
    cache.mkdir(parents=True, exist_ok=True)
    for name, want in SHA256.items():
        path = cache / name
        if not path.is_file():
            print(f"  fetching {BASE}{name}")
            with urllib.request.urlopen(BASE + name) as response:
                path.write_bytes(response.read())
        got = hashlib.sha256(path.read_bytes()).hexdigest()
        if got != want:
            raise RuntimeError(f"{path} has sha256 {got}, expected {want}")
    return cache


def _ranges(path: Path):
    """(first, last, value) from a `XXXX..YYYY ; value` file."""
    for line in path.read_text(encoding="utf-8").splitlines():
        body = line.split("#", 1)[0].strip()
        if not body:
            continue
        span, value = (part.strip() for part in body.split(";", 1))
        first, _, last = span.partition("..")
        yield int(first, 16), int(last or first, 16), value


def _hangul(cp: int) -> str:
    s = cp - 0xAC00
    return "HANGUL SYLLABLE " + _L[s // 588] + _V[(s % 588) // 28] + _T[s % 28]


def _range_name(label: str, cp: int) -> str:
    if label.startswith("CJK Ideograph"):
        return f"CJK UNIFIED IDEOGRAPH-{cp:04X}"
    if label.startswith("Tangut Ideograph"):
        return f"TANGUT IDEOGRAPH-{cp:04X}"
    if label.startswith("Hangul Syllable"):
        return _hangul(cp)
    return ""


def is_noncharacter(cp: int) -> bool:
    return (cp & 0xFFFE) == 0xFFFE or 0xFDD0 <= cp <= 0xFDEF


@dataclass
class Database:
    gc: list[str]
    name: list[str]
    block: list[str]
    #: The first code point of the block holding each code point, or None.
    block_start: list[int | None]
    script: list[str]
    age: list[str | None]

    def kind(self, cp: int) -> str:
        gc = self.gc[cp]
        if gc == "Cs":
            return "surrogate"
        if gc == "Co":
            return "private"
        if is_noncharacter(cp):
            return "noncharacter"
        return "unassigned" if gc == "Cn" else "assigned"


def parse(cache: Path) -> Database:
    gc = ["Cn"] * CODE_POINTS
    name = [""] * CODE_POINTS
    pending: tuple[int, str, str] | None = None
    for line in (cache / "UnicodeData.txt").read_text(encoding="utf-8").splitlines():
        fields = line.split(";")
        cp, label, category = int(fields[0], 16), fields[1], fields[2]
        if label.endswith(", First>"):
            pending = (cp, label[1:-len(", First>")], category)
            continue
        if label.endswith(", Last>"):
            assert pending is not None, f"{cp:04X} closes a range nothing opened"
            first, range_label, range_gc = pending
            for c in range(first, cp + 1):
                gc[c] = range_gc
                name[c] = _range_name(range_label, c)
            pending = None
            continue
        gc[cp] = category
        name[cp] = "" if label.startswith("<") else label

    def spread(file: str, default: str | None) -> list:
        out = [default] * CODE_POINTS
        for first, last, value in _ranges(cache / file):
            out[first:last + 1] = [value] * (last - first + 1)
        return out

    block_start: list[int | None] = [None] * CODE_POINTS
    for first, last, _ in _ranges(cache / "Blocks.txt"):
        block_start[first:last + 1] = [first] * (last - first + 1)

    return Database(gc=gc, name=name, block=spread("Blocks.txt", "No_Block"),
                    block_start=block_start,
                    script=spread("Scripts.txt", "Unknown"),
                    age=spread("DerivedAge.txt", None))
