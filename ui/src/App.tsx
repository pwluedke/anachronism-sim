// Table shell. Holds the engine GameState via useGame; renders it and routes chosen actions back
// through the engine. NO rules here — legality comes from getLegalActions (via boardModel).
import { useEffect, useMemo, useState } from "react";
import type { Action, Facing, GameEvent } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";
import { useGame } from "./useGame";
import { Arena } from "./components/Arena";
import { ActionBar } from "./components/ActionBar";
import { EventLog } from "./components/EventLog";
import { PlayerZone } from "./components/PlayerZone";
import { PhaseTracker } from "./components/PhaseTracker";
import { DiceArea } from "./components/DiceArea";
import { winnerText } from "./format";
import {
  NO_SELECTION,
  buildModel,
  cellKey,
  gridAt,
  selectedAction,
  selectionCell,
  type Selection,
} from "./boardModel";

type GameEndedEvent = Extract<GameEvent, { type: "gameEnded" }>;
const CARDS: [typeof PLAYER_0, typeof PLAYER_1] = [PLAYER_0, PLAYER_1];
const NAMES: [string, string] = [PLAYER_0.name, PLAYER_1.name];
const COLS = ["A", "B", "C", "D"];
const ROWS = ["I", "II", "III", "IV"];
const FACING_NAME: Record<Facing, string> = { N: "north", E: "east", S: "south", W: "west" };

export function App() {
  const { view, dispatch, newGame } = useGame(PLAYER_0, PLAYER_1, 1);
  const { state, log } = view;
  const playing = state.phase === "playing";

  const model = useMemo(() => (playing ? buildModel(state) : null), [state, playing]);
  const [sel, setSel] = useState<Selection>(NO_SELECTION);
  const [hover, setHover] = useState<Facing | null>(null);
  useEffect(() => {
    setSel(NO_SELECTION);
    setHover(null);
  }, [state]);

  const active = state.warriors[state.currentPlayer];
  const target = model ? selectionCell(model, sel) : null;
  const shownFacing = sel.kind === "none" ? null : (hover ?? sel.facing);

  const grid = useMemo(() => {
    if (!playing) return new Map<string, number>();
    if (target && shownFacing) return gridAt(state, target, shownFacing);
    return gridAt(state, active.position, active.facing);
  }, [state, playing, target, shownFacing, active]);

  const confirm = model ? selectedAction(model, sel) : undefined;
  const act = (a: Action) => dispatch(a);
  const cancel = () => {
    setSel(NO_SELECTION);
    setHover(null);
  };

  const onCellClick = (p: { row: number; col: number }) => {
    const dir = model?.reach.get(cellKey(p));
    if (!model || !dir) return;
    const offered = model.moveFacings(dir);
    setHover(null);
    setSel({ kind: "move", dir, facing: offered.includes(active.facing) ? active.facing : null });
  };
  const onOwnTokenClick = () => {
    if (!model || model.rotateFacings.length === 0) return;
    setHover(null);
    setSel(sel.kind === "rotate" ? NO_SELECTION : { kind: "rotate", facing: null });
  };

  const name = CARDS[state.currentPlayer].name;
  let prompt = "The battle is over.";
  if (playing && target && sel.kind === "move") {
    const where = `${COLS[target.col]}${ROWS[target.row]}`;
    prompt = sel.facing
      ? `${name} marches to ${where}, facing ${FACING_NAME[sel.facing]}. Confirm, or pick another facing.`
      : `Choose ${name}'s facing at ${where}.`;
  } else if (playing && sel.kind === "rotate") {
    prompt = sel.facing ? `${name} turns ${FACING_NAME[sel.facing]}. Confirm, or pick another facing.` : `Choose a new facing for ${name}.`;
  } else if (playing) {
    prompt = `${name}: pick a destination, click ${name} to turn in place${model?.attack ? ", or attack" : ""}.`;
  }

  const ended =
    state.phase === "ended"
      ? ([...log].reverse().find((e) => e.type === "gameEnded") as GameEndedEvent | undefined)
      : undefined;

  return (
    <main className="table">
      <header className="table-header">
        <h1>Anachronism</h1>
        <div className="header-controls">
          <button className="btn" onClick={() => newGame(Date.now() | 0)}>
            New game
          </button>
        </div>
      </header>

      {ended && <div className="banner">{winnerText(ended.winner, ended.reason, NAMES)}</div>}

      <PlayerZone state={state} pid={0} card={CARDS[0]} />

      <div className="midfield">
        <aside className="side-left">
          <PhaseTracker state={state} cards={CARDS} />
          <DiceArea log={log} />
        </aside>
        <div className="arena-column">
          <Arena
            state={state}
            cards={CARDS}
            grid={grid}
            gridIsPreview={!!(target && shownFacing)}
            reach={model && sel.kind !== "rotate" ? new Set(model.reach.keys()) : undefined}
            path={model && sel.kind === "move" && target ? { from: model.origin, to: target } : null}
            carets={
              model && target && sel.kind !== "none"
                ? {
                    cell: target,
                    offered: sel.kind === "move" ? model.moveFacings(sel.dir) : model.rotateFacings,
                    chosen: sel.facing,
                    onHover: setHover,
                    onPick: (f) => setSel({ ...sel, facing: f }),
                  }
                : null
            }
            onCellClick={model ? onCellClick : undefined}
            onOwnTokenClick={model ? onOwnTokenClick : undefined}
            onEnemyTokenClick={model?.attack ? () => act(model.attack!) : undefined}
            canAttack={!!model?.attack}
          />
          <ActionBar
            prompt={prompt}
            enabled={playing}
            attack={model?.attack}
            pass={model?.pass}
            confirm={confirm}
            canCancel={sel.kind !== "none"}
            onAct={act}
            onCancel={cancel}
          />
        </div>
        <aside className="side-right">
          <EventLog log={log} names={NAMES} />
        </aside>
      </div>

      <PlayerZone state={state} pid={1} card={CARDS[1]} />
    </main>
  );
}
