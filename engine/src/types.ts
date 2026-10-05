// Core types for the headless 1v1 Anachronism engine.
import type { SupportCard } from "./decks";
import type { TimedEffect } from "./abilities/types";
// GameState is fully serializable: plain objects / arrays / primitives only.

export type PlayerId = 0 | 1;

/** Orthogonal facing. The card's attack grid is rotated to match. */
export type Facing = "N" | "E" | "S" | "W";

export interface Position {
  row: number; // 0..3, increases "downward" (toward player 1's start row 3)
  col: number; // 0..3, increases "rightward"
}

/**
 * Card attack grid as stored in the card schema: a flat 12-key object,
 * keys "1A".."4C". Each value is a modifier string (e.g. "+1", "-1", "+0"),
 * the literal "marker" (the warrior's own cell, always "3B"), or null (empty).
 * `null` (not an object) means the card has no grid (support cards — out of
 * scope for the spine; warriors always have one).
 */
export type AttackGrid = Record<string, string | null>;

/** The subset of card data the engine consumes (see docs/SCHEMA.md). */
export interface CardData {
  id: string;
  name: string;
  life: number;
  speed: number;
  experience: number;
  damage: number;
  grid: AttackGrid;
  /** Printed ability text (display only; mechanics live in abilities/). */
  abilities?: { name: string; type: string; text: string }[];
  /** Element (Fire, Water, Earth, Wind, Wood, Metal, Aether), if known. */
  element?: string;
  /** Culture(s), e.g. ["Greek"]; pirate-set warriors can have two. */
  cultures?: string[];
  /** Printed traits, e.g. ["Male", "Cavalry"]. */
  traits?: string[];
}

export interface Warrior {
  playerId: PlayerId;
  cardId: string;
  name: string;
  position: Position;
  facing: Facing;
  life: number; // mutable current life
  speed: number;
  experience: number;
  damage: number; // base attack damage
  attackGrid: AttackGrid; // canonical (marker at 3B), rotated on projection
  element?: string;
  cultures?: string[];
  traits?: string[];
}

export type Phase = "setup" | "playing" | "ended";

// ---- Support cards ----------------------------------------------------------
export type SupportStatus = "face-down" | "in-play" | "discarded";

export interface SupportSlot {
  card: SupportCard;
  status: SupportStatus;
}

/** One player's support cards: placed face-down left to right; slot `nextReveal` is revealed next. */
export interface PlayerCards {
  deckId: string | null;
  support: SupportSlot[];
  /** Index of the next face-down slot to reveal (== support.length once all are revealed). */
  nextReveal: number;
}
export type Winner = PlayerId | "draw" | null;

export interface GameState {
  phase: Phase;
  /** Seeded-RNG state (a 32-bit integer advanced purely on each draw). */
  rng: number;
  seed: number;
  arenaSize: number; // 4
  warriors: [Warrior, Warrior]; // index === playerId

  round: number; // 1..5
  maxRounds: number; // 5
  /** Order of play for the current round: [first, second] player ids. */
  turnOrder: [PlayerId, PlayerId];
  /** Index into turnOrder of the player currently taking their turn. */
  turnIndex: 0 | 1;
  currentPlayer: PlayerId;
  actionsRemaining: number; // resets to the active warrior's speed each turn
  /** Initiative winner for the current round (acts first). */
  initiative: PlayerId | null;

  winner: Winner;

  /** Each player's support cards (index === playerId). A warrior-only game has none. */
  cards: [PlayerCards, PlayerCards];
  /** Weapons (card ids) the current player has attacked with this turn: one attack per weapon. */
  weaponsUsed: string[];
  /**
   * A card restriction to resolve before the round's first turn (rulebook p14): each queued player,
   * in initiative order, discards offending in-play cards until legal. currentPlayer is queue[0].
   */
  pending: PendingDiscard | PendingReroll | null;

  // ---- Card abilities --------------------------------------------------------------------------
  /** Timed effects abilities created (e.g. "+1 to attack rolls this round"). */
  effects: TimedEffect[];
  /** "cardId#ability" keys of once-per-round abilities used this round. */
  abilityUses: string[];
  /** Card id each player revealed this round (null: none) — only these fire Reveal abilities. */
  revealedThisRound: [string | null, string | null];
  /** The current player's warrior has changed spaces this turn (a move action or an ability move). */
  movedThisTurn: boolean;
}

/** An attack whose dice are rolled but not yet judged (an optional re-roll is being decided). */
export interface PendingAttack {
  attacker: PlayerId;
  defender: PlayerId;
  /** The weapon used, or undefined for a basic attack. */
  weapon?: string;
  /** Base damage of the attack (the weapon's, or the warrior's for a basic attack). */
  baseDamage: number;
  gridMod: number;
  attackerDice: [number, number];
  defenderDice: [number, number];
}
export interface PendingDiscard {
  kind: "discard";
  queue: PlayerId[];
}
/** The attacker may use an optional re-roll ability on this attack roll (rulebook p12: decided
 *  after both rolls are seen). currentPlayer is the attacker. */
export interface PendingReroll {
  kind: "reroll";
  attack: PendingAttack;
  cardId: string;
  cardName: string;
  ability: string;
}

// ---- Actions -------------------------------------------------------------
export type ActionType = Action["type"];

