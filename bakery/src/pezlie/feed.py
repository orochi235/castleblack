"""Write a host's items as the Arrow IPC table the wall reads.

    write_table(out / "items.arrow", {"id": ids, "index": indices, "sha": shas, ...},
                dictionary=["kind", "script"])

Rows go in `index` order, and the wall takes a row's position as its index.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path

import pyarrow as pa
import pyarrow.ipc as ipc

#: The media type a feed route answers with.
MEDIA_TYPE = "application/vnd.apache.arrow.stream"


def table(columns: Mapping[str, Sequence], dictionary: Iterable[str] = ()) -> pa.Table:
    """The columns as a table, `dictionary` columns dictionary-encoded.

    `id`, `index` and `sha` are required; `index` must be exactly 0..n-1.
    """
    for name in ("id", "index", "sha"):
        if name not in columns:
            raise ValueError(f"a feed needs an {name!r} column")
    n = len(columns["id"])
    for name, values in columns.items():
        if len(values) != n:
            raise ValueError(f"column {name!r} has {len(values)} rows, id has {n}")
    order = sorted(range(n), key=columns["index"].__getitem__)
    if [columns["index"][i] for i in order] != list(range(n)):
        raise ValueError("indices must be exactly 0..n-1, each once")
    encoded = set(dictionary)
    arrays = {}
    for name, values in columns.items():
        ordered = values if order == list(range(n)) else [values[i] for i in order]
        if name == "index":
            arr = pa.array(ordered, pa.int32())
        elif name in ("id", "sha"):
            arr = pa.array(ordered, pa.string())
        else:
            arr = pa.array(ordered)
        arrays[name] = arr.dictionary_encode() if name in encoded else arr
    return pa.table(arrays)


def to_bytes(t: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    with ipc.new_stream(sink, t.schema) as writer:
        writer.write_table(t)
    return sink.getvalue().to_pybytes()


def write_table(path: Path | str, columns: Mapping[str, Sequence],
                dictionary: Iterable[str] = ()) -> pa.Table:
    t = table(columns, dictionary)
    Path(path).write_bytes(to_bytes(t))
    return t
