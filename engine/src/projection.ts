// KEYSTONE: project a warrior's 3x4 card attack grid onto arena cells.
//
// The card grid keys are "1A".."4C" (row 1..4 top→bottom, col A..C left→right).
// The marker (the warrior's own cell) is canonically "3B". Each other cell holds
// a modifier. We express every cell as a LOCAL offset from the marker:
//
//   forward = markerRow - gridRow   (toward row 1 is "forward", row 4 is behind)
//   right   = gridCol  - markerCol  (col C is the warrior's right, col A its left)
//
// Then we rotate that local (forward, right) frame onto the arena using the
// warrior's facing. `forwardVec` is the facing's unit vector in (row,col) space;
// `rightVec` is forwardVec rotated 90° clockwise. Cells that fall off the board
// at edges/corners are dropped (clipped).

import type { AttackGrid, Facing, Position } from "./types";
import { inBounds } from "./arena";

const COL: Record<string, number> = { A: 1, B: 2, C: 3 };

/** Forward (facing) unit vector in (row, col) space. row increases downward. */
const FORWARD: Record<Facing, { dRow: number; dCol: number }> = {
  N: { dRow: -1, dCol: 0 },
  E: { dRow: 0, dCol: 1 },
  S: { dRow: 1, dCol: 0 },
  W: { dRow: 0, dCol: -1 },
};

/** The warrior's "right hand" vector = forward rotated 90° clockwise. */
function rightVec(f: Facing): { dRow: number; dCol: number } {
  const fwd = FORWARD[f];
  return { dRow: fwd.dCol, dCol: -fwd.dRow };
}

function keyToRC(key: string): { row: number; col: number } {
  return { row: Number(key[0]), col: COL[key[1]] };
}

/** Parse a grid modifier string ("+0", "-1", "+2") to a number. */
export function parseMod(s: string): number {
  return Number(s.replace("+", ""));
}

export interface ProjectedCell {
  gridKey: string; // source card-grid key, e.g. "2B"
  cell: Position; // arena cell
  mod: number; // attack modifier at that cell
}

/** Find the marker (warrior) cell key in a grid. Defaults to "3B". */
export function markerKey(grid: AttackGrid): string {
  for (const k of Object.keys(grid)) if (grid[k] === "marker") return k;
  return "3B";
}

/**
 * Project a grid from `position` at `facing` onto the arena. Returns one entry
 * per modifier cell that lands on the board (off-board cells are clipped).
 */
export function projectGrid(
  grid: AttackGrid,
  position: Position,
  facing: Facing,
  size: number,
): ProjectedCell[] {
  const mk = keyToRC(markerKey(grid));
  const fwd = FORWARD[facing];
  const rgt = rightVec(facing);
  const out: ProjectedCell[] = [];

  for (const key of Object.keys(grid)) {
    const v = grid[key];
    if (v === null || v === "marker") continue;
    const rc = keyToRC(key);
    const forward = mk.row - rc.row;
    const right = rc.col - mk.col;
    const cell: Position = {
      row: position.row + forward * fwd.dRow + right * rgt.dRow,
      col: position.col + forward * fwd.dCol + right * rgt.dCol,
    };
    if (inBounds(cell, size)) out.push({ gridKey: key, cell, mod: parseMod(v) });
  }
  return out;
}

/**
 * The attack modifier for `target` within the attacker's projected grid, or
 * `null` if `target` is not in the grid (i.e. not a legal basic-attack target).
 */
export function modifierAt(
  grid: AttackGrid,
  position: Position,
  facing: Facing,
  target: Position,
  size: number,
): number | null {
  for (const pc of projectGrid(grid, position, facing, size)) {
    if (pc.cell.row === target.row && pc.cell.col === target.col) return pc.mod;
  }
  return null;
}
