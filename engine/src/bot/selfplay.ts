// Bot-vs-bot self-play: drives init() to a terminal state with chooseAction on both sides.
// Doubles as an engine stress test: every chosen action is checked against getLegalActions
// and every game must end within MAX_SELFPLAY_ACTIONS.

import type { CardData, GameEvent, PlayerId, Winner } from "../types";
import { init, applyAction } from "../engine";
import { getLegalActions } from "../legal";
import { FIXTURES } from "../../fixtures/warriors";
import { chooseAction } from "./choose";
import type { Difficulty } from "./config";

/** 5 rounds x 2 turns x a few actions is ~30-40; anything near this bound is a loop. */
export const MAX_SELFPLAY_ACTIONS = 500;

export interface SelfPlayResult {
  winner: Winner;
  reason: "kill" | "life" | "experience" | "draw";
  events: GameEvent[];
  /** Turns started over the whole game. */
  turns: number;
  /** Actions chosen by the bots (all verified legal). */
  actions: number;
}

/** Each side's botSeed, derived from the game seed so a batch is reproducible from its seeds. */
export function botSeeds(seed: number): [number, number] {
  return [(seed * 2 + 1) | 0, (seed * 2 + 2) | 0];
}

export function selfPlay(
  cardId0: string,
  cardId1: string,
  difficulty0: Difficulty,
  difficulty1: Difficulty,
  seed: number,
  cards: Record<string, CardData> = FIXTURES,
): SelfPlayResult {
  const c0 = cards[cardId0];
  const c1 = cards[cardId1];
  if (!c0 || !c1) throw new Error(`selfPlay: unknown card id ${!c0 ? cardId0 : cardId1}`);

  const difficulty: [Difficulty, Difficulty] = [difficulty0, difficulty1];
  const seeds = botSeeds(seed);
  let { state, events: initEvents } = init(c0, c1, seed);
  const events: GameEvent[] = [...initEvents];
  let actions = 0;

  while (state.phase === "playing") {
    if (actions >= MAX_SELFPLAY_ACTIONS) {
      throw new Error(`selfPlay: no terminal state after ${MAX_SELFPLAY_ACTIONS} actions (seed ${seed})`);
    }
    const p: PlayerId = state.currentPlayer;
    const action = chooseAction(state, difficulty[p], seeds[p]);
    const legal = getLegalActions(state);
    if (!legal.some((a) => JSON.stringify(a) === JSON.stringify(action))) {
      throw new Error(`selfPlay: illegal action ${JSON.stringify(action)} by P${p} (${difficulty[p]}, seed ${seed})`);
    }
    const r = applyAction(state, action);
    events.push(...r.events);
    state = r.state;
    actions++;
  }

  const end = events[events.length - 1];
  if (end?.type !== "gameEnded") throw new Error("selfPlay: game ended without a gameEnded event");
  return {
    winner: state.winner,
    reason: end.reason,
    events,
    turns: events.filter((e) => e.type === "turnStarted").length,
    actions,
  };
}

export interface PairingSummary {
  a: Difficulty;
  b: Difficulty;
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
}

/**
 * Play `games` games of tier `a` vs tier `b`. Card matchups cycle through every ordered pair of
 * `cardIds`, and each matchup is played twice with seats swapped, so neither tier gets a
 * systematic seat or warrior advantage. Illegal actions or non-terminating games throw.
 */
export function selfPlayBatch(
  a: Difficulty,
  b: Difficulty,
  games: number,
  cardIds: string[] = Object.keys(FIXTURES),
  baseSeed = 1,
  cards: Record<string, CardData> = FIXTURES,
): PairingSummary {
  const matchups: [string, string][] = [];
  for (const x of cardIds) for (const y of cardIds) matchups.push([x, y]);
  const out: PairingSummary = { a, b, games, aWins: 0, bWins: 0, draws: 0 };

  for (let g = 0; g < games; g++) {
    // Consecutive game pairs share a matchup with seats swapped, so each tier plays both warriors.
    const [x, y] = matchups[Math.floor(g / 2) % matchups.length];
    const aSeat: PlayerId = g % 2 === 0 ? 0 : 1;
    const r =
      aSeat === 0
        ? selfPlay(x, y, a, b, baseSeed + g, cards)
        : selfPlay(x, y, b, a, baseSeed + g, cards);
    if (r.winner === "draw") out.draws++;
    else if (r.winner === aSeat) out.aWins++;
    else out.bWins++;
  }
  return out;
}
