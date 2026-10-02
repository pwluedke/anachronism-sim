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
    expect(evaluate(s, 0)).toBeCloseTo(-evaluate(s, 1), 9);
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
    expect(score).toBeGreaterThan(0);
    // ...but less than being one life point up with no experience edge.
    const onePoint = base();
    onePoint.warriors[1].life -= 1;
    expect(score).toBeLessThan(evaluate(onePoint, 0));
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

describe("evaluate: turn-aware threat (fix 1)", () => {
  it("a mutual threat favours whoever acts next", () => {
    // Two Achilles face each other, adjacent: each sits in the other's +0 front cell.
    const s = base();
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 2, col: 1 };
    s.warriors[1].facing = "N";
    s.currentPlayer = 0;
    expect(evaluate(s, 0)).toBeGreaterThan(0);
    const theirMove = { ...s, currentPlayer: 1 as const };
    expect(evaluate(theirMove, 0)).toBeLessThan(0);
  });

  it("an on-move threat is worth more with more actions left to spend on it", () => {
    const s = base();
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 2, col: 1 };
    s.currentPlayer = 0;
    const one = { ...s, actionsRemaining: 1 };
    const three = { ...s, actionsRemaining: 3 };
    expect(evaluate(three, 0)).toBeGreaterThan(evaluate(one, 0));
  });
});

describe("evaluate: life lead vs rounds remaining (fix 2)", () => {
  function lifeGap(gap: number, round: number): number {
    const s = base();
    s.round = round;
    s.warriors[1].life = s.warriors[0].life - gap; // gap > 0: P0 ahead
    return evaluate(s, 0);
  }

  it("the same lead is worth more as rounds run out", () => {
    expect(lifeGap(2, 5)).toBeGreaterThan(lifeGap(2, 3));
    expect(lifeGap(2, 3)).toBeGreaterThan(lifeGap(2, 1));
  });

  it("late, a trailing side gains from an even trade and a leading side loses from it", () => {
    // Even trade = 50/50 to end one point better or worse. Behind by 2: variance helps.
    const behind = (lifeGap(-1, 5) + lifeGap(-3, 5)) / 2 - lifeGap(-2, 5);
    const ahead = (lifeGap(1, 5) + lifeGap(3, 5)) / 2 - lifeGap(2, 5);
    expect(behind).toBeGreaterThan(0);
    expect(ahead).toBeLessThan(0);
  });

  it("a hard bot behind on life late engages instead of stalling (sample-game regression)", async () => {
    // Round 3 of the Hard(Achilles) vs Easy(Ajax) sample game: Achilles 8 vs Ajax 10, out of range.
    // Before the fix it circled its back row until round 5 and lost on life.
    const { search } = await import("../src/bot/search");
    const { applyAction } = await import("../src/engine");
    const { DEPTH_HARD } = await import("../src/bot/config");
    const s = structuredClone(init(ACHILLES, AJAX, 2026).state);
    s.round = 3;
    s.currentPlayer = 0;
    s.turnOrder = [0, 1];
    s.turnIndex = 0;
    s.actionsRemaining = 3;
    s.warriors[0].position = { row: 2, col: 3 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 3, col: 1 };
    s.warriors[1].facing = "N";
    const plan: string[] = [];
    let st: GameState = s;
    while (st.phase === "playing" && st.currentPlayer === 0 && plan.length < 3) {
      const a = search(st, DEPTH_HARD, { sampleSeed: 5 }).action;
      plan.push(a.type);
      if (a.type === "ATTACK" || a.type === "PASS") break;
      st = applyAction(st, a).state;
    }
    expect(plan).toContain("ATTACK");
  }, 30_000);
});
