// The game spine: setup, round/turn loop, initiative, actions, win conditions.
// Pure: applyAction(state, action) -> { state, events }. No input mutation
// (state is structurally cloned), no I/O, randomness only via the seeded RNG.

import type {
  Action,
  ApplyResult,
  CardData,
  Facing,
  GameEvent,
  GameState,
  PlayerId,
  Position,
  Warrior,
} from "./types";
import { seedState, rollDie } from "./rng";
import { canMove, applyMove, applyRotate } from "./arena";
import { resolveAttack } from "./combat";

const ARENA = 4;
const MAX_ROUNDS = 5;

// Fixed starting cells (spine): players face each other down column 1.
const START: Record<PlayerId, { pos: Position; facing: Facing }> = {
  0: { pos: { row: 0, col: 1 }, facing: "S" },
  1: { pos: { row: 3, col: 1 }, facing: "N" },
};

function buildWarrior(card: CardData, playerId: PlayerId): Warrior {
  const s = START[playerId];
  return {
    playerId,
    cardId: card.id,
    name: card.name,
    position: { ...s.pos },
    facing: s.facing,
    life: card.life,
    speed: card.speed,
    experience: card.experience,
    damage: card.damage,
    attackGrid: { ...card.grid },
  };
}

export function currentWarrior(s: GameState): Warrior {
  return s.warriors[s.currentPlayer];
}
function opponentId(p: PlayerId): PlayerId {
  return (p === 0 ? 1 : 0) as PlayerId;
}

/** Initiative: higher Experience wins; equal -> unmodified dice-off. */
export function determineInitiative(
  warriors: readonly [Warrior, Warrior],
  rng: number,
): { initiative: PlayerId; rng: number } {
  if (warriors[0].experience !== warriors[1].experience) {
    return {
      initiative: warriors[0].experience > warriors[1].experience ? 0 : 1,
      rng,
    };
  }
  let s = rng;
  for (;;) {
    const a = rollDie(s);
    const b = rollDie(a.state);
    s = b.state;
    if (a.die !== b.die) return { initiative: a.die > b.die ? 0 : 1, rng: s };
  }
}

/** Begin a round in-place on `state`, appending events. */
function startRound(state: GameState, events: GameEvent[]): void {
  const init = determineInitiative(state.warriors, state.rng);
  state.rng = init.rng;
  state.initiative = init.initiative;
  state.turnOrder = [init.initiative, opponentId(init.initiative)];
  state.turnIndex = 0;
  state.currentPlayer = state.turnOrder[0];
  state.actionsRemaining = currentWarrior(state).speed;
  events.push({
    type: "roundStarted",
    round: state.round,
    initiative: state.initiative,
    turnOrder: state.turnOrder,
  });
  events.push({
    type: "turnStarted",
    player: state.currentPlayer,
    actions: state.actionsRemaining,
  });
}

/** Compute and record the end-of-game result (life / experience / draw). */
function endGame(state: GameState, events: GameEvent[]): void {
  const [a, b] = state.warriors;
  let winner: PlayerId | "draw";
  let reason: "life" | "experience" | "draw";
  if (a.life !== b.life) {
    winner = a.life > b.life ? 0 : 1;
    reason = "life";
  } else if (a.experience !== b.experience) {
    winner = a.experience > b.experience ? 0 : 1;
    reason = "experience";
  } else {
    winner = "draw";
    reason = "draw";
  }
  state.winner = winner;
  state.phase = "ended";
  events.push({ type: "gameEnded", winner, reason });
}

/** End the current turn and advance: next player, or next round, or game end. */
function endTurn(state: GameState, events: GameEvent[]): void {
  events.push({ type: "turnEnded", player: state.currentPlayer });
  if (state.turnIndex === 0) {
    state.turnIndex = 1;
    state.currentPlayer = state.turnOrder[1];
    state.actionsRemaining = currentWarrior(state).speed;
    events.push({
      type: "turnStarted",
      player: state.currentPlayer,
      actions: state.actionsRemaining,
    });
    return;
  }
  // both players have acted -> end of round
  events.push({ type: "roundEnded", round: state.round });
  if (state.round < state.maxRounds) {
    state.round += 1;
    startRound(state, events);
  } else {
    endGame(state, events); // both alive after round 5
  }
}

