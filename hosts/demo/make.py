"""Generate a synthetic corpus, render it as SVG, and bake both slots.

    hosts/demo/.venv/bin/python hosts/demo/make.py --n 3000 --out hosts/demo/out
"""
from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
import random
import shutil
import time
from pathlib import Path

from pezlie.batch import Render, bake_slot
from pezlie.sidecar import BAKED, baked_shas, write_json

SLOTS = ("outline", "filled")
KINDS = ("circle", "square", "triangle", "star", "ring", "cross")
ROUND = {"circle", "ring"}
POINTY = {"triangle", "star", "cross"}
WORDS = ("amber", "brisk", "cobalt", "dusky", "ember", "fable", "gilded", "hollow",
         "ivory", "jade", "keen", "lunar", "mossy", "north", "opal", "prism")
W, H = 256, 170


def generate(n: int, seed: int = 7) -> dict[str, list[dict]]:
    """Every slot's items, in the shared order, with `index` and `away` set."""
    rng = random.Random(seed)
    base = []
    for i in range(1, n + 1):
        kind = rng.choice(KINDS)
        size = round(rng.uniform(0.3, 1.0), 3)
        tags = [t for t, holds in (
            ("round", kind in ROUND), ("pointy", kind in POINTY),
            ("big", size >= 0.85), ("tiny", size <= 0.42),
            ("favorite", rng.random() < 0.08)) if holds]
        base.append({
            "id": f"item-{i:04d}",
            "title": f"{rng.choice(WORDS)} {rng.choice(WORDS)} {kind}",
            "kind": kind, "hue": rng.randrange(360), "size": size,
            "born": rng.randint(1960, 2025), "tags": tags,
            "flagged": rng.random() < 0.03,
        })
    base.sort(key=lambda it: it["id"])
    for index, it in enumerate(base):
        it["index"] = index

    slots = {slot: [{**it, **_attempt(it, slot, rng)} for it in base] for slot in SLOTS}
    for slot, items in slots.items():
        other = slots[next(s for s in SLOTS if s != slot)]
        for it, there in zip(items, other):
            it["away"] = held(there)
    return slots


def _attempt(item: dict, slot: str, rng: random.Random) -> dict:
    """One slot's render outcome: sha, error and seconds."""
    secs = round(math.exp(rng.triangular(math.log(0.2), math.log(300), math.log(2))), 2)
    if item["flagged"]:
        return {"sha": None, "error": None, "secs": None}
    if rng.random() < 0.10:
        error = rng.choice(("TimeoutError", "RenderError")) if rng.random() < 0.4 else None
        if error == "TimeoutError":
            secs = 300.0
        return {"sha": None, "error": error, "secs": secs if error else None}
    return {"sha": hashlib.sha256(svg(item, slot).encode()).hexdigest(),
            "error": None, "secs": secs}


def held(item: dict) -> list[str]:
    """The state keys the spec's `elsewhere` variant reads from `away`."""
    out = []
    if item["error"] is not None:
        out.append("failed")
    if item["secs"] is not None and item["secs"] > 60:
        out.append("slow")
    return out


def _hex(hue: int, lightness: float, saturation: float = 0.7) -> str:
    r, g, b = colorsys.hls_to_rgb(hue / 360, lightness, saturation)
    return "#" + "".join(f"{round(v * 255):02x}" for v in (r, g, b))


def _points(pts: list[tuple[float, float]]) -> str:
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)


