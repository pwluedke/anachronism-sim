// The bot's public entry point. PURE and deterministic: same (state, difficulty, botSeed) => same Action.

import type { Action, GameState } from "../types";
import { getLegalActions } from "../legal";
import { seedState, step } from "../rng";
import { search } from "./search";
import { TIER_CONFIG, type Difficulty } from "./config";

/** FNV-1a over the serialized state, so a fixed per-game botSeed still yields a fresh draw each decision. */
function fingerprint(state: GameState): number {
  const str = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

export function chooseAction(state: GameState, difficulty: Difficulty, botSeed: number): Action {
  const legal = getLegalActions(state);
  if (legal.length === 0) throw new Error("chooseAction: no legal actions (game not in progress)");
  const tier = TIER_CONFIG[difficulty];

  if (tier.blunderChance > 0) {
    const roll = step(seedState(botSeed ^ fingerprint(state)));
    if (roll.value < tier.blunderChance) {
      return legal[Math.floor(step(roll.state).value * legal.length)];
    }
  }
  return search(state, tier.depth, { sampleSeed: botSeed }).action;
}
