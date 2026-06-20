// Hotseat shell. Holds the engine GameState via useGame; renders it and routes
// chosen actions back through the engine. NO rules here — the engine owns them.
import { useMemo } from "react";
import { projectGrid } from "@engine";
import type { GameEvent } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";
import { useGame } from "./useGame";
import { Board, type Highlight } from "./components/Board";
import { StatusPanel } from "./components/StatusPanel";
import { ActionMenu } from "./components/ActionMenu";
import { EventLog } from "./components/EventLog";
import { winnerText } from "./format";

type GameEndedEvent = Extract<GameEvent, { type: "gameEnded" }>;

export function App() {
  const { view, dispatch, newGame } = useGame(PLAYER_0, PLAYER_1, 1);
  const { state, log } = view;

  // Active warrior's reachable cells, straight from the engine's projection.
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
    <main className="app">
      <header className="topbar">
        <h1>Anachronism — Hotseat</h1>
        <button className="btn" onClick={() => newGame(Date.now() | 0)}>
          New game
        </button>
      </header>

      {ended && (
        <div className="banner">{winnerText(ended.winner, ended.reason)}</div>
      )}

      <div className="layout">
        <div>
          <Board state={state} highlights={highlights} />
          <ActionMenu state={state} onAct={dispatch} />
        </div>
        <StatusPanel state={state} cards={[PLAYER_0, PLAYER_1]} />
        <EventLog log={log} />
      </div>
    </main>
  );
}
