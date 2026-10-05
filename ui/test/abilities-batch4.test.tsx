// Batch-4 abilities in the ability list and the phase tracker (display only).
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAction, init, speedNow } from "@engine";
import type { GameState } from "@engine";
import { AbilityChips } from "../src/components/AbilityChips";
import { PhaseTracker } from "../src/components/PhaseTracker";
import { DECKS } from "../src/decks";

const deck = (w: string) => DECKS.find((d) => d.warrior.name === w)!;
const chips = (s: GameState, pid: 0 | 1, w: string) =>
  renderToStaticMarkup(<AbilityChips state={s} pid={pid} warrior={deck(w).warrior} showFaceDown={false} />);

describe("batch-4 abilities in the UI", () => {
  it("Gengis Khan's bonus is active against an opponent without a cavalry card, not against one with", () => {
    const vsLeo = init(deck("Gengis Khan"), deck("Leonidas"), 1).state;
    expect(chips(vsLeo, 0, "Gengis Khan")).toMatch(/Erkesiyeku ary-a[\s\S]*\+1 to attack rolls/);
    const vsRichard = init(deck("Gengis Khan"), deck("Richard the Lionheart"), 1).state; // a Cavalry warrior
    expect(chips(vsRichard, 0, "Gengis Khan")).toMatch(/Erkesiyeku ary-a[\s\S]*condition not met/);
  });

  it("Mercury's reveal shows as fired, and both players carry its +2 speed chip", () => {
    const AMAZONIA = deck("Amazonia");
    expect(AMAZONIA.support.some((c) => c.name === "Mercury")).toBe(true);
    const d = structuredClone(AMAZONIA);
    const i = d.support.findIndex((c) => c.name === "Mercury");
    [d.support[0], d.support[i]] = [d.support[i], d.support[0]]; // revealed in round 1
    const s = init(d, deck("Leonidas"), 1).state;
    expect(chips(s, 0, "Amazonia")).toMatch(/Nuntius[\s\S]*fired on reveal this round/);
    for (const [pid, w] of [[0, "Amazonia"], [1, "Leonidas"]] as const) expect(chips(s, pid, w)).toMatch(/\+2 speed[\s\S]*this round · Mercury/);
  });

  it("the phase tracker's action pips include speed abilities", () => {
    const CYRUS = structuredClone(deck("Cyrus The Great"));
    const cav = CYRUS.support.findIndex((c) => c.traits.includes("Cavalry"));
    expect(cav).toBeGreaterThan(-1);
    [CYRUS.support[0], CYRUS.support[cav]] = [CYRUS.support[cav], CYRUS.support[0]];
    let s = init(CYRUS, deck("Leonidas"), 1).state;
    if (s.currentPlayer !== 0) s = applyAction(s, { type: "PASS" }).state;
    expect(s.actionsRemaining).toBe(CYRUS.warrior.speed + 1);
    expect(speedNow(s, 0)).toBe(CYRUS.warrior.speed + 1);
    const html = renderToStaticMarkup(<PhaseTracker state={s} cards={[CYRUS.warrior, deck("Leonidas").warrior]} />);
    expect(html.match(/class="apip/g)).toHaveLength(CYRUS.warrior.speed + 1);
  });
});
