# bakery

Bakes one slot's renders into the wall's mip chain, and serves it. A slot is one
set of renders over the whole corpus; each item gets a 128px loose tile, and
every item's 8px and 32px tiles are composed onto one sheet per level, with a
JSON manifest beside each sheet.

It knows nothing about what the items are. brick-icons is the first host.

## What a host supplies

- **The renders for a slot** — `Render(id, path, sha)` per item that has one.
  SVG goes through `resvg`; anything else is opened with Pillow.
- **The full order** — every item id, drawn or not. A cell's index on a sheet
  is its position in this list, so the host must send the same order to
  `compose` and to the wall's feed, or every sprite lands off by one.
  `compose` refuses a list that repeats an id.
- **For the routes** — a slot-name-to-directory lookup, a lookup naming the
  render file for an item in a slot, and the root those files must sit under.

## What it promises

- **Ink, never ground.** Tiles and sheets are transparent where there is no
  ink. The wall paints the ground.
- **One writer per slot.** `bake_item`, `compose` and `bake_slot` hold a lock
  on `<slot>/.bake.lock` and raise `BakeInProgress` instead of interleaving.
- **Freshness by sha.** An item whose sha matches `baked.json`, with tiles in
  the current format, is not rebaked. The manifest carries the sha map, so the
  wall can tell a stale cell from a fresh one.

```python
from bakery.batch import Render, bake_slot
bake_slot(renders, out="thumbs/occt", order=all_ids)

from bakery.routes import render_router, thumbs_router
app.include_router(thumbs_router(slot_dir), prefix="/api/thumbs")
app.include_router(render_router(render_file, root, known_slot), prefix="/api/corpus/render")
```

## Develop

Needs `resvg` on `PATH`.

```bash
uv venv bakery/.venv --python 3.14
uv pip install --python bakery/.venv/bin/python -e 'bakery[test]'
bakery/.venv/bin/python -m pytest bakery -q
```

`tests/test_parity.py` bakes the same inputs through brick-icons'
`brick_icons/thumbs.py` and through this package and compares bytes. It looks
for a brick-icons checkout beside pezlie, or at `$BRICK_ICONS`, and skips
without one.
