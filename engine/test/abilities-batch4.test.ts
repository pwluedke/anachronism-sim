// Batch 4 (#79): each recovered card's effect, trigger, condition (both branches) and duration /
// usage limit; and the six cards left in the skip log stay inert.
import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import skipped from "../../data/abilities_skipped.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { attackRollBonus, continuousSpeed, damageBonus, defenseRollBonus } from "../src/abilities/runtime";
import { IMPLEMENTED } from "../src/abilities/cards";
import { REGISTRY } from "../src/abilities/registry";
import { indexCards, loadDeck, supportCard, warriorData, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState, PlayerId } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // inert warrior and cards
const LEO = deck("Leonidas");
const RICHARD = deck("Richard the Lionheart"); // a Cavalry warrior

const BUCEPHALUS = "s1-005"; // inert Cavalry special
const LAKONIAN = "s1-008"; // inert Sword weapon
const SKJOLD = "s1-072"; // inert Shield special

/** `d` with card `id` first in line (revealed in round 1). */
function first(d: Deck, id: string): Deck {
  const out = structuredClone(d);
  out.support[0] = supportCard(cards[id]);
  return out;
}
/** `d` with a different warrior. */
const led = (d: Deck, warriorId: string): Deck => ({ ...structuredClone(d), warrior: warriorData(cards[warriorId]) });
/** A state with card `id` face up for `owner` (its first slot), the rest as dealt. */
function withCard(id: string, owner: PlayerId = 0, base: [Deck, Deck] = [ALEX, LEO]): GameState {
  const s = structuredClone(init(base[0], base[1], 1).state);
  s.cards[owner].support[0] = { card: supportCard(cards[id]), status: "in-play" };
  return s;
}
function up(s: GameState, owner: PlayerId, id: string): void {
  s.cards[owner].support.push({ card: supportCard(cards[id]), status: "in-play" });
}
function myTurn(s: GameState): GameState {
  Object.assign(s, { phase: "playing", currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, movedThisTurn: false });
  s.warriors[0].position = { row: 1, col: 1 };
  s.warriors[1].position = { row: 3, col: 3 };
  return s;
}
const fired = (ev: GameEvent[], name: string) => ev.filter((e) => e.type === "abilityFired" && e.cardName === name);
/** Pass until the round number changes. */
function nextRound(s: GameState): GameState {
  const r = s.round;
  while (s.round === r && s.phase === "playing") s = applyAction(s, { type: "PASS" }).state;
  return s;
}
/** Actions each player starts their turns with, over the current round. */
function turnActions(s: GameState): Record<number, number> {
  const out: Record<number, number> = {};
  if (s.phase === "playing") out[s.currentPlayer] = s.actionsRemaining;
  const r = applyAction(s, { type: "PASS" });
  for (const e of r.events) if (e.type === "turnStarted") out[e.player] = e.actions;
  return out;
}

