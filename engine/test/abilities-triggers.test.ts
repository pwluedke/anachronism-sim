import { describe, it, expect, afterEach } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { REGISTRY } from "../src/abilities/registry";
import type { RuntimeAbility } from "../src/abilities/types";
import { indexCards, loadDeck, withOrder, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { GameEvent, GameState } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = withOrder(deck("Alexander the Great"), [1, 0, 2, 3]); // Sarissae (weapon) in play from round 1
const ACH = deck("Leonidas");

const touched: string[] = [];
const register = (id: string, ...a: RuntimeAbility[]) => {
  touched.push(id);
  REGISTRY[id] = a;
};
afterEach(() => {
  for (const id of touched.splice(0)) delete REGISTRY[id];
});
const fired = (ev: GameEvent[]) => ev.flatMap((e) => (e.type === "abilityFired" ? [`P${e.player} ${e.ability}: ${e.effect}`] : []));

/** P0 to act at (0,1) facing S; foe at `foe` with lots of life. */
function standoff(rng: number, foe = { row: 1, col: 1 }): GameState {
  const s = structuredClone(init(ALEX, ACH, 1).state);
  Object.assign(s, { currentPlayer: 0, turnOrder: [0, 1], turnIndex: 0, actionsRemaining: 3, rng, weaponsUsed: [], abilityUses: [] });
  s.warriors[0].position = { row: 0, col: 1 };
  s.warriors[0].facing = "S";
  s.warriors[1].position = foe;
  s.warriors[1].life = 40;
  return s;
}
const findRng = (pred: (s: GameState) => boolean) => {
  for (let rng = 1; rng < 5000; rng++) if (pred(standoff(rng))) return rng;
  throw new Error("no rng");
};
const outcome = (s: GameState, a: { type: "ATTACK"; weapon?: string }) => applyAction(s, a).events.find((e) => e.type === "attacked");

describe("new triggers", () => {
  it("gameStart fires once, at setup, before round 1 — and its damage can end the game there", () => {
    register(ALEX.warrior.id, {
      name: "Opening",
      trigger: "gameStart",
      fire: (ctx) => {
        ctx.state.warriors[1].life -= 1;
        return "deals 1 damage";
      },
    });
    const { state, events } = init(ALEX, ACH, 1);
    expect(fired(events)).toEqual(["P0 Opening: deals 1 damage"]);
    expect(events.findIndex((e) => e.type === "abilityFired")).toBeLessThan(events.findIndex((e) => e.type === "roundStarted"));
    expect(state.warriors[1].life).toBe(ACH.warrior.life - 1);
    // not again in later rounds
    let s = state;
    const later: GameEvent[] = [];
    while (s.phase === "playing" && s.round < 3) {
      const r = applyAction(s, { type: "PASS" });
      later.push(...r.events);
      s = r.state;
    }
    expect(fired(later)).toEqual([]);
    // lethal at setup: the game ends before round 1
    const frail = structuredClone(ACH);
    frail.warrior.life = 1;
    const dead = init(ALEX, frail, 1);
    expect(dead.state.phase).toBe("ended");
    expect(dead.state.winner).toBe(0);
    expect(dead.events.some((e) => e.type === "roundStarted")).toBe(false);
  });

  it("missed fires for the defender after a miss, knowing basic vs weapon; never on a hit", () => {
    const seen: string[] = [];
    register(ACH.warrior.id, { name: "Dodge", trigger: "missed", fire: (ctx) => (seen.push(ctx.attackKind!), "dodged") });
    const missBasic = findRng((s) => (outcome(s, { type: "ATTACK" }) as any)?.hit === false);
    const far = { row: 2, col: 1 };
    let rngW = 1;
    while ((outcome(standoff(rngW, far), { type: "ATTACK", weapon: ALEX.support[0].id }) as any)?.hit !== false) rngW++;
    seen.length = 0; // the seed searches above ran real attacks too
    const ev = applyAction(standoff(missBasic), { type: "ATTACK" }).events;
    expect(fired(ev)).toEqual(["P1 Dodge: dodged"]);
    expect(ev.map((e) => e.type).indexOf("attacked")).toBeLessThan(ev.map((e) => e.type).indexOf("abilityFired"));
    // a weapon miss (Sarissae reaches two rows ahead)
    applyAction(standoff(rngW, far), { type: "ATTACK", weapon: ALEX.support[0].id });
    expect(seen).toEqual(["basic", "weapon"]);
    const hitRng = findRng((s) => (outcome(s, { type: "ATTACK" }) as any)?.hit === true);
    expect(fired(applyAction(standoff(hitRng), { type: "ATTACK" }).events)).toEqual([]);
  });

  it("hit fires for the defender after taking damage, after the attacker's damage abilities", () => {
    register(ALEX.warrior.id, { name: "Strike", trigger: "damageDealt", fire: () => "struck" });
    register(ACH.warrior.id, { name: "Riposte", trigger: "hit", fire: () => "is hit" });
    const hitRng = findRng((s) => (outcome(s, { type: "ATTACK" }) as any)?.hit === true);
    expect(fired(applyAction(standoff(hitRng), { type: "ATTACK" }).events)).toEqual(["P0 Strike: struck", "P1 Riposte: is hit"]);
  });
});
