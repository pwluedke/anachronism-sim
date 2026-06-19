// Arena geometry + locomotion (movement, facing, rotation). Pure helpers; the
// engine clones state before calling the mutating-looking `apply*` functions,
// which themselves return fresh objects.

import type { Facing, Position, Warrior, PlayerId } from "./types";

export const FACINGS: readonly Facing[] = ["N", "E", "S", "W"] as const;

/** Movement / "forward" unit vector for each facing, in (row, col) space.
 *  row increases downward (toward player 1's start row 3). */
export const FACE_DELTA: Record<Facing, { dRow: number; dCol: number }> = {
  N: { dRow: -1, dCol: 0 },
  E: { dRow: 0, dCol: 1 },
  S: { dRow: 1, dCol: 0 },
  W: { dRow: 0, dCol: -1 },
};

export function inBounds(p: Position, size: number): boolean {
  return p.row >= 0 && p.row < size && p.col >= 0 && p.col < size;
}

export function samePos(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

/** One orthogonal step from `p` in direction `facing`. */
export function stepPos(p: Position, facing: Facing): Position {
  const d = FACE_DELTA[facing];
  return { row: p.row + d.dRow, col: p.col + d.dCol };
}

/** Which player (if any) occupies `pos`. */
export function occupant(
  warriors: readonly Warrior[],
  pos: Position,
): PlayerId | null {
  for (const w of warriors) if (samePos(w.position, pos)) return w.playerId;
  return null;
}

export interface MoveCheck {
  ok: boolean;
  target: Position;
  reason?: "off-grid" | "occupied";
}

/**
 * Is a 1-cell MOVE in `dir` legal for `player`? Movement is exactly one
 * orthogonal cell (the action vocabulary has no diagonal), into an in-arena
 * cell not occupied by the opponent. Because a move is a single step, "cannot
 * pass through the opponent" reduces to "cannot move onto the opponent".
 */
export function canMove(
  warriors: readonly [Warrior, Warrior],
  player: PlayerId,
  dir: Facing,
  size: number,
): MoveCheck {
  const mover = warriors[player];
  const target = stepPos(mover.position, dir);
  if (!inBounds(target, size)) return { ok: false, target, reason: "off-grid" };
  if (occupant(warriors, target) !== null)
    return { ok: false, target, reason: "occupied" };
  return { ok: true, target };
}

/** Move a warrior one cell in `dir`, optionally taking the FREE rotate that a
 *  move grants (set `facing`). Returns a new Warrior; does not mutate. */
export function applyMove(w: Warrior, dir: Facing, facing?: Facing): Warrior {
  return {
    ...w,
    position: stepPos(w.position, dir),
    facing: facing ?? w.facing,
  };
}

/** Rotate a warrior to face any orthogonal direction. Returns a new Warrior. */
export function applyRotate(w: Warrior, facing: Facing): Warrior {
  return { ...w, facing };
}
