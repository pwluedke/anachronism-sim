// A warrior's base attack pattern as printed on its card: the 3x4 grid (columns A-C, rows 1-4)
// with each cell's modifier and the warrior's own cell (the marker). Forward is up. Read straight
// from the card data; nothing is projected or computed.
import type { AttackGrid } from "@engine";

const COLS = ["A", "B", "C"];
const ROWS = [1, 2, 3, 4];

export function GridDiagram({ grid, name }: { grid: AttackGrid; name: string }) {
  return (
    <div className="grid-diagram" role="img" aria-label={`${name}'s attack pattern (forward is up)`}>
      {ROWS.map((r) =>
        COLS.map((c) => {
          const v = grid[`${r}${c}`];
          if (v === "marker") {
            return (
              <span key={`${r}${c}`} className="gd-cell gd-marker" title={`${r}${c}: ${name}`}>
                <span className="gd-dot" />
              </span>
            );
          }
          return (
            <span key={`${r}${c}`} className={`gd-cell${v ? " gd-hit num" : ""}`} title={v ? `${r}${c}: ${v}` : undefined}>
              {v ?? ""}
            </span>
          );
        }),
      )}
    </div>
  );
}
