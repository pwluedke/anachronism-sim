// Bot-vs-bot batch: win rates per tier pairing + one full Hard-vs-Easy log.
// Usage: npm run selfplay [-- gamesPerPairing]   (default 50)

import { selfPlay, selfPlayBatch, type PairingSummary } from "../src/bot/selfplay";
import type { Difficulty } from "../src/bot/config";
import { ACHILLES, AJAX } from "../fixtures/warriors";
import { formatEvent } from "./policy";

const games = Number(process.argv[2] ?? 50);

const log = selfPlay(ACHILLES.id, AJAX.id, "hard", "easy", 2026);
console.log(`=== Hard (P0 ${ACHILLES.name}) vs Easy (P1 ${AJAX.name}), seed 2026 ===`);
for (const e of log.events) console.log(formatEvent(e));
console.log(`(${log.actions} bot actions, ${log.turns} turns)\n`);

const pairings: [Difficulty, Difficulty][] = [
  ["hard", "easy"],
  ["hard", "medium"],
  ["medium", "easy"],
  ["easy", "easy"],
  ["medium", "medium"],
  ["hard", "hard"],
];

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(0)}%`.padStart(4);
console.log(`=== Self-play: ${games} games per pairing (every fixture matchup played from both seats) ===`);
console.log("A        B        A wins     B wins     draws   time");
const rows: PairingSummary[] = [];
for (const [a, b] of pairings) {
  const t = performance.now();
  const r = selfPlayBatch(a, b, games);
  rows.push(r);
  console.log(
    `${a.padEnd(8)} ${b.padEnd(8)} ${String(r.aWins).padStart(3)} ${pct(r.aWins, games)}   ${String(r.bWins).padStart(3)} ${pct(r.bWins, games)}   ${String(r.draws).padStart(3)}     ${((performance.now() - t) / 1000).toFixed(1)}s`,
  );
}
console.log(`\nAll ${rows.length * games} games reached a legal terminal state; 0 illegal actions (any would have thrown).`);
