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


def _narrow(arr: pa.DictionaryArray) -> pa.DictionaryArray:
    """Indices as narrow as the dictionary allows: a million rows of int32
    codes is 4 MB a column, most of it zeros."""
    n = len(arr.dictionary)
    width = pa.int8() if n <= 127 else pa.int16() if n <= 32767 else pa.int32()
    return pa.DictionaryArray.from_arrays(arr.indices.cast(width), arr.dictionary)


def table(columns: Mapping[str, Sequence], dictionary: Iterable[str] = (),
          types: Mapping[str, pa.DataType] | None = None, first: int = 0) -> pa.Table:
    """The columns as a table, `dictionary` columns dictionary-encoded and
    `types` naming any column's Arrow type.

    `id`, `index` and `sha` are required; `index` must be exactly
    first..first+n-1, which is 0..n-1 for a whole feed.
    """
    types = dict(types or {})
    for name in ("id", "index", "sha"):
        if name not in columns:
            raise ValueError(f"a feed needs an {name!r} column")
    n = len(columns["id"])
    for name, values in columns.items():
        if len(values) != n:
            raise ValueError(f"column {name!r} has {len(values)} rows, id has {n}")
    order = sorted(range(n), key=columns["index"].__getitem__)
    if [columns["index"][i] for i in order] != list(range(first, first + n)):
        raise ValueError(f"indices must be exactly {first}..{first + n - 1}, each once")
    encoded = set(dictionary)
    arrays = {}
    for name, values in columns.items():
        ordered = values if order == list(range(n)) else [values[i] for i in order]
        if name == "index":
            arr = pa.array(ordered, pa.int32())
        elif name in ("id", "sha"):
            arr = pa.array(ordered, pa.string())
        else:
            arr = pa.array(ordered, types.get(name))
        arrays[name] = _narrow(arr.dictionary_encode()) if name in encoded else arr
    return pa.table(arrays)


def write_parts(directory: Path | str, columns: Mapping[str, Sequence],
                dictionary: Iterable[str] = (), types: Mapping[str, pa.DataType] | None = None,
                rows: int = 131_072, version: str = "") -> dict:
    """The feed as gzipped Arrow parts of `rows` rows each, and a
    `manifest.json` naming them, for a static host to serve and a page to fetch
    in parallel. Each part carries its own dictionaries, so a column with many
    distinct strings is not repeated whole in every part. Rows must already be
    in index order."""
    import gzip
    import json

    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    n = len(columns["id"])
    parts = []
    for i, start in enumerate(range(0, n, rows)):
        piece = {name: values[start:start + rows] for name, values in columns.items()}
        name = f"part-{i:03d}.arrow.gz"
        (directory / name).write_bytes(gzip.compress(to_bytes(table(piece, dictionary, types, start)), 6))
        parts.append(name)
    manifest = {"version": version, "rows": n, "parts": parts}
    (directory / "manifest.json").write_text(json.dumps(manifest))
    return manifest


def to_bytes(t: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    with ipc.new_stream(sink, t.schema) as writer:
        writer.write_table(t)
    return sink.getvalue().to_pybytes()


def write_table(path: Path | str, columns: Mapping[str, Sequence],
                dictionary: Iterable[str] = (),
                types: Mapping[str, pa.DataType] | None = None) -> pa.Table:
    t = table(columns, dictionary, types)
    Path(path).write_bytes(to_bytes(t))
    return t
