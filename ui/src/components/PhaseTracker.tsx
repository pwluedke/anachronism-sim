// Round / turn / actions-remaining, read straight from GameState.
import type { CardData, GameState } from "@engine";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function PhaseTracker({ state, cards }: { state: GameState; cards: [CardData, CardData] }) {
  const playing = state.phase === "playing";
  const p = state.currentPlayer;
  // Pips for the turn's whole budget: base speed plus speed effects active this turn (abilities).
  const bonus = state.effects.filter((e) => e.owner === p && e.kind === "speed" && e.active).reduce((n, e) => n + e.amount, 0);
  const speed = state.warriors[p].speed + bonus;
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
