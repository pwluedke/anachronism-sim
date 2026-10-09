// The ability authoring format. A card's ability is either:
//
//  1. DATA — { name, trigger, condition?, effects, usageLimit?, duration? }, compiled by
//     compileAbility into a RuntimeAbility from the primitives in primitives.ts. Most cards fit.
//     e.g. Apollo: { name: "Cura Dei", trigger: "reveal",
//                    effects: [{ kind: "attackRoll", amount: 1 }], duration: "thisRound" }
//
//  2. CODED — a RuntimeAbility written by hand, the escape hatch for text the primitives can't
//     express. It plugs into the same runtime:
//     { coded: { name: "…", trigger: "damageDealt", oncePerRound: true,
//                canFire: (ctx) => …, fire: (ctx) => { …mutate ctx.state…; return "what happened"; } } }
//
// defineCard(cardId, ...abilities) registers a card. Unregistered cards stay inert.

import type { FireContext, ModKind, ModQuery, RuntimeAbility, Trigger } from "./types";
import type { PlayerId } from "../types";
import { REGISTRY } from "./registry";
import {
  abilityRoll,
  applyEffect,
  describeCondition,
  holds,
  isTimed,
  moveOptions,
  moverOf,
  requestChoice,
  targets,
  TIMED,
  type ConditionDef,
  type DurationDef,
  type EffectDef,
  type RollDef,
} from "./primitives";

const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export interface AbilityData {
  /** The ability's printed name (e.g. "Cura Dei"). */
  name: string;
  trigger: Trigger;
  condition?: ConditionDef;
  effects: EffectDef[];
  /** "once each round" (rulebook p18). */
  usageLimit?: "oncePerRound";
  /** For continuous abilities "permanent" (the default); for fired ones how long a roll / speed
   *  effect lasts. Life gain, damage and moves are instant and need none. */
  duration?: DurationDef;
  /** "Roll N dice. If the total is <cmp> X, …": the effects happen only if the roll succeeds. */
  roll?: RollDef;
  /** "You may …": the effect is the owner's choice (offered as CHOOSE / DECLINE). */
  optional?: boolean;
}

/** Triggers whose abilities may leave a decision pending (a move chosen after the fact): those that
 *  fire during your action or during an attack, when play can wait for the choice. */
const CHOICE_TRIGGERS: readonly Trigger[] = ["action", "hit", "missed", "damageDealt", "attackMissed"];

export type AbilityDef = { data: AbilityData } | { coded: RuntimeAbility };

const MODIFIERS = ["attackRoll", "defenseRoll", "weaponDamage", "attackDamage", "speed", "experience"] as const;
const isModifier = (e: EffectDef): e is EffectDef & { kind: ModKind; amount: number } =>
  (MODIFIERS as readonly string[]).includes(e.kind);
const targetOf = (e: EffectDef) => (e.kind === "attackRoll" || e.kind === "speed" ? e.target : undefined);

const MOD_TEXT: Record<ModKind, string> = {
  attackRoll: "attack rolls",
  defenseRoll: "defense rolls",
  weaponDamage: "damage with this weapon",
  attackDamage: "damage",
  speed: "speed",
  experience: "experience",
};

