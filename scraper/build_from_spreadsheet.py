#!/usr/bin/env python3
"""Rebuild the Anachronism card database from the community spreadsheet.

The spreadsheet (data/raw/Anachronism Cards Spreadsheet.xls, sheet "A7") is the
new SOURCE OF TRUTH, replacing the Heard-list text parse. It is clean and typed,
so almost every card lands "clean" with no needs_review flags. This builder:

  * reads all 868 rows (numbered sets 1-7 + promo sets P1,P3-P7),
  * coerces types (NA -> null, numeric strings -> int, Yes/No -> bool),
  * parses the Text column into the {name,type,text} abilities array,
  * builds the flat 12-key attack grid (cols 60-71) for warriors/weapons,
  * builds the mechanical `tags` taxonomy (cols 14-56 except 36),
  * emits the same file layout as before (per-set JSON, combined index, CSV,
    review queue) and validates every card against schema/card.schema.json.

Stdlib + xlrd. Run: python3 scraper/build_from_spreadsheet.py
"""
from __future__ import annotations

import csv
import json
import os
import re
from collections import Counter, defaultdict

import xlrd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLS = os.path.join(ROOT, "data", "raw", "Anachronism Cards Spreadsheet.xls")
SETS_DIR = os.path.join(ROOT, "data", "sets")
DATA_DIR = os.path.join(ROOT, "data")
SCHEMA_PATH = os.path.join(ROOT, "schema", "card.schema.json")

SOURCE = "spreadsheet-2007"
SCHEMA_VERSION = 1
GENERATED_AT = "2026-06-19T00:00:00Z"
ELEMENTS = {"Aether", "Earth", "Fire", "Metal", "Water", "Wind", "Wood"}

# grid columns 60-71 -> A/C cell labels
GRID_CELLS = [
    (60, "1A"), (61, "1B"), (62, "1C"),
    (63, "2A"), (64, "2B"), (65, "2C"),
    (66, "3A"), (67, "3B"), (68, "3C"),
    (69, "4A"), (70, "4B"), (71, "4C"),
]
GRID_KEYS = [k for _, k in GRID_CELLS]

# ability header: line-start "Name[ - Reveal/Action/N Actions]:" (colon may have no space)
ABIL_HEAD = re.compile(
    r"(?:^|\n)[ \t]*([^:\n]{1,60}?)(?:\s*-\s*(Reveal|Action|\d+\s*Actions?))?\s*:\s*"
)


# --------------------------------------------------------------------------- #
# Cell coercion helpers
# --------------------------------------------------------------------------- #
def raw_str(v) -> str:
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else str(v)
    return str(v).strip()


def is_na(s: str) -> bool:
    return s == "" or s.upper() == "NA"


def str_or_blank(v) -> str:
    """Trimmed string; NA/empty -> ''."""
    s = raw_str(v)
    return "" if is_na(s) else s


def int_or_null(v):
    """NA/empty -> None; numeric -> int."""
    if isinstance(v, float):
        return int(v)
    s = raw_str(v)
    if is_na(s):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def bool_or_null(v):
    s = raw_str(v).lower()
    if s == "yes":
        return True
    if s == "no":
        return False
    return None  # NA / empty


def collector_str(v) -> str:
    if isinstance(v, float):
        return str(int(v)).zfill(3)
    return str(v).strip()


