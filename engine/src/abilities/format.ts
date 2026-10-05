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
import { applyEffect, describeCondition, holds, moveOptions, type ConditionDef, type DurationDef, type EffectDef } from "./primitives";

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
}

export type AbilityDef = { data: AbilityData } | { coded: RuntimeAbility };

const MODIFIERS = ["attackRoll", "defenseRoll", "weaponDamage"] as const;
const isModifier = (e: EffectDef): e is EffectDef & { kind: ModKind; amount: number } =>
  (MODIFIERS as readonly string[]).includes(e.kind);

/** Compile a data ability into the runtime's form. Throws on combinations the runtime can't do. */
export function compileAbility(a: AbilityData): RuntimeAbility {
  if (a.trigger === "continuous") {
    if (a.duration && a.duration !== "permanent") throw new Error(`${a.name}: continuous abilities are permanent`);
    if (a.usageLimit) throw new Error(`${a.name}: continuous abilities have no usage limit`);
    const bad = a.effects.find((e) => !isModifier(e));
    if (bad) throw new Error(`${a.name}: continuous ${bad.kind} is not supported (continuous effects are modifiers)`);
    const mods = a.effects.filter(isModifier);
    const modify = (kind: ModKind, q: ModQuery): number => {
      if (kind === "weaponDamage" && q.weaponId !== q.sourceCardId) return 0; // only attacks with this weapon
      const cq = { attacker: q.attacker, defender: q.defender, attackKind: q.weaponId ? ("weapon" as const) : ("basic" as const) };
      if (!holds(a.condition, q.state, q.owner, cq)) return 0;
      return mods.filter((e) => e.kind === kind && holds(e.when, q.state, q.owner, cq)).reduce((n, e) => n + e.amount, 0);
    };
    return {
      name: a.name,
      trigger: "continuous",
      modify,
      inEffect: (state, owner) => holds(a.condition, state, owner, { attacker: opp(owner), defender: opp(owner) }),
      describeNow: (state, owner, sourceCardId) => {
        // Ask as if this player were attacking (attack / weapon) or attacked (defense) right now.
        const parts = MODIFIERS.flatMap((kind) => {
          if (!mods.some((e) => e.kind === kind)) return [];
          const asDefender = kind === "defenseRoll";
          const v = modify(kind, {
            state,
            owner,
            attacker: asDefender ? opp(owner) : owner,
            defender: asDefender ? owner : opp(owner),
            weaponId: kind === "weaponDamage" ? sourceCardId : undefined,
            sourceCardId,
          });
          const what = kind === "attackRoll" ? "to attack rolls" : kind === "defenseRoll" ? "to defense rolls" : "damage with this weapon";
          return v ? [`${v >= 0 ? "+" : ""}${v} ${what}`] : [];
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
  for (const e of a.effects) {
    if (e.kind === "weaponDamage") throw new Error(`${a.name}: weaponDamage is only a continuous modifier`);
    if (e.kind === "move" && a.trigger !== "action") throw new Error(`${a.name}: a move is an Action ability`);
    if ((e.kind === "attackRoll" || e.kind === "defenseRoll" || e.kind === "speed") && a.duration !== "thisRound" && a.duration !== "nextTurn") {
      throw new Error(`${a.name}: a ${a.trigger} ${e.kind} effect needs duration thisRound or nextTurn`);
    }
  }
  const move = a.effects.find((e) => e.kind === "move");
  const cq = (ctx: FireContext) => ({ attacker: ctx.attacker, defender: ctx.defender, attackKind: ctx.attackKind });
  return {
    name: a.name,
    trigger: a.trigger,
    oncePerRound: a.usageLimit === "oncePerRound",
    canFire: (ctx) => holds(a.condition, ctx.state, ctx.owner, cq(ctx)) && (!move || moveOptions(ctx.state, ctx.owner, move.spaces).length > 0),
    options: move && move.kind === "move" ? (ctx) => moveOptions(ctx.state, ctx.owner, move.spaces) : undefined,
    fire: (ctx, params) =>
      a.effects
        .filter((e) => holds(e.when, ctx.state, ctx.owner, cq(ctx)))
        .map((e) => applyEffect(ctx, e, a.duration, params))
        .join(", "),
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
