// Board interaction model. Everything here is DERIVED from getLegalActions(state) and engine
// helpers (stepPos, projectGrid). It never decides legality: a selection only resolves to an
// action by finding that exact action object in the engine's legal list.
import { getLegalActions, projectGrid, stepPos } from "@engine";
import type { Action, Facing, GameState, Position } from "@engine";

export const cellKey = (p: Position) => `${p.row},${p.col}`;

export type Selection =
  | { kind: "none" }
  | { kind: "move"; dir: Facing; facing: Facing | null }
  | { kind: "rotate"; facing: Facing | null };

export const NO_SELECTION: Selection = { kind: "none" };

export interface BoardModel {
  legal: Action[];
  origin: Position;
  /** Reachable destination cell key -> the MOVE direction that reaches it. */
  reach: Map<string, Facing>;
  /** Facings offered for a MOVE in `dir` (from the legal list). */
  moveFacings: (dir: Facing) => Facing[];
  /** Facings offered by ROTATE actions (from the legal list). */
  rotateFacings: Facing[];
  attack: Action | undefined;
  pass: Action | undefined;
}

export function buildModel(state: GameState): BoardModel {
  const legal = getLegalActions(state);
  const w = state.warriors[state.currentPlayer];
  const reach = new Map<string, Facing>();
  for (const a of legal) {
    if (a.type === "MOVE") reach.set(cellKey(stepPos(w.position, a.dir)), a.dir);
  }
  return {
    legal,
    origin: w.position,
    reach,
    moveFacings: (dir) =>
      legal.flatMap((a) => (a.type === "MOVE" && a.dir === dir && a.facing ? [a.facing] : [])),
    rotateFacings: legal.flatMap((a) => (a.type === "ROTATE" ? [a.facing] : [])),
    attack: legal.find((a) => a.type === "ATTACK"),
    pass: legal.find((a) => a.type === "PASS"),
  };
}

/** The legal action a completed selection stands for, or undefined. Always a member of model.legal. */
export function selectedAction(model: BoardModel, sel: Selection): Action | undefined {
  if (sel.kind === "move" && sel.facing) {
    return model.legal.find((a) => a.type === "MOVE" && a.dir === sel.dir && a.facing === sel.facing);
  }
  if (sel.kind === "rotate" && sel.facing) {
    return model.legal.find((a) => a.type === "ROTATE" && a.facing === sel.facing);
  }
  return undefined;
}

/** Where the active warrior would stand after the selection (its own cell for a rotate). */
export function selectionCell(model: BoardModel, sel: Selection): Position | null {
  if (sel.kind === "move") return stepPos(model.origin, sel.dir);
  if (sel.kind === "rotate") return model.origin;
  return null;
}

/** Engine projection of the active warrior's grid from `pos` facing `facing`: cell key -> modifier. */
export function gridAt(state: GameState, pos: Position, facing: Facing): Map<string, number> {
  const w = state.warriors[state.currentPlayer];
  const out = new Map<string, number>();
  for (const pc of projectGrid(w.attackGrid, pos, facing, state.arenaSize)) out.set(cellKey(pc.cell), pc.mod);
  return out;
}
