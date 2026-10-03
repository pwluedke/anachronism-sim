import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { REGISTRY } from "../src/abilities/registry";
import { defineCard } from "../src/abilities/format";
import { applyEffect, moveOptions } from "../src/abilities/primitives";
import { attackRollBonus, defenseRollBonus, weaponDamageBonus } from "../src/abilities/runtime";
import type { FireContext } from "../src/abilities/types";
import { indexCards, loadDeck, withOrder, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = withOrder(deck("Alexander the Great"), [1, 0, 2, 3]); // Sarissae (weapon) in play from round 1
const LEO = deck("Leonidas");
const SARISSAE = ALEX.support[0].id;

const touched: string[] = [];
const define = (id: string, ...a: Parameters<typeof defineCard>[1][]) => (touched.push(id), defineCard(id, ...a));
afterEach(() => {
  for (const id of touched.splice(0)) delete REGISTRY[id];
});
const ctx = (state: GameState, extra: Partial<FireContext> = {}): FireContext => ({
  state,
  owner: 0,
  cardId: "x",
  cardName: "X",
  ability: "A",
  events: [],
  ...extra,
});

describe("defense-roll modifier", () => {
  it("continuous (on the defender's card) and timed this-round", () => {
    define(LEO.warrior.id, { data: { name: "Guard", trigger: "continuous", effects: [{ kind: "defenseRoll", amount: 2 }] } });
    const s = structuredClone(init(ALEX, LEO, 1).state);
    expect(defenseRollBonus(s, 1)).toBe(2);
    expect(attackRollBonus(s, 1)).toBe(0); // a defense modifier doesn't touch attack rolls
    applyEffect(ctx(s, { owner: 1 }), { kind: "defenseRoll", amount: 1 }, "thisRound");
    expect(defenseRollBonus(s, 1)).toBe(3);
  });
});

describe("deal damage", () => {
  it("reaches self, the opponent / all opponents, the defender and the attacker", () => {
    const s = structuredClone(init(ALEX, LEO, 1).state);
    const [a, b] = [s.warriors[0].life, s.warriors[1].life];
    expect(applyEffect(ctx(s), { kind: "dealDamage", amount: 1, target: "allOpponents" }, undefined)).toBe("deals 1 damage to Leonidas");
    applyEffect(ctx(s), { kind: "dealDamage", amount: 1, target: "opponent" }, undefined);
    applyEffect(ctx(s), { kind: "dealDamage", amount: 1, target: "self" }, undefined);
    applyEffect(ctx(s, { attacker: 0, defender: 1 }), { kind: "dealDamage", amount: 2, target: "defender" }, undefined);
    applyEffect(ctx(s, { attacker: 0, defender: 1 }), { kind: "dealDamage", amount: 1, target: "attacker" }, undefined);
    expect([s.warriors[0].life, s.warriors[1].life]).toEqual([a - 2, b - 4]);
  });
});

describe("weapon-damage modifier", () => {
  it("applies only to attacks with that weapon; gated effects add up", () => {
    define(SARISSAE, {
      data: {
        name: "Edge",
        trigger: "continuous",
        effects: [
          { kind: "weaponDamage", amount: 1, when: { kind: "hasInPlay", cardType: "weapon" } }, // true: Sarissae itself
          { kind: "weaponDamage", amount: 1, when: { kind: "hasInPlay", cardType: "weapon" } },
          { kind: "weaponDamage", amount: 5, when: { kind: "hasInPlay", cardType: "armor" } }, // false in round 1
        ],
      },
    });
    const s = init(ALEX, LEO, 1).state;
    expect(weaponDamageBonus(s, 0, SARISSAE)).toBe(2);
    expect(weaponDamageBonus(s, 0, "some-other-weapon")).toBe(0);
  });
});

describe("move via ability", () => {
  it("moveOptions: exactly N steps through empty cells, never through the foe or back to the start", () => {
    const s = structuredClone(init(ALEX, LEO, 1).state);
    s.warriors[0].position = { row: 0, col: 0 };
    s.warriors[1].position = { row: 1, col: 0 }; // blocks the way south
    const cells = [...new Set(moveOptions(s, 0, 2).map((o) => `${o.to.row},${o.to.col}`))].sort();
    expect(cells).toEqual(["0,2", "1,1"]); // (2,0) would pass through the foe; (0,0) is the start
    expect(moveOptions(s, 0, 2)).toHaveLength(cells.length * 4); // any facing after the move
  });

  it("an Action move is offered per destination + facing, costs one action, and moves", () => {
    define(ALEX.warrior.id, { data: { name: "Dash", trigger: "action", usageLimit: "oncePerRound", effects: [{ kind: "move", spaces: 2 }] } });
    const s = structuredClone(init(ALEX, LEO, 1).state);
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
    s.warriors[0].position = { row: 0, col: 1 };
    s.warriors[1].position = { row: 3, col: 3 };
    const moves = getLegalActions(s).filter((a) => a.type === "ABILITY");
    expect(moves.length).toBe(moveOptions(s, 0, 2).length);
    const act = { type: "ABILITY", card: ALEX.warrior.id, ability: "Dash", to: { row: 2, col: 1 }, facing: "E" } as const;
    expect(moves).toContainEqual(act);
    const r = applyAction(s, act);
    expect(r.state.warriors[0]).toMatchObject({ position: { row: 2, col: 1 }, facing: "E" });
    expect(r.state.actionsRemaining).toBe(2);
    expect(r.events.map((e) => e.type)).toEqual(["moved", "abilityFired"]);
    expect(getLegalActions(r.state).some((a) => a.type === "ABILITY")).toBe(false); // once per round
    // an illegal destination does nothing
    expect(applyAction(s, { ...act, to: { row: 3, col: 3 } }).events).toEqual([]);
  });
});
