import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { judge } from "../src/combat";
import { REGISTRY } from "../src/abilities/registry";
import { defineCard } from "../src/abilities/format";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");
const w = init(ALEX, LEO, 1).state.warriors;

const touched: string[] = [];
afterEach(() => {
  for (const id of touched.splice(0)) delete REGISTRY[id];
});

describe("defense-roll modifiers in combat", () => {
  it("a defense bonus turns a hit into a miss", () => {
    const plain = judge([4, 3], [3, 3], 0, w[0], w[1], 1); // 7 vs 6: hit
    const guarded = judge([4, 3], [3, 3], 0, w[0], w[1], 1, 0, 2); // 7 vs 6+2 = 8: miss
    expect(plain.result).toMatchObject({ hit: true, defenderTotal: 6 });
    expect(guarded.result).toMatchObject({ hit: false, defenseBonus: 2, defenderTotal: 8, damage: 0 });
  });

  it("ties are judged on the modified totals", () => {
    const tie = judge([4, 3], [3, 3], 0, w[0], w[1], 1, 0, 1); // 7 vs 6+1
    expect(tie.result.tiebreak).not.toBeNull();
  });

  it("a crit doubles the base damage before ability damage is added (p13)", () => {
    const r = judge([5, 5], [1, 2], 0, { ...w[0], damage: 2 }, w[1], 1, 0, 0, 1);
    expect(r.result).toMatchObject({ hit: true, crit: true, damageBonus: 1, damage: 2 * 2 + 1 });
  });

  it("the engine applies the defender's ability bonus to a real attack", () => {
    const standoff = (rng: number): GameState => {
      const s = structuredClone(init(ALEX, LEO, 1).state);
      Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, rng });
      s.warriors[0].position = { row: 0, col: 1 };
      s.warriors[0].facing = "S";
      s.warriors[1].position = { row: 1, col: 1 };
      return s;
    };
    const attacked = (s: GameState) => {
      const e = applyAction(s, { type: "ATTACK" }).events.find((x) => x.type === "attacked");
      if (e?.type !== "attacked") throw new Error("no attack");
      return e;
    };
    // find a narrow hit: attack total beats defense by 1-2
    let rng = 1;
    for (; rng < 5000; rng++) {
      const e = attacked(standoff(rng));
      if (e.hit && !e.tiebreak && e.attackerTotal - e.defenderRoll <= 2) break;
    }
    expect(attacked(standoff(rng)).hit).toBe(true);
    touched.push(LEO.warrior.id);
    defineCard(LEO.warrior.id, { data: { name: "Shield Wall", trigger: "continuous", effects: [{ kind: "defenseRoll", amount: 3 }] } });
    const e = attacked(standoff(rng));
    expect(e).toMatchObject({ defenseBonus: 3, hit: false, damage: 0 });
    expect(e.defenderTotal).toBe(e.defenderRoll + 3);
  });
});
