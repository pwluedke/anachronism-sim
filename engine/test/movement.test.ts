import { describe, it, expect } from "vitest";
import {
  FACINGS,
  FACE_DELTA,
  inBounds,
  stepPos,
  canMove,
  applyMove,
  applyRotate,
  occupant,
} from "../src/arena";
import type { Warrior, Facing } from "../src/types";

function w(
  playerId: 0 | 1,
  row: number,
  col: number,
  facing: Facing = "S",
): Warrior {
  return {
    playerId,
    cardId: "x",
    name: "W" + playerId,
    position: { row, col },
    facing,
    life: 5,
    speed: 3,
    experience: 5,
    damage: 1,
    attackGrid: { "3B": "marker" },
  };
}

describe("facing / directions", () => {
  it("has exactly the 4 orthogonal facings (no diagonal)", () => {
    expect([...FACINGS].sort()).toEqual(["E", "N", "S", "W"]);
  });
  it("each delta is a single orthogonal step", () => {
    for (const f of FACINGS) {
      const d = FACE_DELTA[f];
      expect(Math.abs(d.dRow) + Math.abs(d.dCol)).toBe(1);
    }
  });
});

describe("movement legality", () => {
  it("steps one cell in each orthogonal direction", () => {
    expect(stepPos({ row: 1, col: 1 }, "N")).toEqual({ row: 0, col: 1 });
    expect(stepPos({ row: 1, col: 1 }, "S")).toEqual({ row: 2, col: 1 });
    expect(stepPos({ row: 1, col: 1 }, "E")).toEqual({ row: 1, col: 2 });
    expect(stepPos({ row: 1, col: 1 }, "W")).toEqual({ row: 1, col: 0 });
  });

  it("cannot move off the grid", () => {
    const ws: [Warrior, Warrior] = [w(0, 0, 0), w(1, 3, 3)];
    expect(canMove(ws, 0, "N", 4)).toMatchObject({ ok: false, reason: "off-grid" });
    expect(canMove(ws, 0, "W", 4)).toMatchObject({ ok: false, reason: "off-grid" });
    expect(canMove(ws, 1, "S", 4)).toMatchObject({ ok: false, reason: "off-grid" });
    expect(canMove(ws, 1, "E", 4)).toMatchObject({ ok: false, reason: "off-grid" });
  });

  it("cannot move into the opponent's cell", () => {
    const ws: [Warrior, Warrior] = [w(0, 1, 1), w(1, 2, 1)];
    expect(canMove(ws, 0, "S", 4)).toMatchObject({ ok: false, reason: "occupied" });
    // moving away is fine
    expect(canMove(ws, 0, "N", 4)).toMatchObject({ ok: true });
  });

  it("allows a legal move and reports the target", () => {
    const ws: [Warrior, Warrior] = [w(0, 1, 1), w(1, 3, 3)];
    const c = canMove(ws, 0, "E", 4);
    expect(c).toEqual({ ok: true, target: { row: 1, col: 2 } });
  });

  it("inBounds rejects out-of-range cells", () => {
    expect(inBounds({ row: 0, col: 0 }, 4)).toBe(true);
    expect(inBounds({ row: 3, col: 3 }, 4)).toBe(true);
    expect(inBounds({ row: -1, col: 0 }, 4)).toBe(false);
    expect(inBounds({ row: 0, col: 4 }, 4)).toBe(false);
  });
});

describe("move-then-free-rotate nuance", () => {
  it("a MOVE may also change facing in the same action (free rotate)", () => {
    const before = w(0, 1, 1, "S");
    const after = applyMove(before, "E", "N");
    expect(after.position).toEqual({ row: 1, col: 2 });
    expect(after.facing).toBe("N");
    // original untouched (pure)
    expect(before.position).toEqual({ row: 1, col: 1 });
    expect(before.facing).toBe("S");
  });

  it("a MOVE without a facing keeps the current facing", () => {
    const after = applyMove(w(0, 1, 1, "W"), "S");
    expect(after.facing).toBe("W");
    expect(after.position).toEqual({ row: 2, col: 1 });
  });
});

describe("rotation", () => {
  it("can rotate to any orthogonal direction", () => {
    for (const f of FACINGS) {
      expect(applyRotate(w(0, 1, 1, "N"), f).facing).toBe(f);
    }
  });
});

describe("occupant", () => {
  it("identifies who stands on a cell", () => {
    const ws: [Warrior, Warrior] = [w(0, 0, 0), w(1, 3, 3)];
    expect(occupant(ws, { row: 0, col: 0 })).toBe(0);
    expect(occupant(ws, { row: 3, col: 3 })).toBe(1);
    expect(occupant(ws, { row: 1, col: 1 })).toBe(null);
  });
});
