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
