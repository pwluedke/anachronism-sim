# Anachronism Sim

A digital simulator for *Anachronism*, the tactical CCG published 2004–2007 by TriKing Games in partnership with the History Channel. Warriors from across history meet on a grid where position and facing matter: combatants are moveable and facing-aware, and combat resolves through initiative, reveal timing, and attack/defense modifiers. The simulator targets three modes of play — solo against a bot, local hotseat (1v1 and up to 4 players), and online multiplayer.

## Status: Milestone 5 — Bot opponent (current)

Done: M1+M2 (card database, 761 cards from `spreadsheet-2007`), **M4** (headless 1v1 engine spine), and **M6** (minimal playable hotseat UI). M3 (data cross-check) is deferred. The engine ([`engine/`](engine/README.md)) is a pure-function, fully-tested TypeScript core (78 tests, ~99% core coverage): 4×4 arena, facing/rotation, attack-grid projection, 2d6 combat with crits, the 5-round initiative loop, all win conditions, seeded-RNG determinism, `getLegalActions`, and stubbed ability hook-points. The UI ([`ui/`](ui/)) is a thin React+Vite hotseat client that imports the engine directly — all rules stay in the engine.

## Project Structure

- `docs/` — schema, data-source, and roadmap documentation.
- `data/` — generated card data: per-set JSON, the combined index, and the review queue.
- `scraper/` — builders that turn the source data into schema-valid JSON (`build_from_spreadsheet.py`, the live source of truth; `parse_cards.py`, the historical Heard parser).
- `engine/` — headless, pure-function 1v1 game engine (TypeScript). See [`engine/README.md`](engine/README.md).
- `ui/` — minimal React + Vite hotseat UI over the engine (imports `engine/` by local path; no duplicated logic).
- `schema/` — JSON Schema definitions for card objects.
- `.github/` — issue templates (epic / task).

## Running the UI (hotseat 1v1)

```bash
cd ui && npm install && npm run dev    # serves at http://localhost:5173
```

Both players share one screen: the active warrior's legal actions appear as buttons (Move / Rotate /
Attack / Pass), the board highlights its attack grid, and the event log narrates every move and
attack until a winner is declared. `cd engine && npm test` runs the engine's 78-test suite.

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
