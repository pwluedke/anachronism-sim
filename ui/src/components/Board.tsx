// Renders the 4x4 arena and both warriors PURELY from GameState. No game logic.
// Highlighted cells (the active warrior's projected attack grid) are computed by
// the engine and passed in by the parent (see #21) — the board only draws them.
import type { GameState, Warrior, Facing } from "@engine";

const ARROW: Record<Facing, string> = { N: "↑", E: "→", S: "↓", W: "←" };

export interface Highlight {
  mod: number;
}

export function Board({
  state,
  highlights,
}: {
  state: GameState;
  highlights?: Map<string, Highlight>;
}) {
  const size = state.arenaSize;
  const warriorAt = (r: number, c: number): Warrior | undefined =>
    state.warriors.find((w) => w.position.row === r && w.position.col === c);

  const rows = [];
  for (let r = 0; r < size; r++) {
    const cells = [];
    for (let c = 0; c < size; c++) {
      const w = warriorAt(r, c);
      const hl = highlights?.get(`${r},${c}`);
      const active = w && w.playerId === state.currentPlayer;
      cells.push(
        <div
          key={c}
          className={`cell${hl ? " hl" : ""}`}
          data-rc={`${r},${c}`}
        >
          {hl && (
            <span className="mod">
              {hl.mod >= 0 ? `+${hl.mod}` : hl.mod}
            </span>
          )}
          {w && (
            <div
              className={`warrior p${w.playerId}${active ? " active" : ""}`}
              title={`${w.name} (P${w.playerId}) facing ${w.facing}`}
            >
              <span className="tag">P{w.playerId}</span>
              <span className="arrow">{ARROW[w.facing]}</span>
            </div>
          )}
        </div>,
      );
    }
    rows.push(
      <div key={r} className="row">
        {cells}
      </div>,
    );
  }
  return (
    <div className="board" aria-label="arena">
      {rows}
    </div>
  );
}
