// The cards whose abilities are implemented (Milestone 9 batch 1: one per trigger type;
// Milestone 10 batch 2: defense, damage, re-roll, move, reactions; Milestone 12 batch 4: cards
// recovered from the batch-3 skip log, authored by hand). Batch 3 is generated (cards-batch3.ts).
// Every other card is inert. Card text is quoted from the card data; the ability name is the
// printed one.

import { defineCard } from "./format";
import { IMPLEMENTED_BATCH3 } from "./cards-batch3"; // generated: scraper/build_ability_batch3.py

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
  // batch 3 (rule-defined bulk pass) — generated
  ...IMPLEMENTED_BATCH3,
  // batch 4 (recovered from the batch-3 skip log)
  "s1-023": { name: "Yumi" },
  "s2-018": { name: "Greatsword" },
  "s4-056": { name: "Cyrus The Great" },
  "s5-034": { name: "Akaitoodoshi-Yoroi" },
  "s7-098": { name: "Spathi Tis Trias" },
  "s2-005": { name: "Targe" },
  "s1-050": { name: "Crown of England" },
  "s1-039": { name: "Miyamoto Musashi" },
  "s1-098": { name: "Sica" },
  "s3-083": { name: "Claidheamh Leathann" },
  "s1-013": { name: "Kopis" },
  "s1-016": { name: "Milo of Croton" },
  "s2-081": { name: "Gengis Khan" },
  "s2-083": { name: "Alman Sukh" },
  "s2-072": { name: "Khnum" },
  "s1-034": { name: "Bishamon-ten" },
  "s1-077": { name: "Mercury" },
  "s7-P060": { name: "Yggdrassil" },
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

// ---- Batch 4 -------------------------------------------------------------------------------------
// Recovered from the batch-3 skip log. "Your next attack …" is a duration that ends after one
// attack (rulebook p17): nextAttack, or nextAttackThisTurn when the text says "this turn".

