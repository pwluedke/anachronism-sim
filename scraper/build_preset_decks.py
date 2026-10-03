"""Generate data/preset_decks.json: the preset (starter) decks printed in each set.

Source: the same spreadsheet as the card database (data/raw/Anachronism Cards Spreadsheet.xls,
sheet "A7"), read and merged with build_from_spreadsheet's own functions so every card id here
resolves in data/all_cards.json.

Detection rule: within each set (promo sets P1-P7 grouped separately), sort cards by collector
number; a warrior immediately followed by exactly 4 non-warrior cards is one preset deck (the
warrior + those 4, in collector order). Warriors followed by any other number of non-warriors are
skipped and listed in the output.

One data wrinkle: a few cards appear twice under one collector number with variant spellings
(e.g. "Kosem Sultan" / "Kösem Sultan", flagged shared_collector). Two cards sharing a collector
whose names match ignoring accents and case occupy ONE slot (the first by id is used).

Run: python3 scraper/build_preset_decks.py
"""

from __future__ import annotations

import json
import os
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

import xlrd

sys.path.insert(0, os.path.dirname(__file__))
import build_from_spreadsheet as B  # noqa: E402

OUT = os.path.join(B.ROOT, "data", "preset_decks.json")
DECK_SIZE = 4


def fold(name: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", name) if not unicodedata.combining(ch)).casefold()


def collector_key(c: dict):
    digits = "".join(ch for ch in c["collector"] if ch.isdigit())
    return (int(digits) if digits else 10**9, c["collector"], c["id"])


def collapse_variants(cards: list[dict]) -> list[dict]:
    """Drop a card that shares its collector and (accent-folded) name with the previous one."""
    out: list[dict] = []
    for c in cards:
        prev = out[-1] if out else None
        if prev and prev["collector"] == c["collector"] and fold(prev["name"]) == fold(c["name"]):
            continue
        out.append(c)
    return out


def ref(c: dict) -> dict:
    return {"id": c["id"], "name": c["name"], "collector": c["collector"]}


def main() -> None:
    sh = xlrd.open_workbook(B.XLS).sheet_by_name("A7")
    headers = sh.row_values(0)
    cards, _, _ = B.resolve_and_merge([B.build_record(sh.row_values(r), headers) for r in range(1, sh.nrows)])

    groups: dict[object, list[dict]] = defaultdict(list)
    for c in cards:
        groups[c.get("set_label") or c["set"]].append(c)

    decks, skipped = [], []
    for group in sorted(groups, key=lambda g: (isinstance(g, str), str(g).zfill(3))):
        seq = collapse_variants(sorted(groups[group], key=collector_key))
        for i, c in enumerate(seq):
            if c["card_type"] != "warrior":
                continue
            run = 0
            while i + 1 + run < len(seq) and seq[i + 1 + run]["card_type"] != "warrior":
                run += 1
            if run != DECK_SIZE:
                skipped.append({"group": str(group), **ref(c), "following_non_warriors": run})
                continue
            deck = {
                "id": c["id"],
                "set": c["set"],
                **({"set_label": c["set_label"]} if c.get("set_label") else {}),
                "warrior": ref(c),
                "support": [{**ref(s), "type": s["card_type"]} for s in seq[i + 1 : i + 1 + DECK_SIZE]],
            }
            decks.append(deck)

    out = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": B.SOURCE,
        "rule": "warrior immediately followed (by collector number, per set) by exactly 4 non-warrior cards",
        "deck_count": len(decks),
        "skipped_count": len(skipped),
        "decks": decks,
        "skipped": skipped,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    by_group = Counter(d.get("set_label") or str(d["set"]) for d in decks)
    print(f"wrote {OUT}: {len(decks)} decks  {dict(sorted(by_group.items()))}")
    print(f"skipped warriors: {len(skipped)}  by following run: {dict(sorted(Counter(s['following_non_warriors'] for s in skipped).items()))}")


if __name__ == "__main__":
    main()
