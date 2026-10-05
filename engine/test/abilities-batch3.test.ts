import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { attackRollBonus, defenseRollBonus } from "../src/abilities/runtime";
import { moveOptions } from "../src/abilities/primitives";
import { IMPLEMENTED } from "../src/abilities/cards";
import { IMPLEMENTED_BATCH3 } from "../src/abilities/cards-batch3";
import { indexCards, loadDeck, supportCard, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState, PlayerId } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");

/** A state where `owner` has card `id` face up (placed in its first slot), everything else as dealt. */
function withCard(id: string, owner: PlayerId = 0, base: [Deck, Deck] = [ALEX, LEO]): GameState {
  const s = structuredClone(init(base[0], base[1], 1).state);
  s.cards[owner].support[0] = { card: supportCard(cards[id]), status: "in-play" };
  return s;
}
const fired = (ev: GameEvent[]) => ev.filter((e) => e.type === "abilityFired");

describe("batch 3: the generated set", () => {
  it("adds exactly the 11 qualifying cards to IMPLEMENTED", () => {
    expect(Object.keys(IMPLEMENTED_BATCH3)).toHaveLength(11);
    for (const id of Object.keys(IMPLEMENTED_BATCH3)) expect(IMPLEMENTED[id]).toBeDefined();
    expect(Object.keys(IMPLEMENTED).length).toBeGreaterThanOrEqual(24);
  });
});

describe("batch 3 cards", () => {
  it("Hoplon (special): +1 defense only while you have a face-up weapon", () => {
    const s = withCard("s1-010");
    expect(defenseRollBonus(s, 0)).toBe(0); // no weapon up
    s.cards[0].support.find((c) => c.card.type === "weapon")!.status = "in-play";
    expect(defenseRollBonus(s, 0)).toBe(1);
    expect(attackRollBonus(s, 0)).toBe(0); // defense only
  });

  it("Shield of Hephaestus (special): +1 defense only while you have a face-up inspiration", () => {
    const s = withCard("s1-095"); // replaces Alexander's inspiration in slot 0
    expect(defenseRollBonus(s, 0)).toBe(0);
    s.cards[0].support.push({ card: supportCard(cards["s1-082"]), status: "in-play" }); // an inspiration
    expect(defenseRollBonus(s, 0)).toBe(1);
  });

  it("Leiter (armor, test-only placement): +1 defense only if you are a Water warrior", () => {
    const s = withCard("s1-062");
    s.warriors[0].element = "Water";
    expect(defenseRollBonus(s, 0)).toBe(1);
    s.warriors[0].element = "Fire";
    expect(defenseRollBonus(s, 0)).toBe(0);
  });

  it("Ocrea (armor): +1 defense only if you are a Metal warrior", () => {
    const s = withCard("s1-099");
    s.warriors[0].element = "Metal";
    expect(defenseRollBonus(s, 0)).toBe(1);
    s.warriors[0].element = "Wood";
    expect(defenseRollBonus(s, 0)).toBe(0);
  });

  it("Klironomimena Opla (weapon): +1 defense, unconditional, while in play", () => {
    const s = withCard("s7-048");
    expect(defenseRollBonus(s, 0)).toBe(1);
    s.cards[0].support[0].status = "discarded";
    expect(defenseRollBonus(s, 0)).toBe(0);
  });

  it("Čhehúpahu Čhaŋksá (weapon): +2 to BASIC attack rolls only", () => {
    const s = withCard("s3-058");
    expect(attackRollBonus(s, 0)).toBe(2); // basic attack
    expect(attackRollBonus(s, 0, "s3-058")).toBe(0); // an attack with a weapon
  });

  it("Kamea-e Helal-e Irani (weapon): +1 to BASIC attack rolls only", () => {
    const s = withCard("s4-058");
    expect(attackRollBonus(s, 0)).toBe(1);
    expect(attackRollBonus(s, 0, "s4-058")).toBe(0);
  });

  it("Charlemagne: +2 attack only while he has at least three face-up support cards", () => {
    const s = structuredClone(init(deck("Charlemagne"), LEO, 1).state);
    expect(attackRollBonus(s, 0)).toBe(0); // one card up
    s.cards[0].support[1].status = "in-play";
    expect(attackRollBonus(s, 0)).toBe(0); // two
    s.cards[0].support[2].status = "in-play";
    expect(attackRollBonus(s, 0)).toBe(2); // three
  });

  it("Uma (special, test-only placement): Action, once per round — move two spaces", () => {
    const s = withCard("s1-038");
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
    s.warriors[0].position = { row: 0, col: 0 };
    s.warriors[1].position = { row: 3, col: 3 };
    const moves = getLegalActions(s).filter((a) => a.type === "ABILITY" && a.card === "s1-038");
    expect(moves.length).toBe(moveOptions(s, 0, 2).length);
    const r = applyAction(s, moves[0]);
    expect(r.state.actionsRemaining).toBe(2);
    expect(getLegalActions(r.state).some((a) => a.type === "ABILITY" && a.card === "s1-038")).toBe(false);
  });

  it("Moctezuma II: +1 speed this round only when he did not win initiative", () => {
    const MOC = deck("Moctezuma II");
    const beat = (inits: number[]) => {
      const d = structuredClone(ALEX);
      d.support.forEach((c, i) => (c.initiative = inits[i]));
      return d;
    };
    // Opponent wins round 1 initiative: Moctezuma's turn this round has speed + 1 actions.
    const lost = init(MOC, beat([99, 0, 0, 0]), 1);
    expect(lost.state.initiative).toBe(1);
    expect(fired(lost.events)).toContainEqual(expect.objectContaining({ cardName: "Moctezuma II", effect: "+1 speed this round" }));
    let s = lost.state;
    const turnStarts: number[] = [];
    while (s.round <= 2 && s.phase === "playing") {
      const r = applyAction(s, { type: "PASS" });
      for (const e of r.events) if (e.type === "turnStarted" && e.player === 0) turnStarts.push(e.actions);
      s = r.state;
    }
    expect(turnStarts[0]).toBe(MOC.warrior.speed + 1); // round 1: he lost initiative
    // He wins round 1: no bonus.
    const won = init(MOC, beat([-99, 0, 0, 0]), 1);
    expect(won.state.initiative).toBe(0);
    expect(fired(won.events).some((e) => e.type === "abilityFired" && e.cardName === "Moctezuma II")).toBe(false);
    expect(won.state.actionsRemaining).toBe(MOC.warrior.speed);
  });

  it("Mercurino Gattinara (Reveal): defense -1 and attack +3 for the revealed round only", () => {
    const CAR = deck("Carlos V"); // Mercurino is slot 0
    const r1 = init(CAR, LEO, 1);
    expect(fired(r1.events)).toContainEqual(
      expect.objectContaining({ cardName: "Mercurino Gattinara", effect: "-1 to defense rolls this round, +3 to attack rolls this round" }),
    );
    expect(attackRollBonus(r1.state, 0)).toBe(3);
    expect(defenseRollBonus(r1.state, 0)).toBe(-1);
    let s = r1.state;
    while (s.round === 1) s = applyAction(s, { type: "PASS" }).state;
    expect(attackRollBonus(s, 0)).toBe(0);
    expect(defenseRollBonus(s, 0)).toBe(0);
  });
});
