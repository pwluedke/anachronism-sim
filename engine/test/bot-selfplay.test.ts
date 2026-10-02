import { describe, it, expect } from "vitest";
import { selfPlay, selfPlayBatch, MAX_SELFPLAY_ACTIONS } from "../src/bot/selfplay";
import { FIXTURES, ACHILLES, AJAX, JEI_THE_TYRANT } from "../fixtures/warriors";

describe("bot self-play", () => {
  it("hard vs easy plays a full game to a legal terminal state", () => {
    const r = selfPlay(ACHILLES.id, AJAX.id, "hard", "easy", 2026);
    expect(r.winner).not.toBeNull();
    expect(r.events[r.events.length - 1].type).toBe("gameEnded");
    expect(r.actions).toBeGreaterThan(0);
    expect(r.actions).toBeLessThan(MAX_SELFPLAY_ACTIONS);
  }, 30_000);

  it("is reproducible: same cards, tiers and seed => identical game", () => {
    const a = selfPlay(JEI_THE_TYRANT.id, AJAX.id, "medium", "easy", 77);
    const b = selfPlay(JEI_THE_TYRANT.id, AJAX.id, "medium", "easy", 77);
    expect(a).toEqual(b);
  });

  it("every fixture matchup terminates legally across easy/medium pairings", () => {
    // Illegal actions or a runaway game would throw inside selfPlay.
    const ids = Object.keys(FIXTURES);
    for (const [a, b] of [["easy", "easy"], ["medium", "easy"], ["medium", "medium"]] as const) {
      const r = selfPlayBatch(a, b, ids.length * ids.length, ids, 100);
      expect(r.aWins + r.bWins + r.draws).toBe(r.games);
    }
  }, 60_000);

  it("rejects unknown card ids", () => {
    expect(() => selfPlay("nope", AJAX.id, "easy", "easy", 1)).toThrow(/unknown card/);
  });
});
