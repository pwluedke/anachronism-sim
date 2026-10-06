import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { attackRollBonus, sources } from "../src/abilities/runtime";
import { REGISTRY } from "../src/abilities/registry";
import { IMPLEMENTED } from "../src/abilities/cards";
import { indexCards, loadAllDecks, loadDeck, warriorData, withOrder, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState } from "../src/types";

const records = allCards.cards as unknown as CardRecord[];
const cards = indexCards(records);
const recs = presets.decks as PresetDeckRecord[];
const deck = (w: string) => loadDeck(recs.find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");

/** TEST-ONLY deck: Shinmen Takezo is a promo card in no preset deck. */
const SHINMEN: Deck = { id: "test-shinmen", warrior: warriorData(cards["s1-P005"]), support: structuredClone(LEO.support) };

const abilityEvents = (ev: GameEvent[]) => ev.filter((e) => e.type === "abilityFired");

/** P0 to act at (0,1) facing S with the foe directly in front at (1,1). */
function standoff(s0: GameState, rng = 1): GameState {
  const s = structuredClone(s0);
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, rng, weaponsUsed: [] });
  s.warriors[0].position = { row: 0, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = { row: 1, col: 1 };
  s.warriors[1].life = 40;
  return s;
}

function passRound(s: GameState) {
  const ev: GameEvent[] = [];
  const round = s.round;
  while (s.phase === "playing" && s.round === round) {
    const r = applyAction(s, { type: "PASS" });
    ev.push(...r.events);
    s = r.state;
  }
  return { state: s, events: ev };
}

