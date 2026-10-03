// The building blocks data-authored abilities are made of: conditions and effects. Each is a
// small pure function over the engine's working state. Add new primitives here as card batches
// need them.

import type { GameState, PlayerId } from "../types";
import type { SupportType } from "../decks";
import { inPlay } from "../cards";
import type { FireContext } from "./types";

// ---- Conditions ----------------------------------------------------------------------------------

export type ConditionDef =
  /** "while you have an <type> in play" */
  | { kind: "hasInPlay"; cardType: SupportType }
  /** "if you lose initiative" (this round) */
  | { kind: "lostInitiative" };

export function holds(cond: ConditionDef | undefined, state: GameState, owner: PlayerId): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case "hasInPlay":
      return inPlay(state, owner).some((s) => s.card.type === cond.cardType);
    case "lostInitiative":
      return state.initiative !== null && state.initiative !== owner;
  }
}

export function describeCondition(cond: ConditionDef): string {
  switch (cond.kind) {
    case "hasInPlay":
      return `while ${cond.cardType === "inspiration" ? "an" : "a"} ${cond.cardType} is in play`;
    case "lostInitiative":
      return "on losing initiative";
  }
}

// ---- Effects -------------------------------------------------------------------------------------

export type EffectDef =
  /** "Your attack rolls gain +N" */
  | { kind: "attackRoll"; amount: number }
  /** "gain N life" */
  | { kind: "gainLife"; amount: number }
  /** "gain +N speed" */
  | { kind: "speed"; amount: number };

/** permanent: while the card is in play (continuous). thisRound / nextTurn: a timed effect. */
export type DurationDef = "permanent" | "thisRound" | "nextTurn";

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Apply a one-off effect when an ability fires. Returns a description for the log. */
export function applyEffect(ctx: FireContext, effect: EffectDef, duration: DurationDef | undefined): string {
  const { state, owner } = ctx;
  switch (effect.kind) {
    case "gainLife":
      state.warriors[owner].life += effect.amount;
      return `gains ${effect.amount} life`;
    case "attackRoll":
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
      const what = effect.kind === "attackRoll" ? "to attack rolls" : "speed";
      return `${signed(effect.amount)} ${what} ${duration === "thisRound" ? "this round" : "on the next turn"}`;
    }
  }
}
