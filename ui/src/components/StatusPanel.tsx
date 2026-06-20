// Reads round / turn / actions and per-warrior stats straight from GameState.
import type { GameState, CardData } from "@engine";

function WarriorCard({
  state,
  pid,
  card,
}: {
  state: GameState;
  pid: 0 | 1;
  card: CardData;
}) {
  const w = state.warriors[pid];
  const isTurn = state.phase === "playing" && state.currentPlayer === pid;
  return (
    <div className={`wcard p${pid}${isTurn ? " turn" : ""}`}>
      <div className="wname">
        <span className={`dot p${pid}`} /> P{pid} — {card.name}
      </div>
      <div className="stat big">
        ♥ {w.life}
        <span className="muted"> / {card.life}</span>
      </div>
      <div className="stats">
        <span>spd {w.speed}</span>
        <span>exp {w.experience}</span>
        <span>dmg {w.damage}</span>
      </div>
    </div>
  );
}

export function StatusPanel({
  state,
  cards,
}: {
  state: GameState;
  cards: [CardData, CardData];
}) {
  const turnLabel =
    state.phase === "ended" ? "game over" : `P${state.currentPlayer}'s turn`;
  return (
    <section className="status">
      <div className="status-head">
        <div>
          <div className="muted">round</div>
          <div className="big">
            {state.round}
            <span className="muted">/{state.maxRounds}</span>
          </div>
        </div>
        <div>
          <div className="muted">turn</div>
          <div className="big">{turnLabel}</div>
        </div>
        <div>
          <div className="muted">actions left</div>
          <div className="big">
            {state.phase === "playing" ? state.actionsRemaining : "—"}
          </div>
        </div>
      </div>
      <div className="wcards">
        <WarriorCard state={state} pid={0} card={cards[0]} />
        <WarriorCard state={state} pid={1} card={cards[1]} />
      </div>
    </section>
  );
}
