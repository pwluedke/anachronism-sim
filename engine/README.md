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

A turn ends when `actionsRemaining` hits 0 or on `PASS`. Illegal actions (off-grid move, attack with
the foe out of range, acting with no budget) are **no-ops**: the same state is returned with an empty
event list.

> **Rules-reconciliation note.** The Set-7 rulebook PDF was not present in the repo at build time, so
> this spine follows the written task summary. One deliberate, documented interpretation: a basic
> **ATTACK costs one action**, so the turn loop matches "up to *speed* actions; turn ends at 0 actions
> or PASS" exactly. Physical Anachronism may treat basic attacks as free/unlimited — revisit against
> the rulebook (`docs/`), it's an isolated change in `applyAction`.

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

## Project layout

```
src/        types, rng, arena, projection, combat, hooks, engine, index (public API)
fixtures/   warriors.ts — 4 real warriors (Achilles, Ajax, Jei the Tyrant, Suleiman)
examples/   policy.ts (greedy driver + event formatter), scripted-game.ts (printable game)
test/       rng, movement, projection, combat, flow, wincon, hooks, game
```

## Running

```bash
npm install
npm run build      # tsc --noEmit (type-check)
npm test           # vitest run
npm run test:cov   # vitest with coverage
npm run example    # print one full scripted game's event log
```
