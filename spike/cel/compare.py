"""Compares the three result files cell by cell and reports every disagreement."""

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
IMPLS = ["celpy", "buf", "marc"]

corpus = json.loads((HERE / "expressions.json").read_text())
results = {}
for impl in IMPLS:
    path = HERE / f"results.{impl}.json"
    if not path.exists():
        sys.exit(f"missing {path} -- run the {impl} runner first")
    results[impl] = json.loads(path.read_text())

cells = [
    f'{e["key"]}@{fixture}'
    for e in corpus["expressions"]
    for fixture in corpus["fixtures"]
]


def show(cell, impl):
    r = results[impl].get(cell)
    if r is None:
        return "<absent>"
    if r["ok"]:
        return json.dumps(r["value"])
    return f'ERROR({r["error"][:48]})'


def signature(cell, impl):
    """An error is only ever equal to another error -- messages differ by design."""
    r = results[impl].get(cell)
    if r is None:
        return ("missing",)
    return ("value", json.dumps(r["value"], sort_keys=True)) if r["ok"] else ("error",)


agree = 0
disagreements = []
total = len(cells)
for i, cell in enumerate(cells, 1):
    sigs = {impl: signature(cell, impl) for impl in IMPLS}
    same = len(set(sigs.values())) == 1
    mark = "  " if same else "!!"
    parts = "  ".join(f"{impl}={show(cell, impl)}" for impl in IMPLS)
    print(f"{mark} {i}/{total} {cell:34s} {parts}", flush=True)
    if same:
        agree += 1
    else:
        disagreements.append(cell)

print()
print(f"{agree}/{total} cells agree across {', '.join(IMPLS)}; {len(disagreements)} disagree")
for cell in disagreements:
    print(f"  disagree: {cell}")
sys.exit(1 if disagreements else 0)
