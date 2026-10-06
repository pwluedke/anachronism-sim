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
  PendingAttack,
  PendingReroll,
  PlayerCards,
  PlayerId,
  SupportSlot,
  Position,
  Warrior,
} from "./types";
import { seedState, rollDie, roll2d6 } from "./rng";
import { canMove, applyMove, applyRotate } from "./arena";
import { judge } from "./combat";
import { modifierAt } from "./projection";
import * as Hooks from "./hooks";
import { armedAttacker, offendingCards, violations } from "./cards";
import {
  attackRollBonus,
  beginTurnEffects,
  defenseRollBonus,
  resolveReroll,
  usableReroll,
  useActionAbility,
  spendNextAttackEffects,
  damageBonus,
  continuousSpeed,
} from "./abilities/runtime";
import "./abilities/cards"; // registers the implemented card abilities

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
    element: card.element,
    cultures: card.cultures ? [...card.cultures] : [],
    traits: card.traits ? [...card.traits] : [],
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
  state.revealedThisRound = [null, null];
  for (const p of [0, 1] as PlayerId[]) {
    const pc = state.cards[p];
    if (pc.nextReveal >= pc.support.length) continue;
    const slot = pc.support[pc.nextReveal];
    slot.status = "in-play";
    revealed[p] = slot;
    state.revealedThisRound[p] = slot.card.id;
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
  events.push({
    type: "roundStarted",
    round: state.round,
    initiative: state.initiative,
    turnOrder: state.turnOrder,
    initiativeValues: [revealed[0]?.card.initiative ?? null, revealed[1]?.card.initiative ?? null],
    decidedBy: init.decidedBy,
  });
  // Card restrictions are checked after initiative, before Reveal abilities (p14).
  const queue = state.turnOrder.filter((p) => violations(state, p).length > 0);
  if (queue.length) {
    state.pending = { kind: "discard", queue };
    requestDiscard(state, events);
    return;
  }
  beginFirstTurn(state, events);
}

const discardQueue = (state: GameState): PlayerId[] => (state.pending?.kind === "discard" ? state.pending.queue : []);

/** Hand the pending discard to the first queued player. */
function requestDiscard(state: GameState, events: GameEvent[]): void {
  const p = discardQueue(state)[0];
  state.currentPlayer = p;
  state.actionsRemaining = 0;
  events.push({
    type: "discardRequired",
    player: p,
    reasons: violations(state, p).map((v) => v.detail),
    offending: offendingCards(state, p).map((s) => s.card.id),
  });
}

/** A warrior's speed for a turn starting now: printed speed + continuous speed abilities
 *  (timed speed effects are added by beginTurnEffects). */
function turnSpeed(state: GameState, p: PlayerId): number {
  return state.warriors[p].speed + continuousSpeed(state, p);
}

/** Finish round start once cards are legal: Reveal abilities, start-of-round effects, first turn. */
function beginFirstTurn(state: GameState, events: GameEvent[]): void {
  state.pending = null;
  state.turnIndex = 0;
  state.currentPlayer = state.turnOrder[0];
  state.weaponsUsed = [];
  Hooks.resolveHooks(state, "onReveal", { round: state.round, events });
  Hooks.resolveHooks(state, "onRoundStart", { round: state.round, events });
  if (endIfDefeated(state, events)) return;
  state.movedThisTurn = false;
  state.actionsRemaining = turnSpeed(state, state.currentPlayer) + beginTurnEffects(state, state.currentPlayer);
  events.push({
    type: "turnStarted",
    player: state.currentPlayer,
    actions: state.actionsRemaining,
  });
  Hooks.resolveHooks(state, "onTurnStart", { player: state.currentPlayer });
}

/** Resolve one DISCARD while a restriction is pending. Illegal discards are no-ops. */
function applyDiscard(prev: GameState, action: Action): ApplyResult {
  if (action.type !== "DISCARD") return { state: prev, events: [] };
  const p = prev.currentPlayer;
  if (!offendingCards(prev, p).some((s) => s.card.id === action.card)) return { state: prev, events: [] };
  const state: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const slot = state.cards[p].support.find((s) => s.card.id === action.card)!;
  slot.status = "discarded";
  events.push({ type: "discarded", player: p, cardId: slot.card.id, name: slot.card.name });
  if (violations(state, p).length === 0) discardQueue(state).shift();
  if (discardQueue(state).length) requestDiscard(state, events);
  else beginFirstTurn(state, events);
  return { state, events };
}

