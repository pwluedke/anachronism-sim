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
  | { kind: "attackKind"; is: AttackKind }
  // ---- batch 3 whitelist ----
  /** "while you are a <Element> warrior" — the owner's warrior element */
  | { kind: "elementIs"; element: string }
  /** "while you are a <Culture> warrior" — one of the owner's warrior cultures */
  | { kind: "cultureIs"; culture: string }
  /** "while you are adjacent to an opposing warrior" (shares a side or corner, glossary) */
  | { kind: "adjacentToOpponent" }
  /** "while you have less / more life than <warrior name>" (false when no such warrior is in play) */
  | { kind: "lifeVsNamed"; cmp: "less" | "more"; name: string }
  /** "while you have the least / most life" — strictly less / more than every other warrior */
  | { kind: "lifeExtreme"; which: "least" | "most" }
  /** "while you have at least N face-up support cards" */
  | { kind: "faceUpSupportAtLeast"; n: number }
  /** "if you win initiative" (this round) */
  | { kind: "wonInitiative" }
  /** "if the defender / attacker has no face-up <type> card" */
  | { kind: "lacksType"; who: "defender" | "attacker"; cardType: SupportType }
  // ---- batch 4 ----
  /** "if you have moved this turn" — your warrior changed spaces during your current turn */
  | { kind: "movedThisTurn" }
  /** "if <who> has (no) face-up <type / trait> card", e.g. "the defending warrior has a face-up
   *  shield card", "an opponent without a cavalry card". Matches in-play support cards by type
   *  and / or trait; a trait also matches the warrior card itself (a Cavalry warrior is a cavalry card). */
  | { kind: "faceUpCard"; who: CardHolder; cardType?: SupportType; trait?: string; has: boolean };

/** Whose cards a faceUpCard condition looks at. */
export type CardHolder = "self" | "defender" | "attacker" | "opponent";

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
    case "elementIs":
      return (state.warriors[owner].element ?? "").toLowerCase() === cond.element.toLowerCase();
    case "cultureIs":
      return (state.warriors[owner].cultures ?? []).some((c) => c.toLowerCase() === cond.culture.toLowerCase());
    case "adjacentToOpponent": {
      const a = state.warriors[owner].position;
      const b = state.warriors[owner === 0 ? 1 : 0].position;
      return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) === 1;
    }
    case "lifeVsNamed": {
      const other = state.warriors.find((w) => w.playerId !== owner && w.name.toLowerCase() === cond.name.toLowerCase());
      if (!other) return false;
      const mine = state.warriors[owner].life;
      return cond.cmp === "less" ? mine < other.life : mine > other.life;
    }
    case "lifeExtreme": {
      const mine = state.warriors[owner].life;
      const others = state.warriors.filter((w) => w.playerId !== owner);
      return cond.which === "least" ? others.every((w) => mine < w.life) : others.every((w) => mine > w.life);
    }
    case "faceUpSupportAtLeast":
      return inPlay(state, owner).length >= cond.n;
    case "wonInitiative":
      return state.initiative === owner;
    case "lacksType": {
      const who = cond.who === "defender" ? q.defender : q.attacker;
      return who !== undefined && !inPlay(state, who).some((s) => s.card.type === cond.cardType);
    }
    case "movedThisTurn":
      return state.phase === "playing" && state.currentPlayer === owner && state.movedThisTurn;
    case "faceUpCard": {
      const who = cond.who === "self" ? owner : cond.who === "opponent" ? opp(owner) : cond.who === "defender" ? q.defender : q.attacker;
      if (who === undefined) return false;
      const trait = cond.trait?.toLowerCase();
      const hasTrait = (traits: string[]) => trait === undefined || traits.some((t) => t.toLowerCase() === trait);
      const found =
        inPlay(state, who).some((s) => (cond.cardType === undefined || s.card.type === cond.cardType) && hasTrait(s.card.traits)) ||
        (cond.cardType === undefined && trait !== undefined && hasTrait(warriorTraits(state, who)));
      return cond.has ? found : !found;
    }
  }
}

/** A warrior card's printed traits (e.g. Cavalry), from its card data. */
function warriorTraits(state: GameState, p: PlayerId): string[] {
  return state.warriors[p].traits ?? [];
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
    case "elementIs":
      return `while you are a ${cond.element} warrior`;
    case "cultureIs":
      return `while you are a ${cond.culture} warrior`;
    case "adjacentToOpponent":
      return "while adjacent to an opposing warrior";
    case "lifeVsNamed":
      return `while you have ${cond.cmp} life than ${cond.name}`;
    case "lifeExtreme":
      return `while you have the ${cond.which} life`;
    case "faceUpSupportAtLeast":
      return `while you have at least ${cond.n} face-up support cards`;
    case "wonInitiative":
      return "on winning initiative";
    case "lacksType":
      return `if the ${cond.who} has no face-up ${cond.cardType}`;
    case "movedThisTurn":
      return "if you have moved this turn";
    case "faceUpCard": {
      const whose = cond.who === "self" ? "you have" : `the ${cond.who} has`;
      const what = [cond.trait, cond.cardType].filter(Boolean).join(" ");
      return `if ${whose} ${cond.has ? "a" : "no"} face-up ${what} card`;
    }
  }
}

