// A warrior's experience as the rules read it: the warrior's value (printed, plus permanent changes
// from abilities — rulebook p17) plus continuous "You gain +N experience" abilities in effect and
// timed experience effects. Used wherever experience decides something: tie-breaks (combat,
// initiative, end of game), experience conditions and ability dice thresholds.

import type { GameState, PlayerId } from "../types";
import { REGISTRY } from "./registry";

let computing = false;

export function experienceOf(state: GameState, p: PlayerId): number {
  const base = state.warriors[p].experience;
  // Guard: an experience modifier whose condition reads experience would recurse; it counts as 0
  // while experience is being worked out.
  if (computing) return base;
  computing = true;
  try {
    let total = base;
    for (const owner of state.warriors.map((w) => w.playerId)) {
      const ids = [state.warriors[owner].cardId, ...state.cards[owner].support.filter((s) => s.status === "in-play").map((s) => s.card.id)];
      for (const id of ids) {
        for (const a of REGISTRY[id] ?? []) {
          if (a.trigger !== "continuous" || !a.modify || (owner !== p && !a.affectsOthers)) continue;
          total += a.modify("experience", { state, owner, subject: p, attacker: p, defender: owner === p ? (p === 0 ? 1 : 0) : owner, sourceCardId: id });
        }
      }
    }
    for (const e of state.effects) if (e.owner === p && e.active && e.kind === "experience") total += e.amount;
    return total;
  } finally {
    computing = false;
  }
}
