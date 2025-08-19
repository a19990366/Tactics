import { GameState } from "../modules/types";
import { unitAt } from "../modules/engine";
import { HpRing } from "./HpRing";

export function Tile({
  gs,
  x,
  y,
  onClick,
  highlighted,
  danger,
}: {
  gs: GameState;
  x: number;
  y: number;
  onClick: () => void;
  highlighted?: boolean;
  danger?: boolean;
}) {
  const u = unitAt(gs, x, y);
  const isA = u?.team === "A";
  const alt = (x + y) % 2 === 0;
  const selected = u && gs.selectedUnitId === u.id;
  const cls = [
    "relative w-10 h-10 border flex items-center justify-center text-xs select-none",
    alt ? "bg-white border-slate-300" : "bg-slate-100 border-slate-300",
  ].join(" ");
  const frac = u ? Math.max(0, Math.min(1, u.hp / u.maxHP)) : 0;
  const ringClass =
    frac > 0.5
      ? "text-emerald-500"
      : frac > 0.25
      ? "text-amber-500"
      : "text-rose-500";
  return (
    <div className={cls} onClick={onClick}>
      {(highlighted || danger) && (
        <div
          className={`absolute inset-0 pointer-events-none border-2 ${
            highlighted ? "border-emerald-500" : ""
          } ${danger ? "border-rose-500" : ""}`}
        ></div>
      )}
      {selected && (
        <div className="absolute inset-0 pointer-events-none outline outline-2 outline-amber-400"></div>
      )}
      {u && (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <HpRing frac={frac} colorClass={ringClass} />
          </div>
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
              isA ? "bg-blue-500" : "bg-red-500"
            }`}
          >
            {u.cls[0]}
          </div>
        </>
      )}
    </div>
  );
}
