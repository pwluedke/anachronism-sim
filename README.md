# Anachronism Sim

A digital simulator for *Anachronism*, the tactical CCG published 2004–2007 by TriKing Games in partnership with the History Channel. Warriors from across history meet on a grid where position and facing matter: combatants are moveable and facing-aware, and combat resolves through initiative, reveal timing, and attack/defense modifiers. The simulator targets three modes of play — solo against a bot, local hotseat (1v1 and up to 4 players), and online multiplayer.

## Status: Milestone 5 — Bot opponent (in progress)

Milestones 1 + 2 (card database, 761 cards from `spreadsheet-2007`) and Milestone 4 (headless 1v1 engine spine) are complete; Milestone 3 (data cross-check) is deferred. The engine ([`engine/`](engine/README.md)) is a pure-function, fully-tested TypeScript core: 4×4 arena, facing/rotation, attack-grid projection, 2d6 combat with crits, the 5-round initiative loop, all win conditions, seeded-RNG determinism, and stubbed ability hook-points (69 tests, ~99% core coverage).

## Project Structure

- `docs/` — schema, data-source, and roadmap documentation.
- `data/` — generated card data: per-set JSON, the combined index, and the review queue.
- `scraper/` — builders that turn the source data into schema-valid JSON (`build_from_spreadsheet.py`, the live source of truth; `parse_cards.py`, the historical Heard parser).
- `engine/` — headless, pure-function 1v1 game engine (TypeScript). See [`engine/README.md`](engine/README.md).
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
