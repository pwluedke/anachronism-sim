// Renders the running event log returned by the engine, newest at the bottom.
import { useEffect, useRef } from "react";
import type { GameEvent } from "@engine";
import { eventLine } from "../format";

export function EventLog({ log }: { log: GameEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);

  return (
    <section className="log">
      <div className="muted log-head">event log</div>
      <div className="log-body" ref={ref}>
        {log.map((e, i) => (
          <div key={i} className={`logline ${e.type}`}>
            {eventLine(e)}
          </div>
        ))}
      </div>
    </section>
  );
}
