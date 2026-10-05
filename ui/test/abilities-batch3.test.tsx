// Batch-3 abilities show in the ability list with their engine status (display only).
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { init } from "@engine";
import { AbilityChips } from "../src/components/AbilityChips";
import { DECKS } from "../src/decks";

const deck = (w: string) => DECKS.find((d) => d.warrior.name === w)!;

describe("batch-3 abilities in the ability list", () => {
  it("Charlemagne's conditional bonus is listed, inactive until three support cards are up", () => {
    const s = init(deck("Charlemagne"), deck("Carlos V"), 1).state;
    const html = renderToStaticMarkup(<AbilityChips state={s} pid={0} warrior={deck("Charlemagne").warrior} showFaceDown={false} />);
    expect(html).toContain("Férocité inlassable");
    expect(html).toContain("condition not met");
    const up = structuredClone(s);
    up.cards[0].support.forEach((c) => (c.status = "in-play"));
    const html2 = renderToStaticMarkup(<AbilityChips state={up} pid={0} warrior={deck("Charlemagne").warrior} showFaceDown={false} />);
    expect(html2).toContain("+2 to attack rolls");
  });

  it("Mercurino Gattinara's Reveal shows as fired, not as unimplemented", () => {
    const s = init(deck("Charlemagne"), deck("Carlos V"), 1).state;
    const html = renderToStaticMarkup(<AbilityChips state={s} pid={1} warrior={deck("Carlos V").warrior} showFaceDown={false} />);
    expect(html).toContain("Incitar Asalto");
    expect(html).toContain("fired on reveal this round");
  });

  it("Moctezuma II's round-start ability is ready; a face-down Hoplon isn't flagged unimplemented", () => {
    const s = init(deck("Moctezuma II"), deck("Leonidas"), 1).state;
    const moc = renderToStaticMarkup(<AbilityChips state={s} pid={0} warrior={deck("Moctezuma II").warrior} showFaceDown={false} />);
    expect(moc).toContain("Tezcatiliztli");
    expect(moc).toContain("at the start of each round");
    const leo = renderToStaticMarkup(<AbilityChips state={s} pid={1} warrior={deck("Leonidas").warrior} showFaceDown={true} />);
    expect(leo).toMatch(/I tan I epi tas[\s\S]*face down — revealed in round 4</);
  });
});
