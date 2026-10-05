import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init } from "../src/engine";
import { evaluate } from "../src/bot/evaluate";
import { selfPlaySides } from "../src/bot/selfplay";
import { IMPLEMENTED_BATCH3 } from "../src/abilities/cards-batch3";
import { indexCards, loadDeck, supportCard, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const LEO = deck("Leonidas");

/** Uma and Leiter are in no preset deck: put them into one for self-play. */
function withSupport(d: Deck, ids: string[]): Deck {
  const out = structuredClone(d);
  ids.forEach((id, i) => (out.support[i] = supportCard(cards[id])));
  return out;
}

describe("bot with batch-3 abilities", () => {
  it("values Moctezuma II's this-round speed while his turn is still to come", () => {
    const MOC = deck("Moctezuma II");
    const opp = structuredClone(deck("Alexander the Great"));
    opp.support[0].initiative = 99; // opponent wins: Moctezuma's +1 speed fires, his turn comes second
    const s = init(MOC, opp, 1).state;
    expect(s.effects.some((e) => e.owner === 0 && e.kind === "speed")).toBe(true);
    const without = structuredClone(s);
    without.effects = without.effects.filter((e) => !(e.owner === 0 && e.kind === "speed"));
    expect(evaluate(s, 0)).toBeGreaterThan(evaluate(without, 0));
  });

  it("self-play with decks drawn from the batch-3 cards: no illegal actions, clean termination", () => {
    const sides = [
      deck("Charlemagne"), deck("Moctezuma II"), deck("Carlos V"), deck("Theseus"), deck("Achilles"),
      deck("Spartacus"), deck("Maĥpíya Lúta (Red Cloud)"), deck("Cyrus The Great"), LEO,
      withSupport(deck("Alexander the Great"), ["s1-038", "s1-062"]),
    ];
    const seen = new Set<string>();
    let games = 0;
    for (let g = 0; g < sides.length * 2; g++) {
      const a = sides[g % sides.length];
      const b = sides[(g + 3) % sides.length];
      const r = selfPlaySides(a, b, g % 2 ? "medium" : "easy", "medium", 1100 + g); // throws on an illegal action
      expect(r.events[r.events.length - 1].type).toBe("gameEnded");
      games++;
      for (const e of r.events) if (e.type === "abilityFired" && IMPLEMENTED_BATCH3[e.cardId]) seen.add(e.cardName);
    }
    expect(games).toBe(20);
    expect(seen.size).toBeGreaterThan(0);
    console.log(`batch-3 self-play: ${games} games; fired-event cards: ${[...seen].join(", ")}`);
  }, 300_000);
});
