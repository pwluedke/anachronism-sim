// Ability hook-points. Warrior abilities are INERT in the spine, but the engine
// already fires a hook at every point an ability could need to act, so adding
// ability logic later means implementing resolveHooks — not re-plumbing the loop.
//
// resolveHooks(state, hook, context) -> state. In the spine it is the identity
// function (returns state unchanged), so the engine behaves exactly as if hooks
// did not exist. It is PURE and must never mutate `state`.
//
// Firing points (see engine.ts):
//   onSetup           - once, after warriors are placed, before round 1.
//   onRoundStart      - start of each round, after initiative is set.
//   onReveal          - each round start (players reveal support cards; no-op here).
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

import type { GameState, PlayerId } from "./types";
import type { AttackResult } from "./combat";

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
}

/**
 * Resolve all abilities registered for `hook`. Spine stub: identity. Future
 * ability logic returns a (possibly new) GameState; callers must use the return.
 */
export function resolveHooks(
  state: GameState,
  _hook: HookName,
  _context?: HookContext,
): GameState {
  return state;
}
