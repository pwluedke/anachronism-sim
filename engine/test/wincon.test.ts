import { describe, it, expect } from "vitest";
import { init, applyAction } from "../src/engine";
import { resolveAttack } from "../src/combat";
import { ACHILLES, AJAX } from "../fixtures/warriors";
import type { CardData, GameState, GameEvent } from "../src/types";

function lastEvent(events: GameEvent[], t: GameEvent["type"]) {
  return [...events].reverse().find((e) => e.type === t);
}

/** Drive a game to completion with both players PASSing every turn. */
function passToEnd(s: GameState): GameState {
  let guard = 0;
  while (s.phase === "playing" && guard++ < 50) s = applyAction(s, { type: "PASS" }).state;
  return s;
}

describe("win condition: kill (immediate)", () => {
  it("reducing life to <=0 ends the game immediately for the attacker", () => {
    const { state } = init(AJAX, ACHILLES, 1);
    // hand-place an attack: player 0 at (1,1) facing S, defender at (1,2)?? use
    // Ajax's front cell. Ajax 2B is front (+1): facing S -> (2,1).
    const s: GameState = structuredClone(state);
    s.currentPlayer = 0;
    s.turnOrder = [0, 1];
    s.turnIndex = 0;
    s.actionsRemaining = 3;
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[0].damage = 5;
    s.warriors[1].position = { row: 2, col: 1 }; // Ajax 2B front cell
    s.warriors[1].life = 1;
    // find an rng that produces a hit on this matchup
    let rng = 0;
    for (let r = 1; r < 5000; r++) {
      if (resolveAttack(s.warriors[0], s.warriors[1], r, 4).result.hit) {
        rng = r;
        break;
      }
    }
    s.rng = rng;
    const out = applyAction(s, { type: "ATTACK" });
    const defeated = lastEvent(out.events, "warriorDefeated");
    const ended = lastEvent(out.events, "gameEnded");
    expect(defeated).toMatchObject({ player: 1 });
    expect(ended).toMatchObject({ winner: 0, reason: "kill" });
    expect(out.state.phase).toBe("ended");
    expect(out.state.winner).toBe(0);
  });
});

function card(over: Partial<CardData>): CardData {
  return {
    id: "t",
    name: "T",
    life: 5,
    speed: 1,
    experience: 5,
    damage: 1,
    grid: { "3B": "marker" }, // no reach -> nobody can attack; pure pass game
    ...over,
  };
}

describe("win conditions after 5 rounds (no contact)", () => {
  it("higher current life wins (reason: life)", () => {
    const s = passToEnd(init(card({ id: "a", life: 9 }), card({ id: "b", life: 6 }), 4).state);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe(0);
  });

  it("equal life -> higher experience wins (reason: experience)", () => {
    const a = card({ id: "a", life: 7, experience: 8 });
    const b = card({ id: "b", life: 7, experience: 3 });
    let s = init(a, b, 11).state;
    const events: GameEvent[] = [];
    let guard = 0;
    while (s.phase === "playing" && guard++ < 50) {
      const r = applyAction(s, { type: "PASS" });
      events.push(...r.events);
      s = r.state;
    }
    expect(s.winner).toBe(0);
    expect(lastEvent(events, "gameEnded")).toMatchObject({ winner: 0, reason: "experience" });
  });

  it("equal life and experience -> draw", () => {
    const a = card({ id: "a", life: 7, experience: 5 });
    const b = card({ id: "b", life: 7, experience: 5 });
    let s = init(a, b, 11).state;
    const events: GameEvent[] = [];
    let guard = 0;
    while (s.phase === "playing" && guard++ < 50) {
      const r = applyAction(s, { type: "PASS" });
      events.push(...r.events);
      s = r.state;
    }
    expect(s.winner).toBe("draw");
    expect(lastEvent(events, "gameEnded")).toMatchObject({ winner: "draw", reason: "draw" });
  });
});

describe("determinism of a full passive game", () => {
  it("same seed => identical end state", () => {
    const run = () => passToEnd(init(ACHILLES, AJAX, 2024).state);
    expect(run()).toEqual(run());
  });
});
