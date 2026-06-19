# Card Schema

This document describes the card schema in human-readable form. The same schema
(see [`../schema/card.schema.json`](../schema/card.schema.json)) validates **both**
scraped cards and user-submitted custom cards — that shared contract is what makes
the in-app "add card" feature (Milestone 10) trivial.

The parser is **self-healing**: when a required value cannot be read cleanly it is
filled with the documented default and the field name is appended to `needs_review`.
A card therefore always validates; the `review_queue.json` is the punch list of what
to fix.

## Per-card fields

| Field | Type | Required? | Self-healing default |
|-------|------|-----------|----------------------|
| `id` | string | **required** | — |
| `source` | enum | **required** | — |
| `name` | string | **required** | `""` + flag |
| `card_type` | enum | **required** | — |
| `element` | enum | optional | `"unknown"` |
| `set` | integer | **required** | — |
| `set_label` | string | optional (promos only) | omitted |
| `collector` | string | **required** | `""` + flag |
| `culture` | string | optional | `""` (primary; first of `cultures`) |
| `cultures` | string[] | optional | `[]` (authoritative list) |
| `traits` | string[] | optional | `[]` |
| `life` | integer \| null | warrior stat | `null` (NA) |
| `speed` | integer \| null | warrior stat | `null` (NA) |
| `experience` | integer \| null | warrior stat | `null` (NA) |
| `damage` | integer \| null | warrior/weapon | `null` (NA) |
| `initiative` | integer \| null | support stat | `null` (NA) |
| `hands` | integer \| null | weapon stat | `null` (NA) |
| `salary` | integer \| null | warrior point cost | `null` (NA / non-warrior) |
| `weapon_damage` | integer | legacy (Heard) | omitted on spreadsheet records |
| `grid_raw` | string | optional | `""` |
| `grid` | object \| null | warrior/weapon only | `null` for support cards |
| `abilities` | array of objects | optional | `[]` |
| `flavor` | string | optional | `""` |
| `illustrator` | string | optional | `""` |
| `background` | string | optional | `""` |
| `tags` | object of bool\|null | optional | populated for every card |
| `parse_confidence` | enum | **required** | — |
| `needs_review` | string[] | **required** | `[]` (empty = clean) |
| `raw_source_text` | string | **required** | always populated |

### Field detail

- **`id`** — `"s{set}-{collector}"` for numbered cards (e.g. `"s1-091"`); `"s{set}-P{collector}"` for promos (e.g. `"s1-P001"`); `"custom-{uuid}"` for homebrew. Collisions (duplicate rows / shared collector) are disambiguated with a `-{card_type}` or `-N` suffix.
- **`source`** — enum: `heard-2007` | `spreadsheet-2007` | `tts-mod` | `weebly` | `custom` | `user-import`. Current source of truth: `spreadsheet-2007`.
- **`name`** — the card name. Default `""` and flag if unreadable.
- **`card_type`** — enum: `warrior` | `inspiration` | `weapon` | `armor` | `special`.
- **`element`** — enum: `Aether` | `Earth` | `Fire` | `Metal` | `Water` | `Wind` | `Wood` | `unknown`. `unknown` when the source prints no element (most support cards, all weapons).
- **`set`** — integer 1–7. For promo cards this is the **parent** set; the promo label lives in `set_label`.
- **`set_label`** — `"P1"`..`"P7"`. Present **only** on promo cards; numbered cards omit it.
- **`collector`** — string; preserve leading zeros (`"001"`).
- **`culture`** — string. The primary culture (first of `cultures`), kept for backward compat. `""` when absent.
- **`cultures`** — string array; the authoritative culture list. Usually one value; pirate-set cards carry two (e.g. `["Pirate","Welsh"]`), merged from the spreadsheet's multi-row encoding.
- **`traits`** — string array (the card's Subtype/Traits, e.g. `["Male"]`, `["Polearm"]`).
- **`life`, `speed`, `experience`, `damage`** — integer or `null`. `null` when the source value is `NA` (e.g. warriors have no `damage`-less... support cards leave the warrior stats `NA`).
- **`initiative`** — integer or `null`. Support-card initiative; `null` (NA) for warriors.
- **`hands`** — integer or `null` (weapons).
- **`salary`** — integer or `null`. Warrior point cost (the "Salary" column); `null` for non-warriors / NA.
- **`weapon_damage`** — **legacy** Heard-only field. The spreadsheet folds weapon damage into `damage`, so spreadsheet records omit it.
- **`grid_raw`** — string. Row-major non-empty grid cells, verbatim (marker shown as `▲`). `""` for support cards.
- **`grid`** — flat 12-key object (`1A`..`4C`) or `null`. Each cell is a modifier string (e.g. `"+1"`), the literal `"marker"` (warrior position, normally at `3B`; ranged weapons place it at `4B`, flagged `grid_marker_anomaly`), or `null` for an empty cell. `null` for support cards (no grid).
- **`abilities`** — array of `{ name: string, type: action|reveal|static|unknown, text: string }`. Parsed from the Text column (`Name - Reveal:` / `Name - Action:` / `Name:`).
- **`flavor`** — string. Card flavor text. `""` when absent.
- **`illustrator`** — string. `""` when absent.
- **`background`** — string. Warrior background / historical prose; often `""` for support cards.
- **`tags`** — object mapping snake_cased mechanical-taxonomy columns (e.g. `reveal`, `attack_bonus`, `cavalry_dependant`) to `boolean` (or `null` if the source value is NA). Populated for every card.
- **`parse_confidence`** — enum: `clean` | `partial` | `suspect`.
- **`needs_review`** — string array of flags. Empty = clean. Spreadsheet flags: `merge_conflict` (duplicate rows merged but a single-valued field — tags/hands/flavor/name — differed; canonical value chosen, kept for human review), `shared_collector` (two distinct cards share a collector number), `grid_marker_anomaly` (warrior marker not at 3B — ranged weapons mark at 4B).
- **`raw_source_text`** — string. The verbatim source Text-column value for this card. Always populated.

## File wrapper

Per-set files in `data/sets/` and the combined `data/all_cards.json` share this wrapper:

```json
{
  "schema_version": 1,
  "generated_at": "<ISO timestamp>",
  "source": "spreadsheet-2007",
  "set": 0,
  "card_count": 0,
  "review_count": 0,
  "cards": []
}
```

- `set` is the integer set number for numbered per-set files (`set_1.json`..`set_7.json`),
  the string `"P"` for the combined promo file (`set_P.json`, which holds all P1–P7 cards),
  or `null` for the combined index (`all_cards.json`).

## review_queue.json

A flat array of objects:

```json
{
  "id": "",
  "set": 0,
  "set_label": null,
  "name": "",
  "parse_confidence": "partial",
  "needs_review": []
}
```
