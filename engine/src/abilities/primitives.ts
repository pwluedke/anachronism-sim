// The building blocks data-authored abilities are made of: conditions and effects. Each is a
// small pure function over the engine's working state. Add new primitives here as card batches
// need them.

import type { GameState, PlayerId, Position } from "../types";
import type { SupportType } from "../decks";
import { inPlay } from "../cards";
import { inBounds, stepPos, FACINGS } from "../arena";
import type { AbilityParams, AttackKind, FireContext } from "./types";

// ---- Conditions ----------------------------------------------------------------------------------

export type ConditionDef =
  /** "while you have an <type> in play" */
  | { kind: "hasInPlay"; cardType: SupportType }
  /** "if you lose initiative" (this round) */
  | { kind: "lostInitiative" }
  /** "while you have lower life than the attacking warrior" */
  | { kind: "lowerLifeThanAttacker" }
  /** "if you have a face-up shield card" (an in-play card with the Shield trait) */
  | { kind: "haveShield" }
  /** "if the defender has no face-up armor card" */
  | { kind: "defenderNoArmor" }
  /** "by a basic attack" / "with a weapon" */
  | { kind: "attackKind"; is: AttackKind };

/** Facts about the attack a condition may need (absent outside attacks). */
export interface CondQuery {
  attacker?: PlayerId;
  defender?: PlayerId;
  attackKind?: AttackKind;
}

export function holds(cond: ConditionDef | undefined, state: GameState, owner: PlayerId, q: CondQuery = {}): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case "hasInPlay":
      return inPlay(state, owner).some((s) => s.card.type === cond.cardType);
    case "lostInitiative":
      return state.initiative !== null && state.initiative !== owner;
    case "lowerLifeThanAttacker":
      return q.attacker !== undefined && q.attacker !== owner && state.warriors[owner].life < state.warriors[q.attacker].life;
    case "haveShield":
      return inPlay(state, owner).some((s) => s.card.traits.some((t) => t.toLowerCase() === "shield"));
    case "defenderNoArmor":
      return q.defender !== undefined && !inPlay(state, q.defender).some((s) => s.card.type === "armor");
    case "attackKind":
      return q.attackKind === cond.is;
  }
}

export function describeCondition(cond: ConditionDef): string {
  switch (cond.kind) {
    case "hasInPlay":
      return `while ${cond.cardType === "inspiration" ? "an" : "a"} ${cond.cardType} is in play`;
    case "lostInitiative":
      return "on losing initiative";
    case "lowerLifeThanAttacker":
      return "while behind the attacker on life";
    case "haveShield":
      return "with a shield in play";
    case "defenderNoArmor":
      return "if the defender has no armor in play";
    case "attackKind":
      return cond.is === "basic" ? "by a basic attack" : "by a weapon attack";
  }
}

// ---- Effects -------------------------------------------------------------------------------------

/** Who ability damage goes to. allOpponents is the opponent in 1v1. */
export type DamageTarget = "self" | "opponent" | "allOpponents" | "defender" | "attacker";

export type EffectDef = (
  /** "Your attack rolls gain +N" */
  | { kind: "attackRoll"; amount: number }
  /** "Your defense rolls gain +N" */
  | { kind: "defenseRoll"; amount: number }
  /** "Attacks with this weapon deal +N damage" (only on the weapon card itself) */
  | { kind: "weaponDamage"; amount: number }
  /** "gain N life" */
  | { kind: "gainLife"; amount: number }
  /** "gain +N speed" */
  | { kind: "speed"; amount: number }
  /** "deal N damage to <target>" — ability damage, not a hit (rulebook glossary) */
  | { kind: "dealDamage"; amount: number; target: DamageTarget }
  /** "move N spaces" (an Action ability's choice of where to and which way to face) */
  | { kind: "move"; spaces: number }
  /** "you may re-roll one die of the attack roll" — then `ifSame` if the new die equals the old */
  | { kind: "reroll"; roll: "attack"; ifSame?: EffectDef[] }
) & {
  /** An effect that only applies when this also holds (two gated effects add up, rulebook p17). */
  when?: ConditionDef;
};

