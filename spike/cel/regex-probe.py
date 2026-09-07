"""Checks the three regex engines against each other -- the evidence for the README's engine claim."""

import json
import pathlib
import subprocess
import sys

import celpy

HERE = pathlib.Path(__file__).resolve().parent
PATTERNS = ["^[~=_|]", "(?:brick|dome)", "(?i)brick", "^(?!_).*", "a{2,3}"]

js = json.loads(
    subprocess.run(
        ["node", str(HERE / "regex-probe.mjs"), json.dumps(PATTERNS)],
        capture_output=True, text=True, check=True, cwd=HERE,
    ).stdout
)

env = celpy.Environment()
disagree = 0
for i, pattern in enumerate(PATTERNS, 1):
    try:
        prg = env.program(env.compile(f"s.matches({json.dumps(pattern)})"))
        cp = bool(prg.evaluate({"s": celpy.json_to_cel("Brick")}))
    except Exception as exc:
        cp = f"ERROR: {' '.join(str(exc).split())[:60]}"
    row = {"celpy": cp, **js[pattern]}
    sig = {("error",) if isinstance(v, str) and v.startswith("ERROR") else ("value", v)
           for v in row.values()}
    same = len(sig) == 1
    disagree += 0 if same else 1
    print(f'{"  " if same else "!!"} {i}/{len(PATTERNS)} {pattern:16s} '
          + "  ".join(f"{k}={v}" for k, v in row.items()), flush=True)

print(f"\n{len(PATTERNS) - disagree}/{len(PATTERNS)} patterns agree")
sys.exit(1 if disagree else 0)
