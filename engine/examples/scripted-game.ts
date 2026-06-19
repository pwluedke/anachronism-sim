// Run one full game with the greedy policy and print its event log, so the
// whole spine (setup -> moves/attacks -> win) can be eyeballed end-to-end.
//   npm run example   (or: tsx examples/scripted-game.ts)

import { ACHILLES, AJAX } from "../fixtures/warriors";
import { playGreedyGame, formatEvent } from "./policy";

const SEED = 20260619;

function main(): void {
  const { state, events } = playGreedyGame(ACHILLES, AJAX, SEED);
  console.log(`Anachronism engine — scripted game  (seed ${SEED})`);
  console.log(`P0 = ${ACHILLES.name} (life ${ACHILLES.life}, exp ${ACHILLES.experience})`);
  console.log(`P1 = ${AJAX.name} (life ${AJAX.life}, exp ${AJAX.experience})`);
  console.log("-".repeat(60));
  for (const e of events) console.log(formatEvent(e));
  console.log("-".repeat(60));
  console.log(
    `final life: P0=${state.warriors[0].life}  P1=${state.warriors[1].life}  events=${events.length}`,
  );
}

main();
