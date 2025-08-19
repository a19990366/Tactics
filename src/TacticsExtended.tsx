import { useMemo, useState, useEffect, useRef } from "react";
import {
  initGameWithRosters,
  currentUnit,
  getReachable,
  getAreaTiles,
  runSelfTests,
  isTeamAlive,
  endTurn,
  collectTargets,
  doCast,
  aiTakeTurn,
  skipToAlive,
} from "./modules/engine";
import {
  CLASS_LIST,
  RANDOM_CLASS_LIST,
  ClassKey,
  Templates,
} from "./modules/templates";
import { GameState } from "./modules/types";
import { StatPillDiff } from "./components/StatPillDiff";
import { Tile } from "./components/Tile";
import { SelectSlot } from "./components/SelectSlot";
import { log, logs } from "./modules/logs";

export default function TacticsExtended() {
  const [mode, setMode] = useState<"PvE" | "PvP">("PvE");
  const [inSetup, setInSetup] = useState(true);
  const [allowDup, setAllowDup] = useState(true);
  const empty4: ("" | ClassKey)[] = ["", "", "", ""];
  const [p1Sel, setP1Sel] = useState<("" | ClassKey)[]>([...empty4]);
  const [p2Sel, setP2Sel] = useState<("" | ClassKey)[]>([...empty4]);
  const [lastRoster, setLastRoster] = useState<{
    p1: ClassKey[];
    p2: ClassKey[];
  }>(() => ({
    p1: ["Swordsman", "Mage", "Archer", "Rogue"],
    p2: ["Swordsman", "Mage", "Archer", "Rogue"],
  }));
  const [gs, setGs] = useState<GameState>(() =>
    initGameWithRosters("PvE", lastRoster.p1, lastRoster.p2)
  );

  // ---------- NEW: refs for unit list scrolling ----------
  const unitRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const id = gs.selectedUnitId;
    if (!id) return;
    const el = unitRefs.current[id];
    if (el) {
      // smooth scroll so user sees the selected unit in the list
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [gs.selectedUnitId]);
  // ------------------------------------------------------

  const me = currentUnit(gs);
  const selected = gs.selectedUnitId
    ? gs.units.find((u) => u.id === gs.selectedUnitId)
    : undefined;
  const selectedSkill =
    selected && gs.selectedSkillId
      ? selected.skills.find((s) => s.id === gs.selectedSkillId)
      : undefined;

  const moveTiles = useMemo(() => {
    if (!selected || gs.phase !== "select-move") return [];
    return getReachable(gs, selected);
  }, [gs, selected]);

  const targetTiles = useMemo(() => {
    if (!selected || gs.phase !== "select-target" || !selectedSkill) return [];
    return getAreaTiles(gs, selected, selectedSkill);
  }, [gs, selected, selectedSkill]);

  const testResults = useMemo(() => runSelfTests(), []);

  const aAlive = isTeamAlive(gs, "A");
  const bAlive = isTeamAlive(gs, "B");

  useEffect(() => {
    if (inSetup) return;
    const cur = currentUnit(gs);
    let timer: any;
    if (!cur) {
      timer = setTimeout(() => {
        skipToAlive(gs);
        setGs({ ...gs });
      }, 0);
    } else if (gs.mode === "PvE" && cur.team === "B" && aAlive && bAlive) {
      timer = setTimeout(() => {
        aiTakeTurn(gs);
        setGs({ ...gs });
      }, 300);
    }
    return () => timer && clearTimeout(timer);
  }, [inSetup, gs, aAlive, bAlive]);

  const buildOptions = (curList: ("" | ClassKey)[], idx: number) => {
    if (allowDup) return CLASS_LIST;
    const used = new Set(
      curList.filter((v, i) => v && i !== idx) as ClassKey[]
    );
    return CLASS_LIST.filter((k) => !used.has(k));
  };
  const fillRandomIfEmpty = (arr: ("" | ClassKey)[]) => {
    const chosen = arr.filter(Boolean) as ClassKey[];
    if (allowDup) {
      while (chosen.length < 4)
        chosen.push(
          RANDOM_CLASS_LIST[
            Math.floor(Math.random() * RANDOM_CLASS_LIST.length)
          ]
        );
    } else {
      const remain = RANDOM_CLASS_LIST.filter((k) => !chosen.includes(k));
      while (chosen.length < 4 && remain.length) {
        const idx = Math.floor(Math.random() * remain.length);
        chosen.push(remain.splice(idx, 1)[0]);
      }
    }
    return chosen.slice(0, 4);
  };
  const randomRoster = (count: number, allowDupFlag: boolean) => {
    const out: ClassKey[] = [];
    const pool = [...RANDOM_CLASS_LIST];
    for (let i = 0; i < count; i++) {
      if (allowDupFlag) out.push(pool[Math.floor(Math.random() * pool.length)]);
      else {
        if (pool.length === 0) break;
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool[idx]);
        pool.splice(idx, 1);
      }
    }
    return out;
  };

  const startGame = () => {
    const p1 = fillRandomIfEmpty(p1Sel);
    const p2 =
      mode === "PvP" ? fillRandomIfEmpty(p2Sel) : randomRoster(4, allowDup);
    const s = initGameWithRosters(mode, p1, p2);
    setLastRoster({ p1, p2 });
    setGs(s);
    setInSetup(false);
  };
  const reset = (modeNext: "PvE" | "PvP") => {
    setGs(initGameWithRosters(modeNext, lastRoster.p1, lastRoster.p2));
  };

  const onTileClick = (x: number, y: number) => {
    const meNow = currentUnit(gs);
    if (gs.phase !== "select-move" && gs.phase !== "select-target") {
      const u = gs.units.find((uu) => uu.alive && uu.x === x && uu.y === y);
      if (u) {
        gs.selectedUnitId = u.id;
        gs.selectedSkillId = undefined;
        setGs({ ...gs });
      }
      return;
    }
    if (!meNow) return;

    if (gs.phase === "select-move" && selected) {
      const ok = moveTiles.some((t) => t.x === x && t.y === y);
      if (ok) {
        selected.x = x;
        selected.y = y;
        selected.movedThisTurn = true;
        gs.phase = "select-action";
        setGs({ ...gs });
      }
      return;
    }

    if (gs.phase === "select-target" && selected && selectedSkill) {
      const tiles = targetTiles;
      const okTile =
        tiles.some((t) => t.x === x && t.y === y) ||
        selectedSkill.area.kind === "SelfMov";
      if (!okTile) return;

      if (selected.actedThisTurn) {
        return;
      }
      if (selected.mp < selectedSkill.mpCost) {
        return;
      }

      const targets = collectTargets(gs, selected, selectedSkill, { x, y });
      if (!targets.length && selectedSkill.targetTeam !== "both") {
        return;
      }

      doCast(gs, selected, selectedSkill, targets);
      gs.phase = "select-action";
      selected.actedThisTurn = true;
      setGs({ ...gs });
      return;
    }
  };

  // ---------- NEW: dynamic skill tooltip generator ----------
  function skillTooltip(sk: any): string {
    if (!sk) return "—";
    const parts: string[] = [];
    // basic header
    parts.push(`${sk.name}`);
    // type & multiplier & mp
    if (sk.type) parts.push(`類型: ${sk.type}`);
    if (sk.multiplier != null) parts.push(`倍率: ${sk.multiplier}`);
    parts.push(`耗費: ${sk.mpCost ?? 0} MP`);
    // range / area
    if (sk.area) {
      if (sk.area.kind === "Line")
        parts.push(`範圍: 直線 ${sk.rangeFront ?? "?"}`);
      else if (sk.area.kind === "Rect")
        parts.push(
          `範圍: 矩形 ${(sk.area as any).rectW}×${(sk.area as any).rectD}`
        );
      else parts.push(`範圍: 自身 (MOV)`);
    }
    // targetGroup / targetTeam
    if (sk.targetGroup) parts.push(`目標: ${sk.targetGroup}`);
    if (sk.targetTeam) parts.push(`目標隊伍: ${sk.targetTeam}`);
    // effects
    if (sk.effects) {
      if (sk.effects.healHP) parts.push(`回復 HP: ${sk.effects.healHP}`);
      if (sk.effects.restoreMP) parts.push(`回復 MP: ${sk.effects.restoreMP}`);
      if (sk.effects.applyBuff)
        parts.push(
          `附加: ${sk.effects.applyBuff.buff.name} (${sk.effects.applyBuff.to})`
        );
    }
    // if there's an explicit desc, use it at the end for more context
    if (sk.desc) parts.push(`說明: ${sk.desc}`);
    return parts.join("；");
  }
  // -----------------------------------------------------------

  return (
    <div className="min-h-screen">
      {inSetup ? (
        <div className="p-4 flex flex-col gap-4 bg-slate-50 min-h-screen text-slate-800">
          <h1 className="text-xl font-bold">React 戰棋英雄 ⚔（擴充版）</h1>
          <div className="flex items-center gap-3">
            <label className="text-sm">模式：</label>
            <select
              className="border rounded px-2 py-1"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="PvE">PvE（P2 為 AI）</option>
              <option value="PvP">PvP（雙人）</option>
            </select>
            <label className="flex items-center gap-2 ml-4 text-sm">
              <input
                type="checkbox"
                checked={allowDup}
                onChange={(e) => setAllowDup(e.target.checked)}
              />{" "}
              允許重複職業
            </label>
          </div>

          <div className="p-3 rounded-xl border shadow-sm">
            <div className="font-semibold mb-2">P1 選角（最多 4 隻）</div>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {p1Sel.map((v, i) => (
                <SelectSlot
                  key={i}
                  value={v}
                  label={`P1-${i + 1}`}
                  options={buildOptions(p1Sel, i)}
                  onChange={(val) => {
                    const arr = [...p1Sel];
                    arr[i] = val;
                    setP1Sel(arr);
                  }}
                />
              ))}
            </div>
          </div>

          {mode === "PvP" && (
            <div className="p-3 rounded-xl border shadow-sm">
              <div className="font-semibold mb-2">P2 選角（最多 4 隻）</div>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {p2Sel.map((v, i) => (
                  <SelectSlot
                    key={i}
                    value={v}
                    label={`P2-${i + 1}`}
                    options={buildOptions(p2Sel, i)}
                    onChange={(val) => {
                      const arr = [...p2Sel];
                      arr[i] = val;
                      setP2Sel(arr);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 rounded bg-emerald-600 text-white"
              onClick={startGame}
            >
              開始遊戲
            </button>
            <button
              className="px-3 py-2 rounded bg-slate-200"
              onClick={() => {
                setP1Sel(["", "", "", ""]);
                setP2Sel(["", "", "", ""]);
              }}
            >
              清空選角
            </button>
            {mode === "PvP" && (
              <button
                className="px-3 py-2 rounded bg-slate-200"
                onClick={() => {
                  setP2Sel(randomRoster(4, allowDup));
                }}
              >
                P2 隨機
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 flex flex-col gap-3 bg-slate-50 text-slate-800 min-h-screen">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">React 戰棋英雄 ⚔（擴充版）</h1>
            <div className="flex items-center gap-2 ml-auto">
              <select
                className="border rounded px-2 py-1"
                value={gs.mode}
                onChange={(e) => {
                  const m = e.target.value as "PvE" | "PvP";
                  reset(m);
                }}
              >
                <option value="PvE">PvE：B 隊 AI</option>
                <option value="PvP">PvP：雙人輪流</option>
              </select>
              <button
                className="px-3 py-1 rounded bg-slate-800 text-white"
                onClick={() => reset(gs.mode)}
              >
                重新開始
              </button>
              <button
                className="px-3 py-1 rounded bg-slate-200"
                onClick={() => setInSetup(true)}
              >
                重新組隊
              </button>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-80 space-y-3">
              <div className="p-3 rounded-xl border shadow-sm">
                <div className="font-semibold mb-2">單位列表（可點擊查看）</div>
                <div className="space-y-2 max-h-[28rem] overflow-auto">
                  {gs.units.map((u) => {
                    const accB = u.base.ACC,
                      accE = getStat(u, "ACC");
                    const evaB = u.base.EVA,
                      evaE = getStat(u, "EVA");
                    const spdB = u.base.SPD,
                      spdE = getStat(u, "SPD");
                    const movB = u.base.MOV,
                      movE = getStat(u, "MOV");
                    const crB = u.base.CR,
                      crE = getStat(u, "CR");
                    return (
                      <div
                        key={u.id}
                        ref={(el) => (unitRefs.current[u.id] = el)} // <<-- NEW: attach ref
                        onClick={() => {
                          gs.selectedUnitId = u.id;
                          gs.selectedSkillId = undefined;
                          setGs({ ...gs });
                        }}
                        className={`p-2 rounded-lg border cursor-pointer hover:bg-slate-50 ${
                          u.alive ? "" : "opacity-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">
                            {u.id}{" "}
                            <span className="text-xs text-slate-500">
                              [{u.cls}]
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-300">
                              HP:{" "}
                              <b>
                                {u.hp}/{u.maxHP}
                              </b>
                            </div>
                            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-300">
                              MP:{" "}
                              <b>
                                {u.mp}/{u.maxMP}
                              </b>
                            </div>
                          </div>
                        </div>
                        <div className="mt-1 flex gap-2 flex-wrap text-[11px]">
                          <StatPillDiff label="ACC" base={accB} eff={accE} />
                          <StatPillDiff label="EVA" base={evaB} eff={evaE} />
                          <StatPillDiff
                            label="CR"
                            base={crB}
                            eff={crE}
                            suffix="%"
                          />
                          <StatPillDiff label="SPD" base={spdB} eff={spdE} />
                          <StatPillDiff label="MOV" base={movB} eff={movE} />
                          <div
                            className="text-[11px] px-2 py-1 rounded-full bg-slate-100 border border-slate-300"
                            title={`物${Templates[u.cls].finalDR.physical} 魔${
                              Templates[u.cls].finalDR.magical
                            }`}
                          >
                            BLK: <b>{Math.round(getStat(u, "BLK") * 100)}%</b>
                          </div>
                          <div
                            className="text-[11px] px-2 py-1 rounded-full bg-slate-100 border border-slate-300"
                            title={passiveTooltip(Templates[u.cls].passive)}
                          >
                            被動：{Templates[u.cls].passive.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-xl border shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">回合順序</div>
                  <div className="text-xs text-slate-500">
                    （每回合依 rSPD 重算）
                  </div>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {gs.turnOrder.map((id, idx) => {
                    const u = gs.units.find((x) => x.id === id);
                    if (!u) return null;
                    const cur = idx === gs.turnIndex;
                    const r = gs.rSPD[id] ?? u.base.SPD;
                    return (
                      <div
                        key={id}
                        className={`px-2 py-1 rounded-full text-xs border ${
                          cur
                            ? "bg-yellow-200 border-yellow-400"
                            : "bg-slate-100 border-slate-300"
                        }`}
                      >
                        {u.id} (r{r})
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${gs.width}, 2.5rem)` }}
              >
                {Array.from({ length: gs.height }).map((_, row) =>
                  Array.from({ length: gs.width }).map((_, col) => {
                    const highlighted =
                      gs.phase === "select-move" &&
                      moveTiles.some((t) => t.x === col && t.y === row);
                    const danger =
                      gs.phase === "select-target" &&
                      targetTiles.some((t) => t.x === col && t.y === row);
                    return (
                      <Tile
                        key={`${col},${row}`}
                        gs={gs}
                        x={col}
                        y={row}
                        highlighted={highlighted}
                        danger={danger}
                        onClick={() => onTileClick(col, row)}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div className="w-96 space-y-3">
              {me &&
                (gs.mode === "PvP" || me.team === "A") &&
                isTeamAlive(gs, "A") &&
                isTeamAlive(gs, "B") && (
                  <div className="p-3 rounded-xl border shadow-sm">
                    <div className="font-semibold">
                      目前行動：{me.id}（{me.team}）
                    </div>
                    <div className="text-xs text-slate-500">
                      位置：({me.x + 1},{me.y + 1})；可移動：
                      {Math.floor(getStat(me, "MOV"))} 格
                    </div>
                    <div className="mt-2">
                      {(() => {
                        const u = me!;
                        const basic = u.skills.find((s) => s.isBasic)!;
                        const actives = u.skills.filter((s) => !s.isBasic);
                        const canAct = !u.actedThisTurn;
                        const canMove = !u.movedThisTurn;
                        return (
                          <div className="flex gap-2 flex-wrap">
                            <button
                              className="px-3 py-1 rounded bg-slate-800 text-white"
                              onClick={() => {
                                gs.phase = "select-action";
                                gs.selectedUnitId = u.id;
                                gs.selectedSkillId = undefined;
                                setGs({ ...gs });
                              }}
                              title={skillTooltip(basic)}
                            >
                              選中
                            </button>
                            <button
                              disabled={!canMove}
                              className={`px-3 py-1 rounded ${
                                canMove
                                  ? "bg-emerald-600 text-white"
                                  : "bg-slate-300 text-slate-500"
                              }`}
                              onClick={() => {
                                gs.phase = "select-move";
                                gs.selectedUnitId = u.id;
                                gs.selectedSkillId = undefined;
                                setGs({ ...gs });
                              }}
                              title={`移動 ${Math.floor(getStat(u, "MOV"))} 格`}
                            >
                              移動 ({Math.floor(getStat(u, "MOV"))})
                            </button>
                            <button
                              disabled={!canAct}
                              className={`px-3 py-1 rounded ${
                                canAct
                                  ? "bg-indigo-600 text-white"
                                  : "bg-slate-300 text-slate-500"
                              }`}
                              onClick={() => {
                                gs.phase = "select-target";
                                gs.selectedUnitId = u.id;
                                gs.selectedSkillId = "basic";
                                setGs({ ...gs });
                              }}
                              title={skillTooltip(basic)}
                            >
                              {basic.name}（0 MP / 直線{basic.rangeFront}）
                            </button>
                            {actives.map((sk) => {
                              const areaLabel =
                                sk.area.kind === "Line"
                                  ? `直線${sk.rangeFront}`
                                  : sk.area.kind === "Rect"
                                  ? `矩形${(sk.area as any).rectW}×${
                                      (sk.area as any).rectD
                                    }`
                                  : `自身範圍${sk.rangeFront}`;
                              return (
                                <button
                                  key={sk.id}
                                  disabled={!canAct || u.mp < sk.mpCost}
                                  className={`px-3 py-1 rounded ${
                                    canAct && u.mp >= sk.mpCost
                                      ? "bg-purple-600 text-white"
                                      : "bg-slate-300 text-slate-500"
                                  }`}
                                  onClick={() => {
                                    gs.phase = "select-target";
                                    gs.selectedUnitId = u.id;
                                    gs.selectedSkillId = sk.id;
                                    setGs({ ...gs });
                                  }}
                                  title={skillTooltip(sk)} // <<-- NEW: tooltip
                                >
                                  {sk.name}（{sk.mpCost} MP / {areaLabel}）
                                </button>
                              );
                            })}
                            <button
                              className="px-3 py-1 rounded bg-slate-200"
                              onClick={() => {
                                endTurn(gs);
                                setGs({ ...gs });
                              }}
                            >
                              結束回合
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

              <div className="p-3 rounded-xl border shadow-sm">
                <div className="font-semibold">戰鬥記錄</div>
                <div className="mt-2 h-48 overflow-auto text-sm space-y-1">
                  <div className="text-slate-700">
                    {logs.map((l, i) => (
                      <div key={i} className="text-slate-700">
                        • {l}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl border shadow-sm">
                <div className="font-semibold">自動測試</div>
                <div className="mt-2 h-48 overflow-auto text-xs space-y-1">
                  {testResults.map((t, i) => (
                    <div
                      key={i}
                      className={
                        t.startsWith("PASS")
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              {!aAlive || !bAlive ? (
                <div className="p-3 rounded-xl border shadow-sm text-center text-lg font-bold">
                  {aAlive ? "A 隊勝利！" : bAlive ? "B 隊勝利！" : "平局？"}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// helper for passive tooltip re-used in this file
function passiveTooltip(p: any): string {
  const parts: string[] = [];
  if (p.baseAdd)
    for (const [k, v] of Object.entries(p.baseAdd))
      parts.push(
        `${k}+${
          k === "CR" || k === "BLK" ? Math.round((v as number) * 100) + "%" : v
        }`
      );
  if (p.baseMul)
    for (const [k, v] of Object.entries(p.baseMul)) parts.push(`${k}×${v}`);
  if (p.postDR) {
    if (p.postDR.physical != null) parts.push(`最終物減×${p.postDR.physical}`);
    if (p.postDR.magical != null) parts.push(`最終魔減×${p.postDR.magical}`);
  }
  return parts.length ? parts.join("；") : "—";
}

// getStat is used above in UI; import it dynamically to avoid cyc deps
import { getStat } from "./modules/engine";
