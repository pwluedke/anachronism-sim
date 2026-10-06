// Milestone 12 fix (#85): diagonal ability moves (Achilles, Pythagoras) and the attacker-side
// "after you miss an attack" trigger (Richard the Lionheart), with the one-attack duration.
import { describe, it, expect } from "vitest";
import presets from "../../data/preset_decks.json";
import allCards from "../../data/all_cards.json";
import { init, applyAction } from "../src/engine";
import { getLegalActions } from "../src/legal";
import { moveOptions } from "../src/abilities/primitives";
import { attackRollBonus } from "../src/abilities/runtime";
import { indexCards, loadDeck, supportCard, type CardRecord, type PresetDeckRecord } from "../src/decks";
import type { Action, GameEvent, GameState, PlayerId } from "../src/types";

const cards = indexCards(allCards.cards as unknown as CardRecord[]);
const deck = (w: string) => loadDeck((presets.decks as PresetDeckRecord[]).find((d) => d.warrior.name === w)!, cards);
const ALEX = deck("Alexander the Great");
const LEO = deck("Leonidas");

function turn(s: GameState, p: PlayerId, at: [number, number], foe: [number, number]): GameState {
  const q: PlayerId = p === 0 ? 1 : 0;
  Object.assign(s, { phase: "playing", currentPlayer: p, turnOrder: [p, q], turnIndex: 0, actionsRemaining: 3, pending: null, movedThisTurn: false });
  s.warriors[p].position = { row: at[0], col: at[1] };
  s.warriors[q].position = { row: foe[0], col: foe[1] };
  return s;
}
const abilityMoves = (s: GameState, card: string) =>
  getLegalActions(s).filter((a): a is Extract<Action, { type: "ABILITY" }> => a.type === "ABILITY" && a.card === card);
const cells = (as: { to?: { row: number; col: number } }[]) => [...new Set(as.map((a) => `${a.to!.row},${a.to!.col}`))].sort();
const fired = (ev: GameEvent[], name: string) => ev.filter((e) => e.type === "abilityFired" && e.cardName === name);

describe("diagonal move", () => {
  it("one step corner to corner, never along a row or column, never onto a warrior, never off the arena", () => {
    const s = turn(structuredClone(init(ALEX, LEO, 1).state), 0, [1, 1], [0, 0]);
    expect(cells(moveOptions(s, 0, 1, true))).toEqual(["0,2", "2,0", "2,2"]); // (0,0) holds the foe
    expect(cells(moveOptions(s, 0, 1))).toEqual(["0,1", "1,0", "1,2", "2,1"]); // orthogonal default unchanged
    const corner = turn(structuredClone(s), 0, [3, 3], [0, 0]);
    expect(cells(moveOptions(corner, 0, 1, true))).toEqual(["2,2"]);
    // Any of the four facings after (rulebook p11: free rotate on an ability move; no diagonal facing).
    expect(moveOptions(corner, 0, 1, true).map((o) => o.facing).sort()).toEqual(["E", "N", "S", "W"]);
  });
});

describe("Achilles — Iroiki Taxitita (Action): \"Move one space diagonally.\"", () => {
  it("offered as an action per diagonal destination + facing; costs an action; no usage limit", () => {
    const s = turn(structuredClone(init(deck("Achilles"), LEO, 1).state), 0, [1, 1], [3, 3]);
    const moves = abilityMoves(s, "s1-091");
    expect(cells(moves)).toEqual(["0,0", "0,2", "2,0", "2,2"]);
    expect(moves).toHaveLength(16);
    const to22 = moves.find((a) => a.to!.row === 2 && a.to!.col === 2 && a.facing === "S")!;
    const r = applyAction(s, to22);
    expect(fired(r.events, "Achilles")).toEqual([expect.objectContaining({ effect: "moves 1 space diagonally" })]);
    expect(r.state.warriors[0].position).toEqual({ row: 2, col: 2 });
    expect(r.state.warriors[0].facing).toBe("S");
    expect(r.state.actionsRemaining).toBe(2);
    expect(r.state.movedThisTurn).toBe(true);
    expect(abilityMoves(r.state, "s1-091").length).toBeGreaterThan(0); // usable again
  });
});

