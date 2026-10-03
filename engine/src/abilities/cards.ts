// The cards whose abilities are implemented (Milestone 9 batch 1: one per trigger type;
// Milestone 10 batch 2: defense, damage, re-roll, move, reactions).
// Every other card is inert. Card text is quoted from the card data; the ability name is the
// printed one.

import { defineCard } from "./format";

/** Implemented cards, and any part of their printed text that is NOT implemented yet. */
export const IMPLEMENTED: Record<string, { name: string; partial?: string }> = {
  "s1-P005": { name: "Shinmen Takezo", partial: 'Not yet implemented: "Your attacks with swords deal +1 damage."' },
  "s1-086": { name: "Maximinus" },
  "s1-006": { name: "Leonidas" },
  "s1-082": { name: "Apollo" },
  "s5-076": { name: "Carlos V" },
  "s2-041": { name: "Sun Tzu" },
  // batch 2
  "s1-004": { name: "Linen Cuirass" },
  "s1-054": { name: "Byrnies" },
  "s1-071": { name: "Gladius" },
  "s2-086": { name: "Khutulun" },
  "s2-096": { name: "Subedei" },
  "s5-066": { name: "Salah ad-Din" },
  "s6-071": { name: "Vlad Tepes" },
};

// Shinmen Takezo — Kyougou: "Your attack rolls gain +2. Your attacks with swords deal +1 damage."
// (First clause only; the sword clause needs a weapon-trait condition primitive.)
defineCard("s1-P005", {
  data: { name: "Kyougou", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 2 }] },
});

// Maximinus — Ardor Deorum: "Your attack rolls gain +1 while you have an Inspiration in play."
defineCard("s1-086", {
  data: {
    name: "Ardor Deorum",
    trigger: "continuous",
    condition: { kind: "hasInPlay", cardType: "inspiration" },
    effects: [{ kind: "attackRoll", amount: 1 }],
  },
});

// Leonidas — Molon Lave: "Once per round, after you deal damage to an enemy warrior, gain 1 life."
defineCard("s1-006", {
  data: { name: "Molon Lave", trigger: "damageDealt", usageLimit: "oncePerRound", effects: [{ kind: "gainLife", amount: 1 }] },
});

// Apollo — Cura Dei (Reveal): "Your attack rolls gain +1 this round."
defineCard("s1-082", {
  data: { name: "Cura Dei", trigger: "reveal", effects: [{ kind: "attackRoll", amount: 1 }], duration: "thisRound" },
});

// Carlos V — Posición Legítima: "At the start of each round, if you lose initiative, gain 1 life."
defineCard("s5-076", {
  data: {
    name: "Posición Legítima",
    trigger: "roundStart",
    condition: { kind: "lostInitiative" },
    effects: [{ kind: "gainLife", amount: 1 }],
  },
});

// Sun Tzu — Wu xing de si lue (Action): "Gain +1 speed on your next turn."
// No usage limit, so it may be used more than once (rulebook p18); the bonuses add up.
defineCard("s2-041", {
  data: { name: "Wu xing de si lue", trigger: "action", effects: [{ kind: "speed", amount: 1 }], duration: "nextTurn" },
});

// ---- Batch 2 -------------------------------------------------------------------------------------

// Linen Cuirass (armor) — Linothorax: "Your defense rolls gain +1 while you have lower life than the
// attacking warrior."
defineCard("s1-004", {
  data: { name: "Linothorax", trigger: "continuous", condition: { kind: "lowerLifeThanAttacker" }, effects: [{ kind: "defenseRoll", amount: 1 }] },
});

// Byrnies (armor) — Stalwart (Reveal): "Add +2 to your defensive rolls for this round."
defineCard("s1-054", {
  data: { name: "Stalwart", trigger: "reveal", effects: [{ kind: "defenseRoll", amount: 2 }], duration: "thisRound" },
});

// Gladius (weapon) — Lamina Acuta: "Attacks with this weapon deal +1 damage if you have a face-up
// shield card. Attacks with this weapon deal +1 damage if the defender has no face-up armor card."
// Two independently gated +1s: both can apply (additive, rulebook p17).
defineCard("s1-071", {
  data: {
    name: "Lamina Acuta",
    trigger: "continuous",
    effects: [
      { kind: "weaponDamage", amount: 1, when: { kind: "haveShield" } },
      { kind: "weaponDamage", amount: 1, when: { kind: "defenderNoArmor" } },
    ],
  },
});

// Khutulun — Itegel: "After you are missed by a basic attack, gain 1 life."
defineCard("s2-086", {
  data: { name: "Itegel", trigger: "missed", condition: { kind: "attackKind", is: "basic" }, effects: [{ kind: "gainLife", amount: 1 }] },
});

// Subedei — Sain-tai tal-a-yi eriku: "Once per round, when making an attack roll, you may re-roll
// one die of the attack roll. If the new result of the die is the same as the old result, deal one
// damage to the defending warrior." (Optional: offered as a choice once the rolls are seen.)
defineCard("s2-096", {
  data: {
    name: "Sain-tai tal-a-yi eriku",
    trigger: "attackRoll",
    usageLimit: "oncePerRound",
    effects: [{ kind: "reroll", roll: "attack", ifSame: [{ kind: "dealDamage", amount: 1, target: "defender" }] }],
  },
});

// Salah ad-Din — Saria (Action): "Once each round, move two spaces."
defineCard("s5-066", {
  data: { name: "Saria", trigger: "action", usageLimit: "oncePerRound", effects: [{ kind: "move", spaces: 2 }] },
});

// Vlad Tepes — Tragere în Þeapã: "At the start of the game, deal 1 damage to all opposing warriors."
defineCard("s6-071", {
  data: { name: "Tragere în Þeapã", trigger: "gameStart", effects: [{ kind: "dealDamage", amount: 1, target: "allOpponents" }] },
});

export const isImplemented = (cardId: string) => cardId in IMPLEMENTED;