/** Compile a data ability into the runtime's form. Throws on combinations the runtime can't do. */
export function compileAbility(a: AbilityData): RuntimeAbility {
  if (a.trigger === "continuous") {
    if (a.duration && a.duration !== "permanent") throw new Error(`${a.name}: continuous abilities are permanent`);
    if (a.usageLimit) throw new Error(`${a.name}: continuous abilities have no usage limit`);
    const bad = a.effects.find((e) => !isModifier(e) || (e.kind === "experience" && (e.who ?? "self") !== "self"));
    if (bad) throw new Error(`${a.name}: continuous ${bad.kind} is not supported (continuous effects are modifiers)`);
    const mods = a.effects.filter(isModifier);
    const modify = (kind: ModKind, q: ModQuery): number => {
      if (kind === "weaponDamage" && q.weaponId !== q.sourceCardId) return 0; // only attacks with this weapon
      const subject = q.subject ?? q.owner;
      const cq = { attacker: q.attacker, defender: q.defender, attackKind: q.weaponId ? ("weapon" as const) : ("basic" as const) };
      if (!holds(a.condition, q.state, q.owner, cq)) return 0;
      return mods
        .filter((e) => e.kind === kind && targets(targetOf(e), q.owner, subject) && holds(e.when, q.state, q.owner, cq))
        .reduce((n, e) => n + e.amount, 0);
    };
    return {
      name: a.name,
      trigger: "continuous",
      modify,
      affectsOthers: mods.some((e) => targetOf(e) === "all" || targetOf(e) === "allOthers"),
      inEffect: (state, owner) => holds(a.condition, state, owner, { attacker: opp(owner), defender: opp(owner) }),
      describeNow: (state, owner, sourceCardId) => {
        // Ask as if the affected warrior were attacking (attack / damage) or attacked (defense) now.
        // One line per (value, whose) pair, with the total of the effects that apply right now.
        const groups = [...new Map(mods.map((e) => [`${e.kind}|${targetOf(e) ?? "self"}`, e])).values()];
        const parts = groups.flatMap((e) => {
          const target = targetOf(e);
          const subject = target === "allOthers" ? opp(owner) : owner;
          const asDefender = e.kind === "defenseRoll";
          const v = modify(e.kind, {
            state,
            owner,
            subject,
            attacker: asDefender ? opp(subject) : subject,
            defender: asDefender ? subject : opp(subject),
            weaponId: e.kind === "weaponDamage" ? sourceCardId : undefined,
            sourceCardId,
          });
          if (!v) return [];
          const whose = target === "all" ? " for all warriors" : target === "allOthers" ? " for all other warriors" : "";
          const what = e.kind === "speed" || e.kind === "experience" || e.kind.endsWith("Damage") ? MOD_TEXT[e.kind] : `to ${MOD_TEXT[e.kind]}`;
          return [`${v >= 0 ? "+" : ""}${v} ${what}${whose}`];
        });
        return parts.length ? parts.join(", ") : "condition not met";
      },
    };
  }
  const reroll = a.effects.find((e) => e.kind === "reroll");
  if (reroll || a.trigger === "attackRoll") {
    if (!reroll || a.trigger !== "attackRoll" || a.effects.length !== 1 || reroll.kind !== "reroll") {
      throw new Error(`${a.name}: a re-roll is the single effect of an attackRoll ability`);
    }
    const onSame = reroll.ifSame;
    return {
      name: a.name,
      trigger: "attackRoll",
      oncePerRound: a.usageLimit === "oncePerRound",
      canFire: (ctx) => holds(a.condition, ctx.state, ctx.owner, { attacker: ctx.attacker, defender: ctx.defender, attackKind: ctx.attackKind }),
      reroll: { onSame: onSame?.length ? (ctx) => onSame.map((e) => applyEffect(ctx, e, undefined)).join(", ") : undefined },
    };
  }
  const move = a.effects.find((e): e is Extract<EffectDef, { kind: "move" }> => e.kind === "move");
  // An Action's move without a roll is chosen with the action (ABILITY carries the destination);
  // any other move — after a roll, or in a reaction — is chosen when the ability resolves.
  const atAction = !!move && a.trigger === "action" && !a.roll;
  for (const e of a.effects) {
    if (isModifier(e) && e.kind !== "experience" && !isTimed(a.duration)) {
      throw new Error(`${a.name}: a ${a.trigger} ${e.kind} effect needs a timed duration (${TIMED.join(" / ")})`);
    }
  }
  if (move && !atAction && !CHOICE_TRIGGERS.includes(a.trigger)) throw new Error(`${a.name}: a ${a.trigger} ability can't move (moves are Action abilities, or chosen during an action or an attack)`);
  if (a.optional && !move) throw new Error(`${a.name}: "you may" is supported for moves`);
  const cq = (ctx: FireContext) => ({ attacker: ctx.attacker, defender: ctx.defender, attackKind: ctx.attackKind });
  const moveOpts = (ctx: FireContext, m: Extract<EffectDef, { kind: "move" }>) => {
    const mover = moverOf(ctx, m.who);
    if (mover === undefined) return [];
    return moveOptions(ctx.state, mover, m.spaces, { diagonal: m.diagonal, upTo: m.upTo, keepFacing: mover !== ctx.owner && !m.rotate });
  };
  return {
    name: a.name,
    trigger: a.trigger,
    oncePerRound: a.usageLimit === "oncePerRound",
    canFire: (ctx) =>
      holds(a.condition, ctx.state, ctx.owner, cq(ctx)) &&
      // an Action is offered only if one of its effects would apply
      (a.trigger !== "action" || a.effects.some((e) => holds(e.when, ctx.state, ctx.owner, cq(ctx)))) &&
      (!atAction || moveOpts(ctx, move!).length > 0),
    options: atAction ? (ctx) => moveOpts(ctx, move!) : undefined,
    fire: (ctx, params) => {
      const parts: string[] = [];
      if (a.roll) {
        const r = abilityRoll(ctx, a.roll);
        ctx.events.push({
          type: "abilityRolled",
          player: ctx.owner,
          cardId: ctx.cardId,
          cardName: ctx.cardName,
          ability: ctx.ability,
          dice: r.dice,
          total: r.total,
          cmp: a.roll.cmp,
          target: r.target,
          targetName: r.targetName,
          success: r.success,
        });
        if (!r.success) return `rolls ${r.total}: no effect`;
        parts.push(`rolls ${r.total}`);
      }
      for (const e of a.effects) {
        if (!holds(e.when, ctx.state, ctx.owner, cq(ctx))) continue;
        if (e.kind === "move" && !atAction) {
          const options = moveOpts(ctx, e);
          const mover = moverOf(ctx, e.who);
          if (!options.length || mover === undefined) {
            parts.push("no space to move");
            continue;
          }
          requestChoice(ctx.state, { player: ctx.owner, cardId: ctx.cardId, cardName: ctx.cardName, ability: ctx.ability, mover, options, optional: !!a.optional });
          const whom = mover === ctx.owner ? "" : ` ${ctx.state.warriors[mover].name}`;
          parts.push(a.optional ? `may move${whom}` : `moves${whom} (choosing where)`);
          continue;
        }
        parts.push(applyEffect(ctx, e, a.duration, params));
      }
      return parts.join(", ");
    },
  };
}

/** Human-readable summary of a data ability (for docs / UI). */
export function describeAbility(a: AbilityData): string {
  const parts = [a.trigger, a.condition ? describeCondition(a.condition) : "", a.usageLimit ?? "", a.duration ?? ""];
  return parts.filter(Boolean).join(" · ");
}

/** Register a card's implemented abilities (data or coded). */
export function defineCard(cardId: string, ...abilities: AbilityDef[]): void {
  REGISTRY[cardId] = abilities.map((d) => ("data" in d ? compileAbility(d.data) : d.coded));
}
