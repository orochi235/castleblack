"""Serve the collections `make.py` wrote, as Arrow feeds.

    hosts/unicode/.venv/bin/python -m uvicorn --factory 'server:app_from_env' \\
        --app-dir hosts/unicode --port 8796
"""
from __future__ import annotations

import gzip
import os
from pathlib import Path

import pyarrow as pa
import pyarrow.ipc as ipc
from fastapi import FastAPI, HTTPException, Request, Response
from pezlie.feed import MEDIA_TYPE, to_bytes

from make import COLLECTIONS, SLOT


class Feed:
    def __init__(self, path: Path):
        self.mtime = path.stat().st_mtime
        self.version = str(int(self.mtime * 1000))
        self.raw = path.read_bytes()
        self.table: pa.Table = ipc.open_stream(self.raw).read_all()
        # Compressed once, not per request: 70 MB takes a second to gzip.
        self.packed = gzip.compress(self.raw, 6)
        self.empty = to_bytes(self.table.slice(0, 0))


def create_app(out: Path) -> FastAPI:
    out = Path(out)
    feeds: dict[str, Feed] = {}

    def load(collection: str) -> Feed:
        if collection not in COLLECTIONS:
            raise HTTPException(404, f"no such collection: {collection}")
        path = out / f"{collection}.arrow"
        if not path.is_file():
            raise HTTPException(404, f"{collection} has not been made; run make.py")
        held = feeds.get(collection)
        if held is None or held.mtime != path.stat().st_mtime:
            held = feeds[collection] = Feed(path)
        return held

    app = FastAPI(title="pezlie unicode")

    @app.get("/api/{collection}/slots")
    def slots(collection: str):
        load(collection)
        # `n` counts drawn items, and nothing is rendered yet.
        return {"slots": [{"slot": SLOT, "n": 0}]}

    @app.get("/api/{collection}/items/{slot}")
    def items(collection: str, slot: str, request: Request, since: str | None = None):
        feed = load(collection)
        if slot != SLOT:
            raise HTTPException(404, f"no such slot: {slot}")
        headers = {"x-feed-version": feed.version, "cache-control": "no-cache"}
        if since == feed.version:
            return Response(feed.empty, media_type=MEDIA_TYPE, headers=headers)
        if "gzip" in request.headers.get("accept-encoding", ""):
            return Response(feed.packed, media_type=MEDIA_TYPE,
                            headers={**headers, "content-encoding": "gzip"})
        return Response(feed.raw, media_type=MEDIA_TYPE, headers=headers)

    return app


def app_from_env() -> FastAPI:
    return create_app(Path(os.environ.get("UNICODE_OUT", Path(__file__).parent / "out")))
