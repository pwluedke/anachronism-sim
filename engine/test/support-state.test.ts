import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init } from "../src/engine";
import { indexCards, loadDeck, withOrder, type CardRecord, type PresetDeckRecord } from "../src/decks";
import { ACHILLES, AJAX } from "../fixtures/warriors";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (warrior: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === warrior)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");

describe("GameState support cards", () => {
  it("init places each side's 4 support cards in deck order, tracking status and the next reveal", () => {
    const { state } = init(ALEX, withOrder(LEO, [2, 0, 3, 1]), 7);
    expect(state.cards[0].deckId).toBe(ALEX.id);
    expect(state.cards[0].support.map((s) => s.card.name)).toEqual(ALEX.support.map((c) => c.name));
    expect(state.cards[1].support.map((s) => s.card.id)).toEqual([2, 0, 3, 1].map((i) => LEO.support[i].id));
    for (const pc of state.cards) {
      expect(pc.support).toHaveLength(4);
      expect(pc.support.every((s) => ["face-down", "in-play", "discarded"].includes(s.status))).toBe(true);
      expect(pc.nextReveal).toBe(pc.support.filter((s) => s.status !== "face-down").length);
    }
  });

  it("warrior-only sides have no support cards", () => {
    const { state } = init(ACHILLES, AJAX, 1);
    expect(state.cards.map((c) => c.support.length)).toEqual([0, 0]);
    expect(state.cards.map((c) => c.deckId)).toEqual([null, null]);
  });

  it("is plain serializable data and deterministic for the same decks + seed", () => {
    const a = init(ALEX, LEO, 99).state;
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(init(ALEX, LEO, 99)).toEqual(init(ALEX, LEO, 99));
  });

  it("does not alias the caller's deck objects", () => {
    const { state } = init(ALEX, LEO, 3);
    state.cards[0].support[0].card.name = "changed";
    expect(ALEX.support[0].name).not.toBe("changed");
  });
});
