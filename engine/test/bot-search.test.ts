import { describe, it, expect } from "vitest";
import { init, applyAction } from "../src/engine";
import { evaluate } from "../src/bot/evaluate";
import { getLegalActions } from "../src/legal";
import { search } from "../src/bot/search";
import { ACHILLES, AJAX, JEI_THE_TYRANT } from "../fixtures/warriors";
import type { GameState } from "../src/types";

// P0 to act with `actions` left; positions/facings given; turn order P0 then P1.
function setup(opts: {
  p0: [number, number, "N" | "E" | "S" | "W"];
  p1: [number, number, "N" | "E" | "S" | "W"];
  actions?: number;
  foeLife?: number;
}): GameState {
  const s = structuredClone(init(ACHILLES, AJAX, 3).state);
  s.currentPlayer = 0;
  s.turnOrder = [0, 1];
  s.turnIndex = 0;
  s.actionsRemaining = opts.actions ?? 3;
  s.warriors[0].position = { row: opts.p0[0], col: opts.p0[1] };
  s.warriors[0].facing = opts.p0[2];
  s.warriors[1].position = { row: opts.p1[0], col: opts.p1[1] };
  s.warriors[1].facing = opts.p1[2];
  if (opts.foeLife !== undefined) s.warriors[1].life = opts.foeLife;
  return s;
}

describe("search (expectiminimax)", () => {
  it("takes the killing attack when the foe is on 1 life and in grid", () => {
    // Achilles at (1,1) facing S: front +0 cell is (2,1) where Ajax stands.
    const s = setup({ p0: [1, 1, "S"], p1: [2, 1, "N"], actions: 1, foeLife: 1 });
    for (const depth of [1, 2, 3]) expect(search(s, depth).action).toEqual({ type: "ATTACK" });
  });

  it("sets up the attack when facing away from an adjacent, nearly dead foe", () => {
    // Achilles at (1,1) facing N; Ajax directly south at (2,1). He must first turn S — or, with his
    // diagonal move (Iroiki Taxitita), step to a corner facing Ajax — then attack.
    const s = setup({ p0: [1, 1, "N"], p1: [2, 1, "E"], actions: 2, foeLife: 1 });
    expect(getLegalActions(s)).not.toContainEqual({ type: "ATTACK" });
    const first = search(s, 2).action;
    expect(["ROTATE", "ABILITY"]).toContain(first.type);
    expect(getLegalActions(applyAction(s, first).state)).toContainEqual({ type: "ATTACK" });
  });

  it("alpha-beta pruning returns the same action and score as plain expectiminimax", () => {
    const states = [
      init(ACHILLES, AJAX, 7).state,
      setup({ p0: [1, 1, "S"], p1: [2, 2, "W"] }),
      setup({ p0: [1, 1, "E"], p1: [2, 1, "N"], actions: 2, foeLife: 3 }),
      init(JEI_THE_TYRANT, ACHILLES, 11).state,
    ];
    for (const s of states) {
      for (const depth of [1, 2, 3, 4]) {
        const pruned = search(s, depth, { prune: true });
        const full = search(s, depth, { prune: false });
        expect(pruned.action).toEqual(full.action);
        expect(pruned.score).toBeCloseTo(full.score, 9);
      }
    }
  });

  it("returns a legal action, is deterministic, and does not mutate its input", () => {
    const s = setup({ p0: [1, 1, "S"], p1: [2, 2, "W"] });
    const snapshot = structuredClone(s);
    const a = search(s, 4, { sampleSeed: 5 });
    const b = search(s, 4, { sampleSeed: 5 });
    expect(a).toEqual(b);
    expect(getLegalActions(s)).toContainEqual(a.action);
    expect(s).toEqual(snapshot);
  });

  it("never peeks at the game's real dice: changing state.rng does not change the decision", () => {
    const s = setup({ p0: [1, 1, "S"], p1: [2, 1, "N"], actions: 3, foeLife: 4 });
    const results = [1, 99, 12345, 777777].map((rng) => search({ ...s, rng }, 3, { sampleSeed: 1 }));
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("ties go to the lowest-index legal action", () => {
    // Far apart, level on life, nobody can reach a threat in one action: every depth-1 choice
    // scores the same.
    const s = setup({ p0: [1, 1, "N"], p1: [3, 3, "S"] });
    s.warriors[1].life = s.warriors[0].life;
    const legal = getLegalActions(s);
    const scores = legal.map((a) => evaluate(applyAction(s, a).state, 0));
    expect(new Set(scores).size).toBe(1);
    const r = search(s, 1);
    expect(r.index).toBe(0);
    expect(r.action).toEqual(legal[0]);
  });
});
