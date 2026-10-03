// The cards whose abilities are implemented (Milestone 9, first batch: one per trigger type).
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

export const isImplemented = (cardId: string) => cardId in IMPLEMENTED;
