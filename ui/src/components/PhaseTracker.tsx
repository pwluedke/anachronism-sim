// Round / turn / actions-remaining, read straight from GameState.
import type { CardData, GameState } from "@engine";

export function PhaseTracker({ state, cards }: { state: GameState; cards: [CardData, CardData] }) {
  const playing = state.phase === "playing";
  return (
    <section className="phase-tracker parchment" aria-label="phase and turn">
      <div className="label">round</div>
      <div className="tracker-value">
        {state.round}
        <span className="muted"> / {state.maxRounds}</span>
      </div>
      <div className="label">turn</div>
      <div className="tracker-value">{playing ? cards[state.currentPlayer].name : "game over"}</div>
      <div className="label">actions left</div>
      <div className="tracker-value">{playing ? state.actionsRemaining : "—"}</div>
    </section>
  );
}
