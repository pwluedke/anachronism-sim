import { describe, it, expect } from "vitest";
import { judge, breakTie, resolveAttack } from "../src/combat";
import { roll2d6 } from "../src/rng";
import type { Warrior } from "../src/types";

function warrior(over: Partial<Warrior>): Warrior {
  return {
    playerId: 0,
    cardId: "x",
    name: "W",
    position: { row: 1, col: 1 },
    facing: "S",
    life: 8,
    speed: 3,
    experience: 5,
    damage: 1,
    attackGrid: { "2B": "+0", "3A": "-1", "3B": "marker", "3C": "-1" },
    ...over,
  };
}

const ATT = warrior({ playerId: 0, damage: 1, experience: 5 });
const DEF = warrior({ playerId: 1, experience: 5, position: { row: 2, col: 1 }, facing: "N" });

describe("judge: hit / miss / crit (explicit dice)", () => {
  it("higher total hits, dealing base damage", () => {
    const { result } = judge([5, 4], [3, 2], 0, ATT, DEF, 0); // 9 vs 5
    expect(result.hit).toBe(true);
    expect(result.crit).toBe(false);
    expect(result.damage).toBe(1);
  });

  it("lower total misses, no damage", () => {
    const { result } = judge([1, 2], [6, 5], 0, ATT, DEF, 0); // 3 vs 11
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });

  it("grid modifier is added to the attacker total", () => {
    // raw 6 vs 7 would miss, but -1 cell... here use +0 cell and a +2 example
    const lose = judge([3, 3], [4, 3], -1, ATT, DEF, 0); // 6-1=5 vs 7 -> miss (and doubles)
    expect(lose.result.attackerTotal).toBe(5);
    expect(lose.result.hit).toBe(false);
    expect(lose.result.damage).toBe(0); // doubles but missed -> no crit damage
    const win = judge([3, 2], [4, 2], 2, ATT, DEF, 0); // 5+2=7 vs 6 -> hit
    expect(win.result.attackerTotal).toBe(7);
    expect(win.result.hit).toBe(true);
  });

  it("attacker doubles on a hit is a crit and doubles BASE damage", () => {
    const att = warrior({ damage: 2 });
    const { result } = judge([4, 4], [3, 2], 0, att, DEF, 0); // doubles, 8 vs 5
    expect(result.crit).toBe(true);
    expect(result.hit).toBe(true);
    expect(result.damage).toBe(4); // base 2 * 2
  });

  it("doubles on a miss is not a crit-damage event", () => {
    const att = warrior({ damage: 2 });
    const { result } = judge([2, 2], [6, 5], 0, att, DEF, 0); // doubles, 4 vs 11 -> miss
    expect(result.crit).toBe(true);
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });
});

describe("ties: experience then dice-off", () => {
  it("tie on totals -> higher experience hits", () => {
    const att = warrior({ experience: 7 });
    const def = warrior({ playerId: 1, experience: 3 });
    const { result } = judge([3, 3], [4, 2], 0, att, def, 0); // 6 vs 6 (att doubles)
    expect(result.attackerTotal).toBe(result.defenderRoll);
    expect(result.tiebreak).toBe("experience");
    expect(result.hit).toBe(true);
    expect(result.damage).toBe(att.damage * 2); // tie won + doubles -> crit
  });

  it("tie on totals, lower experience attacker -> miss via experience", () => {
    const att = warrior({ experience: 2 });
    const def = warrior({ playerId: 1, experience: 9 });
    const { result } = judge([4, 2], [5, 1], 0, att, def, 0); // 6 vs 6, no doubles
    expect(result.tiebreak).toBe("experience");
    expect(result.hit).toBe(false);
  });

  it("equal experience -> dice-off resolves to a winner", () => {
    const att = warrior({ experience: 5 });
    const def = warrior({ playerId: 1, experience: 5 });
    // scan seeds: a dice-off must always terminate and pick someone
    for (let seed = 1; seed <= 50; seed++) {
      const { result } = judge([4, 2], [5, 1], 0, att, def, seed | 0);
      expect(result.tiebreak).toBe("diceoff");
      expect(typeof result.hit).toBe("boolean");
    }
  });

  it("breakTie dice-off is deterministic for a given rng", () => {
    const att = warrior({ experience: 5 });
    const def = warrior({ playerId: 1, experience: 5 });
    expect(breakTie(att, def, 123)).toEqual(breakTie(att, def, 123));
  });
});

describe("resolveAttack consumes RNG in order (attacker 2d6, then defender 2d6)", () => {
  it("matches an independent roll of the same RNG stream", () => {
    const size = 4;
    const seed = 777;
    const a = roll2d6(seed);
    const d = roll2d6(a.state);
    const expected = judge(a.dice, d.dice, 0, ATT, DEF, d.state); // Achilles front cell = +0
    // ATT at (1,1) facing S; DEF at (2,1) is the front (+0) cell -> legal
    const actual = resolveAttack(ATT, DEF, seed, size);
    expect(actual.result).toEqual(expected.result);
    expect(actual.rng).toBe(expected.rng);
  });

  it("is illegal (no roll) when the defender is not in the grid", () => {
    const farDef = warrior({ playerId: 1, position: { row: 0, col: 3 } });
    const { result, rng } = resolveAttack(ATT, farDef, 555, 4);
    expect(result.legal).toBe(false);
    expect(result.damage).toBe(0);
    expect(rng).toBe(555); // RNG untouched on an illegal attack
  });

  it("same seed + same attack => identical result (determinism)", () => {
    expect(resolveAttack(ATT, DEF, 999, 4)).toEqual(resolveAttack(ATT, DEF, 999, 4));
  });
});
