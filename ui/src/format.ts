// Presentation-only helpers (labels). No game logic — these never decide
// legality or outcomes, they only turn engine data into readable strings.
import type { Action, GameState, GameEvent, Winner } from "@engine";

const DIR: Record<string, string> = { N: "North", E: "East", S: "South", W: "West" };

export function actionLabel(a: Action, state: GameState): string {
  switch (a.type) {
    case "MOVE":
      return `Move ${DIR[a.dir]}`;
    case "ROTATE":
      return `Rotate ${DIR[a.facing]}`;
    case "ATTACK": {
      const foe = state.warriors[state.currentPlayer === 0 ? 1 : 0];
      return `Attack ${foe.name}`;
    }
    case "PASS":
      return "Pass";
  }
}

const REASON: Record<string, string> = {
  kill: "by defeat",
  life: "more life after 5 rounds",
  experience: "experience tiebreak",
  draw: "draw",
};

export function winnerText(winner: Winner, reason: string): string {
  if (winner === "draw") return "Draw — evenly matched";
  return `Player ${winner} wins (${REASON[reason] ?? reason})`;
}

export function eventLine(e: GameEvent): string {
  switch (e.type) {
    case "setup":
      return `Setup — P${e.firstPlacer} places first`;
    case "roundStarted":
      return `— Round ${e.round} — initiative P${e.initiative}`;
    case "turnStarted":
      return `P${e.player}'s turn (${e.actions} actions)`;
    case "moved":
      return `P${e.player} moves (${e.from.row},${e.from.col})→(${e.to.row},${e.to.col}) facing ${e.facing}`;
    case "rotated":
      return `P${e.player} rotates to ${e.facing}`;
    case "passed":
      return `P${e.player} passes`;
    case "attacked":
      return (
        `P${e.attacker} attacks P${e.defender}: ` +
        `${e.attackerRoll}${e.gridMod >= 0 ? "+" : ""}${e.gridMod}=${e.attackerTotal} vs ${e.defenderRoll} → ` +
        `${e.hit ? "HIT" : "miss"}${e.crit ? " CRIT" : ""}${e.damage ? ` (${e.damage} dmg)` : ""}` +
        `${e.tiebreak ? ` [${e.tiebreak}]` : ""}`
      );
    case "warriorDefeated":
      return `*** P${e.player} defeated ***`;
    case "turnEnded":
      return `P${e.player} turn ends`;
    case "roundEnded":
      return `Round ${e.round} ends`;
    case "gameEnded":
      return `GAME OVER — ${winnerText(e.winner, e.reason)}`;
  }
}
