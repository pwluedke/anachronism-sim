// Rules about support cards in play. PURE helpers over GameState (no mutation).
// Abilities are off: only a card's own stats matter (type, hands, a weapon's grid + damage).

import type { GameState, PlayerId, SupportSlot, Warrior } from "./types";

/** A warrior may use up to two hands' worth of support cards (rulebook p15). */
export const MAX_HANDS = 2;

export function inPlay(state: GameState, p: PlayerId): SupportSlot[] {
  return state.cards[p].support.filter((s) => s.status === "in-play");
}

export function handsInPlay(state: GameState, p: PlayerId): number {
  return inPlay(state, p).reduce((n, s) => n + s.card.hands, 0);
}

/** Player p's in-play weapons that can make an attack (have a grid and damage). */
export function weaponsInPlay(state: GameState, p: PlayerId): SupportSlot[] {
  return inPlay(state, p).filter((s) => s.card.type === "weapon" && s.card.grid !== null && s.card.damage !== null);
}

/**
 * The attacker as it attacks: the warrior itself for a basic attack, or the warrior wielding an
 * in-play weapon (the weapon's grid + damage). Null if that weapon can't attack now: not p's,
 * not in play, not a weapon, already used this turn (one attack per weapon per turn, p11), or
 * the warrior's hands are over the limit.
 */
export function armedAttacker(state: GameState, p: PlayerId, weaponId?: string): Warrior | null {
  const w = state.warriors[p];
  if (weaponId === undefined) return w;
  const slot = weaponsInPlay(state, p).find((s) => s.card.id === weaponId);
  if (!slot || state.weaponsUsed.includes(weaponId) || handsInPlay(state, p) > MAX_HANDS) return null;
  return { ...w, attackGrid: slot.card.grid!, damage: slot.card.damage! };
}

// ---- Card restrictions (rulebook p14-15; ability-driven exceptions are off) --------------------

/** Only one card with each of these traits may be in play at a time. */
export const RESTRICTED_TRAITS = ["torso", "head", "leg", "arm", "shield"] as const;

export interface Violation {
  rule: "type" | "trait" | "hands";
  /** e.g. "2 weapon cards", "2 head cards", "3 hands (max 2)" */
  detail: string;
  /** In-play card ids that are part of this violation (any of them may be discarded). */
  cards: string[];
}

/** Restriction violations among a set of support cards treated as all in play together. */
export function cardViolations(cards: { id: string; type: string; traits: string[]; hands: number }[]): Violation[] {
  const out: Violation[] = [];
  const byType = new Map<string, string[]>();
  for (const c of cards) byType.set(c.type, [...(byType.get(c.type) ?? []), c.id]);
  for (const [type, ids] of byType) if (ids.length > 1) out.push({ rule: "type", detail: `${ids.length} ${type} cards`, cards: ids });
  for (const t of RESTRICTED_TRAITS) {
    const ids = cards.filter((c) => c.traits.some((x) => x.toLowerCase() === t)).map((c) => c.id);
    if (ids.length > 1) out.push({ rule: "trait", detail: `${ids.length} ${t} cards`, cards: ids });
  }
  const hands = cards.reduce((n, c) => n + c.hands, 0);
  if (hands > MAX_HANDS) {
    out.push({ rule: "hands", detail: `${hands} hands (max ${MAX_HANDS})`, cards: cards.filter((c) => c.hands > 0).map((c) => c.id) });
  }
  return out;
}

/** Player p's current in-play restriction violations. */
export function violations(state: GameState, p: PlayerId): Violation[] {
  return cardViolations(inPlay(state, p).map((s) => s.card));
}

/** In-play cards p may discard to work back toward a legal combination (empty when legal). */
export function offendingCards(state: GameState, p: PlayerId): SupportSlot[] {
  const ids = new Set(violations(state, p).flatMap((v) => v.cards));
  return inPlay(state, p).filter((s) => ids.has(s.card.id));
}
