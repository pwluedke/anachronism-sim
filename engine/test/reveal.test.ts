import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { indexCards, loadDeck, withOrder, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState } from "../src/types";
import { ACHILLES } from "../fixtures/warriors";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = withOrder(deck("Leonidas"), [3, 2, 1, 0]);

/** Pass every turn, collecting each round's events; returns states at each round start. */
function playByPassing() {
  const start = init(ALEX, LEO, 5);
  let s: GameState = start.state;
  const rounds: GameEvent[][] = [start.events];
  const states = [s];
  while (s.phase === "playing") {
    const r = applyAction(s, { type: "PASS" });
    s = r.state;
    if (r.events.some((e) => e.type === "roundStarted")) {
      rounds.push(r.events.slice(r.events.findIndex((e) => e.type === "revealed" || e.type === "roundStarted")));
      states.push(s);
    }
  }
  return { rounds, states };
}

describe("round-start reveal", () => {
  const { rounds, states } = playByPassing();

  it("rounds 1-4 reveal each player's next face-down card, left to right", () => {
    for (let r = 0; r < 4; r++) {
      const rev = rounds[r].filter((e) => e.type === "revealed");
      expect(rev.map((e) => (e.type === "revealed" ? [e.player, e.slot, e.name] : []))).toEqual([
        [0, r, ALEX.support[r].name],
        [1, r, LEO.support[r].name],
      ]);
      for (const p of [0, 1] as const) {
        expect(states[r].cards[p].support.map((s) => s.status)).toEqual(
          [0, 1, 2, 3].map((i) => (i <= r ? "in-play" : "face-down")),
        );
        expect(states[r].cards[p].nextReveal).toBe(r + 1);
      }
    }
  });

  it("round 5 reveals nothing: all four cards are already in play", () => {
    expect(rounds).toHaveLength(5);
    expect(rounds[4].some((e) => e.type === "revealed")).toBe(false);
    for (const p of [0, 1] as const) expect(states[4].cards[p].support.every((s) => s.status === "in-play")).toBe(true);
  });

  it("reveals come before the round's initiative is announced", () => {
    const r1 = rounds[0].map((e) => e.type);
    expect(r1.lastIndexOf("revealed")).toBeLessThan(r1.indexOf("roundStarted"));
  });

  it("the revealed event carries the card's type and initiative", () => {
    const e = rounds[0].find((x) => x.type === "revealed" && x.player === 0);
    expect(e).toMatchObject({ cardId: ALEX.support[0].id, cardType: ALEX.support[0].type, initiative: ALEX.support[0].initiative });
  });

  it("a side without support cards reveals nothing", () => {
    const { events } = init(ACHILLES, ALEX, 1);
    expect(events.filter((e) => e.type === "revealed").map((e) => (e.type === "revealed" ? e.player : -1))).toEqual([1]);
  });
});
