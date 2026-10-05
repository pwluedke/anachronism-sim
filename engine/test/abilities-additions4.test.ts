// Batch-4 additions (#77): moved-this-turn, has / has-no face-up card (type or trait), and the
// all-warriors / all-other-warriors targets for attack-roll, speed and damage effects.
import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { holds } from "../src/abilities/primitives";
import { defineCard, type AbilityData } from "../src/abilities/format";
import { REGISTRY } from "../src/abilities/registry";
import { attackRollBonus, continuousSpeed, damageBonus } from "../src/abilities/runtime";
import { indexCards, loadDeck, supportCard, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // inert warrior: test abilities go on him
const LEO = deck("Leonidas");
const fresh = (): GameState => structuredClone(init(ALEX, LEO, 1).state);

const saved = new Map<string, (typeof REGISTRY)[string] | undefined>();
function give(cardId: string, ...abilities: AbilityData[]) {
  if (!saved.has(cardId)) saved.set(cardId, REGISTRY[cardId]);
  defineCard(cardId, ...abilities.map((data) => ({ data })));
}
afterEach(() => {
  for (const [id, prev] of saved) prev ? (REGISTRY[id] = prev) : delete REGISTRY[id];
  saved.clear();
});

/** Player 0 to move, three actions, warriors apart. */
function myTurn(s: GameState): GameState {
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, movedThisTurn: false });
  s.warriors[0].position = { row: 1, col: 1 };
  s.warriors[1].position = { row: 3, col: 3 };
  return s;
}

describe("addition 1: self has moved this turn", () => {
  it("true after a move action this turn; false before, for the other player, and next turn", () => {
    const s = myTurn(fresh());
    expect(holds({ kind: "movedThisTurn" }, s, 0)).toBe(false);
    const r = applyAction(s, { type: "MOVE", dir: "E", facing: "E" });
    expect(r.events.some((e) => e.type === "moved")).toBe(true);
    expect(holds({ kind: "movedThisTurn" }, r.state, 0)).toBe(true);
    expect(holds({ kind: "movedThisTurn" }, r.state, 1)).toBe(false); // not their turn
    const next = applyAction(r.state, { type: "PASS" }).state; // player 1's turn starts
    expect(holds({ kind: "movedThisTurn" }, next, 1)).toBe(false);
  });

  it("turning in place is not moving", () => {
    const r = applyAction(myTurn(fresh()), { type: "ROTATE", facing: "W" });
    expect(holds({ kind: "movedThisTurn" }, r.state, 0)).toBe(false);
  });
});

describe("addition 2: a target has / has no face-up card of a type or trait", () => {
  it("by type: the defender has / has no face-up weapon", () => {
    const s = fresh(); // round 1: only Leonidas's inspiration (Nemesis) is up
    const q = { defender: 1 as const };
    expect(holds({ kind: "faceUpCard", who: "defender", cardType: "inspiration", has: true }, s, 0, q)).toBe(true);
    expect(holds({ kind: "faceUpCard", who: "defender", cardType: "weapon", has: true }, s, 0, q)).toBe(false);
    expect(holds({ kind: "faceUpCard", who: "defender", cardType: "weapon", has: false }, s, 0, q)).toBe(true);
    expect(holds({ kind: "faceUpCard", who: "defender", cardType: "inspiration", has: false }, s, 0, q)).toBe(false);
  });

  it("by trait: a face-up Shield card; face-down cards don't count", () => {
    const s = fresh();
    const shield = s.cards[1].support.findIndex((c) => c.card.traits.includes("Shield"));
    expect(shield).toBeGreaterThan(-1); // Leonidas's Hoplon
    const cond = { kind: "faceUpCard", who: "opponent", trait: "shield", has: true } as const;
    expect(holds(cond, s, 0)).toBe(false); // still face down
    s.cards[1].support[shield].status = "in-play";
    expect(holds(cond, s, 0)).toBe(true);
  });

  it("a Cavalry warrior is itself a cavalry card", () => {
    const s = structuredClone(init(ALEX, deck("Richard the Lionheart"), 1).state);
    const cav = (has: boolean) => ({ kind: "faceUpCard", who: "defender", trait: "Cavalry", has }) as const;
    expect(holds(cav(true), s, 0, { defender: 1 })).toBe(true);
    expect(holds(cav(false), s, 0, { defender: 1 })).toBe(false);
    expect(holds({ kind: "faceUpCard", who: "self", trait: "Cavalry", has: true }, s, 0)).toBe(false); // Alexander isn't
  });

  it("no attack in progress: a defender / attacker condition doesn't hold", () => {
    expect(holds({ kind: "faceUpCard", who: "defender", cardType: "weapon", has: false }, fresh(), 0)).toBe(false);
  });
});

