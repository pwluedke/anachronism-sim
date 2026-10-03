// The 4x4 arena drawn as a region on an aged map, rendered PURELY from GameState plus overlays
// the parent derives from the engine (attack grids, reachable cells). No game logic here.
// Engine convention: row 0 at the top (player 0's start), row 3 at the bottom (player 1's), N = up.
import type { CardData, Facing, GameState, Position, Warrior } from "@engine";
import { Portrait } from "./Portrait";
import { Compass } from "./Compass";

const COLS = ["A", "B", "C", "D"];
const ROWS = ["I", "II", "III", "IV"];
const FACINGS: Facing[] = ["N", "E", "S", "W"];
const FACING_DEG: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };
const FACING_NAME: Record<Facing, string> = { N: "north", E: "east", S: "south", W: "west" };

const keyOf = (r: number, c: number) => `${r},${c}`;

export interface CaretSet {
  cell: Position;
  offered: Facing[];
  chosen: Facing | null;
  onHover: (f: Facing | null) => void;
  onPick: (f: Facing) => void;
}

export interface ArenaProps {
  state: GameState;
  cards: [CardData, CardData];
  /** Attack-grid overlay to draw: cell key -> modifier. */
  grid?: Map<string, number>;
  /** True when `grid` is a preview of a pending choice rather than the current position. */
  gridIsPreview?: boolean;
  /** Reachable destination cells (keys). */
  reach?: Set<string>;
  /** Ink path for a pending move. */
  path?: { from: Position; to: Position } | null;
  carets?: CaretSet | null;
  /** Interaction handlers; omitted when it is not the viewer's turn. */
  onCellClick?: (p: Position) => void;
  onOwnTokenClick?: () => void;
  onEnemyTokenClick?: () => void;
  canAttack?: boolean;
}

function Token({
  w,
  card,
  active,
  onClick,
  hint,
  targetable,
}: {
  w: Warrior;
  card: CardData;
  active: boolean;
  onClick?: () => void;
  hint?: string;
  targetable?: boolean;
}) {
  const label = `${card.name} (player ${w.playerId === 0 ? "I" : "II"}) facing ${FACING_NAME[w.facing]}`;
  const body = (
    <>
      <div className="token-facing" style={{ transform: `rotate(${FACING_DEG[w.facing]}deg)` }}>
        <span className="token-pointer" />
      </div>
      <Portrait cardId={card.id} name={card.name} className="token-portrait" />
      <span className="token-badge">{w.playerId === 0 ? "I" : "II"}</span>
    </>
  );
  const cls = `token p${w.playerId}${active ? " active" : ""}${targetable ? " targetable" : ""}`;
  if (!onClick) {
    return (
      <div className={cls} title={label}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${cls} clickable`}
      title={hint ? `${label} — ${hint}` : label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {body}
    </button>
  );
}

function Carets({ set }: { set: CaretSet }) {
  return (
    <div className="carets" onMouseLeave={() => set.onHover(null)}>
      {FACINGS.filter((f) => set.offered.includes(f)).map((f) => (
        <button
          key={f}
          type="button"
          className={`caret caret-${f}${set.chosen === f ? " chosen" : ""}`}
          aria-label={`face ${FACING_NAME[f]}`}
          title={`Face ${FACING_NAME[f]}`}
          onMouseEnter={() => set.onHover(f)}
          onFocus={() => set.onHover(f)}
          onClick={(e) => {
            e.stopPropagation();
            set.onPick(f);
          }}
        >
          <span className="caret-tip" />
        </button>
      ))}
    </div>
  );
}

export function Arena(props: ArenaProps) {
  const { state, cards, grid, gridIsPreview, reach, path, carets, canAttack } = props;
  const size = state.arenaSize;
  const playing = state.phase === "playing";
  const warriorAt = (r: number, c: number) =>
    state.warriors.find((w) => w.position.row === r && w.position.col === c);

  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const k = keyOf(r, c);
      const w = warriorAt(r, c);
      const mod = grid?.get(k);
      const reachable = reach?.has(k) ?? false;
      const isCaretCell = !!carets && carets.cell.row === r && carets.cell.col === c;
      const isMine = !!w && playing && w.playerId === state.currentPlayer;
      const cls = [
        "map-cell",
        mod !== undefined ? (gridIsPreview ? "in-preview" : "in-threat") : "",
        reachable ? "reachable" : "",
        isCaretCell ? "destination" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const onCell = reachable && props.onCellClick ? () => props.onCellClick!({ row: r, col: c }) : undefined;
      cells.push(
        <div key={k} className={cls} data-rc={k} onClick={onCell} title={onCell ? `Move to ${COLS[c]}${ROWS[r]}` : undefined}>
          {mod !== undefined && <span className="cell-mod">{mod >= 0 ? `+${mod}` : mod}</span>}
          {w && (
            <Token
              w={w}
              card={cards[w.playerId]}
              active={playing && w.playerId === state.currentPlayer}
              onClick={isMine ? props.onOwnTokenClick : canAttack ? props.onEnemyTokenClick : undefined}
              hint={isMine ? "rotate in place" : canAttack ? "attack" : undefined}
              targetable={!isMine && !!canAttack}
            />
          )}
          {isCaretCell && carets && <Carets set={carets} />}
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
        {path && (
          <svg className="map-path" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none" aria-hidden="true">
            <line
              x1={path.from.col + 0.5}
              y1={path.from.row + 0.5}
              x2={path.to.col + 0.5}
              y2={path.to.row + 0.5}
              className="map-path-line"
            />
            <circle cx={path.to.col + 0.5} cy={path.to.row + 0.5} r="0.07" className="map-path-dot" />
          </svg>
        )}
      </div>
      <Compass />
    </div>
  );
}