/** End the game if a warrior is at 0 life or below — after an attack, or after ability damage
 *  (abilities can deal damage outside attacks, e.g. at the start of the game). Returns true if ended. */
function endIfDefeated(state: GameState, events: GameEvent[]): boolean {
  if (state.phase !== "playing") return true;
  const fallen = ([0, 1] as PlayerId[]).filter((p) => state.warriors[p].life <= 0);
  if (!fallen.length) return false;
  for (const p of fallen) {
    Hooks.resolveHooks(state, "onWarriorDefeated", { player: p });
    events.push({ type: "warriorDefeated", player: p });
  }
  const winner: PlayerId | "draw" = fallen.length === 2 ? "draw" : opponentId(fallen[0]);
  state.winner = winner;
  state.phase = "ended";
  events.push({ type: "gameEnded", winner, reason: winner === "draw" ? "draw" : "kill" });
  return true;
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
  Hooks.resolveHooks(state, "onTurnEnd", { player: state.currentPlayer, events });
  if (state.turnIndex === 0) {
    state.turnIndex = 1;
    state.currentPlayer = state.turnOrder[1];
    state.movedThisTurn = false;
    state.actionsRemaining = turnSpeed(state, state.currentPlayer) + beginTurnEffects(state, state.currentPlayer);
    state.weaponsUsed = [];
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
  Hooks.resolveHooks(state, "onRoundEnd", { round: state.round, events });
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
    weaponsUsed: [],
    pending: null,
    effects: [],
    abilityUses: [],
    revealedThisRound: [null, null],
    movedThisTurn: false,
  };

  const events: GameEvent[] = [{ type: "setup", firstPlacer }];
  Hooks.resolveHooks(state, "onSetup", { events });
  if (endIfDefeated(state, events)) return { state, events };
  startRound(state, events);
  return { state, events };
}

/** Judge an attack from its (final) dice and apply the outcome: log, hit/miss hooks, damage, defeat.
 *  Returns true if the game ended. */
function finishAttack(state: GameState, pa: PendingAttack, events: GameEvent[]): boolean {
  const me = pa.attacker;
  const foe = pa.defender;
  const attacker = { ...state.warriors[me], damage: pa.baseDamage };
  const r = judge(
    pa.attackerDice,
    pa.defenderDice,
    pa.gridMod,
    attacker,
    state.warriors[foe],
    state.rng,
    attackRollBonus(state, me, pa.weapon),
    defenseRollBonus(state, foe, pa.weapon),
    damageBonus(state, me, pa.weapon),
  );
  state.rng = r.rng;
  spendNextAttackEffects(state, me); // "your next attack" bonuses applied to this one (p17)
  Hooks.resolveHooks(state, "afterAttackRoll", { attacker: me, defender: foe, result: r.result });
  const weaponSlot = pa.weapon ? state.cards[me].support.find((s) => s.card.id === pa.weapon) : undefined;
  // Logged as soon as the dice are resolved, so abilities it triggers are logged after it.
  events.push({
    type: "attacked",
    attacker: me,
    defender: foe,
    attackerRoll: r.result.attackerRoll,
    defenderRoll: r.result.defenderRoll,
    gridMod: r.result.gridMod,
    rollBonus: r.result.rollBonus,
    attackerTotal: r.result.attackerTotal,
    defenseBonus: r.result.defenseBonus,
    defenderTotal: r.result.defenderTotal,
    damageBonus: r.result.damageBonus,
    hit: r.result.hit,
    crit: r.result.crit,
    damage: r.result.damage,
    tiebreak: r.result.tiebreak,
    weapon: weaponSlot ? { id: weaponSlot.card.id, name: weaponSlot.card.name } : null,
  });
  const attackKind = pa.weapon ? "weapon" : "basic";
  Hooks.resolveHooks(state, r.result.hit ? "onHit" : "onMiss", { attacker: me, defender: foe, result: r.result, events, attackKind });
  if (r.result.hit && r.result.crit) {
    Hooks.resolveHooks(state, "onCriticalHit", { attacker: me, defender: foe, result: r.result });
  }
  Hooks.resolveHooks(state, "afterDefense", { attacker: me, defender: foe, result: r.result });
  if (r.result.hit) {
    state.warriors[foe].life -= r.result.damage;
    Hooks.resolveHooks(state, "onDamageDealt", { attacker: me, defender: foe, result: r.result, events, attackKind });
  }
  return endIfDefeated(state, events);
}

