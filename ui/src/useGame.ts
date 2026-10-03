// The game controller: holds the engine GameState + a running event log, dispatches actions through
// applyAction, and in vs-AI mode lets the engine's bot (chooseAction) play one side. It only forwards
// to the engine — no rules here.
import { useCallback, useEffect, useState } from "react";
import { init, applyAction, chooseAction } from "@engine";
import type { Action, Deck, Difficulty, GameEvent, GameState, PlayerId } from "@engine";

/** Pause before each bot action so it reads as an opponent, not an instant reply. UI-only. */
export const THINK_MS = 650;

export type Mode = { kind: "hotseat" } | { kind: "ai"; difficulty: Difficulty; botSide: PlayerId };

export interface GameView {
  state: GameState;
  log: GameEvent[];
  seed: number;
  /** The two decks in play (warrior + support cards in face-down order). */
  sides: [Deck, Deck];
}

/** Derive the bot's seed from the game seed, so a replayed game seed replays the bot too. */
const botSeedFor = (seed: number) => (seed ^ 0x5bd1e995) | 0;

export function useGame(initialSides: [Deck, Deck], initialSeed: number, initialMode: Mode) {
  const [view, setView] = useState<GameView>(() => {
    const g = init(initialSides[0], initialSides[1], initialSeed);
    return { state: g.state, log: g.events, seed: initialSeed, sides: initialSides };
  });
  const [mode, setMode] = useState<Mode>(initialMode);

  const dispatch = useCallback((a: Action) => {
    setView((v) => {
      const r = applyAction(v.state, a);
      return { ...v, state: r.state, log: [...v.log, ...r.events] };
    });
  }, []);

  /** Start over with the given decks (default: the current ones). */
  const newGame = useCallback((seed: number, sides?: [Deck, Deck]) => {
    setView((v) => {
      const s = sides ?? v.sides;
      const g = init(s[0], s[1], seed);
      return { state: g.state, log: g.events, seed, sides: s };
    });
  }, []);

  const { state, seed } = view;
  const botTurn = mode.kind === "ai" && state.phase === "playing" && state.currentPlayer === mode.botSide;

  useEffect(() => {
    if (!botTurn || mode.kind !== "ai") return;
    const t = setTimeout(() => dispatch(chooseAction(state, mode.difficulty, botSeedFor(seed))), THINK_MS);
    return () => clearTimeout(t);
  }, [botTurn, mode, state, seed, dispatch]);

  return { view, dispatch, newGame, mode, setMode, botTurn };
}
