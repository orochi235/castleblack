import pytest
from fastapi.testclient import TestClient

from make import generate, write
from server import create_app


@pytest.fixture(scope="module")
def corpus(tmp_path_factory):
    out = tmp_path_factory.mktemp("out")
    slots = generate(40, seed=3)
    write(slots, out)
    return TestClient(create_app(out)), slots


def test_lists_slots_with_their_drawn_counts(corpus):
    client, slots = corpus
    body = client.get("/api/slots").json()
    assert body == {"slots": [
        {"slot": slot, "n": sum(it["sha"] is not None for it in items)}
        for slot, items in slots.items()]}


def test_items_and_since_short_circuits(corpus):
    client, slots = corpus
    body = client.get("/api/items/outline").json()
    assert body["slot"] == "outline"
    assert body["items"] == slots["outline"]
    again = client.get("/api/items/outline", params={"since": body["version"]}).json()
    assert again == {"slot": "outline", "version": body["version"], "items": []}
    stale = client.get("/api/items/outline", params={"since": "old"}).json()
    assert len(stale["items"]) == 40


def test_serves_the_sheet_manifest_and_a_tile(corpus):
    client, slots = corpus
    manifest = client.get("/api/thumbs/filled/sheet-32.json")
    assert manifest.status_code == 200
    assert manifest.json()["count"] == 40
    assert client.get("/api/thumbs/filled/sheet-32.webp").status_code == 200
    drawn = next(it for it in slots["filled"] if it["sha"] is not None)
    tile = client.get(f"/api/thumbs/filled/128/{drawn['id']}.webp")
    assert tile.status_code == 200
    assert tile.content[:4] == b"RIFF"


def test_serves_a_render_only_for_a_drawn_item(corpus):
    client, slots = corpus
    drawn = next(it for it in slots["outline"] if it["sha"] is not None)
    undrawn = next(it for it in slots["outline"] if it["sha"] is None)
    ok = client.get(f"/api/corpus/render/outline/{drawn['id']}.svg")
    assert ok.status_code == 200
    assert ok.headers["content-type"].startswith("image/svg+xml")
    assert client.get(f"/api/corpus/render/outline/{undrawn['id']}.svg").status_code == 404


def test_unknown_slot(corpus):
    client, _ = corpus
    assert client.get("/api/items/nope").status_code == 404
    assert client.get("/api/thumbs/nope/sheet-32.json").status_code == 400
    assert client.get("/api/corpus/render/nope/item-0001.svg").status_code == 400
