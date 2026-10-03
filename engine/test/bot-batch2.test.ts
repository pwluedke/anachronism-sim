import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init } from "../src/engine";
import { evaluate } from "../src/bot/evaluate";
import { chooseAction } from "../src/bot/choose";
import { getLegalActions } from "../src/legal";
import { selfPlaySides } from "../src/bot/selfplay";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");

function standoff(s0: GameState): GameState {
  const s = structuredClone(s0);
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
  s.warriors[0].position = { row: 1, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = { row: 2, col: 1 };
  s.warriors[1].facing = "N";
  return s;
}

describe("bot with batch-2 effects", () => {
  it("a defense bonus makes the defender evaluate as harder to hit", () => {
    const s = standoff(init(ALEX, LEO, 1).state);
    const guarded = structuredClone(s);
    guarded.effects.push({ owner: 1, source: "s1-054", sourceName: "Byrnies", ability: "Stalwart", kind: "defenseRoll", amount: 2, duration: "thisRound", active: true });
    expect(evaluate(guarded, 1)).toBeGreaterThan(evaluate(s, 1));
  });

  it("the bot answers a pending re-roll with a legal choice", () => {
    const SUB = deck("Subedei");
    let s = standoff(init(SUB, LEO, 1).state);
    s.warriors[1].position = { row: 2, col: 0 }; // Subedei's +1 diagonal (facing S from B-II)
    for (let rng = 1; rng < 200; rng++) {
      const t = structuredClone(s);
      t.rng = rng;
      const a = chooseAction(t, "medium", 2);
      expect(getLegalActions(t)).toContainEqual(a);
    }
  });

  it("self-play with batch-1 and batch-2 decks runs clean", () => {
    const sides = [deck("Khutulun"), deck("Subedei"), deck("Salah ad-Din"), deck("Vlad Tepes"), ALEX, LEO, deck("Sun Tzu")];
    const seen = new Set<string>();
    for (let g = 0; g < sides.length; g++) {
      const r = selfPlaySides(sides[g], sides[(g + 2) % sides.length], g % 2 ? "medium" : "easy", "medium", 900 + g); // throws on an illegal action
      expect(r.events[r.events.length - 1].type).toBe("gameEnded");
      for (const e of r.events) if (e.type === "abilityFired" || e.type === "rerolled") seen.add(e.type === "rerolled" ? "re-roll" : e.cardName);
    }
    expect(seen.has("Vlad Tepes")).toBe(true);
    expect(seen.size).toBeGreaterThan(2);
  }, 120_000);
});
