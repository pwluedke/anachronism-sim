// The building blocks data-authored abilities are made of: conditions and effects. Each is a
// small pure function over the engine's working state. Add new primitives here as card batches
// need them.

import type { Facing, GameState, PlayerId, Position } from "../types";
import { rollDie } from "../rng";
import type { SupportType } from "../decks";
import { inPlay } from "../cards";
import { experienceOf } from "./experience";
import { inBounds, stepPos, FACINGS } from "../arena";
import type { AbilityParams, AttackKind, FireContext } from "./types";

// ---- Conditions ----------------------------------------------------------------------------------

export type ConditionDef =
  /** "while you have an <type> in play" */
  | { kind: "hasInPlay"; cardType: SupportType }
  /** "if you lose initiative" (this round) */
  | { kind: "lostInitiative" }
  /** "while you have lower life than the attacking warrior" */
  | { kind: "lowerLifeThanAttacker" }
  /** "if you have a face-up shield card" (an in-play card with the Shield trait) */
  | { kind: "haveShield" }
  /** "if the defender has no face-up armor card" */
  | { kind: "defenderNoArmor" }
  /** "by a basic attack" / "with a weapon" */
  | { kind: "attackKind"; is: AttackKind }
  // ---- batch 3 whitelist ----
  /** "while you are a <Element> warrior" — the owner's warrior element */
  | { kind: "elementIs"; element: string }
  /** "while you are a <Culture> warrior" — one of the owner's warrior cultures */
  | { kind: "cultureIs"; culture: string }
  /** "while you are adjacent to an opposing warrior" (shares a side or corner, glossary) */
  | { kind: "adjacentToOpponent" }
  /** "while you have less / more life than <warrior name>" (false when no such warrior is in play) */
  | { kind: "lifeVsNamed"; cmp: "less" | "more"; name: string }
  /** "while you have the least / most life" — strictly less / more than every other warrior */
  | { kind: "lifeExtreme"; which: "least" | "most" }
  /** "while you have at least N face-up support cards" */
  | { kind: "faceUpSupportAtLeast"; n: number }
  /** "if you win initiative" (this round) */
  | { kind: "wonInitiative" }
  /** "if the defender / attacker has no face-up <type> card" */
  | { kind: "lacksType"; who: "defender" | "attacker"; cardType: SupportType }
  // ---- batch 4 ----
  /** "if you have moved this turn" — your warrior changed spaces during your current turn */
  | { kind: "movedThisTurn" }
  /** "if <who> has (no) face-up <type / trait> card", e.g. "the defending warrior has a face-up
   *  shield card", "an opponent without a cavalry card". Matches in-play support cards by type
   *  and / or trait; a trait also matches the warrior card itself (a Cavalry warrior is a cavalry card). */
  | { kind: "faceUpCard"; who: CardHolder; cardType?: SupportType; trait?: string; has: boolean }
  // ---- batch 5 ----
  /** "if you have more / less experience than the attacker / defender" */
  | { kind: "experienceVs"; cmp: "more" | "less"; than: "attacker" | "defender" };

/** Whose cards a faceUpCard condition looks at. */
export type CardHolder = "self" | "defender" | "attacker" | "opponent";

/** Facts about the attack a condition may need (absent outside attacks). */
export interface CondQuery {
  attacker?: PlayerId;
  defender?: PlayerId;
  attackKind?: AttackKind;
}

