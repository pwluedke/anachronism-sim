// Attack grids checked against the printed cards (data/images card scans). The spreadsheet left
// these blank; scraper/build_from_spreadsheet.py GRID_OVERRIDES restores them.
import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import slimCards from "../../data/preset_deck_cards.json";
import { init } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";

const records = allCards.cards as unknown as CardRecord[];
const cards = indexCards(records);
const filled = (id: string) => Object.fromEntries(Object.entries(cards[id].grid ?? {}).filter(([, v]) => v !== null));

describe("scan-verified warrior grids", () => {
  it("Carlos V (s5-076): +1 front-left, +0 to each side", () => {
    expect(filled("s5-076")).toEqual({ "2A": "+1", "3A": "+0", "3B": "marker", "3C": "+0" });
  });

  it("Maowvia (s5-061): +0 / +1 / +0 across the front", () => {
    expect(filled("s5-061")).toEqual({ "2A": "+0", "2B": "+1", "2C": "+0", "3B": "marker" });
  });

  it("Marcus Claudius Marcellus (s1-081) really has no grid — he attacks through his ability", () => {
    expect(filled("s1-081")).toEqual({ "3B": "marker" });
    const empty = records.filter((c) => c.card_type === "warrior" && c.grid && Object.values(c.grid).every((v) => v === null || v === "marker"));
    expect(empty.map((c) => c.name)).toEqual(["Marcus Claudius Marcellus"]);
  });

  it("the UI's slim deck data carries the same grids", () => {
    const slim = indexCards(slimCards.cards as unknown as CardRecord[]);
    for (const id of ["s5-076", "s5-061", "s1-081"]) if (slim[id]) expect(slim[id].grid).toEqual(cards[id].grid);
  });

  it("Carlos V can now make a basic attack (foe on his front-left diagonal)", () => {
    const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
    const s = structuredClone(init(deck("Carlos V"), deck("Leonidas"), 1).state);
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3 });
    s.warriors[0].position = { row: 1, col: 1 };
    s.warriors[0].facing = "S"; // front-left of a south-facing warrior is (2,2)
    s.warriors[1].position = { row: 2, col: 2 };
    expect(getLegalActions(s)).toContainEqual({ type: "ATTACK" });
  });
});
