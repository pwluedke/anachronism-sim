// The game controller: holds the engine GameState + a running event log, dispatches actions through
// applyAction, and in vs-AI mode lets the engine's bot (chooseAction) play one side. It only forwards
// to the engine — no rules here.
import { useCallback, useEffect, useState } from "react";
import { init, applyAction, chooseAction } from "@engine";
import type { Action, CardData, Difficulty, GameEvent, GameState, PlayerId } from "@engine";

/** Pause before each bot action so it reads as an opponent, not an instant reply. UI-only. */
export const THINK_MS = 650;

export type Mode = { kind: "hotseat" } | { kind: "ai"; difficulty: Difficulty; botSide: PlayerId };

export interface GameView {
  state: GameState;
  log: GameEvent[];
  seed: number;
}

/** Derive the bot's seed from the game seed, so a replayed game seed replays the bot too. */
const botSeedFor = (seed: number) => (seed ^ 0x5bd1e995) | 0;

export function useGame(c0: CardData, c1: CardData, initialSeed: number, initialMode: Mode) {
  const [view, setView] = useState<GameView>(() => {
    const g = init(c0, c1, initialSeed);
    return { state: g.state, log: g.events, seed: initialSeed };
  });
  const [mode, setMode] = useState<Mode>(initialMode);

  const dispatch = useCallback((a: Action) => {
    setView((v) => {
      const r = applyAction(v.state, a);
      return { ...v, state: r.state, log: [...v.log, ...r.events] };
    });
  }, []);

  const newGame = useCallback(
    (seed: number) => {
      const g = init(c0, c1, seed);
      setView({ state: g.state, log: g.events, seed });
    },
    [c0, c1],
  );

  const { state, seed } = view;
  const botTurn = mode.kind === "ai" && state.phase === "playing" && state.currentPlayer === mode.botSide;

  useEffect(() => {
    if (!botTurn || mode.kind !== "ai") return;
    const t = setTimeout(() => dispatch(chooseAction(state, mode.difficulty, botSeedFor(seed))), THINK_MS);
    return () => clearTimeout(t);
  }, [botTurn, mode, state, seed, dispatch]);

  return { view, dispatch, newGame, mode, setMode, botTurn };
}
