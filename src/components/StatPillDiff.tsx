export function StatPillDiff({
  label,
  base,
  eff,
  suffix = "",
}: {
  label: string;
  base: number;
  eff: number;
  suffix?: string;
}) {
  const diff = Math.round((eff - base) * 100) / 100;
  const color =
    diff > 0
      ? "text-emerald-600"
      : diff < 0
      ? "text-rose-600"
      : "text-slate-700";
  return (
    <div
      className={`text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-300 ${color}`}
    >
      {label}:{" "}
      <b>
        {Math.round(eff * 100) / 100}
        {suffix}
      </b>
      {diff !== 0 && (
        <span className="ml-1 text-[10px]">
          ({diff > 0 ? "+" : ""}
          {diff}
          {suffix})
        </span>
      )}
    </div>
  );
}
