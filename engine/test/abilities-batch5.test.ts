// Batch 5 (#91): each card's effect, trigger, condition (both branches) and duration / usage limit.
import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import skipped from "../../data/abilities_skipped.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { attackRollBonus, continuousSpeed, damageBonus, defenseRollBonus } from "../src/abilities/runtime";
import { experienceOf } from "../src/abilities/experience";
import { IMPLEMENTED } from "../src/abilities/cards";
import { indexCards, loadDeck, supportCard, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { Action, GameEvent, GameState, PlayerId } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // inert, male
const LEO = deck("Leonidas");
const AMAZONIA = deck("Amazonia"); // female
const BOW = "s2-023"; // Long Bow: an inert Ranged weapon
const LAKONIAN = "s1-008"; // an inert non-ranged weapon

const BATCH5 = ["s1-015", "s1-089", "s1-037", "s2-021", "s5-011", "s7-077", "s1-022", "s7-057", "s1-057", "s1-036", "s1-090", "s1-031", "s2-097"];

/** `d` with card `id` first in line (revealed in round 1). */
function first(d: Deck, id: string): Deck {
  const out = structuredClone(d);
  out.support[0] = supportCard(cards[id]);
  return out;
}
/** A state with card `id` face up for `owner`, the rest as dealt. */
function withCard(id: string, owner: PlayerId = 0, base: [Deck, Deck] = [ALEX, LEO], seed = 1): GameState {
  const s = structuredClone(init(base[0], base[1], seed).state);
  s.cards[owner].support[0] = { card: supportCard(cards[id]), status: "in-play" };
  return s;
}
function up(s: GameState, owner: PlayerId, id: string): void {
  s.cards[owner].support.push({ card: supportCard(cards[id]), status: "in-play" });
}
/** Player p to act, three actions; p at (1,1) and the other at (2,1); p turned until a basic attack is legal. */
function face(s: GameState, p: PlayerId, rng: number): GameState {
  const q: PlayerId = p === 0 ? 1 : 0;
  Object.assign(s, { phase: "playing", currentPlayer: p, turnOrder: [p, q], turnIndex: 0, actionsRemaining: 3, pending: null, movedThisTurn: false, rng });
  s.warriors[p].position = { row: 1, col: 1 };
  s.warriors[q].position = { row: 2, col: 1 };
  s.warriors[q].facing = "N";
  s.warriors[0].life = s.warriors[1].life = 50;
  for (const f of ["S", "E", "W", "N"] as const) {
    s.warriors[p].facing = f;
    if (getLegalActions(s).some((a) => a.type === "ATTACK" && !a.weapon)) return s;
  }
  throw new Error("set-up: no basic attack");
}
type R = { state: GameState; events: GameEvent[]; atk: Extract<GameEvent, { type: "attacked" }> };
/** Basic attacks from player p at many seeds; the first result matching `pred`. */
function attackUntil(make: (rng: number) => GameState, pred: (r: R) => boolean, action: Action = { type: "ATTACK" }): R {
  for (let rng = 1; rng < 3000; rng++) {
    const r = applyAction(make(rng), action);
    const atk = r.events.find((e): e is R["atk"] => e.type === "attacked");
    if (atk && pred({ ...r, atk })) return { ...r, atk };
  }
  throw new Error("no matching attack");
}
const fired = (ev: GameEvent[], name: string) => ev.filter((e) => e.type === "abilityFired" && e.cardName === name);
const rolls = (ev: GameEvent[], name: string) => ev.filter((e): e is Extract<GameEvent, { type: "abilityRolled" }> => e.type === "abilityRolled" && e.cardName === name);
function nextRound(s: GameState): GameState {
  const r = s.round;
  while (s.round === r && s.phase === "playing") s = applyAction(s, s.pending?.kind === "choice" ? getLegalActions(s)[0] : { type: "PASS" }).state;
  return s;
}

describe("batch 5: the implemented set", () => {
  it("13 cards implemented (58 in all) and gone from the skip log; the rest name their clause", () => {
    for (const id of BATCH5) expect(IMPLEMENTED[id]).toBeDefined();
    expect(Object.keys(IMPLEMENTED)).toHaveLength(58);
    const log = skipped as { id: string; reason: string }[];
    expect(log).toHaveLength(703);
    for (const id of BATCH5) expect(log.some((e) => e.id === id)).toBe(false);
    expect(log.some((e) => e.reason === "experience modification" || e.reason === "dice-value branching / dice rolling")).toBe(false);
  });
});

describe("experience cards", () => {
  it("Belt of Hippolyte — Zoni Dexiotexnias: +4 experience while in play", () => {
    const s = withCard("s1-015");
    expect(experienceOf(s, 0)).toBe(ALEX.warrior.experience + 4);
    expect(experienceOf(s, 1)).toBe(LEO.warrior.experience);
    s.cards[0].support[0].status = "discarded";
    expect(experienceOf(s, 0)).toBe(ALEX.warrior.experience);
  });

  it("Cassis — Galeatus: Metal / Water: +1 defense; Earth / Fire: +1 experience; else nothing", () => {
    const s = withCard("s1-089");
    const look = (el: string) => {
      s.warriors[0].element = el;
      return [defenseRollBonus(s, 0), experienceOf(s, 0) - ALEX.warrior.experience];
    };
    expect(look("Metal")).toEqual([1, 0]);
    expect(look("Water")).toEqual([1, 0]);
    expect(look("Earth")).toEqual([0, 1]);
    expect(look("Fire")).toEqual([0, 1]);
    expect(look("Wood")).toEqual([0, 0]);
  });

  it("Haidate — Shinogeru: +1 defense when you have more experience than the attacker", () => {
    const s = withCard("s1-037");
    s.warriors[0].experience = 8;
    s.warriors[1].experience = 5;
    expect(defenseRollBonus(s, 0)).toBe(1);
    s.warriors[1].experience = 8; // equal
    expect(defenseRollBonus(s, 0)).toBe(0);
    s.warriors[1].experience = 9;
    expect(defenseRollBonus(s, 0)).toBe(0);
  });

  it("Robin Hood — Treowe Ame: +3 experience and +1 attack, only with a ranged weapon", () => {
    const ROBIN = deck("Robin Hood");
    const s = structuredClone(init(ROBIN, LEO, 1).state);
    s.cards[0].support.forEach((c) => c.card.traits.includes("Ranged") && (c.status = "face-down"));
    expect([experienceOf(s, 0) - ROBIN.warrior.experience, attackRollBonus(s, 0)]).toEqual([0, 0]);
    up(s, 0, LAKONIAN); // a weapon, but not ranged
    expect(attackRollBonus(s, 0)).toBe(0);
    up(s, 0, BOW);
    expect([experienceOf(s, 0) - ROBIN.warrior.experience, attackRollBonus(s, 0)]).toEqual([3, 1]);
  });

  it("Itzcoatl — Ixhuacayotlani: a basic hit gains 2 experience, permanently; a miss doesn't", () => {
    const ITZ = deck("Itzcoatl");
    const make = (rng: number) => face(structuredClone(init(ITZ, LEO, 1).state), 0, rng);
    const hit = attackUntil(make, (r) => r.atk.hit);
    expect(fired(hit.events, "Itzcoatl")).toEqual([expect.objectContaining({ effect: "+2 experience" })]);
    expect(hit.state.warriors[0].experience).toBe(ITZ.warrior.experience + 2);
    expect(experienceOf(nextRound(hit.state), 0)).toBe(ITZ.warrior.experience + 2); // permanent
    const miss = attackUntil(make, (r) => !r.atk.hit);
    expect(miss.state.warriors[0].experience).toBe(ITZ.warrior.experience);
  });

  it("Itzcoatl gains nothing from a weapon hit", () => {
    const ITZ = deck("Itzcoatl");
    const make = (rng: number) => {
      const s = face(structuredClone(init(ITZ, LEO, 1).state), 0, rng);
      s.cards[0].support[0] = { card: supportCard(cards[LAKONIAN]), status: "in-play" };
      return s;
    };
    const s0 = make(1);
    const wpn = getLegalActions(s0).find((a) => a.type === "ATTACK" && a.weapon === LAKONIAN);
    expect(wpn).toBeDefined(); // the weapon reaches the adjacent defender
    const hit = attackUntil(make, (r) => r.atk.hit, wpn!);
    expect(hit.state.warriors[0].experience).toBe(ITZ.warrior.experience);
  });

  it("Afroditi — Teleia Omorfia: a male warrior gets +1 speed and -3 experience; others nothing", () => {
    const s = withCard("s7-077"); // Alexander: male
    expect([continuousSpeed(s, 0), experienceOf(s, 0) - ALEX.warrior.experience]).toEqual([1, -3]);
    const f = withCard("s7-077", 0, [AMAZONIA, LEO]);
    expect([continuousSpeed(f, 0), experienceOf(f, 0) - AMAZONIA.warrior.experience]).toEqual([0, 0]);
  });
});

describe("dice-roll cards", () => {
  it("Izanagi — Zonrei (Reveal): two dice; under your experience -> +2 life, otherwise nothing", () => {
    let yes = false;
    let no = false;
    for (let seed = 1; seed < 400 && !(yes && no); seed++) {
      const r = init(first(ALEX, "s1-022"), LEO, seed);
      const [roll] = rolls(r.events, "Izanagi");
      expect(roll.dice).toHaveLength(2);
      expect(roll.target).toBe(ALEX.warrior.experience);
      expect(roll.success).toBe(roll.total < ALEX.warrior.experience);
      expect(r.state.warriors[0].life).toBe(ALEX.warrior.life + (roll.success ? 2 : 0));
      if (roll.success) yes = true;
      else no = true;
    }
    expect([yes, no]).toEqual([true, true]);
  });

  it("Golyath — Heref: each round, under 9 -> +2 attack and +1 damage on the next attack only", () => {
    for (let seed = 1; seed < 400; seed++) {
      const r = init(first(ALEX, "s7-057"), LEO, seed);
      const [roll] = rolls(r.events, "Golyath");
      expect(roll.target).toBe(9);
      if (!roll.success) {
        expect([attackRollBonus(r.state, 0), damageBonus(r.state, 0)]).toEqual([0, 0]);
        continue;
      }
      expect([attackRollBonus(r.state, 0), damageBonus(r.state, 0)]).toEqual([2, 1]);
      const a = applyAction(face(structuredClone(r.state), 0, 7), { type: "ATTACK" });
      const atk = a.events.find((e) => e.type === "attacked")!;
      expect(atk.type === "attacked" && [atk.rollBonus, atk.damageBonus]).toEqual([2, 1]);
      expect([attackRollBonus(a.state, 0), damageBonus(a.state, 0)]).toEqual([0, 0]); // spent
      return;
    }
    throw new Error("no success found");
  });

  it("Mjollnir — Slegge: hit by a basic attack, two dice over the attacker's experience -> 1 damage to them", () => {
    const make = (rng: number) => face(withCard("s1-057", 1), 0, rng); // Leonidas holds Mjollnir; Alexander attacks
    const yes = attackUntil(make, (r) => r.atk.hit && rolls(r.events, "Mjollnir")[0]?.success === true);
    const [roll] = rolls(yes.events, "Mjollnir");
    expect(roll.target).toBe(ALEX.warrior.experience);
    expect(roll.total).toBeGreaterThan(ALEX.warrior.experience);
    expect(yes.state.warriors[0].life).toBe(49);
    const no = attackUntil(make, (r) => r.atk.hit && rolls(r.events, "Mjollnir")[0]?.success === false);
    expect(no.state.warriors[0].life).toBe(50);
    const miss = attackUntil(make, (r) => !r.atk.hit);
    expect(rolls(miss.events, "Mjollnir")).toEqual([]); // only when hit
  });

  it("Kimono — Unrestricted: missed, two dice under your experience -> you may move one space; once a turn", () => {
    const make = (rng: number) => face(withCard("s1-036", 1), 0, rng); // Leonidas wears Kimono
    const ok = attackUntil(make, (r) => !r.atk.hit && rolls(r.events, "Kimono")[0]?.success === true);
    expect(ok.state.pending?.kind).toBe("choice");
    expect(ok.state.currentPlayer).toBe(1); // the defender decides
    const choices = getLegalActions(ok.state);
    expect(choices).toContainEqual({ type: "DECLINE" });
    const step = choices.find((a): a is Extract<Action, { type: "CHOOSE" }> => a.type === "CHOOSE")!;
    const moved = applyAction(ok.state, step);
    expect(moved.state.warriors[1].position).toEqual(step.to);
    expect(moved.state.currentPlayer).toBe(0); // back to the attacker's turn
    expect(moved.state.movedThisTurn).toBe(false); // it isn't Leonidas's turn
    // Once per turn: a second miss this turn doesn't roll again.
    const again = attackUntil(() => face(structuredClone(moved.state), 0, 99), (r) => !r.atk.hit);
    expect(rolls(again.events, "Kimono")).toEqual([]);
    // Failed roll: no choice.
    const fail = attackUntil(make, (r) => !r.atk.hit && rolls(r.events, "Kimono")[0]?.success === false);
    expect(fail.state.pending).toBeNull();
  });

  it("Scutum — Scutatus: a hit, two dice at most your experience -> you move the defender one space (they keep facing)", () => {
    const make = (rng: number) => face(withCard("s1-090", 0), 0, rng);
    const ok = attackUntil(make, (r) => r.atk.hit && rolls(r.events, "Scutum")[0]?.success === true);
    expect(rolls(ok.events, "Scutum")[0].total).toBeLessThanOrEqual(ALEX.warrior.experience);
    expect(ok.state.currentPlayer).toBe(0);
    const choices = getLegalActions(ok.state);
    expect(choices).not.toContainEqual({ type: "DECLINE" }); // not optional
    expect(choices.every((a) => a.type === "CHOOSE" && a.facing === "N")).toBe(true);
    const shoved = applyAction(ok.state, choices[0]);
    expect(shoved.state.warriors[1].position).toEqual((choices[0] as Extract<Action, { type: "CHOOSE" }>).to);
    expect(shoved.state.warriors[1].facing).toBe("N");
    // Once per round: the next hit doesn't roll.
    const again = attackUntil(() => face(structuredClone(shoved.state), 0, 5), (r) => r.atk.hit);
    expect(rolls(again.events, "Scutum")).toEqual([]);
    const fail = attackUntil(make, (r) => r.atk.hit && rolls(r.events, "Scutum")[0]?.success === false);
    expect(fail.state.pending).toBeNull();
  });

  it("Mempo — Ojikedzuku (Action): at least the opponent's experience -> you may move them up to 2 spaces, any facing; once a turn", () => {
    for (let rng = 1; rng < 2000; rng++) {
      const s = face(withCard("s1-031", 0), 0, rng);
      s.warriors[1].position = { row: 3, col: 3 };
      const use = getLegalActions(s).find((a) => a.type === "ABILITY" && a.card === "s1-031")!;
      const r = applyAction(s, use);
      const [roll] = rolls(r.events, "Mempo");
      expect(roll.target).toBe(LEO.warrior.experience);
      expect(r.state.actionsRemaining).toBe(2);
      if (!roll.success) {
        expect(r.state.pending).toBeNull();
        continue;
      }
      const choices = getLegalActions(r.state);
      expect(choices).toContainEqual({ type: "DECLINE" });
      const cells = new Set(choices.filter((a) => a.type === "CHOOSE").map((a) => a.type === "CHOOSE" && `${a.to.row},${a.to.col}`));
      expect(cells).toEqual(new Set(["2,3", "3,2", "1,3", "2,2", "3,1"])); // 1 or 2 steps from D-IV
      expect(new Set(choices.filter((a) => a.type === "CHOOSE").map((a) => a.type === "CHOOSE" && a.facing)).size).toBe(4);
      const done = applyAction(r.state, { type: "DECLINE" });
      expect(done.state.warriors[1].position).toEqual({ row: 3, col: 3 });
      expect(getLegalActions(done.state).some((a) => a.type === "ABILITY" && a.card === "s1-031")).toBe(false); // used
      return;
    }
    throw new Error("no success found");
  });

  it("Yeke Mongghol Ulus — Kucurkeg turimekei ulus (Action): won initiative + face-up ranged weapon -> move the opponent one space", () => {
    const s = face(withCard("s2-097", 0), 0, 1);
    s.warriors[1].position = { row: 3, col: 3 };
    s.initiative = 0;
    const offered = () => getLegalActions(s).filter((a): a is Extract<Action, { type: "ABILITY" }> => a.type === "ABILITY" && a.card === "s2-097");
    expect(offered()).toHaveLength(0); // no ranged weapon
    up(s, 0, BOW);
    expect(offered().map((a) => `${a.to!.row},${a.to!.col}`).sort()).toEqual(["2,3", "3,2"]);
    expect(new Set(offered().map((a) => a.facing))).toEqual(new Set(["N"])); // they keep their facing
    s.initiative = 1;
    expect(offered()).toHaveLength(0); // lost initiative
  });
});
