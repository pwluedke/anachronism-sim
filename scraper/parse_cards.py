#!/usr/bin/env python3
"""Self-healing parser for the Anachronism "Comprehensive Card List" (Heard, 2007).

Turns data/raw/page_01.txt .. page_33.txt into the structured card database:
  - data/sets/set_N.json   (one wrapper file per set)
  - data/all_cards.json    (combined index, set: null)
  - data/cards.csv         (flat inspection copy)
  - data/review_queue.json (flat array of flagged cards)

Design goals (Issues #4 / #5 / #6):
  * Never crash on a malformed card; fill typed defaults and record the field in
    needs_review (self-healing). Every emitted card validates against
    schema/card.schema.json with zero failures.
  * The section header (WARRIORS / INSPIRATIONS / WEAPONS / ARMORS / SPECIALS) is
    the source of truth for card_type, overriding any inline (possibly typo'd) word.

Stdlib only, plus jsonschema for validation (see requirements.txt).
"""
from __future__ import annotations

import csv
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw")
SETS_DIR = os.path.join(ROOT, "data", "sets")
DATA_DIR = os.path.join(ROOT, "data")
SCHEMA_PATH = os.path.join(ROOT, "schema", "card.schema.json")

SOURCE = "heard-2007"
SCHEMA_VERSION = 1
REPL = "�"  # the replacement character used as icon / bullet / lost diacritic

ELEMENTS = {"Aether", "Earth", "Fire", "Metal", "Water", "Wind", "Wood"}

# Section header token -> card_type. Order = order of appearance in the stream.
SECTIONS = [
    ("WARRIORS", "warrior"),
    ("INSPIRATIONS", "inspiration"),
    ("WEAPONS", "weapon"),
    ("ARMORS", "armor"),
    ("SPECIALS", "special"),
]

# Card tail: a single set digit 1-7 followed by a collector containing a slash.
TAIL_RE = re.compile(r"(?<!\d)([1-7]) (P?\d{1,3}/\d{1,3})(?![\d/])")

# A modifier token in the attack grid / stat block.
MOD_RE = re.compile(r"^(?:[+–−-]\d+|0|" + re.escape(REPL) + r")$")

# Bullet separators in the culture/trait line (real bullet, or replacement char as
# a *spaced* separator). The replacement char only acts as a bullet once we are past
# the stat/grid region (handled by extracting grid first).
BULLET_RE = re.compile(r"\s[•" + re.escape(REPL) + r"]\s")

# Source typos to preserve verbatim but flag for review (NOT real cultures/types).
KNOWN_TYPOS = {"Amor", "Grek", "Diety", "Calvary", "inspiration"}

# Ability type keywords -> enum.
TYPE_RE = re.compile(r"\s[–−-]\s(Action|Reveal|\d+ Actions?)\s*$")

# Strong "this is mechanical (ability) text, not flavor" signals. Deliberately
# excludes words common in historical flavor prose (life, warrior, war, attack,
# battle, card) to avoid swallowing flavor into the last ability.
MECH_RE = re.compile(
    r"\byou\b|\byour\b|\byou'?re\b|\bopponent|\brival\b|\battacker\b|\bdefender\b|"
    r"\binitiative\b|\bdiscard|re-?roll|\breveal|\bgain\b|\bdeal\b|"
    r"\brolls?\b|\bdie\b|\bdice\b|(?:^|[\s(])[+–−]\d|"  # a real modifier token, not "1–2"
    r"\bspaces?\b|\badjacent\b|\bdiagonal|\barena\b|face-?up|"
    r"\battack roll\b|\bdefense roll\b|\bbasic attack\b|\bsupport card|"
    r"\beach (round|turn|game)\b|\bthis (round|turn|game)\b|\bper (round|turn|game)\b|"
    r"\bnext (round|turn)\b|\bat the (start|end|beginning)\b|"
    r"\bonce (each|per|this)\b|\bdamage to\b|\bgain \+?\d|\bdeal \d|"
    r"\bthis (card|weapon|ability|attack|armor)\b|\bmay use another\b|"
    r"\bcannot be (increased|reduced|modified|affected|re-?rolled)\b",
    re.IGNORECASE,
)

