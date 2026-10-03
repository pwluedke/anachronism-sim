import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init } from "../src/engine";
import { REGISTRY } from "../src/abilities/registry";
import { compileAbility, defineCard } from "../src/abilities/format";
import { attackRollBonus } from "../src/abilities/runtime";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");

const touched: string[] = [];
const define = (id: string, ...a: Parameters<typeof defineCard>[1][]) => {
  touched.push(id);
  defineCard(id, ...a);
};
afterEach(() => {
  for (const id of touched.splice(0)) delete REGISTRY[id];
});

describe("ability authoring format", () => {
  it("compiles a continuous data ability into an attack-roll contribution", () => {
    const a = compileAbility({ name: "X", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 2 }] });
    expect(a.trigger).toBe("continuous");
    expect(a.attackRoll!(init(ALEX, LEO, 1).state, 0)).toBe(2);
  });

  it("compiles a fired data ability with its usage limit", () => {
    const a = compileAbility({ name: "Y", trigger: "damageDealt", usageLimit: "oncePerRound", effects: [{ kind: "gainLife", amount: 1 }] });
    expect(a).toMatchObject({ name: "Y", trigger: "damageDealt", oncePerRound: true });
    expect(typeof a.fire).toBe("function");
  });

  it("rejects combinations the runtime can't do", () => {
    expect(() => compileAbility({ name: "a", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 1 }], duration: "thisRound" })).toThrow();
    expect(() => compileAbility({ name: "b", trigger: "continuous", effects: [{ kind: "gainLife", amount: 1 }] })).toThrow();
    expect(() => compileAbility({ name: "c", trigger: "reveal", effects: [{ kind: "attackRoll", amount: 1 }] })).toThrow(/duration/);
    expect(() => compileAbility({ name: "d", trigger: "action", effects: [{ kind: "speed", amount: 1 }], duration: "permanent" })).toThrow();
  });

  it("defineCard registers data and coded abilities against a card id; both run", () => {
    define(ALEX.warrior.id, { data: { name: "Data", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 1 }] } });
    define(LEO.support[0].id, {
      coded: {
        name: "Coded",
        trigger: "reveal",
        fire: (ctx) => {
          ctx.state.warriors[ctx.owner].experience += 10; // nothing in the primitives does this
          return "gains 10 experience";
        },
      },
    });
    const { state, events } = init(ALEX, LEO, 1);
    expect(attackRollBonus(state, 0)).toBe(1);
    expect(state.warriors[1].experience).toBe(LEO.warrior.experience + 10);
    expect(events).toContainEqual(expect.objectContaining({ type: "abilityFired", cardName: "Nemesis", effect: "gains 10 experience" }));
  });
});