describe("batch 4: the implemented set", () => {
  it("18 recovered cards are implemented and gone from the skip log", () => {
    const ids = ["s1-023", "s2-018", "s4-056", "s5-034", "s7-098", "s2-005", "s1-050", "s1-039", "s1-098", "s3-083", "s1-013", "s1-016", "s2-081", "s2-083", "s2-072", "s1-034", "s1-077", "s7-P060"];
    for (const id of ids) {
      expect(IMPLEMENTED[id]).toBeDefined();
      expect(REGISTRY[id]?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(IMPLEMENTED)).toHaveLength(45);
    const log = new Set((skipped as { id: string }[]).map((e) => e.id));
    for (const id of ids) expect(log.has(id)).toBe(false);
    expect(skipped).toHaveLength(716);
  });

  it("the three still needing other mechanics stay inert and logged with a batch-4 reason", () => {
    for (const id of ["s1-078", "s3-087", "s4-003"]) {
      expect(REGISTRY[id]).toBeUndefined();
      expect((skipped as { id: string; reason: string }[]).find((e) => e.id === id)?.reason).toMatch(/^batch 4: /);
    }
  });
});

/** Player p attacks the other twice with basic attacks (facing turned until one is legal); returns
 *  the two attack events. */
function attackTwice(s0: GameState, p: PlayerId): Extract<GameEvent, { type: "attacked" }>[] {
  let s = structuredClone(s0);
  const q: PlayerId = p === 0 ? 1 : 0;
  Object.assign(s, { phase: "playing", currentPlayer: p, turnOrder: [p, q], turnIndex: 0, actionsRemaining: 3, pending: null });
  s.warriors[p].position = { row: 1, col: 1 };
  s.warriors[q].position = { row: 2, col: 1 };
  s.warriors[q].life = 99;
  for (const f of ["S", "E", "W", "N"] as const) {
    s.warriors[p].facing = f;
    if (getLegalActions(s).some((a) => a.type === "ATTACK" && !a.weapon)) break;
  }
  const out: Extract<GameEvent, { type: "attacked" }>[] = [];
  for (let i = 0; i < 2; i++) {
    const r = applyAction(s, { type: "ATTACK" });
    for (const e of r.events) if (e.type === "attacked") out.push(e);
    s = r.state;
  }
  expect(out).toHaveLength(2);
  return out;
}

describe("batch 4 cards", () => {
  it("Yumi — Zanshin (Reveal): +1 damage with Yumi, the round it's revealed only", () => {
    const r = init(first(ALEX, "s1-023"), LEO, 1);
    expect(fired(r.events, "Yumi")).toEqual([expect.objectContaining({ effect: "+1 damage with this weapon this round" })]);
    expect(damageBonus(r.state, 0, "s1-023")).toBe(1);
    expect(damageBonus(r.state, 0)).toBe(0); // basic attacks: no
    expect(damageBonus(r.state, 1)).toBe(0);
    expect(damageBonus(nextRound(r.state), 0, "s1-023")).toBe(0);
  });

  it("Greatsword — Ridon dem Dune: +1 damage with it while you have a face-up cavalry card", () => {
    const s = withCard("s2-018");
    expect(damageBonus(s, 0, "s2-018")).toBe(0);
    up(s, 0, BUCEPHALUS);
    expect(damageBonus(s, 0, "s2-018")).toBe(1);
    expect(damageBonus(s, 0)).toBe(0); // only this weapon
    const mounted = withCard("s2-018", 0, [RICHARD, LEO]); // Richard is himself a cavalry card
    expect(damageBonus(mounted, 0, "s2-018")).toBe(1);
  });

  it("Cyrus The Great — Savarkar-e Chabok: +1 speed while he has a cavalry card", () => {
    const CYRUS = deck("Cyrus The Great");
    const s = structuredClone(init(CYRUS, LEO, 1).state);
    const hasCav = s.cards[0].support.some((c) => c.status === "in-play" && c.card.traits.includes("Cavalry"));
    expect(continuousSpeed(s, 0)).toBe(hasCav ? 1 : 0);
    s.cards[0].support.forEach((c) => c.card.traits.includes("Cavalry") && (c.status = "discarded"));
    expect(continuousSpeed(s, 0)).toBe(0);
    up(s, 0, BUCEPHALUS);
    expect(continuousSpeed(s, 0)).toBe(1);
    expect(continuousSpeed(s, 1)).toBe(0);
    // Counted when his turn starts.
    const go = init(first(CYRUS, BUCEPHALUS), LEO, 1).state;
    expect(turnActions(go)[0]).toBe(CYRUS.warrior.speed + 1);
  });

  it("Akaitoodoshi-Yoroi — Saikaku na Soubi: +1 attack and defense while you have a sword in play", () => {
    const s = withCard("s5-034");
    expect([attackRollBonus(s, 0), defenseRollBonus(s, 0)]).toEqual([0, 0]);
    up(s, 0, LAKONIAN);
    expect([attackRollBonus(s, 0), defenseRollBonus(s, 0)]).toEqual([1, 1]);
  });

  it("Spathi Tis Trias — Epitaxinete: +1 speed while in play", () => {
    const s = withCard("s7-098");
    expect(continuousSpeed(s, 0)).toBe(1);
    s.cards[0].support[0].status = "discarded";
    expect(continuousSpeed(s, 0)).toBe(0);
  });

  it("Targe — Agaenes-feohte: missed -> +2 on your next attack roll only, whenever it comes (p17)", () => {
    // Player 1 (Targe up) is attacked by player 0 and the attack misses.
    let miss: GameState | null = null;
    for (let rng = 1; rng < 500 && !miss; rng++) {
      const s = myTurn(withCard("s2-005", 1));
      s.warriors[0].facing = "S";
      s.warriors[1].position = { row: 2, col: 1 };
      s.rng = rng;
      const r = applyAction(s, getLegalActions(s).find((a) => a.type === "ATTACK" && !a.weapon)!);
      const res = r.events.find((e) => e.type === "attacked");
      if (res && res.type === "attacked" && !res.hit && r.state.pending === null) {
        expect(fired(r.events, "Targe")).toEqual([expect.objectContaining({ effect: "+2 to attack rolls on the next attack" })]);
        miss = r.state;
      }
    }
    expect(miss).not.toBeNull();
    expect(attackRollBonus(miss!, 1)).toBe(2); // waiting for player 1's next attack
    // Unused, it outlasts the round: the duration is the attack, not the turn or round.
    expect(attackRollBonus(nextRound(miss!), 1)).toBe(2);
    // Two attacks: the first gets +2, the second doesn't.
    const [a1, a2] = attackTwice(miss!, 1);
    expect([a1.rollBonus, a2.rollBonus]).toEqual([2, 0]);
  });

  it("Targe doesn't fire on a hit", () => {
    for (let rng = 1; rng < 500; rng++) {
      const s = myTurn(withCard("s2-005", 1));
      s.warriors[0].facing = "S";
      s.warriors[1].position = { row: 2, col: 1 };
      s.rng = rng;
      const r = applyAction(s, getLegalActions(s).find((a) => a.type === "ATTACK" && !a.weapon)!);
      const res = r.events.find((e) => e.type === "attacked");
      if (res && res.type === "attacked" && res.hit) {
        expect(fired(r.events, "Targe")).toEqual([]);
        return;
      }
    }
    throw new Error("no hit found");
  });

  it("Crown of England — Konge: Metal: +1 attack; Fire: -1 defense and +1 damage; other: nothing", () => {
    const s = withCard("s1-050");
    s.warriors[0].element = "Metal";
    expect([attackRollBonus(s, 0), defenseRollBonus(s, 0), damageBonus(s, 0)]).toEqual([1, 0, 0]);
    s.warriors[0].element = "Fire";
    expect([attackRollBonus(s, 0), defenseRollBonus(s, 0), damageBonus(s, 0), damageBonus(s, 0, LAKONIAN)]).toEqual([0, -1, 1, 1]);
    s.warriors[0].element = "Water";
    expect([attackRollBonus(s, 0), defenseRollBonus(s, 0), damageBonus(s, 0)]).toEqual([0, 0, 0]);
  });

  it("Miyamoto Musashi — Niten Ichi Ryu (Action): +1 damage on his next attack this turn only; no usage limit", () => {
    const MIYA = led(ALEX, "s1-039");
    const s = myTurn(structuredClone(init(MIYA, LEO, 1).state));
    const use = getLegalActions(s).find((a) => a.type === "ABILITY" && a.card === "s1-039")!;
    expect(use).toBeDefined();
    const r1 = applyAction(s, use);
    expect(fired(r1.events, "Miyamoto Musashi")).toEqual([expect.objectContaining({ effect: "+1 damage on the next attack this turn" })]);
    expect(r1.state.actionsRemaining).toBe(2);
    expect([damageBonus(r1.state, 0), damageBonus(r1.state, 0, LAKONIAN), damageBonus(r1.state, 1)]).toEqual([1, 1, 0]);
    // Two attacks: the first gets +1, the second doesn't.
    const [a1, a2] = attackTwice(r1.state, 0);
    expect([a1.damageBonus, a2.damageBonus]).toEqual([1, 0]);
    // Used twice before attacking, both bonuses land on that next attack.
    const r2 = applyAction(r1.state, use);
    expect(damageBonus(r2.state, 0)).toBe(2);
    // "This turn": unused, it ends with his turn.
    expect(damageBonus(applyAction(r2.state, { type: "PASS" }).state, 0)).toBe(0);
  });

  it("Sica — Lamina Incurvata: +1 damage with it if the defender has a face-up shield", () => {
    const s = withCard("s1-098");
    expect(damageBonus(s, 0, "s1-098")).toBe(0);
    up(s, 1, SKJOLD);
    expect(damageBonus(s, 0, "s1-098")).toBe(1);
    expect(damageBonus(s, 0)).toBe(0);
  });

  it("Claidheamh Leathann — Marbhaiche Each: +1 damage with it while the defender has a cavalry card", () => {
    expect(damageBonus(withCard("s3-083"), 0, "s3-083")).toBe(0); // vs Leonidas
    expect(damageBonus(withCard("s3-083", 0, [ALEX, RICHARD]), 0, "s3-083")).toBe(1); // vs a Cavalry warrior
    const s = withCard("s3-083");
    up(s, 1, BUCEPHALUS);
    expect(damageBonus(s, 0, "s3-083")).toBe(1);
  });

  it("Kopis — Epithesi!: +1 damage with it if you have moved this turn", () => {
    const s = myTurn(withCard("s1-013"));
    expect(damageBonus(s, 0, "s1-013")).toBe(0);
    const moved = applyAction(s, { type: "MOVE", dir: "E", facing: "E" }).state;
    expect(damageBonus(moved, 0, "s1-013")).toBe(1);
    expect(damageBonus(moved, 0)).toBe(0);
    const later = applyAction(moved, { type: "PASS" }).state; // the opponent's turn: it resets
    expect(damageBonus(later, 0, "s1-013")).toBe(0);
  });

  it("Milo of Croton — Xoris Fragmo: basic attacks +1 damage while he has no face-up weapon", () => {
    const s = structuredClone(init(deck("Milo of Croton"), LEO, 1).state);
    s.cards[0].support.forEach((c) => c.card.type === "weapon" && (c.status = "face-down"));
    expect(damageBonus(s, 0)).toBe(1);
    up(s, 0, LAKONIAN);
    expect(damageBonus(s, 0)).toBe(0);
    expect(damageBonus(s, 0, LAKONIAN)).toBe(0); // weapon attacks never
  });

  it("Gengis Khan — Erkesiyeku ary-a: +1 attack against an opponent without a cavalry card", () => {
    const GENGIS = deck("Gengis Khan");
    const s = structuredClone(init(GENGIS, LEO, 1).state);
    expect(attackRollBonus(s, 0)).toBe(1);
    up(s, 1, BUCEPHALUS);
    expect(attackRollBonus(s, 0)).toBe(0);
    expect(attackRollBonus(structuredClone(init(GENGIS, RICHARD, 1).state), 0)).toBe(0);
  });

  it("Alman Sukh — Cabciqu: +1 damage with it against an opponent without a face-up cavalry card", () => {
    const s = withCard("s2-083");
    expect(damageBonus(s, 0, "s2-083")).toBe(1);
    up(s, 1, BUCEPHALUS);
    expect(damageBonus(s, 0, "s2-083")).toBe(0);
    expect(damageBonus(withCard("s2-083", 0, [ALEX, RICHARD]), 0, "s2-083")).toBe(0);
  });

  it("Khnum — M' 'n (Reveal): +1 damage on your next attack only; ' r hnn: +2 attack vs no face-up inspiration", () => {
    const r = init(first(ALEX, "s2-072"), LEO, 1);
    expect(fired(r.events, "Khnum")).toEqual([expect.objectContaining({ ability: "M' 'n", effect: "+1 damage on the next attack" })]);
    expect(damageBonus(r.state, 0)).toBe(1);
    expect(damageBonus(nextRound(r.state), 0)).toBe(1); // unused: still waiting for that attack
    const [a1, a2] = attackTwice(r.state, 0);
    expect([a1.damageBonus, a2.damageBonus]).toEqual([1, 0]);
    // ' r hnn: Leonidas has Nemesis (inspiration) up in round 1.
    const t = structuredClone(r.state);
    expect(attackRollBonus(t, 0)).toBe(0);
    t.cards[1].support.forEach((c) => c.card.type === "inspiration" && (c.status = "discarded"));
    expect(attackRollBonus(t, 0)).toBe(2);
  });

  it("Bishamon-ten — Hogosha: every warrior's attack rolls gain +1", () => {
    const s = withCard("s1-034");
    expect([attackRollBonus(s, 0), attackRollBonus(s, 1)]).toEqual([1, 1]);
    expect(defenseRollBonus(s, 1)).toBe(0);
    s.cards[0].support[0].status = "discarded";
    expect([attackRollBonus(s, 0), attackRollBonus(s, 1)]).toEqual([0, 0]);
  });

  it("Mercury — Nuntius (Reveal): every warrior gets +2 speed this round only", () => {
    const r = init(first(ALEX, "s1-077"), LEO, 1);
    expect(fired(r.events, "Mercury")).toEqual([expect.objectContaining({ effect: "all warriors get +2 speed this round" })]);
    expect(turnActions(r.state)).toEqual({ 0: ALEX.warrior.speed + 2, 1: LEO.warrior.speed + 2 });
    const s2 = nextRound(r.state);
    expect(turnActions(s2)).toEqual({ 0: ALEX.warrior.speed, 1: LEO.warrior.speed });
  });

  it("Yggdrassil — Asgard: your attacks +1 damage; Hvergelmir: all other warriors +1 speed", () => {
    const s = withCard("s7-P060");
    expect([damageBonus(s, 0), damageBonus(s, 0, LAKONIAN), damageBonus(s, 1)]).toEqual([1, 1, 0]);
    expect([continuousSpeed(s, 0), continuousSpeed(s, 1)]).toEqual([0, 1]);
    s.cards[0].support[0].status = "discarded";
    expect([damageBonus(s, 0), continuousSpeed(s, 1)]).toEqual([0, 0]);
  });

  it("in a real attack: Yggdrassil's +1 is in the hit's damage (after a crit doubles base damage)", () => {
    for (let rng = 1; rng < 500; rng++) {
      const s = myTurn(withCard("s7-P060"));
      s.warriors[0].facing = "S";
      s.warriors[1].position = { row: 2, col: 1 };
      s.rng = rng;
      const r = applyAction(s, getLegalActions(s).find((a) => a.type === "ATTACK" && !a.weapon)!);
      const res = r.events.find((e) => e.type === "attacked");
      if (res && res.type === "attacked" && res.hit) {
        expect(res.damageBonus).toBe(1);
        expect(res.damage).toBe(ALEX.warrior.damage * (res.crit ? 2 : 1) + 1);
        return;
      }
    }
    throw new Error("no hit found");
  });
});
