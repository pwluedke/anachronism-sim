import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init } from "../src/engine";
import { holds } from "../src/abilities/primitives";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");
const fresh = (): GameState => structuredClone(init(ALEX, LEO, 1).state);

describe("batch-3 condition whitelist", () => {
  it("elementIs: the owner's warrior element (from card data)", () => {
    const s = fresh();
    const el = cards[ALEX.warrior.id].element as string;
    expect(s.warriors[0].element).toBe(el);
    expect(holds({ kind: "elementIs", element: el.toLowerCase() }, s, 0)).toBe(true);
    expect(holds({ kind: "elementIs", element: el === "Fire" ? "Water" : "Fire" }, s, 0)).toBe(false);
  });

  it("cultureIs: one of the owner's cultures", () => {
    const s = fresh();
    expect(s.warriors[1].cultures).toContain("Greek");
    expect(holds({ kind: "cultureIs", culture: "greek" }, s, 1)).toBe(true);
    expect(holds({ kind: "cultureIs", culture: "Roman" }, s, 1)).toBe(false);
  });

  it("adjacentToOpponent: sharing a side or a corner", () => {
    const s = fresh();
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[1].position = { row: 2, col: 2 }; // corner
    expect(holds({ kind: "adjacentToOpponent" }, s, 0)).toBe(true);
    s.warriors[1].position = { row: 1, col: 2 }; // side
    expect(holds({ kind: "adjacentToOpponent" }, s, 1)).toBe(true);
    s.warriors[1].position = { row: 3, col: 1 }; // two away
    expect(holds({ kind: "adjacentToOpponent" }, s, 0)).toBe(false);
  });

  it("lifeVsNamed: compares with that warrior only if it's in play", () => {
    const s = fresh();
    s.warriors[0].life = 5;
    s.warriors[1].life = 7;
    expect(holds({ kind: "lifeVsNamed", cmp: "less", name: "Leonidas" }, s, 0)).toBe(true);
    expect(holds({ kind: "lifeVsNamed", cmp: "more", name: "Leonidas" }, s, 0)).toBe(false);
    expect(holds({ kind: "lifeVsNamed", cmp: "less", name: "Julius Caesar" }, s, 0)).toBe(false);
  });

  it("lifeExtreme: strictly the least / most life in the arena", () => {
    const s = fresh();
    s.warriors[0].life = 5;
    s.warriors[1].life = 7;
    expect(holds({ kind: "lifeExtreme", which: "least" }, s, 0)).toBe(true);
    expect(holds({ kind: "lifeExtreme", which: "most" }, s, 1)).toBe(true);
    expect(holds({ kind: "lifeExtreme", which: "most" }, s, 0)).toBe(false);
    s.warriors[1].life = 5; // tied: neither has the least
    expect(holds({ kind: "lifeExtreme", which: "least" }, s, 0)).toBe(false);
  });

  it("faceUpSupportAtLeast: counts the owner's in-play support cards", () => {
    const s = fresh(); // one card revealed in round 1
    expect(holds({ kind: "faceUpSupportAtLeast", n: 1 }, s, 0)).toBe(true);
    expect(holds({ kind: "faceUpSupportAtLeast", n: 2 }, s, 0)).toBe(false);
    s.cards[0].support[1].status = "in-play";
    expect(holds({ kind: "faceUpSupportAtLeast", n: 2 }, s, 0)).toBe(true);
  });

  it("wonInitiative mirrors lostInitiative", () => {
    const s = fresh(); // Oracle of Delphi (2) beats Nemesis (1)
    expect(s.initiative).toBe(0);
    expect(holds({ kind: "wonInitiative" }, s, 0)).toBe(true);
    expect(holds({ kind: "wonInitiative" }, s, 1)).toBe(false);
  });

  it("lacksType: the defender / attacker has no face-up card of that type", () => {
    const s = fresh(); // round 1: Alexander's Oracle (inspiration) and Leonidas's Nemesis (inspiration) up
    expect(holds({ kind: "lacksType", who: "defender", cardType: "weapon" }, s, 0, { defender: 1 })).toBe(true);
    expect(holds({ kind: "lacksType", who: "defender", cardType: "inspiration" }, s, 0, { defender: 1 })).toBe(false);
    expect(holds({ kind: "lacksType", who: "attacker", cardType: "armor" }, s, 1, { attacker: 0 })).toBe(true);
    expect(holds({ kind: "lacksType", who: "attacker", cardType: "inspiration" }, s, 1, { attacker: 0 })).toBe(false);
    expect(holds({ kind: "lacksType", who: "defender", cardType: "weapon" }, s, 0, {})).toBe(false); // no attack
  });
});
