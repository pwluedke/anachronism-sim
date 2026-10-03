// One support-card slot: face-down (card back), or face-up once revealed — in play, or discarded.
// Shows only the stats with effect this milestone (initiative, type, hands, a weapon's grid +
// damage); ability text is shown but marked inactive.
import type { SupportSlot } from "@engine";
import { GridDiagram } from "./GridDiagram";

const TYPE_LABEL: Record<string, string> = { weapon: "Weapon", armor: "Armor", inspiration: "Inspiration", special: "Special" };

export function SupportCard({
  slot,
  index,
  discardable,
  onDiscard,
}: {
  slot: SupportSlot;
  index: number;
  /** A card restriction is pending and this card may be discarded to resolve it. */
  discardable?: boolean;
  onDiscard?: () => void;
}) {
  if (slot.status === "face-down") {
    return (
      <div className="card-back" title={`Support card ${index + 1} (face down — revealed in round ${index + 1})`}>
        <span className="card-back-mark">A</span>
      </div>
    );
  }
  const c = slot.card;
  const abilityText = c.abilities.map((a) => `${a.name}${a.type !== "unknown" ? ` (${a.type})` : ""}: ${a.text}`).join("\n");
  const title = [
    `${c.name} — ${TYPE_LABEL[c.type]}`,
    `Initiative ${c.initiative ?? "—"}${c.hands ? ` · ${c.hands} hand${c.hands > 1 ? "s" : ""}` : ""}${c.damage !== null ? ` · damage ${c.damage}` : ""}`,
    c.traits.length ? c.traits.join(", ") : "",
    abilityText ? `Abilities (inactive this milestone):\n${abilityText}` : "",
    slot.status === "discarded" ? "DISCARDED" : "",
  ]
    .filter(Boolean)
    .join("\n");
  const body = (
    <>
      <span className="sc-init num" title="Initiative">
        {c.initiative ?? "—"}
      </span>
      <span className="sc-type label">{TYPE_LABEL[c.type]}</span>
      <span className="sc-name">{c.name}</span>
      {c.type === "weapon" && c.grid && (
        <span className="sc-weapon">
          <GridDiagram grid={c.grid} name={c.name} />
          <span className="sc-dmg num" title="Weapon damage">
            {c.damage}
          </span>
        </span>
      )}
      <span className="sc-foot">
        {c.hands > 0 && <span className="sc-hands">{c.hands} hand{c.hands > 1 ? "s" : ""}</span>}
        {c.abilities.length > 0 && <span className="sc-inactive">ability off</span>}
      </span>
      {slot.status === "discarded" && <span className="sc-stamp">discarded</span>}
    </>
  );
  const cls = `card-face ${c.type}${slot.status === "discarded" ? " discarded" : ""}${discardable ? " discardable" : ""}`;
  if (discardable && onDiscard) {
    return (
      <button type="button" className={cls} title={`${title}\n\nClick to discard`} onClick={onDiscard}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}
