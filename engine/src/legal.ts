// The set of legal actions for the active warrior in the current state. PURE.
// This is the single authority the UI (or a bot) asks "what can I do now?" — so
// no caller ever has to reimplement legality. Mirrors exactly what applyAction
// will accept as a non-no-op for the current player.

import type { Action, GameState } from "./types";
import { FACINGS, canMove } from "./arena";
import { modifierAt } from "./projection";
import { armedAttacker, offendingCards, weaponsInPlay } from "./cards";
import { usableActionAbilities } from "./abilities/runtime";

export function getLegalActions(state: GameState): Action[] {
  if (state.phase !== "playing") return [];
  const me = state.currentPlayer;
  // A pending card restriction: the only legal actions are discards of offending cards.
  if (state.pending?.kind === "discard") return offendingCards(state, me).map((s) => ({ type: "DISCARD", card: s.card.id }));
  // A pending optional re-roll: re-roll either die (one choice if they match), or keep the roll.
  if (state.pending?.kind === "reroll") {
    const [d0, d1] = state.pending.attack.attackerDice;
    const rerolls: Action[] = d0 === d1 ? [{ type: "REROLL", die: 0 }] : [{ type: "REROLL", die: 0 }, { type: "REROLL", die: 1 }];
    return [...rerolls, { type: "KEEP" }];
  }
  // A pending ability decision: each listed destination, and DECLINE if the ability says "you may".
  if (state.pending?.kind === "choice") {
    const c = state.pending.queue[0];
    const picks: Action[] = c.options.map((o) => ({ type: "CHOOSE", to: { ...o.to }, facing: o.facing }));
    return c.optional ? [...picks, { type: "DECLINE" }] : picks;
  }
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
    // a weapon attack for each in-play weapon not yet used this turn whose grid covers the opponent
    for (const slot of weaponsInPlay(state, me)) {
      const armed = armedAttacker(state, me, slot.card.id);
      if (armed && modifierAt(armed.attackGrid, armed.position, armed.facing, foe.position, state.arenaSize) !== null) {
        acts.push({ type: "ATTACK", weapon: slot.card.id });
      }
    }
    // Action abilities of the warrior and in-play cards (each costs one action)
    for (const a of usableActionAbilities(state, me)) {
      acts.push(
        a.params
          ? { type: "ABILITY", card: a.cardId, ability: a.ability, to: a.params.to, facing: a.params.facing }
          : { type: "ABILITY", card: a.cardId, ability: a.ability },
      );
    }
  }
  acts.push({ type: "PASS" }); // always available while playing
  return acts;
}
