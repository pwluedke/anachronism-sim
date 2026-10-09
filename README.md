# Anachronism Sim

A digital simulator for *Anachronism*, the tactical CCG published 2004–2007 by TriKing Games in partnership with the History Channel. Warriors from across history meet on a grid where position and facing matter: combatants are moveable and facing-aware, and combat resolves through initiative, reveal timing, and attack/defense modifiers. The simulator targets three modes of play — solo against a bot, local hotseat (1v1 and up to 4 players), and online multiplayer.

## Status: Milestone 14 — Card abilities batch 5 (done)

Done: M1+M2 (card database, 761 cards from `spreadsheet-2007`), **M4** (headless 1v1 engine spine), **M6** (minimal playable hotseat UI), **M5** (search-based bot opponent, Easy/Medium/Hard), **M7** (cartography UI with click-driven board and the bot wired in), **M8** (support cards: per-round reveal, card-based initiative, weapon attacks, card restrictions, with 133 preset decks), **M9** (card abilities: a hybrid data/coded ability engine, first six cards), **M10** (ability batch 2: defense, damage, re-roll, move and reaction abilities), **M11** (ability batch 3: a rule-defined bulk pass), and **M12** (ability batch 4: cards recovered from the batch-3 skip log, plus a fix making "your next attack" last one attack), and **M14** (ability batch 5: experience as a modifiable stat, ability dice rolls with a threshold, moving another warrior — 58 cards live; the 703 that don't fit yet are logged with a reason in `data/abilities_skipped.json`). M13 (custom card creator) is next. M3 (data cross-check) is deferred. The engine ([`engine/`](engine/README.md)) is a pure-function, fully-tested TypeScript core (317 tests): 4×4 arena, facing/rotation (incl. the free rotate on move), attack-grid projection, 2d6 combat with crits, the 5-round initiative loop, all win conditions, seeded-RNG determinism, `getLegalActions`, support cards (reveal, initiative, weapons, restrictions), card abilities (58 cards), and the bot (`chooseAction(state, difficulty, botSeed)`). The UI ([`ui/`](ui/)) is a React+Vite client in an aged-map / parchment art direction that imports the engine directly — all rules stay in the engine.

## Project Structure

- `docs/` — schema, data-source, and roadmap documentation.
- `data/` — generated card data: per-set JSON, the combined index, and the review queue.
- `scraper/` — builders that turn the source data into schema-valid JSON (`build_from_spreadsheet.py`, the live source of truth; `parse_cards.py`, the historical Heard parser).
- `engine/` — headless, pure-function 1v1 game engine (TypeScript). See [`engine/README.md`](engine/README.md).
- `ui/` — minimal React + Vite hotseat UI over the engine (imports `engine/` by local path; no duplicated logic).
- `schema/` — JSON Schema definitions for card objects.
- `.github/` — issue templates (epic / task).

## Running the UI

```bash
cd ui && npm install && npm run dev    # serves at http://localhost:5173
```

Pick a preset deck for each side, then play against the computer (Easy / Medium / Hard, either side)
or hotseat with two players on one screen. Support cards flip face-up one per round; the higher
revealed initiative moves first. On your turn, reachable cells glow on the map: click one to draw your path, pick a facing from
the carets (the attack grid previews for each), and confirm. Click your own warrior to turn in place,
or an enemy in range to attack. Each in-play weapon gets its own attack button (hover to preview its
grid). If a reveal puts you over a card limit, click the highlighted card to discard. Keys: arrows
pick a step then a facing, Enter confirm, Esc cancel, A attack, W weapon attack, R turn in place,
E end turn. The chronicle narrates every move and blow until a winner is
declared. Card abilities are live for 58 cards so far — in the preset decks: Maximinus,
Leonidas, Apollo, Carlos V, Sun Tzu, Linen Cuirass, Khutulun, Subedei, Salah ad-Din, Vlad Tepes,
Charlemagne, Moctezuma II, Mercurino Gattinara, Hoplon, Shield of Hephaestus, Ocrea, Čhehúpahu
Čhaŋksá, Kamea-e Helal-e Irani, Klironomimena Opla, Yumi, Greatsword, Cyrus The Great,
Akaitoodoshi-Yoroi, Spathi Tis Trias, Targe, Crown of England, Sica, Claidheamh Leathann, Kopis,
Milo of Croton, Gengis Khan, Alman Sukh, Khnum, Mercury, Achilles, Pythagoras, Richard the
Lionheart, Belt of Hippolyte, Cassis, Robin Hood, Itzcoatl, Afroditi, Izanagi, Golyath, Scutum and
Yeke Mongghol Ulus (Shinmen Takezo, Byrnies, Gladius, Uma, Leiter, Miyamoto Musashi, Bishamon-ten,
Yggdrassil, Haidate, Mjollnir, Kimono and Mempo in tests). An ability that moves a warrior after a
roll (Scutum, Mempo, Kimono) asks whoever decides to pick the space on the board. Each player's panel lists their abilities with card
text and status; Action abilities get a button (Salah ad-Din's move is picked on the board); an
optional re-roll (Subedei) asks you to re-roll a die or keep the roll. Other cards' abilities are not
in effect yet; the dice tray is still a placeholder.

![A weapon attack being previewed: Sarissae's grid, with both players' support cards revealed](docs/screenshots/m8-weapon-preview.jpg)

`cd engine && npm test` runs the engine's 217-test suite; `npm run selfplay` pits the bot tiers against each other.

## Data Sources

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## Tech (intended, TENTATIVE — not committed)

TypeScript engine; renderer TBD (Phaser or canvas); browser-first, then online multiplayer.

## Agents

- **Galvani** (Claude Enterprise) — product management / planning, with Paul.
- **Gloom** (Cursor) — implementation.
- **Asterion** (Claude Code) — implementation.