# Quoted speech (flavor) often contains rules-like words ("You would be..."); strip
# quoted spans before testing for mechanical signal.
QUOTE_RE = re.compile(r"“[^”]*”|‘[^’]*’|\"[^\"]*\"")


def has_mech(text: str) -> bool:
    return bool(MECH_RE.search(QUOTE_RE.sub(" ", text)))


# Strong rules signals that an ability genuinely *ends* on (so empty flavor is fine).
STRONG_RE = re.compile(
    r"\byou\b|\byour\b|(?:^|[\s(])[+–−]\d|\bgain\b|\bdeal\b|\bdiscard|\brolls?\b|"
    r"\binitiative\b|\breveal|\beach (round|turn|game)\b|"
    r"\bthis (card|weapon|ability|round|turn|game)\b|\bdamage to\b|\brival\b",
    re.IGNORECASE,
)


def has_strong(text: str) -> bool:
    return bool(STRONG_RE.search(QUOTE_RE.sub(" ", text)))


# --------------------------------------------------------------------------- #
# Loading & sectioning
# --------------------------------------------------------------------------- #
def load_stream() -> str:
    files = sorted(glob.glob(os.path.join(RAW_DIR, "page_*.txt")))
    if not files:
        sys.exit("No data/raw/page_*.txt files found.")
    return " ".join(open(f, encoding="utf-8").read() for f in files)


def split_sections(stream: str):
    """Return list of (card_type, section_text) using header tokens as boundaries."""
    positions = []
    for token, ctype in SECTIONS:
        m = re.search(r"(?<![A-Za-z])" + token + r"(?![A-Za-z])", stream)
        if not m:
            sys.exit(f"Section header {token!r} not found; aborting (boundary bug).")
        positions.append((m.start(), m.end(), ctype, token))
    positions.sort()
    out = []
    for i, (start, end, ctype, token) in enumerate(positions):
        nxt = positions[i + 1][0] if i + 1 < len(positions) else len(stream)
        out.append((ctype, stream[end:nxt]))
    return out


def split_cards(section_text: str):
    """Split a section into per-card verbatim substrings using the tail as the anchor."""
    cards = []
    prev = 0
    for m in TAIL_RE.finditer(section_text):
        raw = section_text[prev:m.end()]
        prev = m.end()
        cards.append(raw)
    return cards


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def clean_leading_noise(text: str):
    """Drop leading whitespace and bare 1-3 digit PDF page-break markers."""
    text = text.strip()
    # Repeatedly strip a leading bare integer that precedes the real card start
    # (an uppercase letter, a digit-name like "100", or an initiative paren).
    while True:
        m = re.match(r"^(\d{1,3})\s+(?=[(A-ZÀ-ɏ])", text)
        if not m:
            break
        # Keep it only if it is actually an initiative paren start (handled later)
        text = text[m.end():]
    return text.strip()


def to_int(s, default=0):
    try:
        return int(s.replace("–", "-").replace("−", "-"))
    except (ValueError, AttributeError):
        return default


def extract_grid(tokens, stop_pred):
    """Walk tokens collecting modifier tokens (grid) until stop_pred(token) is True.

    Returns (grid_tokens, index_where_stopped).
    """
    grid = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if stop_pred(t):
            break
        if MOD_RE.match(t):
            grid.append(t)
        i += 1
    return grid, i


def is_culture_word(tok: str) -> bool:
    """A culture/trait word: starts with an uppercase (incl. accented) letter."""
    return bool(re.match(r"^[A-ZÀ-ɏΆ-ώ“‘\"']", tok)) and not MOD_RE.match(tok)


