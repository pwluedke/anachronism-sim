import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { defenseRollBonus, weaponDamageBonus } from "../src/abilities/runtime";
import { moveOptions } from "../src/abilities/primitives";
import { indexCards, loadDeck, supportCard, withOrder, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // armor: Linen Cuirass (slot 2)
const LEO = deck("Leonidas");

/** TEST-ONLY deck: `base` with its card of `type` swapped for card `id` and moved to slot 0. */
function testDeck(base: Deck, type: string, id: string, label: string): Deck {
  const d = structuredClone(base);
  const i = d.support.findIndex((c) => c.type === type);
  d.support[i] = supportCard(cards[id]);
  d.id = label;
  return withOrder(d, [i, ...d.support.map((_, k) => k).filter((k) => k !== i)]);
}

const fired = (ev: GameEvent[]) => ev.filter((e) => e.type === "abilityFired");

/** `attacker` to act at (0,1) facing S, the other side at (1,1) — or `foe`. */
function standoff(s0: GameState, attacker: 0 | 1, rng: number, foe = { row: 1, col: 1 }): GameState {
  const s = structuredClone(s0);
  const def = attacker === 0 ? 1 : 0;
  Object.assign(s, { currentPlayer: attacker, turnOrder: [attacker, def], turnIndex: 0, actionsRemaining: 3, rng, weaponsUsed: [], abilityUses: [], pending: null });
  s.warriors[attacker].position = { row: 0, col: 1 };
  s.warriors[attacker].facing = "S";
  s.warriors[def].position = foe;
  s.warriors[def].life = Math.max(s.warriors[def].life, 1);
  return s;
}
const attackEvent = (ev: GameEvent[]) => {
  const e = ev.find((x) => x.type === "attacked");
  if (e?.type !== "attacked") throw new Error("no attack");
  return e;
};

describe("batch 2 cards", () => {
  it("Linen Cuirass: +1 defense only while its owner has lower life than the attacker", () => {
    const s = structuredClone(init(withOrder(ALEX, [2, 0, 1, 3]), LEO, 1).state); // Linen Cuirass revealed round 1
    s.warriors[0].life = 4;
    s.warriors[1].life = 6;
    expect(defenseRollBonus(s, 0)).toBe(1); // Alexander behind: Leonidas attacking him
    s.warriors[0].life = 6;
    expect(defenseRollBonus(s, 0)).toBe(0); // level
    s.warriors[0].life = 8;
    expect(defenseRollBonus(s, 0)).toBe(0); // ahead
  });

  it("Byrnies (test-only deck): Reveal — +2 defense for the revealed round only", () => {
    const BYR = testDeck(ALEX, "armor", "s1-054", "test-byrnies");
    const r1 = init(BYR, LEO, 1);
    expect(fired(r1.events)).toContainEqual(expect.objectContaining({ cardName: "Byrnies", ability: "Stalwart", effect: "+2 to defense rolls this round" }));
    expect(defenseRollBonus(r1.state, 0)).toBe(2);
    let s = r1.state;
    while (s.round === 1) s = applyAction(s, { type: "PASS" }).state;
    expect(defenseRollBonus(s, 0)).toBe(0);
  });

  it("Gladius (test-only deck): +1 with a shield, +1 vs no armor — both stack to +2", () => {
    const MAX = deck("Maximinus"); // Scutum (special) has the Shield trait
    const GL = testDeck(MAX, "weapon", "s1-071", "test-gladius");
    const s = structuredClone(init(GL, LEO, 1).state);
    expect(weaponDamageBonus(s, 0, "s1-071")).toBe(1); // no shield in play yet; Leonidas has no armor up: +1
    s.cards[0].support.forEach((c) => (c.status = "in-play")); // Scutum up
    expect(weaponDamageBonus(s, 0, "s1-071")).toBe(2); // shield + defender has no armor: +2
    s.cards[1].support.find((c) => c.card.type === "armor")!.status = "in-play";
    expect(weaponDamageBonus(s, 0, "s1-071")).toBe(1); // shield only
    // In a real attack: weapon damage + 2 on a non-crit hit
    const ready = structuredClone(init(GL, LEO, 1).state);
    ready.cards[0].support.filter((c) => c.card.type !== "armor").forEach((c) => (c.status = "in-play"));
    let e = null as ReturnType<typeof attackEvent> | null;
    for (let rng = 1; rng < 5000 && !e; rng++) {
      const ev = attackEvent(applyAction(standoff(ready, 0, rng), { type: "ATTACK", weapon: "s1-071" }).events);
      if (ev.hit && !ev.crit) e = ev;
    }
    expect(e).toMatchObject({ damageBonus: 2, damage: cards["s1-071"].damage! + 2 });
  });

  it("Khutulun: +1 life only when missed by a BASIC attack", () => {
    const KHU = deck("Khutulun");
    const atk = withOrder(ALEX, [1, 0, 2, 3]); // Sarissae in play from round 1
    const base = init(atk, KHU, 1).state;
    const life = (st: GameState) => st.warriors[1].life;
    let basicMiss = 0;
    let weaponMiss = 0;
    let basicHit = 0;
    for (let rng = 1; rng < 4000 && (!basicMiss || !weaponMiss || !basicHit); rng++) {
      const b = attackEvent(applyAction(standoff(base, 0, rng), { type: "ATTACK" }).events);
      if (!b.hit && !basicMiss) basicMiss = rng;
      if (b.hit && !basicHit) basicHit = rng;
      const wv = attackEvent(applyAction(standoff(base, 0, rng, { row: 2, col: 1 }), { type: "ATTACK", weapon: atk.support[0].id }).events);
      if (!wv.hit && !weaponMiss) weaponMiss = rng;
    }
    const s1 = standoff(base, 0, basicMiss);
    const r1 = applyAction(s1, { type: "ATTACK" });
    expect(life(r1.state)).toBe(life(s1) + 1);
    expect(fired(r1.events)).toEqual([expect.objectContaining({ cardName: "Khutulun", effect: "gains 1 life" })]);
    const s2 = standoff(base, 0, weaponMiss, { row: 2, col: 1 });
    expect(life(applyAction(s2, { type: "ATTACK", weapon: atk.support[0].id }).state)).toBe(life(s2)); // weapon miss: nothing
    const s3 = standoff(base, 0, basicHit);
    expect(fired(applyAction(s3, { type: "ATTACK" }).events)).toEqual([]); // a hit: nothing
  });

  it("Subedei: optional re-roll of one attack die, once per round; damage only on a matching die", () => {
    const SUB = deck("Subedei");
    const base = init(SUB, LEO, 1).state;
    const DIAG = { row: 1, col: 0 }; // his grid has no straight-ahead cell; facing S, his +1 diagonal is A-II
    const p = applyAction(standoff(base, 0, 5, DIAG), { type: "ATTACK" });
    expect(p.state.pending).toMatchObject({ kind: "reroll", cardName: "Subedei" });
    expect(getLegalActions(p.state)).toContainEqual({ type: "KEEP" }); // optional
    // matching vs non-matching new die
    let same = 0;
    let diff = 0;
    for (let rng = 1; rng < 3000 && (!same || !diff); rng++) {
      const q = applyAction(standoff(base, 0, rng, DIAG), { type: "ATTACK" });
      if (q.state.pending?.kind !== "reroll") continue;
      const ev = applyAction(q.state, { type: "REROLL", die: 1 }).events.find((e) => e.type === "rerolled");
      if (ev?.type !== "rerolled") continue;
      if (ev.from === ev.to && !same) same = rng;
      if (ev.from !== ev.to && !diff) diff = rng;
    }
    const reroll = (rng: number) => applyAction(applyAction(standoff(base, 0, rng, DIAG), { type: "ATTACK" }).state, { type: "REROLL", die: 1 });
    expect(fired(reroll(diff).events)).toEqual([]);
    const hit = reroll(same);
    expect(fired(hit.events)).toEqual([expect.objectContaining({ cardName: "Subedei", effect: "deals 1 damage to Leonidas" })]);
    // once per round: the next attack this round isn't offered it
    expect(applyAction(reroll(diff).state, { type: "ATTACK" }).state.pending).toBeNull();
  });

  it("Salah ad-Din: Action — move two spaces, costs an action, once per round", () => {
    const SAL = deck("Salah ad-Din");
    const s = structuredClone(init(SAL, LEO, 1).state);
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
    s.warriors[0].position = { row: 0, col: 0 };
    s.warriors[1].position = { row: 3, col: 3 };
    const moves = getLegalActions(s).filter((a) => a.type === "ABILITY" && a.card === "s5-066");
    expect(moves.length).toBe(moveOptions(s, 0, 2).length);
    const r = applyAction(s, { type: "ABILITY", card: "s5-066", ability: "Saria", to: { row: 1, col: 1 }, facing: "S" });
    expect(r.state.warriors[0].position).toEqual({ row: 1, col: 1 });
    expect(r.state.actionsRemaining).toBe(2);
    expect(getLegalActions(r.state).some((a) => a.type === "ABILITY" && a.card === "s5-066")).toBe(false);
  });

  it("Vlad Tepes: deals 1 damage to the opponent at the start of the game", () => {
    const VLAD = deck("Vlad Tepes");
    const { state, events } = init(VLAD, LEO, 1);
    expect(state.warriors[1].life).toBe(LEO.warrior.life - 1);
    expect(fired(events)).toEqual([expect.objectContaining({ cardName: "Vlad Tepes", effect: "deals 1 damage to Leonidas" })]);
    const mirror = init(LEO, VLAD, 1); // works from either seat
    expect(mirror.state.warriors[0].life).toBe(LEO.warrior.life - 1);
  });
});
