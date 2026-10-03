// The controls under the map: a prompt describing the pending choice, plus Attack / Confirm /
// Cancel / End turn. Every button dispatches an action taken from the engine's legal list.
import type { Action } from "@engine";

export interface ActionBarProps {
  prompt: string;
  notice?: boolean;
  thinking?: boolean;
  enabled: boolean;
  /** Attacks if the engine offers ATTACK; otherwise the parent explains why not. */
  onAttack: () => void;
  /** Whether the engine currently offers ATTACK (styling only). */
  inRange: boolean;
  pass?: Action;
  confirm?: Action;
  canCancel: boolean;
  onAct: (a: Action) => void;
  onCancel: () => void;
}

export function ActionBar({ prompt, notice, thinking, enabled, onAttack, inRange, pass, confirm, canCancel, onAct, onCancel }: ActionBarProps) {
  return (
    <section className="action-bar" aria-label="actions">
      <div className={`action-prompt${thinking ? " thinking" : ""}${notice ? " notice" : ""}`} aria-live="polite">
        {prompt}
      </div>
      <div className="action-buttons">
        <button className={`btn btn-attack${inRange ? " in-range" : ""}`} disabled={!enabled} onClick={onAttack}>
          Attack <kbd>A</kbd>
        </button>
        <button className="btn" disabled={!enabled || !canCancel} onClick={onCancel}>
          Cancel <kbd>Esc</kbd>
        </button>
        <button className="btn" disabled={!enabled || !confirm} onClick={() => confirm && onAct(confirm)}>
          Confirm <kbd>Enter</kbd>
        </button>
        <button className="btn" disabled={!enabled || !pass} onClick={() => pass && onAct(pass)}>
          End turn <kbd>E</kbd>
        </button>
      </div>
      <div className="key-legend muted">
        <kbd>←</kbd>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <kbd>→</kbd> choose a step, then a facing · <kbd>R</kbd> turn in place
      </div>
    </section>
  );
}
