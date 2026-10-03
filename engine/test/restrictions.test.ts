import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { violations, cardViolations } from "../src/cards";
import { chooseAction } from "../src/bot/choose";
import {
  DeckLoadError,
  forcedDiscards,
  indexCards,
  loadAllDecks,
  loadDeck,
  type CardRecord,
  type PresetDeckRecord,
} from "../src/decks";
import type { GameEvent, GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const recs = presets.decks as PresetDeckRecord[];
const deck = (w: string) => loadDeck(recs.find((d) => d.warrior.name === w)!, cards);

const lastOf = <T extends GameEvent["type"]>(log: GameEvent[], type: T, player?: number) =>
  [...log].reverse().find((e) => e.type === type && (player === undefined || ("player" in e && e.player === player))) as
    | Extract<GameEvent, { type: T }>
    | undefined;

/** PASS through rounds until a discard is pending (or the game ends). */
function untilPending(a: ReturnType<typeof deck>, b: ReturnType<typeof deck>, seed = 1) {
  let { state, events } = init(a, b, seed);
  const log: GameEvent[] = [...events];
  while (state.phase === "playing" && !state.pending) {
    const r = applyAction(state, { type: "PASS" });
    state = r.state;
    log.push(...r.events);
  }
  return { state, log };
}

describe("card restrictions", () => {
  it("deck-load rejects duplicate card names", () => {
    const rec = structuredClone(recs[0]);
    rec.support[3] = { ...rec.support[0] };
    expect(() => loadDeck(rec, cards)).toThrow(DeckLoadError);
    expect(() => loadDeck(rec, cards)).toThrow(/duplicate support card/);
  });

  it("no preset deck is illegal; exactly the 10 known decks force a discard in play", () => {
    const { decks, failed } = loadAllDecks(recs, cards);
    expect(failed).toEqual([]);
    const forced = decks.filter((d) => forcedDiscards(d).length > 0);
    expect(forced).toHaveLength(10);
    expect(forced.map((d) => d.warrior.name)).toEqual(expect.arrayContaining(["Gengis Khan", "Canute the Great", "Raibeart Brus"]));
  });

  it("the rules: one card per type, one per restricted trait, max 2 hands", () => {
    const c = (id: string, type: string, traits: string[] = [], hands = 0) => ({ id, type, traits, hands });
    expect(cardViolations([c("a", "weapon"), c("b", "weapon")])[0]).toMatchObject({ rule: "type", cards: ["a", "b"] });
    expect(cardViolations([c("a", "armor", ["Head"]), c("b", "special", ["head"])])[0]).toMatchObject({ rule: "trait" });
    expect(cardViolations([c("a", "weapon", [], 2), c("b", "special", ["Shield"], 1), c("x", "armor")])[0]).toMatchObject({
      rule: "hands",
      cards: ["a", "b"],
    });
    expect(cardViolations([c("a", "weapon", [], 1), c("b", "special", ["Shield"], 1)])).toEqual([]);
  });

  it("a reveal over the hands limit pauses round start for the player's choice of discard", () => {
    const GK = deck("Gengis Khan");
    const { state, log } = untilPending(GK, deck("Alexander the Great"));
    expect(state.pending).toMatchObject({ kind: "discard", queue: [0] });
    expect(state.currentPlayer).toBe(0);
    const req = lastOf(log, "discardRequired");
    expect(req).toMatchObject({ player: 0, reasons: [expect.stringMatching(/hands/)] });
    // Only discards of the offending cards are legal; nothing else does anything.
    const legal = getLegalActions(state);
    expect(legal.every((a) => a.type === "DISCARD")).toBe(true);
    expect(new Set(legal.map((a) => (a.type === "DISCARD" ? a.card : "")))).toEqual(new Set(violations(state, 0)[0].cards));
    expect(applyAction(state, { type: "PASS" }).events).toEqual([]);
    const notOffending = state.cards[0].support.find((s) => s.status === "in-play" && s.card.hands === 0)!;
    expect(applyAction(state, { type: "DISCARD", card: notOffending.card.id }).events).toEqual([]);
    // Discard one: legal again, the round's first turn begins with the initiative winner.
    const choice = legal[legal.length - 1];
    const r = applyAction(state, choice);
    expect(r.state.pending).toBeNull();
    expect(violations(r.state, 0)).toEqual([]);
    expect(r.events.map((e) => e.type)).toEqual(["discarded", "turnStarted"]);
    expect(r.state.currentPlayer).toBe(r.state.turnOrder[0]);
    expect(r.state.actionsRemaining).toBeGreaterThan(0);
  });

  it("the revealed card's initiative counts even if that card is discarded", () => {
    const { state, log } = untilPending(deck("Gengis Khan"), deck("Alexander the Great"));
    const rs = lastOf(log, "roundStarted");
    const justRevealed = lastOf(log, "revealed", 0);
    if (!rs || !justRevealed) throw new Error("missing events");
    expect(rs.initiativeValues[0]).toBe(justRevealed.initiative);
    const after = applyAction(state, { type: "DISCARD", card: justRevealed.cardId }).state;
    expect(after.turnOrder).toEqual(state.turnOrder); // initiative unchanged by the discard
  });

  it("two Head cards trigger the trait rule", () => {
    const { state } = untilPending(deck("Canute the Great"), deck("Leonidas"));
    expect(violations(state, 0)).toEqual([expect.objectContaining({ rule: "trait", detail: "2 head cards" })]);
  });

  it("when both players are over a limit, they resolve in initiative order", () => {
    const { state } = untilPending(deck("Canute the Great"), deck("Raibeart Brus"), 3);
    const queue = state.pending?.kind === "discard" ? state.pending.queue : [];
    expect(queue).toEqual(state.turnOrder.filter((p) => violations(state, p).length > 0));
    expect(queue).toHaveLength(2);
    let s: GameState = state;
    const order: number[] = [];
    while (s.pending) {
      order.push(s.currentPlayer);
      s = applyAction(s, getLegalActions(s)[0]).state;
    }
    expect(order).toEqual(queue);
  });

  it("the bot resolves its own discards and the game finishes", () => {
    let { state } = untilPending(deck("Gengis Khan"), deck("Canute the Great"), 9);
    expect(state.pending).not.toBeNull();
    while (state.pending) {
      const a = chooseAction(state, "medium", 4);
      expect(a.type).toBe("DISCARD");
      expect(getLegalActions(state)).toContainEqual(a);
      state = applyAction(state, a).state;
    }
    for (let i = 0; i < 400 && state.phase === "playing"; i++) state = applyAction(state, chooseAction(state, "medium", 4)).state;
    expect(state.phase).toBe("ended");
  });
});
