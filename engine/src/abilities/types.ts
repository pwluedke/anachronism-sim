// Ability runtime types. Every ability — whether authored as data (see format.ts) or hand-coded —
// becomes a RuntimeAbility, which is all the runtime ever sees.

import type { Facing, GameEvent, GameState, PlayerId, Position } from "../types";

/** When an ability acts. "continuous" abilities are always on (while their card is in play) and are
 *  read when a value is needed (e.g. an attack roll); the others fire at a moment. */
export type Trigger =
  | "continuous"
  | "gameStart" // once, at setup, after warriors are placed (before round 1)
  | "reveal"
  | "roundStart"
  | "damageDealt" // the attacker, after their attack dealt damage
  | "hit" // the defender, after they were hit and took damage
  | "missed" // the defender, after an attack against them missed
  | "attackRoll" // the attacker, once both attack dice are rolled (optional re-rolls)
  | "action";

/** What kind of attack an attack-related trigger is about. */
export type AttackKind = "basic" | "weapon";

/** A timed effect an ability left behind. It outlives its card (rulebook p17: an effect with a listed
 *  duration continues even if the card that created it leaves play). */
export interface TimedEffect {
  owner: PlayerId;
  /** Card id + name of the source, for display. */
  source: string;
  sourceName: string;
  ability: string;
  kind: "attackRoll" | "defenseRoll" | "speed";
  amount: number;
  /** thisRound: until the round ends. nextTurn: the owner's next turn only. */
  duration: "thisRound" | "nextTurn";
  /** nextTurn effects are created pending and become active when the owner's next turn starts. */
  active: boolean;
}

/** What a firing ability can see and do. Mutates the engine's working copy of the state. */
export interface FireContext {
  state: GameState;
  owner: PlayerId;
  cardId: string;
  cardName: string;
  ability: string;
  events: GameEvent[];
  /** Hook-specific facts for attack triggers. */
  attacker?: PlayerId;
  defender?: PlayerId;
  attackKind?: AttackKind;
}

/** The values continuous abilities can modify. */
export type ModKind = "attackRoll" | "defenseRoll" | "weaponDamage";

/** The attack a modifier is being asked about. `owner` is the ability's owner (the attacker for
 *  attack-roll and weapon-damage modifiers, the defender for defense-roll modifiers). */
export interface ModQuery {
  state: GameState;
  owner: PlayerId;
  attacker: PlayerId;
  defender: PlayerId;
  /** The weapon the attack is made with (undefined: a basic attack). */
  weaponId?: string;
  /** The card the ability is on. */
  sourceCardId: string;
}

/** Choices an Action ability takes, e.g. where an ability move ends and the facing after it. */
export interface AbilityParams {
  to: Position;
  facing: Facing;
}

export interface RuntimeAbility {
  name: string;
  trigger: Trigger;
  /** "Once per round" (rulebook p18). */
  oncePerRound?: boolean;
  /** Event / action abilities: may this fire now? (conditions) */
  canFire?(ctx: FireContext): boolean;
  /** Event / action abilities: apply the effect(s). Returns a short description for the log. */
  fire?(ctx: FireContext, params?: AbilityParams): string;
  /** Action abilities that need a choice (e.g. a move): every legal choice right now. */
  options?(ctx: FireContext): AbilityParams[];
  /** attackRoll abilities: an OPTIONAL re-roll of one attack die; `onSame` runs when the new die
   *  equals the old one. Offered to the attacker as a choice, never applied automatically. */
  reroll?: { onSame?(ctx: FireContext): string };
  /** Continuous abilities: this ability's current contribution to a modifier. */
  modify?(kind: ModKind, q: ModQuery): number;
  /** Continuous abilities: is the ability currently in effect, and what it's doing (for display)? */
  inEffect?(state: GameState, owner: PlayerId): boolean;
  describeNow?(state: GameState, owner: PlayerId, sourceCardId: string): string;
}

/** Card id -> its implemented abilities. Cards without an entry are inert. */
export type AbilityRegistry = Record<string, RuntimeAbility[]>;
