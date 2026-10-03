// The controls under the map: a prompt describing the pending choice, plus Attack / Confirm /
// Cancel / End turn. Every button dispatches an action taken from the engine's legal list.
import type { Action } from "@engine";

export interface ActionBarProps {
  prompt: string;
  enabled: boolean;
  attack?: Action;
  pass?: Action;
  confirm?: Action;
  canCancel: boolean;
  onAct: (a: Action) => void;
  onCancel: () => void;
}

export function ActionBar({ prompt, enabled, attack, pass, confirm, canCancel, onAct, onCancel }: ActionBarProps) {
  return (
    <section className="action-bar" aria-label="actions">
      <div className="action-prompt">{prompt}</div>
      <div className="action-buttons">
        <button className="btn btn-attack" disabled={!enabled || !attack} onClick={() => attack && onAct(attack)}>
          Attack
        </button>
        <button className="btn" disabled={!enabled || !canCancel} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-gold" disabled={!enabled || !confirm} onClick={() => confirm && onAct(confirm)}>
          Confirm
        </button>
        <button className="btn" disabled={!enabled || !pass} onClick={() => pass && onAct(pass)}>
          End turn
        </button>
      </div>
    </section>
  );
}
