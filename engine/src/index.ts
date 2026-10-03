// Public engine API.
export * from "./types";
export { init, applyAction, determineInitiative, currentWarrior } from "./engine";
export type { Side, InitiativeDecider } from "./engine";
export { getLegalActions } from "./legal";
export { projectGrid, modifierAt, markerKey, parseMod } from "./projection";
export { resolveAttack, judge, breakTie } from "./combat";
export { canMove, applyMove, applyRotate, stepPos, inBounds, FACINGS, FACE_DELTA } from "./arena";
export { step, rollDie, roll2d6, seedState } from "./rng";
export { HOOKS, resolveHooks } from "./hooks";
export type { HookName, HookContext } from "./hooks";
export * from "./decks";
export {
  MAX_HANDS,
  RESTRICTED_TRAITS,
  inPlay,
  handsInPlay,
  weaponsInPlay,
  armedAttacker,
  cardViolations,
  violations,
  offendingCards,
} from "./cards";
export type { Violation } from "./cards";
export * from "./abilities";
export * from "./bot";
