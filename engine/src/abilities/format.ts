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

import type { RuntimeAbility, Trigger } from "./types";
import { REGISTRY } from "./registry";
import { applyEffect, describeCondition, holds, type ConditionDef, type DurationDef, type EffectDef } from "./primitives";

export interface AbilityData {
  /** The ability's printed name (e.g. "Cura Dei"). */
  name: string;
  trigger: Trigger;
  condition?: ConditionDef;
  effects: EffectDef[];
  /** "once each round" (rulebook p18). */
  usageLimit?: "oncePerRound";
  /** For continuous abilities "permanent" (the default); for fired ones how long a roll / speed
   *  effect lasts. Life gain is instant and needs none. */
  duration?: DurationDef;
}

export type AbilityDef = { data: AbilityData } | { coded: RuntimeAbility };

/** Compile a data ability into the runtime's form. Throws on combinations the runtime can't do. */
export function compileAbility(a: AbilityData): RuntimeAbility {
  if (a.trigger === "continuous") {
    if (a.duration && a.duration !== "permanent") throw new Error(`${a.name}: continuous abilities are permanent`);
    if (a.usageLimit) throw new Error(`${a.name}: continuous abilities have no usage limit`);
    const bad = a.effects.find((e) => e.kind !== "attackRoll");
    if (bad) throw new Error(`${a.name}: continuous ${bad.kind} is not supported yet`);
    const amount = a.effects.reduce((n, e) => n + e.amount, 0);
    return {
      name: a.name,
      trigger: "continuous",
      attackRoll: (state, owner) => (holds(a.condition, state, owner) ? amount : 0),
      inEffect: (state, owner) => holds(a.condition, state, owner),
    };
  }
  for (const e of a.effects) {
    if (e.kind !== "gainLife" && a.duration !== "thisRound" && a.duration !== "nextTurn") {
      throw new Error(`${a.name}: a ${a.trigger} ${e.kind} effect needs duration thisRound or nextTurn`);
    }
  }
  return {
    name: a.name,
    trigger: a.trigger,
    oncePerRound: a.usageLimit === "oncePerRound",
    canFire: (ctx) => holds(a.condition, ctx.state, ctx.owner),
    fire: (ctx) => a.effects.map((e) => applyEffect(ctx, e, a.duration)).join(", "),
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