export function holds(cond: ConditionDef | undefined, state: GameState, owner: PlayerId, q: CondQuery = {}): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case "hasInPlay":
      return inPlay(state, owner).some((s) => s.card.type === cond.cardType);
    case "lostInitiative":
      return state.initiative !== null && state.initiative !== owner;
    case "lowerLifeThanAttacker":
      return q.attacker !== undefined && q.attacker !== owner && state.warriors[owner].life < state.warriors[q.attacker].life;
    case "haveShield":
      return inPlay(state, owner).some((s) => s.card.traits.some((t) => t.toLowerCase() === "shield"));
    case "defenderNoArmor":
      return q.defender !== undefined && !inPlay(state, q.defender).some((s) => s.card.type === "armor");
    case "attackKind":
      return q.attackKind === cond.is;
    case "elementIs":
      return (state.warriors[owner].element ?? "").toLowerCase() === cond.element.toLowerCase();
    case "cultureIs":
      return (state.warriors[owner].cultures ?? []).some((c) => c.toLowerCase() === cond.culture.toLowerCase());
    case "adjacentToOpponent": {
      const a = state.warriors[owner].position;
      const b = state.warriors[owner === 0 ? 1 : 0].position;
      return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) === 1;
    }
    case "lifeVsNamed": {
      const other = state.warriors.find((w) => w.playerId !== owner && w.name.toLowerCase() === cond.name.toLowerCase());
      if (!other) return false;
      const mine = state.warriors[owner].life;
      return cond.cmp === "less" ? mine < other.life : mine > other.life;
    }
    case "lifeExtreme": {
      const mine = state.warriors[owner].life;
      const others = state.warriors.filter((w) => w.playerId !== owner);
      return cond.which === "least" ? others.every((w) => mine < w.life) : others.every((w) => mine > w.life);
    }
    case "faceUpSupportAtLeast":
      return inPlay(state, owner).length >= cond.n;
    case "wonInitiative":
      return state.initiative === owner;
    case "lacksType": {
      const who = cond.who === "defender" ? q.defender : q.attacker;
      return who !== undefined && !inPlay(state, who).some((s) => s.card.type === cond.cardType);
    }
    case "movedThisTurn":
      return state.phase === "playing" && state.currentPlayer === owner && state.movedThisTurn;
    case "experienceVs": {
      const other = cond.than === "attacker" ? q.attacker : q.defender;
      if (other === undefined || other === owner) return false;
      const mine = experienceOf(state, owner);
      const theirs = experienceOf(state, other);
      return cond.cmp === "more" ? mine > theirs : mine < theirs;
    }
    case "faceUpCard": {
      const who = cond.who === "self" ? owner : cond.who === "opponent" ? opp(owner) : cond.who === "defender" ? q.defender : q.attacker;
      if (who === undefined) return false;
      const trait = cond.trait?.toLowerCase();
      const hasTrait = (traits: string[]) => trait === undefined || traits.some((t) => t.toLowerCase() === trait);
      const found =
        inPlay(state, who).some((s) => (cond.cardType === undefined || s.card.type === cond.cardType) && hasTrait(s.card.traits)) ||
        (cond.cardType === undefined && trait !== undefined && hasTrait(warriorTraits(state, who)));
      return cond.has ? found : !found;
    }
  }
}

/** A warrior card's printed traits (e.g. Cavalry), from its card data. */
function warriorTraits(state: GameState, p: PlayerId): string[] {
  return state.warriors[p].traits ?? [];
}

export function describeCondition(cond: ConditionDef): string {
  switch (cond.kind) {
    case "hasInPlay":
      return `while ${cond.cardType === "inspiration" ? "an" : "a"} ${cond.cardType} is in play`;
    case "lostInitiative":
      return "on losing initiative";
    case "lowerLifeThanAttacker":
      return "while behind the attacker on life";
    case "haveShield":
      return "with a shield in play";
    case "defenderNoArmor":
      return "if the defender has no armor in play";
    case "attackKind":
      return cond.is === "basic" ? "by a basic attack" : "by a weapon attack";
    case "elementIs":
      return `while you are a ${cond.element} warrior`;
    case "cultureIs":
      return `while you are a ${cond.culture} warrior`;
    case "adjacentToOpponent":
      return "while adjacent to an opposing warrior";
    case "lifeVsNamed":
      return `while you have ${cond.cmp} life than ${cond.name}`;
    case "lifeExtreme":
      return `while you have the ${cond.which} life`;
    case "faceUpSupportAtLeast":
      return `while you have at least ${cond.n} face-up support cards`;
    case "wonInitiative":
      return "on winning initiative";
    case "lacksType":
      return `if the ${cond.who} has no face-up ${cond.cardType}`;
    case "movedThisTurn":
      return "if you have moved this turn";
    case "experienceVs":
      return `if you have ${cond.cmp} experience than the ${cond.than}`;
    case "faceUpCard": {
      const whose = cond.who === "self" ? "you have" : `the ${cond.who} has`;
      const what = [cond.trait, cond.cardType].filter(Boolean).join(" ");
      return `if ${whose} ${cond.has ? "a" : "no"} face-up ${what} card`;
    }
  }
}

// ---- Effects -------------------------------------------------------------------------------------

/** Who ability damage goes to. allOpponents / allOthers are the opponent in 1v1; all is both warriors. */
export type DamageTarget = "self" | "opponent" | "allOpponents" | "defender" | "attacker" | "all" | "allOthers";

/** Whose attack rolls / speed an effect changes: your own (default), every warrior's, or every
 *  other warrior's ("All warriors' attack rolls gain +1", "All other warriors gain +1 speed"). */
