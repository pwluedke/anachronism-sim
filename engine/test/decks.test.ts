import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import {
  DeckLoadError,
  indexCards,
  loadAllDecks,
  loadDeck,
  withOrder,
  type CardRecord,
  type PresetDeckRecord,
} from "../src/decks";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const recs = presets.decks as PresetDeckRecord[];

describe("deck loader", () => {
  it("every preset deck resolves cleanly", () => {
    const { decks, failed } = loadAllDecks(recs, cards);
    expect(failed.map((f) => f.message)).toEqual([]);
    expect(decks).toHaveLength(presets.deck_count);
    expect(decks.length).toBeGreaterThanOrEqual(130);
  });

  it("loads Alexander the Great's deck with stats that matter and inert abilities", () => {
    const d = loadDeck(recs.find((r) => r.warrior.name === "Alexander the Great")!, cards);
    expect(d.warrior.name).toBe("Alexander the Great");
    expect(d.warrior.grid["3B"]).toBe("marker");
    expect(d.support.map((s) => s.name)).toEqual(["Oracle of Delphi", "Sarissae", "Linen Cuirass", "Bucephalus"]);
    const sarissae = d.support[1];
    expect(sarissae).toMatchObject({ type: "weapon", initiative: 7, hands: 2, damage: 2 });
    expect(sarissae.grid?.["1C"]).toBe("+2");
    expect(d.support[0].grid).toBeNull(); // non-weapons carry no grid
    expect(d.support[0].damage).toBeNull();
  });

  it("resolves by name + collector when the id is missing or stale", () => {
    const rec = structuredClone(recs[0]);
    rec.support[0].id = "nope";
    delete rec.warrior.id;
    expect(loadDeck(rec, cards).support[0].name).toBe(rec.support[0].name);
  });

  it("reports every unresolvable card", () => {
    const rec = structuredClone(recs[0]);
    rec.support[0] = { name: "Imaginary Shield", collector: "999", type: "special" };
    rec.support[2] = { name: "Phantom Helm", collector: "998", type: "armor" };
    try {
      loadDeck(rec, cards);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DeckLoadError);
      expect((e as DeckLoadError).problems).toHaveLength(2);
    }
  });

  it("withOrder re-places the face-down order and rejects a bad permutation", () => {
    const d = loadDeck(recs[0], cards);
    expect(withOrder(d, [3, 2, 1, 0]).support.map((s) => s.id)).toEqual([...d.support].reverse().map((s) => s.id));
    expect(() => withOrder(d, [0, 0, 1, 2])).toThrow();
  });
});
