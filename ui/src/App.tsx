// Hotseat shell. Holds the engine GameState; renders it. All rules live in the
// engine — this component only reads state and (later tasks) dispatches actions.
import { useMemo, useState } from "react";
import { init, projectGrid } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";
import { Board, type Highlight } from "./components/Board";
import { StatusPanel } from "./components/StatusPanel";

export function App() {
  const [game] = useState(() => init(PLAYER_0, PLAYER_1, 1));
  const { state } = game;

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
        <Board state={state} highlights={highlights} />
        <StatusPanel state={state} cards={[PLAYER_0, PLAYER_1]} />
      </div>
    </main>
  );
}
