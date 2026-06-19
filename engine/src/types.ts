// Core types for the headless 1v1 Anachronism engine (Milestone 4 spine).
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
}

// ---- Actions -------------------------------------------------------------
export type ActionType = "MOVE" | "ROTATE" | "ATTACK" | "PASS";

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
  // target is implicit: the only opponent (1v1). Kept explicit-free for clarity.
}
export interface PassAction {
  type: "PASS";
}
export type Action = MoveAction | RotateAction | AttackAction | PassAction;

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
  attackerTotal: number; // attackerRoll + gridMod
  hit: boolean;
  crit: boolean;
  damage: number; // damage dealt (0 on miss)
  tiebreak?: "experience" | "diceoff" | null;
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