describe("Pythagoras (inspiration) — Sintomotera Odos (Action): \"Move one space diagonally.\"", () => {
  it("usable while face up, not while face down", () => {
    const s = turn(structuredClone(init(ALEX, LEO, 1).state), 0, [1, 1], [3, 3]);
    s.cards[0].support[1] = { card: supportCard(cards["s1-017"]), status: "face-down" };
    expect(abilityMoves(s, "s1-017")).toHaveLength(0);
    s.cards[0].support[1].status = "in-play";
    expect(cells(abilityMoves(s, "s1-017"))).toEqual(["0,0", "0,2", "2,0", "2,2"]);
    const r = applyAction(s, abilityMoves(s, "s1-017")[0]);
    expect(fired(r.events, "Pythagoras")).toHaveLength(1);
    expect(r.state.actionsRemaining).toBe(2);
  });
});

describe("Richard the Lionheart — Fixe Strican: \"After you miss an attack, your next attack roll gains +2.\"", () => {
  const RICHARD = deck("Richard the Lionheart");
  /** Richard (player 0) adjacent to Leonidas, facing him with a legal basic attack. */
  function ready(rng: number): GameState {
    const s = turn(structuredClone(init(RICHARD, LEO, 1).state), 0, [1, 1], [2, 1]);
    s.warriors[1].life = 99;
    s.rng = rng;
    for (const f of ["S", "E", "W", "N"] as const) {
      s.warriors[0].facing = f;
      if (getLegalActions(s).some((a) => a.type === "ATTACK" && !a.weapon)) return s;
    }
    throw new Error("no basic attack");
  }
  const attackOnce = (s: GameState) => {
    const r = applyAction(s, { type: "ATTACK" });
    const e = r.events.find((x) => x.type === "attacked") as Extract<GameEvent, { type: "attacked" }>;
    return { r, e };
  };

  it("fires for the attacker after a miss (not after a hit); +2 on the next attack only", () => {
    let checkedMiss = false;
    let checkedHit = false;
    for (let rng = 1; rng < 400 && !(checkedMiss && checkedHit); rng++) {
      const { r, e } = attackOnce(ready(rng));
      if (!e.hit && !checkedMiss) {
        expect(fired(r.events, "Richard the Lionheart")).toEqual([expect.objectContaining({ effect: "+2 to attack rolls on the next attack" })]);
        expect(attackRollBonus(r.state, 0)).toBe(2);
        // The next attack gets +2; the one after only if that one missed too.
        const second = attackOnce(r.state);
        expect(second.e.rollBonus).toBe(2);
        const third = attackOnce(second.r.state);
        expect(third.e.rollBonus).toBe(second.e.hit ? 0 : 2);
        checkedMiss = true;
      } else if (e.hit && !checkedHit) {
        expect(fired(r.events, "Richard the Lionheart")).toEqual([]);
        expect(attackRollBonus(r.state, 0)).toBe(0);
        checkedHit = true;
      }
    }
    expect([checkedMiss, checkedHit]).toEqual([true, true]);
  });

  it("does not fire when Richard is the one attacked and missed", () => {
    for (let rng = 1; rng < 400; rng++) {
      const s = turn(structuredClone(init(RICHARD, LEO, 1).state), 1, [2, 1], [1, 1]); // Leonidas attacks
      s.rng = rng;
      let atk: Action | undefined;
      for (const f of ["N", "E", "W", "S"] as const) {
        s.warriors[1].facing = f;
        atk = getLegalActions(s).find((a) => a.type === "ATTACK" && !a.weapon);
        if (atk) break;
      }
      const r = applyAction(s, atk!);
      const e = r.events.find((x) => x.type === "attacked");
      if (e && e.type === "attacked" && !e.hit) {
        expect(fired(r.events, "Richard the Lionheart")).toEqual([]);
        return;
      }
    }
    throw new Error("no miss found");
  });
});
