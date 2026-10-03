import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init } from "../src/engine";
import { evaluate } from "../src/bot/evaluate";
import { chooseAction } from "../src/bot/choose";
import { selfPlaySides } from "../src/bot/selfplay";
import { indexCards, loadDeck, warriorData, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const recs = presets.decks as PresetDeckRecord[];
const deck = (w: string) => loadDeck(recs.find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");
const SHINMEN: Deck = { id: "test-shinmen", warrior: warriorData(cards["s1-P005"]), support: structuredClone(LEO.support) };

/** Mutual standoff: both adjacent and facing each other; P0 to move. */
function standoff(s0: GameState): GameState {
  const s = structuredClone(s0);
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
  s.warriors[0].position = { row: 1, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = { row: 2, col: 1 };
  s.warriors[1].facing = "N";
  s.warriors[0].life = s.warriors[1].life = 6;
  return s;
}

describe("bot evaluation with abilities", () => {
  it("a warrior with +2 to attack rolls evaluates as stronger than the same warrior without it", () => {
    const withAbility = standoff(init(SHINMEN, ALEX, 1).state);
    const without = structuredClone(withAbility);
    without.warriors[0].cardId = "no-ability"; // same stats and position, ability not registered
    expect(evaluate(withAbility, 0)).toBeGreaterThan(evaluate(without, 0));
  });

  it("a timed +1 (Apollo this round) counts while it lasts", () => {
    const s = standoff(init(ALEX, LEO, 1).state);
    const buffed = structuredClone(s);
    buffed.effects.push({ owner: 0, source: "s1-082", sourceName: "Apollo", ability: "Cura Dei", kind: "attackRoll", amount: 1, duration: "thisRound", active: true });
    expect(evaluate(buffed, 0)).toBeGreaterThan(evaluate(s, 0));
  });

  it("banked speed for the next turn is worth something", () => {
    const s = standoff(init(ALEX, LEO, 1).state);
    const banked = structuredClone(s);
    banked.effects.push({ owner: 0, source: "s2-041", sourceName: "Sun Tzu", ability: "x", kind: "speed", amount: 1, duration: "nextTurn", active: false });
    expect(evaluate(banked, 0)).toBeGreaterThan(evaluate(s, 0));
  });

  it("the bot uses Sun Tzu's action ability when it has nothing better to do", () => {
    // Far apart, can't reach anyone this turn: banking speed beats shuffling around.
    const s = structuredClone(init(deck("Sun Tzu"), ALEX, 1).state);
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 1 });
    s.warriors[0].position = { row: 0, col: 0 };
    s.warriors[1].position = { row: 3, col: 3 };
    expect(chooseAction(s, "medium", 1)).toEqual({ type: "ABILITY", card: "s2-041", ability: "Wu xing de si lue" });
  });

  it("self-play with every batch card in play runs clean, and abilities fire", () => {
    const sides = [SHINMEN, deck("Maximinus"), LEO, deck("Marcus Claudius Marcellus"), deck("Carlos V"), deck("Sun Tzu")];
    let fired = 0;
    for (let g = 0; g < sides.length; g++) {
      const a = sides[g];
      const b = sides[(g + 1) % sides.length];
      const r = selfPlaySides(a, b, g % 2 ? "medium" : "easy", "medium", 300 + g); // throws on any illegal action
      expect(r.events[r.events.length - 1].type).toBe("gameEnded");
      fired += r.events.filter((e) => e.type === "abilityFired").length;
    }
    expect(fired).toBeGreaterThan(0); // Leonidas, Apollo and Carlos V all fire in these games
  }, 60_000);
});
