// Round / turn / actions-remaining, read straight from GameState.
import { speedNow } from "@engine";
import type { CardData, GameState } from "@engine";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function PhaseTracker({ state, cards }: { state: GameState; cards: [CardData, CardData] }) {
  const playing = state.phase === "playing";
  const p = state.currentPlayer;
  // Pips for the turn's whole budget: the engine's speed for this player now (printed speed plus
  // speed abilities and effects).
  const speed = Math.max(speedNow(state, p), state.actionsRemaining);
  return (
    <section className="phase-tracker parchment" aria-label="phase and turn">
      <div className="tracker-row">
        <span className="label">round</span>
        <span className="tracker-round">{ROMAN[state.round - 1] ?? state.round}</span>
      </div>
      <div className="round-pips" aria-label={`round ${state.round} of ${state.maxRounds}`}>
        {Array.from({ length: state.maxRounds }, (_, i) => (
          <span key={i} className={`pip${i + 1 < state.round ? " done" : i + 1 === state.round ? " now" : ""}`} />
        ))}
      </div>

      <div className="tracker-row">
        <span className="label">turn</span>
        {playing ? (
          <span className={`tracker-turn p${p}`}>
            <span className="tracker-badge">{p === 0 ? "I" : "II"}</span>
            {cards[p].name}
          </span>
        ) : (
          <span className="tracker-turn">battle over</span>
        )}
      </div>

      <div className="tracker-row">
        <span className="label">actions</span>
        <span className="action-pips" aria-label={`${playing ? state.actionsRemaining : 0} of ${speed} actions left`}>
          {Array.from({ length: speed }, (_, i) => (
            <span key={i} className={`apip${playing && i < state.actionsRemaining ? " left" : ""}`} />
          ))}
        </span>
      </div>
    </section>
  );
}
