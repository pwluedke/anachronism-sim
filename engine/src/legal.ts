// The set of legal actions for the active warrior in the current state. PURE.
// This is the single authority the UI (or a bot) asks "what can I do now?" — so
// no caller ever has to reimplement legality. Mirrors exactly what applyAction
// will accept as a non-no-op for the current player.

import type { Action, GameState } from "./types";
import { FACINGS, canMove } from "./arena";
import { modifierAt } from "./projection";
import { offendingCards } from "./cards";

export function getLegalActions(state: GameState): Action[] {
  if (state.phase !== "playing") return [];
  const me = state.currentPlayer;
  // A pending card restriction: the only legal actions are discards of offending cards.
  if (state.pending) return offendingCards(state, me).map((s) => ({ type: "DISCARD", card: s.card.id }));
  const w = state.warriors[me];
  const foe = state.warriors[me === 0 ? 1 : 0];
  const acts: Action[] = [];

  if (state.actionsRemaining >= 1) {
    // moves into legal (in-arena, unoccupied) cells, each with every facing: a warrior may turn
    // for free as part of a move, so the step and the new facing cost one action together
    for (const dir of FACINGS) {
      if (!canMove(state.warriors, me, dir, state.arenaSize).ok) continue;
      for (const facing of FACINGS) acts.push({ type: "MOVE", dir, facing });
    }
    // rotations to a different facing
    for (const f of FACINGS) {
      if (f !== w.facing) acts.push({ type: "ROTATE", facing: f });
    }
    // a basic attack if the opponent is in the projected grid
    if (modifierAt(w.attackGrid, w.position, w.facing, foe.position, state.arenaSize) !== null) {
      acts.push({ type: "ATTACK" });
    }
  }
  acts.push({ type: "PASS" }); // always available while playing
  return acts;
}
