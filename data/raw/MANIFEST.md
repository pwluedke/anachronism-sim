# Raw Card-Text Archive — MANIFEST

**Issue:** #2 — Acquire & archive raw source text from the Heard "Comprehensive Card List".
**Retrieval date:** 2026-06-17
**Source:** Yumpu mirror of the Christopher Heard "Comprehensive Card List" (doc id `4553429`).
**Source URL pattern:** `https://www.yumpu.com/en/document/view/4553429/anachronism-comprehensive-card-list-dystemporalia/{N}`
**Fallback (not used):** Scribd doc `629528000` — JavaScript-gated, not directly fetchable without a browser/download.

## Capture summary

- **Viewer URLs fetched:** N = 1–65 (all HTTP 200, one polite ~1.3 s delay between requests).
- **Distinct text chunks archived:** **33** → `page_01.txt` … `page_33.txt`.
- **Pages that failed or returned garbage:** **none.**
- **Total archived card text:** 311,288 bytes across 33 files.

### Why 65 URLs → 33 files
The ticket specified N = 1–33, but the Yumpu viewer actually has **65 viewer pages** (as noted in `docs/DATA_SOURCES.md`). The viewer serves a **2-page spread per request**, and *both* URLs of a spread return identical text (verified by hash: N=2≡N=3, N=4≡N=5, … N=64≡N=65; N=1 is a lone cover page). De-duplicating the spread pairs in document order yields exactly **33 distinct chunks** — which is the intended "33 pages" deliverable. URLs 1–33 alone would have stopped partway through WEAPONS, missing all ARMOR and SPECIALS. Scope confirmed with Paul before archiving.

The `src` column below records which viewer URL(s) each archived page came from.

## Known characters preserved (NOT cleaned)
- The replacement character `�` (U+FFFD) appears **756 times** across the archive. This is the known data hazard from `docs/DATA_SOURCES.md` (warrior-position icon / trait separator / lost diacritic, disambiguated by position) and is preserved **verbatim** — not treated as a fetch failure.
- En-dashes (`–`), curly quotes (`“ ” ’`), bullet separators (`•`), and accented characters (`Á É à ì`) are preserved as retrieved.
- HTML transport entities (`&amp;`, `&lt;`, numeric entities) were decoded back to their characters; no other normalization was performed. `page_01.txt` is trimmed to begin at `WARRIORS` (the document title/disclaimer preamble before it was dropped per the ticket's start boundary).

## Validation (known-good reference)
- `page_01.txt` — ACHILLES → ALFRED THE GREAT ✓ (ends "…Matthew Armstrong 2 01/100").
- `page_02.txt` — AMAZONIA → BUREBISTA ✓ (ends "…Nick Percival 6 51/100").
- Warrior stat-lines ("N Life") across page_01+page_02: **27**. (The ticket estimated ~40; the lower count is because page_01 is the lone cover page with only ~8 warriors. Card start/end boundaries match the reference exactly.)

## Section headers (as found in the archive)
| Section | First appears in |
|---|---|
| WARRIORS | page_01.txt |
| INSPIRATIONS | page_09.txt |
| WEAPONS | page_15.txt |
| ARMOR | page_23.txt |
| SPECIALS | page_28.txt |

## Per-file detail
| File | src viewer URL(s) | bytes | text blocks | section header(s) |
|---|---|---|---|---|
| page_01.txt | 1 | 3361 | 1 | WARRIORS |
| page_02.txt | 2/3 | 8795 | 2 | — |
| page_03.txt | 4/5 | 8341 | 2 | — |
| page_04.txt | 6/7 | 8721 | 2 | — |
| page_05.txt | 8/9 | 8724 | 2 | — |
| page_06.txt | 10/11 | 8762 | 2 | — |
| page_07.txt | 12/13 | 8067 | 2 | — |
| page_08.txt | 14/15 | 8257 | 2 | — |
| page_09.txt | 16/17 | 9248 | 2 | INSPIRATIONS |
| page_10.txt | 18/19 | 11716 | 2 | — |
| page_11.txt | 20/21 | 11315 | 2 | — |
| page_12.txt | 22/23 | 11046 | 2 | — |
| page_13.txt | 24/25 | 10939 | 2 | — |
| page_14.txt | 26/27 | 10762 | 2 | — |
| page_15.txt | 28/29 | 9277 | 2 | WEAPONS |
| page_16.txt | 30/31 | 8159 | 2 | — |
| page_17.txt | 32/33 | 8486 | 2 | — |
| page_18.txt | 34/35 | 7908 | 2 | — |
| page_19.txt | 36/37 | 7267 | 2 | — |
| page_20.txt | 38/39 | 7593 | 2 | — |
| page_21.txt | 40/41 | 7327 | 2 | — |
| page_22.txt | 42/43 | 8373 | 2 | — |
| page_23.txt | 44/45 | 10375 | 2 | ARMOR |
| page_24.txt | 46/47 | 10629 | 2 | — |
| page_25.txt | 48/49 | 10532 | 2 | — |
| page_26.txt | 50/51 | 11135 | 2 | — |
| page_27.txt | 52/53 | 10869 | 2 | — |
| page_28.txt | 54/55 | 10710 | 2 | SPECIALS |
| page_29.txt | 56/57 | 10508 | 2 | — |
| page_30.txt | 58/59 | 10926 | 2 | — |
| page_31.txt | 60/61 | 11043 | 2 | — |
| page_32.txt | 62/63 | 11221 | 2 | — |
| page_33.txt | 64/65 | 10896 | 2 | — |
