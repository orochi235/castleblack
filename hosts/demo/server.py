"""Serve a corpus `make.py` wrote: its baked slots, its renders, and its feed.

    hosts/demo/.venv/bin/python -m uvicorn --factory 'server:app_from_env' \\
        --app-dir hosts/demo --port 8795
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from bakery.routes import render_router, thumbs_router
from fastapi import FastAPI, HTTPException

from make import SLOTS


def create_app(out: Path) -> FastAPI:
    out = Path(out)
    cache: dict[str, tuple[float, dict, dict[str, dict]]] = {}

    def load(slot: str) -> tuple[dict, dict[str, dict]] | None:
        path = out / f"items-{slot}.json"
        if slot not in SLOTS or not path.is_file():
            return None
        mtime = path.stat().st_mtime
        hit = cache.get(slot)
        if hit is None or hit[0] != mtime:
            data = json.loads(path.read_text())
            hit = cache[slot] = (mtime, data, {it["id"]: it for it in data["items"]})
        return hit[1], hit[2]

    def feed(slot: str) -> dict | None:
        loaded = load(slot)
        return loaded[0] if loaded else None

    def render_file(slot: str, item_id: str) -> Path | None:
        loaded = load(slot)
        item = loaded[1].get(item_id) if loaded else None
        if item is None or item["sha"] is None:
            return None
        return out / "renders" / slot / f"{item_id}.svg"

    app = FastAPI(title="castleblack demo")
    app.include_router(
        thumbs_router(lambda slot: out / "thumbs" / slot if slot in SLOTS else None),
        prefix="/api/thumbs")
    app.include_router(
        render_router(render_file, out / "renders", lambda slot: feed(slot) is not None),
        prefix="/api/corpus/render")

    @app.get("/api/slots")
    def slots():
        return {"slots": [
            {"slot": slot, "n": sum(it["sha"] is not None for it in data["items"])}
            for slot in SLOTS if (data := feed(slot)) is not None]}

    @app.get("/api/items/{slot}")
    def items(slot: str, since: str | None = None):
        data = feed(slot)
        if data is None:
            raise HTTPException(404, f"no such slot: {slot}")
        if since == data["version"]:
            return {"slot": slot, "version": data["version"], "items": []}
        return data

    return app


def app_from_env() -> FastAPI:
    return create_app(Path(os.environ.get("DEMO_OUT", "hosts/demo/out")))
