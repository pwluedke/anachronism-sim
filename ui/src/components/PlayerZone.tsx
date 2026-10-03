// One player's side of the table: warrior stat panel + the 4 support cards (face-down until
// revealed, left to right, one per round).
import type { CardData, GameState, PlayerId } from "@engine";
import { GridDiagram } from "./GridDiagram";
import { SupportCard } from "./SupportCard";
import { AbilityChips } from "./AbilityChips";

function StatPanel({
  state,
  pid,
  card,
  controller,
  thinking,
  showFaceDown,
}: {
  state: GameState;
  pid: PlayerId;
  card: CardData;
  controller: string;
  thinking: boolean;
  showFaceDown: boolean;
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
      <figure className="stat-pattern">
        <GridDiagram grid={card.grid} name={card.name} />
        <figcaption className="label">attack · forward ↑</figcaption>
      </figure>
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
      <AbilityChips state={state} pid={pid} warrior={card} showFaceDown={showFaceDown} />
    </div>
  );
}

function SupportSlots({
  state,
  pid,
  discardable,
  onDiscard,
}: {
  state: GameState;
  pid: PlayerId;
  discardable?: Set<string>;
  onDiscard?: (cardId: string) => void;
}) {
  const slots = state.cards[pid].support;
  return (
    <div className="support-slots" aria-label={`player ${pid === 0 ? "I" : "II"} support cards`}>
      {slots.length === 0 && <span className="muted support-none">no support cards</span>}
      {slots.map((slot, i) => (
        <SupportCard
          key={`${slot.card.id}-${slot.status}`}
          slot={slot}
          index={i}
          discardable={discardable?.has(slot.card.id)}
          onDiscard={onDiscard ? () => onDiscard(slot.card.id) : undefined}
        />
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
  discardable,
  onDiscard,
  showFaceDown = false,
}: {
  state: GameState;
  pid: PlayerId;
  card: CardData;
  controller: string;
  thinking: boolean;
  /** Learning mode: list this player's face-down cards' abilities too. */
  showFaceDown?: boolean;
  /** While a card restriction is pending for this player: the cards they may discard. */
  discardable?: Set<string>;
  onDiscard?: (cardId: string) => void;
}) {
  return (
    <section className={`player-zone zone-p${pid}`}>
      <StatPanel state={state} pid={pid} card={card} controller={controller} thinking={thinking} showFaceDown={showFaceDown} />
      <SupportSlots state={state} pid={pid} discardable={discardable} onDiscard={onDiscard} />
    </section>
  );
}