describe("addition 3: all warriors / all other warriors", () => {
  it("continuous attack roll for all warriors reaches both; for all others, only the opponent", () => {
    const s = fresh();
    give(ALEX.warrior.id, { name: "All", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 1, target: "all" }] });
    expect(attackRollBonus(s, 0)).toBe(1);
    expect(attackRollBonus(s, 1)).toBe(1);
    give(ALEX.warrior.id, { name: "Others", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 1, target: "allOthers" }] });
    expect(attackRollBonus(s, 0)).toBe(0);
    expect(attackRollBonus(s, 1)).toBe(1);
  });

  it("continuous speed: self by default; all other warriors only the opponent; counted at turn start", () => {
    give(ALEX.warrior.id, { name: "Fast", trigger: "continuous", effects: [{ kind: "speed", amount: 1 }] });
    const s = fresh();
    expect(continuousSpeed(s, 0)).toBe(1);
    expect(continuousSpeed(s, 1)).toBe(0);
    expect(s.actionsRemaining).toBe(ALEX.warrior.speed + 1); // Alexander has initiative in round 1
    give(ALEX.warrior.id, { name: "Others", trigger: "continuous", effects: [{ kind: "speed", amount: 1, target: "allOthers" }] });
    expect(continuousSpeed(s, 0)).toBe(0);
    expect(continuousSpeed(s, 1)).toBe(1);
  });

  it("fired speed for all warriors gives each warrior the timed effect", () => {
    give(ALEX.warrior.id, { name: "Rush", trigger: "gameStart", effects: [{ kind: "speed", amount: 2, target: "all" }], duration: "thisRound" });
    const s = fresh();
    expect(s.effects.filter((e) => e.kind === "speed").map((e) => e.owner).sort()).toEqual([0, 1]);
    give(ALEX.warrior.id, { name: "Rush", trigger: "gameStart", effects: [{ kind: "speed", amount: 2, target: "allOthers" }], duration: "thisRound" });
    expect(fresh().effects.filter((e) => e.kind === "speed").map((e) => e.owner)).toEqual([1]);
  });

  it("ability damage to all warriors hits both; to all other warriors only the opponent", () => {
    give(ALEX.warrior.id, { name: "Quake", trigger: "gameStart", effects: [{ kind: "dealDamage", amount: 1, target: "all" }] });
    let s = fresh();
    expect([s.warriors[0].life, s.warriors[1].life]).toEqual([ALEX.warrior.life - 1, LEO.warrior.life - 1]);
    give(ALEX.warrior.id, { name: "Quake", trigger: "gameStart", effects: [{ kind: "dealDamage", amount: 1, target: "allOthers" }] });
    s = fresh();
    expect([s.warriors[0].life, s.warriors[1].life]).toEqual([ALEX.warrior.life, LEO.warrior.life - 1]);
  });

  it("damage effects: 'your attacks deal +N' applies to every attack of yours, not the opponent's", () => {
    give(ALEX.warrior.id, { name: "Fury", trigger: "continuous", effects: [{ kind: "attackDamage", amount: 1 }] });
    const s = fresh();
    expect(damageBonus(s, 0)).toBe(1); // basic
    expect(damageBonus(s, 0, "any-weapon")).toBe(1);
    expect(damageBonus(s, 1)).toBe(0);
  });

  it("timed damage: a fired weapon-damage effect only counts for that weapon", () => {
    const yumi = cards["s1-023"];
    const s = fresh();
    s.cards[0].support[0] = { card: supportCard(yumi), status: "in-play" };
    s.effects.push({ owner: 0, source: yumi.id, sourceName: yumi.name, ability: "t", kind: "damage", amount: 1, weapon: yumi.id, duration: "thisRound", active: true });
    expect(damageBonus(s, 0, yumi.id)).toBe(1);
    expect(damageBonus(s, 0)).toBe(0);
  });
});