describe("first-batch card abilities", () => {
  it("exactly the implemented cards (batches 1-4) have abilities; everything else is inert", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(Object.keys(IMPLEMENTED).sort());
    expect(Object.keys(REGISTRY)).toHaveLength(45);
    const { decks } = loadAllDecks(recs, cards);
    const batch = new Set(Object.keys(IMPLEMENTED));
    for (const d of decks.filter((x) => ![x.warrior.id, ...x.support.map((c) => c.id)].some((id) => batch.has(id))).slice(0, 25)) {
      const s = structuredClone(init(d, ALEX, 1).state);
      s.cards[0].support.forEach((c) => (c.status = "in-play"));
      expect(sources(s, 0)).toEqual([]);
      expect(attackRollBonus(s, 0)).toBe(0);
    }
  });

  it("Shinmen Takezo: his attack rolls gain +2 (first clause only)", () => {
    const s = standoff(init(SHINMEN, ALEX, 1).state);
    expect(attackRollBonus(s, 0)).toBe(2);
    const e = applyAction(s, { type: "ATTACK" }).events.find((x) => x.type === "attacked");
    expect(e).toMatchObject({ rollBonus: 2 });
    expect(IMPLEMENTED["s1-P005"].partial).toMatch(/swords/);
  });

  it("Maximinus: +1 only while an inspiration is in play", () => {
    const MAX = deck("Maximinus"); // Pluto (inspiration) is slot 0
    expect(attackRollBonus(init(MAX, ALEX, 1).state, 0)).toBe(1); // Pluto revealed in round 1
    const late = withOrder(MAX, [1, 2, 3, 0]); // Pluto last
    let s = init(late, ALEX, 1).state;
    expect(attackRollBonus(s, 0)).toBe(0);
    for (let r = 1; r < 4; r++) s = passRound(s).state;
    expect(s.round).toBe(4);
    expect(attackRollBonus(s, 0)).toBe(1); // Pluto revealed in round 4
    const gone = structuredClone(s);
    gone.cards[0].support.find((c) => c.card.type === "inspiration")!.status = "discarded";
    expect(attackRollBonus(gone, 0)).toBe(0); // drops when the inspiration leaves play
  });

  it("Leonidas: gains 1 life after dealing damage, once per round — not once per hit", () => {
    let start: GameState | null = null;
    for (let rng = 1; rng < 5000 && !start; rng++) {
      const s = standoff(init(LEO, ALEX, 1).state, rng);
      const a = applyAction(s, { type: "ATTACK" });
      const b = applyAction(a.state, { type: "ATTACK" });
      if ([...a.events, ...b.events].filter((e) => e.type === "attacked" && e.hit).length === 2) start = s;
    }
    const a = applyAction(start!, { type: "ATTACK" });
    const b = applyAction(a.state, { type: "ATTACK" });
    expect(b.state.warriors[0].life).toBe(start!.warriors[0].life + 1);
    expect(abilityEvents([...a.events, ...b.events])).toEqual([
      expect.objectContaining({ cardName: "Leonidas", ability: "Molon Lave", effect: "gains 1 life" }),
    ]);
    // A miss deals no damage: no life.
    let missRng = 1;
    while (!applyAction(standoff(init(LEO, ALEX, 1).state, missRng), { type: "ATTACK" }).events.some((e) => e.type === "attacked" && !e.hit)) missRng++;
    const miss = applyAction(standoff(init(LEO, ALEX, 1).state, missRng), { type: "ATTACK" });
    expect(abilityEvents(miss.events)).toEqual([]);
    // The limit resets: next round he can gain again.
    expect(passRound(b.state).state.abilityUses).toEqual([]);
  });

  it("Apollo: Reveal — +1 to attack rolls for the round he is revealed only", () => {
    const MARC = deck("Marcus Claudius Marcellus"); // Apollo is slot 0
    const { state, events } = init(MARC, ALEX, 1);
    expect(abilityEvents(events)).toEqual([expect.objectContaining({ cardName: "Apollo", ability: "Cura Dei", effect: "+1 to attack rolls this round" })]);
    expect(attackRollBonus(state, 0)).toBe(1);
    const gone = structuredClone(state);
    gone.cards[0].support[0].status = "discarded";
    expect(attackRollBonus(gone, 0)).toBe(1); // a timed effect outlives its card
    const r2 = passRound(state);
    expect(attackRollBonus(r2.state, 0)).toBe(0); // expired at round end
    expect(abilityEvents(r2.events)).toEqual([]); // Apollo, already in play, doesn't reveal again
  });

  it("Carlos V: gains 1 life at round start only when he loses initiative", () => {
    const CARLOS = deck("Carlos V");
    const rigged = (inits: number[]) => {
      const d = structuredClone(ALEX);
      d.support.forEach((c, i) => (c.initiative = inits[i]));
      return d;
    };
    const carlosInits = CARLOS.support.map((c) => c.initiative ?? 0);
    // Opponent beats him in round 1 only.
    const opp = rigged([carlosInits[0] + 5, 0, 0, 0]);
    const r1 = init(CARLOS, opp, 1);
    expect(r1.state.initiative).toBe(1);
    expect(r1.state.warriors[0].life).toBe(CARLOS.warrior.life + 1);
    const carlos = (ev: GameEvent[]) => abilityEvents(ev).filter((e) => e.type === "abilityFired" && e.cardName === "Carlos V");
    expect(carlos(r1.events)).toEqual([expect.objectContaining({ cardName: "Carlos V", effect: "gains 1 life" })]);
    const r2 = passRound(r1.state);
    expect(r2.state.initiative).toBe(0); // he wins round 2
    expect(r2.state.warriors[0].life).toBe(CARLOS.warrior.life + 1); // no gain
    expect(carlos(r2.events)).toEqual([]);
  });

  it("Sun Tzu: Action — +1 speed on his next turn only (one action to use; stacks)", () => {
    const SUN = deck("Sun Tzu");
    let s = structuredClone(init(SUN, ALEX, 1).state);
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: s.warriors[0].speed });
    const act = { type: "ABILITY", card: "s2-041", ability: "Wu xing de si lue" } as const;
    expect(getLegalActions(s)).toContainEqual(act);
    const used = applyAction(s, act);
    expect(used.state.actionsRemaining).toBe(s.actionsRemaining - 1); // costs an action, no gain this turn
    expect(abilityEvents(used.events)).toEqual([expect.objectContaining({ effect: "+1 speed on the next turn" })]);
    // Finish the round; on his next turn he has speed + 1 actions; the turn after, back to speed.
    s = used.state;
    const speed = s.warriors[0].speed;
    const turnStarts: number[] = [];
    while (s.phase === "playing" && s.round <= 3) {
      const r = applyAction(s, { type: "PASS" });
      for (const e of r.events) if (e.type === "turnStarted" && e.player === 0) turnStarts.push(e.actions);
      s = r.state;
    }
    expect(turnStarts.slice(0, 2)).toEqual([speed + 1, speed]);
    // Used twice in one turn: +2 next turn.
    let t = structuredClone(init(SUN, ALEX, 1).state);
    Object.assign(t, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
    t = applyAction(applyAction(t, act).state, act).state;
    expect(t.effects.filter((e) => e.kind === "speed").reduce((n, e) => n + e.amount, 0)).toBe(2);
  });
});

describe("ability status for display", () => {
  it("a Reveal ability reports that it fired, this round and afterwards", async () => {
    const { abilityStatus } = await import("../src/abilities/runtime");
    const MARC = deck("Marcus Claudius Marcellus");
    const s1 = init(MARC, ALEX, 1).state;
    expect(abilityStatus(s1, 0)).toContainEqual(expect.objectContaining({ cardName: "Apollo", status: "used", detail: "fired on reveal this round" }));
    const s2 = passRound(s1).state;
    expect(abilityStatus(s2, 0)).toContainEqual(expect.objectContaining({ cardName: "Apollo", status: "used", detail: "fired when revealed" }));
  });
});
