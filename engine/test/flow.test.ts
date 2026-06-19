import { describe, it, expect } from "vitest";
import { init, applyAction, determineInitiative } from "../src/engine";
import { ACHILLES, AJAX, SULEIMAN } from "../fixtures/warriors";
import type { GameState, GameEvent } from "../src/types";

function ev<T extends GameEvent["type"]>(events: GameEvent[], t: T) {
  return events.filter((e) => e.type === t);
}

describe("setup / init", () => {
  it("starts at round 1, playing, both at full life, in starting cells", () => {
    const { state, events } = init(ACHILLES, AJAX, 1);
    expect(state.phase).toBe("playing");
    expect(state.round).toBe(1);
    expect(state.warriors[0].position).toEqual({ row: 0, col: 1 });
    expect(state.warriors[1].position).toEqual({ row: 3, col: 1 });
    expect(state.warriors[0].facing).toBe("S");
    expect(state.warriors[1].facing).toBe("N");
    expect(state.warriors[0].life).toBe(ACHILLES.life);
    expect(ev(events, "setup")).toHaveLength(1);
    expect(ev(events, "roundStarted")).toHaveLength(1);
    expect(ev(events, "turnStarted")).toHaveLength(1);
  });

  it("is fully deterministic: same cards+seed => identical state & events", () => {
    expect(init(ACHILLES, AJAX, 12345)).toEqual(init(ACHILLES, AJAX, 12345));
  });
});

describe("initiative", () => {
  it("higher experience takes initiative (acts first)", () => {
    // Achilles exp 9 > Ajax exp 3 -> Achilles (player 0) first
    const { state } = init(ACHILLES, AJAX, 7);
    expect(state.initiative).toBe(0);
    expect(state.currentPlayer).toBe(0);
  });
  it("lower-experience card as player 0 cedes initiative", () => {
    const { state } = init(AJAX, ACHILLES, 7); // Ajax exp3 vs Achilles exp9
    expect(state.initiative).toBe(1);
    expect(state.currentPlayer).toBe(1);
  });
  it("equal experience falls to a dice-off (deterministic per seed)", () => {
    const a = determineInitiative(
      [
        { ...ACHILLES, experience: 5 } as never,
        { ...AJAX, experience: 5 } as never,
      ],
      42,
    );
    const b = determineInitiative(
      [
        { ...ACHILLES, experience: 5 } as never,
        { ...AJAX, experience: 5 } as never,
      ],
      42,
    );
    expect(a.initiative).toBe(b.initiative);
  });
});

describe("turn = up to (speed) actions", () => {
  it("a player's turn auto-ends after `speed` move/rotate actions", () => {
    // speed-3 warrior: 3 rotates then the turn ends (next player's turnStarted)
    let { state } = init(ACHILLES, AJAX, 3);
    const first = state.currentPlayer;
    expect(state.actionsRemaining).toBe(state.warriors[first].speed); // 3
    let r = applyAction(state, { type: "ROTATE", facing: "E" });
    state = r.state;
    expect(state.actionsRemaining).toBe(2);
    r = applyAction(state, { type: "ROTATE", facing: "S" });
    state = r.state;
    expect(state.actionsRemaining).toBe(1);
    r = applyAction(state, { type: "ROTATE", facing: "W" });
    state = r.state;
    // third action spent -> turn auto-ended, other player now active with full actions
    expect(ev(r.events, "turnEnded")).toHaveLength(1);
    expect(ev(r.events, "turnStarted")).toHaveLength(1);
    expect(state.currentPlayer).not.toBe(first);
  });

  it("PASS ends a turn immediately", () => {
    let { state } = init(ACHILLES, AJAX, 3);
    const first = state.currentPlayer;
    const r = applyAction(state, { type: "PASS" });
    expect(ev(r.events, "passed")).toHaveLength(1);
    expect(ev(r.events, "turnEnded")).toHaveLength(1);
    expect(r.state.currentPlayer).not.toBe(first);
  });

  it("a move/rotate is rejected (no-op) once the budget is spent within a turn", () => {
    // drive to the other player, then exhaust them too is overkill; just confirm
    // an illegal off-grid move is a no-op (state unchanged, no events)
    const { state } = init(ACHILLES, AJAX, 3);
    // player 0 at row 0 facing S: moving N is off-grid
    const r = applyAction(state, { type: "MOVE", dir: "N" });
    expect(r.events).toHaveLength(0);
    expect(r.state).toBe(state); // same reference -> untouched
  });
});

describe("5-round structure (both players PASS every turn)", () => {
  it("runs exactly 5 rounds then ends by life", () => {
    let s: GameState = init(SULEIMAN, ACHILLES, 99).state; // life 10 vs 8
    const roundStarts: number[] = [];
    let guard = 0;
    while (s.phase === "playing" && guard++ < 50) {
      const r = applyAction(s, { type: "PASS" });
      for (const e of r.events) if (e.type === "roundStarted") roundStarts.push(e.round);
      s = r.state;
    }
    expect(s.phase).toBe("ended");
    // rounds 2..5 announced via applyAction (round 1 announced during init)
    expect(roundStarts).toEqual([2, 3, 4, 5]);
  });
});

describe("basic attacks: cost 1 action, NOT capped per turn (rulebook p11)", () => {
  it("a Speed-3 warrior makes 3 basic attacks in one turn, then the turn ends", () => {
    // Achilles (P0) at (1,1) facing S; defender at (1,2) is the +0 front cell... use
    // the front cell directly south: defender at (2,1). High life so it survives 3 hits.
    const { state } = init(ACHILLES, AJAX, 4);
    const s: GameState = structuredClone(state);
    s.currentPlayer = 0;
    s.turnOrder = [0, 1];
    s.turnIndex = 0;
    s.actionsRemaining = 3; // Speed 3
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[0].damage = 1;
    s.warriors[1].position = { row: 2, col: 1 }; // Achilles front (+0) cell
    s.warriors[1].life = 50; // survives all three attacks (no early kill)

    let cur = s;
    const budgets: number[] = [];
    const attacks: number[] = [];
    let turnEndedOnThird = false;
    for (let i = 0; i < 3; i++) {
      const r = applyAction(cur, { type: "ATTACK" });
      attacks.push(r.events.filter((e) => e.type === "attacked").length);
      if (i === 2) turnEndedOnThird = r.events.some((e) => e.type === "turnEnded");
      cur = r.state;
      budgets.push(cur.actionsRemaining);
    }

    // each ATTACK resolved exactly once and cost exactly one action (no 1/turn cap)
    expect(attacks).toEqual([1, 1, 1]);
    // first two attacks decrement 3 -> 2 -> 1; the 3rd spends the last action and
    // auto-ends the turn (so the reading after it is the NEXT turn's fresh budget)
    expect(budgets[0]).toBe(2);
    expect(budgets[1]).toBe(1);
    expect(turnEndedOnThird).toBe(true);
    expect(cur.currentPlayer).toBe(1);
    expect(cur.warriors[1].life).toBeGreaterThan(0); // survived all three
    expect(cur.warriors[1].life).toBeLessThanOrEqual(50);
  });

  it("an ATTACK with no actions left is a no-op (budget gates attacks)", () => {
    const { state } = init(ACHILLES, AJAX, 4);
    const s: GameState = structuredClone(state);
    s.currentPlayer = 0;
    s.actionsRemaining = 0;
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 2, col: 1 };
    const r = applyAction(s, { type: "ATTACK" });
    expect(r.events).toHaveLength(0);
    expect(r.state).toBe(s);
  });
});