export type EffectTarget = "self" | "all" | "allOthers";

export type EffectDef = (
  /** "Your attack rolls gain +N" (target: "All warriors' attack rolls …") */
  | { kind: "attackRoll"; amount: number; target?: EffectTarget }
  /** "Your defense rolls gain +N" */
  | { kind: "defenseRoll"; amount: number }
  /** "Attacks with this weapon deal +N damage" (only on the weapon card itself) */
  | { kind: "weaponDamage"; amount: number }
  /** "Your attacks deal +N damage" — every attack you make, basic or weapon */
  | { kind: "attackDamage"; amount: number }
  /** "gain N life" */
  | { kind: "gainLife"; amount: number }
  /** "gain +N speed" (target: "All warriors gain …") */
  | { kind: "speed"; amount: number; target?: EffectTarget }
  /** "gain / get +N / -N experience". Fired: permanent unless the ability has a duration (rulebook
   *  p17); `who` picks whose (default your own). Continuous ("You gain +4 experience"): while the
   *  card is in play. */
  | { kind: "experience"; amount: number; who?: "self" | "opponent" | "attacker" | "defender" }
  /** "deal N damage to <target>" — ability damage, not a hit (rulebook glossary) */
  | { kind: "dealDamage"; amount: number; target: DamageTarget }
  /** "move N spaces" (where to — and which way to face — is the owner's choice); `diagonal`:
   *  "move one space diagonally" (corner to corner); `upTo`: "up to N spaces"; `who`: whose warrior
   *  moves (default your own). A warrior moved by another's ability keeps its facing unless the card
   *  says it may be turned (`rotate`, rulebook p11); your own warrior may always turn. */
  | {
      kind: "move";
      spaces: number;
      diagonal?: boolean;
      upTo?: boolean;
      who?: "self" | "opponent" | "defender" | "attacker";
      rotate?: boolean;
    }
  /** "you may re-roll one die of the attack roll" — then `ifSame` if the new die equals the old */
  | { kind: "reroll"; roll: "attack"; ifSame?: EffectDef[] }
) & {
  /** An effect that only applies when this also holds (two gated effects add up, rulebook p17). */
  when?: ConditionDef;
};

/** "Roll N dice. If the total is <cmp> X, …" — X a number, your experience, your life, or another
 *  warrior's experience. Rolled from the game's seeded RNG, apart from attack / defense rolls. */
export interface RollDef {
  dice: 1 | 2;
  cmp: ">" | "<" | ">=" | "<=";
  vs: number | "ownExperience" | "ownLife" | { experienceOf: "opponent" | "attacker" | "defender" };
}

/** Roll an ability's dice and judge them (advances state.rng). */
export function abilityRoll(ctx: FireContext, roll: RollDef): { dice: number[]; total: number; target: number; targetName: string; success: boolean } {
  const { state, owner } = ctx;
  const dice: number[] = [];
  for (let i = 0; i < roll.dice; i++) {
    const r = rollDie(state.rng);
    state.rng = r.state;
    dice.push(r.die);
  }
  const total = dice.reduce((a, b) => a + b, 0);
  let target: number;
  let targetName: string;
  if (typeof roll.vs === "number") {
    target = roll.vs;
    targetName = String(roll.vs);
  } else if (roll.vs === "ownExperience") {
    target = experienceOf(state, owner);
    targetName = "your experience";
  } else if (roll.vs === "ownLife") {
    target = state.warriors[owner].life;
    targetName = "your life";
  } else {
    const who = roll.vs.experienceOf;
    const t = who === "opponent" ? opp(owner) : who === "attacker" ? ctx.attacker : ctx.defender;
    target = t === undefined ? 0 : experienceOf(state, t);
    targetName = t === undefined ? "—" : `${state.warriors[t].name}'s experience`;
  }
  const success = roll.cmp === ">" ? total > target : roll.cmp === "<" ? total < target : roll.cmp === ">=" ? total >= target : total <= target;
  return { dice, total, target, targetName, success };
}

/** The warrior a move effect moves. */
export function moverOf(ctx: { owner: PlayerId; attacker?: PlayerId; defender?: PlayerId }, who: "self" | "opponent" | "defender" | "attacker" | undefined): PlayerId | undefined {
  return !who || who === "self" ? ctx.owner : who === "opponent" ? opp(ctx.owner) : who === "defender" ? ctx.defender : ctx.attacker;
}

/** permanent: while the card is in play (continuous). thisRound / nextTurn / nextAttack /
 *  nextAttackThisTurn: a timed effect (see TimedEffect). */