export interface MoveAction {
  type: "MOVE";
  dir: Facing; // step one cell in this direction
  facing?: Facing; // optional FREE rotate performed with the move
}
export interface RotateAction {
  type: "ROTATE";
  facing: Facing;
}
export interface AttackAction {
  type: "ATTACK";
  // target is implicit: the only opponent (1v1).
  /** Id of an in-play weapon to attack with; omitted for a basic attack (warrior grid + damage). */
  weapon?: string;
}
export interface PassAction {
  type: "PASS";
}
/** Discard an in-play support card to resolve a card restriction (only while one is pending). */
export interface DiscardAction {
  type: "DISCARD";
  card: string;
}
/** Use an Action ability of one of your cards (costs one action). */
export interface AbilityAction {
  type: "ABILITY";
  card: string;
  ability: string;
  /** For abilities that take a choice, e.g. where an ability move ends and the facing after it. */
  to?: Position;
  facing?: Facing;
}
/** While a re-roll is pending: re-roll one die of the attack roll (0 or 1)… */
export interface RerollAction {
  type: "REROLL";
  die: 0 | 1;
}
/** …or keep the roll as it is (the ability is optional). */
export interface KeepAction {
  type: "KEEP";
}
export type Action =
  | MoveAction
  | RotateAction
  | AttackAction
  | PassAction
  | DiscardAction
  | AbilityAction
  | RerollAction
  | KeepAction;

// ---- Events (for UI / replay / bots) ------------------------------------
export interface MovedEvent {
  type: "moved";
  player: PlayerId;
  from: Position;
  to: Position;
  facing: Facing;
}
export interface RotatedEvent {
  type: "rotated";
  player: PlayerId;
  facing: Facing;
}
export interface AttackedEvent {
  type: "attacked";
  attacker: PlayerId;
  defender: PlayerId;
  attackerRoll: number; // raw 2d6 sum
  defenderRoll: number;
  gridMod: number; // modifier from the defender's cell in the attacker's grid
  rollBonus: number; // bonus from card abilities
  attackerTotal: number; // attackerRoll + gridMod + rollBonus
  defenseBonus: number; // defender's bonus from card abilities
  defenderTotal: number; // defenderRoll + defenseBonus
  damageBonus: number; // extra damage from abilities (e.g. a weapon's)
  hit: boolean;
  crit: boolean;
  damage: number; // damage dealt (0 on miss)
  tiebreak?: "experience" | "diceoff" | null;
  /** The weapon used, or null for a basic attack. */
  weapon: { id: string; name: string } | null;
}
export interface TurnStartedEvent {
  type: "turnStarted";
  player: PlayerId;
  actions: number;
}
export interface TurnEndedEvent {
  type: "turnEnded";
  player: PlayerId;
}
export interface RoundStartedEvent {
  type: "roundStarted";
  round: number;
  initiative: PlayerId;
  turnOrder: [PlayerId, PlayerId];
  /** Initiative values of the cards each player revealed this round (null: none / round 5). */
  initiativeValues: [number | null, number | null];
  decidedBy: "initiative" | "experience" | "diceoff";
}
export interface RoundEndedEvent {
  type: "roundEnded";
  round: number;
}
export interface WarriorDefeatedEvent {
  type: "warriorDefeated";
  player: PlayerId;
}
export interface GameEndedEvent {
  type: "gameEnded";
  winner: Winner;
  reason: "kill" | "life" | "experience" | "draw";
}
export interface SetupEvent {
  type: "setup";
  firstPlacer: PlayerId;
}
export interface RevealedEvent {
  type: "revealed";
  player: PlayerId;
  /** Face-down slot index the card came from (0 = leftmost). */
  slot: number;
  cardId: string;
  name: string;
  cardType: SupportCard["type"];
  initiative: number | null;
}
export interface DiscardRequiredEvent {
  type: "discardRequired";
  player: PlayerId;
  /** Human-readable restriction(s) broken, e.g. "3 hands (max 2)". */
  reasons: string[];
  /** In-play card ids the player may discard. */
  offending: string[];
}
export interface DiscardedEvent {
  type: "discarded";
  player: PlayerId;
  cardId: string;
  name: string;
}
export interface AbilityFiredEvent {
  type: "abilityFired";
  player: PlayerId;
  cardId: string;
  cardName: string;
  ability: string;
  /** What happened, e.g. "gains 1 life", "+1 to attack rolls this round". */
  effect: string;
}
/** Both attack dice are rolled and an optional re-roll is on offer to the attacker. */
export interface AttackRolledEvent {
  type: "attackRolled";
  attacker: PlayerId;
  defender: PlayerId;
  attackerDice: [number, number];
  defenderDice: [number, number];
  /** The ability offering the re-roll. */
  cardName: string;
  ability: string;
}
export interface RerolledEvent {
  type: "rerolled";
  player: PlayerId;
  die: 0 | 1;
  from: number;
  to: number;
  cardName: string;
  ability: string;
}
export interface PassedEvent {
  type: "passed";
  player: PlayerId;
}

export type GameEvent =
  | SetupEvent
  | MovedEvent
  | RotatedEvent
  | AttackedEvent
  | PassedEvent
  | RevealedEvent
  | AbilityFiredEvent
  | AttackRolledEvent
  | RerolledEvent
  | DiscardRequiredEvent
  | DiscardedEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | RoundStartedEvent
  | RoundEndedEvent
  | WarriorDefeatedEvent
  | GameEndedEvent;

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
