import gzip

import pyarrow.ipc as ipc
import pytest
from fastapi.testclient import TestClient

import make
from server import create_app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    out = tmp_path_factory.mktemp("out")
    make.make(out, make.HERE / ".ucd")
    return TestClient(create_app(out))


def test_lists_the_one_slot(client):
    assert client.get("/api/assigned/slots").json() == {"slots": [{"slot": "ucd", "n": 0}]}


def test_serves_the_feed_as_arrow_and_short_circuits_on_since(client):
    response = client.get("/api/assigned/items/ucd")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.apache.arrow.stream"
    table = ipc.open_stream(response.content).read_all()
    assert table.column("kind").to_pylist()[:1] == ["assigned"]
    version = response.headers["x-feed-version"]
    again = client.get("/api/assigned/items/ucd", params={"since": version})
    assert ipc.open_stream(again.content).read_all().num_rows == 0
    stale = client.get("/api/assigned/items/ucd", params={"since": "old"})
    assert ipc.open_stream(stale.content).read_all().num_rows == table.num_rows


def test_gzips_for_a_client_that_takes_it(client):
    raw = client.get("/api/codepoints/items/ucd", headers={"accept-encoding": "identity"})
    assert "content-encoding" not in raw.headers
    packed = client.get("/api/codepoints/items/ucd", headers={"accept-encoding": "gzip"})
    assert packed.headers["content-encoding"] == "gzip"
    assert ipc.open_stream(packed.content).read_all().num_rows == 0x110000
    assert len(gzip.compress(raw.content)) < len(raw.content)


def test_unknown_collection_and_slot(client):
    assert client.get("/api/nope/slots").status_code == 404
    assert client.get("/api/codepoints/items/nope").status_code == 404
