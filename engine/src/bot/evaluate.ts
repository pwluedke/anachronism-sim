// Static evaluation of a GameState from one player's perspective. PURE.

import type { GameState, PlayerId, Warrior } from "../types";
import { modifierAt } from "../projection";
import { armedAttacker, weaponsInPlay } from "../cards";
import { attackRollBonus, defenseRollBonus, weaponDamageBonus } from "../abilities/runtime";
import { EVAL_WEIGHTS as W } from "./config";

/** Per-attack threat from one attack source: 0 if out of its grid, else (base + modifier bonus) x
 *  damage. Ability roll bonuses count like grid modifiers (the defender's defense bonus counts
 *  against); ability damage bonuses add to the damage. */
function sourceThreat(src: Warrior, defender: Warrior, size: number, rollEdge: number, damage: number): number {
  const mod = modifierAt(src.attackGrid, src.position, src.facing, defender.position, size);
  return mod === null ? 0 : Math.max(0, W.threat + W.threatMod * (mod + rollEdge)) * damage;
}

/**
 * Threat player p poses to the other, per attack: the best of its attack sources — the warrior's
 * own grid and each in-play weapon (weapon grid + damage, plus the weapon's own damage bonus). For
 * the side to move, a weapon already used this turn no longer counts (armedAttacker applies the
 * one-per-turn rule).
 */
function threat(state: GameState, p: PlayerId): number {
  const q: PlayerId = p === 0 ? 1 : 0;
  const defender = state.warriors[q];
  const edge = (weaponId?: string) => attackRollBonus(state, p, weaponId) - defenseRollBonus(state, q, weaponId);
  let best = sourceThreat(state.warriors[p], defender, state.arenaSize, edge(), state.warriors[p].damage);
  for (const slot of weaponsInPlay(state, p)) {
    const armed = state.currentPlayer === p
      ? armedAttacker(state, p, slot.card.id)
      : { ...state.warriors[p], attackGrid: slot.card.grid!, damage: slot.card.damage! };
    if (!armed) continue;
    const damage = armed.damage + weaponDamageBonus(state, p, slot.card.id);
    best = Math.max(best, sourceThreat(armed, defender, state.arenaSize, edge(slot.card.id), damage));
  }
  return best;
}

export function evaluate(state: GameState, perspective: PlayerId): number {
  if (state.winner !== null) {
    if (state.winner === "draw") return 0;
    return state.winner === perspective ? W.terminal : -W.terminal;
  }
  const me = state.warriors[perspective];
  const foe = state.warriors[perspective === 0 ? 1 : 0];

  const lifeDiff = me.life - foe.life;
  const expDiff = me.experience - foe.experience;

  const progress = state.maxRounds > 1 ? (state.round - 1) / (state.maxRounds - 1) : 1;
  const life = lifeDiff * W.life * (1 + W.tempo * progress);

  const roundsLeft = Math.max(1, state.maxRounds - state.round + 1);
  const margin = lifeDiff + 0.5 * Math.sign(expDiff);
  const lead = W.lead * (2 / (1 + Math.exp(-margin / (W.leadSpread * roundsLeft))) - 1);

  // The side to move can spend its remaining actions on attacks before the other can answer.
  const moverMult = W.threatOnMove * state.actionsRemaining;
  const onMove = state.currentPlayer === perspective;
  const mine = threat(state, perspective) * (onMove ? moverMult : 1);
  const theirs = threat(state, perspective === 0 ? 1 : 0) * (onMove ? 1 : moverMult);

  const distance =
    Math.abs(me.position.row - foe.position.row) + Math.abs(me.position.col - foe.position.col);
  const approach = -W.approach * Math.max(0, -margin) * distance;

  // Speed banked for a coming turn (e.g. Sun Tzu's action) is worth future actions.
  const banked = (q: PlayerId) =>
    state.effects.filter((e) => e.owner === q && e.kind === "speed" && !e.active).reduce((n, e) => n + e.amount, 0);
  const speed = W.pendingSpeed * (banked(perspective) - banked(perspective === 0 ? 1 : 0));

  return life + lead + (mine - theirs) + approach + speed + expDiff * W.experience;
}