def snake(header: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", header.strip().lower())).strip("_")


def norm_mod(s: str) -> str:
    """Normalize a grid modifier string: en-dash/minus -> ascii '-'."""
    return s.strip().replace("–", "-").replace("−", "-").replace("—", "-")


# --------------------------------------------------------------------------- #
# Field builders
# --------------------------------------------------------------------------- #
def parse_abilities(text: str):
    text = str(text).replace("\r\n", "\n")
    if text.strip() == "(no card text)":
        return []
    heads = list(ABIL_HEAD.finditer(text))
    out = []
    for i, m in enumerate(heads):
        name = m.group(1).strip()
        mk = m.group(2)
        atype = "reveal" if mk == "Reveal" else ("action" if mk and "Action" in mk else "static")
        start = m.end()
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        body = re.sub(r"\s+", " ", text[start:end]).strip()
        out.append({"name": name, "type": atype, "text": body})
    return out


def build_grid(row, card_type):
    """Return (grid_obj_or_None, grid_raw_str, marker_anomaly: bool)."""
    if card_type not in ("warrior", "weapon"):
        return None, "", False
    grid = {}
    raw_tokens = []
    marker_cells = []
    for col, key in GRID_CELLS:
        cell = raw_str(row[col])
        if cell == "":
            grid[key] = None
        elif cell == "▲":  # ▲
            grid[key] = "marker"
            marker_cells.append(key)
            raw_tokens.append("▲")
        else:
            grid[key] = norm_mod(cell)
            raw_tokens.append(norm_mod(cell))
    anomaly = marker_cells != ["3B"]  # marker must be exactly at 3B
    return grid, " ".join(raw_tokens), anomaly


def build_tags(row, headers):
    tags = {}
    for c in list(range(14, 36)) + list(range(37, 57)):  # exclude col 36 (Salary)
        tags[snake(headers[c])] = bool_or_null(row[c])
    return tags


def split_traits(v):
    s = str_or_blank(v)
    if not s:
        return []
    return [t.strip() for t in re.split(r"[,/]", s) if t.strip() and t.strip().upper() != "NA"]


# --------------------------------------------------------------------------- #
# Record assembly
# --------------------------------------------------------------------------- #
def build_record(row, headers):
    flags = []
    card_type = raw_str(row[2]).lower()

    set_raw = row[12]
    set_label = None
    if isinstance(set_raw, str) and set_raw.strip().upper().startswith("P"):
        set_label = set_raw.strip().upper()           # "P1".."P7"
        set_int = int(set_label[1:])                  # parent set 1-7
    else:
        set_int = int(float(set_raw))

    collector = collector_str(row[13])
    name = str_or_blank(row[0])

    elem = raw_str(row[5])
    element = elem if elem in ELEMENTS else "unknown"

    grid, grid_raw, marker_anomaly = build_grid(row, card_type)
    if marker_anomaly:
        flags.append("grid_marker_anomaly")

    abilities = parse_abilities(row[11])
    culture = str_or_blank(row[1])

    rec = {
        "id": "",  # assigned after collision resolution
        "source": SOURCE,
        "name": name,
        "card_type": card_type,
        "element": element,
        "set": set_int,
        "collector": collector,
        "culture": culture,
        "cultures": [culture] if culture else [],
        "traits": split_traits(row[4]),
        "life": int_or_null(row[6]),
        "speed": int_or_null(row[7]),
        "experience": int_or_null(row[8]),
        "damage": int_or_null(row[9]),
        "initiative": int_or_null(row[3]),
        "hands": int_or_null(row[10]),
        "salary": int_or_null(row[36]),
        "grid_raw": grid_raw,
        "grid": grid,
        "abilities": abilities,
        "flavor": str_or_blank(row[57]),
        "illustrator": str_or_blank(row[58]),
        "background": str_or_blank(row[59]),
        "tags": build_tags(row, headers),
        "parse_confidence": "clean",
        "needs_review": flags,
        "raw_source_text": str(row[11]).replace("\r\n", "\n"),
    }
    if set_label is not None:
        rec["set_label"] = set_label
    return rec


def base_id(rec):
    if rec.get("set_label"):
        return f"s{rec['set']}-P{rec['collector']}"
    return f"s{rec['set']}-{rec['collector']}"


def recompute_confidence(rec):
    critical = {"name", "set", "collector"}
    nr = rec["needs_review"]
    if critical & set(nr):
        rec["parse_confidence"] = "suspect"
    elif nr:
        rec["parse_confidence"] = "partial"
    else:
        rec["parse_confidence"] = "clean"


def _union_preserve(lists):
    out = []
    for lst in lists:
        for x in lst:
            if x not in out:
                out.append(x)
    return out


def _reconcile(key, values):
    """Pick a canonical value for a single-valued field that differs across rows."""
    non_none = [v for v in values if v is not None]
    if key == "tags":  # OR each tag key across rows
        merged, allkeys = {}, set()
        for v in values:
            allkeys |= set(v.keys())
        for k in sorted(allkeys):
            vals = [v.get(k) for v in values]
            merged[k] = True if any(x is True for x in vals) else (
                False if any(x is False for x in vals) else None)
        return merged
    if not non_none:
        return None
    if all(isinstance(v, int) and not isinstance(v, bool) for v in non_none):
        return max(non_none)                          # e.g. hands -> max
    if all(isinstance(v, str) for v in non_none):
        best = ""                                     # longest non-empty, tie -> first
        for v in values:
            if isinstance(v, str) and v and len(v) > len(best):
                best = v
        return best or non_none[0]
    if all(isinstance(v, (list, dict)) for v in non_none):  # abilities / grid -> most complete
        return max(values, key=lambda v: len(json.dumps(v, ensure_ascii=False)) if v is not None else -1)
    return non_none[0]


GENERIC_SKIP = {"id", "needs_review", "parse_confidence", "traits", "culture", "cultures"}


def _merge_subgroup(rows):
    """Merge field-identical-or-multivalued rows for one (card_type, name) card.

    Returns (canonical_card, conflicts) where conflicts is a list of (field, values).
    """
    if len(rows) == 1:
        return rows[0], []
    canonical = dict(rows[0])
    conflicts = []

    canonical["traits"] = _union_preserve([r["traits"] for r in rows])
    cultures = _union_preserve([r.get("cultures", []) for r in rows])
    canonical["cultures"] = cultures
    canonical["culture"] = cultures[0] if cultures else ""

    keys = set()
    for r in rows:
        keys |= set(r.keys())
    for k in sorted(keys - GENERIC_SKIP):
        vals = [r.get(k) for r in rows]
        distinct = {json.dumps(v, ensure_ascii=False, sort_keys=True) for v in vals}
        if len(distinct) == 1:
            canonical[k] = vals[0]
        else:
            canonical[k] = _reconcile(k, vals)
            if k == "tags":
                allk = set().union(*[set(v.keys()) for v in vals])
                diff = sorted(kk for kk in allk if len({v.get(kk) for v in vals}) > 1)
                conflicts.append((k, diff))
            else:
                conflicts.append((k, [v for v in vals]))

    flags = _union_preserve([r["needs_review"] for r in rows])
    flags = [f for f in flags if f not in ("possible_duplicate", "shared_collector")]
    if conflicts and "merge_conflict" not in flags:
        flags.append("merge_conflict")
    canonical["needs_review"] = flags
    return canonical, conflicts


def resolve_and_merge(cards):
    """Collapse duplicate rows into canonical cards; disambiguate genuinely distinct
    cards that share a collector. Returns (merged_cards, collisions, merge_conflicts)."""
    groups = defaultdict(list)
    for c in cards:
        groups[base_id(c)].append(c)

    out, collisions, merge_conflicts = [], [], []
    for bid in groups:
        grp = groups[bid]
        # sub-group rows of the SAME card (card_type + normalized name)
        subs = defaultdict(list)
        order = []
        for c in grp:
            key = (c["card_type"], c["name"].lower())
            if key not in subs:
                order.append(key)
            subs[key].append(c)

        merged_subs = []
        for key in order:
            card, conflicts = _merge_subgroup(subs[key])
            merged_subs.append(card)
            if conflicts:
                merge_conflicts.append((bid, card["name"], conflicts))

        if len(merged_subs) == 1:
            merged_subs[0]["id"] = bid
            out.append(merged_subs[0])
        else:  # distinct cards sharing a collector number
            tcount = Counter(c["card_type"] for c in merged_subs)
            seen = Counter()
            for c in merged_subs:
                t = c["card_type"]
                if tcount[t] == 1:
                    c["id"] = f"{bid}-{t}"
                else:
                    seen[t] += 1
                    c["id"] = f"{bid}-{t}-{seen[t]}"
                if "shared_collector" not in c["needs_review"]:
                    c["needs_review"].append("shared_collector")
                out.append(c)
            collisions.append((bid, [c["id"] for c in merged_subs], [c["name"] for c in merged_subs]))
    return out, collisions, merge_conflicts


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #
def wrapper(set_value, cards):
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": GENERATED_AT,
        "source": SOURCE,
        "set": set_value,
        "card_count": len(cards),
        "review_count": sum(1 for c in cards if c["needs_review"]),
        "cards": cards,
    }


