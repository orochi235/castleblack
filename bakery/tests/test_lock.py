import pytest

from bakery import bake
from bakery.lock import BakeInProgress, slot_lock


def test_compose_refuses_while_another_bake_holds_the_slot(tmp_path):
    with slot_lock(tmp_path):
        with pytest.raises(BakeInProgress):
            bake.compose(tmp_path, order=["a"])


def test_bake_item_refuses_while_another_bake_holds_the_slot(tmp_path, svg):
    out = tmp_path / "slot"
    with slot_lock(out):
        with pytest.raises(BakeInProgress):
            bake.bake_item("a", svg, out, sha="x")


def test_a_failed_bake_releases_the_slot(tmp_path):
    with pytest.raises(ValueError):
        bake.compose(tmp_path, order=["a", "a"])
    assert bake.compose(tmp_path, order=["a"])
