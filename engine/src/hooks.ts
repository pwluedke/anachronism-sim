// Ability hook-points. The engine fires a hook at every point an ability could need to act;
// resolveHooks dispatches the ones that matter to the card-ability runtime (abilities/). Cards
// without implemented abilities are inert, so with none in play the hooks change nothing.
//
// Firing points (see engine.ts):
//   onSetup           - once, after warriors are placed, before round 1.
//   onReveal          - each round start, after support cards are revealed, initiative is set and
//                       restrictions are resolved (Reveal abilities; card abilities are off: no-op).
//   onRoundStart      - after onReveal ("at the start of a round" effects come after Reveal, p10).
//   onTurnStart       - when a player's turn begins (actions reset to speed).
//   beforeAttackRoll  - an ATTACK is declared, before any dice are rolled.
//   afterAttackRoll   - both 2d6 are rolled (and the grid mod known), pre-resolution.
//   onHit             - the attack hits.
//   onMiss            - the attack misses.
//   onCriticalHit     - the attack is a critical (attacker doubles) hit.
//   afterDefense      - hit/miss has been decided (defense resolved).
//   onDamageDealt     - damage has been subtracted from the defender's life.
//   onWarriorDefeated - a warrior's life reached 0 or below.
//   onTurnEnd         - a player's turn ends (PASS or budget spent).
//   onRoundEnd        - both players have taken their turn.

import type { GameEvent, GameState, PlayerId } from "./types";
import type { AttackResult } from "./combat";
import { endRoundEffects, endTurnEffects, fireTrigger } from "./abilities/runtime";

export const HOOKS = [
  "onSetup",
  "onRoundStart",
  "onReveal",
  "onTurnStart",
  "beforeAttackRoll",
  "afterAttackRoll",
  "onHit",
  "onMiss",
  "onCriticalHit",
  "afterDefense",
  "onDamageDealt",
  "onWarriorDefeated",
  "onTurnEnd",
  "onRoundEnd",
] as const;

export type HookName = (typeof HOOKS)[number];

/** Loose context bag passed to a hook; fields present depend on the hook. */
export interface HookContext {
  player?: PlayerId;
  attacker?: PlayerId;
  defender?: PlayerId;
  result?: AttackResult;
  round?: number;
  /** The event log of the action in progress; abilities that fire append to it. */
  events?: GameEvent[];
}

/**
 * Resolve the card abilities that act at `hook` (see abilities/runtime.ts). Called by the engine on
 * applyAction's working copy of the state — never on a caller's state — so it updates that copy in
 * place and returns it. Hook points with no implemented abilities change nothing.
 */
export function resolveHooks(state: GameState, hook: HookName, context: HookContext = {}): GameState {
  const events = context.events ?? [];
  switch (hook) {
    case "onReveal":
      fireTrigger(state, "reveal", state.turnOrder, events);
      break;
    case "onRoundStart":
      fireTrigger(state, "roundStart", state.turnOrder, events);
      break;
    case "onDamageDealt":
      if (context.attacker !== undefined) fireTrigger(state, "damageDealt", [context.attacker], events, context.attacker);
      break;
    case "onTurnEnd":
      if (context.player !== undefined) endTurnEffects(state, context.player);
      break;
    case "onRoundEnd":
      endRoundEffects(state);
      break;
    default:
      break;
  }
  return state;
}
