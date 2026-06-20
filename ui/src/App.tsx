// Hotseat shell. Holds the engine GameState via useGame; renders it and routes
// chosen actions back through the engine. NO rules here — the engine owns them.
import { useMemo } from "react";
import { projectGrid } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";
import { useGame } from "./useGame";
import { Board, type Highlight } from "./components/Board";
import { StatusPanel } from "./components/StatusPanel";
import { ActionMenu } from "./components/ActionMenu";

export function App() {
  const { view, dispatch } = useGame(PLAYER_0, PLAYER_1, 1);
  const { state } = view;

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

  return (
    <main className="app">
      <h1>Anachronism — Hotseat</h1>
      <div className="layout">
        <div>
          <Board state={state} highlights={highlights} />
          <ActionMenu state={state} onAct={dispatch} />
        </div>
        <StatusPanel state={state} cards={[PLAYER_0, PLAYER_1]} />
      </div>
    </main>
  );
}
