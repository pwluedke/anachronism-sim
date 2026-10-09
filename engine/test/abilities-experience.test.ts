// Batch 5 (#88): experience as a modifiable stat, and the experience-comparison condition.
import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction, determineInitiative } from "../src/engine";
import { holds } from "../src/abilities/primitives";
import { experienceOf } from "../src/abilities/experience";
import { defineCard, type AbilityData } from "../src/abilities/format";
import { REGISTRY } from "../src/abilities/registry";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // inert warrior: test abilities go on him
const LEO = deck("Leonidas");

const saved = new Map<string, (typeof REGISTRY)[string] | undefined>();
function give(cardId: string, ...abilities: AbilityData[]) {
  if (!saved.has(cardId)) saved.set(cardId, REGISTRY[cardId]);
  defineCard(cardId, ...abilities.map((data) => ({ data })));
}
afterEach(() => {
  for (const [id, prev] of saved) prev ? (REGISTRY[id] = prev) : delete REGISTRY[id];
  saved.clear();
});
function nextRound(s: GameState): GameState {
  const r = s.round;
  while (s.round === r && s.phase === "playing") s = applyAction(s, { type: "PASS" }).state;
  return s;
}

describe("experience: gain / lose", () => {
  it("a fired gain is permanent: it persists across rounds (rulebook p17)", () => {
    give(ALEX.warrior.id, { name: "Learn", trigger: "gameStart", effects: [{ kind: "experience", amount: 3 }] });
    const s = init(ALEX, LEO, 1).state;
    expect(s.warriors[0].experience).toBe(ALEX.warrior.experience + 3);
    const later = nextRound(nextRound(s));
    expect(later.round).toBe(3);
    expect(experienceOf(later, 0)).toBe(ALEX.warrior.experience + 3);
  });

  it("a loss can target another warrior; a duration makes it timed instead of permanent", () => {
    give(ALEX.warrior.id, { name: "Shame", trigger: "gameStart", effects: [{ kind: "experience", amount: -2, who: "opponent" }] });
    expect(experienceOf(init(ALEX, LEO, 1).state, 1)).toBe(LEO.warrior.experience - 2);
    give(ALEX.warrior.id, { name: "Rush", trigger: "gameStart", effects: [{ kind: "experience", amount: 4 }], duration: "thisRound" });
    const s = init(ALEX, LEO, 1).state;
    expect(s.warriors[0].experience).toBe(ALEX.warrior.experience); // the warrior's value is untouched
    expect(experienceOf(s, 0)).toBe(ALEX.warrior.experience + 4);
    expect(experienceOf(nextRound(s), 0)).toBe(ALEX.warrior.experience);
  });

  it("continuous: 'You gain +N experience' counts while its card is in play, and decides ties", () => {
    give(ALEX.warrior.id, { name: "Wise", trigger: "continuous", effects: [{ kind: "experience", amount: 9 }] });
    const s = structuredClone(init(ALEX, LEO, 1).state);
    expect(experienceOf(s, 0)).toBe(ALEX.warrior.experience + 9);
    expect(s.warriors[0].experience).toBe(ALEX.warrior.experience);
    // Initiative tie on card values: decided by effective experience.
    const eff = s.warriors.map((w) => ({ ...w, experience: experienceOf(s, w.playerId) })) as GameState["warriors"];
    expect(determineInitiative(eff, s.rng, [3, 3]).initiative).toBe(0);
  });
});

describe("experience comparison", () => {
  it("more / less experience than the attacker / defender: both branches", () => {
    const s = structuredClone(init(ALEX, LEO, 1).state);
    s.warriors[0].experience = 6;
    s.warriors[1].experience = 4;
    const as = (than: "attacker" | "defender", cmp: "more" | "less") => ({ kind: "experienceVs", cmp, than }) as const;
    expect(holds(as("attacker", "more"), s, 0, { attacker: 1, defender: 0 })).toBe(true);
    expect(holds(as("attacker", "less"), s, 0, { attacker: 1, defender: 0 })).toBe(false);
    expect(holds(as("defender", "less"), s, 1, { attacker: 1, defender: 0 })).toBe(true);
    expect(holds(as("defender", "more"), s, 1, { attacker: 1, defender: 0 })).toBe(false);
    s.warriors[1].experience = 6; // equal: neither more nor less
    expect(holds(as("attacker", "more"), s, 0, { attacker: 1, defender: 0 })).toBe(false);
    expect(holds(as("attacker", "less"), s, 0, { attacker: 1, defender: 0 })).toBe(false);
    expect(holds(as("attacker", "more"), s, 0, {})).toBe(false); // no attack
  });

  it("compares effective experience (continuous gains count)", () => {
    give(ALEX.warrior.id, { name: "Wise", trigger: "continuous", effects: [{ kind: "experience", amount: 9 }] });
    const s = structuredClone(init(ALEX, LEO, 1).state);
    expect(holds({ kind: "experienceVs", cmp: "more", than: "defender" }, s, 0, { attacker: 0, defender: 1 })).toBe(true);
  });
});
