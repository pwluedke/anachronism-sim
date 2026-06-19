# Anachronism Sim

A digital simulator for *Anachronism*, the tactical CCG published 2004–2007 by TriKing Games in partnership with the History Channel. Warriors from across history meet on a grid where position and facing matter: combatants are moveable and facing-aware, and combat resolves through initiative, reveal timing, and attack/defense modifiers. The simulator targets three modes of play — solo against a bot, local hotseat (1v1 and up to 4 players), and online multiplayer.

## Status: Milestone 3 — Data cross-check (in progress)

Milestones 1 + 2 complete: the card database was rebuilt from `Anachronism Cards Spreadsheet.xls` (`spreadsheet-2007`), the new source of truth — 868 source rows merged to **761 distinct cards** (sets 1–7 + promos P1, P3–P7) with attack-grid geometry, multi-valued `traits`/`cultures`, a mechanical `tags` taxonomy, and warrior backgrounds. 740 clean / 21 flagged source facts / 0 suspect.

## Project Structure

- `docs/` — schema, data-source, and roadmap documentation.
- `data/` — generated card data: per-set JSON, the combined index, and the review queue.
- `scraper/` — parser that turns the source card list into schema-valid JSON (not yet implemented).
- `schema/` — JSON Schema definitions for card objects.
- `.github/` — issue templates (epic / task).

## Data Sources

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## Tech (intended, TENTATIVE — not committed)

TypeScript engine; renderer TBD (Phaser or canvas); browser-first, then Raspberry Pi 4 kiosk, then online multiplayer.

## Agents

- **Vega** (Claude.ai) — planning / strategy.
- **Gloom** (Cursor) — implementation.
- **Asterion** (Claude Code).
