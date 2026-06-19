# Roadmap

## Milestone 1 + 2 (DONE): Card Database + Attack-grid geometry

**Rebuilt from `Anachronism Cards Spreadsheet.xls` as the source of truth** (`spreadsheet-2007`),
superseding the Heard text parse. The spreadsheet is clean and typed and already carries the
attack-grid geometry, so M1 (data) and M2 (grids) are satisfied by the same rebuild.

**DONE =** every card loads, zero schema failures, grids populated, the review queue is the punch list.

**Outcome:** 868 cards (numbered sets 1–7 + promo sets P1, P3–P7), schema-valid, all ids unique.
663 clean / 205 flagged / 0 suspect. Flags are source facts: `possible_duplicate` (duplicate rows
in the sheet, preserved not dropped), `grid_marker_anomaly` (ranged weapons mark the warrior at 4B),
and `shared_collector`. Flat 12-key `grid` populated for all 334 warriors/weapons; `tags` taxonomy,
`salary`, and `background` added. Custom-card contract re-verified against the updated schema.

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
