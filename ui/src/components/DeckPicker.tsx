// Choose each side's preset deck. Changing either starts a new game with that matchup.
import type { Deck } from "@engine";
import { DECKS, deckLabel, deckSet, findDeck } from "../decks";

const SETS = [...new Set(DECKS.map(deckSet))];

export function DeckPicker({ sides, onChange }: { sides: [Deck, Deck]; onChange: (sides: [Deck, Deck]) => void }) {
  const pick = (pid: 0 | 1, id: string) => {
    const next: [Deck, Deck] = [...sides];
    next[pid] = findDeck(id);
    onChange(next);
  };
  return (
    <div className="deck-picker">
      {([0, 1] as const).map((pid) => (
        <label key={pid} className="field">
          <span className="label">{pid === 0 ? "player I deck" : "player II deck"}</span>
          <select value={sides[pid].id} onChange={(e) => pick(pid, e.target.value)}>
            {SETS.map((set) => (
              <optgroup key={set} label={`Set ${set}`}>
                {DECKS.filter((d) => deckSet(d) === set).map((d) => (
                  <option key={d.id} value={d.id}>
                    {deckLabel(d)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
