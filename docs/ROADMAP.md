# Roadmap

## Milestone 1 + 2 (DONE): Card Database + Attack-grid geometry

**Rebuilt from `Anachronism Cards Spreadsheet.xls` as the source of truth** (`spreadsheet-2007`),
superseding the Heard text parse. The spreadsheet is clean and typed and already carries the
attack-grid geometry, so M1 (data) and M2 (grids) are satisfied by the same rebuild.

**DONE =** every card loads, zero schema failures, grids populated, the review queue is the punch list.

**Outcome:** 868 source rows merged to **761 distinct cards** (numbered sets 1–7 + promo sets P1,
P3–P7), schema-valid, all ids unique. 740 clean / 21 flagged / 0 suspect. The sheet's denormalized
duplicate rows were merged (unioning `traits` and the new `cultures` array). Flags are source facts:
`merge_conflict` (7 — a single-valued field differed across merged rows), `grid_marker_anomaly` (12 —
ranged weapons mark the warrior at 4B), `shared_collector` (2 — Kösem/Kosem Sultan). Flat 12-key
`grid` for all warriors/weapons; `tags` taxonomy, `salary`, `background`, `cultures` added.
Custom-card contract re-verified against the updated schema.

The earlier Heard-list build (749 cards, `heard-2007`) is retained only as `scraper/parse_cards.py`
+ the raw page text in `data/raw/` for provenance.

## Milestone 3 (deferred): Data cross-check

Reconcile the spreadsheet against card images / the TTS mod + weebly; verify promos and the
duplicate-row groups; spot-check grid geometry against the art. (Deferred — picked up the engine
spine first; the gitignored card-scan archives in `data/images/` are the inputs for this pass.)

## Milestone 4 (DONE): Core 1v1 engine — headless spine

Pure-function TypeScript engine in [`engine/`](../engine/README.md): 4×4 arena, orthogonal
movement + facing/rotation, attack-grid **projection** (rotates with facing, clips at edges),
basic attack resolution (2d6 + grid mods, crit-on-doubles, experience/dice-off tiebreak), the
5-round loop with initiative and all 4 win conditions, seeded-RNG determinism, and the 14 ability
hook-points fired (empty) at the correct points. Warriors only; abilities inert.

**DONE =** `tsc` clean, **71 vitest tests** green, ~99% statement coverage on the core, one full
scripted game's event log prints start-to-finish. Built against the Set-7 Basic Rulebook (committed at
`data/raw/anachronism_rulebook_set_7.pdf`): a basic attack costs 1 action and is **not capped per
turn** (p11). See the engine README.

## Milestone 6 (DONE): Minimal playable UI — hotseat (1v1)

Thin React + Vite UI in [`ui/`](../ui/) over the headless engine, imported by local path
(`@engine` → `engine/src`) so there is **one source of truth** for rules. Renders the 4×4 arena and
both warriors (facing shown), a status panel (round/turn/actions + per-warrior life & stats), and
highlights the active warrior's projected attack grid (via the engine's `projectGrid`). Actions come
from the engine's pure `getLegalActions(state)` rendered as buttons; clicking dispatches through
`applyAction` and re-renders. A scrolling event log and a winner banner (with the deciding condition)
complete a full hotseat game; "New game" re-inits. **No game logic lives in the UI** — verified.

**DONE =** full hotseat game playable in the browser start-to-finish; engine suite green (**78 tests**,
incl. `getLegalActions`); UI rule-logic audit clean; `vite build` + dev server confirmed.

## Milestone 5 (CURRENT): Bot opponent

A computer opponent over the same engine (it already exposes `getLegalActions`; a greedy reference
policy lives in `engine/examples/policy.ts`). Built before the UI's bot wiring.

## Milestone 7: 4-player + variant rules

Variant rules sourced from BGG variants.

## Milestone 8: Online multiplayer

Authoritative server.

## Milestone 9: Raspberry Pi 4 kiosk build

## Milestone 10: Custom card creator

In-app schema-validated JSON append.
