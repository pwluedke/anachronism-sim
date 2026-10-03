// Decorative compass rose for the map margin. North matches the engine's "N" (toward row 0).
export function Compass() {
  return (
    <svg className="compass" viewBox="-52 -60 104 112" aria-hidden="true">
      <circle r="44" className="compass-ring" />
      <circle r="38" className="compass-ring compass-ring-inner" />
      <path d="M0 -40 L7 -7 L40 0 L7 7 L0 40 L-7 7 L-40 0 L-7 -7 Z" className="compass-star" />
      <path d="M0 -40 L7 -7 L0 0 Z M40 0 L7 7 L0 0 Z M0 40 L-7 7 L0 0 Z M-40 0 L-7 -7 L0 0 Z" className="compass-star-shade" />
      <path d="M-24 -24 L4 -4 L24 -24 L4 4 L24 24 L-4 4 L-24 24 L-4 -4 Z" className="compass-star-minor" />
      <text y="-47" textAnchor="middle" className="compass-n">
        N
      </text>
    </svg>
  );
}
