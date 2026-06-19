import { describe, it, expect, vi, afterEach } from "vitest";
import * as Hooks from "../src/hooks";
import { init, applyAction } from "../src/engine";
import { resolveAttack } from "../src/combat";
import { ACHILLES, AJAX } from "../fixtures/warriors";
import type { GameState, HookName } from "../src";

afterEach(() => vi.restoreAllMocks());

describe("hook definitions", () => {
  it("defines exactly the 14 spine hook-points", () => {
    expect(Hooks.HOOKS).toHaveLength(14);
    expect([...Hooks.HOOKS]).toEqual([
      "onSetup", "onRoundStart", "onReveal", "onTurnStart",
      "beforeAttackRoll", "afterAttackRoll", "onHit", "onMiss",
      "onCriticalHit", "afterDefense", "onDamageDealt", "onWarriorDefeated",
      "onTurnEnd", "onRoundEnd",
    ]);
  });

  it("resolveHooks is the identity stub (returns state unchanged)", () => {
    const { state } = init(ACHILLES, AJAX, 1);
    for (const h of Hooks.HOOKS) {
      expect(Hooks.resolveHooks(state, h)).toBe(state);
    }
  });
});

describe("hook firing points", () => {
  function fired(): HookName[] {
    const log: HookName[] = [];
    vi.spyOn(Hooks, "resolveHooks").mockImplementation((s, hook) => {
      log.push(hook);
      return s;
    });
    return log;
  }

  it("setup + round 1 fire onSetup, onRoundStart, onReveal, onTurnStart", () => {
    const log = fired();
    init(ACHILLES, AJAX, 1);
    expect(log).toEqual(["onSetup", "onRoundStart", "onReveal", "onTurnStart"]);
  });

  it("PASS fires onTurnEnd then the next turn's onTurnStart", () => {
    const { state } = init(ACHILLES, AJAX, 1);
    const log = fired();
    applyAction(state, { type: "PASS" });
    expect(log).toEqual(["onTurnEnd", "onTurnStart"]);
  });

  it("an ATTACK fires the combat hooks in order (hit path)", () => {
    // build an attack that lands, then assert the hook sequence
    const { state } = init(AJAX, ACHILLES, 1);
    const s: GameState = structuredClone(state);
    s.currentPlayer = 0;
    s.turnOrder = [0, 1];
    s.turnIndex = 0;
    s.actionsRemaining = 3;
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[0].damage = 1;
    s.warriors[1].position = { row: 2, col: 1 };
    s.warriors[1].life = 20; // survives, so no defeat/kill path
    // find an rng that hits (and ideally a non-crit so onCriticalHit is absent)
    let rng = 0;
    for (let r = 1; r < 5000; r++) {
      const res = resolveAttack(s.warriors[0], s.warriors[1], r, 4).result;
      if (res.hit && !res.crit) { rng = r; break; }
    }
    s.rng = rng;
    const log = fired();
    applyAction(s, { type: "ATTACK" });
    expect(log).toEqual([
      "beforeAttackRoll",
      "afterAttackRoll",
      "onHit",
      "afterDefense",
      "onDamageDealt",
    ]);
  });

  it("the engine runs a whole game correctly with all hooks empty", () => {
    let s = init(ACHILLES, AJAX, 7).state;
    let guard = 0;
    while (s.phase === "playing" && guard++ < 50) s = applyAction(s, { type: "PASS" }).state;
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe(1); // Ajax life 10 > Achilles life 8 after round 5
  });
});
