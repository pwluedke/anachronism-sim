# Roadmap

## Milestone 1 (DONE): Card Database

Scrape the Heard list → per-set JSON + combined index + CSV + review queue.
Self-healing parse (every card validates; defaults are flagged into the review queue).

**DONE =** every card loads, zero hard failures, the review queue is the punch list.

**Outcome:** 749 cards, 730 clean / 19 flagged / 0 suspect. All 19 flags are documented
source facts (zero parse defects); all ids unique; schema-valid; custom-card contract verified.

## Milestone 2 (CURRENT): Attack-grid geometry

Reconcile `grid_raw` against card images; populate `grid` objects; visually verify against the art.

## Milestone 3: Data cross-check

Reconcile Heard text vs the TTS mod + weebly; fix flagged promos.

## Milestone 4: Core 1v1 engine

Grid, facing, initiative, reveal timing, 5-round structure, attack/defense resolution with
modifiers + crits. Headless + tested.

## Milestone 5: Bot opponent

## Milestone 6: Local hotseat UI (1v1)

## Milestone 7: 4-player + variant rules

Variant rules sourced from BGG variants.

## Milestone 8: Online multiplayer

Authoritative server.

## Milestone 9: Raspberry Pi 4 kiosk build

## Milestone 10: Custom card creator

In-app schema-validated JSON append.
