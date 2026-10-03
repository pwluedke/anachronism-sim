// The game spine: setup, round/turn loop, initiative, actions, win conditions.
// Pure: applyAction(state, action) -> { state, events }. No input mutation
// (state is structurally cloned), no I/O, randomness only via the seeded RNG.

import type { Deck } from "./decks";
import type {
  Action,
  ApplyResult,
  CardData,
  Facing,
  GameEvent,
  GameState,
  PlayerCards,
  PlayerId,
  SupportSlot,
  Position,
  Warrior,
} from "./types";
import { seedState, rollDie, roll2d6 } from "./rng";
import { canMove, applyMove, applyRotate } from "./arena";
import { resolveAttack } from "./combat";
import * as Hooks from "./hooks";

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

export type InitiativeDecider = "initiative" | "experience" | "diceoff";

/** Initiative for a round (rulebook p10, p13): the higher initiative value on the support cards
 *  revealed this round goes first. A tie — including round 5 or a side with nothing revealed, where
 *  the value is null — goes to the higher Experience, then a dice-off (2d6 each, reroll ties). */
export function determineInitiative(
  warriors: readonly [Warrior, Warrior],
  rng: number,
  values: readonly [number | null, number | null] = [null, null],
): { initiative: PlayerId; rng: number; decidedBy: InitiativeDecider } {
  const [v0, v1] = values;
  if (v0 !== null && v1 !== null && v0 !== v1) {
    return { initiative: v0 > v1 ? 0 : 1, rng, decidedBy: "initiative" };
  }
  if (warriors[0].experience !== warriors[1].experience) {
    return { initiative: warriors[0].experience > warriors[1].experience ? 0 : 1, rng, decidedBy: "experience" };
  }
  let s = rng;
  for (;;) {
    const a = roll2d6(s);
    const b = roll2d6(a.state);
    s = b.state;
    if (a.sum !== b.sum) return { initiative: a.sum > b.sum ? 0 : 1, rng: s, decidedBy: "diceoff" };
  }
}

/** Both players simultaneously reveal their next face-down support card into play (rulebook p10).
 *  Returns what each player revealed this round (null when nothing was left, e.g. round 5). */
function revealRound(state: GameState, events: GameEvent[]): [SupportSlot | null, SupportSlot | null] {
  const revealed: [SupportSlot | null, SupportSlot | null] = [null, null];
  for (const p of [0, 1] as PlayerId[]) {
    const pc = state.cards[p];
    if (pc.nextReveal >= pc.support.length) continue;
    const slot = pc.support[pc.nextReveal];
    slot.status = "in-play";
    revealed[p] = slot;
    events.push({
      type: "revealed",
      player: p,
      slot: pc.nextReveal,
      cardId: slot.card.id,
      name: slot.card.name,
      cardType: slot.card.type,
      initiative: slot.card.initiative,
    });
    pc.nextReveal += 1;
  }
  return revealed;
}

/** Begin a round in-place on `state`, appending events. Rulebook order (p10): reveal, initiative,
 *  restrictions, Reveal abilities, then "start of round" effects. */
function startRound(state: GameState, events: GameEvent[]): void {
  const revealed = revealRound(state, events);
  const init = determineInitiative(state.warriors, state.rng, [
    revealed[0]?.card.initiative ?? null,
    revealed[1]?.card.initiative ?? null,
  ]);
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
    initiativeValues: [revealed[0]?.card.initiative ?? null, revealed[1]?.card.initiative ?? null],
    decidedBy: init.decidedBy,
  });
  Hooks.resolveHooks(state, "onReveal", { round: state.round });
  Hooks.resolveHooks(state, "onRoundStart", { round: state.round });
  events.push({
    type: "turnStarted",
    player: state.currentPlayer,
    actions: state.actionsRemaining,
  });
  Hooks.resolveHooks(state, "onTurnStart", { player: state.currentPlayer });
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
  Hooks.resolveHooks(state, "onTurnEnd", { player: state.currentPlayer });
  if (state.turnIndex === 0) {
    state.turnIndex = 1;
    state.currentPlayer = state.turnOrder[1];
    state.actionsRemaining = currentWarrior(state).speed;
    events.push({
      type: "turnStarted",
      player: state.currentPlayer,
      actions: state.actionsRemaining,
    });
    Hooks.resolveHooks(state, "onTurnStart", { player: state.currentPlayer });
    return;
  }
  // both players have acted -> end of round
  events.push({ type: "roundEnded", round: state.round });
  Hooks.resolveHooks(state, "onRoundEnd", { round: state.round });
  if (state.round < state.maxRounds) {
    state.round += 1;
    startRound(state, events);
  } else {
    endGame(state, events); // both alive after round 5
  }
}

/** A side is a full deck, or a bare warrior (a deck with no support cards — the warrior-only spine). */
export type Side = Deck | CardData;

function asDeck(side: Side): Deck {
  return "warrior" in side ? side : { id: side.id, warrior: side, support: [] };
}

function playerCards(deck: Deck): PlayerCards {
  return {
    deckId: deck.support.length ? deck.id : null,
    support: deck.support.map((card) => ({ card: structuredClone(card), status: "face-down" as const })),
    nextReveal: 0,
  };
}

/** Create the starting game at round 1, ready for player one's first action. Each side's support
 *  cards are placed face-down in the deck's order (index 0 = leftmost, revealed first). */
export function init(side0: Side, side1: Side, seed: number): ApplyResult {
  const decks = [asDeck(side0), asDeck(side1)] as const;
  const warriors: [Warrior, Warrior] = [
    buildWarrior(decks[0].warrior, 0),
    buildWarrior(decks[1].warrior, 1),
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
    cards: [playerCards(decks[0]), playerCards(decks[1])],
  };

  const events: GameEvent[] = [{ type: "setup", firstPlacer }];
  Hooks.resolveHooks(state, "onSetup", {});
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
      // legality (defender in grid) is checked inside resolveAttack; peek first
      // so an illegal attack is a true no-op (no hook noise, no RNG burn).
      const pre = resolveAttack(state.warriors[me], state.warriors[foe], state.rng, state.arenaSize);
      if (!pre.result.legal) return { state: prev, events: [] };

      Hooks.resolveHooks(state, "beforeAttackRoll", { attacker: me, defender: foe });
      const r = pre;
      Hooks.resolveHooks(state, "afterAttackRoll", { attacker: me, defender: foe, result: r.result });
      state.rng = r.rng;
      state.actionsRemaining -= 1;

      Hooks.resolveHooks(state, r.result.hit ? "onHit" : "onMiss", { attacker: me, defender: foe, result: r.result });
      if (r.result.hit && r.result.crit) {
        Hooks.resolveHooks(state, "onCriticalHit", { attacker: me, defender: foe, result: r.result });
      }
      Hooks.resolveHooks(state, "afterDefense", { attacker: me, defender: foe, result: r.result });

      if (r.result.hit) {
        state.warriors[foe].life -= r.result.damage;
        Hooks.resolveHooks(state, "onDamageDealt", { attacker: me, defender: foe, result: r.result });
      }
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
        Hooks.resolveHooks(state, "onWarriorDefeated", { player: foe });
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
