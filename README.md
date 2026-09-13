# castleblack

*or, yumyulack*

A pan/zoom canvas over tens of thousands of items, one cell each, drawn from a
baked mip chain of sprites, with a live status color per cell and a detail view
behind a click. Two packages:

- **[`wall`](wall/README.md)** (TypeScript) — the canvas, the level chain, the
  layout, the chrome. Knows about items, slots and states in the abstract and
  nothing else. **The core is built** — states, selection, tints and paint
  commands over a CEL schema; the React component and canvas are next.
- **[`bakery`](bakery/README.md)** (Python) — rasterize, square, compose
  atlases, and serve them. **Built.**

A host supplies a corpus and a schema describing it; the wall draws it.
`brick-icons` is the first host, with 24,591 LEGO parts.

The design, and what is built of it, is
[`docs/superpowers/specs/2026-09-07-abstract-wall-design.md`](docs/superpowers/specs/2026-09-07-abstract-wall-design.md).
