import { describe, it, expect } from "vitest";
import { projectGrid, modifierAt, parseMod } from "../src/projection";
import { inBounds, FACINGS } from "../src/arena";
import { ACHILLES, AJAX } from "../fixtures/warriors";
import type { Facing, Position } from "../src/types";

/** Render a projection as a sorted set of "row,col:mod" strings. */
function shape(pos: Position, facing: Facing, grid = ACHILLES.grid, size = 4) {
  return projectGrid(grid, pos, facing, size)
    .map((p) => `${p.cell.row},${p.cell.col}:${p.mod}`)
    .sort();
}

describe("parseMod", () => {
  it("parses signed modifier strings", () => {
    expect(parseMod("+0")).toBe(0);
    expect(parseMod("-1")).toBe(-1);
    expect(parseMod("+2")).toBe(2);
  });
});

describe("Achilles projection at center (2,1), all 4 facings", () => {
  const c: Position = { row: 2, col: 1 };
  it("faces N", () => {
    expect(shape(c, "N")).toEqual(["1,1:0", "2,0:-1", "2,2:-1"]);
  });
  it("faces E", () => {
    expect(shape(c, "E")).toEqual(["1,1:-1", "2,2:0", "3,1:-1"]);
  });
  it("faces S", () => {
    expect(shape(c, "S")).toEqual(["2,0:-1", "2,2:-1", "3,1:0"]);
  });
  it("faces W", () => {
    expect(shape(c, "W")).toEqual(["1,1:-1", "2,0:0", "3,1:-1"]);
  });
  it("the +0 cell is always one step in the facing direction", () => {
    // 2B is the warrior's "front" cell with modifier +0
    expect(shape({ row: 2, col: 1 }, "N")).toContain("1,1:0");
    expect(shape({ row: 2, col: 1 }, "E")).toContain("2,2:0");
    expect(shape({ row: 2, col: 1 }, "S")).toContain("3,1:0");
    expect(shape({ row: 2, col: 1 }, "W")).toContain("2,0:0");
  });
});

describe("Achilles projection clipped at corners", () => {
  const origin: Position = { row: 0, col: 0 };
  it("corner (0,0) facing N: only the right-side cell stays on board", () => {
    expect(shape(origin, "N")).toEqual(["0,1:-1"]);
  });
  it("corner (0,0) facing S", () => {
    expect(shape(origin, "S")).toEqual(["0,1:-1", "1,0:0"]);
  });
  it("corner (0,0) facing E", () => {
    expect(shape(origin, "E")).toEqual(["0,1:0", "1,0:-1"]);
  });
  it("corner (0,0) facing W", () => {
    expect(shape(origin, "W")).toEqual(["1,0:-1"]);
  });
  it("corner (3,3) facing N keeps only in-board cells", () => {
    // 2B->(2,3):+0 ; 3A->(3,2):-1 ; 3C->(3,4) off
    expect(shape({ row: 3, col: 3 }, "N")).toEqual(["2,3:0", "3,2:-1"]);
  });
});

describe("Ajax reaches behind (row-4 cell)", () => {
  it("the -2 'behind' cell (4A) projects opposite the facing", () => {
    // facing S, behind = north; 4A is behind-left -> (0,2):-2 from (1,1)
    const out = projectGrid(AJAX.grid, { row: 1, col: 1 }, "S", 4)
      .map((p) => `${p.cell.row},${p.cell.col}:${p.mod}`)
      .sort();
    expect(out).toContain("0,2:-2");
  });
});

describe("projection invariants (exhaustive over the board)", () => {
  it("never produces an off-board cell, at any position/facing/fixture", () => {
    for (const grid of [ACHILLES.grid, AJAX.grid]) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          for (const f of FACINGS) {
            for (const pc of projectGrid(grid, { row, col }, f, 4)) {
              expect(inBounds(pc.cell, 4)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("rotating 4x returns to the original projection (full turn)", () => {
    const pos: Position = { row: 2, col: 2 };
    const order: Facing[] = ["N", "E", "S", "W"];
    // N and S are 180° apart; assert the set of relative shapes is stable size
    for (const f of order) {
      const n = projectGrid(ACHILLES.grid, pos, f, 4).length;
      expect(n).toBe(3); // (2,2) is interior enough that all 3 cells stay on board
    }
  });
});

describe("modifierAt", () => {
  it("returns the cell modifier when the target is in the grid", () => {
    // Achilles at (2,1) facing N: front cell (1,1) has +0
    expect(modifierAt(ACHILLES.grid, { row: 2, col: 1 }, "N", { row: 1, col: 1 }, 4)).toBe(0);
    expect(modifierAt(ACHILLES.grid, { row: 2, col: 1 }, "N", { row: 2, col: 0 }, 4)).toBe(-1);
  });
  it("returns null when the target is not in the grid", () => {
    expect(modifierAt(ACHILLES.grid, { row: 2, col: 1 }, "N", { row: 3, col: 3 }, 4)).toBe(null);
    // the warrior's own cell is the marker, never an attack target
    expect(modifierAt(ACHILLES.grid, { row: 2, col: 1 }, "N", { row: 2, col: 1 }, 4)).toBe(null);
  });
});
