import { describe, it, expect } from "vitest";
import { step, rollDie, roll2d6, seedState } from "../src/rng";

describe("seeded RNG", () => {
  it("is deterministic: same state produces the same step", () => {
    const a = step(12345);
    const b = step(12345);
    expect(a).toEqual(b);
  });

  it("advances state so repeated draws differ", () => {
    const s0 = seedState(7);
    const r1 = rollDie(s0);
    const r2 = rollDie(r1.state);
    expect(r1.state).not.toBe(s0);
    // not asserting the dice differ (they can coincide), only the state advances
    expect(typeof r2.die).toBe("number");
  });

  it("produces d6 values strictly in 1..6 over many draws", () => {
    let s = seedState(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const r = rollDie(s);
      expect(r.die).toBeGreaterThanOrEqual(1);
      expect(r.die).toBeLessThanOrEqual(6);
      seen.add(r.die);
      s = r.state;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("2d6 sum equals the two dice and stays in 2..12", () => {
    let s = seedState(42);
    for (let i = 0; i < 1000; i++) {
      const r = roll2d6(s);
      expect(r.sum).toBe(r.dice[0] + r.dice[1]);
      expect(r.sum).toBeGreaterThanOrEqual(2);
      expect(r.sum).toBeLessThanOrEqual(12);
      s = r.state;
    }
  });

  it("two independent streams from the same seed are identical", () => {
    const run = () => {
      let s = seedState(2024);
      const out: number[] = [];
      for (let i = 0; i < 50; i++) {
        const r = rollDie(s);
        out.push(r.die);
        s = r.state;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
