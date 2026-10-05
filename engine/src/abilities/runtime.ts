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
import type { AbilityParams, AttackKind, FireContext, ModKind, RuntimeAbility, Trigger } from "./types";

/** Facts about the attack an attack trigger fires for. */
export interface AttackInfo {
  attacker?: PlayerId;
  defender?: PlayerId;
  attackKind?: AttackKind;
}

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
  info: AttackInfo = {},
): FireContext {
  return { state, owner, cardId: src.cardId, cardName: src.cardName, ability: ability.name, events, ...info };
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
  trigger: Exclude<Trigger, "continuous" | "action" | "attackRoll">,
  players: readonly PlayerId[],
  events: GameEvent[],
  info: AttackInfo = {},
): void {
  for (const p of players) {
    for (const src of sources(state, p)) {
      if (trigger === "reveal" && state.revealedThisRound[p] !== src.cardId) continue;
      for (const ability of src.abilities) {
        if (ability.trigger === trigger) tryFire(context(state, p, src, ability, events, info), ability);
      }
    }
  }
}

const oppOf = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Sum of a modifier for warrior `subject`: continuous abilities of their own in-effect cards, plus
 *  other players' cards whose abilities reach other warriors ("all warriors' attack rolls gain +1"),
 *  plus the subject's active timed effects. */
function modifierTotal(state: GameState, subject: PlayerId, kind: ModKind, attacker: PlayerId, defender: PlayerId, weaponId?: string): number {
  let total = 0;
  for (const owner of state.warriors.map((w) => w.playerId)) {
    for (const src of sources(state, owner)) {
      for (const a of src.abilities) {
        if (a.trigger !== "continuous" || !a.modify || (owner !== subject && !a.affectsOthers)) continue;
        total += a.modify(kind, { state, owner, subject, attacker, defender, weaponId, sourceCardId: src.cardId });
      }
    }
  }
  const timed = kind === "attackDamage" ? "damage" : kind;
  for (const e of state.effects) {
    if (e.owner !== subject || !e.active || e.kind !== timed) continue;
    if (e.kind === "damage" && e.weapon !== undefined && e.weapon !== weaponId) continue;
    total += e.amount;
  }
  return total;
}

/** Attacker p's bonus to an attack roll (against the opponent, with `weaponId` or a basic attack). */
export function attackRollBonus(state: GameState, p: PlayerId, weaponId?: string): number {
  return modifierTotal(state, p, "attackRoll", p, oppOf(p), weaponId);
}

/** Defender p's bonus to their defense roll against the opponent's attack. */
export function defenseRollBonus(state: GameState, p: PlayerId, weaponId?: string): number {
  return modifierTotal(state, p, "defenseRoll", oppOf(p), p, weaponId);
}

/** Extra damage from the weapon's own abilities (e.g. Gladius) for attacker p's attack with it. */
export function weaponDamageBonus(state: GameState, p: PlayerId, weaponId: string): number {
  return modifierTotal(state, p, "weaponDamage", p, oppOf(p), weaponId);
}

/** All extra damage attacker p's attack deals — with `weaponId`, or a basic attack: the weapon's own
 *  abilities, "your attacks deal +N damage" abilities, and timed damage effects. Added after a
 *  critical hit doubles the base damage (p13). */
export function damageBonus(state: GameState, p: PlayerId, weaponId?: string): number {
  return (weaponId ? weaponDamageBonus(state, p, weaponId) : 0) + modifierTotal(state, p, "attackDamage", p, oppOf(p), weaponId);
}

/** Speed p gains every turn from continuous abilities ("You gain +1 speed", "All other warriors gain
 *  +1 speed"), read when a turn starts. */
export function continuousSpeed(state: GameState, p: PlayerId): number {
  let total = 0;
  for (const owner of state.warriors.map((w) => w.playerId)) {
    for (const src of sources(state, owner)) {
      for (const a of src.abilities) {
        if (a.trigger !== "continuous" || !a.modify || (owner !== p && !a.affectsOthers)) continue;
        total += a.modify("speed", { state, owner, subject: p, attacker: p, defender: oppOf(p), sourceCardId: src.cardId });
      }
    }
  }
  return total;
}

/** p's total actions for a turn under the current state: printed speed + continuous speed + speed
 *  effects active for p's turn (display / evaluation helper). */
export function speedNow(state: GameState, p: PlayerId): number {
  const timed = state.effects
    .filter((e) => e.owner === p && e.kind === "speed" && (e.duration === "thisRound" || e.active))
    .reduce((n, e) => n + e.amount, 0);
  return state.warriors[p].speed + continuousSpeed(state, p) + timed;
}

/** At the start of p's turn: activate p's pending "next turn" effects; returns the speed bonus —
 *  from those, plus any "this round" speed effects (e.g. gained at the start of the round). */
