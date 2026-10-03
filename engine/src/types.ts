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
  pending: { kind: "discard"; queue: PlayerId[] } | null;

  // ---- Card abilities --------------------------------------------------------------------------
  /** Timed effects abilities created (e.g. "+1 to attack rolls this round"). */
  effects: TimedEffect[];
  /** "cardId#ability" keys of once-per-round abilities used this round. */
  abilityUses: string[];
  /** Card id each player revealed this round (null: none) — only these fire Reveal abilities. */
  revealedThisRound: [string | null, string | null];
}

// ---- Actions -------------------------------------------------------------
export type ActionType = "MOVE" | "ROTATE" | "ATTACK" | "PASS" | "DISCARD" | "ABILITY";

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
}
export type Action = MoveAction | RotateAction | AttackAction | PassAction | DiscardAction | AbilityAction;

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
