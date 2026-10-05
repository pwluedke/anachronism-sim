"""Ability batch 3 (Milestone 11): the rule-defined bulk pass.

Walks every card whose ability is not yet implemented and applies epic #69's inclusion rule: a card
qualifies only if EVERY clause of its text is expressible with the engine's existing effects and
triggers plus the batch-3 condition whitelist. Otherwise the whole card is skipped and logged.

1. Skip list first: the card's full text is checked against the epic's skip categories (initiative,
   experience, discard, extra attacks, crits/doubles, "cannot", damage reduction, dynamic values,
   caps, effect removal, reclassification, other roll types, reactions to opponents, play limits,
   action costs, weapon-type conditions, grid position, dice-value branching, targeting, "this game").
2. Then every sentence must match one of the strict templates below; any sentence that doesn't is
   the skip reason ("unsupported clause: ...").

Writes:
  engine/src/abilities/cards-batch3.ts   generated defineCard calls (printed text quoted per card)
  data/abilities_skipped.json            {id, name, text, reason} per skipped card (batch-4 input)

Run: python3 scraper/build_ability_batch3.py
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "data", "all_cards.json")
HAND = os.path.join(ROOT, "engine", "src", "abilities", "cards.ts")
OUT_TS = os.path.join(ROOT, "engine", "src", "abilities", "cards-batch3.ts")
OUT_SKIP = os.path.join(ROOT, "data", "abilities_skipped.json")

NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "a": 1, "an": 1}
TYPES = ("inspiration", "weapon", "armor", "special")
ELEMENTS = ("fire", "water", "earth", "wind", "wood", "metal", "aether")

# ---- 1. skip list (checked on the whole card text, lowercased), in this order ----------------------
SKIP = [
    ("this game / rest of the game / first round", r"this game|rest of the game|first round|first card you reveal"),
    ("initiative modification", r"initiative"),  # applied after removing "win / lose initiative" conditions
    ("experience modification", r"experience"),
    ("discard", r"\bdiscard"),
    ("extra / additional attacks or attacking again", r"(?:additional|extra|another|second) attack|attack again|make an? (?:basic |weapon )?attack|immediately (?:make )?(?:an? )?(?:basic )?attack|attack twice"),
    ("critical hit / doubles effects", r"critical|doubles"),
    ("cannot / may not / restriction", r"\bcannot\b|\bcan not\b|\bmay not\b|can't|\bonly\b"),
    ("damage reduction / take no damage", r"reduce|no damage|prevent|ignore|negate"),
    ("dynamic value (for each / equal to)", r"for each|equal to|number of"),
    ("bonus cap (to a maximum of)", r"maximum|minimum|up to"),
    ("effect removal (lose this bonus)", r"lose (?:this|that|the) bonus|loses? (?:this|its|their) (?:bonus|ability)"),
    ("attack-type reclassification (counts as / considered)", r"counts? as|considered"),
    ("card-type play-limit change", r"you may (?:use|have) (?:another|up to|two|an additional)|use another"),
    ("action-cost change", r"additional action|extra action|requires|costs? (?:an|one|two)"),
    ("attacker-weapon-type condition", r"(?:against|with|by) (?:an? )?(?:polearms?|ranged|swords?|two-handed|bows?|spears?|axes?|blunt|missile)"),
    ("grid-position condition", r"attack grid|in the grid|grid"),
    ("dice-value branching / dice rolling", r"if the (?:roll|result|die)|roll (?:one|two|a) di|less than \d|greater than \d|higher than|lower than (?:\d|their|the)|re-?roll"),
    ("targeting / search / choose a card", r"\bchoose\b|\bsearch\b|\blook at\b|\bname\b|\btarget|any space|place this card|\bswap|\btrade|face down|face-down"),
    ("reaction to opponent actions", r"(?:after|when|whenever) (?:an?|any|your|each) (?:opponent|opposing|enemy|player|other|warrior)|(?:after|when) a warrior"),
    ("other roll types (all your rolls)", r"\brolls?\b"),  # applied after removing attack / defense roll phrases
]


def skip_reason(text: str) -> str | None:
    t = text.lower().replace("face up", "face-up")
    t_rolls = re.sub(r"(?:attack|defen[cs]e|defensive) rolls?", "", t)
    t_init = re.sub(r"(?:if you |you )?(?:lose|lost|win|won) initiative", "", t)
    for label, rx in SKIP:
        hay = t_rolls if label.startswith("other roll types") else t_init if label.startswith("initiative") else t
        if re.search(rx, hay):
            return label
    return None


# ---- 2. templates ------------------------------------------------------------------------------------

def n(word: str) -> int:
    word = word.lower()
    return int(word) if word.isdigit() else NUM[word]


NUMW = r"(\d+|one|two|three|four|five)"

COND_SUFFIX = [
    (rf"while you have an? ({'|'.join(TYPES)})(?: card)? in play", lambda m: {"kind": "hasInPlay", "cardType": m[1]}),
    (rf"while you have an? face-up ({'|'.join(TYPES)})(?: card)?", lambda m: {"kind": "hasInPlay", "cardType": m[1]}),
    (r"while you have lower life than the attacking warrior", lambda m: {"kind": "lowerLifeThanAttacker"}),
    (r"while you are adjacent to an? (?:opposing|enemy) warrior", lambda m: {"kind": "adjacentToOpponent"}),
    (r"while you have the (most|least) life(?: in the arena)?", lambda m: {"kind": "lifeExtreme", "which": m[1]}),
    (r"while you have (more|less|fewer) life than (?:all other warriors|each other warrior|every other warrior|your opponent|an? opposing warrior)",
     lambda m: {"kind": "lifeExtreme", "which": "most" if m[1] == "more" else "least"}),
    (rf"while you have at least {NUMW} face-up support cards?", lambda m: {"kind": "faceUpSupportAtLeast", "n": n(m[1])}),
    (r"if you have a face-up shield(?: card)?", lambda m: {"kind": "haveShield"}),
    (rf"(?:if|while) the (defender|defending warrior|attacker|attacking warrior) has no face-up ({'|'.join(TYPES)})(?: card)?",
     lambda m: {"kind": "lacksType", "who": "defender" if m[1].startswith("defend") else "attacker", "cardType": m[2]}),
    (rf"(?:while|if) you are an? ({'|'.join(ELEMENTS)}) warrior", lambda m: {"kind": "elementIs", "element": m[1].capitalize()}),
    (rf"if you have an? ({'|'.join(TYPES)})(?: card)? in play", lambda m: {"kind": "hasInPlay", "cardType": m[1]}),
    (rf"if you have an? face-up ({'|'.join(TYPES)})(?: card)?", lambda m: {"kind": "hasInPlay", "cardType": m[1]}),
    (r"if you are adjacent to an? (?:opposing|enemy) warrior", lambda m: {"kind": "adjacentToOpponent"}),
    (rf"if you have at least {NUMW} face-up support cards?", lambda m: {"kind": "faceUpSupportAtLeast", "n": n(m[1])}),
]


def parse_cond_suffix(s: str, cultures: set[str]):
    """Split '<body> <condition>' -> (body, condition|None). Returns (s, None) if no suffix matched."""
    for rx, mk in COND_SUFFIX:
        m = re.search(r"\s+" + rx + r"$", s)
        if m:
            return s[: m.start()].strip(), mk(m)
    m = re.search(r"\s+(?:while|if) you are an? ([a-z' -]+) warrior$", s)
    if m and m[1] in cultures:
        return s[: m.start()].strip(), {"kind": "cultureIs", "culture": m[1].title()}
    m = re.search(r"\s+while you have (more|less|fewer) life than ([a-z][a-z' .-]+)$", s)
    if m and m[2] not in ("the attacking warrior",):
        return s[: m.start()].strip(), {"kind": "lifeVsNamed", "cmp": "more" if m[1] == "more" else "less", "name": m[2]}
    return s, None


MODS = [
    (rf"^your attack and defen[cs]e rolls gain \+{NUMW}$", lambda m: [{"kind": "attackRoll", "amount": n(m[1])}, {"kind": "defenseRoll", "amount": n(m[1])}]),
    (rf"^your attack rolls gain \+{NUMW}$", lambda m: [{"kind": "attackRoll", "amount": n(m[1])}]),
    (rf"^your basic attack rolls gain \+{NUMW}$", lambda m: [{"kind": "attackRoll", "amount": n(m[1]), "when": {"kind": "attackKind", "is": "basic"}}]),
    (rf"^your (?:defen[cs]e|defensive) rolls gain \+{NUMW}$", lambda m: [{"kind": "defenseRoll", "amount": n(m[1])}]),
    (rf"^add \+{NUMW} to your (?:defen[cs]e|defensive) rolls$", lambda m: [{"kind": "defenseRoll", "amount": n(m[1])}]),
    (rf"^add \+{NUMW} to your attack rolls$", lambda m: [{"kind": "attackRoll", "amount": n(m[1])}]),
]
WEAPON_MODS = [
    (rf"^(?:your )?attacks with this weapon deal \+{NUMW} damage$", lambda m: [{"kind": "weaponDamage", "amount": n(m[1])}]),
]
TARGETS = {
    "the defending warrior": "defender", "the defender": "defender",
    "each opposing warrior": "allOpponents", "all opposing warriors": "allOpponents",
    "your opponent": "opponent", "the opposing warrior": "opponent", "each enemy warrior": "allOpponents", "all enemy warriors": "allOpponents",
    "the attacking warrior": "attacker", "the attacker": "attacker", "yourself": "self", "your warrior": "self",
}
INSTANT = [
    (rf"^(?:you may )?(?:you )?gain {NUMW} life$", lambda m: [{"kind": "gainLife", "amount": n(m[1])}]),
    (rf"^deal {NUMW} damage to ({'|'.join(TARGETS)})$", lambda m: [{"kind": "dealDamage", "amount": n(m[1]), "target": TARGETS[m[2]]}]),
]


def parse_timed(s: str):
    """'<mod> this round' / 'gain +N speed on your next turn' -> (effects, duration)."""
    s = s.replace("–", "-").replace("—", "-")
    m = re.match(r"^your (attack|defen[cs]e|defensive) rolls this round (?:gain|get) ([+-])(\d+)$", s)
    if m:
        kind = "attackRoll" if m[1] == "attack" else "defenseRoll"
        return [{"kind": kind, "amount": int(m[3]) * (-1 if m[2] == "-" else 1)}], "thisRound"
    m = re.match(rf"^(?:you may )?(?:you )?(?:gain|get) \+{NUMW} speed (on your next turn|this round)$", s)
    if m:
        return [{"kind": "speed", "amount": n(m[1])}], "nextTurn" if "next" in m[2] else "thisRound"
    m = re.match(r"^(.*) (this round|on your next turn|during your next turn)$", s)
    if m:
        for rx, mk in MODS:
            mm = re.match(rx, m[1])
            if mm:
                return mk(mm), "thisRound" if m[2] == "this round" else "nextTurn"
    return None


def parse_ability(a: dict, card: dict, cultures: set[str]):
    """One printed ability -> AbilityData dict, or raise ValueError(reason)."""
    raw_type = a["type"]
    name = a["name"]
    if re.search(r"\s*[-–]\s*reveal$", name, re.I):
        raw_type = "reveal"
    if re.search(r"\s*[-–]\s*action$", name, re.I):
        raw_type = "action"
    text = a["text"].strip()
    text = re.sub(r"^(reveal|action)\s*:\s*", "", text, flags=re.I)
    sentences = [x.strip().rstrip(".").strip() for x in re.split(r"(?<=\.)\s+", text) if x.strip()]
    if not sentences:
        raise ValueError("no ability text")

    trigger = None
    condition = None
    usage = None
    duration = None
    effects: list = []

    def set_once(cur, new, what):
        if cur is not None and cur != new:
            raise ValueError(f"mixed {what} in one ability")
        return new

    for s0 in sentences:
        s = s0.lower().replace("’", "'").replace("face up", "face-up")
        s = re.sub(r"\s+", " ", s)
        # "Each round, if you win / lose initiative, <effect> for that round" == a start-of-round trigger
        m = re.match(r"^each round, if you (win|lose|won|lost) initiative, (.*?)(?: for that round| that round)?$", s)
        if m:
            s = f"at the start of each round, if you {m[1]} initiative, {m[2]} this round"
        # a leading condition: "While/If <condition>, <modifier>" == "<modifier> <condition>"
        m = re.match(r"^((?:while|if) [^,]+), (your .*)$", s)
        if m and raw_type not in ("action", "reveal"):
            s = f"{m[2]} {m[1]}"
        # usage prefix
        m = re.match(r"^once (?:per|each) round, (.*)$", s)
        if m:
            usage = "oncePerRound"
            s = m[1]
        # triggers with a clause
        trig = None
        m = re.match(r"^at the start of (?:each|every) round, (?:if you (lose|win|lost|won|did not win) initiative, )?(.*)$", s)
        if m:
            trig = "roundStart"
            if m[1]:
                lost = m[1] in ("lose", "lost", "did not win")
                condition = set_once(condition, {"kind": "lostInitiative" if lost else "wonInitiative"}, "condition")
            s = re.sub(r" for that round$", " this round", m[2])
        m = None if trig else re.match(r"^at the start of the game, (.*)$", s)
        if m:
            trig, s = "gameStart", m[1]
        m = None if trig else re.match(r"^after you deal damage to an? (?:enemy|opposing) warrior, (.*)$", s)
        if m:
            trig, s = "damageDealt", m[1]
        m = None if trig else re.match(r"^after you are (?:hit|damaged)(?: by an attack)?, (.*)$", s)
        if m:
            trig, s = "hit", m[1]
        m = None if trig else re.match(r"^after you are missed(?: by an? (basic|weapon) attack)?, (.*)$", s)
        if m:
            trig = "missed"
            if m[1]:
                condition = set_once(condition, {"kind": "attackKind", "is": m[1]}, "condition")
            s = m[2]

        if trig:
            trigger = set_once(trigger, trig, "trigger")
            s = re.sub(r"^you may ", "", s)
            done = False
            for rx, mk in INSTANT:
                mm = re.match(rx, s)
                if mm:
                    effects += mk(mm)
                    done = True
                    break
            if not done:
                timed = parse_timed(s)
                if timed:
                    effects += timed[0]
                    duration = set_once(duration, timed[1], "duration")
                    done = True
            if not done:
                raise ValueError(f"unsupported clause: {s0}")
            continue

        if raw_type == "action":
            trigger = set_once(trigger, "action", "trigger")
            mm = re.match(rf"^move {NUMW} spaces?$", s)
            if mm:
                effects.append({"kind": "move", "spaces": n(mm[1])})
                continue
            done = False
            for rx, mk in INSTANT:
                mm = re.match(rx, s)
                if mm:
                    effects += mk(mm)
                    done = True
                    break
            if not done:
                timed = parse_timed(s)
                if timed:
                    effects += timed[0]
                    duration = set_once(duration, timed[1], "duration")
                    done = True
            if not done:
                raise ValueError(f"unsupported clause: {s0}")
            continue

        if raw_type == "reveal":
            trigger = set_once(trigger, "reveal", "trigger")
            done = False
            for rx, mk in INSTANT:
                mm = re.match(rx, s)
                if mm:
                    effects += mk(mm)
                    done = True
                    break
            if not done:
                timed = parse_timed(s)
                if timed:
                    effects += timed[0]
                    duration = set_once(duration, timed[1], "duration")
                    done = True
            if not done:
                raise ValueError(f"unsupported clause: {s0}")
            continue

        # keyword-less: continuous modifiers (optionally conditional)
        body, cond = parse_cond_suffix(s, cultures)
        mods = MODS + (WEAPON_MODS if card["card_type"] == "weapon" else [])
        for rx, mk in mods:
            mm = re.match(rx, body)
            if mm:
                trigger = set_once(trigger, "continuous", "trigger")
                eff = mk(mm)
                if cond:
                    # a per-sentence condition becomes each effect's own gate (they add up independently)
                    eff = [{**e, "when": cond} if "when" not in e else e for e in eff]
                effects += eff
                break
        else:
            raise ValueError(f"unsupported clause: {s0}")

    if trigger is None:
        raise ValueError("no trigger recognised")
    if trigger == "continuous" and (usage or duration):
        raise ValueError("continuous ability with a usage limit or duration")
    out = {"name": name, "trigger": trigger, "effects": effects}
    if condition:
        out["condition"] = condition
    if usage:
        out["usageLimit"] = usage
    if duration:
        out["duration"] = duration
    # fired roll / speed effects need a duration the engine supports
    if trigger != "continuous":
        for e in effects:
            if e["kind"] in ("attackRoll", "defenseRoll", "speed") and duration not in ("thisRound", "nextTurn"):
                raise ValueError(f"{e['kind']} effect without this-round / next-turn duration")
    return out


def implemented_ids() -> set[str]:
    src = open(HAND, encoding="utf-8").read()
    block = src[src.index("export const IMPLEMENTED"): src.index("};", src.index("export const IMPLEMENTED"))]
    return set(re.findall(r'"(s\d+-P?\d+)"', block))


def ts_literal(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def main() -> None:
    cards = json.load(open(CARDS, encoding="utf-8"))["cards"]
    cultures = {c.lower() for x in cards for c in x.get("cultures", [])}
    done = implemented_ids()
    implemented, skipped = [], []
    for card in sorted(cards, key=lambda c: c["id"]):
        if card["id"] in done:
            continue
        full = " ".join(a["text"] for a in card["abilities"])
        if not card["abilities"]:
            skipped.append({"id": card["id"], "name": card["name"], "text": "", "reason": "no ability text"})
            continue
        reason = skip_reason(full)
        if reason:
            skipped.append({"id": card["id"], "name": card["name"], "text": full, "reason": reason})
            continue
        try:
            datas = [parse_ability(a, card, cultures) for a in card["abilities"]]
        except ValueError as e:
            skipped.append({"id": card["id"], "name": card["name"], "text": full, "reason": str(e)})
            continue
        implemented.append((card, datas))

    lines = [
        "// GENERATED by scraper/build_ability_batch3.py — do not edit by hand; re-run the script.",
        "// Ability batch 3 (Milestone 11): every card whose whole printed text fits the existing effects and",
        "// triggers plus the batch-3 condition whitelist (epic #69). Skipped cards: data/abilities_skipped.json.",
        "",
        'import { defineCard } from "./format";',
        "",
        "export const IMPLEMENTED_BATCH3: Record<string, { name: string }> = {",
    ]
    for card, _ in implemented:
        lines.append(f"  {ts_literal(card['id'])}: {{ name: {ts_literal(card['name'])} }},")
    lines += ["};", ""]
    for card, datas in implemented:
        for a in card["abilities"]:
            lines.append(f"// {card['name']} ({card['card_type']}) — {a['name']}: {ts_literal(a['text'])}")
        args = ", ".join("{ data: " + ts_literal(d) + " }" for d in datas)
        lines.append(f"defineCard({ts_literal(card['id'])}, {args});")
        lines.append("")
    with open(OUT_TS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    with open(OUT_SKIP, "w", encoding="utf-8") as fh:
        json.dump(skipped, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    hist = Counter(re.sub(r": .*", "", s["reason"]) for s in skipped)
    print(f"implemented: {len(implemented)}   skipped: {len(skipped)}")
    for r, c in hist.most_common():
        print(f"  {c:4d}  {r}")


if __name__ == "__main__":
    main()
