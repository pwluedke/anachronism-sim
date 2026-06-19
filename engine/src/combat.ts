// Basic attack resolution.
//
// Legal only if the defender stands on a numbered cell of the attacker's
// projected grid. Both warriors roll 2d6 simultaneously; the attacker adds the
// grid modifier for the defender's cell. Higher total hits. A tie is broken by
// Experience, then by an unmodified dice-off. Attacker doubles = critical hit
// (doubles the base damage). A basic attack costs one action but is NOT limited
// to one per turn (Set 7 Basic Rulebook, p11) — the action budget gates them.

import type { Warrior } from "./types";
import { roll2d6, rollDie } from "./rng";
import { modifierAt } from "./projection";

export interface AttackResult {
  legal: boolean; // defender was in the attacker's grid
  attackerRoll: number; // raw 2d6 sum
  defenderRoll: number; // raw 2d6 sum
  gridMod: number;
  attackerTotal: number; // attackerRoll + gridMod
  hit: boolean;
  crit: boolean; // attacker rolled doubles
  damage: number; // 0 on miss
  tiebreak: "experience" | "diceoff" | null;
}

const ILLEGAL: AttackResult = {
  legal: false,
  attackerRoll: 0,
  defenderRoll: 0,
  gridMod: 0,
  attackerTotal: 0,
  hit: false,
  crit: false,
  damage: 0,
  tiebreak: null,
};

/** Break a tie: higher Experience wins; if equal, dice-off (reroll on tie). */
export function breakTie(
  attacker: Warrior,
  defender: Warrior,
  rng: number,
): { winner: "attacker" | "defender"; method: "experience" | "diceoff"; rng: number } {
  if (attacker.experience !== defender.experience) {
    return {
      winner: attacker.experience > defender.experience ? "attacker" : "defender",
      method: "experience",
      rng,
    };
  }
  let s = rng;
  // Unmodified dice-off: each rolls a die; higher wins; reroll while tied.
  for (;;) {
    const a = rollDie(s);
    const b = rollDie(a.state);
    s = b.state;
    if (a.die !== b.die) {
      return { winner: a.die > b.die ? "attacker" : "defender", method: "diceoff", rng: s };
    }
  }
}

/** Decide an attack from explicit dice (pure apart from the dice-off RNG). */
export function judge(
  attackerDice: [number, number],
  defenderDice: [number, number],
  gridMod: number,
  attacker: Warrior,
  defender: Warrior,
  rng: number,
): { result: AttackResult; rng: number } {
  const attackerRoll = attackerDice[0] + attackerDice[1];
  const defenderRoll = defenderDice[0] + defenderDice[1];
  const attackerTotal = attackerRoll + gridMod;
  const crit = attackerDice[0] === attackerDice[1];

  let hit: boolean;
  let tiebreak: "experience" | "diceoff" | null = null;
  let s = rng;
  if (attackerTotal > defenderRoll) {
    hit = true;
  } else if (attackerTotal < defenderRoll) {
    hit = false;
  } else {
    const t = breakTie(attacker, defender, s);
    s = t.rng;
    tiebreak = t.method;
    hit = t.winner === "attacker";
  }

  const damage = hit ? attacker.damage * (crit ? 2 : 1) : 0;
  return {
    result: { legal: true, attackerRoll, defenderRoll, gridMod, attackerTotal, hit, crit, damage, tiebreak },
    rng: s,
  };
}

/**
 * Resolve a basic attack by the attacker against the defender, rolling from the
 * seeded RNG. Order of consumption: attacker 2d6, then defender 2d6, then any
 * dice-off. Returns the result and the advanced RNG (no state mutated).
 */
export function resolveAttack(
  attacker: Warrior,
  defender: Warrior,
  rng: number,
  size: number,
): { result: AttackResult; rng: number } {
  const gridMod = modifierAt(
    attacker.attackGrid,
    attacker.position,
    attacker.facing,
    defender.position,
    size,
  );
  if (gridMod === null) return { result: ILLEGAL, rng };

  const a = roll2d6(rng);
  const d = roll2d6(a.state);
  return judge(a.dice, d.dice, gridMod, attacker, defender, d.state);
}
