// The 4x4 arena drawn as a region on an aged map, rendered PURELY from GameState.
// Engine convention: row 0 at the top (player 0's start), row 3 at the bottom (player 1's), N = up.
// Overlays (attack grids, etc.) are computed by the engine and passed in; the arena only draws them.
import type { CardData, Facing, GameState, Warrior } from "@engine";
import { Portrait } from "./Portrait";
import { Compass } from "./Compass";

const COLS = ["A", "B", "C", "D"];
const ROWS = ["I", "II", "III", "IV"];
const FACING_DEG: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };

export const cellKey = (r: number, c: number) => `${r},${c}`;

function Token({ w, card, active }: { w: Warrior; card: CardData; active: boolean }) {
  return (
    <div
      className={`token p${w.playerId}${active ? " active" : ""}`}
      title={`${card.name} (player ${w.playerId === 0 ? "I" : "II"}) facing ${w.facing}`}
    >
      <div className="token-facing" style={{ transform: `rotate(${FACING_DEG[w.facing]}deg)` }}>
        <span className="token-pointer" />
      </div>
      <Portrait cardId={card.id} name={card.name} className="token-portrait" />
      <span className="token-badge">{w.playerId === 0 ? "I" : "II"}</span>
    </div>
  );
}

export function Arena({
  state,
  cards,
  threat,
}: {
  state: GameState;
  cards: [CardData, CardData];
  /** Active warrior's projected attack grid: cell key -> modifier. */
  threat?: Map<string, number>;
}) {
  const size = state.arenaSize;
  const warriorAt = (r: number, c: number) =>
    state.warriors.find((w) => w.position.row === r && w.position.col === c);

  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const k = cellKey(r, c);
      const w = warriorAt(r, c);
      const mod = threat?.get(k);
      cells.push(
        <div key={k} className={`map-cell${mod !== undefined ? " in-threat" : ""}`} data-rc={k}>
          {mod !== undefined && <span className="cell-mod">{mod >= 0 ? `+${mod}` : mod}</span>}
          {w && (
            <Token
              w={w}
              card={cards[w.playerId]}
              active={state.phase === "playing" && w.playerId === state.currentPlayer}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <div className="map parchment" aria-label="arena">
      <div className="map-coords map-coords-top" aria-hidden="true">
        {COLS.slice(0, size).map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="map-coords map-coords-left" aria-hidden="true">
        {ROWS.slice(0, size).map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="map-grid" style={{ gridTemplateColumns: `repeat(${size}, var(--cell))` }}>
        {cells}
      </div>
      <Compass />
    </div>
  );
}
