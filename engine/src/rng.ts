// Seeded RNG (mulberry32). The generator state is a single 32-bit integer that
// lives inside GameState; every draw is a PURE step (state in -> {value, state}).
// This guarantees: same seed + same actions => identical game. Never Math.random.

export interface RngStep {
  value: number; // float in [0, 1)
  state: number; // next rng state (32-bit int)
}

/** One mulberry32 step. Pure: does not mutate, returns the next state. */
export function step(state: number): RngStep {
  let a = state | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a };
}

/** Roll a single d6 (1..6). Returns the die and the advanced rng state. */
export function rollDie(state: number): { die: number; state: number } {
  const s = step(state);
  return { die: Math.floor(s.value * 6) + 1, state: s.state };
}

/** Roll 2d6. Returns both dice, their sum, and the advanced rng state. */
export function roll2d6(state: number): {
  dice: [number, number];
  sum: number;
  state: number;
} {
  const a = rollDie(state);
  const b = rollDie(a.state);
  return { dice: [a.die, b.die], sum: a.die + b.die, state: b.state };
}

/** Derive a clean 32-bit seed-state from an arbitrary integer seed. */
export function seedState(seed: number): number {
  // Mix the seed once so adjacent seeds don't produce correlated streams.
  return step(seed | 0).state;
}
