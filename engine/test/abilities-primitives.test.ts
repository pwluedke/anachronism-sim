import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { judge } from "../src/combat";
import { REGISTRY } from "../src/abilities/registry";
import { defineCard } from "../src/abilities/format";
import { applyEffect, holds } from "../src/abilities/primitives";
import type { FireContext } from "../src/abilities/types";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // Oracle of Delphi (inspiration) revealed in round 1
const LEO = deck("Leonidas");

const touched: string[] = [];
afterEach(() => {
  for (const id of touched.splice(0)) delete REGISTRY[id];
});
const define = (id: string, ...a: Parameters<typeof defineCard>[1][]) => (touched.push(id), defineCard(id, ...a));

const ctx = (state: GameState, owner: 0 | 1 = 0): FireContext => ({
  state,
  owner,
  cardId: "x",
  cardName: "X",
  ability: "A",
  events: [],
});

describe("conditions", () => {
  it("hasInPlay checks the owner's in-play support cards by type", () => {
    const s = structuredClone(init(ALEX, LEO, 1).state); // Oracle of Delphi in play
    expect(holds({ kind: "hasInPlay", cardType: "inspiration" }, s, 0)).toBe(true);
    expect(holds({ kind: "hasInPlay", cardType: "weapon" }, s, 0)).toBe(false);
    s.cards[0].support[0].status = "discarded";
    expect(holds({ kind: "hasInPlay", cardType: "inspiration" }, s, 0)).toBe(false);
  });

  it("lostInitiative is true for the player who didn't win initiative", () => {
    const s = init(ALEX, LEO, 1).state; // Oracle 2 vs Nemesis 1 -> Alexander
    expect(holds({ kind: "lostInitiative" }, s, 1)).toBe(true);
    expect(holds({ kind: "lostInitiative" }, s, 0)).toBe(false);
  });
});

describe("effects", () => {
  it("gainLife is immediate", () => {
    const s = structuredClone(init(ALEX, LEO, 1).state);
    expect(applyEffect(ctx(s), { kind: "gainLife", amount: 2 }, undefined)).toBe("gains 2 life");
    expect(s.warriors[0].life).toBe(ALEX.warrior.life + 2);
  });

  it("attackRoll this round is active at once; speed next turn starts pending", () => {
    const s = structuredClone(init(ALEX, LEO, 1).state);
    applyEffect(ctx(s), { kind: "attackRoll", amount: 1 }, "thisRound");
    applyEffect(ctx(s), { kind: "speed", amount: 1 }, "nextTurn");
    expect(s.effects.map((e) => [e.kind, e.duration, e.active])).toEqual([
      ["attackRoll", "thisRound", true],
      ["speed", "nextTurn", false],
    ]);
    expect(() => applyEffect(ctx(s), { kind: "speed", amount: 1 }, "permanent")).toThrow();
  });
});

describe("attack-roll modifiers in combat", () => {
  const w = init(ALEX, LEO, 1).state.warriors;
  it("the bonus is added to the attacker's total and can turn a miss into a hit", () => {
    const miss = judge([3, 2], [4, 3], 0, w[0], w[1], 1); // 5 vs 7
    const hit = judge([3, 2], [4, 3], 0, w[0], w[1], 1, 3); // 5+3 = 8 vs 7
    expect(miss.result).toMatchObject({ rollBonus: 0, attackerTotal: 5, hit: false });
    expect(hit.result).toMatchObject({ rollBonus: 3, attackerTotal: 8, hit: true });
  });
  it("a crit is still the attacker's raw doubles", () => {
    expect(judge([2, 2], [6, 5], 0, w[0], w[1], 1, 8).result).toMatchObject({ hit: true, crit: true });
  });

  it("the engine applies the attacker's current bonus to ATTACK", () => {
    define(ALEX.warrior.id, { data: { name: "B", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 5 }] } });
    const s = structuredClone(init(ALEX, LEO, 1).state);
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
    s.warriors[0].position = { row: 0, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 1, col: 1 };
    const e = applyAction(s, { type: "ATTACK" }).events.find((x) => x.type === "attacked");
    expect(e).toMatchObject({ rollBonus: 5 });
    if (e?.type === "attacked") expect(e.attackerTotal).toBe(e.attackerRoll + e.gridMod + 5);
  });
});

describe("action abilities", () => {
  it("are offered by getLegalActions, cost one action, and respect once-per-round", () => {
    define(ALEX.warrior.id, {
      data: { name: "Rally", trigger: "action", usageLimit: "oncePerRound", effects: [{ kind: "gainLife", amount: 1 }] },
    });
    const s = init(ALEX, LEO, 1).state;
    expect(s.currentPlayer).toBe(0);
    const act = { type: "ABILITY", card: ALEX.warrior.id, ability: "Rally" } as const;
    expect(getLegalActions(s)).toContainEqual(act);
    const r = applyAction(s, act);
    expect(r.state.actionsRemaining).toBe(s.actionsRemaining - 1);
    expect(r.state.warriors[0].life).toBe(ALEX.warrior.life + 1);
    expect(getLegalActions(r.state)).not.toContainEqual(act); // used this round
    expect(applyAction(r.state, act).events).toEqual([]);
    expect(applyAction(s, { type: "ABILITY", card: ALEX.warrior.id, ability: "Nope" }).events).toEqual([]);
  });
});
