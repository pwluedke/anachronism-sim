import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { REGISTRY } from "../src/abilities/registry";
import { attackRollBonus, sources } from "../src/abilities/runtime";
import type { RuntimeAbility } from "../src/abilities/types";
import { indexCards, loadDeck, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great"); // support: Oracle of Delphi (r1), Sarissae (r2), ...
const LEO = deck("Leonidas"); // support: Nemesis (r1), ...

const registered: string[] = [];
function register(cardId: string, ...abilities: RuntimeAbility[]) {
  REGISTRY[cardId] = abilities;
  registered.push(cardId);
}
afterEach(() => {
  for (const id of registered.splice(0)) delete REGISTRY[id];
});

const fired = (events: GameEvent[]) =>
  events.flatMap((e) => (e.type === "abilityFired" ? [`P${e.player} ${e.cardName}: ${e.effect}`] : []));

/** PASS through a round; returns the new state and the events it produced. */
function passRound(s: GameState) {
  const ev: GameEvent[] = [];
  const round = s.round;
  while (s.phase === "playing" && s.round === round) {
    const r = applyAction(s, { type: "PASS" });
    ev.push(...r.events);
    s = r.state;
  }
  return { state: s, events: ev };
}

describe("ability runtime", () => {
  it("with no implemented abilities in play, hooks change nothing", () => {
    expect(sources(init(ALEX, LEO, 1).state, 0)).toEqual([]);
  });

  it("Reveal abilities fire only on the card revealed this round, initiative order, before start-of-round", () => {
    const reveal = (tag: string): RuntimeAbility => ({ name: "R", trigger: "reveal", fire: () => `reveal ${tag}` });
    register(ALEX.support[0].id, reveal("oracle"));
    register(LEO.support[0].id, reveal("nemesis"));
    register(ALEX.warrior.id, { name: "S", trigger: "roundStart", fire: () => "start" });
    const { state, events } = init(ALEX, LEO, 1); // Oracle (2) beats Nemesis (1): Alexander first
    expect(state.initiative).toBe(0);
    expect(fired(events)).toEqual([
      "P0 Oracle of Delphi: reveal oracle",
      "P1 Nemesis: reveal nemesis",
      "P0 Alexander the Great: start",
    ]);
    // Round 2 reveals other cards: the round-1 cards' Reveal abilities do not fire again.
    expect(fired(passRound(state).events)).toEqual(["P0 Alexander the Great: start"]);
  });

  it("face-down and discarded cards have no effect", () => {
    register(ALEX.support[3].id, { name: "C", trigger: "continuous", attackRoll: () => 5 }); // face-down until round 4
    const { state } = init(ALEX, LEO, 1);
    expect(attackRollBonus(state, 0)).toBe(0);
    const s = structuredClone(state);
    s.cards[0].support[3].status = "in-play";
    expect(attackRollBonus(s, 0)).toBe(5);
    s.cards[0].support[3].status = "discarded";
    expect(attackRollBonus(s, 0)).toBe(0);
  });

  it("damageDealt fires for the attacker after damage; once-per-round caps it and resets next round", () => {
    register(ALEX.warrior.id, {
      name: "Heal",
      trigger: "damageDealt",
      oncePerRound: true,
      fire: (ctx) => {
        ctx.state.warriors[ctx.owner].life += 1;
        return "gains 1 life";
      },
    });
    // Find an rng where Alexander's basic attack hits from (0,1) facing S onto (1,1).
    const base = (rng: number) => {
      const s = structuredClone(init(ALEX, LEO, 1).state);
      Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, rng });
      s.warriors[0].position = { row: 0, col: 1 };
      s.warriors[0].facing = "S";
      s.warriors[1].position = { row: 1, col: 1 };
      s.warriors[1].life = 30;
      s.warriors[0].life = 5;
      return s;
    };
    let s: GameState | null = null;
    for (let rng = 1; rng < 4000 && !s; rng++) {
      const r = applyAction(base(rng), { type: "ATTACK" });
      const a = applyAction(r.state, { type: "ATTACK" });
      const hits = [...r.events, ...a.events].filter((e) => e.type === "attacked" && e.hit).length;
      if (hits === 2) s = base(rng);
    }
    const r1 = applyAction(s!, { type: "ATTACK" });
    const order = r1.events.map((e) => e.type);
    expect(order.indexOf("attacked")).toBeLessThan(order.indexOf("abilityFired"));
    const r2 = applyAction(r1.state, { type: "ATTACK" });
    expect(r2.state.warriors[0].life).toBe(6); // two hits, healed once
    expect(fired([...r1.events, ...r2.events])).toEqual(["P0 Alexander the Great: gains 1 life"]);
    expect(r2.state.abilityUses).toHaveLength(1);
    expect(passRound(r2.state).state.abilityUses).toEqual([]); // reset at round end
  });

  it("thisRound effects expire at round end; nextTurn effects apply on the owner's next turn only", () => {
    register(LEO.support[0].id, {
      name: "Buff",
      trigger: "reveal",
      fire: (ctx) => {
        ctx.state.effects.push({ owner: ctx.owner, source: ctx.cardId, sourceName: ctx.cardName, ability: "Buff", kind: "attackRoll", amount: 1, duration: "thisRound", active: true });
        ctx.state.effects.push({ owner: ctx.owner, source: ctx.cardId, sourceName: ctx.cardName, ability: "Buff", kind: "speed", amount: 2, duration: "nextTurn", active: false });
        return "buffs";
      },
    });
    let { state } = init(ALEX, LEO, 1);
    expect(attackRollBonus(state, 1)).toBe(1);
    // Round 1: Leonidas's turn is his next turn after the reveal: +2 actions.
    state = applyAction(state, { type: "PASS" }).state; // Alexander passes; Leonidas's turn begins
    expect(state.currentPlayer).toBe(1);
    expect(state.actionsRemaining).toBe(state.warriors[1].speed + 2);
    const r2 = passRound(state).state;
    expect(r2.round).toBe(2);
    expect(r2.effects).toEqual([]); // the speed effect ended with that turn; +1 attack ended with the round
    expect(attackRollBonus(r2, 1)).toBe(0);
  });
});
