# Data Sources

## PRIMARY (current source of truth)

- **`Anachronism Cards Spreadsheet.xls`** (in `data/raw/`, source tag `spreadsheet-2007`) — a
  community-compiled workbook (single sheet `A7`, 868 data rows) covering all numbered sets 1–7
  and promo sets P1, P3–P7. Card content dates to the 2004–2007 print run; the workbook was
  compiled by the community and the file was last saved in 2017. This is now the **source of
  truth** for the card database: it is already typed and cleaned, carries the attack-grid
  geometry (cols 60–71), and adds a mechanical tag taxonomy and warrior backgrounds.
  - One row → one card. The sheet contains a number of **literal duplicate rows** (the same card
    listed 2–5×); these are preserved (nothing filtered) and disambiguated with `-N` id suffixes
    and a `possible_duplicate` flag rather than dropped.
  - **Ranged weapons** print the warrior marker at cell **4B** (back row), not 3B; these are kept
    verbatim and flagged `grid_marker_anomaly`.

## HISTORICAL / SUPERSEDED

- **Christopher Heard, "Comprehensive Card List"** — last updated 2007-02-23 (source tag
  `heard-2007`). The original text parse; superseded by the spreadsheet rebuild (M1+M2). The raw
  page text remains archived in `data/raw/page_*.txt` for provenance; `scraper/parse_cards.py` is
  retained as the historical parser. Mirrors: Yumpu (`4553429`), Scribd (`629528000`); original
  host `dystemporalia.org` is dead. Author's disclaimer: some cards (esp. promos) may be inaccurate.

## SECONDARY (later cross-check / images)

- **BGG "Anachronism Archive" thread (2019)** — Google Drive with card images for all sets, including unreleased sets 8/9 and partial set 10, plus the rulebook and the "Analects".
- **Steam Workshop TTS mod "Anachronism CCG - All Official Sets 1-9"** (id `305502693`). Images sourced from `dystempia.org`.
- **anachronism.weebly.com "Gods and Warlords"** — set-by-set lists organized by culture.
- **dystemporalia.org/encyclopaedia** — partial capture on `web.archive.org` (FAQ / Oracle rulings).

## KNOWN DATA HAZARDS (historical — Heard text parser only)

> These applied to the `heard-2007` text parse. The `spreadsheet-2007` source is clean and
> typed, so they no longer apply to the live database; kept here for provenance.


- A replacement/placeholder character appears for **three different things** depending on position:
  1. the warrior-position icon in attack-grid stat lines,
  2. trait bullet separators,
  3. lost foreign-language diacritics.

  Disambiguate by **position**, not by the character itself.
- **Multi-ability warriors are common** — do not assume one ability per card.
- **Collector numbers include promo formats** (e.g. `P1/10`, `P20/100`) alongside standard `NN/100`.
- **Set number appears as a bare digit** floating between card entries — fragile to parse.
- **Attack-grid geometry** (which square holds which modifier) is **NOT** in the text; only modifier values are present. Geometry is deferred to an image-reconciliation pass (Milestone 2).
