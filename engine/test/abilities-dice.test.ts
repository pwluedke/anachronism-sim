// Batch 5 (#89): ability dice rolls with a threshold, optional ("you may") follow-ups, and moving
// another warrior (who keeps their facing unless the card says otherwise — rulebook p11).
import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { moveOptions } from "../src/abilities/primitives";
import { defineCard, type AbilityData } from "../src/abilities/format";
import { REGISTRY } from "../src/abilities/registry";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { Action, GameEvent, GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // inert warrior: test abilities go on him
const LEO = deck("Leonidas");

const saved = new Map<string, (typeof REGISTRY)[string] | undefined>();
function give(cardId: string, ...abilities: AbilityData[]) {
  if (!saved.has(cardId)) saved.set(cardId, REGISTRY[cardId]);
  defineCard(cardId, ...abilities.map((data) => ({ data })));
}
afterEach(() => {
  for (const [id, prev] of saved) prev ? (REGISTRY[id] = prev) : delete REGISTRY[id];
  saved.clear();
});
function myTurn(s: GameState, rng: number): GameState {
  Object.assign(s, { phase: "playing", currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, pending: null, movedThisTurn: false, rng });
  s.warriors[0].position = { row: 0, col: 0 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = { row: 2, col: 2 };
  s.warriors[1].facing = "W";
  return s;
}
const rolled = (ev: GameEvent[]) => ev.filter((e): e is Extract<GameEvent, { type: "abilityRolled" }> => e.type === "abilityRolled");
const use = (s: GameState) => getLegalActions(s).find((a) => a.type === "ABILITY" && a.card === ALEX.warrior.id)!;

/** Fire Alexander's test Action ability at many seeds; return the first outcome that matches. */
function find(pred: (r: { state: GameState; events: GameEvent[] }) => boolean, setup?: (s: GameState) => void) {
  for (let rng = 1; rng < 2000; rng++) {
    const s = myTurn(structuredClone(init(ALEX, LEO, 1).state), rng);
    setup?.(s);
    const r = applyAction(s, use(s));
    if (pred(r)) return r;
  }
  throw new Error("no outcome found");
}

describe("ability dice roll with a threshold", () => {
  const heal: AbilityData = { name: "Pray", trigger: "action", roll: { dice: 2, cmp: "<", vs: "ownExperience" }, effects: [{ kind: "gainLife", amount: 2 }] };

  it("met: the effect happens; not met: nothing (and the roll is logged either way)", () => {
    give(ALEX.warrior.id, heal);
    const met = find((r) => rolled(r.events)[0]?.success === true);
    const e = rolled(met.events)[0];
    expect(e.dice).toHaveLength(2);
    expect(e.total).toBe(e.dice[0] + e.dice[1]);
    expect(e.target).toBe(ALEX.warrior.experience);
    expect(e.total).toBeLessThan(e.target);
    expect(met.state.warriors[0].life).toBe(ALEX.warrior.life + 2);
    const missed = find((r) => rolled(r.events)[0]?.success === false);
    expect(rolled(missed.events)[0].total).toBeGreaterThanOrEqual(ALEX.warrior.experience);
    expect(missed.state.warriors[0].life).toBe(ALEX.warrior.life);
    expect(missed.state.actionsRemaining).toBe(2); // the action is spent either way
  });

  it("X can be a number, your life, or a target warrior's experience; one die or two", () => {
    for (const [vs, want] of [
      [7, 7],
      ["ownLife", ALEX.warrior.life],
      [{ experienceOf: "opponent" }, LEO.warrior.experience],
    ] as const) {
      give(ALEX.warrior.id, { name: "Try", trigger: "action", roll: { dice: 1, cmp: ">=", vs }, effects: [{ kind: "gainLife", amount: 1 }] });
      const r = find(() => true);
      const e = rolled(r.events)[0];
      expect(e.dice).toHaveLength(1);
      expect(e.target).toBe(want);
      expect(e.success).toBe(e.total >= want);
    }
  });

  it("is deterministic under a fixed seed and draws from the game's seeded RNG", () => {
    give(ALEX.warrior.id, heal);
    const s = myTurn(structuredClone(init(ALEX, LEO, 1).state), 4242);
    const a = applyAction(s, use(s));
    const b = applyAction(s, use(s));
    expect(rolled(a.events)).toEqual(rolled(b.events));
    expect(a.state.rng).toBe(b.state.rng);
    expect(a.state.rng).not.toBe(s.rng);
  });
});

describe("optional ('you may') follow-up after a roll", () => {
  const dodge: AbilityData = {
    name: "Dodge",
    trigger: "action",
    roll: { dice: 2, cmp: ">=", vs: 2 }, // always met
    optional: true,
    effects: [{ kind: "move", spaces: 1 }],
  };

  it("offered as a choice — taken: you move (and may face any way)", () => {
    give(ALEX.warrior.id, dodge);
    const r = find(() => true);
    expect(r.state.pending?.kind).toBe("choice");
    expect(r.state.currentPlayer).toBe(0);
    const choices = getLegalActions(r.state);
    expect(choices).toContainEqual({ type: "DECLINE" });
    const take = choices.find((a): a is Extract<Action, { type: "CHOOSE" }> => a.type === "CHOOSE" && a.to.row === 1 && a.to.col === 0 && a.facing === "E")!;
    expect(take).toBeDefined();
    const t = applyAction(r.state, take);
    expect(t.state.pending).toBeNull();
    expect(t.state.warriors[0].position).toEqual({ row: 1, col: 0 });
    expect(t.state.warriors[0].facing).toBe("E");
    expect(t.state.movedThisTurn).toBe(true);
    expect(t.state.actionsRemaining).toBe(2);
  });

  it("declined: nothing moves and the turn goes on", () => {
    give(ALEX.warrior.id, dodge);
    const r = find(() => true);
    const d = applyAction(r.state, { type: "DECLINE" });
    expect(d.state.pending).toBeNull();
    expect(d.state.warriors[0].position).toEqual({ row: 0, col: 0 });
    expect(d.state.currentPlayer).toBe(0);
    expect(d.state.actionsRemaining).toBe(2);
  });

  it("a choice on the last action defers the end of the turn until it's made", () => {
    give(ALEX.warrior.id, dodge);
    const r = find(() => true, (s) => (s.actionsRemaining = 1));
    expect(r.state.pending?.kind).toBe("choice");
    expect(r.state.currentPlayer).toBe(0);
    const d = applyAction(r.state, { type: "DECLINE" });
    expect(d.state.currentPlayer).toBe(1); // now the turn passes
  });
});

describe("move another warrior", () => {
  it("their destinations: empty cells, up to / exactly N steps; they keep their facing (p11)", () => {
    const s = myTurn(structuredClone(init(ALEX, LEO, 1).state), 1);
    const one = moveOptions(s, 1, 1, { keepFacing: true });
    expect(one.map((o) => `${o.to.row},${o.to.col}`).sort()).toEqual(["1,2", "2,1", "2,3", "3,2"]);
    expect(new Set(one.map((o) => o.facing))).toEqual(new Set(["W"]));
    const upTo2 = moveOptions(s, 1, 2, { upTo: true });
    expect(upTo2.some((o) => o.to.row === 1 && o.to.col === 2)).toBe(true); // 1 step
    expect(upTo2.some((o) => o.to.row === 0 && o.to.col === 2)).toBe(true); // 2 steps
    expect(upTo2.some((o) => o.to.row === 0 && o.to.col === 0)).toBe(false); // occupied
  });

  it("an Action that moves the opponent: you pick where; they keep their facing", () => {
    give(ALEX.warrior.id, { name: "Shove", trigger: "action", effects: [{ kind: "move", spaces: 1, who: "opponent" }] });
    const s = myTurn(structuredClone(init(ALEX, LEO, 1).state), 1);
    const shoves = getLegalActions(s).filter((a): a is Extract<Action, { type: "ABILITY" }> => a.type === "ABILITY");
    expect(shoves.map((a) => `${a.to!.row},${a.to!.col}`).sort()).toEqual(["1,2", "2,1", "2,3", "3,2"]);
    expect(new Set(shoves.map((a) => a.facing))).toEqual(new Set(["W"]));
    const r = applyAction(s, shoves.find((a) => a.to!.row === 3)!);
    expect(r.state.warriors[1].position).toEqual({ row: 3, col: 2 });
    expect(r.state.warriors[1].facing).toBe("W");
    expect(r.state.warriors[0].position).toEqual({ row: 0, col: 0 });
    expect(r.state.movedThisTurn).toBe(false); // you didn't move
  });

  it("after a roll, a forced move of the opponent is your choice of space, with no decline", () => {
    give(ALEX.warrior.id, { name: "Bash", trigger: "action", roll: { dice: 2, cmp: ">=", vs: 2 }, effects: [{ kind: "move", spaces: 1, who: "opponent" }] });
    const r = find(() => true);
    const choices = getLegalActions(r.state);
    expect(choices).not.toContainEqual({ type: "DECLINE" });
    expect(choices.every((a) => a.type === "CHOOSE" && a.facing === "W")).toBe(true);
  });
});

describe("a choice for the warrior who isn't taking the turn", () => {
  it("passes control to them, then back", () => {
    // Leonidas (player 1) gets a when-missed optional move; Alexander attacks and misses.
    give(LEO.warrior.id, { name: "Slip", trigger: "missed", roll: { dice: 2, cmp: ">=", vs: 2 }, optional: true, effects: [{ kind: "move", spaces: 1 }] });
    for (let rng = 1; rng < 2000; rng++) {
      const s = myTurn(structuredClone(init(ALEX, LEO, 1).state), rng);
      s.warriors[1].position = { row: 1, col: 0 };
      s.warriors[1].life = 99;
      if (!getLegalActions(s).some((a) => a.type === "ATTACK" && !a.weapon)) throw new Error("set-up: no attack");
      const r = applyAction(s, { type: "ATTACK" });
      const atk = r.events.find((e) => e.type === "attacked");
      if (!atk || atk.type !== "attacked" || atk.hit || r.state.pending?.kind !== "choice") continue;
      expect(r.state.currentPlayer).toBe(1);
      const d = applyAction(r.state, { type: "DECLINE" });
      expect(d.state.currentPlayer).toBe(0);
      expect(d.state.actionsRemaining).toBe(2);
      return;
    }
    throw new Error("no miss found");
  });
});