# --------------------------------------------------------------------------- #
# Trait line + abilities + flavor
# --------------------------------------------------------------------------- #
def split_traits_abilities_flavor(post_stat: str, card_type: str):
    """Given text starting at the culture word, return culture, traits, hands,
    abilities (list), flavor, and a fuzziness flag.
    """
    hands = None
    if card_type in ("weapon", "armor", "special"):
        hm = re.search(r"\(\s*(\d+)\s*[Hh]ands?\s*\)", post_stat)
        if hm:
            hands = to_int(hm.group(1))
            # Remove the hands paren so it does not pollute trait/ability split.
            post_stat = post_stat[:hm.start()].rstrip() + " " + post_stat[hm.end():].lstrip()

    segs = BULLET_RE.split(post_stat)
    fuzzy = False
    if len(segs) >= 2:
        culture = segs[0].strip()
        last = segs[-1]
        middle = [s.strip() for s in segs[1:-1]]
        # Last segment = "<lastTrait> <abilities+flavor>". First token is the trait.
        lt = last.split(" ", 1)
        last_trait = lt[0].strip()
        ability_region = lt[1].strip() if len(lt) > 1 else ""
        traits = [t for t in (middle + [last_trait]) if t]
    else:
        # No bullets at all: cannot separate culture/traits; treat whole as ability
        # region and flag.
        culture = ""
        traits = []
        ability_region = post_stat.strip()
        fuzzy = True

    abilities, flavor, afuzzy = parse_abilities(ability_region)
    return culture, traits, hands, abilities, flavor, (fuzzy or afuzzy)


def parse_abilities(region: str):
    """Split the ability region into abilities + trailing flavor.

    Strategy: every ability is "Name[ - Type]: text". Colon-space only occurs at
    ability headers in this corpus (scripture refs like "6:26" have no following
    space). We split on ": ", then peel the next ability's name off the tail of the
    previous ability's text at the last sentence boundary.
    """
    region = region.strip()
    if not region:
        return [], "", False
    colon_iter = [m.start() for m in re.finditer(r": ", region)]
    if not colon_iter:
        # No ability header at all -> the whole region is flavor.
        return [], region.strip(), False

    fuzzy = False
    # Build raw (header, text) chunks.
    chunks = []  # list of [name_with_type, text]
    starts = []  # start index of each ability's name
    starts.append(0)
    for k, cpos in enumerate(colon_iter):
        # name for ability k starts at starts[k]; its text begins after cpos+2.
        if k + 1 < len(colon_iter):
            # Where does ability k's text end / ability k+1's name begin?
            seg = region[cpos + 2: colon_iter[k + 1]]
            # last sentence boundary in seg
            b = list(re.finditer(r"[.!?”’\"]\s+", seg))
            if b:
                split_at = b[-1].end()
                text_k = seg[:split_at].strip()
                next_name_start = cpos + 2 + split_at
            else:
                # No boundary: ambiguous; keep all in this ability, next name empty.
                text_k = seg.strip()
                next_name_start = colon_iter[k + 1]
                fuzzy = True
            name_k = region[starts[k]:cpos].strip()
            chunks.append([name_k, text_k])
            starts.append(next_name_start)
        else:
            name_k = region[starts[k]:cpos].strip()
            text_k = region[cpos + 2:].strip()
            chunks.append([name_k, text_k])

    # The final chunk's text contains the trailing flavor; peel it off. Never empty
    # the ability: if no rules boundary is found, keep all text in the ability and
    # flag the card fuzzy (per spec: prefer over-long ability text to data loss).
    last_name, last_text = chunks[-1]
    ability_text, flavor, pf = peel_flavor(last_text)
    chunks[-1][1] = ability_text
    fuzzy = fuzzy or pf

    # Safe salvage: only fold a TRAILING chunk into flavor when it is clearly prose
    # (no ability type-marker, no mechanical signal) AND at least one real ability
    # remains. This catches a stray flavor sentence that happened to contain ": ".
    while (len(chunks) > 1 and not TYPE_RE.search(chunks[-1][0])
           and not has_mech(chunks[-1][0] + " " + chunks[-1][1])):
        nm, tx = chunks.pop()
        flavor = (nm + ": " + tx + " " + flavor).strip()
        fuzzy = True

    # If we produced no flavor but the last ability is multi-sentence and does NOT
    # end on a strong rules signal, the ability/flavor boundary is probably wrong
    # (descriptive weapon/armor flavor often contains words like "opponent"). Keep
    # the data intact but flag the card so the review queue surfaces it.
    if chunks and not flavor.strip():
        tail = re.split(r"(?<=[.!?”’\"])\s+", chunks[-1][1].strip())
        if len(tail) >= 2 and not has_strong(tail[-1]):
            fuzzy = True

    abilities = []
    for name, text in chunks:
        atype, clean_name = classify_ability(name)
        abilities.append({"name": clean_name, "type": atype, "text": text.strip()})
    return abilities, flavor.strip(), fuzzy


