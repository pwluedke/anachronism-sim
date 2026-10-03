// Header controls: hotseat vs AI, the bot's difficulty, and which side the human commands.
import type { Difficulty, PlayerId } from "@engine";
import type { Mode } from "../useGame";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export function ModeControls({
  mode,
  names,
  onChange,
}: {
  mode: Mode;
  names: [string, string];
  onChange: (m: Mode) => void;
}) {
  const ai = mode.kind === "ai" ? mode : null;
  const difficulty: Difficulty = ai?.difficulty ?? "medium";
  const humanSide: PlayerId = ai ? (ai.botSide === 0 ? 1 : 0) : 1;

  return (
    <div className="mode-controls">
      <label className="field">
        <span className="label">opponent</span>
        <select
          value={mode.kind}
          onChange={(e) =>
            onChange(
              e.target.value === "ai"
                ? { kind: "ai", difficulty, botSide: humanSide === 0 ? 1 : 0 }
                : { kind: "hotseat" },
            )
          }
        >
          <option value="ai">Computer</option>
          <option value="hotseat">Hotseat (two players)</option>
        </select>
      </label>
      {ai && (
        <>
          <label className="field">
            <span className="label">difficulty</span>
            <select value={ai.difficulty} onChange={(e) => onChange({ ...ai, difficulty: e.target.value as Difficulty })}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">you command</span>
            <select
              value={humanSide}
              onChange={(e) => onChange({ ...ai, botSide: Number(e.target.value) === 0 ? 1 : 0 })}
            >
              <option value={0}>{names[0]} (I)</option>
              <option value={1}>{names[1]} (II)</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}
