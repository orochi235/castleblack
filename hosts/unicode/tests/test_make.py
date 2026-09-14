import unicodedata

import pyarrow.ipc as ipc
import pytest

import make
import ucd

CACHE = make.HERE / ".ucd"


@pytest.fixture(scope="module")
def out(tmp_path_factory):
    path = tmp_path_factory.mktemp("out")
    make.make(path, CACHE)
    return path


def read(out, collection):
    return ipc.open_stream((out / f"{collection}.arrow").read_bytes()).read_all()


@pytest.fixture(scope="module")
def db():
    return ucd.parse(ucd.fetch(CACHE))


def row(table, index):
    return {name: table.column(name)[index].as_py() for name in table.column_names}


def test_every_code_point_once_in_order(out):
    t = read(out, "codepoints")
    assert t.num_rows == 0x110000
    assert t.column("index").to_pylist() == list(range(0x110000))
    assert t.column("cp").to_pylist() == list(range(0x110000))


@pytest.mark.parametrize("cp, kind, gc, script, age, name", [
    (0x41, "assigned", "Lu", "Latin", "1.1", "LATIN CAPITAL LETTER A"),
    (0xAC01, "assigned", "Lo", "Hangul", "2.0", "HANGUL SYLLABLE GAG"),
    (0x4E00, "assigned", "Lo", "Han", "1.1", "CJK UNIFIED IDEOGRAPH-4E00"),
    (0xD800, "surrogate", "Cs", "Unknown", "2.0", ""),
    (0xE000, "private", "Co", "Unknown", "1.1", ""),
    (0xFFFE, "noncharacter", "Cn", "Unknown", "1.1", ""),
    (0xFDD0, "noncharacter", "Cn", "Unknown", "3.1", ""),
    (0x0378, "unassigned", "Cn", "Unknown", None, ""),
])
def test_known_code_points(out, cp, kind, gc, script, age, name):
    got = row(read(out, "codepoints"), cp)
    assert (got["id"], got["kind"], got["gc"], got["script"], got["age"], got["name"]) == \
        (f"U+{cp:04X}", kind, gc, script, age, name)
    assert got["plane"] == cp >> 16 and got["sha"] is None


def test_blocks_carry_their_first_code_point(out):
    t = read(out, "codepoints")
    assert (row(t, 0x41)["block"], row(t, 0x41)["block_start"]) == ("Basic Latin", 0)
    assert (row(t, 0x0378)["block"], row(t, 0x0378)["block_start"]) == ("Greek and Coptic", 0x370)
    assert (row(t, 0x2FE0)["block"], row(t, 0x2FE0)["block_start"]) == ("No_Block", None)


def test_names_agree_with_python_where_both_know_the_character(db):
    for cp in range(0x110000):
        name = unicodedata.name(chr(cp), "")
        if name and db.name[cp]:
            assert db.name[cp] == name, f"U+{cp:04X}"


def test_assigned_is_the_assigned_code_points_renumbered(out, db):
    t = read(out, "assigned")
    want = [cp for cp in range(0x110000) if db.kind(cp) == "assigned"]
    assert t.column("cp").to_pylist() == want
    assert t.column("index").to_pylist() == list(range(len(want)))
    assert set(t.column("kind").to_pylist()) == {"assigned"}


def test_parts_reassemble_into_the_whole_feed(tmp_path):
    import gzip
    import json
    import pyarrow as pa
    make.make(tmp_path / "out", CACHE, parts=tmp_path / "parts")
    manifest = json.loads((tmp_path / "parts" / "assigned" / "manifest.json").read_text())
    tables = [ipc.open_stream(gzip.decompress((tmp_path / "parts" / "assigned" / p).read_bytes())).read_all()
              for p in manifest["parts"]]
    whole = read(tmp_path / "out", "assigned")
    assert manifest["rows"] == whole.num_rows == sum(t.num_rows for t in tables)
    joined = pa.concat_tables([t.cast(whole.schema) if False else t for t in tables], promote_options="permissive")
    assert joined.column("cp").to_pylist() == whole.column("cp").to_pylist()
    assert joined.column("name").to_pylist() == whole.column("name").to_pylist()


def test_a_changed_file_is_refused(tmp_path):
    for name in ucd.SHA256:
        (tmp_path / name).write_bytes((CACHE / name).read_bytes())
    (tmp_path / "Blocks.txt").write_text("tampered")
    with pytest.raises(RuntimeError, match="Blocks.txt"):
        ucd.fetch(tmp_path)
