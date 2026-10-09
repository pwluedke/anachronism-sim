// Depth-limited expectiminimax with alpha-beta pruning over the engine's own
// getLegalActions / applyAction. One ply = one action. PURE.
//
// - Max nodes: the root player is acting. Min nodes: the opponent is acting.
//   Whose turn it is comes from state.currentPlayer, so turn passes, budget
//   exhaustion and round/initiative changes are whatever applyAction produces.
// - ATTACK is a chance node (see CHANCE_SAMPLES): its children are searched
//   with a full window and averaged by outcome frequency.
// - Any other action whose result drew on the RNG (an ability's dice roll; a PASS into a round whose
//   initiative is a dice-off) is a chance node too, so the search never sees the real dice.
// - Tie-break: root actions are compared in getLegalActions order and only a
//   strictly better score replaces the incumbent, so among equal scores the
//   lowest-index legal action wins.

import type { Action, GameState, PlayerId } from "../types";
import { applyAction } from "../engine";
import { getLegalActions } from "../legal";
import { seedState, step } from "../rng";
import { evaluate } from "./evaluate";
import { CHANCE_SAMPLES } from "./config";

export interface SearchOptions {
  /** Seeds the dice samples used at chance nodes. */
  sampleSeed?: number;
  chanceSamples?: number;
  /** Alpha-beta pruning. Off = plain expectiminimax (same answer, slower). */
  prune?: boolean;
}

export interface SearchResult {
  action: Action;
  score: number;
  /** Index of `action` within getLegalActions(state). */
  index: number;
}

const INF = Number.POSITIVE_INFINITY;

interface Ctx {
  root: PlayerId;
  sampleRngs: number[];
  prune: boolean;
}

function sampleRngs(seed: number, n: number): number[] {
  const out: number[] = [];
  let s = seedState(seed);
  for (let i = 0; i < n; i++) {
    s = step(s).state;
    out.push(s);
  }
  return out;
}

const ORDER: Record<Action["type"], number> = {
  DISCARD: 0,
  REROLL: 0,
  KEEP: 0,
  CHOOSE: 0,
  ATTACK: 0,
  MOVE: 1,
  ABILITY: 2,
  ROTATE: 2,
  DECLINE: 3,
  PASS: 3,
};

/** Actions whose result depends on dice the search must not peek at: attacks and re-rolls always;
 *  any other action whose result drew on the game's RNG (an ability's dice roll, a round-start
 *  initiative dice-off after a PASS) — those are re-sampled like attacks. */
const isChance = (state: GameState, a: Action, next: GameState) => a.type === "ATTACK" || a.type === "REROLL" || next.rng !== state.rng;

/** Distinct outcomes of a dice action (attack / re-roll) and their sampled probabilities. */
function attackOutcomes(state: GameState, attack: Action, ctx: Ctx): { state: GameState; p: number }[] {
  const groups = new Map<string, { state: GameState; n: number }>();
  for (const rng of ctx.sampleRngs) {
    const next = applyAction({ ...state, rng }, attack).state;
    // Outcomes differ by the warriors (life, experience, position …), what's pending (dice awaiting a
    // re-roll, an ability choice), timed effects, and who acts next.
    const key = JSON.stringify([next.warriors, next.pending, next.effects, next.phase, next.currentPlayer, next.initiative]);
    const g = groups.get(key);
    if (g) g.n += 1;
    else groups.set(key, { state: next, n: 1 });
  }
  const total = ctx.sampleRngs.length;
  return [...groups.values()].map((g) => ({ state: g.state, p: g.n / total }));
}

function actionValue(
  state: GameState,
  action: Action,
  depth: number,
  alpha: number,
  beta: number,
  ctx: Ctx,
): number {
  const next = applyAction(state, action).state;
  if (isChance(state, action, next)) {
    let v = 0;
    for (const o of attackOutcomes(state, action, ctx)) v += o.p * value(o.state, depth - 1, -INF, INF, ctx);
    return v;
  }
  return value(next, depth - 1, alpha, beta, ctx);
}

function value(state: GameState, depth: number, alpha: number, beta: number, ctx: Ctx): number {
  if (depth <= 0 || state.phase !== "playing") return evaluate(state, ctx.root);
  const actions = getLegalActions(state).sort((a, b) => ORDER[a.type] - ORDER[b.type]);
  const maximizing = state.currentPlayer === ctx.root;
  let best = maximizing ? -INF : INF;
  for (const a of actions) {
    const v = actionValue(state, a, depth, alpha, beta, ctx);
    if (maximizing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (ctx.prune && alpha >= beta) break;
  }
  return best;
}

/** Best action for the current player, searching `depth` plies (>= 1). */
export function search(state: GameState, depth: number, opts: SearchOptions = {}): SearchResult {
  const actions = getLegalActions(state);
  if (actions.length === 0) throw new Error("search: no legal actions (game not in progress)");
  const ctx: Ctx = {
    root: state.currentPlayer,
    sampleRngs: sampleRngs(opts.sampleSeed ?? 0, opts.chanceSamples ?? CHANCE_SAMPLES),
    prune: opts.prune ?? true,
  };
  let bestIndex = 0;
  let bestScore = -INF;
  for (let i = 0; i < actions.length; i++) {
    const v = actionValue(state, actions[i], Math.max(1, depth), ctx.prune ? bestScore : -INF, INF, ctx);
    if (v > bestScore) {
      bestScore = v;
      bestIndex = i;
    }
  }
  return { action: actions[bestIndex], score: bestScore, index: bestIndex };
}
