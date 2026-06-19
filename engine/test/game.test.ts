import { describe, it, expect } from "vitest";
import { playGreedyGame, formatEvent } from "../examples/policy";
import { ACHILLES, AJAX, SULEIMAN, JEI_THE_TYRANT } from "../fixtures/warriors";
import type { GameEvent } from "../src/types";

const last = (events: GameEvent[]) => events[events.length - 1];

describe("full scripted game (greedy policy, start to finish)", () => {
  it("Achilles vs Ajax reaches a decisive end with a winner", () => {
    const { state, events } = playGreedyGame(ACHILLES, AJAX, 20260619);
    expect(state.phase).toBe("ended");
    expect(state.winner).not.toBeNull();
    expect(last(events).type).toBe("gameEnded");
    expect(events.some((e) => e.type === "attacked")).toBe(true);
    // every event is formattable (event log is consumable)
    for (const e of events) expect(typeof formatEvent(e)).toBe("string");
  });

  it("is fully deterministic: same seed => identical state and events", () => {
    expect(playGreedyGame(ACHILLES, AJAX, 7)).toEqual(playGreedyGame(ACHILLES, AJAX, 7));
  });

  it("different seeds explore different games but always terminate with a winner", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { state } = playGreedyGame(ACHILLES, AJAX, seed);
      expect(state.phase).toBe("ended");
      expect(state.winner === 0 || state.winner === 1 || state.winner === "draw").toBe(true);
    }
  });

  it("a kill ends the game immediately (high-damage matchup)", () => {
    // Suleiman (dmg1) vs Jei (dmg2, only 6 life): across seeds, find a game that
    // ends by a kill and assert it terminates mid-stream, not by round-5 life.
    let sawKill = false;
    for (let seed = 1; seed <= 60 && !sawKill; seed++) {
      const { state, events } = playGreedyGame(SULEIMAN, JEI_THE_TYRANT, seed);
      const end = events.find((e) => e.type === "gameEnded");
      if (end && end.type === "gameEnded" && end.reason === "kill") {
        sawKill = true;
        expect(state.phase).toBe("ended");
        expect(events.some((e) => e.type === "warriorDefeated")).toBe(true);
      }
    }
    expect(sawKill).toBe(true);
  });

  it("the serialized game round-trips through JSON (GameState is serializable)", () => {
    const { state } = playGreedyGame(ACHILLES, AJAX, 3);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
