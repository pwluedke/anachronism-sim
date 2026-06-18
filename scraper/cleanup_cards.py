#!/usr/bin/env python3
"""Issue #5/#6 refinement cleanup pass.

Operates on the *existing* parsed data (data/all_cards.json is authoritative;
per-set files are regrouped from it). Applies two corrections and regenerates
all derived outputs:

  CHANGE 1 — strip the redundant type-word from every card's traits.
  CHANGE 2 — fix the ability/flavor boundary on the cards flagged "flavor".

Everything in CHANGE 3 (grid_raw, the 5 source_typo flags, hands/weapon_damage
defaults, the 2 possible_duplicate flags, the lone singleton flags) is left
untouched. The script never re-parses from raw; it only edits fields it is told
to edit, then revalidates against schema/card.schema.json.

Run:  python3 scraper/cleanup_cards.py
"""
from __future__ import annotations

import json
import os
import re

import parse_cards as P  # reuse write_outputs / validate / wrapper

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
ALL_CARDS = os.path.join(DATA_DIR, "all_cards.json")
MANUAL_REVIEW = os.path.join(DATA_DIR, "manual_review.json")

# Type words to strip from traits (case-insensitive), including the known typo.
TYPE_WORDS = {"warrior", "weapon", "armor", "amor", "inspiration", "special"}

# Sentence boundary: end punctuation (incl. curly quotes / apostrophe) + space.
SENT = re.compile(r'(?<=[.!?”’"])\s+')

# A sentence is MECHANICAL (game-rules) when it carries one of these signals.
# Deliberately EXCLUDES bare nouns that recur in historical flavor prose
# (opponent, weapon, warrior, life, attack, card, battle, war, die) so that a
# descriptive sentence merely *mentioning* them is not mistaken for rules text.
MECH = re.compile(
    r"\byou\b|\byour\b|\byou'?re\b|\byourself\b|"
    r"\bmay\b|\bcannot\b|\bcan not\b|"
    r"\bgains?\b|\bdeals?\b|\bdiscards?\b|re-?rolls?\b|\breveals?\b|"
    r"\brotates?\b|\bswaps?\b|\bmoves?\b|\bchoose\b|\bdice\b|\brolls?\b|"
    r"\bwin ties\b|\bare won\b|\bwon by\b|\bare reduced\b|\breduced to\b|"
    r"\bprinted life\b|\binitiative\b|\bcritical hit\b|\bdamage\b|\bspaces?\b|"
    r"(?:^|[\s(])[+\-–−]\d|"  # a real modifier token (+1, –2), not "13" or "1-2"
    r"\bthis (round|turn|game)\b|\beach (round|turn|game)\b|"
    r"\bnext (round|turn)\b|\brest of the game\b|"
    r"\bface[ -](up|down)\b",
    re.IGNORECASE,
)


def is_mech(sentence: str) -> bool:
    return bool(MECH.search(sentence))


# --------------------------------------------------------------------------- #
# CHANGE 1
# --------------------------------------------------------------------------- #
def strip_type_word(card) -> bool:
    """Remove standalone type-word tokens from traits. Returns True if changed."""
    before = card["traits"]
    after = [t for t in before if t.strip().lower() not in TYPE_WORDS]
    if after != before:
        card["traits"] = after
        return True
    return False


# --------------------------------------------------------------------------- #
# CHANGE 2
# --------------------------------------------------------------------------- #
def fix_flavor_boundary(card):
    """Attempt to split flavor off the LAST ability. Returns one of:
        ("auto", new_ability_text, new_flavor)  -> card was cleanly resolved
        ("manual", last_ability_text, cur_flavor) -> ambiguous, leave flagged
    """
    if not card["abilities"]:
        return ("manual", "", card["flavor"])
    last = card["abilities"][-1]
    text = last["text"].strip()
    cur_flavor = card["flavor"].strip()

    sents = SENT.split(text)
    last_mech = -1
    for i, s in enumerate(sents):
        if is_mech(s):
            last_mech = i

    if last_mech == -1:
        # No mechanical sentence at all in the last ability -> cannot trust a split.
        return ("manual", text, cur_flavor)

    ability_text = " ".join(sents[: last_mech + 1]).strip()
    peeled = " ".join(sents[last_mech + 1:]).strip()  # all non-mech by construction

    new_flavor = (peeled + " " + cur_flavor).strip() if peeled else cur_flavor

    # Auto-resolve only when: ability ends on a mechanical sentence (guaranteed),
    # flavor is now populated, and the resulting flavor carries NO mechanical
    # sentence (i.e. no ability text leaked into the flavor field). Otherwise the
    # boundary is ambiguous: leave the card flagged for hand-fixing.
    if new_flavor and not any(is_mech(s) for s in SENT.split(new_flavor)):
        return ("auto", ability_text, new_flavor)
    return ("manual", text, cur_flavor)


def recompute_confidence(card):
    critical = {"name", "set", "collector"}
    nr = card["needs_review"]
    if critical & set(nr):
        card["parse_confidence"] = "suspect"
    elif nr:
        card["parse_confidence"] = "partial"
    else:
        card["parse_confidence"] = "clean"


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    doc = json.load(open(ALL_CARDS, encoding="utf-8"))
    cards = doc["cards"]

    # ---- CHANGE 1: strip type-word from every card's traits ----
    c1 = sum(1 for c in cards if strip_type_word(c))

    # ---- CHANGE 2: ability/flavor boundary on flavor-flagged cards ----
    auto, manual = [], []
    for c in cards:
        if "flavor" not in c["needs_review"]:
            continue
        kind, ab_text, flavor = fix_flavor_boundary(c)
        if kind == "auto":
            c["abilities"][-1]["text"] = ab_text
            c["flavor"] = flavor
            c["needs_review"] = [f for f in c["needs_review"] if f != "flavor"]
            recompute_confidence(c)
            auto.append(c)
        else:
            manual.append({
                "id": c["id"],
                "name": c["name"],
                "raw_source_text": c["raw_source_text"],
                "ability_text": ab_text,
                "flavor": flavor,
            })

    # ---- write standard outputs (sets, all_cards, csv, review_queue) ----
    P.write_outputs(cards)

    # ---- manual_review.json ----
    with open(MANUAL_REVIEW, "w", encoding="utf-8") as fh:
        json.dump(manual, fh, ensure_ascii=False, indent=2)

    # ---- validate ----
    failures = P.validate(cards)

    # ---- report ----
    from collections import Counter
    conf = Counter(c["parse_confidence"] for c in cards)
    reasons = Counter()
    for c in cards:
        for f in c["needs_review"]:
            reasons[f] += 1
    review_count = sum(1 for c in cards if c["needs_review"])

    print("=" * 60)
    print("CLEANUP SUMMARY")
    print("=" * 60)
    print(f"CHANGE 1: traits modified on {c1} cards")
    print(f"CHANGE 2: auto-resolved {len(auto)}, manual_review {len(manual)}")
    print(f"  manual: {[m['name'] for m in manual]}")
    print(f"confidence: {dict(sorted(conf.items()))}")
    print(f"review_count: {review_count}")
    print(f"top needs_review: {reasons.most_common(10)}")
    print(f"schema validation failures: {len(failures)}")
    for fid, msg in failures[:20]:
        print(f"   FAIL {fid}: {msg}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