def _polygon(kind: str, cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    if kind == "triangle":
        return [(cx + r * math.sin(a), cy - r * math.cos(a))
                for a in (0, 2 * math.pi / 3, 4 * math.pi / 3)]
    if kind == "star":
        return [(cx + rr * math.sin(k * math.pi / 5), cy - rr * math.cos(k * math.pi / 5))
                for k, rr in ((k, r if k % 2 == 0 else r * 0.42) for k in range(10))]
    if kind == "cross":
        a = r * 0.34
        return [(cx - a, cy - r), (cx + a, cy - r), (cx + a, cy - a), (cx + r, cy - a),
                (cx + r, cy + a), (cx + a, cy + a), (cx + a, cy + r), (cx - a, cy + r),
                (cx - a, cy + a), (cx - r, cy + a), (cx - r, cy - a), (cx - a, cy - a)]
    raise ValueError(kind)


def svg(item: dict, slot: str) -> str:
    """The item's shape in its hue: stroked for `outline`, filled for `filled`."""
    cx, cy, r = W / 2, H / 2, 78 * item["size"]
    ink, edge = _hex(item["hue"], 0.58), _hex(item["hue"], 0.32)
    if slot == "outline":
        paint = f'fill="none" stroke="{ink}" stroke-width="7" stroke-linejoin="round"'
    else:
        paint = f'fill="{ink}" stroke="{edge}" stroke-width="4" stroke-linejoin="round"'
    kind = item["kind"]
    if kind == "circle":
        body = f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" {paint}/>'
    elif kind == "square":
        body = f'<rect x="{cx - r * 0.8:.1f}" y="{cy - r * 0.8:.1f}" width="{r * 1.6:.1f}" height="{r * 1.6:.1f}" {paint}/>'
    elif kind == "ring":
        inner = r * 0.55
        d = (f"M{cx - r:.1f},{cy} a{r:.1f},{r:.1f} 0 1,0 {2 * r:.1f},0 a{r:.1f},{r:.1f} 0 1,0 {-2 * r:.1f},0Z "
             f"M{cx - inner:.1f},{cy} a{inner:.1f},{inner:.1f} 0 1,0 {2 * inner:.1f},0 "
             f"a{inner:.1f},{inner:.1f} 0 1,0 {-2 * inner:.1f},0Z")
        body = f'<path d="{d}" fill-rule="evenodd" {paint}/>'
    else:
        body = f'<polygon points="{_points(_polygon(kind, cx, cy, r))}" {paint}/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
            f'width="{W}" height="{H}">{body}</svg>\n')


def version(items: list[dict]) -> str:
    return hashlib.sha256(json.dumps(items, sort_keys=True).encode()).hexdigest()[:16]


def write(slots: dict[str, list[dict]], out: Path) -> None:
    """Renders, bakes and feeds for every slot."""
    out = Path(out)
    for n, (slot, items) in enumerate(slots.items(), 1):
        renders_dir, thumbs = out / "renders" / slot, out / "thumbs" / slot
        if renders_dir.exists():
            shutil.rmtree(renders_dir)
        renders_dir.mkdir(parents=True)
        renders = []
        for it in items:
            if it["sha"] is None:
                continue
            path = renders_dir / f"{it['id']}.svg"
            path.write_text(svg(it, slot))
            renders.append(Render(it["id"], path, it["sha"]))
        _forget_undrawn(thumbs, {r.id for r in renders})
        baked, total = bake_slot(renders, thumbs, [it["id"] for it in items], log=_sparse())
        write_json(out / f"items-{slot}.json",
                   {"slot": slot, "version": version(items), "items": items})
        print(f"[{n}/{len(slots)}] {slot}: baked {baked} of {total}", flush=True)


def _forget_undrawn(thumbs: Path, drawn: set[str]) -> None:
    """A rerun with a different seed or size leaves tiles for items no longer
    drawn, and compose would paste them into their old cells."""
    shas = baked_shas(thumbs)
    stale = [item_id for item_id in shas if item_id not in drawn]
    if not stale:
        return
    for item_id in stale:
        for tile in thumbs.glob(f"*/{item_id}.*"):
            tile.unlink()
    write_json(thumbs / BAKED, {k: v for k, v in shas.items() if k in drawn})


def _sparse(every: int = 250):
    seen = 0

    def log(line: str) -> None:
        nonlocal seen
        if line.startswith("  wrote") or "MISSING" in line or "UNREADABLE" in line:
            print(line, flush=True)
            return
        seen += 1
        if seen % every == 0:
            print(line, flush=True)
    return log


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--n", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "out")
    args = ap.parse_args()
    start = time.monotonic()
    write(generate(args.n, args.seed), args.out)
    print(f"done in {time.monotonic() - start:.1f}s", flush=True)


if __name__ == "__main__":
    main()
