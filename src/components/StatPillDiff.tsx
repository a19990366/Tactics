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
  // 判斷是否為百分比型（以 suffix 為判斷依據）
  const isPercent = suffix === "%";

  // 格式化顯示數值：非百分比顯示原值（四捨五入到 2 位），百分比則乘 100 後顯示（至 2 位）
  const fmt = (v: number) =>
    isPercent ? Math.round(v * 10000) / 100 : Math.round(v * 100) / 100;

  const displayBase = fmt(base);
  const displayEff = fmt(eff);

  // diff 使用相同單位計算（例如百分比單位差 = (eff-base)*100）
  const diffRaw = eff - base;
  const displayDiff = isPercent ? Math.round(diffRaw * 10000) / 100 : Math.round(diffRaw * 100) / 100;

  const color =
    displayDiff > 0 ? "text-emerald-600" : displayDiff < 0 ? "text-rose-600" : "text-slate-700";

  return (
    <div className={`text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-300 ${color}`}>
      {label}:{" "}
      <b>
        {displayEff}
        {suffix}
      </b>
      {displayDiff !== 0 && (
        <span className="ml-1 text-[10px]">
          ({displayDiff > 0 ? "+" : ""}
          {displayDiff}
          {suffix})
        </span>
      )}
    </div>
  );
}