// ---- Effects -------------------------------------------------------------------------------------

/** Who ability damage goes to. allOpponents / allOthers are the opponent in 1v1; all is both warriors. */
export type DamageTarget = "self" | "opponent" | "allOpponents" | "defender" | "attacker" | "all" | "allOthers";

/** Whose attack rolls / speed an effect changes: your own (default), every warrior's, or every
 *  other warrior's ("All warriors' attack rolls gain +1", "All other warriors gain +1 speed"). */
export type EffectTarget = "self" | "all" | "allOthers";

export type EffectDef = (
  /** "Your attack rolls gain +N" (target: "All warriors' attack rolls …") */
  | { kind: "attackRoll"; amount: number; target?: EffectTarget }
  /** "Your defense rolls gain +N" */
  | { kind: "defenseRoll"; amount: number }
  /** "Attacks with this weapon deal +N damage" (only on the weapon card itself) */
  | { kind: "weaponDamage"; amount: number }
  /** "Your attacks deal +N damage" — every attack you make, basic or weapon */
  | { kind: "attackDamage"; amount: number }
  /** "gain N life" */
  | { kind: "gainLife"; amount: number }
  /** "gain +N speed" (target: "All warriors gain …") */
  | { kind: "speed"; amount: number; target?: EffectTarget }
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

/** Does an effect with `target`, on a card `owner` controls, apply to warrior `subject`? */
export function targets(target: EffectTarget | undefined, owner: PlayerId, subject: PlayerId): boolean {
  return target === "all" || (target === "allOthers" ? subject !== owner : subject === owner);
}

/** The warriors an effect with `target` applies to. */
function targetPlayers(state: GameState, target: EffectTarget | undefined, owner: PlayerId): PlayerId[] {
  return state.warriors.map((w) => w.playerId).filter((p) => targets(target, owner, p));
}

function damageTargets(ctx: FireContext, target: DamageTarget): PlayerId[] {
  switch (target) {
    case "self":
      return [ctx.owner];
    case "opponent":
    case "allOpponents":
    case "allOthers":
      return [opp(ctx.owner)];
    case "all":
      return [ctx.owner, opp(ctx.owner)];
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
      if (state.currentPlayer === owner) state.movedThisTurn = true;
      ctx.events.push({ type: "moved", player: owner, from, to: { ...params.to }, facing: params.facing });
      return `moves ${effect.spaces} spaces`;
    }
    case "attackRoll":
    case "defenseRoll":
    case "speed":
    case "weaponDamage":
    case "attackDamage": {
      if (duration !== "thisRound" && duration !== "nextTurn") {
        throw new Error(`${ctx.cardName} ${ctx.ability}: a fired ${effect.kind} effect needs duration thisRound or nextTurn`);
      }
      const target = effect.kind === "attackRoll" || effect.kind === "speed" ? effect.target : undefined;
      const kind = effect.kind === "weaponDamage" || effect.kind === "attackDamage" ? "damage" : effect.kind;
      const who = targetPlayers(state, target, owner);
      for (const p of who) {
        state.effects.push({
          owner: p,
          source: ctx.cardId,
          sourceName: ctx.cardName,
          ability: ctx.ability,
          kind,
          amount: effect.amount,
          ...(effect.kind === "weaponDamage" ? { weapon: ctx.cardId } : {}),
          duration,
          active: duration === "thisRound",
        });
      }
      const what =
        effect.kind === "attackRoll"
          ? "to attack rolls"
          : effect.kind === "defenseRoll"
            ? "to defense rolls"
            : effect.kind === "speed"
              ? "speed"
              : effect.kind === "weaponDamage"
                ? "damage with this weapon"
                : "damage";
      const whose = target === "all" ? " for all warriors" : target === "allOthers" ? " for all other warriors" : "";
      return `${signed(effect.amount)} ${what}${whose} ${duration === "thisRound" ? "this round" : "on the next turn"}`;
    }
    case "reroll":
      throw new Error(`${ctx.cardName} ${ctx.ability}: a re-roll is resolved during the attack roll, not fired`);
  }
}
