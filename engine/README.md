# Anachronism Engine — Headless 1v1 Spine (Milestone 4)

A pure-function, fully-serializable TypeScript engine for 1v1 *Anachronism*.
**Warriors only** — no support cards; warrior abilities are inert but every
hook-point an ability could need is already fired (empty) at the right moment.
No UI, no I/O, no `Math.random`.

```ts
import { init, applyAction } from "./src";
import { ACHILLES, AJAX } from "./fixtures/warriors";

let { state, events } = init(ACHILLES, AJAX, /* seed */ 42);
({ state, events } = applyAction(state, { type: "MOVE", dir: "S", facing: "S" }));
```

## Core contract

- `init(card0, card1, seed) -> { state, events }` builds the starting game (round 1, ready to act).
- `applyAction(state, action) -> { state, events }` is **pure**: it never mutates its input
  (the state is structurally cloned), performs no I/O, and draws randomness only from the seeded
  RNG carried in the state. **Same seed + same actions ⇒ identical game.**
- `GameState` is plain data (objects/arrays/primitives) and round-trips through `JSON`.

## Coordinate convention

The arena is **4×4**. A cell is `{ row, col }` with `row, col ∈ 0..3`.

- `row` increases **downward**; `col` increases **rightward**.
- **Player 0** starts on **row 0** facing **S**; **Player 1** starts on **row 3** facing **N** —
  i.e. they start facing each other (down column 1 in the spine's fixed placement).
- `warriors[i]` is the warrior controlled by player `i` (index === `playerId`).

## Facing, rotation & attack-grid projection (the keystone)

A warrior has a `facing` of `N | E | S | W`. Its card carries a 3×4 **attack grid** in the card
schema shape (flat keys `"1A".."4C"`): each cell is a modifier string (`"+1"`, `"-1"`, …), the
literal `"marker"` (the warrior's own cell, canonically `3B`), or `null` (empty).

Projection maps grid cells onto arena cells (`src/projection.ts`):

1. Express each modifier cell as a **local offset from the marker**:
   `forward = markerRow − gridRow` (toward row 1 is "forward", row 4 is "behind"),
   `right = gridCol − markerCol` (col C is the warrior's right, col A its left).
2. Rotate that `(forward, right)` frame onto the arena using the facing:
   `forwardVec` is the facing's unit vector; `rightVec` is `forwardVec` rotated 90° clockwise.
   `cell = position + forward·forwardVec + right·rightVec`.
3. **Clip**: cells that land off the board (edges/corners) are dropped.

`modifierAt(grid, pos, facing, target, size)` returns the modifier for a target cell, or `null`
if the target is not covered — which is exactly the basic-attack legality test.

> Note: ranged weapons in the source print the marker at `4B`; projection keys off whatever cell
> holds `"marker"`, so it generalises, but the spine's warriors all use the canonical `3B`.

## Round / turn / combat rules (spine scope)

- **5 rounds.** Each round: determine **initiative**, then each player takes one turn, initiative
  winner first.
- **Initiative** (no support cards in the spine, so it is always the tiebreak path): higher
  **Experience** wins; equal ⇒ unmodified **dice-off**. (A support-card initiative source plugs in
  later.)
- **Turn** = up to `speed` actions. `actionsRemaining` resets to the warrior's speed at turn start.
- **Basic attack**: legal only if the defender stands on a numbered cell of the attacker's projected
  grid. Both roll **2d6** simultaneously; the attacker adds the grid modifier for the defender's
  cell. **Higher total hits.** **Tie** ⇒ higher Experience, then dice-off. **Crit** = attacker
  rolled **doubles** ⇒ doubles the base damage. Damage = attacker's `damage` (×2 on crit), subtracted
  from the defender's life.
- **Win conditions**: (a) life ≤ 0 ⇒ immediate loss; (b) both alive after round 5 ⇒ higher current
  life; (c) life tie ⇒ higher Experience; (d) still tied ⇒ draw.

### Actions

| Action | Shape | Cost | Effect |
|--------|-------|------|--------|
| `MOVE` | `{ type:"MOVE", dir, facing? }` | 1 action | Step one orthogonal cell (`dir`) into an empty in-arena cell; optional **free rotate** to `facing` in the same action. |
| `ROTATE` | `{ type:"ROTATE", facing }` | 1 action | Turn to face any orthogonal direction. |
| `ATTACK` | `{ type:"ATTACK" }` | 1 action | Basic attack against the opponent (must be in the projected grid). |
| `PASS` | `{ type:"PASS" }` | — | End the turn immediately. |

`getLegalActions(state)` offers every legal step with each of the four facings (the free rotate), so
up to 16 `MOVE`s per position.

A turn ends when `actionsRemaining` hits 0 or on `PASS`. Illegal actions (off-grid move, attack with
the foe out of range, acting with no budget) are **no-ops**: the same state is returned with an empty
event list.

> **Basic-attack metering — matches the rulebook (Set 7 Basic Rulebook, p11).** A basic **ATTACK
> costs one action** (one of the warrior's Speed actions) and is **not capped per turn**: a Speed-3
> warrior may spend all three actions on three basic attacks. This is exactly the printed rule
> ("Basic Attacks are not limited to one per Turn"), so the turn loop also satisfies "up to *speed*
> actions; turn ends at 0 actions or PASS". (Weapon attacks ARE limited to one per weapon per turn —
> but there are no weapons in the spine, so that cap is not carried over to basic attacks.)
> The rulebook lives at [`data/raw/anachronism_rulebook_set_7.pdf`](../data/raw/anachronism_rulebook_set_7.pdf).

## GameState shape

```ts
interface GameState {
  phase: "setup" | "playing" | "ended";
  rng: number;       // seeded-RNG state (advanced purely each draw)
  seed: number;
  arenaSize: number; // 4
  warriors: [Warrior, Warrior];     // index === playerId
  round: number; maxRounds: number; // 1..5
  turnOrder: [PlayerId, PlayerId];  // this round's order
  turnIndex: 0 | 1; currentPlayer: PlayerId;
  actionsRemaining: number;         // resets to speed each turn
  initiative: PlayerId | null;
  winner: PlayerId | "draw" | null;
}
```

`applyAction` returns a `GameEvent[]` log (`moved`, `rotated`, `attacked{roll,mods,hit,crit,damage,
tiebreak}`, `warriorDefeated`, `roundStarted/Ended`, `turnStarted/Ended`, `gameEnded`, …) for UI,
replay, and bots.

## Ability hook-points

`resolveHooks(state, hook, context) -> state` is fired (currently as the identity stub) at every
point an ability could act. **Firing order** through a turn:

`onSetup` → per round: `onRoundStart` → `onReveal` → `onTurnStart` → … actions … → during an
`ATTACK`: `beforeAttackRoll` → `afterAttackRoll` → (`onHit` | `onMiss`) → [`onCriticalHit`] →
`afterDefense` → [`onDamageDealt`] → [`onWarriorDefeated`] → … → `onTurnEnd` → (next turn's
`onTurnStart`, or `onRoundEnd`).

The engine runs identically with all hooks empty; Milestone-N ability work implements `resolveHooks`
without re-plumbing the loop.

## Bot opponent (Milestone 5)

`src/bot/` is a search-based opponent built only on the public surface (`getLegalActions`,
`applyAction`, reading `GameState`). Pure, no I/O, no time caps.

```ts
import { chooseAction } from "./src";
const action = chooseAction(state, "hard", /* botSeed */ 7); // always a member of getLegalActions(state)
```

- **Search** (`search.ts`): depth-limited expectiminimax with alpha-beta. One ply = one action; max/min
  follows `state.currentPlayer`. An `ATTACK` is a chance node: the engine resolves it under
  `CHANCE_SAMPLES` bot-seeded dice samples and the outcomes are weighted by frequency, so the bot never
  reads the game's real future rolls. Ties go to the lowest-index legal action. Known leak: a
  mirror-match initiative dice-off still reads the real RNG.
- **Evaluation** (`evaluate.ts`): life difference (tempo-scaled), a life-lead term that sharpens as
  rounds run out, a turn-aware grid threat (the side to move counts each remaining action), a
  distance-to-engagement pull for the trailing side, and an experience tiebreak.
- **Tiers** (`config.ts`): `TIER_CONFIG` — Easy depth 1 + `BLUNDER_CHANCE` random moves, Medium depth 3,
  Hard `DEPTH_HARD` (4). Every weight and depth is a named constant in `config.ts`.
- **Determinism**: same `(state, difficulty, botSeed)` ⇒ same action.
- **Self-play** (`selfplay.ts`): `selfPlay(cardId0, cardId1, d0, d1, seed)` plays a full game and throws
  on any illegal action or runaway game; `selfPlayBatch` plays every fixture matchup from both seats.

## Project layout

```
src/        types, rng, arena, projection, combat, hooks, legal, engine, index (public API)
src/bot/    config, evaluate, search, choose, selfplay — the Milestone 5 opponent
fixtures/   warriors.ts — 4 real warriors (Achilles, Ajax, Jei the Tyrant, Suleiman)
examples/   policy.ts (greedy driver + event formatter), scripted-game.ts (printable game),
            bot-selfplay.ts (bot-vs-bot log + win-rate table)
test/       rng, movement, projection, combat, flow, wincon, hooks, game, legal, bot-*
```

## Running

```bash
npm install
npm run build      # tsc --noEmit (type-check)
npm test           # vitest run
npm run test:cov   # vitest with coverage
npm run example    # print one full scripted game's event log
npm run selfplay -- 64   # Hard-vs-Easy sample log + win rates, 64 games per tier pairing
```
