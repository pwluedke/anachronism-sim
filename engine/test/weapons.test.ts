import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { modifierAt } from "../src/projection";
import { armedAttacker, handsInPlay } from "../src/cards";
import { indexCards, loadDeck, withOrder, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = withOrder(deck("Alexander the Great"), [1, 0, 2, 3]); // Sarissae revealed in round 1
const LEO = deck("Leonidas");
const SARISSAE = ALEX.support[0];

/** P0 to act at (0,1) facing S with Sarissae in play; foe at `foe`. */
function setup(foe: { row: number; col: number }, rng = 1): GameState {
  const s = structuredClone(init(ALEX, LEO, 3).state);
  s.currentPlayer = 0;
  s.turnOrder = [0, 1];
  s.turnIndex = 0;
  s.actionsRemaining = 3;
  s.warriors[0].position = { row: 0, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = foe;
  s.warriors[1].life = 20;
  s.rng = rng;
  s.weaponsUsed = [];
  return s;
}

const weaponHit = (crit: boolean) => {
  for (let rng = 1; rng < 5000; rng++) {
    const r = applyAction(setup({ row: 2, col: 1 }, rng), { type: "ATTACK", weapon: SARISSAE.id });
    const e = r.events.find((x) => x.type === "attacked");
    if (e && e.type === "attacked" && e.hit && e.crit === crit) return e;
  }
  throw new Error("no rng found");
};

describe("weapon attacks", () => {
  it("Sarissae is in play from round 1", () => {
    const s = setup({ row: 2, col: 1 });
    expect(s.cards[0].support[0]).toMatchObject({ status: "in-play", card: { name: "Sarissae", type: "weapon", damage: 2, hands: 2 } });
  });

  it("uses the weapon's grid: reaches a target the warrior's own grid can't", () => {
    const s = setup({ row: 2, col: 1 });
    const w = s.warriors[0];
    expect(modifierAt(w.attackGrid, w.position, w.facing, s.warriors[1].position, 4)).toBeNull();
    expect(applyAction(s, { type: "ATTACK" }).events).toEqual([]); // basic: out of range
    const e = applyAction(s, { type: "ATTACK", weapon: SARISSAE.id }).events.find((x) => x.type === "attacked");
    expect(e).toMatchObject({ weapon: { id: SARISSAE.id, name: "Sarissae" }, gridMod: 1 });
  });

  it("deals the weapon's damage, doubled on a critical hit", () => {
    expect(weaponHit(false).damage).toBe(2);
    expect(weaponHit(true).damage).toBe(4);
  });

  it("one attack per weapon per turn; resets on the next turn", () => {
    const s = setup({ row: 2, col: 1 });
    const first = applyAction(s, { type: "ATTACK", weapon: SARISSAE.id });
    expect(first.state.weaponsUsed).toEqual([SARISSAE.id]);
    const again = applyAction(first.state, { type: "ATTACK", weapon: SARISSAE.id });
    expect(again.events).toEqual([]);
    expect(again.state).toBe(first.state);
    const next = applyAction(first.state, { type: "PASS" }).state; // P1's turn
    expect(next.currentPlayer).toBe(1);
    expect(next.weaponsUsed).toEqual([]);
  });

  it("basic attacks stay uncapped", () => {
    // Alexander's basic grid covers his front cell: foe directly south.
    let s = setup({ row: 1, col: 1 });
    for (let i = 0; i < 3; i++) {
      const r = applyAction(s, { type: "ATTACK" });
      expect(r.events.some((e) => e.type === "attacked" && e.weapon === null)).toBe(true);
      s = r.state;
      if (s.phase !== "playing" || s.currentPlayer !== 0) break;
    }
  });

  it("can't attack with a face-down weapon, a non-weapon, or the opponent's weapon", () => {
    const facedown = structuredClone(init(deck("Alexander the Great"), LEO, 3).state); // Sarissae is slot 1: face-down in round 1
    facedown.currentPlayer = 0;
    expect(armedAttacker(facedown, 0, SARISSAE.id)).toBeNull();
    const s = setup({ row: 2, col: 1 });
    expect(armedAttacker(s, 0, s.cards[0].support[1].card.id)).toBeNull(); // Oracle of Delphi (face-down, inspiration)
    expect(armedAttacker(s, 0, s.cards[1].support[0].card.id)).toBeNull(); // Leonidas' card
    expect(applyAction(s, { type: "ATTACK", weapon: "s9-999" }).events).toEqual([]);
  });

  it("a weapon can't attack while the warrior is over the hands limit", () => {
    const s = setup({ row: 2, col: 1 });
    s.cards[0].support[1].status = "in-play";
    s.cards[0].support[1].card.hands = 1; // 2 (Sarissae) + 1 > 2
    expect(handsInPlay(s, 0)).toBe(3);
    expect(armedAttacker(s, 0, SARISSAE.id)).toBeNull();
  });
});
