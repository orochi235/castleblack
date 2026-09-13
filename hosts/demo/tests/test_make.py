import json

import pytest

from make import SLOTS, generate, held, version, write

N = 40


@pytest.fixture(scope="module")
def corpus(tmp_path_factory):
    out = tmp_path_factory.mktemp("out")
    slots = generate(N, seed=3)
    write(slots, out)
    return out, slots


def test_generation_is_deterministic_for_a_seed():
    assert generate(N, seed=3) == generate(N, seed=3)
    assert generate(N, seed=3) != generate(N, seed=4)


def test_indices_are_dense_and_follow_the_sorted_order(corpus):
    _, slots = corpus
    for items in slots.values():
        ids = [it["id"] for it in items]
        assert ids == sorted(ids)
        assert [it["index"] for it in items] == list(range(N))


def test_every_drawn_item_is_baked_with_its_sha_and_no_undrawn_one_is(corpus):
    out, slots = corpus
    for slot, items in slots.items():
        manifest = json.loads((out / "thumbs" / slot / "sheet-32.json").read_text())
        assert manifest["count"] == N
        drawn = {it["id"]: it["sha"] for it in items if it["sha"] is not None}
        assert drawn and len(drawn) < N
        assert manifest["baked"] == drawn


def test_flagged_items_are_never_drawn():
    for items in generate(2000, seed=1).values():
        flagged = [it for it in items if it["flagged"]]
        assert flagged
        assert all(it["sha"] is None and it["secs"] is None for it in flagged)


def test_away_holds_the_other_slots_states():
    slots = generate(2000, seed=1)
    a, b = (slots[s] for s in SLOTS)
    for here, there in ((a, b), (b, a)):
        for it, other in zip(here, there):
            assert it["away"] == held(other)
    assert any("failed" in it["away"] for it in a)
    assert any("slow" in it["away"] for it in a)


def test_the_feed_carries_the_items_and_their_version(corpus):
    out, slots = corpus
    for slot, items in slots.items():
        feed = json.loads((out / f"items-{slot}.json").read_text())
        assert feed == {"slot": slot, "version": version(items), "items": items}
        for it in items:
            assert (out / "renders" / slot / f"{it['id']}.svg").is_file() == (it["sha"] is not None)


def test_a_rerun_forgets_items_no_longer_drawn(corpus, tmp_path):
    out, slots = corpus
    first = {slot: [dict(it) for it in items] for slot, items in slots.items()}
    write(first, tmp_path)
    victim = next(it for it in first["filled"] if it["sha"] is not None)
    victim["sha"] = None
    write(first, tmp_path)
    manifest = json.loads((tmp_path / "thumbs" / "filled" / "sheet-32.json").read_text())
    assert victim["id"] not in manifest["baked"]
