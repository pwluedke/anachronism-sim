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
  /** Base value of having the opponent inside my projected attack grid (and the cost of the mirror). */
  threat: 20,
  /** Added per point of the grid modifier on the threatened cell (+2 cell > +0 cell > -1 cell). */
  threatMod: 5,
  /** Per point of experience difference. Minor: experience is only a tiebreaker. */
  experience: 1,
  /** Magnitude for a decided game: a win scores +terminal, a loss -terminal, a draw 0. */
  terminal: 1_000_000,
} as const;
