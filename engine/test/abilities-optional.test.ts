import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { chooseAction } from "../src/bot/choose";
import { REGISTRY } from "../src/abilities/registry";
import { defineCard } from "../src/abilities/format";
import { holds } from "../src/abilities/primitives";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");
const MAX = deck("Maximinus"); // Scutum (special) carries the Shield trait

const touched: string[] = [];
const define = (id: string, ...a: Parameters<typeof defineCard>[1][]) => (touched.push(id), defineCard(id, ...a));
afterEach(() => {
  for (const id of touched.splice(0)) delete REGISTRY[id];
});

describe("batch-2 conditions", () => {
  it("lowerLifeThanAttacker, haveShield, defenderNoArmor, attackKind", () => {
    const s = structuredClone(init(MAX, ALEX, 1).state);
    s.warriors[0].life = 3;
    s.warriors[1].life = 6;
    expect(holds({ kind: "lowerLifeThanAttacker" }, s, 0, { attacker: 1 })).toBe(true);
    expect(holds({ kind: "lowerLifeThanAttacker" }, s, 1, { attacker: 0 })).toBe(false);
    expect(holds({ kind: "lowerLifeThanAttacker" }, s, 0, {})).toBe(false); // no attack, no attacker
    expect(holds({ kind: "haveShield" }, s, 0)).toBe(false);
    s.cards[0].support.forEach((c) => (c.status = "in-play"));
    expect(MAX.support.some((c) => c.traits.some((t) => t.toLowerCase() === "shield"))).toBe(true);
    expect(holds({ kind: "haveShield" }, s, 0)).toBe(true);
    expect(holds({ kind: "defenderNoArmor" }, s, 1, { defender: 0 })).toBe(false); // Cassis (armor) now in play
    expect(holds({ kind: "defenderNoArmor" }, s, 0, { defender: 1 })).toBe(true); // Alexander's armor still face-down
    expect(holds({ kind: "attackKind", is: "basic" }, s, 0, { attackKind: "basic" })).toBe(true);
    expect(holds({ kind: "attackKind", is: "basic" }, s, 0, { attackKind: "weapon" })).toBe(false);
  });
});

describe("optional abilities: an attack-roll re-roll", () => {
  const giveReroll = () =>
    define(ALEX.warrior.id, {
      data: {
        name: "Second Chance",
        trigger: "attackRoll",
        usageLimit: "oncePerRound",
        effects: [{ kind: "reroll", roll: "attack", ifSame: [{ kind: "dealDamage", amount: 1, target: "defender" }] }],
      },
    });
  const standoff = (rng: number): GameState => {
    const s = structuredClone(init(ALEX, LEO, 1).state);
    Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, rng });
    s.warriors[0].position = { row: 0, col: 1 };
    s.warriors[0].facing = "S";
    s.warriors[1].position = { row: 1, col: 1 };
    s.warriors[1].life = 40;
    return s;
  };

  it("pauses the attack once both rolls are seen; only re-roll / keep are legal", () => {
    giveReroll();
    const r = applyAction(standoff(7), { type: "ATTACK" });
    expect(r.state.pending?.kind).toBe("reroll");
    expect(r.state.currentPlayer).toBe(0);
    expect(r.events.map((e) => e.type)).toEqual(["attackRolled"]);
    const legal = getLegalActions(r.state);
    expect(legal.every((a) => a.type === "REROLL" || a.type === "KEEP")).toBe(true);
    expect(legal).toContainEqual({ type: "KEEP" });
    expect(applyAction(r.state, { type: "PASS" }).events).toEqual([]);
  });

  it("is never forced: KEEP resolves exactly like the same attack without the ability", () => {
    const plain = applyAction(standoff(7), { type: "ATTACK" }).events.find((e) => e.type === "attacked");
    giveReroll();
    const kept = applyAction(applyAction(standoff(7), { type: "ATTACK" }).state, { type: "KEEP" }).events.find((e) => e.type === "attacked");
    expect(kept).toEqual(plain);
  });

  it("REROLL changes one die, once per round; a matching die deals the follow-up damage", () => {
    giveReroll();
    let sameRng = 0;
    let diffRng = 0;
    for (let rng = 1; rng < 3000 && (!sameRng || !diffRng); rng++) {
      const p = applyAction(standoff(rng), { type: "ATTACK" });
      if (p.state.pending?.kind !== "reroll") continue;
      const ev = applyAction(p.state, { type: "REROLL", die: 0 }).events.find((e) => e.type === "rerolled");
      if (ev?.type !== "rerolled") continue;
      if (ev.from === ev.to && !sameRng) sameRng = rng;
      if (ev.from !== ev.to && !diffRng) diffRng = rng;
    }
    const run = (rng: number) => {
      const p = applyAction(standoff(rng), { type: "ATTACK" });
      return applyAction(p.state, { type: "REROLL", die: 0 });
    };
    const diff = run(diffRng);
    const rolled = diff.events.find((e) => e.type === "rerolled");
    const attacked = diff.events.find((e) => e.type === "attacked");
    if (rolled?.type !== "rerolled" || attacked?.type !== "attacked") throw new Error("missing events");
    expect(diff.events.some((e) => e.type === "abilityFired")).toBe(false); // no match, no damage
    // the second attack this round is not offered a re-roll (used)
    const again = applyAction(diff.state, { type: "ATTACK" });
    expect(again.state.pending).toBeNull();
    // matching die: 1 damage to the defender, logged as the ability
    const same = run(sameRng);
    const lifeBefore = 40;
    const dealt = same.events.filter((e): e is Extract<GameEvent, { type: "attacked" }> => e.type === "attacked")[0].damage;
    expect(same.events).toContainEqual(expect.objectContaining({ type: "abilityFired", ability: "Second Chance", effect: "deals 1 damage to Leonidas" }));
    expect(same.state.warriors[1].life).toBe(lifeBefore - 1 - dealt);
  });

  it("the bot decides deterministically and only legally", () => {
    giveReroll();
    const p = applyAction(standoff(11), { type: "ATTACK" }).state;
    const a = chooseAction(p, "hard", 3);
    expect(getLegalActions(p)).toContainEqual(a);
    expect(chooseAction(p, "hard", 3)).toEqual(a);
  });
});
