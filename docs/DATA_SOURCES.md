# Data Sources

## PRIMARY

- **Christopher Heard, "Comprehensive Card List"** — last updated 2007-02-23. Full text of all cards, sorted by type then name. Mirrored on:
  - Yumpu (doc id `4553429`, 65 viewer pages)
  - Scribd (doc `629528000`, 68 pages)
  - Original host `dystemporalia.org` is dead.
- **Author's own disclaimer:** the text of some cards — especially newer promotional cards — may be inaccurate or missing.

## SECONDARY (later cross-check / images / attack-grid geometry)

- **BGG "Anachronism Archive" thread (2019)** — Google Drive with card images for all sets, including unreleased sets 8/9 and partial set 10, plus the rulebook and the "Analects".
- **Steam Workshop TTS mod "Anachronism CCG - All Official Sets 1-9"** (id `305502693`). Images sourced from `dystempia.org`.
- **anachronism.weebly.com "Gods and Warlords"** — set-by-set lists organized by culture.
- **dystemporalia.org/encyclopaedia** — partial capture on `web.archive.org` (FAQ / Oracle rulings).

## KNOWN DATA HAZARDS (for the parser)

- A replacement/placeholder character appears for **three different things** depending on position:
  1. the warrior-position icon in attack-grid stat lines,
  2. trait bullet separators,
  3. lost foreign-language diacritics.

  Disambiguate by **position**, not by the character itself.
- **Multi-ability warriors are common** — do not assume one ability per card.
- **Collector numbers include promo formats** (e.g. `P1/10`, `P20/100`) alongside standard `NN/100`.
- **Set number appears as a bare digit** floating between card entries — fragile to parse.
- **Attack-grid geometry** (which square holds which modifier) is **NOT** in the text; only modifier values are present. Geometry is deferred to an image-reconciliation pass (Milestone 2).
