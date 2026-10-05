// Decks: a warrior + 4 support cards in their face-down order (left to right). PURE — the caller
// passes in already-parsed data (data/preset_decks.json + data/all_cards.json); no I/O here.
//
// Support-card ability text is carried for display but has NO mechanical effect this milestone:
// only a card's own stats (type, initiative, hands, traits, and a weapon's grid + damage) matter.

import type { AttackGrid, CardData } from "./types";
import { cardViolations, type Violation } from "./cards";

export type SupportType = "weapon" | "armor" | "inspiration" | "special";

export interface CardAbility {
  name: string;
  type: string;
  text: string;
}

export interface SupportCard {
  id: string;
  name: string;
  type: SupportType;
  initiative: number | null;
  /** Hands the card occupies while in play (0 when the card prints none). */
  hands: number;
  traits: string[];
  /** Weapons only. */
  damage: number | null;
  /** Weapons only: the weapon's attack grid (marker usually 3B; ranged weapons 4B). */
  grid: AttackGrid | null;
  /** Inert this milestone (abilities off). */
  abilities: CardAbility[];
}

export interface Deck {
  id: string;
  warrior: CardData;
  /** Exactly 4, in face-down order: index 0 is revealed in round 1. */
  support: SupportCard[];
}

/** The subset of a data/all_cards.json record the loader reads. */
export interface CardRecord {
  id: string;
  name: string;
  card_type: "warrior" | SupportType;
  collector: string;
  set: number;
  life: number | null;
  speed: number | null;
  experience: number | null;
  damage: number | null;
  initiative: number | null;
  hands: number | null;
  traits: string[];
  grid: AttackGrid | null;
  abilities?: CardAbility[];
  element?: string;
  cultures?: string[];
}

export interface CardRef {
  id?: string;
  name: string;
  collector: string;
}

/** A record from data/preset_decks.json. */
export interface PresetDeckRecord {
  id: string;
  set: number;
  set_label?: string;
  warrior: CardRef;
  support: (CardRef & { type: string })[];
}

export const DECK_SIZE = 4;

export class DeckLoadError extends Error {
  constructor(
    readonly deckId: string,
    readonly problems: string[],
  ) {
    super(`deck ${deckId}: ${problems.join("; ")}`);
  }
}

export type CardIndex = Record<string, CardRecord>;

export function indexCards(cards: CardRecord[]): CardIndex {
  const idx: CardIndex = {};
  for (const c of cards) idx[c.id] = c;
  return idx;
}

/** Resolve a reference by id, falling back to name + collector (+ set). */
function resolve(ref: CardRef, cards: CardIndex, set: number): CardRecord | undefined {
  if (ref.id && cards[ref.id] && cards[ref.id].name === ref.name) return cards[ref.id];
  return Object.values(cards).find((c) => c.name === ref.name && c.collector === ref.collector && c.set === set);
}

export function warriorData(r: CardRecord): CardData {
  if (r.card_type !== "warrior" || r.grid === null) throw new Error(`${r.id} is not a warrior with a grid`);
  return {
    id: r.id,
    name: r.name,
    life: r.life ?? 0,
    speed: r.speed ?? 0,
    experience: r.experience ?? 0,
    damage: r.damage ?? 0,
    grid: r.grid,
    abilities: r.abilities ?? [],
    element: r.element,
    cultures: r.cultures ?? [],
    traits: [...(r.traits ?? [])],
  };
}

export function supportCard(r: CardRecord): SupportCard {
  if (r.card_type === "warrior") throw new Error(`${r.id} is a warrior, not a support card`);
  return {
    id: r.id,
    name: r.name,
    type: r.card_type,
    initiative: r.initiative,
    hands: r.hands ?? 0,
    traits: [...r.traits],
    damage: r.card_type === "weapon" ? r.damage : null,
    grid: r.card_type === "weapon" ? r.grid : null,
    abilities: r.abilities ?? [],
  };
}

/** Resolve a preset deck record into a playable Deck. Throws DeckLoadError listing every problem. */
export function loadDeck(rec: PresetDeckRecord, cards: CardIndex): Deck {
  const problems: string[] = [];
  const w = resolve(rec.warrior, cards, rec.set);
  if (!w) problems.push(`warrior ${rec.warrior.name} (${rec.warrior.collector}) not found`);
  else if (w.card_type !== "warrior") problems.push(`${w.name} is not a warrior`);
  if (rec.support.length !== DECK_SIZE) problems.push(`has ${rec.support.length} support cards, needs ${DECK_SIZE}`);
  const support: SupportCard[] = [];
  for (const s of rec.support) {
    const r = resolve(s, cards, rec.set);
    if (!r) problems.push(`support ${s.name} (${s.collector}) not found`);
    else if (r.card_type === "warrior") problems.push(`${r.name} is a warrior, not a support card`);
    else if (r.card_type === "weapon" && (r.grid === null || r.damage === null)) problems.push(`weapon ${r.name} lacks a grid or damage`);
    else support.push(supportCard(r));
  }
  const names = support.map((c) => c.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) problems.push(`duplicate support card ${[...new Set(dupes)].join(", ")} (a deck may not repeat a card)`);
  if (problems.length) throw new DeckLoadError(rec.id, problems);
  return { id: rec.id, warrior: warriorData(w!), support };
}

/** Restrictions the deck will run into once all its support cards are in play: each forces a
 *  discard during the game (the deck is still legal to play). */
export function forcedDiscards(deck: Deck): Violation[] {
  return cardViolations(deck.support);
}

/** Load every preset deck, separating the ones that resolve from the ones that don't. */
export function loadAllDecks(recs: PresetDeckRecord[], cards: CardIndex): { decks: Deck[]; failed: DeckLoadError[] } {
  const decks: Deck[] = [];
  const failed: DeckLoadError[] = [];
  for (const rec of recs) {
    try {
      decks.push(loadDeck(rec, cards));
    } catch (e) {
      if (e instanceof DeckLoadError) failed.push(e);
      else throw e;
    }
  }
  return { decks, failed };
}

/** A deck with its support cards placed in a different face-down order (perm[i] = old index). */
export function withOrder(deck: Deck, perm: number[]): Deck {
  if (perm.length !== deck.support.length || [...perm].sort().join() !== deck.support.map((_, i) => i).join()) {
    throw new Error(`invalid support order ${perm.join(",")}`);
  }
  return { ...deck, support: perm.map((i) => deck.support[i]) };
}
