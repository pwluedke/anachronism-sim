// Every hand-tunable bot constant lives in this file.

/**
 * Evaluation weights (see evaluate.ts). Scores are from one player's perspective;
 * higher is better for that player.
 */
export const EVAL_WEIGHTS = {
  /** Per point of life difference. Dominant term: one life point outweighs any positional edge. */
  life: 100,
  /**
   * Tempo: the life term is multiplied by `1 + tempo * progress`, where progress runs 0 (round 1)
   * to 1 (final round). A life lead matters more as the round-5 life check approaches.
   */
  tempo: 1,
  /**
   * Base value, per attack and per point of the attacker's damage, of having the opponent inside
   * my projected attack grid (and the cost of the mirror).
   */
  threat: 20,
  /** Added per point of the grid modifier on the threatened cell (+2 cell > +0 cell > -1 cell). */
  threatMod: 5,
  /**
   * Turn-aware threat: the player who acts NEXT (state.currentPlayer) can cash a threat in before
   * the other side answers, so their threat is multiplied by `threatOnMove * actionsRemaining`
   * (each remaining action is a potential attack). The other side's threat counts once.
   * Keeps the eval zero-sum.
   */
  threatOnMove: 2,
  /**
   * Life-lead decisiveness: adds `lead * (2*sigmoid(margin / spread) - 1)`, an estimate of who wins
   * the round-5 life check. margin = life difference, +/-0.5 for the experience tiebreak;
   * spread = leadSpread * roundsLeft (roundsLeft = 5 in round 1 ... 1 in round 5).
   * As rounds run out the curve sharpens, so the same lead becomes more decisive. The curve is
   * convex when behind and concave when ahead: a trailing bot gains from trading blows (variance
   * is its only way back, even through the opponent's attack grid), and a leading bot gains from
   * avoiding them and running out the clock.
   */
  lead: 1500,
  leadSpread: 0.35,
  /** Per point of experience difference. Minor: experience is only a tiebreaker. */
  experience: 1,
  /** Magnitude for a decided game: a win scores +terminal, a loss -terminal, a draw 0. */
  terminal: 1_000_000,
} as const;

/**
 * Dice samples per ATTACK in the search. The search never looks at the game's real future rolls:
 * each attack is resolved by the engine under this many bot-seeded RNG states, and the distinct
 * outcomes (miss / hit / crit / kill) are weighted by frequency. Higher = truer odds, slower search.
 */
export const CHANCE_SAMPLES = 24;

// ---- Difficulty tiers ------------------------------------------------------
// Depths are in plies (one ply = one action, either side). A spine warrior has speed 3,
// so 3 plies ≈ one full turn and 6 ≈ my turn + the opponent's reply.

/** Easy looks one action ahead. */
export const DEPTH_EASY = 1;
/** Medium looks about one full turn ahead. */
export const DEPTH_MEDIUM = 3;
/** Hard: full current turn + opponent's reply turn. Raise/lower this during playtesting (each +1 ≈ 3-8x slower). */
export const DEPTH_HARD = 6;
/** Easy's seeded chance per decision of playing a uniformly random legal action instead of its search pick. */
export const BLUNDER_CHANCE = 0.3;

export type Difficulty = "easy" | "medium" | "hard";

export interface TierConfig {
  depth: number;
  blunderChance: number;
}

export const TIER_CONFIG: Record<Difficulty, TierConfig> = {
  easy: { depth: DEPTH_EASY, blunderChance: BLUNDER_CHANCE },
  medium: { depth: DEPTH_MEDIUM, blunderChance: 0 },
  hard: { depth: DEPTH_HARD, blunderChance: 0 },
};
