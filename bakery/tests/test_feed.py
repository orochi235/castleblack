import pyarrow as pa
import pyarrow.ipc as ipc
import pytest

from pezlie.feed import table, to_bytes, write_parts, write_table


def cols(**extra):
    return {"id": ["b", "a", "c"], "index": [1, 0, 2], "sha": [None, "x", None], **extra}


def test_rows_go_in_index_order():
    t = table(cols(kind=["q", "p", "r"]))
    assert t.column("id").to_pylist() == ["a", "b", "c"]
    assert t.column("kind").to_pylist() == ["p", "q", "r"]
    assert t.column("index").type == pa.int32()


def test_dictionary_columns_are_encoded():
    t = table(cols(kind=["q", "q", "r"]), dictionary=["kind"])
    assert pa.types.is_dictionary(t.column("kind").type)
    assert t.column("kind").type.index_type == pa.int8()
    assert t.column("kind").to_pylist() == ["q", "q", "r"]


def test_types_name_a_column_type():
    t = table(cols(n=[1, 2, 3]), types={"n": pa.int16()})
    assert t.column("n").type == pa.int16()


def test_indices_must_cover_every_row_once():
    with pytest.raises(ValueError, match="exactly 0\.\."):
        table({"id": ["a", "b"], "index": [0, 0], "sha": [None, None]})
    with pytest.raises(ValueError, match="exactly 0\.\."):
        table({"id": ["a", "b"], "index": [0, 2], "sha": [None, None]})


def test_required_and_ragged_columns_are_refused():
    with pytest.raises(ValueError, match="'sha'"):
        table({"id": ["a"], "index": [0]})
    with pytest.raises(ValueError, match="has 1 rows"):
        table(cols(kind=["x"]))


def test_parts_split_the_feed_with_their_own_dictionaries(tmp_path):
    import gzip
    import json
    ids = [f"i{n}" for n in range(5)]
    manifest = write_parts(tmp_path, {"id": ids, "index": list(range(5)), "sha": [None] * 5,
                                      "kind": ["a", "a", "b", "c", "c"]},
                           dictionary=["kind"], rows=2, version="v1")
    assert manifest == {"version": "v1", "rows": 5,
                        "parts": ["part-000.arrow.gz", "part-001.arrow.gz", "part-002.arrow.gz"]}
    assert json.loads((tmp_path / "manifest.json").read_text()) == manifest
    tables = [ipc.open_stream(gzip.decompress((tmp_path / p).read_bytes())).read_all()
              for p in manifest["parts"]]
    assert [t.column("index").to_pylist() for t in tables] == [[0, 1], [2, 3], [4]]
    assert [len(t.column("kind").chunk(0).dictionary) for t in tables] == [1, 2, 1]


def test_bytes_round_trip(tmp_path):
    write_table(tmp_path / "t.arrow", cols(kind=["q", "p", "r"]), dictionary=["kind"])
    back = ipc.open_stream((tmp_path / "t.arrow").read_bytes()).read_all()
    assert back.column("id").to_pylist() == ["a", "b", "c"]
    assert back.equals(ipc.open_stream(to_bytes(back)).read_all())
