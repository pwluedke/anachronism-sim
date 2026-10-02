// Static evaluation of a GameState from one player's perspective. PURE.

import type { GameState, PlayerId, Warrior } from "../types";
import { modifierAt } from "../projection";
import { EVAL_WEIGHTS as W } from "./config";

/** Threat `attacker` poses to `defender`: 0 if out of grid, else base + modifier bonus. */
function threat(attacker: Warrior, defender: Warrior, size: number): number {
  const mod = modifierAt(attacker.attackGrid, attacker.position, attacker.facing, defender.position, size);
  return mod === null ? 0 : W.threat + W.threatMod * mod;
}

export function evaluate(state: GameState, perspective: PlayerId): number {
  if (state.winner !== null) {
    if (state.winner === "draw") return 0;
    return state.winner === perspective ? W.terminal : -W.terminal;
  }
  const me = state.warriors[perspective];
  const foe = state.warriors[perspective === 0 ? 1 : 0];

  const progress = state.maxRounds > 1 ? (state.round - 1) / (state.maxRounds - 1) : 1;
  const life = (me.life - foe.life) * W.life * (1 + W.tempo * progress);
  const grid = threat(me, foe, state.arenaSize) - threat(foe, me, state.arenaSize);
  const exp = (me.experience - foe.experience) * W.experience;
  return life + grid + exp;
}
