import json

import pytest
from PIL import Image

from bakery import bake
from bakery.sheet import LEVELS, geometry
from bakery.sidecar import BAKED, baked_shas, write_json


def test_it_rasterizes_every_level_for_one_item(tmp_path, svg):
    out = tmp_path / "slot"
    assert sorted(bake.bake_item("3001", svg, out, sha="abc123")) == [8, 32, 128]
    for level in (8, 32, 128):
        with Image.open(out / str(level) / f"3001.{bake.THUMB_EXT}") as img:
            assert img.size == (level, level)


def test_a_baked_cell_is_letterboxed_square_with_ink_and_no_ground(tmp_path, svg):
    out = tmp_path / "slot"
    bake.bake_item("3001", svg, out, sha="abc123")
    with Image.open(out / "128" / f"3001.{bake.THUMB_EXT}") as img:
        rgba = img.convert("RGBA")
        assert rgba.size == (128, 128)
        assert rgba.getpixel((2, 2))[3] == 0
        assert rgba.getpixel((64, 64))[3] == 255


def test_it_bakes_a_raster_render_without_going_near_resvg(tmp_path):
    src = tmp_path / "3001.webp"
    Image.new("RGBA", (256, 170), (0, 0, 0, 255)).save(src, "WEBP")
    out = tmp_path / "slot"
    assert sorted(bake.bake_item("3001", src, out, sha="abc123")) == [8, 32, 128]
    with Image.open(out / "128" / f"3001.{bake.THUMB_EXT}") as img:
        assert img.convert("RGBA").getpixel((2, 2))[3] == 0
        assert img.convert("RGBA").getpixel((64, 64))[3] == 255


def test_it_skips_an_item_whose_sha_is_unchanged(tmp_path, svg):
    out = tmp_path / "slot"
    bake.bake_item("3001", svg, out, sha="abc123")
    assert bake.bake_item("3001", svg, out, sha="abc123") == []
    assert bake.bake_item("3001", svg, out, sha="different") != []


def test_the_baked_sha_is_readable_back(tmp_path, svg):
    out = tmp_path / "slot"
    bake.bake_item("3001", svg, out, sha="abc123")
    assert baked_shas(out) == {"3001": "abc123"}


def _baked(tmp_path, svg, ids):
    out = tmp_path / "slot"
    for item_id in ids:
        bake.bake_item(item_id, svg, out, sha=f"sha-{item_id}")
    return out


def test_the_sheet_is_one_page_sized_from_the_item_count(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a", "b", "c"])
    bake.compose(out, order=["a", "b", "c", "d"])
    for level in (8, 32):
        with Image.open(out / f"sheet-{level}.{bake.THUMB_EXT}") as img:
            assert img.size == (geometry(4, level).size,) * 2


def test_the_manifest_names_the_geometry_and_what_is_baked(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a", "c"])
    bake.compose(out, order=["a", "b", "c", "d"])
    m = json.loads((out / "sheet-32.json").read_text())
    assert (m["level"], m["gutter"], m["pitch"], m["cols"], m["count"]) == (32, 2, 36, 2, 4)
    assert m["baked"] == {"a": "sha-a", "c": "sha-c"}


def test_an_item_with_no_tile_leaves_its_cell_empty(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a"])
    bake.compose(out, order=["a", "b"])
    g = geometry(2, 32)
    with Image.open(out / f"sheet-32.{bake.THUMB_EXT}") as img:
        assert img.crop(g.cell_box(0)).getextrema()[3][1] > 0
        assert img.crop(g.cell_box(1)).getextrema()[3][1] == 0


def test_the_gutter_replicates_the_cell_edge(tmp_path, svg):
    out = _baked(tmp_path, svg, ["a"])
    bake.compose(out, order=["a", "b"])
    x0, y0, _, _ = geometry(2, 32).cell_box(0)
    with Image.open(out / f"sheet-32.{bake.THUMB_EXT}") as img:
        assert img.getpixel((x0 - 1, y0)) == img.getpixel((x0, y0))


def test_a_truncated_sidecar_is_a_cache_miss_not_a_crash(tmp_path):
    (tmp_path / BAKED).write_text("")
    assert baked_shas(tmp_path) == {}
    (tmp_path / BAKED).write_text("{oh no")
    assert baked_shas(tmp_path) == {}


def test_a_sidecar_is_written_whole_or_not_at_all(tmp_path):
    write_json(tmp_path / "x.json", {"a": "1"})
    assert json.loads((tmp_path / "x.json").read_text()) == {"a": "1"}
    assert not list(tmp_path.glob("*.tmp"))


def test_a_format_change_rebakes_rather_than_composing_missing_tiles(
        tmp_path, svg, monkeypatch):
    out = tmp_path / "slot"
    assert bake.bake_item("3001", svg, out, sha="abc") == list(LEVELS)
    assert bake.bake_item("3001", svg, out, sha="abc") == []
    monkeypatch.setattr(bake, "THUMB_EXT", "png")
    monkeypatch.setattr(bake, "THUMB_SAVE", {"format": "PNG"})
    assert bake.bake_item("3001", svg, out, sha="abc") == list(LEVELS)
    for level in LEVELS:
        assert (out / str(level) / "3001.png").is_file()
