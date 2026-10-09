// Batch 5 (#92): the bot with experience changes, ability dice rolls (chance nodes) and the
// pending choices they create.
import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { evaluate } from "../src/bot/evaluate";
import { chooseAction } from "../src/bot/choose";
import { search } from "../src/bot/search";
import { getLegalActions } from "../src/legal";
import { selfPlaySides } from "../src/bot/selfplay";
import { indexCards, loadDeck, supportCard, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");
function with_(d: Deck, ...ids: string[]): Deck {
  const out = structuredClone(d);
  ids.forEach((id, i) => (out.support[i] = supportCard(cards[id])));
  return out;
}
const BATCH5 = ["s1-015", "s1-089", "s1-037", "s2-021", "s5-011", "s7-077", "s1-022", "s7-057", "s1-057", "s1-036", "s1-090", "s1-031", "s2-097"];

/** Alexander (player 0) with Mempo up, to move, Leonidas across the arena. */
function mempoTurn(rng: number): GameState {
  const s = structuredClone(init(ALEX, LEO, 1).state);
  s.cards[0].support[0] = { card: supportCard(cards["s1-031"]), status: "in-play" };
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, pending: null, rng });
  s.warriors[0].position = { row: 0, col: 1 };
  s.warriors[1].position = { row: 3, col: 2 };
  return s;
}

describe("bot with batch-5 abilities", () => {
  it("evaluation counts experience (effective, including continuous gains)", () => {
    const s = structuredClone(init(ALEX, LEO, 1).state);
    const wiser = structuredClone(s);
    wiser.warriors[0].experience += 3;
    expect(evaluate(wiser, 0)).toBeGreaterThan(evaluate(s, 0));
    const belted = structuredClone(s);
    belted.cards[0].support[0] = { card: supportCard(cards["s1-015"]), status: "in-play" }; // Belt: +4
    expect(evaluate(belted, 0)).toBeGreaterThan(evaluate(s, 0));
  });

  it("an ability's dice roll is a chance node: the search scores it the same whatever the real RNG holds", () => {
    const scores = [11, 222, 3333, 44444].map((rng) => {
      const s = mempoTurn(rng);
      const use = getLegalActions(s).findIndex((a) => a.type === "ABILITY" && a.card === "s1-031");
      expect(use).toBeGreaterThan(-1);
      return search(s, 2, { sampleSeed: 5 }).score;
    });
    expect(new Set(scores).size).toBe(1);
  });

  it("answers a pending choice (its own, or as the defender) with a legal action", () => {
    for (let rng = 1; rng < 400; rng++) {
      const s = mempoTurn(rng);
      const r = applyAction(s, getLegalActions(s).find((a) => a.type === "ABILITY" && a.card === "s1-031")!);
      if (r.state.pending?.kind !== "choice") continue;
      for (const d of ["easy", "medium", "hard"] as const) {
        const a = chooseAction(r.state, d, rng);
        expect(getLegalActions(r.state)).toContainEqual(a);
      }
      return;
    }
    throw new Error("no successful Mempo roll found");
  });

  it("self-play with decks carrying every batch-5 card: no illegal actions, clean termination", () => {
    const sides: Deck[] = [
      deck("Herakles"), // Belt of Hippolyte
      deck("Maximinus"), // Cassis, Scutum
      deck("Robin Hood"),
      deck("Itzcoatl"),
      deck("Aeneas"), // Afroditi
      deck("Oda Nobunaga"), // Izanagi
      deck("David"), // Golyath
      deck("Subedei"), // Yeke Mongghol Ulus
      with_(ALEX, "s1-031", "s1-057"), // Mempo, Mjollnir
      with_(LEO, "s1-036"), // Kimono
      with_(deck("Amazonia"), "s1-037"), // Haidate
    ];
    const carried = new Set(sides.flatMap((d) => [d.warrior.id, ...d.support.map((c) => c.id)]));
    for (const id of BATCH5) expect(carried.has(id)).toBe(true);
    const seen = new Set<string>();
    let games = 0;
    let choices = 0;
    for (let g = 0; g < sides.length * 2; g++) {
      const r = selfPlaySides(sides[g % sides.length], sides[(g + 4) % sides.length], g % 2 ? "medium" : "easy", "medium", 1500 + g); // throws on an illegal action
      expect(r.events[r.events.length - 1].type).toBe("gameEnded");
      games++;
      for (const e of r.events) {
        if ((e.type === "abilityFired" || e.type === "abilityRolled") && BATCH5.includes(e.cardId)) seen.add(e.cardName);
        if (e.type === "abilityFired" && /declines|moves .* to /.test(e.effect)) choices++;
      }
    }
    expect(games).toBe(22);
    console.log(`batch-5 self-play: ${games} games; ${choices} ability choices made; fired: ${[...seen].join(", ")}`);
  }, 900_000);
});
