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

## Milestone 5 (DONE): Bot opponent

Search-based opponent in [`engine/src/bot/`](../engine/README.md#bot-opponent-milestone-5), on the engine's
public surface only: `chooseAction(state, "easy"|"medium"|"hard", botSeed) -> Action`. Depth-limited
expectiminimax with alpha-beta; attacks are chance nodes resolved under bot-seeded dice samples (the
bot never reads the game's real rolls). Evaluation: life (tempo-scaled), a life-lead term that sharpens
toward the round-5 check, a turn-aware grid threat, a distance-to-engagement pull for the trailing side,
experience. Tiers: Easy depth 1 + 30% seeded blunders, Medium depth 3, Hard depth 4 (~50ms/decision).
All weights/depths are named constants in `engine/src/bot/config.ts`. Deterministic per
`(state, difficulty, botSeed)`; `selfPlay`/`selfPlayBatch` harness (`npm run selfplay`).

Also fixed during M5: `getLegalActions` now offers the free rotate on move (#10, #22).

**DONE =** 113 tests green; zero illegal actions and every game terminal across the self-play batches.
64 games per pairing, every fixture matchup from both seats, Hard depth 4:

| A vs B | A wins | B wins | draws |
|--------|--------|--------|-------|
| Hard vs Easy | 53 (83%) | 8 | 3 |
| Hard vs Medium | 24 (38%) | 37 | 3 |
| Medium vs Easy | 53 (83%) | 10 | 1 |
| Easy vs Easy | 33 | 29 | 2 |
| Medium vs Medium | 27 | 35 | 2 |

Both search tiers beat Easy clearly. **Hard does not beat Medium** on the current game (depths 4–6
all measured at or below even): with dice and the warrior matchup dominating and ~15 actions per side,
the spine has a low skill ceiling, so deeper search has little to work with.

### M5 follow-ups

- **Hard-tier strength re-check once abilities exist** — including whether search depth should end on
  turn boundaries rather than a raw ply count, and search speed (depth 6 cost 4–7s/decision once moves
  carry facings; a transposition cache is the obvious first step).
- **Mirror-match initiative RNG leak in search** — with equal experience, the round-start dice-off
  reads the game's real RNG on non-attack lines, so the search can see who wins initiative next round.

## Milestone 7 (DONE): UI polish / look-and-feel

Epic #31. The hotseat UI became the full table in an aged-parchment / cartography art direction:
design tokens for every colour, type and texture (`ui/src/theme.css`); the 4x4 arena as a region on an
aged map (coordinates, contours, compass rose) with sepia portrait medallions and facing pointers; a
click-driven, Metal Gear Acid-style move flow (reachable cells → ink path → facing carets → engine
attack-grid preview → confirm); a phase/turn tracker and a battle chronicle; keyboard shortcuts; and
play vs the computer (Easy/Medium/Hard, either side, a 650ms think-pause) alongside hotseat.

**DONE =** full games vs the bot played start to finish in the browser at all three difficulties;
4 face-down support-card slots per player and a dice tray present as placeholders; `ui/` audited for
rule logic — it only calls `init`, `applyAction`, `getLegalActions`, `chooseAction`, `projectGrid`,
`stepPos`, and every dispatched action is a `getLegalActions` member or the bot's choice. Screenshots
in [`docs/screenshots/`](screenshots/). Real warrior portrait art drops into `ui/src/portraits.ts`.

## Milestone 8 (DONE): Support cards — reveal flow, initiative, weapons (abilities off)

Epic #40. Each player now has a warrior + 4 support cards. Decks: `data/preset_decks.json`, 133
preset decks generated from the spreadsheet (`scraper/build_preset_decks.py`: a warrior followed by
exactly 4 non-warriors; promo sets hold no decks; the Kosem/Kösem Sultan variant counts once).
Round start follows the rulebook: both players reveal their next face-down card; the higher revealed
initiative goes first (tie / null ⇒ experience ⇒ 2d6 dice-off); card restrictions (one per type,
one per torso/head/leg/arm/shield trait, max 2 hands) are resolved by the player discarding — a real
`DISCARD` choice in the engine, made by the bot via search; then the first turn. Weapon attacks use
the weapon's grid + damage, once per weapon per turn; basic attacks stay uncapped. Card ability text
is carried but inert; the ability hooks still fire as no-ops. UI: support cards flip on reveal, a
weapon button per in-play weapon with grid preview, clickable discards, deck pickers for both sides.

**DONE =** 154 engine tests green (reveal, initiative, weapons, restrictions, deck loader, bot with
weapons); 33 UI tests; full games with support cards played vs the bot in the browser at every tier.
Deck self-play, 32 games per pairing with rotating preset decks, both seats:

| A vs B | A wins | B wins | draws |
|--------|--------|--------|-------|
| Easy vs Easy | 14 | 18 | 0 |
| Medium vs Easy | 29 | 3 | 0 |
| Medium vs Medium | 18 | 13 | 1 |
| Hard vs Easy | 27 | 5 | 0 |
| Hard vs Medium | 15 | 17 | 0 |
| Hard vs Hard | 17 | 15 | 0 |

All 192 games terminal with zero illegal actions; 610 weapon attacks and 44 restriction discards
along the way. Hard ≈ Medium again, as logged under the M5 follow-ups. Screenshots in
[`docs/screenshots/`](screenshots/) (`m8-*`).

### M8 follow-ups

- **Card abilities** — the next big step: implement `resolveHooks` + per-card ability effects.
- **Combat tiebreak dice** — a tied attack roll still breaks a tied-experience tie with one die each;
  the rulebook (p13) says two dice each, rerolling ties (initiative already does this).
- **UI bundle** — the deck card data takes the bundle past Vite's 500 kB advisory (121 kB gzipped);
  code-split if it grows.

## Milestone 9 (DONE): Card abilities — hybrid effect engine + first 6-card batch

Epic #51. Card abilities are on, through a hybrid engine in `engine/src/abilities/`: the hook points
feed a runtime that runs the abilities of each player's warrior and in-play support cards. An ability
is authored as **data** (`{ trigger, condition?, effects, usageLimit?, duration? }`, compiled from the
primitives) or **hand-coded** (the escape hatch, same runtime interface). Timing per the rulebook:
Reveal abilities after reveal/initiative/restrictions, then start-of-round, in initiative order;
damage abilities after the blow; Action abilities as an `ABILITY` action costing one action; timed
effects ("this round", "your next turn") outlive their card; once-per-round uses reset each round.
Also fixed: the combat dice-off now rolls two dice each.

First batch — one card per trigger type: Shinmen Takezo (+2 attack rolls), Maximinus (+1 while an
inspiration is in play), Leonidas (+1 life after dealing damage, once per round), Apollo (Reveal: +1
attack rolls this round), Carlos V (+1 life at round start if he lost initiative), Sun Tzu (Action:
+1 speed next turn). **Every other card is still inert.** The bot values roll bonuses and banked
speed; the UI shows each player's active abilities and effects and offers Action abilities.

**DONE =** 184 engine tests green (per-card behaviour + limits/durations, primitives, runtime, format,
bot); 48 self-play games with every batch deck terminal with zero illegal actions (Leonidas, Apollo,
Carlos V and Sun Tzu all fired); full games vs the bot in the browser with the abilities live.
Screenshots: [`docs/screenshots/`](screenshots/) (`m9-*`).

### M9 follow-ups

- **Shinmen Takezo's second clause** — "Your attacks with swords deal +1 damage" is not implemented
  (needs a weapon-trait condition primitive). He is a promo card, in no preset deck: tests use a
  test-only deck and he isn't selectable in the UI yet.
- **More cards** — later batches add primitives and cards; everything outside the six is inert.
- **Optional abilities** — the rulebook makes limited abilities optional; the six batch abilities only
  ever help their owner, so they apply automatically. Abilities with a downside will need a choice.

## Milestone 10 (DONE): Card abilities batch 2 — defense, damage, re-roll, move, reactions

Epic #60. The ability engine gained: start-of-game, when-hit and when-missed triggers; modifiers
evaluated against the specific attack (attack roll, **defense roll**, a weapon's own damage) with
per-effect conditions that add up (p17); ability damage to self / opponent / defender / attacker
(not a hit; can defeat a warrior outside an attack); Action moves of N spaces; and **optional**
abilities — an attack-roll re-roll pauses the attack after both rolls are seen and the attacker
chooses REROLL a die or KEEP. Combat now applies defense-roll modifiers (they were unwired: no card
used them before) and ability damage bonuses after a crit doubles base damage. Seven cards: Linen
Cuirass, Byrnies, Gladius, Khutulun, Subedei, Salah ad-Din, Vlad Tepes (13 implemented in all).

**DONE =** 217 engine tests green (triggers, effects, conditions, optional re-roll, combat
modifiers, per-card tests, bot); 40 self-play games with batch-1 and batch-2 decks terminal with zero
illegal actions (every event-triggered batch card fired; 37 re-roll decisions; 10 attacks with a
defense bonus); full games vs the bot in the browser with both batches live. Screenshots
[`docs/screenshots/`](screenshots/) (`m10-*`).

### M10 follow-ups

- **Byrnies and Gladius** are in no preset deck: tests use test-only decks; not selectable in the UI.
- **Shinmen Takezo's sword clause** (M9) can now be written with these primitives plus a
  weapon-trait condition.
- **More optional abilities** — the re-roll is the first; other "you may" abilities reuse the same
  pending-decision pattern.

## Milestone 11 (DONE): Card abilities batch 3 — rule-defined bulk pass

Epic #69. Implement every unimplemented card whose whole printed text fits the existing effects and
triggers plus a short whitelist of new conditions (element, culture, adjacency, life comparison,
face-up support count, won initiative, opponent lacks a card type). Cards needing anything else are
skipped and logged to `data/abilities_skipped.json` with a reason — the scoping input for batch 4.

Delivered: the whitelist conditions (warriors now carry element and cultures);
`scraper/build_ability_batch3.py` applies the inclusion rule to all 748 unimplemented cards — skip
list on the whole text, then strict per-sentence templates — and generates
`engine/src/abilities/cards-batch3.ts`. 11 cards qualified (24 implemented in all): Hoplon, Uma,
Leiter, Shield of Hephaestus, Ocrea, Charlemagne, Čhehúpahu Čhaŋksá, Kamea-e Helal-e Irani,
Moctezuma II, Mercurino Gattinara, Klironomimena Opla. 737 skipped; top reasons: unsupported clause
117, discard 83, extra attacks 74, "this game" 67, initiative 65, experience 64. The bot now values
"this round" speed before its owner's turn; 20 self-play games over decks carrying every batch-3
card ran clean.

### Follow-ups (from Milestone 11)

- **Batch 4 scoping** — the skip log's biggest buckets are mechanics, not phrasing: discard,
  extra attacks, initiative / experience modification, "this game" effects, dice-value branching.
- **Template reach** — "unsupported clause" (117) includes near-misses that a new effect would
  unlock: "your attacks deal +N damage" (all attacks, not one weapon), "your next attack deals +N",
  "attack rolls gain +N against <element> warriors", "move one space diagonally".

## Milestone 13: Raspberry Pi 4 kiosk build

## Milestone 14: Custom card creator

In-app schema-validated JSON append.

## Parked / Later

Hard maybes, no milestone number until picked up again.

- **4-player + variant rules** — Variant rules sourced from BGG variants.
- **Online multiplayer** — Authoritative server.
