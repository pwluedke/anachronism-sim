import { describe, it, expect } from "vitest";
import { init } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { chooseAction } from "../src/bot/choose";
import { search } from "../src/bot/search";
import { TIER_CONFIG, DEPTH_EASY, DEPTH_HARD, DEPTH_MEDIUM } from "../src/bot/config";
import { ACHILLES, AJAX } from "../fixtures/warriors";
import type { GameState } from "../src/types";

// Close quarters, P0 to act: several plausible choices, so a blunder is visible.
function midgame(): GameState {
  const s = structuredClone(init(ACHILLES, AJAX, 3).state);
  s.currentPlayer = 0;
  s.turnOrder = [0, 1];
  s.turnIndex = 0;
  s.actionsRemaining = 3;
  s.warriors[0].position = { row: 1, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = { row: 2, col: 1 };
  s.warriors[1].facing = "E";
  return s;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

describe("chooseAction tiers", () => {
  it("tier depths are ordered easy < medium < hard; only easy blunders", () => {
    expect(TIER_CONFIG.easy.depth).toBeLessThan(TIER_CONFIG.medium.depth);
    expect(TIER_CONFIG.medium.depth).toBeLessThan(TIER_CONFIG.hard.depth);
    expect(TIER_CONFIG.easy.blunderChance).toBeGreaterThan(0);
    expect(TIER_CONFIG.medium.blunderChance).toBe(0);
    expect(TIER_CONFIG.hard.blunderChance).toBe(0);
  });

  it("hard is deterministic and equals the minimax best action", () => {
    const s = midgame();
    const a = chooseAction(s, "hard", 42);
    expect(chooseAction(s, "hard", 42)).toEqual(a);
    expect(a).toEqual(search(s, DEPTH_HARD, { sampleSeed: 42 }).action);
  });

  it("medium never blunders: always its search pick, for every seed", () => {
    const s = midgame();
    for (const seed of SEEDS) {
      expect(chooseAction(s, "medium", seed)).toEqual(search(s, DEPTH_MEDIUM, { sampleSeed: seed }).action);
    }
  });

  it("easy sometimes diverges from hard's pick across seeds, but is always legal", () => {
    const s = midgame();
    const legal = getLegalActions(s);
    const hard = chooseAction(s, "hard", 1);
    let fromHard = 0;
    let blunders = 0;
    for (const seed of SEEDS) {
      const e = chooseAction(s, "easy", seed);
      expect(legal).toContainEqual(e);
      if (JSON.stringify(e) !== JSON.stringify(hard)) fromHard++;
      if (JSON.stringify(e) !== JSON.stringify(search(s, DEPTH_EASY, { sampleSeed: seed }).action)) blunders++;
    }
    expect(fromHard).toBeGreaterThan(0);
    expect(blunders).toBeGreaterThan(0); // the seeded blunder path fired
    expect(blunders).toBeLessThan(SEEDS.length); // ...but not every time
  });

  it("easy is deterministic per (state, botSeed)", () => {
    const s = midgame();
    for (const seed of SEEDS.slice(0, 10)) {
      expect(chooseAction(s, "easy", seed)).toEqual(chooseAction(s, "easy", seed));
    }
  });

  it("every tier returns a member of getLegalActions from the opening position", () => {
    const s = init(AJAX, ACHILLES, 9).state;
    const legal = getLegalActions(s);
    for (const d of ["easy", "medium", "hard"] as const) expect(legal).toContainEqual(chooseAction(s, d, 3));
  });

  it("throws on a finished game rather than inventing an action", () => {
    const s = midgame();
    s.phase = "ended";
    s.winner = 0;
    expect(() => chooseAction(s, "hard", 1)).toThrow();
  });
});
