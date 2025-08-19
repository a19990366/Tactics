export function HpRing({
  frac,
  size = 34,
  stroke = 4,
  colorClass,
}: {
  frac: number;
  size?: number;
  stroke?: number;
  colorClass: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = (1 - Math.max(0, Math.min(1, frac))) * c;
  return (
    <div className={`pointer-events-none ${colorClass}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={stroke}
        />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 450ms ease-in-out" }}
          />
        </g>
      </svg>
    </div>
  );
}
