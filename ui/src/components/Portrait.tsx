// A warrior portrait with the sepia / black-and-white photo treatment. Uses real art from
// portraits.ts when present, otherwise an engraved-style placeholder bust with the warrior's initial.
import { PORTRAITS } from "../portraits";

export function Portrait({ cardId, name, className = "" }: { cardId: string; name: string; className?: string }) {
  const src = PORTRAITS[cardId];
  if (src) return <img className={`portrait ${className}`} src={src} alt={name} />;
  return (
    <svg className={`portrait portrait-placeholder ${className}`} viewBox="0 0 100 100" role="img" aria-label={name}>
      <rect width="100" height="100" className="pp-ground" />
      <path d="M18 100 C20 74 34 66 50 66 C66 66 80 74 82 100 Z" className="pp-bust" />
      <circle cx="50" cy="44" r="18" className="pp-bust" />
      <path d="M31 40 C32 22 68 22 69 40 L69 46 L63 38 L37 38 L31 46 Z" className="pp-helm" />
    </svg>
  );
}
