import { describe, it, expect } from "vitest";
import { getLegalActions } from "../src/legal";
import { init, applyAction } from "../src/engine";
import { ACHILLES, AJAX } from "../fixtures/warriors";
import type { Action, GameState } from "../src/types";

function key(a: Action): string {
  if (a.type === "MOVE") return `MOVE:${a.dir}`;
  if (a.type === "ROTATE") return `ROTATE:${a.facing}`;
  return a.type;
}

describe("getLegalActions", () => {
  it("returns no actions once the game has ended", () => {
    const s = structuredClone(init(ACHILLES, AJAX, 1).state);
    s.phase = "ended";
    expect(getLegalActions(s)).toEqual([]);
  });

  it("at a starting cell: legal moves, 3 rotations, PASS, and no attack out of range", () => {
    // P0 starts at (0,1) facing S; opponent far at (3,1) -> not in grid
    const s = structuredClone(init(ACHILLES, AJAX, 1).state);
    s.currentPlayer = 0;
    s.actionsRemaining = 3;
    s.warriors[0].position = { row: 0, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 3, col: 1 };
    const keys = getLegalActions(s).map(key).sort();
    // from (0,1): N is off-grid; S/E/W legal
    expect(keys).toEqual(
      ["MOVE:S", "MOVE:E", "MOVE:W", "ROTATE:N", "ROTATE:E", "ROTATE:W", "PASS"].sort(),
    );
    expect(keys).not.toContain("ATTACK");
  });

  it("offers ATTACK when the opponent is in the projected grid", () => {
    const s = structuredClone(init(ACHILLES, AJAX, 1).state);
    s.currentPlayer = 0;
    s.actionsRemaining = 3;
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S"; // Achilles front (+0) cell = (2,1)
    s.warriors[1].position = { row: 2, col: 1 };
    expect(getLegalActions(s).map(key)).toContain("ATTACK");
  });

  it("excludes moving into the opponent's cell", () => {
    const s = structuredClone(init(ACHILLES, AJAX, 1).state);
    s.currentPlayer = 0;
    s.actionsRemaining = 3;
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[1].position = { row: 2, col: 1 }; // directly south
    expect(getLegalActions(s).map(key)).not.toContain("MOVE:S");
  });

  it("with no actions left, only PASS is legal", () => {
    const s = structuredClone(init(ACHILLES, AJAX, 1).state);
    s.actionsRemaining = 0;
    expect(getLegalActions(s).map((a) => a.type)).toEqual(["PASS"]);
  });

  it("every listed action is accepted by applyAction (not a no-op)", () => {
    // exhaustively: in real play, each legal action must actually do something
    let s: GameState = init(ACHILLES, AJAX, 5).state;
    let guard = 0;
    while (s.phase === "playing" && guard++ < 40) {
      for (const a of getLegalActions(s)) {
        const r = applyAction(s, a);
        // a legal action changes state and/or emits events; never a silent no-op
        expect(r.events.length).toBeGreaterThan(0);
        expect(r.state).not.toBe(s);
      }
      // advance the game by passing so we sample multiple states
      s = applyAction(s, { type: "PASS" }).state;
    }
  });

  it("an action NOT in the legal set IS a no-op (off-grid move)", () => {
    const s = structuredClone(init(ACHILLES, AJAX, 1).state);
    s.currentPlayer = 0;
    s.warriors[0].position = { row: 0, col: 1 }; // row 0 -> N is off-grid
    expect(getLegalActions(s).map(key)).not.toContain("MOVE:N");
    const r = applyAction(s, { type: "MOVE", dir: "N" });
    expect(r.events).toHaveLength(0);
    expect(r.state).toBe(s);
  });
});