def peel_flavor(text: str):
    """Split trailing flavor off an ability's text.

    Returns (ability_text, flavor, fuzzy). Flavor = the trailing run of sentences
    after the last sentence that carries a mechanical (rules) signal. If no sentence
    looks mechanical, we cannot locate the boundary: keep everything in the ability
    and mark fuzzy rather than discard ability text.
    """
    sentences = re.split(r"(?<=[.!?”’\"])\s+", text.strip())
    if len(sentences) <= 1:
        return text.strip(), "", False
    last_mech = -1
    for i, s in enumerate(sentences):
        if has_mech(s):
            last_mech = i
    if last_mech == -1:
        return text.strip(), "", True
    ability = " ".join(sentences[: last_mech + 1]).strip()
    flavor = " ".join(sentences[last_mech + 1:]).strip()
    return ability, flavor, False


def classify_ability(name: str):
    """Return (type_enum, clean_name)."""
    m = TYPE_RE.search(name)
    if m:
        kw = m.group(1)
        clean = name[: m.start()].strip()
        if kw == "Reveal":
            return "reveal", clean
        if "Action" in kw:
            return "action", clean
        return "unknown", clean
    return "static", name.strip()


# --------------------------------------------------------------------------- #
# Per-type parsing
# --------------------------------------------------------------------------- #
def split_illustrator(body: str):
    """Return (body_without_illustrator, illustrator)."""
    idx = body.rfind("Illustration:")
    if idx == -1:
        return body.strip(), ""
    illus = body[idx + len("Illustration:"):].strip()
    # Strip a stray trailing " Post" (CASSIS / SCUTUM) but keep "R.K./RK Post".
    if illus.endswith(" Post"):
        prev = illus[:-5].split()[-1] if illus[:-5].split() else ""
        if len(prev) >= 3 and prev.isalpha():
            illus = illus[:-5].strip()
    return body[:idx].strip(), illus