/** permanent: while the card is in play (continuous). thisRound / nextTurn: a timed effect. */
export type DurationDef = "permanent" | "thisRound" | "nextTurn";

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

function damageTargets(ctx: FireContext, target: DamageTarget): PlayerId[] {
  switch (target) {
    case "self":
      return [ctx.owner];
    case "opponent":
    case "allOpponents":
      return [opp(ctx.owner)];
    case "defender":
      return ctx.defender !== undefined ? [ctx.defender] : [];
    case "attacker":
      return ctx.attacker !== undefined ? [ctx.attacker] : [];
  }
}

/** Where an ability move of exactly `spaces` steps can end: orthogonal steps through empty
 *  in-arena cells (no passing through a warrior), never back at the start; any facing after. */
export function moveOptions(state: GameState, owner: PlayerId, spaces: number): AbilityParams[] {
  const start = state.warriors[owner].position;
  const foe = state.warriors[opp(owner)].position;
  const key = (p: Position) => `${p.row},${p.col}`;
  let frontier: Position[] = [start];
  for (let i = 0; i < spaces; i++) {
    const next = new Map<string, Position>();
    for (const p of frontier) {
      for (const d of FACINGS) {
        const q = stepPos(p, d);
        if (inBounds(q, state.arenaSize) && key(q) !== key(foe)) next.set(key(q), q);
      }
    }
    frontier = [...next.values()];
  }
  return frontier
    .filter((p) => key(p) !== key(start))
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .flatMap((to) => FACINGS.map((facing) => ({ to, facing })));
}

/** Apply a one-off effect when an ability fires. Returns a description for the log. */
export function applyEffect(ctx: FireContext, effect: EffectDef, duration: DurationDef | undefined, params?: AbilityParams): string {
  const { state, owner } = ctx;
  switch (effect.kind) {
    case "gainLife":
      state.warriors[owner].life += effect.amount;
      return `gains ${effect.amount} life`;
    case "dealDamage": {
      const targets = damageTargets(ctx, effect.target);
      for (const t of targets) state.warriors[t].life -= effect.amount;
      const who = targets.map((t) => (t === owner ? "itself" : state.warriors[t].name)).join(", ");
      return `deals ${effect.amount} damage to ${who}`;
    }
    case "move": {
      if (!params) throw new Error(`${ctx.cardName} ${ctx.ability}: a move needs a destination`);
      const w = state.warriors[owner];
      const from = { ...w.position };
      state.warriors[owner] = { ...w, position: { ...params.to }, facing: params.facing };
      ctx.events.push({ type: "moved", player: owner, from, to: { ...params.to }, facing: params.facing });
      return `moves ${effect.spaces} spaces`;
    }
    case "attackRoll":
    case "defenseRoll":
    case "speed": {
      if (duration !== "thisRound" && duration !== "nextTurn") {
        throw new Error(`${ctx.cardName} ${ctx.ability}: a fired ${effect.kind} effect needs duration thisRound or nextTurn`);
      }
      state.effects.push({
        owner,
        source: ctx.cardId,
        sourceName: ctx.cardName,
        ability: ctx.ability,
        kind: effect.kind,
        amount: effect.amount,
        duration,
        active: duration === "thisRound",
      });
      const what = effect.kind === "attackRoll" ? "to attack rolls" : effect.kind === "defenseRoll" ? "to defense rolls" : "speed";
      return `${signed(effect.amount)} ${what} ${duration === "thisRound" ? "this round" : "on the next turn"}`;
    }
    case "weaponDamage":
      throw new Error(`${ctx.cardName} ${ctx.ability}: weaponDamage is a continuous modifier, not a fired effect`);
    case "reroll":
      throw new Error(`${ctx.cardName} ${ctx.ability}: a re-roll is resolved during the attack roll, not fired`);
  }
}