// Yumi (weapon) — Zanshin (Reveal): "Attacks with this weapon deal +1 damage this round."
defineCard("s1-023", {
  data: { name: "Zanshin", trigger: "reveal", effects: [{ kind: "weaponDamage", amount: 1 }], duration: "thisRound" },
});
// Greatsword (weapon) — Ridon dem Dune: "This weapon deals +1 damage while you have a face up cavalry card."
defineCard("s2-018", {
  data: {
    name: "Ridon dem Dune",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "self", trait: "Cavalry", has: true },
    effects: [{ kind: "weaponDamage", amount: 1 }],
  },
});
// Cyrus The Great — Savarkar-e Chabok: "While you have a cavalry card you gain +1 speed."
defineCard("s4-056", {
  data: {
    name: "Savarkar-e Chabok",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "self", trait: "Cavalry", has: true },
    effects: [{ kind: "speed", amount: 1 }],
  },
});
// Akaitoodoshi-Yoroi (armor) — Saikaku na Soubi: "If you have a sword in play, your attack and
// defense rolls gain +1."
defineCard("s5-034", {
  data: {
    name: "Saikaku na Soubi",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "self", trait: "Sword", has: true },
    effects: [
      { kind: "attackRoll", amount: 1 },
      { kind: "defenseRoll", amount: 1 },
    ],
  },
});
// Spathi Tis Trias (weapon) — Epitaxinete: "You gain +1 speed."
defineCard("s7-098", {
  data: { name: "Epitaxinete", trigger: "continuous", effects: [{ kind: "speed", amount: 1 }] },
});
// Targe (special) — Agaenes-feohte: "When you are attacked and missed, your next attack roll gains +2."
defineCard("s2-005", {
  data: { name: "Agaenes-feohte", trigger: "missed", effects: [{ kind: "attackRoll", amount: 2 }], duration: "nextAttack" },
});
// Crown of England (special) — Konge: "Your attack rolls gain +1 if you are a metal warrior. Your
// defense rolls get -1 and your attacks deal +1 damage if you are a fire warrior."
defineCard("s1-050", {
  data: {
    name: "Konge",
    trigger: "continuous",
    effects: [
      { kind: "attackRoll", amount: 1, when: { kind: "elementIs", element: "Metal" } },
      { kind: "defenseRoll", amount: -1, when: { kind: "elementIs", element: "Fire" } },
      { kind: "attackDamage", amount: 1, when: { kind: "elementIs", element: "Fire" } },
    ],
  },
});
// Miyamoto Musashi — Niten Ichi Ryu (Action): "Your next attack this turn deals +1 damage."
defineCard("s1-039", {
  data: { name: "Niten Ichi Ryu", trigger: "action", effects: [{ kind: "attackDamage", amount: 1 }], duration: "nextAttackThisTurn" },
});
// Sica (weapon) — Lamina Incurvata: "Attacks with this weapon deal +1 damage if the defending warrior
// has a face-up shield card."
defineCard("s1-098", {
  data: {
    name: "Lamina Incurvata",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "defender", trait: "Shield", has: true },
    effects: [{ kind: "weaponDamage", amount: 1 }],
  },
});
// Claidheamh Leathann (weapon) — Marbhaiche Each: "While the defender has a cavalry card, this weapon
// deals +1 damage."
defineCard("s3-083", {
  data: {
    name: "Marbhaiche Each",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "defender", trait: "Cavalry", has: true },
    effects: [{ kind: "weaponDamage", amount: 1 }],
  },
});
// Kopis (weapon) — Epithesi!: "Attacks with this weapon deal +1 damage if you have moved this turn."
defineCard("s1-013", {
  data: { name: "Epithesi!", trigger: "continuous", condition: { kind: "movedThisTurn" }, effects: [{ kind: "weaponDamage", amount: 1 }] },
});
// Milo of Croton — Xoris Fragmo: "Your base attacks deal +1 damage while you have no face-up weapon cards."
defineCard("s1-016", {
  data: {
    name: "Xoris Fragmo",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "self", cardType: "weapon", has: false },
    effects: [{ kind: "attackDamage", amount: 1, when: { kind: "attackKind", is: "basic" } }],
  },
});
// Gengis Khan — Erkesiyeku ary-a: "Your attack rolls are +1 while attacking an opponent without a
// cavalry card."
defineCard("s2-081", {
  data: {
    name: "Erkesiyeku ary-a",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "defender", trait: "Cavalry", has: false },
    effects: [{ kind: "attackRoll", amount: 1 }],
  },
});
// Alman Sukh (weapon) — Cabciqu: "Attacks with this weapon deal +1 damage when attacking an opponent
// without a face-up cavalry card."
defineCard("s2-083", {
  data: {
    name: "Cabciqu",
    trigger: "continuous",
    condition: { kind: "faceUpCard", who: "defender", trait: "Cavalry", has: false },
    effects: [{ kind: "weaponDamage", amount: 1 }],
  },
});
// Khnum (inspiration) — M' 'n (Reveal): "Your next attack deals +1 damage."
//                      ' r hnn: "Your attack rolls gain +2 against warriors without a face-up inspiration."
defineCard(
  "s2-072",
  { data: { name: "M' 'n", trigger: "reveal", effects: [{ kind: "attackDamage", amount: 1 }], duration: "nextAttack" } },
  {
    data: {
      name: "' r hnn",
      trigger: "continuous",
      condition: { kind: "faceUpCard", who: "defender", cardType: "inspiration", has: false },
      effects: [{ kind: "attackRoll", amount: 2 }],
    },
  },
);
// Bishamon-ten (inspiration) — Hogosha: "All warriors' attack rolls gain +1."
defineCard("s1-034", {
  data: { name: "Hogosha", trigger: "continuous", effects: [{ kind: "attackRoll", amount: 1, target: "all" }] },
});
// Mercury (inspiration) — Nuntius (Reveal): "All warriors gain +2 speed this round."
defineCard("s1-077", {
  data: { name: "Nuntius", trigger: "reveal", effects: [{ kind: "speed", amount: 2, target: "all" }], duration: "thisRound" },
});
// Yggdrassil (inspiration) — Asgard: "All your attacks deal +1 damage."
//                            Hvergelmir: "All other warriors gain +1 speed."
defineCard(
  "s7-P060",
  { data: { name: "Asgard", trigger: "continuous", effects: [{ kind: "attackDamage", amount: 1 }] } },
  { data: { name: "Hvergelmir", trigger: "continuous", effects: [{ kind: "speed", amount: 1, target: "allOthers" }] } },
);

export const isImplemented = (cardId: string) => cardId in IMPLEMENTED;