def parse_warrior(card_raw: str, idx: int):
    flags, fuzzy = [], False
    text = clean_leading_noise(card_raw)
    rec = base_record("warrior", card_raw)

    # tail
    tm = None
    for tm in TAIL_RE.finditer(text):
        pass
    if tm:
        rec["set"] = to_int(tm.group(1))
        rec["collector"] = normalize_collector(tm.group(2))
        body = text[: tm.start()].strip()
    else:
        flags += ["set", "collector"]
        body = text

    body, rec["illustrator"] = split_illustrator(body)

    # name + element
    m = re.match(r"^(.*?)\s+\(([A-Za-z]+)\)\s+(?=\d+\s+Life)", body)
    if m:
        rec["name"] = m.group(1).strip()
        rec["element"] = m.group(2) if m.group(2) in ELEMENTS else "unknown"
        if rec["element"] == "unknown":
            flags.append("element")
        rest = body[m.end():]
    else:
        # element-without-parens (e.g. HATTORI HANZO Wind, LIU BEI Wood)
        m2 = re.match(r"^(.*?)\s+(" + "|".join(ELEMENTS) + r")\s+(?=\d+\s+Life)", body)
        if m2:
            rec["name"] = m2.group(1).strip()
            rec["element"] = m2.group(2)
            rest = body[m2.end():]
        else:
            flags += ["name", "element"]
            rest = body

    if not rec["name"]:
        flags.append("name")

    # stats by keyword
    for field, label in (("life", "Life"), ("speed", "Speed"),
                         ("experience", "Experience"), ("damage", "Damage")):
        sm = re.search(r"(\d+)\s+" + label, rest)
        if sm:
            rec[field] = to_int(sm.group(1))
        else:
            rec[field] = 0
            flags.append(field)

    # Locate culture start: after "Damage" value, skip grid modifiers to first culture word.
    dm = re.search(r"\d+\s+Damage", rest)
    grid_tokens = []
    if dm:
        pre = rest[: dm.start()]  # element_end .. before damage value
        post = rest[dm.end():]    # after "Damage": trailing mods then culture/traits
        # grid from pre: all modifier tokens that are not stat values
        pre_wo_stats = re.sub(r"\d+\s+(?:Life|Speed|Experience)", " ", pre)
        grid_tokens += [t for t in pre_wo_stats.split() if MOD_RE.match(t)]
        post_tokens = post.split()
        g2, stop = extract_grid(post_tokens, lambda t: is_culture_word(t))
        grid_tokens += g2
        culture_region = " ".join(post_tokens[stop:])
    else:
        culture_region = rest
        fuzzy = True
    rec["grid_raw"] = " ".join(grid_tokens)

    culture, traits, _hands, abilities, flavor, afz = split_traits_abilities_flavor(
        culture_region, "warrior")
    rec["culture"] = culture
    rec["traits"] = traits
    rec["abilities"] = abilities
    rec["flavor"] = flavor
    fuzzy = fuzzy or afz
    if afz and "flavor" not in flags:
        flags.append("flavor")  # ability/flavor boundary uncertain — review
    if not culture:
        flags.append("culture")
    if not traits:
        flags.append("traits")
    if not abilities:
        flags.append("abilities")

    finalize(rec, flags, fuzzy, idx)
    return rec


def support_name_split(body: str, card_type: str):
    """Extract (name, element, weapon_damage, rest, flags) from a support card body.

    Handles three shapes:
      * inspiration with parenthesised element: "AFRODITI (Fire) Trojan ..."
      * weapon with parenthesised damage:       "BALMUNG (1) +2 ... Germanic ..."
      * no-paren fallbacks: bare element ("RECONQUISTA Metal Spanish ..."), a weapon
        missing its (D) ("ŠEREV APPOLONIUS +1 ... Tribes of Israel ..."), and all
        armor/special cards (no element at all).
    """
    flags = []
    element = "unknown"
    wdmg = None

    if card_type == "inspiration":
        m = re.match(r"^(.+?)\s+\((%s)\)\s+" % "|".join(ELEMENTS), body)
        if m:
            return m.group(1).strip(), m.group(2), None, body[m.end():], flags
    if card_type == "weapon":
        m = re.match(r"^(.+?)\s+\((-?\d+)\)\s+", body)
        if m:
            return m.group(1).strip(), "unknown", to_int(m.group(2)), body[m.end():], flags

    # Fallback: name = leading run of UPPERCASE tokens (no lowercase letter),
    # stopping at a modifier, a parenthesised token, or the first mixed-case word
    # (which begins the element/culture).
    toks = body.split()
    i = 0
    while i < len(toks):
        t = toks[i]
        if t.startswith("(") or MOD_RE.match(t) or any(ch.islower() for ch in t):
            break
        i += 1
    name = " ".join(toks[:i]).strip()
    rest_toks = toks[i:]
    rest = " ".join(rest_toks)

    if card_type == "inspiration":
        if rest_toks and rest_toks[0] in ELEMENTS:          # bare element
            element = rest_toks[0]
            rest = " ".join(rest_toks[1:])
        elif rest.startswith("("):
            em = re.match(r"^\(([A-Za-z]+)\)\s*", rest)
            if em and em.group(1) in ELEMENTS:
                element = em.group(1)
                rest = rest[em.end():]
            else:
                flags.append("element")
        else:
            flags.append("element")
    elif card_type == "weapon":
        em = re.match(r"^\((-?\d+)\)\s*", rest)
        if em:
            wdmg = to_int(em.group(1))
            rest = rest[em.end():]
        else:
            flags.append("weapon_damage")
    # armor / special: element stays "unknown" with NO flag (expected absence).

    if not name:
        flags.append("name")
    return name, element, wdmg, rest, flags