/** Create the starting game at round 1, ready for player one's first action. */
export function init(card0: CardData, card1: CardData, seed: number): ApplyResult {
  const warriors: [Warrior, Warrior] = [
    buildWarrior(card0, 0),
    buildWarrior(card1, 1),
  ];
  let rng = seedState(seed);
  // Setup roll decides who would place first (placement itself is fixed here).
  const a = rollDie(rng);
  const b = rollDie(a.state);
  rng = b.state;
  const firstPlacer: PlayerId = a.die >= b.die ? 0 : 1;

  const state: GameState = {
    phase: "playing",
    rng,
    seed,
    arenaSize: ARENA,
    warriors,
    round: 1,
    maxRounds: MAX_ROUNDS,
    turnOrder: [0, 1],
    turnIndex: 0,
    currentPlayer: 0,
    actionsRemaining: 0,
    initiative: null,
    winner: null,
  };

  const events: GameEvent[] = [{ type: "setup", firstPlacer }];
  startRound(state, events);
  return { state, events };
}

/** Apply one action for the current player. Illegal actions are no-ops
 *  (unchanged state, empty event list). */
export function applyAction(prev: GameState, action: Action): ApplyResult {
  if (prev.phase !== "playing") return { state: prev, events: [] };
  const state: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const me = state.currentPlayer;
  const foe = opponentId(me);

  switch (action.type) {
    case "PASS": {
      events.push({ type: "passed", player: me });
      endTurn(state, events);
      return { state, events };
    }
    case "MOVE": {
      if (state.actionsRemaining < 1) return { state: prev, events: [] };
      const chk = canMove(state.warriors, me, action.dir, state.arenaSize);
      if (!chk.ok) return { state: prev, events: [] };
      const from = { ...state.warriors[me].position };
      state.warriors[me] = applyMove(state.warriors[me], action.dir, action.facing);
      state.actionsRemaining -= 1;
      events.push({
        type: "moved",
        player: me,
        from,
        to: { ...state.warriors[me].position },
        facing: state.warriors[me].facing,
      });
      break;
    }
    case "ROTATE": {
      if (state.actionsRemaining < 1) return { state: prev, events: [] };
      state.warriors[me] = applyRotate(state.warriors[me], action.facing);
      state.actionsRemaining -= 1;
      events.push({ type: "rotated", player: me, facing: action.facing });
      break;
    }
    case "ATTACK": {
      if (state.actionsRemaining < 1) return { state: prev, events: [] };
      const r = resolveAttack(
        state.warriors[me],
        state.warriors[foe],
        state.rng,
        state.arenaSize,
      );
      if (!r.result.legal) return { state: prev, events: [] }; // not in grid -> no-op
      state.rng = r.rng;
      state.actionsRemaining -= 1;
      if (r.result.hit) state.warriors[foe].life -= r.result.damage;
      events.push({
        type: "attacked",
        attacker: me,
        defender: foe,
        attackerRoll: r.result.attackerRoll,
        defenderRoll: r.result.defenderRoll,
        gridMod: r.result.gridMod,
        attackerTotal: r.result.attackerTotal,
        hit: r.result.hit,
        crit: r.result.crit,
        damage: r.result.damage,
        tiebreak: r.result.tiebreak,
      });
      if (state.warriors[foe].life <= 0) {
        events.push({ type: "warriorDefeated", player: foe });
        state.winner = me;
        state.phase = "ended";
        events.push({ type: "gameEnded", winner: me, reason: "kill" });
        return { state, events };
      }
      break;
    }
  }

  // Turn auto-ends when the action budget is spent.
  if (state.actionsRemaining <= 0) endTurn(state, events);
  return { state, events };
}
