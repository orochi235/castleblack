# demo host

A generated corpus that proves `bakery` and `wall` work with nothing but a spec:
items of six shapes, drawn as SVG in two slots (`outline` and `filled`), some
undrawn, some failing, some slow. `make.py` generates and bakes them, `server.py`
serves them, and `src/spec.ts` tells the wall how to show them.

## Run

```bash
uv venv hosts/demo/.venv --python 3.14
uv pip install --python hosts/demo/.venv/bin/python -e 'hosts/demo[test]'

hosts/demo/.venv/bin/python hosts/demo/make.py --n 3000 --out hosts/demo/out
hosts/demo/.venv/bin/python -m uvicorn --factory 'server:app_from_env' --app-dir hosts/demo --port 8795
npm run dev -w hosts/demo        # http://localhost:5195, /api proxied to 8795
```

`make.py` is deterministic for a `--seed`, and needs `resvg` on `PATH`. The
server reads `DEMO_OUT` (default `hosts/demo/out`).

## Tests

```bash
hosts/demo/.venv/bin/python -m pytest hosts/demo/tests -q
npx vitest run                   # in hosts/demo/
```

- Every item's `index` is its position in the sorted id order that `bake_slot`
  composed with, and the indices are exactly `0..n-1`.
- `sheet-32.json` lists every drawn item under `baked` with its sha, and no
  undrawn one; a rerun forgets an item that stopped being drawn.
- Flagged items are never drawn, and `away` matches the other slot's failures
  and slow renders.
- The server lists slots, serves the feed (empty when `since` is current),
  sheets, tiles, and renders only for drawn items.
- The spec compiles, and places items in the states their fields describe.
