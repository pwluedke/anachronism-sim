import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { chooseAction } from "../src/bot/choose";
import { selfPlaySides } from "../src/bot/selfplay";
import { indexCards, loadAllDecks, loadDeck, withOrder, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const recs = presets.decks as PresetDeckRecord[];
const deck = (w: string) => loadDeck(recs.find((d) => d.warrior.name === w)!, cards);
const ALEX = withOrder(deck("Alexander the Great"), [1, 0, 2, 3]); // Sarissae in play from round 1
const LEO = deck("Leonidas");
const SARISSAE = ALEX.support[0].id;

function setup(foe: { row: number; col: number }): GameState {
  const s = structuredClone(init(ALEX, LEO, 3).state);
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, weaponsUsed: [] });
  s.warriors[0].position = { row: 0, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = foe;
  return s;
}

describe("getLegalActions with weapons", () => {
  it("offers a weapon attack when the foe is in the weapon's grid, alongside (not instead of) the basic attack", () => {
    const farOnly = getLegalActions(setup({ row: 2, col: 1 })); // weapon reach only
    expect(farOnly).toContainEqual({ type: "ATTACK", weapon: SARISSAE });
    expect(farOnly).not.toContainEqual({ type: "ATTACK" });
  });

  it("drops the weapon attack once that weapon has been used this turn", () => {
    const s = setup({ row: 2, col: 1 });
    const after = applyAction(s, { type: "ATTACK", weapon: SARISSAE }).state;
    if (after.currentPlayer === 0) expect(getLegalActions(after)).not.toContainEqual({ type: "ATTACK", weapon: SARISSAE });
  });

  it("never offers a face-down weapon", () => {
    const s = structuredClone(init(deck("Alexander the Great"), LEO, 3).state); // Sarissae face-down in round 1
    expect(getLegalActions(s).some((a) => a.type === "ATTACK" && a.weapon)).toBe(false);
  });

  it("every listed action is accepted by applyAction in deck games", () => {
    let s: GameState = init(ALEX, LEO, 5).state;
    for (let i = 0; i < 40 && s.phase === "playing"; i++) {
      for (const a of getLegalActions(s)) expect(applyAction(s, a).events.length).toBeGreaterThan(0);
      s = applyAction(s, chooseAction(s, "easy", i)).state;
    }
  });
});

describe("bot with weapons", () => {
  it("takes a killing weapon attack when only the weapon reaches", () => {
    const s = setup({ row: 2, col: 1 });
    s.warriors[1].life = 1;
    for (const d of ["medium", "hard"] as const) expect(chooseAction(s, d, 1)).toEqual({ type: "ATTACK", weapon: SARISSAE });
  });

  it("self-play with preset decks runs clean across tiers, and weapons get used", () => {
    const { decks } = loadAllDecks(recs, cards);
    let weaponAttacks = 0;
    const pairs = [["easy", "easy"], ["medium", "easy"], ["medium", "medium"]] as const;
    for (let g = 0; g < 18; g++) {
      const [a, b] = pairs[g % pairs.length];
      const r = selfPlaySides(decks[(g * 7) % decks.length], decks[(g * 11 + 3) % decks.length], a, b, 100 + g);
      expect(r.events[r.events.length - 1].type).toBe("gameEnded");
      weaponAttacks += r.events.filter((e) => e.type === "attacked" && e.weapon !== null).length;
    }
    expect(weaponAttacks).toBeGreaterThan(0);
  }, 60_000);
});
