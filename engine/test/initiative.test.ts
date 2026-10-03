import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction, determineInitiative } from "../src/engine";
import { indexCards, loadDeck, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState } from "../src/types";
import { ACHILLES, AJAX } from "../fixtures/warriors";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);

/** A deck whose support initiatives are `inits` (round 1..4) and warrior experience `exp`. */
function rig(base: Deck, inits: number[], exp: number): Deck {
  const d = structuredClone(base);
  d.warrior.experience = exp;
  d.support.forEach((c, i) => (c.initiative = inits[i]));
  return d;
}

function roundStarts(a: Deck, b: Deck, seed: number) {
  const first = init(a, b, seed);
  let s: GameState = first.state;
  const out = first.events.filter((e) => e.type === "roundStarted") as Extract<GameEvent, { type: "roundStarted" }>[];
  while (s.phase === "playing") {
    const r = applyAction(s, { type: "PASS" });
    s = r.state;
    out.push(...(r.events.filter((e) => e.type === "roundStarted") as typeof out));
  }
  return out;
}

const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");

describe("initiative from revealed cards", () => {
  it("the higher revealed initiative goes first, even against higher experience", () => {
    const rs = roundStarts(rig(ALEX, [2, 8, 5, 5], 9), rig(LEO, [6, 3, 5, 5], 1), 1);
    expect(rs[0]).toMatchObject({ initiative: 1, decidedBy: "initiative", initiativeValues: [2, 6], turnOrder: [1, 0] });
    expect(rs[1]).toMatchObject({ initiative: 0, decidedBy: "initiative", initiativeValues: [8, 3] });
  });

  it("tied values go to the higher experience", () => {
    const rs = roundStarts(rig(ALEX, [2, 8, 5, 5], 4), rig(LEO, [6, 3, 5, 5], 7), 1);
    expect(rs[2]).toMatchObject({ initiative: 1, decidedBy: "experience", initiativeValues: [5, 5] });
  });

  it("tied values and tied experience go to a seeded dice-off", () => {
    const a = rig(ALEX, [5, 5, 5, 5], 6);
    const b = rig(LEO, [5, 5, 5, 5], 6);
    const one = roundStarts(a, b, 11);
    expect(one.every((r) => r.decidedBy === "diceoff")).toBe(true);
    expect(roundStarts(a, b, 11).map((r) => r.initiative)).toEqual(one.map((r) => r.initiative));
    const winners = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) winners.add(roundStarts(a, b, seed)[0].initiative);
    expect(winners).toEqual(new Set([0, 1])); // both sides can win the dice-off
  });

  it("round 5 reveals nothing, so values are null and experience decides", () => {
    const rs = roundStarts(rig(ALEX, [9, 9, 9, 9], 3), rig(LEO, [1, 1, 1, 1], 8), 1);
    expect(rs).toHaveLength(5);
    expect(rs[4]).toMatchObject({ initiative: 1, decidedBy: "experience", initiativeValues: [null, null] });
  });

  it("warrior-only games are unchanged: experience decides", () => {
    const { events } = init(AJAX, ACHILLES, 7); // exp 3 vs 9
    expect(events.find((e) => e.type === "roundStarted")).toMatchObject({ initiative: 1, decidedBy: "experience" });
  });

  it("determineInitiative: a null value on either side is a tie", () => {
    const w = init(ACHILLES, AJAX, 1).state.warriors; // exp 9 vs 3
    expect(determineInitiative(w, 1, [null, 9]).decidedBy).toBe("experience");
    expect(determineInitiative(w, 1, [2, 9])).toMatchObject({ initiative: 1, decidedBy: "initiative" });
  });
});
