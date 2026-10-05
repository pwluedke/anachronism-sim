// Presentation-only helpers. No game logic — these never decide legality or outcomes, they only
// turn engine data into readable words.
import type { Facing, GameEvent, Position, Winner } from "@engine";

const COLS = ["A", "B", "C", "D"];
const ROWS = ["I", "II", "III", "IV"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
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
  kind: "round" | "reveal" | "ability" | "turn" | "move" | "hit" | "crit" | "miss" | "defeat" | "end" | "note";
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
      return {
        kind: "round",
        text: `Round ${ROMAN[e.round - 1] ?? e.round}`,
        detail: `${names[e.initiative]} has initiative ${
          e.decidedBy === "initiative"
            ? `(${e.initiativeValues[e.initiative]} vs ${e.initiativeValues[e.initiative === 0 ? 1 : 0]})`
            : e.decidedBy === "experience"
              ? "(on experience)"
              : "(dice-off)"
        }`,
      };
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
    case "attackRolled":
      return {
        kind: "note",
        text: `${names[e.attacker]} rolls ${e.attackerDice.join(" + ")} against ${e.defenderDice.join(" + ")}`,
        detail: `(${e.cardName} — ${e.ability}: may re-roll a die)`,
        player: e.attacker,
      };
    case "rerolled":
      return { kind: "ability", text: `${e.cardName} — ${e.ability}: ${names[e.player]} re-rolls a ${e.from} into a ${e.to}.`, player: e.player };
    case "abilityFired":
      return {
        kind: "ability",
        // An effect on several warriors names them itself ("all warriors get …").
        text: `${e.cardName} — ${e.ability}: ${/^all /.test(e.effect) ? e.effect : `${names[e.player]} ${/^[+-]/.test(e.effect) ? `gets ${e.effect}` : e.effect}`}.`,
        player: e.player,
      };
    case "discardRequired":
      return { kind: "note", text: `${names[e.player]} must discard: ${e.reasons.join("; ")}.`, player: e.player };
    case "discarded":
      return { kind: "note", text: `${names[e.player]} discards ${e.name}.`, player: e.player };
    case "revealed":
      return {
        kind: "reveal",
        text: `${names[e.player]} reveals ${e.name}`,
        detail: `(${e.cardType}, initiative ${e.initiative ?? "—"})`,
        player: e.player,
      };
    case "attacked": {
      const bonus = e.rollBonus ? `${signed(e.rollBonus)}` : "";
      const defense = e.defenseBonus ? `${e.defenderRoll}${signed(e.defenseBonus)} = ${e.defenderTotal}` : `${e.defenderRoll}`;
      const roll = `(${e.attackerRoll}${signed(e.gridMod)}${bonus} = ${e.attackerTotal} vs ${defense}${e.tiebreak ? `, ${e.tiebreak} tiebreak` : ""})`;
      const withW = e.weapon ? ` with ${e.weapon.name}` : "";
      if (!e.hit) return { kind: "miss", text: `${names[e.attacker]} strikes at ${names[e.defender]}${withW} — and misses.`, detail: roll, player: e.attacker };
      return {
        kind: e.crit ? "crit" : "hit",
        text: `${names[e.attacker]} ${e.crit ? "lands a critical blow on" : "strikes"} ${names[e.defender]}${withW} for ${e.damage}.`,
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