export type DurationDef = "permanent" | "thisRound" | "nextTurn" | "nextAttack" | "nextAttackThisTurn";

/** The durations a fired effect can have. */
export const TIMED = ["thisRound", "nextTurn", "nextAttack", "nextAttackThisTurn"] as const;
export const isTimed = (d: DurationDef | undefined): d is (typeof TIMED)[number] => (TIMED as readonly string[]).includes(d ?? "");

const DURATION_TEXT: Record<(typeof TIMED)[number], string> = {
  thisRound: "this round",
  nextTurn: "on the next turn",
  nextAttack: "on the next attack",
  nextAttackThisTurn: "on the next attack this turn",
};

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Does an effect with `target`, on a card `owner` controls, apply to warrior `subject`? */
export function targets(target: EffectTarget | undefined, owner: PlayerId, subject: PlayerId): boolean {
  return target === "all" || (target === "allOthers" ? subject !== owner : subject === owner);
}

/** The warriors an effect with `target` applies to. */
function targetPlayers(state: GameState, target: EffectTarget | undefined, owner: PlayerId): PlayerId[] {
  return state.warriors.map((w) => w.playerId).filter((p) => targets(target, owner, p));
}

function damageTargets(ctx: FireContext, target: DamageTarget): PlayerId[] {
  switch (target) {
    case "self":
      return [ctx.owner];
    case "opponent":
    case "allOpponents":
    case "allOthers":
      return [opp(ctx.owner)];
    case "all":
      return [ctx.owner, opp(ctx.owner)];
    case "defender":
      return ctx.defender !== undefined ? [ctx.defender] : [];
    case "attacker":
      return ctx.attacker !== undefined ? [ctx.attacker] : [];
  }
}

const DIAGONALS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

export interface MoveOpts {
  /** Steps go corner to corner ("move one space diagonally"). */
  diagonal?: boolean;
  /** "Up to N spaces": 1..N steps instead of exactly N. */
  upTo?: boolean;
  /** The moved warrior keeps its facing (another warrior moved by your ability, p11). */
  keepFacing?: boolean;
}

/** Where warrior `mover` can end an ability move of `spaces` steps: steps through empty in-arena
 *  cells (no passing through another warrior), never back at the start. Steps go along rows and
 *  columns, or — `diagonal` — corner to corner ("unless specified by a Card Ability", p11). Any
 *  facing after (a warrior moved by a card ability may rotate for free and faces only along rows
 *  and columns, p11), or its current facing with `keepFacing`. The 4th argument may be `true`
 *  (diagonal), for older callers. */
export function moveOptions(state: GameState, mover: PlayerId, spaces: number, opts: MoveOpts | boolean = {}): AbilityParams[] {
  const o: MoveOpts = typeof opts === "boolean" ? { diagonal: opts } : opts;
  const diagonal = !!o.diagonal;
  const start = state.warriors[mover].position;
  const foe = state.warriors[opp(mover)].position;
  const key = (p: Position) => `${p.row},${p.col}`;
  const reached = new Map<string, Position>();
  let frontier: Position[] = [start];
  for (let i = 0; i < spaces; i++) {
    const next = new Map<string, Position>();
    for (const p of frontier) {
      const steps = diagonal ? DIAGONALS.map(([dr, dc]) => ({ row: p.row + dr, col: p.col + dc })) : FACINGS.map((d) => stepPos(p, d));
      for (const q of steps) {
        if (inBounds(q, state.arenaSize) && key(q) !== key(foe)) next.set(key(q), q);
      }
    }
    frontier = [...next.values()];
    if (o.upTo || i === spaces - 1) for (const p of frontier) reached.set(key(p), p);
  }
  const facings: readonly Facing[] = o.keepFacing ? [state.warriors[mover].facing] : FACINGS;
  return [...reached.values()]
    .filter((p) => key(p) !== key(start))
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .flatMap((to) => facings.map((facing) => ({ to, facing })));
}

/** Queue an ability decision. The first one in a queue takes control (currentPlayer) until resolved;
 *  `resume` remembers whose turn it is. */
export function requestChoice(state: GameState, choice: import("../types").AbilityChoice): void {
  if (state.pending?.kind === "choice") {
    state.pending.queue.push(choice);
    return;
  }
  if (state.pending) throw new Error(`${choice.cardName} ${choice.ability}: a choice can't start while a ${state.pending.kind} is pending`);
  state.pending = { kind: "choice", queue: [choice], resume: state.currentPlayer };
  state.currentPlayer = choice.player;
}

