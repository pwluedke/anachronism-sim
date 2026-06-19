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

## Milestone 3 (CURRENT): Data cross-check

Reconcile the spreadsheet against card images / the TTS mod + weebly; verify promos and the
duplicate-row groups; spot-check grid geometry against the art.

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
