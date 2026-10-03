// The battle log: engine events written up in warriors' names, newest at the bottom, auto-scrolling.
import { useEffect, useRef } from "react";
import type { GameEvent } from "@engine";
import { logEntry } from "../format";

export function EventLog({ log, names }: { log: GameEvent[]; names: [string, string] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);

  const entries = log.map((e) => logEntry(e, names)).filter((x) => x !== null);

  return (
    <section className="battle-log parchment" aria-label="battle log">
      <h3 className="battle-log-title">Chronicle of Battle</h3>
      <div className="battle-log-body" ref={ref}>
        {entries.map((x, i) => (
          <div key={i} className={`entry entry-${x.kind}${x.player !== undefined ? ` p${x.player}` : ""}`}>
            <span className="entry-text">{x.text}</span>
            {x.detail && <span className="entry-detail num"> {x.detail}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