CSV_SCALARS = ["id", "source", "name", "card_type", "element", "set", "set_label",
               "collector", "culture", "initiative", "life", "speed", "experience",
               "damage", "hands", "salary", "grid_raw", "flavor", "illustrator",
               "background", "parse_confidence"]
CSV_JSON = ["traits", "cultures", "abilities", "grid", "tags", "needs_review"]


def write_outputs(cards):
    os.makedirs(SETS_DIR, exist_ok=True)
    # numbered per-set files (cards without set_label)
    numbered = defaultdict(list)
    promos = []
    for c in cards:
        if c.get("set_label"):
            promos.append(c)
        else:
            numbered[c["set"]].append(c)
    for setv in sorted(numbered):
        with open(os.path.join(SETS_DIR, f"set_{setv}.json"), "w", encoding="utf-8") as fh:
            json.dump(wrapper(setv, numbered[setv]), fh, ensure_ascii=False, indent=2)
    # all promos in one file (wrapper set = "P")
    with open(os.path.join(SETS_DIR, "set_P.json"), "w", encoding="utf-8") as fh:
        json.dump(wrapper("P", promos), fh, ensure_ascii=False, indent=2)

    with open(os.path.join(DATA_DIR, "all_cards.json"), "w", encoding="utf-8") as fh:
        json.dump(wrapper(None, cards), fh, ensure_ascii=False, indent=2)

    with open(os.path.join(DATA_DIR, "cards.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(CSV_SCALARS + CSV_JSON + ["raw_source_text"])
        for c in cards:
            scalars = ["" if c.get(k) is None else c.get(k, "") for k in CSV_SCALARS]
            jsons = [json.dumps(c.get(k), ensure_ascii=False) for k in CSV_JSON]
            w.writerow(scalars + jsons + [c["raw_source_text"]])

    rq = [{
        "id": c["id"], "set": c["set"], "set_label": c.get("set_label"),
        "name": c["name"], "parse_confidence": c["parse_confidence"],
        "needs_review": c["needs_review"],
    } for c in cards if c["needs_review"] or c["parse_confidence"] != "clean"]
    with open(os.path.join(DATA_DIR, "review_queue.json"), "w", encoding="utf-8") as fh:
        json.dump(rq, fh, ensure_ascii=False, indent=2)
    return rq


def validate(cards):
    import jsonschema
    schema = json.load(open(SCHEMA_PATH, encoding="utf-8"))
    v = jsonschema.Draft7Validator(schema)
    fails = []
    for c in cards:
        for e in v.iter_errors(c):
            fails.append((c["id"], e.message))
    return fails


# --------------------------------------------------------------------------- #
def main():
    wb = xlrd.open_workbook(XLS)
    sh = wb.sheet_by_name("A7")
    headers = sh.row_values(0)

    rows = [build_record(sh.row_values(r), headers) for r in range(1, sh.nrows)]
    cards, collisions, merge_conflicts = resolve_and_merge(rows)
    for c in cards:
        recompute_confidence(c)
    rq = write_outputs(cards)
    fails = validate(cards)

    # summary
    by_type = Counter(c["card_type"] for c in cards)
    by_set = Counter(c.get("set_label") or c["set"] for c in cards)
    by_conf = Counter(c["parse_confidence"] for c in cards)
    reasons = Counter()
    for c in cards:
        for f in c["needs_review"]:
            reasons[f] += 1
    gridded = sum(1 for c in cards if c["grid"] is not None)
    ids = [c["id"] for c in cards]

    print("=" * 60)
    print("SPREADSHEET REBUILD + MERGE SUMMARY")
    print("=" * 60)
    print(f"source rows : {len(rows)}")
    print(f"distinct cards after merge: {len(cards)}")
    print(f"per type    : {dict(sorted(by_type.items()))}")
    print(f"per set     : {dict(sorted(by_set.items(), key=lambda x: str(x[0])))}")
    print(f"confidence  : {dict(sorted(by_conf.items()))}")
    print(f"review_count: {len(rq)}  reasons: {dict(reasons)}")
    print(f"grids populated: {gridded}")
    print(f"ids unique  : {len(ids) == len(set(ids))} ({len(set(ids))}/{len(ids)})")
    # a clean id is s{set}-{collector} or s{set}-P{collector}; anything else carries a suffix
    suffixed = [i for i in ids if not re.match(r'^s\d+-(?:P\d+|\d+)$', i)]
    print(f"ids with disambiguation suffix: {len(suffixed)} {suffixed}")
    print(f"\nshared_collector (distinct cards kept separate): {len(collisions)}")
    for bid, newids, names in collisions:
        print(f"   {bid} -> {newids}  {names}")
    print(f"\nmerge_conflict groups (human review): {len(merge_conflicts)}")
    for bid, name, conf in merge_conflicts:
        print(f"   {bid} {name!r}:")
        for field, vals in conf:
            print(f"       {field}: {vals}")
    print(f"\nschema failures: {len(fails)}")
    for fid, m in fails[:25]:
        print(f"   FAIL {fid}: {m}")
    if fails:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