/** While an optional re-roll is pending: REROLL a die, or KEEP the roll; then finish the attack. */
function applyReroll(prev: GameState, action: Action): ApplyResult {
  if (prev.pending?.kind !== "reroll") return { state: prev, events: [] };
  if (action.type !== "KEEP" && !(action.type === "REROLL" && (action.die === 0 || action.die === 1))) {
    return { state: prev, events: [] };
  }
  const state: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const pending = state.pending as PendingReroll;
  const pa = pending.attack;
  state.pending = null;
  if (action.type === "REROLL") {
    const old = pa.attackerDice[action.die];
    const roll = rollDie(state.rng);
    state.rng = roll.state;
    pa.attackerDice[action.die] = roll.die;
    events.push({ type: "rerolled", player: pa.attacker, die: action.die, from: old, to: roll.die, cardName: pending.cardName, ability: pending.ability });
    const info = { attacker: pa.attacker, defender: pa.defender, attackKind: pa.weapon ? ("weapon" as const) : ("basic" as const) };
    resolveReroll(state, pa.attacker, pending, roll.die === old, events, info);
    if (endIfDefeated(state, events)) return { state, events };
  }
  if (finishAttack(state, pa, events)) return { state, events };
  if (state.actionsRemaining <= 0) endTurn(state, events);
  return { state, events };
}

/** Apply one action for the current player. Illegal actions are no-ops
 *  (unchanged state, empty event list). */
export function applyAction(prev: GameState, action: Action): ApplyResult {
  if (prev.phase !== "playing") return { state: prev, events: [] };
  if (prev.pending?.kind === "discard") return applyDiscard(prev, action);
  if (prev.pending?.kind === "reroll") return applyReroll(prev, action);
  const state: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const me = state.currentPlayer;
  const foe = opponentId(me);

  switch (action.type) {
    case "DISCARD":
    case "REROLL":
    case "KEEP":
      return { state: prev, events: [] }; // only meaningful while that decision is pending
    case "ABILITY": {
      if (state.actionsRemaining < 1) return { state: prev, events: [] };
      const params = action.to && action.facing ? { to: action.to, facing: action.facing } : undefined;
      if (!useActionAbility(state, me, action.card, action.ability, events, params)) return { state: prev, events: [] };
      state.actionsRemaining -= 1;
      if (endIfDefeated(state, events)) return { state, events };
      break;
    }
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
      state.movedThisTurn = true;
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
      // Legality (defender in the attacking grid) is checked before anything happens, so an illegal
      // attack is a true no-op (no hook noise, no RNG burn).
      const attacker = armedAttacker(state, me, action.weapon);
      if (!attacker) return { state: prev, events: [] };
      const gridMod = modifierAt(attacker.attackGrid, attacker.position, attacker.facing, state.warriors[foe].position, state.arenaSize);
      if (gridMod === null) return { state: prev, events: [] };
      if (action.weapon) state.weaponsUsed.push(action.weapon);

      Hooks.resolveHooks(state, "beforeAttackRoll", { attacker: me, defender: foe });
      const a = roll2d6(state.rng);
      const d = roll2d6(a.state);
      state.rng = d.state;
      state.actionsRemaining -= 1;
      const attack: PendingAttack = {
        attacker: me,
        defender: foe,
        weapon: action.weapon,
        baseDamage: attacker.damage,
        gridMod,
        attackerDice: a.dice,
        defenderDice: d.dice,
      };
      // An optional re-roll ability (e.g. Subedei) is offered once both rolls are seen (p12).
      const info = { attacker: me, defender: foe, attackKind: action.weapon ? ("weapon" as const) : ("basic" as const) };
      const rr = usableReroll(state, me, info);
      if (rr) {
        state.pending = { kind: "reroll", attack, ...rr };
        events.push({ type: "attackRolled", attacker: me, defender: foe, attackerDice: a.dice, defenderDice: d.dice, cardName: rr.cardName, ability: rr.ability });
        return { state, events };
      }
      if (finishAttack(state, attack, events)) return { state, events };
      break;
    }
  }

  // Turn auto-ends when the action budget is spent.
  if (state.actionsRemaining <= 0) endTurn(state, events);
  return { state, events };
}