def parse_support(card_raw: str, card_type: str, idx: int):
    flags, fuzzy = [], False
    text = clean_leading_noise(card_raw)
    rec = base_record(card_type, card_raw)

    # tail
    tm = None
    for tm in TAIL_RE.finditer(text):
        pass
    if tm:
        rec["set"] = to_int(tm.group(1))
        rec["collector"] = normalize_collector(tm.group(2))
        body = text[: tm.start()].strip()
    else:
        flags += ["set", "collector"]
        body = text

    body, rec["illustrator"] = split_illustrator(body)

    # initiative (N)
    im = re.match(r"^\((\d+)\)\s*", body)
    if im:
        rec["initiative"] = to_int(im.group(1))
        body = body[im.end():]
    else:
        rec["initiative"] = 0
        flags.append("initiative")

    name, element, wdmg, rest, nflags = support_name_split(body, card_type)
    rec["name"] = name
    rec["element"] = element
    if wdmg is not None:
        rec["weapon_damage"] = wdmg
    flags += nflags

    # weapon grid: modifier tokens between (D) and culture
    if card_type == "weapon":
        rtokens = rest.split()
        grid, stop = extract_grid(rtokens, lambda t: is_culture_word(t))
        rec["grid_raw"] = " ".join(grid)
        rest = " ".join(rtokens[stop:])

    culture, traits, hands, abilities, flavor, afz = split_traits_abilities_flavor(
        rest, card_type)
    rec["culture"] = culture
    rec["traits"] = traits
    rec["abilities"] = abilities
    rec["flavor"] = flavor
    fuzzy = fuzzy or afz
    if afz and "flavor" not in flags:
        flags.append("flavor")  # ability/flavor boundary uncertain — review
    if card_type == "weapon":
        if hands is not None:
            rec["hands"] = hands
        else:
            rec["hands"] = 0
            flags.append("hands")
    if not rec["name"]:
        if "name" not in flags:
            flags.append("name")
    if not culture:
        flags.append("culture")
    if not traits:
        flags.append("traits")
    if not abilities:
        flags.append("abilities")

    finalize(rec, flags, fuzzy, idx)
    return rec


# --------------------------------------------------------------------------- #
# Record assembly / self-healing
# --------------------------------------------------------------------------- #
def base_record(card_type: str, raw: str):
    return {
        "id": "",
        "source": SOURCE,
        "name": "",
        "card_type": card_type,
        "element": "unknown",
        "set": 0,
        "collector": "",
        "culture": "",
        "traits": [],
        "life": 0, "speed": 0, "experience": 0, "damage": 0,
        "initiative": 0,
        "hands": 0, "weapon_damage": 0,
        "grid_raw": "",
        "grid": None,
        "abilities": [],
        "flavor": "",
        "illustrator": "",
        "parse_confidence": "clean",
        "needs_review": [],
        "raw_source_text": clean_leading_noise(raw),
    }


def normalize_collector(tok: str) -> str:
    """Standard NN/100 -> zero-padded numerator ('091'); promos/odd -> verbatim."""
    m = re.match(r"^(\d{1,3})/100$", tok)
    if m:
        return m.group(1).zfill(3)
    return tok


