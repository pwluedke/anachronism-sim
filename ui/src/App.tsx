// Table shell. Holds the engine GameState via useGame; renders it and routes chosen actions back
// through the engine. NO rules here — legality comes from getLegalActions (via boardModel).
import { useEffect, useMemo, useState } from "react";
import type { Action, Facing, GameEvent } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";
import { useGame } from "./useGame";
import { ModeControls } from "./components/ModeControls";
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
  const { view, dispatch, newGame, mode, setMode, botTurn } = useGame(PLAYER_0, PLAYER_1, Date.now() | 0, {
    kind: "ai",
    difficulty: "medium",
    botSide: 0,
  });
  const { state, log } = view;
  const playing = state.phase === "playing";
  const humanTurn = playing && !botTurn;

  // Interaction model only exists on a human's turn: no clicks are possible while the bot plays.
  const model = useMemo(() => (humanTurn ? buildModel(state) : null), [state, humanTurn]);
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
  // Keyboard: same handlers and same engine-legal actions as the mouse path.
  useEffect(() => {
    const ARROW: Record<string, Facing> = { ArrowUp: "N", ArrowRight: "E", ArrowDown: "S", ArrowLeft: "W" };
    const onKey = (e: KeyboardEvent) => {
      if (!model || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      const k = e.key;
      let handled = true;
      if (k in ARROW) {
        const f = ARROW[k];
        if (sel.kind === "none") {
          const dest = [...model.reach.entries()].find(([, dir]) => dir === f);
          if (dest) {
            const offered = model.moveFacings(f);
            setHover(null);
            setSel({ kind: "move", dir: f, facing: offered.includes(active.facing) ? active.facing : null });
          }
        } else {
          const offered = sel.kind === "move" ? model.moveFacings(sel.dir) : model.rotateFacings;
          if (offered.includes(f)) {
            setHover(null);
            setSel({ ...sel, facing: f });
          }
        }
      } else if (k === "Enter") {
        if (confirm) dispatch(confirm);
      } else if (k === "Escape") {
        setSel(NO_SELECTION);
        setHover(null);
      } else if (k === "a" || k === "A") {
        if (model.attack) dispatch(model.attack);
      } else if (k === "e" || k === "E") {
        if (model.pass) dispatch(model.pass);
      } else if (k === "r" || k === "R") {
        if (model.rotateFacings.length) {
          setHover(null);
          setSel(sel.kind === "rotate" ? NO_SELECTION : { kind: "rotate", facing: null });
        }
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [model, sel, confirm, active, dispatch]);

  const onOwnTokenClick = () => {
    if (!model || model.rotateFacings.length === 0) return;
    setHover(null);
    setSel(sel.kind === "rotate" ? NO_SELECTION : { kind: "rotate", facing: null });
  };

  const name = CARDS[state.currentPlayer].name;
  let prompt = "The battle is over.";
  if (botTurn && mode.kind === "ai") {
    prompt = `${name} (computer, ${mode.difficulty}) is considering…`;
  } else if (playing && target && sel.kind === "move") {
    const where = `${COLS[target.col]}${ROWS[target.row]}`;
    prompt = sel.facing
      ? `${name} marches to ${where}, facing ${FACING_NAME[sel.facing]}. Confirm, or pick another facing.`
      : `Choose ${name}'s facing at ${where}.`;
  } else if (playing && sel.kind === "rotate") {
    prompt = sel.facing ? `${name} turns ${FACING_NAME[sel.facing]}. Confirm, or pick another facing.` : `Choose a new facing for ${name}.`;
  } else if (playing) {
    prompt = `${name}: pick a destination, click ${name} to turn in place${model?.attack ? ", or attack" : ""}.`;
  }

  const controllerOf = (pid: 0 | 1) =>
    mode.kind === "ai" ? (mode.botSide === pid ? `computer · ${mode.difficulty}` : "you") : `player ${pid === 0 ? "I" : "II"}`;

  const ended =
    state.phase === "ended"
      ? ([...log].reverse().find((e) => e.type === "gameEnded") as GameEndedEvent | undefined)
      : undefined;

  return (
    <main className="table">
      <header className="table-header">
        <h1>Anachronism</h1>
        <div className="header-controls">
          <ModeControls mode={mode} names={NAMES} onChange={setMode} />
          <button className="btn" onClick={() => newGame(Date.now() | 0)}>
            New game
          </button>
        </div>
      </header>

      {ended && <div className="banner">{winnerText(ended.winner, ended.reason, NAMES)}</div>}

      <PlayerZone state={state} pid={0} card={CARDS[0]} controller={controllerOf(0)} thinking={botTurn && state.currentPlayer === 0} />

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
            thinking={botTurn}
            enabled={humanTurn}
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

      <PlayerZone state={state} pid={1} card={CARDS[1]} controller={controllerOf(1)} thinking={botTurn && state.currentPlayer === 1} />
    </main>
  );
}
