// Batch-5 UI (#93): a pending ability choice on the board, effective experience in the stat panel,
// and ability dice rolls in the chronicle. All derived from the engine (display only).
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { init, experienceOf } from "@engine";
import type { GameState } from "@engine";
import { buildModel, choiceFacings, choiceTargets, selectedAction } from "../src/boardModel";
import { PlayerZone } from "../src/components/PlayerZone";
import { logEntry } from "../src/format";
import { DECKS } from "../src/decks";

const deck = (w: string) => DECKS.find((d) => d.warrior.name === w)!;

/** Player 0 decides where player 1 moves (as after a successful Mempo or Scutum roll). */
function choiceState(optional: boolean): GameState {
  const s = structuredClone(init(deck("Maximinus"), deck("Leonidas"), 1).state);
  s.warriors[1].position = { row: 3, col: 3 };
  s.warriors[1].facing = "N";
  s.pending = {
    kind: "choice",
    resume: 0,
    queue: [
      {
        player: 0,
        cardId: "s1-090",
        cardName: "Scutum",
        ability: "Scutatus",
        mover: 1,
        options: [
          { to: { row: 2, col: 3 }, facing: "N" },
          { to: { row: 3, col: 2 }, facing: "N" },
        ],
        optional,
      },
    ],
  };
  s.currentPlayer = 0;
  return s;
}

describe("batch-5 UI", () => {
  it("a pending choice lights its destinations; a picked cell + facing is the engine's CHOOSE", () => {
    const m = buildModel(choiceState(false));
    expect(m.choice?.mover).toBe(1);
    expect(choiceTargets(m)).toEqual(new Set(["2,3", "3,2"]));
    expect(choiceFacings(m, { row: 2, col: 3 })).toEqual(["N"]); // the displaced warrior keeps facing
    expect(m.choice?.decline).toBeUndefined(); // not optional
    const a = selectedAction(m, { kind: "choice", to: { row: 3, col: 2 }, facing: "N" });
    expect(a).toEqual({ type: "CHOOSE", to: { row: 3, col: 2 }, facing: "N" });
    expect(m.legal).toContainEqual(a);
    expect(buildModel(choiceState(true)).choice?.decline).toEqual({ type: "DECLINE" });
  });

  it("the stat panel shows effective experience, with the printed value when it differs", () => {
    const HER = deck("Herakles"); // carries Belt of Hippolyte (+4 experience)
    const s = structuredClone(init(HER, deck("Leonidas"), 1).state);
    const belt = s.cards[0].support.findIndex((c) => c.card.name === "Belt of Hippolyte");
    expect(belt).toBeGreaterThan(-1);
    s.cards[0].support[belt].status = "in-play";
    expect(experienceOf(s, 0)).toBe(HER.warrior.experience + 4);
    const html = renderToStaticMarkup(<PlayerZone state={s} pid={0} card={HER.warrior} controller="you" thinking={false} showFaceDown={false} />);
    expect(html).toContain(`>exp</dt><dd title="printed ${HER.warrior.experience}; changed by card abilities">${HER.warrior.experience + 4}<span class="muted">/${HER.warrior.experience}</span>`);
    s.cards[0].support[belt].status = "discarded";
    const plain = renderToStaticMarkup(<PlayerZone state={s} pid={0} card={HER.warrior} controller="you" thinking={false} showFaceDown={false} />);
    expect(plain).toContain(`>exp</dt><dd>${HER.warrior.experience}</dd>`);
  });

  it("the chronicle reports an ability's dice roll and its outcome", () => {
    const e = logEntry(
      { type: "abilityRolled", player: 0, cardId: "s1-022", cardName: "Izanagi", ability: "Zonrei", dice: [2, 3], total: 5, cmp: "<", target: 6, targetName: "your experience", success: true },
      ["Oda Nobunaga", "Leonidas"],
    );
    expect(e?.text).toBe("Izanagi — Zonrei: Oda Nobunaga rolls 2 + 3 = 5, needing less than Oda Nobunaga's experience, 6 — success.");
  });
});