export function beginTurnEffects(state: GameState, p: PlayerId): number {
  let speed = 0;
  for (const e of state.effects) {
    if (e.owner !== p) continue;
    if (e.duration === "nextTurn" && !e.active) {
      e.active = true;
      if (e.kind === "speed") speed += e.amount;
    } else if (e.duration === "thisRound" && e.kind === "speed") {
      speed += e.amount;
    }
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
  /** For abilities that take a choice (e.g. a move): one entry per legal choice. */
  params?: AbilityParams;
}

const sameParams = (a?: AbilityParams, b?: AbilityParams) =>
  !a && !b
    ? true
    : !!a && !!b && a.facing === b.facing && a.to.row === b.to.row && a.to.col === b.to.col;

/** Action abilities p could use right now, one entry per legal choice (cost one action; offered by
 *  getLegalActions). */
export function usableActionAbilities(state: GameState, p: PlayerId): ActionAbilityRef[] {
  const out: ActionAbilityRef[] = [];
  for (const src of sources(state, p)) {
    for (const a of src.abilities) {
      if (a.trigger !== "action" || isUsedUp(state, src.cardId, a)) continue;
      const ctx = context(state, p, src, a, []);
      if (a.canFire && !a.canFire(ctx)) continue;
      const ref = { cardId: src.cardId, cardName: src.cardName, ability: a.name };
      if (a.options) for (const params of a.options(ctx)) out.push({ ...ref, params });
      else out.push(ref);
    }
  }
  return out;
}

/** Use an action ability (the caller spends the action). Returns false if it isn't usable with
 *  those params. */
export function useActionAbility(
  state: GameState,
  p: PlayerId,
  cardId: string,
  ability: string,
  events: GameEvent[],
  params?: AbilityParams,
): boolean {
  const offered = usableActionAbilities(state, p).some((r) => r.cardId === cardId && r.ability === ability && sameParams(r.params, params));
  if (!offered) return false;
  const src = sources(state, p).find((s) => s.cardId === cardId)!;
  const a = src.abilities.find((x) => x.trigger === "action" && x.name === ability)!;
  const ctx = context(state, p, src, a, events);
  const effect = a.fire!(ctx, params);
  if (a.oncePerRound) state.abilityUses.push(useKey(cardId, a));
  events.push({ type: "abilityFired", player: p, cardId, cardName: src.cardName, ability: a.name, effect });
  return true;
}

export interface RerollRef {
  cardId: string;
  cardName: string;
  ability: string;
}

/** An optional re-roll ability attacker p could use on this attack roll right now, if any. */
export function usableReroll(state: GameState, p: PlayerId, info: AttackInfo): RerollRef | null {
  for (const src of sources(state, p)) {
    for (const a of src.abilities) {
      if (a.trigger !== "attackRoll" || !a.reroll || isUsedUp(state, src.cardId, a)) continue;
      if (a.canFire && !a.canFire(context(state, p, src, a, [], info))) continue;
      return { cardId: src.cardId, cardName: src.cardName, ability: a.name };
    }
  }
  return null;
}

/** Use the re-roll: records its use and, if the new die equals the old, runs its follow-up. */
export function resolveReroll(state: GameState, p: PlayerId, ref: RerollRef, same: boolean, events: GameEvent[], info: AttackInfo): void {
  const src = sources(state, p).find((s) => s.cardId === ref.cardId);
  const a = src?.abilities.find((x) => x.name === ref.ability && x.reroll);
  if (!src || !a) return;
  if (a.oncePerRound) state.abilityUses.push(useKey(ref.cardId, a));
  if (same && a.reroll!.onSame) {
    const effect = a.reroll!.onSame(context(state, p, src, a, events, info));
    events.push({ type: "abilityFired", player: p, cardId: src.cardId, cardName: src.cardName, ability: a.name, effect });
  }
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
  gameStart: "at the start of the game",
  attackRoll: "optional, when making an attack roll",
  hit: "after being hit",
  missed: "after being missed",
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
        const detail = a.describeNow ? a.describeNow(state, p, src.cardId) : "in effect";
        const active = on && detail !== "condition not met";
        out.push({ ...base, status: active ? "active" : "dormant", detail: active ? detail : "condition not met" });
      } else if (isUsedUp(state, src.cardId, a)) {
        out.push({ ...base, status: "used", detail: "used this round" });
      } else if (a.trigger === "reveal") {
        // A Reveal ability fires once, when its card is turned face up.
        const now = state.revealedThisRound[p] === src.cardId;
        out.push({ ...base, status: "used", detail: now ? "fired on reveal this round" : "fired when revealed" });
      } else {
        out.push({ ...base, status: "ready", detail: WHEN[a.trigger] + (a.oncePerRound ? " (once per round)" : "") });
      }
    }
  }
  return out;
}
