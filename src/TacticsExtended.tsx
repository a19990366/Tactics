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
import { initLog, logs } from "./modules/logs";

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
  // hover / preview focus tile for target direction
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  // ------------------------------------------------------

  const me = currentUnit(gs);
  const isPlayerControlled = gs.mode === "PvP" || (me && me.team === "A");
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
    // 如果有 hoverTile 就用它決定方向，沒有則回空（你也可以改為 union 預覽）
    return getAreaTiles(gs, selected, selectedSkill, hoverTile ?? null);
  }, [gs, selected, selectedSkill, hoverTile]);

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
    initLog();
    const s = initGameWithRosters(mode, p1, p2);
    setLastRoster({ p1, p2 });
    setGs(s);
    setInSetup(false);
  };
  const reset = (modeNext: "PvE" | "PvP") => {
    setGs(initGameWithRosters(modeNext, lastRoster.p1, lastRoster.p2));
    initLog();
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
      // 以 click 決定方向/範圍
      const tiles = getAreaTiles(gs, selected, selectedSkill, { x, y });
      const okTile =
        tiles.some((t) => t.x === x && t.y === y) ||
        selectedSkill.area.kind === "SelfArea"; // self area 不需方向
      if (!okTile) return;
    
      if (selected.actedThisTurn) return;
      if (selected.mp < selectedSkill.mpCost) return;
    
      // 找出點到的單位（若有）
      const clickedUnit = gs.units.find((uu) => uu.alive && uu.x === x && uu.y === y);
    
      // 如果是 single-target 且 clickedUnit 存在 -> 將左邊常駐選中切換到該單位（UI 顯示）
      if (selectedSkill.targetGroup === "single") {
        if (clickedUnit) {
          gs.selectedUnitId = clickedUnit.id;
        } else {
          // single-target but clicked empty => 不施放
          return;
        }
      } else {
        // group-target: 不需要點在單位上，點空地也會對整塊施放（按你的需求）
        // 我們不改變 selectedUnitId（保留原選取），或你可以把選取切換成 caster
      }
    
      // 收集 targets（collectTargets 會用 clicked 作為 direction）
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

  function skillTooltip(sk: any): string {
    if (!sk) return "";
  
    // 輔助：敵我/範圍/單體 語句
    const targetMap: Record<string, string> = {
      enemy: "敵方",
      ally: "我方",
      both: "雙方",
    };
    const groupMap: Record<string, string> = {
      single: "單體",
      group: "群體",
    };
  
    const tgtTeam = (sk.targetTeam && targetMap[sk.targetTeam]) || "目標";
    const tgtGroup = (sk.targetGroup && groupMap[sk.targetGroup]) || "範圍";
  
    const parts: string[] = [];
  
    // 1) 傷害描述（若有 multiplier 與 type）
    if (typeof sk.multiplier === "number" && sk.multiplier !== 0 && sk.type) {
      // type 可能為 "Physical" / "physical" / "MAGICAL" 等，做簡單判斷
      const t = String(sk.type).toLowerCase();
      const typeText = t.includes("phys") || t.includes("physical") ? "物理" : t.includes("mag") || t.includes("magic") ? "魔法" : "傷害";
      parts.push(`對 ${tgtTeam} ${tgtGroup} 造成 ${1+sk.multiplier} 倍 ${typeText} 傷害`);
    }
  
    // 2) 回復描述
    if (sk.effects) {
      if (sk.effects.healHP != null) {
        parts.push(`對 ${tgtTeam} ${tgtGroup} 回復 ${sk.effects.healHP} 點 HP`);
      }
      if (sk.effects.restoreMP != null) {
        parts.push(`對 ${tgtTeam} ${tgtGroup} 回復 ${sk.effects.restoreMP} 點 MP`);
      }
    }
  
    // 3) BUFF 描述（若有 applyBuff）
    if (sk.effects && sk.effects.applyBuff && sk.effects.applyBuff.buff) {
      const ab = sk.effects.applyBuff;
      const toMap: Record<string, string> = {
        self: "自身",
        area: "範圍內",
        unit: "單位",
      };
      const toText = toMap[ab.to] || String(ab.to);
  
      const buff = ab.buff as any;
      const buffParts: string[] = [];
  
      // add 欄位 (絕對值)
      if (buff.add) {
        for (const [k, v] of Object.entries(buff.add)) {
          // 數值格式化（若是百分比性質的屬性，通常會以小數表示，這裡只做通用顯示）
          const sign = (v as number) > 0 ? "+" : "";
          buffParts.push(`${k} ${sign}${v}`);
        }
      }
  
      // mul 欄位（倍率）
      if (buff.mul) {
        for (const [k, v] of Object.entries(buff.mul)) {
          const mul = Number(v);
          if (!Number.isFinite(mul)) continue;
          // 顯示形式：×1.2 (+20%)
          const pct = Math.round((mul - 1) * 10000) / 100; // 2位小數百分比
          const sign = pct > 0 ? "+" : "";
          buffParts.push(`${k} ×${Math.round(mul * 100) / 100} (${sign}${pct}%)`);
        }
      }
  
      if (buffParts.length) {
        parts.push(`對 ${tgtTeam} ${tgtGroup} ${toText} 施加 BUFF：${buffParts.join("，")}`);
      } else {
        // 若 buff 結構存在但沒有 add/mul 可顯示
        parts.push(`對 ${tgtTeam} ${tgtGroup} ${toText} 施加 BUFF`);
      }
    }
  
    // 若前面都沒描述（例如只有 desc），回傳 desc 或空字串
    if (parts.length === 0) {
      if (sk.desc) return String(sk.desc);
      return "";
    }
  
    // 若 sk.desc 存在，把它放在最前面作為說明
    if (sk.desc) parts.unshift(String(sk.desc));
  
    // 用中文分號分隔（也可以用換行 "\n"）
    return parts.join("\n");
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
                <div className="font-semibold mb-2">選中單位）</div>
                  {gs.selectedUnitId ? (() => {
                    const u = gs.units.find((x) => x.id === gs.selectedUnitId);
                    if (!u) return <div className="text-sm text-slate-500 p-2">目前選取的單位不在場上。</div>;

                    const atkB = u.base.ATK ?? 0, atkE = getStat(u, "ATK");
                    const defB = u.base.DEF ?? 0, defE = getStat(u, "DEF");
                    const matkB = u.base.MATK ?? 0, matkE = getStat(u, "MATK");
                    const mdefB = u.base.MDEF ?? 0, mdefE = getStat(u, "MDEF");
                    const crB = u.base.CR, crE = getStat(u, "CR");
                    const blkB = u.base.BLK, blkE = getStat(u, "BLK");
                    const accB = u.base.ACC, accE = getStat(u, "ACC");
                    const evaB = u.base.EVA, evaE = getStat(u, "EVA");
                    const spdB = u.base.SPD, spdE = getStat(u, "SPD");
                    const movB = u.base.MOV, movE = getStat(u, "MOV");

                    // active skills from unit (exclude basic)
                    const activeSkills = (u.skills || []).filter((s) => !s.isBasic);

                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          gs.selectedUnitId = u.id;
                          gs.selectedSkillId = undefined;
                          setGs({ ...gs });
                        }}
                        className={`p-2 rounded-lg border ${u.alive ? "" : "opacity-50"}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">
                            {u.id} <span className="text-xs text-slate-500">[{u.cls}]</span>
                          </div>
                          <div className="flex gap-2">
                            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-300">
                              HP: <b>{u.hp}/{u.maxHP}</b>
                            </div>
                            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-300">
                              MP: <b>{u.mp}/{u.maxMP}</b>
                            </div>
                          </div>
                        </div>

                        <div className="mt-1 flex gap-2 flex-wrap text-[11px]">
                          <StatPillDiff label="攻擊" base={atkB} eff={atkE} />
                          <StatPillDiff label="防禦" base={defB} eff={defE} />
                          <StatPillDiff label="魔攻" base={matkB} eff={matkE} />
                          <StatPillDiff label="魔防" base={mdefB} eff={mdefE} />
                          <StatPillDiff label="暴率" base={crB} eff={crE} suffix="%" />
                          <StatPillDiff label="格擋" base={blkB} eff={blkE} suffix="%" />
                          <StatPillDiff label="命中" base={accB} eff={accE} />
                          <StatPillDiff label="迴避" base={evaB} eff={evaE} />
                          <StatPillDiff label="速度" base={spdB} eff={spdE} />
                          <StatPillDiff label="移動" base={movB} eff={movE} />

                          {/* 被動 與 主動技能區塊 */}
                          <div
                            className="text-[11px] px-2 py-1 rounded-full bg-slate-100 border border-slate-300"
                            title={passiveTooltip(Templates[u.cls].passive)}
                          >
                            被動：{Templates[u.cls].passive.name}
                          </div>

                          {/* 將主動技能列在被動後面（每個技能為小 badge，hover 顯示 tooltip） */}
                          {activeSkills.map((sk) => (
                            <div
                              key={sk.id}
                              className="text-[11px] px-2 py-1 rounded-full bg-amber-50 border border-amber-200 cursor-help"
                              title={skillTooltip(sk)}
                            >
                              {sk.name}{sk.mpCost ? ` (${sk.mpCost}MP)` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="text-sm text-slate-500 p-2">尚未選取單位。</div>
                  )}
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
                      <div
                        key={`${col},${row}`}
                        onMouseEnter={() => {
                          if (gs.phase === "select-target" && selected && selectedSkill) {
                            setHoverTile({ x: col, y: row });
                          }
                        }}
                        onMouseLeave={() => {
                          if (gs.phase === "select-target") setHoverTile(null);
                        }}
                      >
                        <Tile
                          gs={gs}
                          x={col}
                          y={row}
                          highlighted={highlighted}
                          danger={danger}
                          onClick={() => onTileClick(col, row)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="w-96 space-y-3">
              {me && isTeamAlive(gs, "A") && isTeamAlive(gs, "B") && (
                <div className="p-3 rounded-xl border shadow-sm">
                  <div className="font-semibold">目前行動：{me.id}（{me.team}）</div>
                  <div className="text-xs text-slate-500">
                    位置：({me.x + 1},{me.y + 1})；可移動：{Math.floor(getStat(me, "MOV"))} 格
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
                          {isPlayerControlled ? (
                            <>
                              <button
                                className="px-3 py-1 rounded bg-slate-800 text-white"
                                onClick={() => {
                                  gs.phase = "select-action";
                                  gs.selectedUnitId = u.id;
                                  gs.selectedSkillId = undefined;
                                  setGs({ ...gs });
                                }}
                                title={u.id}
                              >
                                選中
                              </button>
                              <button
                                disabled={!canMove}
                                className={`px-3 py-1 rounded ${
                                  canMove ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-500"
                                }`}
                                onClick={() => {
                                  gs.phase = "select-move";
                                  gs.selectedUnitId = u.id;
                                  gs.selectedSkillId = undefined;
                                  setGs({ ...gs });
                                }}
                              >
                                移動 ({Math.floor(getStat(u, "MOV"))})
                              </button>

                              <button
                                disabled={!canAct}
                                className={`px-3 py-1 rounded ${
                                  canAct ? "bg-indigo-600 text-white" : "bg-slate-300 text-slate-500"
                                }`}
                                onClick={() => {
                                  gs.phase = "select-target";
                                  gs.selectedUnitId = u.id;
                                  gs.selectedSkillId = "basic";
                                  setGs({ ...gs });
                                }}
                              >
                                {basic.name}（0 MP / 直線{basic.rangeFront}）
                              </button>

                              {actives.map((sk) => {
                                const areaLabel =
                                  sk.area.kind === "Line"
                                    ? `直線${sk.rangeFront}`
                                    : sk.area.kind === "Rect"
                                    ? `矩形${(sk.area as any).rectW}×${(sk.area as any).rectD}`
                                    : `自身範圍${sk.rangeFront}`;
                                return (
                                  <button
                                    key={sk.id}
                                    disabled={!canAct || u.mp < sk.mpCost}
                                    className={`px-3 py-1 rounded ${
                                      canAct && u.mp >= sk.mpCost ? "bg-purple-600 text-white" : "bg-slate-300 text-slate-500"
                                    }`}
                                    onClick={() => {
                                      gs.phase = "select-target";
                                      gs.selectedUnitId = u.id;
                                      gs.selectedSkillId = sk.id;
                                      setGs({ ...gs });
                                    }}
                                    title={skillTooltip(sk)}
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
                            </>
                          ) : (
                            // 非玩家控制（AI）：顯示說明文字，但不顯示操作按鈕
                            <div className="px-3 py-1 rounded bg-slate-100 text-slate-600">
                              AI 控制中...
                            </div>
                          )}
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

// getStat is used above in UI; import it dynamically to avoid cyc deps
import { getStat } from "./modules/engine";
