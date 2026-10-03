// Static evaluation of a GameState from one player's perspective. PURE.

import type { GameState, PlayerId, Warrior } from "../types";
import { modifierAt } from "../projection";
import { armedAttacker, weaponsInPlay } from "../cards";
import { EVAL_WEIGHTS as W } from "./config";

/** Per-attack threat from one attack source: 0 if out of its grid, else (base + modifier bonus) x damage. */
function sourceThreat(src: Warrior, defender: Warrior, size: number): number {
  const mod = modifierAt(src.attackGrid, src.position, src.facing, defender.position, size);
  return mod === null ? 0 : (W.threat + W.threatMod * mod) * src.damage;
}

/**
 * Threat player p poses to the other, per attack: the best of its attack sources — the warrior's
 * own grid and each in-play weapon (weapon grid + damage). For the side to move, a weapon already
 * used this turn no longer counts (armedAttacker applies the one-per-turn rule).
 */
function threat(state: GameState, p: PlayerId): number {
  const defender = state.warriors[p === 0 ? 1 : 0];
  let best = sourceThreat(state.warriors[p], defender, state.arenaSize);
  for (const slot of weaponsInPlay(state, p)) {
    const armed = state.currentPlayer === p
      ? armedAttacker(state, p, slot.card.id)
      : { ...state.warriors[p], attackGrid: slot.card.grid!, damage: slot.card.damage! };
    if (armed) best = Math.max(best, sourceThreat(armed, defender, state.arenaSize));
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

  return life + lead + (mine - theirs) + approach + expDiff * W.experience;
}
