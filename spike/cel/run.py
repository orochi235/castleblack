"""Evaluates the shared expression corpus under cel-python, writing results.celpy.json."""

import json
import pathlib

import celpy
from celpy import celtypes

HERE = pathlib.Path(__file__).resolve().parent
corpus = json.loads((HERE / "expressions.json").read_text())


def plain(v):
    """celpy returns its own celtypes wrappers; compare values, not type names."""
    if isinstance(v, celtypes.BoolType):
        return bool(v)
    if isinstance(v, (celtypes.IntType, celtypes.UintType)):
        return int(v)
    if isinstance(v, celtypes.DoubleType):
        return float(v)
    if isinstance(v, celtypes.StringType):
        return str(v)
    if isinstance(v, celtypes.BytesType):
        return list(bytes(v))
    if isinstance(v, (celtypes.ListType, list, tuple)):
        return [plain(x) for x in v]
    if isinstance(v, (celtypes.MapType, dict)):
        return {str(plain(k)): plain(val) for k, val in v.items()}
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return str(v)


env = celpy.Environment()
programs = {e["key"]: env.program(env.compile(e["expr"])) for e in corpus["expressions"]}
bindings = {k: celpy.json_to_cel(v) for k, v in corpus["bindings"].items()}

results = {}
ok = failed = 0
for e in corpus["expressions"]:
    for fixture, item in corpus["fixtures"].items():
        cell = f'{e["key"]}@{fixture}'
        activation = dict(bindings, item=celpy.json_to_cel(item))
        try:
            value = programs[e["key"]].evaluate(activation)
            if isinstance(value, celpy.CELEvalError):
                raise value
            results[cell] = {"ok": True, "value": plain(value)}
            ok += 1
        except Exception as exc:
            msg = " ".join(str(exc).split())[:120]
            results[cell] = {"ok": False, "error": msg}
            failed += 1

out = HERE / "results.celpy.json"
out.write_text(json.dumps(results, indent=2) + "\n")
print(f"celpy: {ok + failed} cells, {ok} evaluated, {failed} errored -> {out}")
