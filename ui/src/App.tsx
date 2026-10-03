// Table shell. Holds the engine GameState via useGame; renders it and routes chosen actions back
// through the engine. NO rules here — the engine owns them.
import { useMemo } from "react";
import { projectGrid } from "@engine";
import type { GameEvent } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";
import { useGame } from "./useGame";
import { Board, type Highlight } from "./components/Board";
import { ActionMenu } from "./components/ActionMenu";
import { EventLog } from "./components/EventLog";
import { PlayerZone } from "./components/PlayerZone";
import { PhaseTracker } from "./components/PhaseTracker";
import { DiceArea } from "./components/DiceArea";
import { winnerText } from "./format";

type GameEndedEvent = Extract<GameEvent, { type: "gameEnded" }>;
const CARDS: [typeof PLAYER_0, typeof PLAYER_1] = [PLAYER_0, PLAYER_1];

export function App() {
  const { view, dispatch, newGame } = useGame(PLAYER_0, PLAYER_1, 1);
  const { state, log } = view;

  const highlights = useMemo(() => {
    const map = new Map<string, Highlight>();
    if (state.phase !== "playing") return map;
    const w = state.warriors[state.currentPlayer];
    for (const pc of projectGrid(w.attackGrid, w.position, w.facing, state.arenaSize)) {
      map.set(`${pc.cell.row},${pc.cell.col}`, { mod: pc.mod });
    }
    return map;
  }, [state]);

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

      {ended && <div className="banner">{winnerText(ended.winner, ended.reason)}</div>}

      <PlayerZone state={state} pid={0} card={CARDS[0]} />

      <div className="midfield">
        <aside className="side-left">
          <PhaseTracker state={state} cards={CARDS} />
          <DiceArea log={log} />
        </aside>
        <div className="arena-column">
          <Board state={state} highlights={highlights} />
        </div>
        <aside className="side-right">
          <EventLog log={log} />
        </aside>
      </div>

      <PlayerZone state={state} pid={1} card={CARDS[1]} />

      <ActionMenu state={state} onAct={dispatch} />
    </main>
  );
}
