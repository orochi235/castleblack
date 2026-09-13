from contextlib import contextmanager
from pathlib import Path


@contextmanager
def slot_lock(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    yield