def make_id(rec, idx):
    if not rec["collector"] or rec["set"] == 0:
        return f"s0-UNKNOWN-{idx}"
    safe = rec["collector"].replace("/", "-").replace(" ", "")
    return f"s{rec['set']}-{safe}"


def finalize(rec, flags, fuzzy, idx):
    # source typos in culture/traits -> keep verbatim, flag for review
    for token in [rec["culture"], *rec["traits"]]:
        for word in re.split(r"[\s/]+", token):
            if word in KNOWN_TYPOS:
                if "source_typo" not in flags:
                    flags.append("source_typo")
    # unusual collector format (not NNN or P-promo) -> soft flag
    if rec["collector"] and not re.match(r"^(\d{3}|P\d{1,3}/\d{1,3})$", rec["collector"]):
        if "collector" not in flags:
            flags.append("collector_format")

    # de-dup flags, set needs_review
    seen = []
    for f in flags:
        if f not in seen:
            seen.append(f)
    rec["needs_review"] = seen
    rec["id"] = make_id(rec, idx)

    # confidence
    critical = {"name", "set", "collector"}
    if critical & set(seen):
        rec["parse_confidence"] = "suspect"
    elif fuzzy or seen:
        rec["parse_confidence"] = "partial"
    else:
        rec["parse_confidence"] = "clean"


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #
def now_iso():
    # Date is supplied via env to keep runs reproducible; falls back to a fixed stamp.
    return os.environ.get("PARSE_TIMESTAMP", "2026-06-17T00:00:00Z")


def wrapper(set_value, cards):
    review = sum(1 for c in cards if c["needs_review"])
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now_iso(),
        "source": SOURCE,
        "set": set_value,
        "card_count": len(cards),
        "review_count": review,
        "cards": cards,
    }


CSV_SCALARS = ["id", "source", "name", "card_type", "element", "set", "collector",
               "culture", "life", "speed", "experience", "damage", "initiative",
               "hands", "weapon_damage", "grid_raw", "flavor", "illustrator",
               "parse_confidence"]


