// One player's side of the table: warrior stat panel + the 4 face-down support-card slots.
// Slots are placeholders until support cards exist; the space is reserved now so the layout holds.
import type { CardData, GameState, PlayerId } from "@engine";

export const SUPPORT_SLOTS = 4;

function StatPanel({
  state,
  pid,
  card,
  controller,
  thinking,
}: {
  state: GameState;
  pid: PlayerId;
  card: CardData;
  controller: string;
  thinking: boolean;
}) {
  const w = state.warriors[pid];
  const isTurn = state.phase === "playing" && state.currentPlayer === pid;
  return (
    <div className={`stat-panel parchment p${pid}${isTurn ? " is-turn" : ""}`}>
      <div className="stat-name">
        <span className="label">
          player {pid === 0 ? "I" : "II"} · {controller}
        </span>
        <h2>{card.name}</h2>
        {thinking && <span className="thinking-note">considering…</span>}
      </div>
      <dl className="stat-grid">
        <div className="stat stat-life">
          <dt className="label">life</dt>
          <dd>
            {w.life}
            <span className="muted">/{card.life}</span>
          </dd>
        </div>
        <div className="stat">
          <dt className="label">speed</dt>
          <dd>{w.speed}</dd>
        </div>
        <div className="stat">
          <dt className="label">exp</dt>
          <dd>{w.experience}</dd>
        </div>
        <div className="stat">
          <dt className="label">damage</dt>
          <dd>{w.damage}</dd>
        </div>
      </dl>
    </div>
  );
}

function SupportSlots({ pid }: { pid: PlayerId }) {
  return (
    <div className="support-slots" aria-label={`player ${pid} support cards (not yet in play)`}>
      {Array.from({ length: SUPPORT_SLOTS }, (_, i) => (
        <div key={i} className="card-back" title="Support card slot (face down)">
          <span className="card-back-mark">A</span>
        </div>
      ))}
    </div>
  );
}

export function PlayerZone({
  state,
  pid,
  card,
  controller,
  thinking,
}: {
  state: GameState;
  pid: PlayerId;
  card: CardData;
  controller: string;
  thinking: boolean;
}) {
  return (
    <section className={`player-zone zone-p${pid}`}>
      <StatPanel state={state} pid={pid} card={card} controller={controller} thinking={thinking} />
      <SupportSlots pid={pid} />
    </section>
  );
}
