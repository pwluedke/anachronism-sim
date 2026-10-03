// Presentation-only helpers. No game logic — these never decide legality or outcomes, they only
// turn engine data into readable words.
import type { Facing, GameEvent, Position, Winner } from "@engine";

const COLS = ["A", "B", "C", "D"];
const ROWS = ["I", "II", "III", "IV"];
const FACING_NAME: Record<Facing, string> = { N: "north", E: "east", S: "south", W: "west" };
const where = (p: Position) => `${COLS[p.col]}${ROWS[p.row]}`;

const REASON: Record<string, string> = {
  kill: "by defeating the foe",
  life: "with more life after five rounds",
  experience: "on experience, life being equal",
  draw: "",
};

export function winnerText(winner: Winner, reason: string, names: [string, string]): string {
  if (winner === null) return "";
  if (winner === "draw") return "A draw — the warriors are evenly matched";
  return `${names[winner]} wins ${REASON[reason] ?? reason}`;
}

export interface LogEntry {
  kind: "round" | "turn" | "move" | "hit" | "crit" | "miss" | "defeat" | "end" | "note";
  text: string;
  detail?: string;
  player?: 0 | 1;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function logEntry(e: GameEvent, names: [string, string]): LogEntry | null {
  switch (e.type) {
    case "setup":
      return { kind: "note", text: `${names[e.firstPlacer]} takes the field first.` };
    case "roundStarted":
      return { kind: "round", text: `Round ${ROWS[e.round - 1] ?? e.round}`, detail: `${names[e.initiative]} has initiative` };
    case "turnStarted":
      return { kind: "turn", text: `${names[e.player]}'s turn`, player: e.player };
    case "moved":
      return {
        kind: "move",
        text: `${names[e.player]} marches ${where(e.from)} → ${where(e.to)}, facing ${FACING_NAME[e.facing]}.`,
        player: e.player,
      };
    case "rotated":
      return { kind: "move", text: `${names[e.player]} turns to face ${FACING_NAME[e.facing]}.`, player: e.player };
    case "passed":
      return { kind: "note", text: `${names[e.player]} holds.`, player: e.player };
    case "attacked": {
      const roll = `(${e.attackerRoll}${signed(e.gridMod)} = ${e.attackerTotal} vs ${e.defenderRoll}${e.tiebreak ? `, ${e.tiebreak} tiebreak` : ""})`;
      if (!e.hit) return { kind: "miss", text: `${names[e.attacker]} strikes at ${names[e.defender]} — and misses.`, detail: roll, player: e.attacker };
      return {
        kind: e.crit ? "crit" : "hit",
        text: `${names[e.attacker]} ${e.crit ? "lands a critical blow on" : "strikes"} ${names[e.defender]} for ${e.damage}.`,
        detail: roll,
        player: e.attacker,
      };
    }
    case "warriorDefeated":
      return { kind: "defeat", text: `${names[e.player]} falls.`, player: e.player };
    case "gameEnded":
      return { kind: "end", text: winnerText(e.winner, e.reason, names) + "." };
    case "turnEnded":
    case "roundEnded":
      return null;
  }
}
