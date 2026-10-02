// Static evaluation of a GameState from one player's perspective. PURE.

import type { GameState, PlayerId, Warrior } from "../types";
import { modifierAt } from "../projection";
import { EVAL_WEIGHTS as W } from "./config";

/** Threat `attacker` poses to `defender`, per attack: 0 if out of grid, else (base + modifier bonus) x damage. */
function threat(attacker: Warrior, defender: Warrior, size: number): number {
  const mod = modifierAt(attacker.attackGrid, attacker.position, attacker.facing, defender.position, size);
  return mod === null ? 0 : (W.threat + W.threatMod * mod) * attacker.damage;
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
  const mine = threat(me, foe, state.arenaSize) * (onMove ? moverMult : 1);
  const theirs = threat(foe, me, state.arenaSize) * (onMove ? 1 : moverMult);

  return life + lead + (mine - theirs) + expDiff * W.experience;
}
