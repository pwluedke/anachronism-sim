// Every ability a player has in play — the warrior's and each revealed, in-play support card's —
// with its printed text straight from the card and its current state, plus the timed effects
// running for that player. With `showFaceDown` (learning mode) it also lists the abilities on that
// player's face-down cards, marked with the round they'll be revealed. State comes from the engine
// (abilityStatus, IMPLEMENTED, state.effects); display only.
import { abilityStatus, IMPLEMENTED } from "@engine";
import type { CardData, GameState, PlayerId } from "@engine";

/** The printed keyword (Reveal / Action), if any. Some card data folds it into the name
 *  ("Incitar Asalto - Reveal"); split it back out. Abilities without a keyword get no label. */
function keyword(name: string, type: string): { name: string; kind: string } {
  const m = name.match(/^(.*?)\s*[-–]\s*(Reveal|Action)$/i);
  if (m) return { name: m[1], kind: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() };
  return { name, kind: type === "reveal" ? "Reveal" : type === "action" ? "Action" : "" };
}

interface Row {
  key: string;
  cardName: string;
  ability: string;
  kind: string;
  text: string;
  status: "active" | "dormant" | "used" | "ready" | "off" | "facedown";
  detail: string;
}

function rows(state: GameState, pid: PlayerId, warrior: CardData, showFaceDown: boolean): Row[] {
  const live = new Map(abilityStatus(state, pid).map((a) => [`${a.cardId}#${a.ability}`, a]));
  const cardsInPlay = [
    { id: warrior.id, name: warrior.name, abilities: warrior.abilities ?? [] },
    ...state.cards[pid].support.filter((s) => s.status === "in-play").map((s) => s.card),
  ];
  const faceDown = showFaceDown
    ? state.cards[pid].support.flatMap((s, i) =>
        s.status !== "face-down"
          ? []
          : s.card.abilities.map((a) => {
              const k = keyword(a.name, a.type);
              return {
                key: `${s.card.id}#${a.name}`,
                cardName: s.card.name,
                ability: k.name,
                kind: k.kind,
                text: a.text,
                status: "facedown" as const,
                detail: `face down — revealed in round ${i + 1}${IMPLEMENTED[s.card.id] ? "" : " (this card's ability isn't implemented yet)"}`,
              } satisfies Row;
            }),
      )
    : [];
  return [...inPlayRows(cardsInPlay, live), ...faceDown];
}

function inPlayRows(
  cardsInPlay: { id: string; name: string; abilities: { name: string; type: string; text: string }[] }[],
  live: Map<string, ReturnType<typeof abilityStatus>[number]>,
): Row[] {
  return cardsInPlay.flatMap((c) =>
    c.abilities.map((a) => {
      const st = live.get(`${c.id}#${a.name}`);
      const k = keyword(a.name, a.type);
      return {
        key: `${c.id}#${a.name}`,
        cardName: c.name,
        ability: k.name,
        kind: k.kind,
        text: a.text,
        status: st ? st.status : "off",
        detail: st ? st.detail : IMPLEMENTED[c.id] ? "not in effect" : "not yet in effect — this card's ability isn't implemented",
      } satisfies Row;
    }),
  );
}

const STATUS_LABEL: Record<Row["status"], string> = {
  active: "in effect",
  dormant: "inactive",
  used: "used",
  ready: "ready",
  off: "not yet in effect",
  facedown: "face down",
};

/** Short labels for timed effects (a weapon's own damage effect names its card in the detail). */
const EFFECT_LABEL: Record<GameState["effects"][number]["kind"], string> = {
  attackRoll: "attack",
  defenseRoll: "defense",
  speed: "speed",
  damage: "damage",
  experience: "experience",
};

/** Timed-effect durations, as shown on a chip (nextTurn reads "next turn", then "this turn"). */
const DURATION_LABEL: Partial<Record<GameState["effects"][number]["duration"], string>> = {
  thisRound: "this round",
  nextAttack: "next attack",
  nextAttackThisTurn: "next attack this turn",
};

export function AbilityChips({
  state,
  pid,
  warrior,
  showFaceDown,
}: {
  state: GameState;
  pid: PlayerId;
  warrior: CardData;
  /** Learning mode: also list this player's face-down cards' abilities. */
  showFaceDown: boolean;
}) {
  const list = rows(state, pid, warrior, showFaceDown);
  const effects = state.effects.filter((e) => e.owner === pid);
  if (!list.length && !effects.length) return null;
  return (
    <div className="ability-list" aria-label="abilities in play">
      {list.map((r) => (
        <div key={r.key} className={`ability-row ability-${r.status}`}>
          <div className="ability-head">
            <span className="ability-name">{r.ability}</span>
            {r.kind && <span className="ability-kind">{r.kind}</span>}
            {r.cardName !== warrior.name && <span className="ability-card">· {r.cardName}</span>}
            <span className={`ability-status status-${r.status}`} title={r.detail}>
              {STATUS_LABEL[r.status]}
            </span>
          </div>
          <div className="ability-text">{r.text}</div>
          <div className="ability-detail">{r.detail}</div>
        </div>
      ))}
      {effects.length > 0 && (
        <ul className="ability-chips" aria-label="timed effects">
          {effects.map((e, i) => (
            <li key={`fx-${i}`} className={`chip chip-effect${e.active ? " chip-active-effect" : ""}`} title={`${e.sourceName} — ${e.ability}`}>
              <span className="chip-name">
                {e.amount >= 0 ? "+" : ""}
                {e.amount} {EFFECT_LABEL[e.kind]}
              </span>
              <span className="chip-detail">
                {DURATION_LABEL[e.duration] ?? (e.active ? "this turn" : "next turn")} · {e.sourceName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
