// The two warriors used for the hotseat demo. Real cards, reused from the engine
// fixtures (copied from data/all_cards.json) so the UI shows real warriors
// without bundling the full 761-card file.
import { ACHILLES, AJAX } from "@fixtures";
import type { CardData } from "@engine";

export const PLAYER_0: CardData = ACHILLES;
export const PLAYER_1: CardData = AJAX;
