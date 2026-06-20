// #18 smoke: prove the engine import works by initializing a real GameState and
// rendering a line derived from it. Expanded by later tasks.
import { init } from "@engine";
import { PLAYER_0, PLAYER_1 } from "./cards";

export function App() {
  const { state } = init(PLAYER_0, PLAYER_1, 1);
  return (
    <main className="app">
      <h1>Anachronism — Hotseat</h1>
      <p>
        Round {state.round}, P0 {PLAYER_0.name} vs P1 {PLAYER_1.name}
      </p>
      <p className="muted">engine import OK — {state.phase}</p>
    </main>
  );
}
