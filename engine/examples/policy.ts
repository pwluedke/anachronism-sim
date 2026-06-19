// A tiny greedy "close in and hit" policy, used to drive a full game end-to-end
// for the example log and the integration test. (The real bot is Milestone 5;
// this is only enough to produce a complete, deterministic game.)

import { applyAction, currentWarrior } from "../src/engine";
import { canMove } from "../src/arena";
import { modifierAt } from "../src/projection";
import type { Action, CardData, Facing, GameEvent, GameState } from "../src/types";
import { init } from "../src/engine";

function facingToward(dr: number, dc: number): Facing {
  if (Math.abs(dr) >= Math.abs(dc)) return dr > 0 ? "S" : "N";
  return dc > 0 ? "E" : "W";
}

/** Greedy action for the current player: attack if able, else close the gap. */
export function chooseAction(state: GameState): Action {
  const me = currentWarrior(state);
  const opp = state.warriors[me.playerId === 0 ? 1 : 0];
  const size = state.arenaSize;

  if (state.actionsRemaining < 1) return { type: "PASS" };

  // In range? attack.
  if (modifierAt(me.attackGrid, me.position, me.facing, opp.position, size) !== null) {
    return { type: "ATTACK" };
  }

  const dr = opp.position.row - me.position.row;
  const dc = opp.position.col - me.position.col;
  const want = facingToward(dr, dc);

  // Adjacent but not yet covering: face the opponent (front cell will reach).
  if (Math.abs(dr) + Math.abs(dc) === 1) {
    return me.facing !== want ? { type: "ROTATE", facing: want } : { type: "PASS" };
  }

  // Otherwise step toward the opponent, taking the free rotate to face them.
  const dirs: Facing[] = [];
  if (dr > 0) dirs.push("S");
  if (dr < 0) dirs.push("N");
  if (dc > 0) dirs.push("E");
  if (dc < 0) dirs.push("W");
  for (const d of dirs) {
    if (canMove(state.warriors, me.playerId, d, size).ok) {
      return { type: "MOVE", dir: d, facing: want };
    }
  }
  if (me.facing !== want) return { type: "ROTATE", facing: want };
  return { type: "PASS" };
}

/** Render one event as a readable log line. */
export function formatEvent(e: GameEvent): string {
  switch (e.type) {
    case "setup":
      return `setup            firstPlacer=P${e.firstPlacer}`;
    case "roundStarted":
      return `round ${e.round} start    initiative=P${e.initiative} order=[P${e.turnOrder[0]},P${e.turnOrder[1]}]`;
    case "turnStarted":
      return `  turn P${e.player}        actions=${e.actions}`;
    case "moved":
      return `    P${e.player} move    (${e.from.row},${e.from.col})->(${e.to.row},${e.to.col}) facing ${e.facing}`;
    case "rotated":
      return `    P${e.player} rotate  -> ${e.facing}`;
    case "passed":
      return `    P${e.player} pass`;
    case "attacked":
      return (
        `    P${e.attacker} ATTACK  ${e.attackerRoll}${e.gridMod >= 0 ? "+" : ""}${e.gridMod}=${e.attackerTotal}` +
        ` vs ${e.defenderRoll} => ${e.hit ? "HIT" : "miss"}${e.crit ? " CRIT" : ""}` +
        (e.damage ? ` dmg ${e.damage}` : "") +
        (e.tiebreak ? ` [${e.tiebreak}]` : "")
      );
    case "warriorDefeated":
      return `    !! P${e.player} defeated`;
    case "turnEnded":
      return `  turn P${e.player} end`;
    case "roundEnded":
      return `round ${e.round} end`;
    case "gameEnded":
      return `GAME OVER       winner=${e.winner === "draw" ? "draw" : "P" + e.winner} (${e.reason})`;
  }
}

/** Play a complete game with both sides using the greedy policy. */
export function playGreedyGame(
  card0: CardData,
  card1: CardData,
  seed: number,
): { state: GameState; events: GameEvent[] } {
  const start = init(card0, card1, seed);
  let state = start.state;
  const events: GameEvent[] = [...start.events];
  let guard = 0;
  while (state.phase === "playing" && guard++ < 500) {
    const r = applyAction(state, chooseAction(state));
    events.push(...r.events);
    state = r.state;
  }
  return { state, events };
}
