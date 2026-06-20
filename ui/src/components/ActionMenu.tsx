// Renders ONLY the engine-legal actions as buttons. The UI asks the engine
// (getLegalActions) what is legal and never constructs an action itself.
import { getLegalActions } from "@engine";
import type { Action, GameState } from "@engine";
import { actionLabel } from "../format";

export function ActionMenu({
  state,
  onAct,
}: {
  state: GameState;
  onAct: (a: Action) => void;
}) {
  if (state.phase !== "playing") return null;
  const actions = getLegalActions(state);

  return (
    <section className="menu">
      <div className="menu-head muted">
        P{state.currentPlayer} — choose an action ({state.actionsRemaining} left)
      </div>
      <div className="buttons">
        {actions.map((a, i) => (
          <button
            key={i}
            className={`btn ${a.type.toLowerCase()}`}
            onClick={() => onAct(a)}
          >
            {actionLabel(a, state)}
          </button>
        ))}
      </div>
    </section>
  );
}
