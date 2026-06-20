// The game controller: holds the engine GameState + a running event log, and
// dispatches actions through applyAction. This is the ONLY place the UI touches
// engine state transitions — and it just forwards to the engine.
import { useCallback, useState } from "react";
import { init, applyAction } from "@engine";
import type { Action, CardData, GameEvent, GameState } from "@engine";

export interface GameView {
  state: GameState;
  log: GameEvent[];
}

export function useGame(c0: CardData, c1: CardData, initialSeed: number) {
  const [view, setView] = useState<GameView>(() => {
    const g = init(c0, c1, initialSeed);
    return { state: g.state, log: g.events };
  });

  const dispatch = useCallback((a: Action) => {
    setView((v) => {
      const r = applyAction(v.state, a);
      return { state: r.state, log: [...v.log, ...r.events] };
    });
  }, []);

  const newGame = useCallback(
    (seed: number) => {
      const g = init(c0, c1, seed);
      setView({ state: g.state, log: g.events });
    },
    [c0, c1],
  );

  return { view, dispatch, newGame };
}