def write_outputs(cards):
    os.makedirs(SETS_DIR, exist_ok=True)
    # per-set files
    by_set = {}
    for c in cards:
        by_set.setdefault(c["set"], []).append(c)
    for set_value in sorted(by_set):
        path = os.path.join(SETS_DIR, f"set_{set_value}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(wrapper(set_value, by_set[set_value]), fh,
                      ensure_ascii=False, indent=2)

    # combined index
    with open(os.path.join(DATA_DIR, "all_cards.json"), "w", encoding="utf-8") as fh:
        json.dump(wrapper(None, cards), fh, ensure_ascii=False, indent=2)

    # CSV
    with open(os.path.join(DATA_DIR, "cards.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(CSV_SCALARS + ["traits", "abilities", "needs_review", "raw_source_text"])
        for c in cards:
            w.writerow([c[k] for k in CSV_SCALARS] + [
                json.dumps(c["traits"], ensure_ascii=False),
                json.dumps(c["abilities"], ensure_ascii=False),
                json.dumps(c["needs_review"], ensure_ascii=False),
                c["raw_source_text"],
            ])

    # review queue
    rq = [{
        "id": c["id"], "set": c["set"], "name": c["name"],
        "parse_confidence": c["parse_confidence"],
        "needs_review": c["needs_review"],
        "raw_source_text": c["raw_source_text"],
    } for c in cards if c["needs_review"] or c["parse_confidence"] != "clean"]
    with open(os.path.join(DATA_DIR, "review_queue.json"), "w", encoding="utf-8") as fh:
        json.dump(rq, fh, ensure_ascii=False, indent=2)
    return by_set, rq


# --------------------------------------------------------------------------- #
# Anomalies & validation
# --------------------------------------------------------------------------- #
def _recompute_confidence(card):
    critical = {"name", "set", "collector"}
    if critical & set(card["needs_review"]):
        card["parse_confidence"] = "suspect"
    elif card["needs_review"]:
        card["parse_confidence"] = "partial"
    else:
        card["parse_confidence"] = "clean"


def resolve_collisions(cards):
    """Detect cards sharing (set, collector) and guarantee unique ids.

    The "s{set}-{collector}" id scheme assumes (set, collector) is unique, but the
    source occasionally prints the same collector number on two cards (e.g. set 6
    "84/100" is shared by the weapon BUZDOVAN and the armor RUMELI HISARI). We key
    on (set, collector) regardless of name and disambiguate:

      * Same card_type AND name  -> a true duplicate (e.g. SHAN DIAN MAO x2). Keep
        the 'possible_duplicate' flag and append a numeric suffix: -1, -2, ...
      * Different cards (different card_type and/or name) -> append the card_type:
        s6-084-weapon / s6-084-armor. Flag both 'shared_collector' to record that
        the source prints one collector number for two distinct cards. (If two
        share a card_type but differ otherwise, a numeric suffix is added too.)
    """
    from collections import Counter, defaultdict
    groups = defaultdict(list)
    for c in cards:
        groups[(c["set"], c["collector"])].append(c)

    for (setv, coll), group in groups.items():
        if len(group) < 2:
            continue
        safe = coll.replace("/", "-").replace(" ", "")
        base = f"s{setv}-{safe}" if (coll and setv) else group[0]["id"]
        identities = {(c["card_type"], c["name"]) for c in group}
        if len(identities) == 1:
            # true duplicate: same card, printed twice
            for n, c in enumerate(group, 1):
                if "possible_duplicate" not in c["needs_review"]:
                    c["needs_review"].append("possible_duplicate")
                c["id"] = f"{base}-{n}"
        else:
            # distinct cards that happen to share a collector number in the source
            tcount = Counter(c["card_type"] for c in group)
            seen = Counter()
            for c in group:
                t = c["card_type"]
                if tcount[t] == 1:
                    c["id"] = f"{base}-{t}"
                else:
                    seen[t] += 1
                    c["id"] = f"{base}-{t}-{seen[t]}"
                if "shared_collector" not in c["needs_review"]:
                    c["needs_review"].append("shared_collector")
        for c in group:
            _recompute_confidence(c)


def validate(cards):
    import jsonschema
    schema = json.load(open(SCHEMA_PATH, encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)
    failures = []
    for c in cards:
        for err in validator.iter_errors(c):
            failures.append((c["id"], err.message))
    return failures


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    stream = load_stream()
    cards = []
    idx = 0
    for ctype, sect in split_sections(stream):
        for raw in split_cards(sect):
            if not raw.strip():
                continue
            if ctype == "warrior":
                rec = parse_warrior(raw, idx)
            else:
                rec = parse_support(raw, ctype, idx)
            cards.append(rec)
            idx += 1

    resolve_collisions(cards)
    by_set, rq = write_outputs(cards)

    # ---- summary ----
    from collections import Counter
    by_type = Counter(c["card_type"] for c in cards)
    by_setc = Counter(c["set"] for c in cards)
    by_conf = Counter(c["parse_confidence"] for c in cards)
    failures = validate(cards)

    print("=" * 60)
    print("PARSE SUMMARY")
    print("=" * 60)
    print(f"total cards: {len(cards)}")
    print("per type:   ", dict(sorted(by_type.items())))
    print("per set:    ", dict(sorted(by_setc.items())))
    print("confidence: ", dict(sorted(by_conf.items())))
    print(f"review_count: {len(rq)}")
    print(f"schema validation failures: {len(failures)}")
    for fid, msg in failures[:20]:
        print(f"   FAIL {fid}: {msg}")

    field_counter = Counter()
    for c in cards:
        for f in c["needs_review"]:
            field_counter[f] += 1
    print("top needs_review fields:", field_counter.most_common(8))

    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
