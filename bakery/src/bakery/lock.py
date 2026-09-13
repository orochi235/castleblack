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