/** Move a warrior to a chosen destination (an ability move). Returns a description for the log. */
export function moveWarrior(state: GameState, events: import("../types").GameEvent[], mover: PlayerId, params: AbilityParams, owner: PlayerId): string {
  const w = state.warriors[mover];
  const from = { ...w.position };
  state.warriors[mover] = { ...w, position: { ...params.to }, facing: params.facing };
  const turnPlayer = state.pending?.kind === "choice" ? state.pending.resume : state.currentPlayer;
  if (turnPlayer === mover) state.movedThisTurn = true;
  events.push({ type: "moved", player: mover, from, to: { ...params.to }, facing: params.facing });
  const where = `${"ABCD"[params.to.col]}-${["I", "II", "III", "IV"][params.to.row]}`;
  return mover === owner ? `moves to ${where}` : `moves ${w.name} to ${where}`;
}

/** Apply a one-off effect when an ability fires. Returns a description for the log. */
export function applyEffect(ctx: FireContext, effect: EffectDef, duration: DurationDef | undefined, params?: AbilityParams): string {
  const { state, owner } = ctx;
  switch (effect.kind) {
    case "gainLife":
      state.warriors[owner].life += effect.amount;
      return `gains ${effect.amount} life`;
    case "dealDamage": {
      const targets = damageTargets(ctx, effect.target);
      for (const t of targets) state.warriors[t].life -= effect.amount;
      const who = targets.map((t) => (t === owner ? "itself" : state.warriors[t].name)).join(", ");
      return `deals ${effect.amount} damage to ${who}`;
    }
    case "move": {
      if (!params) throw new Error(`${ctx.cardName} ${ctx.ability}: a move needs a destination`);
      const mover = moverOf(ctx, effect.who) ?? owner;
      const did = moveWarrior(state, ctx.events, mover, params, owner);
      return mover === owner ? `moves ${effect.spaces} space${effect.spaces === 1 ? "" : "s"}${effect.diagonal ? " diagonally" : ""}` : did;
    }
    case "experience": {
      const who = effect.who ?? "self";
      const t = who === "self" ? owner : who === "opponent" ? opp(owner) : who === "attacker" ? ctx.attacker : ctx.defender;
      if (t === undefined) return "no effect";
      const name = t === owner ? "" : ` to ${state.warriors[t].name}`;
      if (isTimed(duration)) {
        state.effects.push({ owner: t, source: ctx.cardId, sourceName: ctx.cardName, ability: ctx.ability, kind: "experience", amount: effect.amount, duration, active: duration !== "nextTurn" });
        return `${signed(effect.amount)} experience${name} ${DURATION_TEXT[duration]}`;
      }
      state.warriors[t].experience += effect.amount; // permanent (p17)
      return `${signed(effect.amount)} experience${name}`;
    }
    case "attackRoll":
    case "defenseRoll":
    case "speed":
    case "weaponDamage":
    case "attackDamage": {
      if (!isTimed(duration)) {
        throw new Error(`${ctx.cardName} ${ctx.ability}: a fired ${effect.kind} effect needs a timed duration (${TIMED.join(" / ")})`);
      }
      const target = effect.kind === "attackRoll" || effect.kind === "speed" ? effect.target : undefined;
      const kind = effect.kind === "weaponDamage" || effect.kind === "attackDamage" ? "damage" : effect.kind;
      const who = targetPlayers(state, target, owner);
      for (const p of who) {
        state.effects.push({
          owner: p,
          source: ctx.cardId,
          sourceName: ctx.cardName,
          ability: ctx.ability,
          kind,
          amount: effect.amount,
          ...(effect.kind === "weaponDamage" ? { weapon: ctx.cardId } : {}),
          duration,
          active: duration !== "nextTurn",
        });
      }
      const what =
        effect.kind === "attackRoll"
          ? "to attack rolls"
          : effect.kind === "defenseRoll"
            ? "to defense rolls"
            : effect.kind === "speed"
              ? "speed"
              : effect.kind === "weaponDamage"
                ? "damage with this weapon"
                : "damage";
      const when = DURATION_TEXT[duration];
      const whose = target === "all" ? "all warriors" : target === "allOthers" ? "all other warriors" : "";
      return whose ? `${whose} get ${signed(effect.amount)} ${what} ${when}` : `${signed(effect.amount)} ${what} ${when}`;
    }
    case "reroll":
      throw new Error(`${ctx.cardName} ${ctx.ability}: a re-roll is resolved during the attack roll, not fired`);
  }
}
