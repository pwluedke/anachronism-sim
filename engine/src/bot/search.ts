// Depth-limited expectiminimax with alpha-beta pruning over the engine's own
// getLegalActions / applyAction. One ply = one action. PURE.
//
// - Max nodes: the root player is acting. Min nodes: the opponent is acting.
//   Whose turn it is comes from state.currentPlayer, so turn passes, budget
//   exhaustion and round/initiative changes are whatever applyAction produces.
// - ATTACK is a chance node (see CHANCE_SAMPLES): its children are searched
//   with a full window and averaged by outcome frequency.
// - Known leak (not fixed): when both warriors have equal experience, round-start initiative is a
//   dice-off drawn from state.rng, which on non-attack lines is the game's real RNG. So in mirror
//   matches the search can see who will win initiative next round.
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

const ORDER: Record<Action["type"], number> = { ATTACK: 0, MOVE: 1, ROTATE: 2, PASS: 3 };

/** Distinct ATTACK outcomes and their sampled probabilities. */
function attackOutcomes(state: GameState, ctx: Ctx): { state: GameState; p: number }[] {
  const groups = new Map<string, { state: GameState; n: number }>();
  for (const rng of ctx.sampleRngs) {
    const next = applyAction({ ...state, rng }, { type: "ATTACK" }).state;
    const key = `${next.warriors[0].life}|${next.warriors[1].life}`;
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
  if (action.type === "ATTACK") {
    let v = 0;
    for (const o of attackOutcomes(state, ctx)) v += o.p * value(o.state, depth - 1, -INF, INF, ctx);
    return v;
  }
  return value(applyAction(state, action).state, depth - 1, alpha, beta, ctx);
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
