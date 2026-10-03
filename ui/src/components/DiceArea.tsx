// Dice tray placeholder: two static dice. Sized to later hold the attacker's and defender's
// rolling 2d6 animation; the most recent attack's numbers are already shown beneath.
import type { GameEvent } from "@engine";

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

function Die({ face }: { face: number }) {
  return (
    <svg className="die" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="6" y="6" width="88" height="88" rx="16" className="die-body" />
      {PIPS[face].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="8" className="die-pip" />
      ))}
    </svg>
  );
}

export function DiceArea({ log }: { log: GameEvent[] }) {
  const last = [...log].reverse().find((e) => e.type === "attacked");
  return (
    <section className="dice-area parchment" aria-label="dice tray">
      <div className="label">dice</div>
      <div className="dice-tray">
        <Die face={5} />
        <Die face={2} />
      </div>
      <div className="dice-caption muted">
        {last && last.type === "attacked"
          ? `last roll ${last.attackerRoll}${last.gridMod >= 0 ? "+" : ""}${last.gridMod} vs ${last.defenderRoll}`
          : "rolls appear here"}
      </div>
    </section>
  );
}
