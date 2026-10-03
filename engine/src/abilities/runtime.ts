// The ability runtime. Called from the engine's hook points on applyAction's working copy of the
// state (never on a caller's state), so it mutates that copy in place. Deterministic: no dice.
//
// Timing (rulebook): Reveal abilities fire after the round's reveal, initiative and card
// restrictions, in initiative order; "start of round" abilities fire after them (p10). Outside a
// turn the initiative winner is the active player and resolves first (glossary). Face-down and
// discarded cards have no effect. A timed effect lasts its listed duration even if its card leaves
// play (p17). "Once per round" abilities are tracked per card + ability and reset each round (p18).

import type { GameEvent, GameState, PlayerId } from "../types";
import { REGISTRY } from "./registry";
import type { FireContext, RuntimeAbility, Trigger } from "./types";

export interface AbilitySource {
  cardId: string;
  cardName: string;
  abilities: RuntimeAbility[];
}

/** Player p's cards with implemented abilities that are in effect: the warrior + in-play support. */
export function sources(state: GameState, p: PlayerId): AbilitySource[] {
  const w = state.warriors[p];
  const out: AbilitySource[] = [];
  const add = (cardId: string, cardName: string) => {
    const abilities = REGISTRY[cardId];
    if (abilities?.length) out.push({ cardId, cardName, abilities });
  };
  add(w.cardId, w.name);
  for (const s of state.cards[p].support) if (s.status === "in-play") add(s.card.id, s.card.name);
  return out;
}

export const useKey = (cardId: string, ability: RuntimeAbility) => `${cardId}#${ability.name}`;

export function isUsedUp(state: GameState, cardId: string, ability: RuntimeAbility): boolean {
  return !!ability.oncePerRound && state.abilityUses.includes(useKey(cardId, ability));
}

function context(
  state: GameState,
  owner: PlayerId,
  src: AbilitySource,
  ability: RuntimeAbility,
  events: GameEvent[],
  attacker?: PlayerId,
): FireContext {
  return { state, owner, cardId: src.cardId, cardName: src.cardName, ability: ability.name, events, attacker };
}

/** Fire one ability if it can; records its use and logs it. Returns whether it fired. */
function tryFire(ctx: FireContext, ability: RuntimeAbility): boolean {
  if (!ability.fire || isUsedUp(ctx.state, ctx.cardId, ability)) return false;
  if (ability.canFire && !ability.canFire(ctx)) return false;
  const effect = ability.fire(ctx);
  if (ability.oncePerRound) ctx.state.abilityUses.push(useKey(ctx.cardId, ability));
  ctx.events.push({
    type: "abilityFired",
    player: ctx.owner,
    cardId: ctx.cardId,
    cardName: ctx.cardName,
    ability: ability.name,
    effect,
  });
  return true;
}

/**
 * Fire every ability with `trigger` for `players`, in that order (the active player first).
 * Reveal abilities fire only on the card that player revealed this round.
 */
export function fireTrigger(
  state: GameState,
  trigger: Exclude<Trigger, "continuous" | "action">,
  players: readonly PlayerId[],
  events: GameEvent[],
  attacker?: PlayerId,
): void {
  for (const p of players) {
    for (const src of sources(state, p)) {
      if (trigger === "reveal" && state.revealedThisRound[p] !== src.cardId) continue;
      for (const ability of src.abilities) {
        if (ability.trigger === trigger) tryFire(context(state, p, src, ability, events, attacker), ability);
      }
    }
  }
}

/** Player p's total bonus to attack rolls right now: continuous abilities + active timed effects. */
export function attackRollBonus(state: GameState, p: PlayerId): number {
  let bonus = 0;
  for (const src of sources(state, p)) {
    for (const a of src.abilities) if (a.trigger === "continuous" && a.attackRoll) bonus += a.attackRoll(state, p);
  }
  for (const e of state.effects) if (e.owner === p && e.active && e.kind === "attackRoll") bonus += e.amount;
  return bonus;
}

/** At the start of p's turn: activate p's pending "next turn" effects; returns the speed bonus. */
export function beginTurnEffects(state: GameState, p: PlayerId): number {
  let speed = 0;
  for (const e of state.effects) {
    if (e.owner !== p || e.duration !== "nextTurn" || e.active) continue;
    e.active = true;
    if (e.kind === "speed") speed += e.amount;
  }
  return speed;
}

/** At the end of p's turn: p's "next turn" effects that were active this turn expire. */
export function endTurnEffects(state: GameState, p: PlayerId): void {
  state.effects = state.effects.filter((e) => !(e.owner === p && e.duration === "nextTurn" && e.active));
}

/** At the end of the round: "this round" effects expire and once-per-round uses reset. */
export function endRoundEffects(state: GameState): void {
  state.effects = state.effects.filter((e) => e.duration !== "thisRound");
  state.abilityUses = [];
}

export interface ActionAbilityRef {
  cardId: string;
  cardName: string;
  ability: string;
}

/** Action abilities p could use right now (cost one action; checked by getLegalActions). */
export function usableActionAbilities(state: GameState, p: PlayerId): ActionAbilityRef[] {
  const out: ActionAbilityRef[] = [];
  for (const src of sources(state, p)) {
    for (const a of src.abilities) {
      if (a.trigger !== "action" || isUsedUp(state, src.cardId, a)) continue;
      if (a.canFire && !a.canFire(context(state, p, src, a, []))) continue;
      out.push({ cardId: src.cardId, cardName: src.cardName, ability: a.name });
    }
  }
  return out;
}

/** Use an action ability (the caller spends the action). Returns false if it isn't usable. */
export function useActionAbility(state: GameState, p: PlayerId, cardId: string, ability: string, events: GameEvent[]): boolean {
  const src = sources(state, p).find((s) => s.cardId === cardId);
  const a = src?.abilities.find((x) => x.trigger === "action" && x.name === ability);
  if (!src || !a) return false;
  return tryFire(context(state, p, src, a, events), a);
}

// ---- Display helpers (read-only) -----------------------------------------------------------------

export interface AbilityStatus {
  cardId: string;
  cardName: string;
  ability: string;
  trigger: Trigger;
  /** active: in effect now · dormant: its condition isn't met · used: once-per-round, spent ·
   *  ready: waiting for its moment (or, for an Action, usable). */
  status: "active" | "dormant" | "used" | "ready";
  detail: string;
}

const WHEN: Record<Exclude<Trigger, "continuous">, string> = {
  reveal: "when revealed",
  roundStart: "at the start of each round",
  damageDealt: "after dealing damage",
  action: "Action — costs 1 action",
};

/** Player p's implemented abilities currently in play, with what each is doing right now. */
export function abilityStatus(state: GameState, p: PlayerId): AbilityStatus[] {
  const out: AbilityStatus[] = [];
  for (const src of sources(state, p)) {
    for (const a of src.abilities) {
      const base = { cardId: src.cardId, cardName: src.cardName, ability: a.name, trigger: a.trigger };
      if (a.trigger === "continuous") {
        const on = a.inEffect ? a.inEffect(state, p) : true;
        const v = a.attackRoll ? a.attackRoll(state, p) : 0;
        out.push({ ...base, status: on ? "active" : "dormant", detail: on ? `${v >= 0 ? "+" : ""}${v} to attack rolls` : "condition not met" });
      } else if (isUsedUp(state, src.cardId, a)) {
        out.push({ ...base, status: "used", detail: "used this round" });
      } else {
        out.push({ ...base, status: "ready", detail: WHEN[a.trigger] + (a.oncePerRound ? " (once per round)" : "") });
      }
    }
  }
  return out;
}
