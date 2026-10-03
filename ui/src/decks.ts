// The preset decks, loaded through the engine's own loader from the generated data files.
import presets from "@data/preset_decks.json";
import deckCards from "@data/preset_deck_cards.json";
import { indexCards, loadAllDecks } from "@engine";
import type { CardRecord, Deck, PresetDeckRecord } from "@engine";

const loaded = loadAllDecks(presets.decks as PresetDeckRecord[], indexCards(deckCards.cards as unknown as CardRecord[]));
if (loaded.failed.length) console.warn("decks that failed to load:", loaded.failed.map((f) => f.message));

export const DECKS: Deck[] = loaded.decks;

export const deckSet = (d: Deck) => d.id.split("-")[0].slice(1);
export const deckLabel = (d: Deck) => `${d.warrior.name} (Set ${deckSet(d)})`;

export function findDeck(id: string): Deck {
  return DECKS.find((d) => d.id === id) ?? DECKS[0];
}

/** Opening matchup: Alexander the Great vs Leonidas (set 1). */
export const DEFAULT_SIDES: [Deck, Deck] = [
  DECKS.find((d) => d.warrior.name === "Alexander the Great") ?? DECKS[0],
  DECKS.find((d) => d.warrior.name === "Leonidas") ?? DECKS[1],
];
