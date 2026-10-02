import { describe, it, expect } from "vitest";
import { init } from "../src/engine";
import { evaluate } from "../src/bot/evaluate";
import { EVAL_WEIGHTS } from "../src/bot/config";
import { ACHILLES, AJAX } from "../fixtures/warriors";
import type { GameState } from "../src/types";

// Neutral board: Achilles vs Achilles (identical stats/grids), far apart, facing away.
function base(): GameState {
  const s = structuredClone(init(ACHILLES, ACHILLES, 1).state);
  s.warriors[0].position = { row: 0, col: 0 };
  s.warriors[0].facing = "N";
  s.warriors[1].position = { row: 3, col: 3 };
  s.warriors[1].facing = "S";
  return s;
}

describe("evaluate", () => {
  it("a symmetric neutral board scores 0", () => {
    expect(evaluate(base(), 0)).toBe(0);
    expect(evaluate(base(), 1)).toBe(0);
  });

  it("is zero-sum: my score is the negation of the opponent's", () => {
    const s = base();
    s.warriors[0].life = 6;
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 2, col: 1 };
    expect(evaluate(s, 0)).toBe(-evaluate(s, 1));
  });

  it("a near-win (life lead) scores higher than a near-loss", () => {
    const ahead = base();
    ahead.warriors[1].life = 2;
    const behind = base();
    behind.warriors[0].life = 2;
    expect(evaluate(ahead, 0)).toBeGreaterThan(0);
    expect(evaluate(behind, 0)).toBeLessThan(0);
    expect(evaluate(ahead, 0)).toBeGreaterThan(evaluate(behind, 0));
  });

  it("threatening without being threatened beats the mirror", () => {
    // P0 at (1,1) facing S covers (2,1) with its +0 front cell.
    const mine = base();
    mine.warriors[0].position = { row: 1, col: 1 };
    mine.warriors[0].facing = "S";
    mine.warriors[1].position = { row: 2, col: 1 };
    mine.warriors[1].facing = "S"; // faces away: front (3,1), sides (2,0),(2,2)
    const mirror = structuredClone(mine);
    mirror.warriors[0].facing = "N"; // faces away from P1
    mirror.warriors[1].facing = "N"; // faces P0
    expect(evaluate(mine, 0)).toBeGreaterThan(0);
    expect(evaluate(mirror, 0)).toBeLessThan(0);
    expect(evaluate(mine, 0)).toBeGreaterThan(evaluate(mirror, 0));
  });

  it("a better grid modifier on the threatened cell scores higher", () => {
    // Achilles: front +0, sides -1. Foe in front > foe on a side.
    const front = base();
    front.warriors[0].position = { row: 1, col: 1 };
    front.warriors[0].facing = "S";
    front.warriors[1].position = { row: 2, col: 1 };
    const side = structuredClone(front);
    side.warriors[0].facing = "E"; // (2,1) is now P0's right-hand side cell (-1)
    expect(evaluate(front, 0)).toBeGreaterThan(evaluate(side, 0));
    expect(evaluate(side, 0)).toBeGreaterThan(0);
  });

  it("equal boards: higher experience scores slightly higher", () => {
    const s = structuredClone(init(ACHILLES, AJAX, 1).state);
    s.warriors[0].position = { row: 0, col: 0 };
    s.warriors[0].facing = "N";
    s.warriors[1].position = { row: 3, col: 3 };
    s.warriors[1].facing = "S";
    s.warriors[1].life = s.warriors[0].life; // equalise life so only experience differs
    const score = evaluate(s, 0); // Achilles exp 9 vs Ajax exp 3
    expect(score).toBe(6 * EVAL_WEIGHTS.experience);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(EVAL_WEIGHTS.life); // smaller than a single point of life
  });

  it("a life lead weighs more late in the game (tempo)", () => {
    const early = base();
    early.warriors[1].life = 5;
    early.round = 1;
    const late = structuredClone(early);
    late.round = 5;
    expect(evaluate(late, 0)).toBeGreaterThan(evaluate(early, 0));
  });

  it("decided games score at the terminal extremes", () => {
    const won = base();
    won.phase = "ended";
    won.winner = 0;
    expect(evaluate(won, 0)).toBe(EVAL_WEIGHTS.terminal);
    expect(evaluate(won, 1)).toBe(-EVAL_WEIGHTS.terminal);
    const draw = structuredClone(won);
    draw.winner = "draw";
    expect(evaluate(draw, 0)).toBe(0);
  });
});
