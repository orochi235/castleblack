"""Where a cell sits on a sheet: the level chain and the grid geometry."""
from __future__ import annotations

import math
from dataclasses import dataclass

SHEET_LEVELS = (8, 32)
LOOSE_LEVEL = 128
#: The coarsest sheet ends the mip chain, so it cannot bleed and needs no
#: padding. Every finer sheet does.
GUTTER = 2
LEVELS = (*SHEET_LEVELS, LOOSE_LEVEL)

#: The bake owns the ink and the wall owns the ground. A baked ground makes
#: the zoom rungs disagree, and a cell changes shade on one wheel notch.
GROUND = (0, 0, 0, 0)


@dataclass(frozen=True)
class Geometry:
    count: int
    level: int
    cols: int
    rows: int
    gutter: int

    @property
    def pitch(self) -> int:
        return self.level + 2 * self.gutter

    @property
    def size(self) -> int:
        return self.cols * self.pitch

    def cell_box(self, index: int) -> tuple[int, int, int, int]:
        """The cell's (left, top, right, bottom) on the sheet, gutters excluded."""
        if not 0 <= index < self.cols * self.rows:
            raise IndexError(f"cell {index} is outside a {self.cols}x{self.rows} grid")
        col, row = index % self.cols, index // self.cols
        x = col * self.pitch + self.gutter
        y = row * self.pitch + self.gutter
        return (x, y, x + self.level, y + self.level)


def geometry(count: int, level: int) -> Geometry:
    if level not in SHEET_LEVELS:
        raise ValueError(f"{level} is not a sheet level; sheets are {SHEET_LEVELS}")
    cols = max(1, math.ceil(math.sqrt(count)))
    # cols >= sqrt(count) keeps rows <= cols, so the square sheet never crops.
    rows = max(1, math.ceil(count / cols))
    gutter = 0 if level == min(SHEET_LEVELS) else GUTTER
    return Geometry(count=count, level=level, cols=cols, rows=rows, gutter=gutter)
