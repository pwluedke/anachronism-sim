// Hotseat shell. Holds the engine GameState; renders it. All rules live in the
// engine — this component only reads state and (later tasks) dispatches actions.
import { useState } from "react";
import { init } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";
import { Board } from "./components/Board";

export function App() {
  const [game] = useState(() => init(PLAYER_0, PLAYER_1, 1));
  const { state } = game;

  return (
    <main className="app">
      <h1>Anachronism — Hotseat</h1>
      <p className="muted">
        P0 {PLAYER_0.name} &nbsp;vs&nbsp; P1 {PLAYER_1.name}
      </p>
      <Board state={state} />
    </main>
  );
}
