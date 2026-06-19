// Hand-picked warrior fixtures copied from the real card data (data/all_cards.json),
// in the card schema shape (flat 12-key grid). Tests/examples use THESE, not the
// full 761-card file. Chosen for variety: front+sides, front+behind (row-4 cell),
// damage 2, and a high-experience warrior.

import type { CardData, AttackGrid } from "../src/types";

const KEYS = [
  "1A", "1B", "1C",
  "2A", "2B", "2C",
  "3A", "3B", "3C",
  "4A", "4B", "4C",
] as const;

/** Fill a sparse {key: value} into a full 12-key grid (missing keys -> null). */
function grid(cells: Record<string, string>): AttackGrid {
  const g: AttackGrid = {};
  for (const k of KEYS) g[k] = k in cells ? cells[k] : null;
  return g;
}

// Achilles — s1-091. Marker 3B; +0 in front (2B), -1 to each side (3A, 3C).
export const ACHILLES: CardData = {
  id: "s1-091",
  name: "Achilles",
  life: 8,
  speed: 3,
  experience: 9,
  damage: 1,
  grid: grid({ "2B": "+0", "3A": "-1", "3B": "marker", "3C": "-1" }),
};

// Ajax — s7-041. Reaches forward (2A/2B/2C, 3A) AND behind (4A). High life.
export const AJAX: CardData = {
  id: "s7-041",
  name: "Ajax",
  life: 10,
  speed: 3,
  experience: 3,
  damage: 1,
  grid: grid({
    "2A": "+1", "2B": "+1", "2C": "-1",
    "3A": "-1", "3B": "marker",
    "4A": "-2",
  }),
};

// Jei the Tyrant — s2-036. DAMAGE 2. Sides (3A/3C) and one behind (4B).
export const JEI_THE_TYRANT: CardData = {
  id: "s2-036",
  name: "Jei the Tyrant",
  life: 6,
  speed: 3,
  experience: 4,
  damage: 2,
  grid: grid({ "3A": "+0", "3B": "marker", "3C": "+0", "4B": "+0" }),
};

// Suleiman I — s6-096. HIGH EXPERIENCE (10). Front-left cluster.
export const SULEIMAN: CardData = {
  id: "s6-096",
  name: "Suleiman I, The Magnificent",
  life: 10,
  speed: 3,
  experience: 10,
  damage: 1,
  grid: grid({ "2B": "+0", "2C": "+1", "3A": "+2", "3B": "marker" }),
};

export const FIXTURES: Record<string, CardData> = {
  [ACHILLES.id]: ACHILLES,
  [AJAX.id]: AJAX,
  [JEI_THE_TYRANT.id]: JEI_THE_TYRANT,
  [SULEIMAN.id]: SULEIMAN,
};
