// Board interaction model. Everything here is DERIVED from getLegalActions(state) and engine
// helpers (stepPos, projectGrid). It never decides legality: a selection only resolves to an
// action by finding that exact action object in the engine's legal list.
import { getLegalActions, projectGrid, stepPos, weaponsInPlay } from "@engine";
import type { Action, Facing, GameState, PlayerId, Position } from "@engine";

export const cellKey = (p: Position) => `${p.row},${p.col}`;

export type Selection =
  | { kind: "none" }
  | { kind: "move"; dir: Facing; facing: Facing | null }
  | { kind: "rotate"; facing: Facing | null }
  /** An Action ability that moves (e.g. Salah ad-Din): pick a destination, then a facing. */
  | { kind: "abilityMove"; card: string; ability: string; to: Position | null; facing: Facing | null }
  /** A pending ability choice (e.g. Mempo, Scutum, Kimono): pick where the warrior moves. */
  | { kind: "choice"; to: Position | null; facing: Facing | null };

/** An Action ability whose legal choices are destinations + facings (one action per choice). */
export interface AbilityMoveGroup {
  card: string;
  ability: string;
  options: Extract<Action, { type: "ABILITY" }>[];
}

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
  /** The basic attack, if the foe is in the warrior's grid. */
  basicAttack: Action | undefined;
  /** Legal weapon attacks, keyed by weapon card id. */
  weaponAttacks: Map<string, Action>;
  /** Every legal attack (basic first, then weapons). */
  attacks: Action[];
  pass: Action | undefined;
  /** Legal discards while a card restriction is pending, keyed by card id. */
  discards: Map<string, Action>;
  /** Usable Action abilities that need no choice (each costs one action). */
  plainAbilities: Action[];
  /** Usable Action abilities that move, keyed "card#ability", with every legal destination + facing. */
  abilityMoves: Map<string, AbilityMoveGroup>;
  /** While an optional re-roll is pending: the legal REROLL choices and KEEP. */
  rerolls: Action[];
  keep: Action | undefined;
  /** While an ability choice is pending: the warrior that moves, its legal CHOOSE actions, and
   *  DECLINE if the ability is optional. */
  choice: { mover: PlayerId; options: Extract<Action, { type: "CHOOSE" }>[]; decline: Action | undefined } | null;
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
    basicAttack: legal.find((a) => a.type === "ATTACK" && !a.weapon),
    weaponAttacks: new Map(legal.flatMap((a) => (a.type === "ATTACK" && a.weapon ? [[a.weapon, a] as const] : []))),
    attacks: legal.filter((a) => a.type === "ATTACK"),
    pass: legal.find((a) => a.type === "PASS"),
    discards: new Map(legal.flatMap((a) => (a.type === "DISCARD" ? [[a.card, a] as const] : []))),
    plainAbilities: legal.filter((a) => a.type === "ABILITY" && !a.to),
    abilityMoves: groupAbilityMoves(legal),
    rerolls: legal.filter((a) => a.type === "REROLL"),
    keep: legal.find((a) => a.type === "KEEP"),
    choice:
      state.pending?.kind === "choice"
        ? {
            mover: state.pending.queue[0].mover,
            options: legal.filter((a): a is Extract<Action, { type: "CHOOSE" }> => a.type === "CHOOSE"),
            decline: legal.find((a) => a.type === "DECLINE"),
          }
        : null,
  };
}

/** For a pending ability choice: the destination cells offered. */
export function choiceTargets(model: BoardModel): Set<string> {
  return new Set((model.choice?.options ?? []).map((a) => cellKey(a.to)));
}

/** For a pending ability choice: the facings offered at destination `to`. */
export function choiceFacings(model: BoardModel, to: Position): Facing[] {
  return (model.choice?.options ?? []).filter((a) => a.to.row === to.row && a.to.col === to.col).map((a) => a.facing);
}

function groupAbilityMoves(legal: Action[]): Map<string, AbilityMoveGroup> {
  const out = new Map<string, AbilityMoveGroup>();
  for (const a of legal) {
    if (a.type !== "ABILITY" || !a.to) continue;
    const key = `${a.card}#${a.ability}`;
    if (!out.has(key)) out.set(key, { card: a.card, ability: a.ability, options: [] });
    out.get(key)!.options.push(a);
  }
  return out;
}

/** For an ability move: the destination cells it can reach. */
export function abilityMoveTargets(model: BoardModel, card: string, ability: string): Set<string> {
  return new Set((model.abilityMoves.get(`${card}#${ability}`)?.options ?? []).map((a) => cellKey(a.to!)));
}

/** For an ability move: the facings offered at destination `to`. */
export function abilityMoveFacings(model: BoardModel, card: string, ability: string, to: Position): Facing[] {
  return (model.abilityMoves.get(`${card}#${ability}`)?.options ?? [])
    .filter((a) => a.to!.row === to.row && a.to!.col === to.col)
    .map((a) => a.facing!);
}

/** The legal action a completed selection stands for, or undefined. Always a member of model.legal. */
export function selectedAction(model: BoardModel, sel: Selection): Action | undefined {
  if (sel.kind === "move" && sel.facing) {
    return model.legal.find((a) => a.type === "MOVE" && a.dir === sel.dir && a.facing === sel.facing);
  }
  if (sel.kind === "rotate" && sel.facing) {
    return model.legal.find((a) => a.type === "ROTATE" && a.facing === sel.facing);
  }
  if (sel.kind === "choice" && sel.to && sel.facing) {
    const to = sel.to;
    return model.choice?.options.find((a) => a.to.row === to.row && a.to.col === to.col && a.facing === sel.facing);
  }
  if (sel.kind === "abilityMove" && sel.to && sel.facing) {
    const to = sel.to;
    return model.abilityMoves
      .get(`${sel.card}#${sel.ability}`)
      ?.options.find((a) => a.to!.row === to.row && a.to!.col === to.col && a.facing === sel.facing);
  }
  return undefined;
}

/** Where the active warrior would stand after the selection (its own cell for a rotate). */
export function selectionCell(model: BoardModel, sel: Selection): Position | null {
  if (sel.kind === "move") return stepPos(model.origin, sel.dir);
  if (sel.kind === "rotate") return model.origin;
  if (sel.kind === "abilityMove" || sel.kind === "choice") return sel.to;
  return null;
}

/** Engine projection of the active warrior's grid from `pos` facing `facing`: cell key -> modifier. */
export function gridAt(state: GameState, pos: Position, facing: Facing): Map<string, number> {
  const w = state.warriors[state.currentPlayer];
  const out = new Map<string, number>();
  for (const pc of projectGrid(w.attackGrid, pos, facing, state.arenaSize)) out.set(cellKey(pc.cell), pc.mod);
  return out;
}

/** Engine projection of an in-play weapon's grid from the active warrior's position + facing. */
export function weaponGridAt(state: GameState, weaponId: string): Map<string, number> {
  const p = state.currentPlayer;
  const w = state.warriors[p];
  const slot = weaponsInPlay(state, p).find((s) => s.card.id === weaponId);
  const out = new Map<string, number>();
  if (!slot?.card.grid) return out;
  for (const pc of projectGrid(slot.card.grid, w.position, w.facing, state.arenaSize)) out.set(cellKey(pc.cell), pc.mod);
  return out;
}
