// A player's implemented abilities in play and the timed effects running for them, read from the
// engine (abilityStatus + state.effects). Display only.
import { abilityStatus } from "@engine";
import type { GameState, PlayerId } from "@engine";

export function AbilityChips({ state, pid, texts }: { state: GameState; pid: PlayerId; texts: Record<string, string> }) {
  const abilities = abilityStatus(state, pid);
  const effects = state.effects.filter((e) => e.owner === pid);
  if (!abilities.length && !effects.length) return null;
  return (
    <ul className="ability-chips" aria-label="abilities and effects">
      {abilities.map((a) => (
        <li
          key={`${a.cardId}-${a.ability}`}
          className={`chip chip-${a.status}`}
          title={`${a.cardName} — ${a.ability}: ${texts[`${a.cardId}#${a.ability}`] ?? ""}\n${a.detail}`}
        >
          <span className="chip-name">{a.ability}</span>
          <span className="chip-detail">{a.detail}</span>
        </li>
      ))}
      {effects.map((e, i) => (
        <li key={`fx-${i}`} className={`chip chip-effect${e.active ? " chip-active-effect" : ""}`} title={`${e.sourceName} — ${e.ability}`}>
          <span className="chip-name">
            {e.amount >= 0 ? "+" : ""}
            {e.amount} {e.kind === "attackRoll" ? "attack" : "speed"}
          </span>
          <span className="chip-detail">
            {e.duration === "thisRound" ? "this round" : e.active ? "this turn" : "next turn"} · {e.sourceName}
          </span>
        </li>
      ))}
    </ul>
  );
}
