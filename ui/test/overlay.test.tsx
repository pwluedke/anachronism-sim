// The board must draw exactly the engine's projection. Renders the real Arena with the overlay the
// app derives (boardModel.gridAt) and compares the drawn cells + modifiers to projectGrid.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { init, projectGrid } from "@engine";
import type { Facing, GameState, Position } from "@engine";
import { ACHILLES, AJAX } from "@fixtures";
import { Arena } from "../src/components/Arena";
import { gridAt } from "../src/boardModel";

const FACINGS: Facing[] = ["N", "E", "S", "W"];

function drawn(state: GameState, grid: Map<string, number>, preview: boolean): Map<string, number> {
  const html = renderToStaticMarkup(
    <Arena state={state} cards={[ACHILLES, AJAX]} grid={grid} gridIsPreview={preview} />,
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Position = where the cell is actually drawn (row-major order in the 4x4 grid), not its data-rc label.
  const cells = [...doc.querySelectorAll(".map-grid > .map-cell")];
  expect(cells).toHaveLength(16);
  const out = new Map<string, number>();
  cells.forEach((cell, i) => {
    if (!cell.classList.contains(preview ? "in-preview" : "in-threat")) return;
    const text = cell.querySelector(".cell-mod")?.textContent ?? "";
    out.set(`${Math.floor(i / 4)},${i % 4}`, Number(text.replace("+", "")));
  });
  return out;
}

function engine(pos: Position, facing: Facing): Map<string, number> {
  return new Map(projectGrid(AJAX.grid, pos, facing, 4).map((pc) => [`${pc.cell.row},${pc.cell.col}`, pc.mod]));
}

function bottomPlayerState(pos: Position, facing: Facing, foe: Position): GameState {
  const s = structuredClone(init(ACHILLES, AJAX, 1).state);
  s.currentPlayer = 1;
  s.warriors[1].position = pos;
  s.warriors[1].facing = facing;
  s.warriors[0].position = foe;
  return s;
}

describe("attack-grid overlay matches the engine projection for the bottom player (player 1)", () => {
  for (const col of [0, 1, 2, 3]) {
    const pos = { row: 3, col };
    for (const facing of FACINGS) {
      it(`Ajax at row 3 col ${col}, current facing ${facing}`, () => {
        const s = bottomPlayerState(pos, facing, { row: 0, col: 3 });
        expect(drawn(s, gridAt(s, pos, facing), false)).toEqual(engine(pos, facing));
      });
      it(`Ajax at row 3 col ${col}, rotate preview to ${facing}`, () => {
        const s = bottomPlayerState(pos, "N", { row: 0, col: 3 });
        expect(drawn(s, gridAt(s, pos, facing), true)).toEqual(engine(pos, facing));
      });
    }
  }

  it("draws the modifier for a cell the opponent stands on (badge above the token)", () => {
    const pos = { row: 3, col: 1 };
    const foe = { row: 2, col: 1 }; // Ajax facing N: 2B (+1) covers (2,1)
    const s = bottomPlayerState(pos, "N", foe);
    const shown = drawn(s, gridAt(s, pos, "N"), false);
    expect(shown).toEqual(engine(pos, "N"));
    expect(shown.get("2,1")).toBe(1);
  });
});
