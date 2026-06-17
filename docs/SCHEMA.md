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
| `element` | enum | optional | `"unknown"` + flag |
| `set` | integer | **required** | `0` + flag |
| `collector` | string | **required** | `""` + flag |
| `culture` | string | optional | `""` + flag |
| `traits` | string[] | optional | `[]` + flag |
| `life` | integer | warrior-only | `0` + flag |
| `speed` | integer | warrior-only | `0` + flag |
| `experience` | integer | warrior-only | `0` + flag |
| `damage` | integer | warrior-only | `0` + flag |
| `initiative` | integer | support-only | `0` + flag |
| `hands` | integer | weapon-only | `0` + flag |
| `weapon_damage` | integer | weapon-only | `0` + flag |
| `grid_raw` | string | optional | `""` |
| `grid` | object \| null | optional | always `null` for now |
| `abilities` | array of objects | optional | `[]` + flag if none |
| `flavor` | string | optional | `""` |
| `illustrator` | string | optional | `""` |
| `parse_confidence` | enum | **required** | — |
| `needs_review` | string[] | **required** | `[]` (empty = clean) |
| `raw_source_text` | string | **required** | always populated |

### Field detail

- **`id`** — `"s{set}-{collector}"` for official cards (e.g. `"s1-091"`); `"custom-{uuid}"` for homebrew.
- **`source`** — enum: `heard-2007` | `tts-mod` | `weebly` | `custom` | `user-import`. This scrape: `heard-2007`.
- **`name`** — the card name. Default `""` and flag if unreadable.
- **`card_type`** — enum: `warrior` | `inspiration` | `weapon` | `armor` | `special`.
- **`element`** — enum: `Aether` | `Earth` | `Fire` | `Metal` | `Water` | `Wind` | `Wood` | `unknown`. Default `"unknown"` + flag. Support cards may not print an element the same way; record `unknown` as appropriate.
- **`set`** — integer. Default `0` + flag.
- **`collector`** — string; preserve formatting verbatim (`"091"`, `"P1/10"`). Default `""` + flag.
- **`culture`** — string. Default `""` + flag.
- **`traits`** — string array (e.g. `["Warrior","Male"]`). Default `[]` + flag.
- **`life`, `speed`, `experience`, `damage`** — integers, **warrior-only**. Default `0` + flag each.
- **`initiative`** — integer, **support-card only** (the leading `"(N)"`). Default `0` + flag.
- **`hands`, `weapon_damage`** — integers, **weapon-only**. Default `0` + flag each.
- **`grid_raw`** — string. The unparsed attack-grid modifier substring, verbatim. Default `""`.
- **`grid`** — object or `null`. Parsed spatial geometry. **ALWAYS `null` for now** (deferred to Milestone 2).
- **`abilities`** — array of `{ name: string, type: action|reveal|static|unknown, text: string }`. Default `[]` + flag if none.
- **`flavor`** — string. Default `""`.
- **`illustrator`** — string. Default `""`.
- **`parse_confidence`** — enum: `clean` | `partial` | `suspect`.
- **`needs_review`** — string array of field names that were defaulted/faked. Empty = clean.
- **`raw_source_text`** — string. The full original substring for this card, verbatim. Always populated.

## File wrapper

Per-set files in `data/sets/` and the combined `data/all_cards.json` share this wrapper:

```json
{
  "schema_version": 1,
  "generated_at": "<ISO timestamp>",
  "source": "heard-2007",
  "set": 0,
  "card_count": 0,
  "review_count": 0,
  "cards": []
}
```

- `set` is the integer set number for per-set files, or `null` for the combined index.

## review_queue.json

A flat array of objects:

```json
{
  "id": "",
  "set": 0,
  "name": "",
  "parse_confidence": "suspect",
  "needs_review": [],
  "raw_source_text": ""
}
```
