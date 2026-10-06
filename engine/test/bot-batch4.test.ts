import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init } from "../src/engine";
import { evaluate } from "../src/bot/evaluate";
import { getLegalActions } from "../src/legal";
import { selfPlaySides } from "../src/bot/selfplay";
import { REGISTRY } from "../src/abilities/registry";
import { indexCards, loadDeck, supportCard, warriorData, type CardRecord, type Deck, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");
function first(d: Deck, id: string): Deck {
  const out = structuredClone(d);
  out.support[0] = supportCard(cards[id]);
  return out;
}
/** Warriors face to face, player 0 to move: each in the other's basic grid. */
function standoff(s0: GameState): GameState {
  const s = structuredClone(s0);
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
  s.warriors[0].position = { row: 1, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = { row: 2, col: 1 };
  s.warriors[1].facing = "N";
  return s;
}

const BATCH4 = ["s1-023", "s2-018", "s4-056", "s5-034", "s7-098", "s2-005", "s1-050", "s1-039", "s1-098", "s3-083", "s1-013", "s1-016", "s2-081", "s2-083", "s2-072", "s1-034", "s1-077", "s7-P060"];

describe("bot with batch-4 abilities", () => {
  it("values an 'all your attacks +1 damage' bonus on a basic attack", () => {
    const s = standoff(init(ALEX, LEO, 1).state);
    const boosted = structuredClone(s);
    boosted.effects.push({ owner: 0, source: "s1-039", sourceName: "Miyamoto Musashi", ability: "Niten Ichi Ryu", kind: "damage", amount: 1, duration: "thisRound", active: true });
    expect(evaluate(boosted, 0)).toBeGreaterThan(evaluate(s, 0));
  });

  it("sees Yggdrassil's speed for the opponent as a cost while their turn is still to come", () => {
    const s = standoff(init(ALEX, LEO, 1).state);
    const ygg = structuredClone(s);
    ygg.cards[0].support[0] = { card: supportCard(cards["s7-P060"]), status: "in-play" };
    const asgardOnly = structuredClone(ygg);
    const saved = REGISTRY["s7-P060"];
    REGISTRY["s7-P060"] = [saved[0]]; // Asgard only
    const without = evaluate(asgardOnly, 0);
    REGISTRY["s7-P060"] = saved;
    expect(evaluate(ygg, 0)).toBeLessThan(without);
  });

  it("getLegalActions offers Miyamoto's action ability", () => {
    const MIYA: Deck = { ...structuredClone(ALEX), warrior: warriorData(cards["s1-039"]) };
    const s = standoff(init(MIYA, LEO, 1).state);
    expect(getLegalActions(s)).toContainEqual(expect.objectContaining({ type: "ABILITY", card: "s1-039" }));
  });

  it("self-play with decks carrying every batch-4 card: no illegal actions, clean termination", () => {
    const sides: Deck[] = [
      deck("Oda Nobunaga"), deck("Richard the Lionheart"), deck("Cyrus The Great"), deck("Minamoto no Yoshitsune"),
      deck("Priam"), deck("Alfred the Great"), deck("Canute the Great"), deck("Spartacus"), deck("Rob Ruadh MacGriogair"),
      deck("Herakles"), deck("Milo of Croton"), deck("Gengis Khan"), deck("Srqt. The Scorpion King"), deck("Amazonia"),
      first({ ...structuredClone(ALEX), warrior: warriorData(cards["s1-039"]) }, "s1-034"), // Miyamoto + Bishamon-ten
      first(LEO, "s7-P060"), // Yggdrassil
    ];
    const carried = new Set(sides.flatMap((d) => [d.warrior.id, ...d.support.map((c) => c.id)]));
    for (const id of BATCH4) expect(carried.has(id)).toBe(true);
    const seen = new Set<string>();
    let games = 0;
    for (let g = 0; g < sides.length * 2; g++) {
      const a = sides[g % sides.length];
      const b = sides[(g + 5) % sides.length];
      const r = selfPlaySides(a, b, g % 2 ? "medium" : "easy", "medium", 1200 + g); // throws on an illegal action
      expect(r.events[r.events.length - 1].type).toBe("gameEnded");
      games++;
      for (const e of r.events) if (e.type === "abilityFired" && BATCH4.includes(e.cardId)) seen.add(e.cardName);
    }
    expect(games).toBe(32);
    expect(seen.size).toBeGreaterThan(0);
    console.log(`batch-4 self-play: ${games} games; fired: ${[...seen].join(", ")}`);
  }, 600_000);

  it("self-play after the Milestone 12 fix (one-attack durations, diagonal moves, Richard): clean", () => {
    const sides: Deck[] = [
      deck("Achilles"), deck("Milo of Croton"), deck("Richard the Lionheart"), deck("Alfred the Great"),
      deck("Srqt. The Scorpion King"), { ...structuredClone(ALEX), warrior: warriorData(cards["s1-039"]) },
    ];
    const FIX = ["s1-091", "s1-017", "s2-016", "s2-005", "s2-072", "s1-039"];
    const carried = new Set(sides.flatMap((d) => [d.warrior.id, ...d.support.map((c) => c.id)]));
    for (const id of FIX) expect(carried.has(id)).toBe(true);
    const seen = new Set<string>();
    let games = 0;
    for (let g = 0; g < sides.length * 2; g++) {
      const r = selfPlaySides(sides[g % sides.length], sides[(g + 1 + (g >> 1)) % sides.length], g % 2 ? "medium" : "easy", "medium", 1400 + g);
      expect(r.events[r.events.length - 1].type).toBe("gameEnded");
      games++;
      for (const e of r.events) if (e.type === "abilityFired" && FIX.includes(e.cardId)) seen.add(e.cardName);
    }
    expect(games).toBe(12);
    console.log(`fix self-play: ${games} games; fired: ${[...seen].join(", ")}`);
  }, 600_000);
});
