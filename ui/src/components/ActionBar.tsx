// The controls under the map: a prompt describing the pending choice, plus the attack options
// (basic, and each in-play weapon), Cancel / Confirm / End turn. Every button dispatches an action
// taken from the engine's legal list; whether an attack is on offer is the engine's call.
import type { Action } from "@engine";

export interface WeaponOption {
  id: string;
  name: string;
  /** The engine currently offers an ATTACK with this weapon. */
  inRange: boolean;
}

export interface AbilityOption {
  key: string;
  label: string;
  title: string;
  onClick: () => void;
}

/** A decision the engine is waiting on (e.g. an optional re-roll): its choices replace the bar. */
export interface ChoiceOption {
  key: string;
  label: string;
  action: Action;
}

/** "basic" or a weapon card id. */
export type AttackSource = "basic" | string;

export interface ActionBarProps {
  prompt: string;
  notice?: boolean;
  thinking?: boolean;
  enabled: boolean;
  /** Attack with a source if the engine offers it; otherwise the parent explains why not. */
  onAttack: (source: AttackSource) => void;
  /** Pointer/focus on an attack button: the parent previews that source's grid (null = off). */
  onAttackHover: (source: AttackSource | null) => void;
  basicInRange: boolean;
  weapons: WeaponOption[];
  /** Usable Action abilities (from getLegalActions). */
  abilities: AbilityOption[];
  /** When set, the bar shows only these choices (all from getLegalActions). */
  choices?: ChoiceOption[];
  pass?: Action;
  confirm?: Action;
  canCancel: boolean;
  onAct: (a: Action) => void;
  onCancel: () => void;
}

export function ActionBar(props: ActionBarProps) {
  const { prompt, notice, thinking, enabled, onAttack, onAttackHover, basicInRange, weapons, abilities, choices, pass, confirm, canCancel, onAct, onCancel } =
    props;
  if (choices?.length) {
    return (
      <section className="action-bar" aria-label="decision">
        <div className="action-prompt decision" aria-live="polite">
          {prompt}
        </div>
        <div className="action-buttons">
          {choices.map((c) => (
            <button key={c.key} className="btn btn-choice" onClick={() => onAct(c.action)}>
              {c.label}
            </button>
          ))}
        </div>
      </section>
    );
  }
  const hoverProps = (source: AttackSource) => ({
    onMouseEnter: () => onAttackHover(source),
    onMouseLeave: () => onAttackHover(null),
    onFocus: () => onAttackHover(source),
    onBlur: () => onAttackHover(null),
  });
  return (
    <section className="action-bar" aria-label="actions">
      <div className={`action-prompt${thinking ? " thinking" : ""}${notice ? " notice" : ""}`} aria-live="polite">
        {prompt}
      </div>
      <div className="action-buttons">
        <button
          className={`btn btn-attack${basicInRange ? " in-range" : ""}`}
          disabled={!enabled}
          onClick={() => onAttack("basic")}
          {...hoverProps("basic")}
        >
          Attack <kbd>A</kbd>
        </button>
        {weapons.map((w, i) => (
          <button
            key={w.id}
            className={`btn btn-attack btn-weapon${w.inRange ? " in-range" : ""}`}
            disabled={!enabled}
            onClick={() => onAttack(w.id)}
            title={`Weapon attack with ${w.name}: its own grid and damage, once per turn`}
            {...hoverProps(w.id)}
          >
            {w.name} {i === 0 && <kbd>W</kbd>}
          </button>
        ))}
        {abilities.map((a) => (
          <button key={a.key} className="btn btn-ability" disabled={!enabled} onClick={a.onClick} title={a.title}>
            {a.label}
          </button>
        ))}
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
        <kbd>→</kbd> step (or face, if blocked), then a facing · <kbd>R</kbd> turn in place
      </div>
    </section>
  );
}
