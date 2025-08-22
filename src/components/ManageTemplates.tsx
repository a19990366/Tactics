import React, { useEffect, useMemo, useState } from "react";
import { Templates as DefaultTemplates } from "../modules/templates";
import type { UnitTemplate, Skill } from "../modules/types";

// deep clone helper
const clone = <T,>(v: T) => JSON.parse(JSON.stringify(v)) as T;

const ATTRS: (keyof UnitTemplate)[] = [
  "maxHP",
  "maxMP",
  "ATK",
  "DEF",
  "MATK",
  "MDEF",
  "ACC",
  "EVA",
  "CR",
  "SPD",
  "MOV",
  "BLK",
];

const ATTR_LABEL: Record<string, string> = {
  maxHP: "血量",
  maxMP: "魔力",
  ATK: "攻擊",
  DEF: "防禦",
  MATK: "魔攻",
  MDEF: "魔防",
  ACC: "命中",
  EVA: "迴避",
  CR: "暴率",
  SPD: "速度",
  MOV: "移動",
  BLK: "格擋",
};

function statLabel(k: string) {
  const map: Record<string, string> = {
    ATK: "攻擊",
    DEF: "防禦",
    MATK: "魔攻",
    MDEF: "魔防",
    ACC: "命中",
    EVA: "迴避",
    CR: "暴率",
    SPD: "速度",
    MOV: "移動",
    BLK: "格擋",
    mpRegen: "MP回復",
    postDMG: "最終傷害",
  };
  return map[k] ?? k;
}

function generateUnique(base = "NewClass", existing: Record<string, any>) {
  let i = 1;
  let key = `${base}${i}`;
  while (existing[key]) {
    i++;
    key = `${base}${i}`;
  }
  return key;
}

function getDefaultTemplate(clsKey: string) {
  // 產生一個最小可用的 UnitTemplate（你可以按需求調整數值）
  const tpl: any = {
    cls: clsKey,
    displayName: clsKey,
    maxHP: 1,
    maxMP: 1,
    ATK: 0,
    DEF: 0,
    MATK: 0,
    MDEF: 0,
    ACC: 0,
    EVA: 0,
    CR: 0,
    SPD: 0,
    MOV: 0,
    BLK: 0,
    passive: { name: "被動名稱", baseAdd: {}, baseMul: {}, postDR: {} },
    skills: [
      {
        id: "basic",
        name: "普通攻擊",
        type: "Physical",
        multiplier: 0,
        mpCost: 0,
        rangeFront: 1,
        isBasic: true,
        area: { kind: "Line" },
        targetGroup: "single",
        targetTeam: "enemy",
      },
    ],
    finalDR: { physical: 1, magical: 1 },
  };
  return tpl as UnitTemplate; // 若 TS 抱怨可改為 `as any`
}

function passiveSummary(p: any) {
  if (!p) return "—";
  const parts: string[] = [];
  if (p.baseAdd) {
    for (const [k, v] of Object.entries(p.baseAdd)) {
      const pretty = statLabel(k);
      const formatted =
        k === "CR" || k === "BLK"
          ? `${Math.round((v as number) * 100)}%`
          : `${v}`;
      parts.push(`${pretty}${(v as number) > 0 ? "+" : ""}${formatted}`);
    }
  }
  if (p.baseMul) {
    for (const [k, v] of Object.entries(p.baseMul)) {
      const pretty = statLabel(k);
      const pct = Math.round(((v as number) - 1) * 10000) / 100;
      parts.push(`${pretty}${pct > 0 ? "+" : ""}${pct}%`);
    }
  }
  if (p.postDR) {
    if (p.postDR.physical != null) parts.push(`最終物減×${p.postDR.physical}`);
    if (p.postDR.magical != null) parts.push(`最終魔減×${p.postDR.magical}`);
  }
  return parts.length ? parts.join("；") : "—";
}

export function ManageTemplates({ onClose }: { onClose?: () => void }) {
  // clone default templates into editable local state
  const [templates, setTemplates] = useState<Record<string, UnitTemplate>>(() =>
    clone(DefaultTemplates as any)
  );

  const classes = useMemo(() => Object.keys(templates), [templates]);
  const [selectedClass, setSelectedClass] = useState<string>(classes[0] ?? "");
  const [showRawJSON, setShowRawJSON] = useState(false);

  // effectsText: preview (from templates)
  const [effectsText, setEffectsText] = useState<Record<string, string>>({});

  // drafts: user edits for effects (not yet committed)
  const [effectsDrafts, setEffectsDrafts] = useState<Record<string, any>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const cls of Object.keys(templates)) {
      const tpl = templates[cls];
      tpl.skills.forEach((sk: any, idx: number) => {
        const key = `${cls}-${idx}`;
        next[key] = JSON.stringify(sk.effects ?? {}, null, 2);
      });
    }
    setEffectsText(next);
  }, [templates]);

  useEffect(() => {
    // initialize drafts for selectedClass if missing
    if (!selectedClass) return;
    const tpl = templates[selectedClass];
    if (!tpl) return;
    setEffectsDrafts((prev) => {
      const copy = { ...prev };
      tpl.skills.forEach((sk: any, idx: number) => {
        const key = `${selectedClass}-${idx}`;
        if (copy[key] == null) {
          copy[key] = clone(sk.effects ?? { healHP: 0, restoreMP: 0 });
        }
      });
      return copy;
    });
  }, [selectedClass, templates[selectedClass]?.skills?.length]);

  // helpers
  function ensurePassiveStructure(copy: Record<string, any>, sc: string) {
    copy[sc].passive = copy[sc].passive ?? {};
    copy[sc].passive.baseAdd = copy[sc].passive.baseAdd ?? {};
    copy[sc].passive.baseMul = copy[sc].passive.baseMul ?? {};
    copy[sc].passive.postDR = copy[sc].passive.postDR ?? {};
  }

  function updateField(cls: string, key: keyof UnitTemplate, value: any) {
    setTemplates((prev) => {
      const copy = clone(prev);
      (copy[cls] as any)[key] = value;
      return copy;
    });
  }

  function updatePassiveName(cls: string, name: string) {
    setTemplates((prev) => {
      const copy = clone(prev);
      copy[cls].passive = copy[cls].passive ?? {};
      copy[cls].passive.name = name;
      return copy;
    });
  }

  function addSkill(cls: string) {
    setTemplates((prev) => {
      const copy = clone(prev);
      const newSkill: any = {
        id: `${cls}_skill_${Date.now()}`,
        name: "新技能",
        type: "Physical",
        multiplier: 0,
        mpCost: 0,
        rangeFront: 1,
        area: { kind: "Line" },
        targetGroup: "single",
        targetTeam: "enemy",
      };
      copy[cls].skills.push(newSkill);
      return copy;
    });
  }

  function removeSkill(cls: string, idx: number) {
    setTemplates((prev) => {
      const copy = clone(prev);
      if (!copy[cls] || !copy[cls].skills) return prev;
      copy[cls].skills.splice(idx, 1);
      return copy;
    });
    // cleanup drafts & preview
    setEffectsDrafts((prev) => {
      const next = { ...prev };
      delete next[`${cls}-${idx}`];
      return next;
    });
    setEffectsText((prev) => {
      const next = { ...prev };
      delete next[`${cls}-${idx}`];
      return next;
    });
  }

  function updateSkill(cls: string, idx: number, patch: Partial<Skill | any>) {
    setTemplates((prev) => {
      const copy = clone(prev);
      if (!copy[cls] || !copy[cls].skills || !copy[cls].skills[idx])
        return prev;
      copy[cls].skills[idx] = {
        ...(copy[cls].skills[idx] as any),
        ...(patch as any),
      };
      return copy;
    });
  }

  function initDraftIfMissing(mapKey: string, base?: any) {
    setEffectsDrafts((prev) => {
      if (prev[mapKey] != null) return prev;
      const copy = { ...prev };
      copy[mapKey] = clone(base ?? { healHP: 0, restoreMP: 0 });
      return copy;
    });
  }

  function setDraftValue(mapKey: string, path: string, val: any) {
    setEffectsDrafts((prev) => {
      const copy = { ...prev };
      copy[mapKey] = copy[mapKey] ?? {};
      const parts = path.split(".");
      let cur: any = copy[mapKey];
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cur[p] == null) cur[p] = {};
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = val;
      return copy;
    });
  }

  function deleteDraft(mapKey: string) {
    setEffectsDrafts((prev) => {
      const copy = { ...prev };
      delete copy[mapKey];
      return copy;
    });
  }

  function commitDraft(mapKey: string) {
    const [cls, idxStr] = mapKey.split("-");
    const idx = Number(idxStr);
    const draft = effectsDrafts[mapKey] ?? {};

    // 深拷貝一份草稿，然後清理不想寫入的欄位
    const cleaned: Record<string, any> = JSON.parse(JSON.stringify(draft));

    // 如果 healHP 為 0 / null / undefined / ""，就移除它
    if (cleaned.healHP == null || Number(cleaned.healHP) === 0) {
      delete cleaned.healHP;
    }
    // 同理處理 restoreMP
    if (cleaned.restoreMP == null || Number(cleaned.restoreMP) === 0) {
      delete cleaned.restoreMP;
    }

    // 如果經清理後物件沒有任何欄位，就把 effects 移除；否則寫入 cleaned
    setTemplates((prev) => {
      const copy = clone(prev);
      if (!copy[cls] || !copy[cls].skills || !copy[cls].skills[idx])
        return prev;

      if (Object.keys(cleaned).length === 0) {
        // 移除 effects 屬性，以免留下空物件
        delete (copy[cls].skills[idx] as any).effects;
      } else {
        (copy[cls].skills[idx] as any).effects = cleaned;
      }
      return copy;
    });

    // 更新預覽文字（使用 cleaned）
    setEffectsText((prev) => ({
      ...prev,
      [mapKey]: JSON.stringify(cleaned ?? {}, null, 2),
    }));
  }

  function deleteAllEffectsFromSkill(mapKey: string) {
    const [cls, idxStr] = mapKey.split("-");
    const idx = Number(idxStr);
    setTemplates((prev) => {
      const copy = clone(prev);
      if (copy[cls] && copy[cls].skills && copy[cls].skills[idx]) {
        delete copy[cls].skills[idx].effects;
      }
      return copy;
    });
    setEffectsDrafts((prev) => {
      const next = { ...prev };
      delete next[mapKey];
      return next;
    });
    setEffectsText((prev) => {
      const next = { ...prev };
      next[mapKey] = JSON.stringify({}, null, 2);
      return next;
    });
  }

  function enableApplyBuffInDraft(mapKey: string) {
    initDraftIfMissing(mapKey);
    setEffectsDrafts((prev) => {
      const copy = { ...prev };
      copy[mapKey] = copy[mapKey] ?? {};
      copy[mapKey].applyBuff = copy[mapKey].applyBuff ?? {
        to: "unit",
        buff: { name: "新Buff", turns: 1, add: {}, mul: {} },
      };
      return copy;
    });
  }

  function disableApplyBuffInDraft(mapKey: string) {
    setEffectsDrafts((prev) => {
      const copy = { ...prev };
      if (!copy[mapKey]) return copy;
      delete copy[mapKey].applyBuff;
      return copy;
    });
  }

  const copyRawToClipboard = async () => {
    try {
      const json = JSON.stringify(templates, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        alert("已複製 JSON 到剪貼簿。");
      } else {
        setShowRawJSON(true);
        alert("剪貼簿 API 不可用，請手動複製下方 JSON。");
      }
    } catch (e) {
      setShowRawJSON(true);
      alert("複製失敗，請手動複製下方 JSON。");
    }
  };

  function addClass() {
    // 請使用當前 templates 作為現有檢查
    const existing = templates;
    let key = window.prompt(
      "輸入新職業的 key（英文、無空格），留空由系統產生："
    );
    if (key === null) return; // 使用者取消
    key = key.trim();
    const finalKey = key === "" ? generateUnique("NewClass", existing) : key;
    if (existing[finalKey]) {
      window.alert(`職業 ${finalKey} 已存在，請換一個名稱。`);
      return;
    }

    const tpl = getDefaultTemplate(finalKey);

    setTemplates((prev) => {
      const copy = clone(prev);
      // 寫入新職業
      (copy as any)[finalKey] = tpl;
      return copy;
    });

    // 選中剛新增的職業並切換到該職業的編輯區
    setSelectedClass(finalKey);
  }

  function deleteClass(key: string) {
    if (!window.confirm(`確定要刪除職業 "${key}" 嗎？此動作無法復原。`)) return;
    setTemplates((prev) => {
      const copy = clone(prev);
      delete (copy as any)[key];
      return copy;
    });
    // 若刪除的是目前選中職業，清掉選取
    setSelectedClass((sc) => (sc === key ? "" : sc));
  }

  const selectedTpl = templates[selectedClass];

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold">職業總覽</h2>
        <div className="ml-auto flex gap-2">
          <button
            className="px-3 py-1 rounded bg-emerald-600 text-white"
            onClick={addClass}
          >
            新增職業
          </button>

          <button
            className="px-3 py-1 rounded bg-rose-500 text-white"
            onClick={() => selectedClass && deleteClass(selectedClass)}
            disabled={!selectedClass}
            title={selectedClass ? `刪除 ${selectedClass}` : "尚未選取職業"}
          >
            刪除職業
          </button>

          <button
            className="px-3 py-1 bg-slate-200 rounded"
            onClick={copyRawToClipboard}
          >
            複製 JSON（剪貼簿）
          </button>
        </div>
      </div>

      {/* 屬性表格 */}
      <div className="mb-6 overflow-auto border rounded">
        <table className="min-w-full table-auto text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th
                className="px-3 py-2 text-left sticky left-0 top-0 z-40 bg-slate-100"
                style={{ minWidth: 240 }}
              >
                職業
              </th>
              {ATTRS.map((a) => (
                <th
                  key={String(a)}
                  className="px-3 py-2 text-left sticky top-0 bg-slate-100"
                  style={{ minWidth: 60 }}
                >
                  {ATTR_LABEL[a as string] ?? String(a)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => {
              const tpl = templates[cls];
              return (
                <tr key={cls} className="border-t">
                  <td
                    className="px-3 py-2 sticky left-0 align-top bg-white z-30"
                    style={{ minWidth: 240 }}
                  >
                    <div className="font-medium">{tpl.displayName}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {passiveSummary(tpl.passive)}
                    </div>
                  </td>
                  {ATTRS.map((a) => (
                    <td key={String(a)} className="px-2 py-2 align-top">
                      <input
                        type="number"
                        value={Number((tpl as any)[a] ?? 0)}
                        onChange={(e) =>
                          updateField(cls, a, Number(e.target.value))
                        }
                        className="w-20 border rounded px-2 py-1 text-sm"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 技能編輯 */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm">選擇職業：</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value as any)}
            className="border rounded px-2 py-1"
          >
            {classes.map((c) => {
              // 優先從可編輯的 state templates 取；若不存在再 fallback 到 DefaultTemplates
              const tpl = (templates as any)[c] ?? (DefaultTemplates as any)[c];
              const label = tpl?.displayName ?? tpl?.cls ?? c;
              return (
                <option value={c} key={c}>
                  {label}
                </option>
              );
            })}
          </select>

          {selectedTpl && (
            <>
              <div className="ml-4 text-sm text-slate-600 flex items-center gap-3">
                <div>
                  顯示名稱：
                  <input
                    className="border rounded px-2 py-1 text-sm ml-2"
                    value={selectedTpl.displayName ?? ""}
                    onChange={(e) =>
                      updateField(selectedClass, "displayName", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="ml-4 text-sm text-slate-600 flex items-center gap-3">
                <div>
                  被動名稱：
                  <input
                    className="border rounded px-2 py-1 text-sm ml-2"
                    value={selectedTpl.passive?.name ?? ""}
                    onChange={(e) =>
                      updatePassiveName(selectedClass, e.target.value)
                    }
                  />
                </div>
              </div>

              <button
                className="ml-auto px-2 py-1 bg-amber-200 rounded"
                onClick={() => addSkill(selectedClass)}
              >
                新增技能
              </button>
            </>
          )}
        </div>

        {!selectedTpl ? (
          <div className="text-sm text-slate-500">
            尚未選擇職業或職業不存在。
          </div>
        ) : (
          <div className="space-y-3">
            {/* 被動編輯（簡易） */}
            <div className="p-3 border rounded bg-white">
              <div className="text-sm font-medium mb-2">被動</div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-600 mb-1">基礎加成</div>
                  <div className="space-y-2">
                    {selectedTpl.passive?.baseAdd &&
                      Object.entries(selectedTpl.passive.baseAdd).map(
                        ([k, v]: any) => (
                          <div key={k} className="flex gap-2 items-center">
                            <div className="w-24 text-xs">{statLabel(k)}</div>
                            <input
                              type="number"
                              className="border rounded px-2 py-1 w-28"
                              value={v as any}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setTemplates((prev) => {
                                  const copy = clone(prev);
                                  const sc = selectedClass!;
                                  ensurePassiveStructure(copy, sc);
                                  (copy[sc].passive.baseAdd as any)[k] = val;
                                  return copy;
                                });
                              }}
                            />
                            <button
                              className="px-2 py-1 bg-rose-200 rounded text-xs"
                              onClick={() => {
                                const kdel = k;
                                setTemplates((prev) => {
                                  const copy = clone(prev);
                                  const sc = selectedClass!;
                                  if (
                                    !copy[sc].passive ||
                                    !copy[sc].passive.baseAdd
                                  )
                                    return prev;
                                  delete (copy[sc].passive.baseAdd as any)[
                                    kdel
                                  ];
                                  return copy;
                                });
                              }}
                            >
                              刪除
                            </button>
                          </div>
                        )
                      )}
                    <div className="flex gap-2 mt-2">
                      <select
                        id="addKey"
                        className="border rounded px-2 py-1 text-sm"
                        defaultValue="ATK"
                      >
                        <option value="ATK">攻擊</option>
                        <option value="DEF">防禦</option>
                        <option value="MATK">魔攻</option>
                        <option value="MDEF">魔防</option>
                        <option value="CR">暴率</option>
                        <option value="BLK">格擋</option>
                        <option value="ACC">命中</option>
                        <option value="EVA">迴避</option>
                        <option value="SPD">速度</option>
                        <option value="MOV">移動</option>
                        <option value="mpRegen">MP回復</option>
                      </select>
                      <input
                        id="addVal"
                        defaultValue={0}
                        type="number"
                        className="border rounded px-2 py-1 w-20"
                      />
                      <button
                        className="px-2 py-1 bg-emerald-600 text-white rounded"
                        onClick={() => {
                          const sel = (
                            document.getElementById(
                              "addKey"
                            ) as HTMLSelectElement
                          ).value;
                          const val = Number(
                            (
                              document.getElementById(
                                "addVal"
                              ) as HTMLInputElement
                            ).value || 0
                          );
                          setTemplates((prev) => {
                            const copy = clone(prev);
                            const sc = selectedClass!;
                            ensurePassiveStructure(copy, sc);
                            (copy[sc].passive.baseAdd as any)[sel] = val;
                            return copy;
                          });
                        }}
                      >
                        新增
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-600 mb-1">倍率</div>
                  <div className="space-y-2">
                    {selectedTpl.passive?.baseMul &&
                      Object.entries(selectedTpl.passive.baseMul).map(
                        ([k, v]: any) => (
                          <div key={k} className="flex gap-2 items-center">
                            <div className="w-24 text-xs">{statLabel(k)}</div>
                            <input
                              type="number"
                              step="0.01"
                              className="border rounded px-2 py-1 w-28"
                              value={v as any}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setTemplates((prev) => {
                                  const copy = clone(prev);
                                  const sc = selectedClass!;
                                  ensurePassiveStructure(copy, sc);
                                  (copy[sc].passive.baseMul as any)[k] = val;
                                  return copy;
                                });
                              }}
                            />
                            <button
                              className="px-2 py-1 bg-rose-200 rounded text-xs"
                              onClick={() => {
                                const kdel = k;
                                setTemplates((prev) => {
                                  const copy = clone(prev);
                                  const sc = selectedClass!;
                                  if (
                                    !copy[sc].passive ||
                                    !copy[sc].passive.baseMul
                                  )
                                    return prev;
                                  delete (copy[sc].passive.baseMul as any)[
                                    kdel
                                  ];
                                  return copy;
                                });
                              }}
                            >
                              刪除
                            </button>
                          </div>
                        )
                      )}
                    <div className="flex gap-2 mt-2">
                      <select
                        id="mulKey"
                        className="border rounded px-2 py-1 text-sm"
                        defaultValue="ATK"
                      >
                        <option value="ATK">攻擊</option>
                        <option value="DEF">防禦</option>
                        <option value="MATK">魔攻</option>
                        <option value="MDEF">魔防</option>
                        <option value="ACC">命中</option>
                        <option value="EVA">迴避</option>
                        <option value="SPD">速度</option>
                      </select>
                      <input
                        id="mulVal"
                        defaultValue={1.1}
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 w-20"
                      />
                      <button
                        className="px-2 py-1 bg-emerald-600 text-white rounded"
                        onClick={() => {
                          const sel = (
                            document.getElementById(
                              "mulKey"
                            ) as HTMLSelectElement
                          ).value;
                          const val = Number(
                            (
                              document.getElementById(
                                "mulVal"
                              ) as HTMLInputElement
                            ).value || 1
                          );
                          setTemplates((prev) => {
                            const copy = clone(prev);
                            const sc = selectedClass!;
                            ensurePassiveStructure(copy, sc);
                            (copy[sc].passive.baseMul as any)[sel] = val;
                            return copy;
                          });
                        }}
                      >
                        新增
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-600 mb-1">
                    最終傷害減免
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <div className="w-24 text-xs">物理</div>
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 w-28"
                        value={
                          (selectedTpl.passive?.postDR?.physical ?? "") as any
                        }
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTemplates((prev) => {
                            const copy = clone(prev);
                            const sc = selectedClass!;
                            ensurePassiveStructure(copy, sc);
                            // TS 仍可能認為 postDR 可為 undefined — 使用 as any 以告訴編譯器我們已初始化
                            (copy[sc].passive.postDR as any).physical = val;
                            return copy;
                          });
                        }}
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="w-24 text-xs">魔法</div>
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 w-28"
                        value={
                          (selectedTpl.passive?.postDR?.magical ?? "") as any
                        }
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTemplates((prev) => {
                            const copy = clone(prev);
                            const sc = selectedClass!;
                            ensurePassiveStructure(copy, sc);
                            // 同上
                            (copy[sc].passive.postDR as any).magical = val;
                            return copy;
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* skills */}
            {selectedTpl.skills.map((sk: any, idx: number) => {
              const mapKey = `${selectedClass}-${idx}`;
              const draft = effectsDrafts[mapKey] ?? {};
              return (
                <div
                  key={`${selectedClass}-skill-${idx}`}
                  className="p-3 border rounded bg-white"
                >
                  <div className="flex gap-2 items-start">
                    <div className="w-48">
                      <div className="text-xs text-slate-600">id</div>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={sk.id}
                        onChange={(e) =>
                          updateSkill(selectedClass, idx, {
                            id: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="w-48">
                      <div className="text-xs text-slate-600">name</div>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={sk.name}
                        onChange={(e) =>
                          updateSkill(selectedClass, idx, {
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="w-28">
                      <div className="text-xs text-slate-600">type</div>
                      <select
                        value={sk.type as any}
                        onChange={(e) =>
                          updateSkill(selectedClass, idx, {
                            type: e.target.value,
                          })
                        }
                        className="border rounded px-2 py-1 w-full"
                      >
                        <option value="Physical">Physical</option>
                        <option value="Magical">Magical</option>
                      </select>
                    </div>

                    <div className="ml-auto flex gap-2">
                      <button
                        className="px-2 py-1 bg-rose-200 rounded"
                        onClick={() => removeSkill(selectedClass, idx)}
                      >
                        刪除
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-6 gap-2">
                    <label className="text-xs">
                      <div className="text-xs text-slate-600">倍率加成</div>
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 w-full"
                        value={sk.multiplier as any}
                        onChange={(e) =>
                          updateSkill(selectedClass, idx, {
                            multiplier: Number(e.target.value),
                          })
                        }
                      />
                    </label>

                    <label className="text-xs">
                      <div className="text-xs text-slate-600">MP</div>
                      <input
                        type="number"
                        className="border rounded px-2 py-1 w-full"
                        value={sk.mpCost as any}
                        onChange={(e) =>
                          updateSkill(selectedClass, idx, {
                            mpCost: Number(e.target.value),
                          })
                        }
                      />
                    </label>

                    <div className="text-xs">
                      <div className="text-xs text-slate-600">範圍類型</div>
                      <select
                        value={(sk.area?.kind as string) ?? "Line"}
                        onChange={(e) => {
                          const newKind = e.target.value;
                          if (newKind === "Rect") {
                            // 確保 rectW/rectD 有預設值
                            updateSkill(selectedClass, idx, {
                              area: {
                                kind: "Rect",
                                rectW: (sk.area as any)?.rectW ?? 0,
                                rectD: (sk.area as any)?.rectD ?? 0,
                              },
                            });
                          } else {
                            // Line 或 SelfArea：不需要 rectW/rectD
                            updateSkill(selectedClass, idx, {
                              area: { kind: newKind },
                            });
                          }
                        }}
                        className="border rounded px-2 py-1 w-full"
                      >
                        <option value="Line">直線</option>
                        <option value="Rect">矩形</option>
                        <option value="SelfArea">自身範圍</option>
                      </select>
                    </div>

                    {/* 根據 area.kind 顯示不同欄位 */}
                    {((sk.area?.kind as string) ?? "Line") === "Rect" ? (
                      <>
                        <label className="text-xs">
                          <div className="text-xs text-slate-600">
                            寬 (rectW)
                          </div>
                          <input
                            type="number"
                            className="border rounded px-2 py-1 w-full"
                            value={((sk.area as any)?.rectW ?? 0) as any}
                            onChange={(e) =>
                              updateSkill(selectedClass, idx, {
                                area: {
                                  ...(sk.area ?? {}),
                                  rectW: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="text-xs">
                          <div className="text-xs text-slate-600">
                            長 (rectD)
                          </div>
                          <input
                            type="number"
                            className="border rounded px-2 py-1 w-full"
                            value={((sk.area as any)?.rectD ?? 0) as any}
                            onChange={(e) =>
                              updateSkill(selectedClass, idx, {
                                area: {
                                  ...(sk.area ?? {}),
                                  rectD: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <label className="text-xs">
                        <div className="text-xs text-slate-600">格數</div>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-full"
                          value={(sk.rangeFront ?? 0) as any}
                          onChange={(e) =>
                            updateSkill(selectedClass, idx, {
                              rangeFront: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    )}

                    <label className="text-xs">
                      <div className="text-xs text-slate-600">目標數</div>
                      <select
                        value={(sk as any).targetGroup ?? "single"}
                        onChange={(e) =>
                          updateSkill(selectedClass, idx, {
                            targetGroup: e.target.value,
                          })
                        }
                        className="border rounded px-2 py-1 w-full"
                      >
                        <option value="single">單體</option>
                        <option value="group">群體</option>
                      </select>
                    </label>

                    <label className="text-xs">
                      <div className="text-xs text-slate-600">目標類型</div>
                      <select
                        value={(sk as any).targetTeam ?? "enemy"}
                        onChange={(e) =>
                          updateSkill(selectedClass, idx, {
                            targetTeam: e.target.value,
                          })
                        }
                        className="border rounded px-2 py-1 w-full"
                      >
                        <option value="enemy">敵方</option>
                        <option value="ally">我方</option>
                        <option value="both">雙方</option>
                      </select>
                    </label>
                  </div>

                  {/* Effects（draft） */}
                  <div className="mt-3 border-t pt-3">
                    <div className="text-sm font-medium">效果</div>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div>
                        <div className="text-xs text-slate-600">
                          回復 HP / MP
                        </div>
                        <div className="flex gap-2 items-center mt-2">
                          <div className="w-20 text-xs">回復 HP</div>
                          <input
                            type="number"
                            className="border rounded px-2 py-1 w-28"
                            value={draft?.healHP ?? 0}
                            onChange={(e) => {
                              initDraftIfMissing(mapKey, sk.effects);
                              setDraftValue(
                                mapKey,
                                "healHP",
                                Number(e.target.value)
                              );
                            }}
                          />
                        </div>
                        <div className="flex gap-2 items-center mt-2">
                          <div className="w-20 text-xs">回復 MP</div>
                          <input
                            type="number"
                            className="border rounded px-2 py-1 w-28"
                            value={draft?.restoreMP ?? 0}
                            onChange={(e) => {
                              initDraftIfMissing(mapKey, sk.effects);
                              setDraftValue(
                                mapKey,
                                "restoreMP",
                                Number(e.target.value)
                              );
                            }}
                          />
                        </div>

                        <div className="flex gap-2 mt-3">
                          <button
                            className="px-2 py-1 bg-emerald-600 text-white rounded text-sm"
                            onClick={() => {
                              initDraftIfMissing(mapKey, sk.effects);
                              commitDraft(mapKey);
                            }}
                          >
                            新增 / 套用
                          </button>
                          <button
                            className="px-2 py-1 bg-rose-200 rounded text-sm"
                            onClick={() => {
                              if (
                                confirm("確定要刪除此技能的所有 Effects 嗎？")
                              ) {
                                deleteAllEffectsFromSkill(mapKey);
                              }
                            }}
                          >
                            刪除（全部）
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-slate-600">增/減益</div>
                        <div className="mt-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!draft?.applyBuff}
                              onChange={(e) => {
                                initDraftIfMissing(mapKey, sk.effects);
                                if (e.target.checked) {
                                  enableApplyBuffInDraft(mapKey);
                                } else {
                                  disableApplyBuffInDraft(mapKey);
                                }
                              }}
                            />
                            <span className="text-xs">啟用增/減益效果</span>
                          </label>

                          {draft?.applyBuff && (
                            <div className="mt-2 space-y-2">
                              <div className="flex gap-2 items-center">
                                <div className="w-20 text-xs">對</div>
                                <select
                                  value={draft.applyBuff.to}
                                  onChange={(e) =>
                                    setDraftValue(
                                      mapKey,
                                      "applyBuff.to",
                                      e.target.value
                                    )
                                  }
                                  className="border rounded px-2 py-1"
                                >
                                  <option value="self">自身</option>
                                  <option value="unit">單位</option>
                                  <option value="area">範圍</option>
                                </select>
                              </div>

                              <div className="flex gap-2 items-center">
                                <div className="w-20 text-xs">增/減益名稱</div>
                                <input
                                  className="border rounded px-2 py-1 w-40"
                                  value={draft.applyBuff.buff?.name ?? ""}
                                  onChange={(e) =>
                                    setDraftValue(
                                      mapKey,
                                      "applyBuff.buff.name",
                                      e.target.value
                                    )
                                  }
                                />
                              </div>

                              <div className="flex gap-2 items-center">
                                <div className="w-20 text-xs">回合數</div>
                                <input
                                  type="number"
                                  className="border rounded px-2 py-1 w-20"
                                  value={draft.applyBuff.buff?.turns ?? 1}
                                  onChange={(e) =>
                                    setDraftValue(
                                      mapKey,
                                      "applyBuff.buff.turns",
                                      Number(e.target.value)
                                    )
                                  }
                                />
                              </div>

                              <div className="text-xs text-slate-600 mt-1">
                                基礎加成
                              </div>
                              {draft.applyBuff.buff?.add &&
                                Object.entries(draft.applyBuff.buff.add).map(
                                  ([k, v]: any) => (
                                    <div
                                      key={k}
                                      className="flex gap-2 items-center"
                                    >
                                      <div className="w-20 text-xs">
                                        {statLabel(k)}
                                      </div>
                                      <input
                                        type="number"
                                        className="border rounded px-2 py-1 w-28"
                                        value={v as any}
                                        onChange={(e) =>
                                          setDraftValue(
                                            mapKey,
                                            `applyBuff.buff.add.${k}`,
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </div>
                                  )
                                )}
                              <div className="flex gap-2 mt-2">
                                <select
                                  id={`ab_add_key_${idx}`}
                                  className="border rounded px-2 py-1 text-sm"
                                  defaultValue="ATK"
                                >
                                  <option value="ATK">攻擊</option>
                                  <option value="DEF">防禦</option>
                                  <option value="MATK">魔攻</option>
                                  <option value="MDEF">魔防</option>
                                  <option value="CR">暴率</option>
                                  <option value="BLK">格擋</option>
                                  <option value="ACC">命中</option>
                                  <option value="EVA">迴避</option>
                                  <option value="SPD">速度</option>
                                  <option value="MOV">移動</option>
                                </select>
                                <input
                                  id={`ab_add_val_${idx}`}
                                  defaultValue={0}
                                  type="number"
                                  className="border rounded px-2 py-1 w-20"
                                />
                                <button
                                  className="px-2 py-1 bg-emerald-600 text-white rounded"
                                  onClick={() => {
                                    const k = (
                                      document.getElementById(
                                        `ab_add_key_${idx}`
                                      ) as HTMLSelectElement
                                    ).value;
                                    const v = Number(
                                      (
                                        document.getElementById(
                                          `ab_add_val_${idx}`
                                        ) as HTMLInputElement
                                      ).value || 0
                                    );
                                    setDraftValue(
                                      mapKey,
                                      `applyBuff.buff.add.${k}`,
                                      v
                                    );
                                  }}
                                >
                                  新增
                                </button>
                              </div>

                              <div className="text-xs text-slate-600 mt-2">
                                倍率加成
                              </div>
                              {draft.applyBuff.buff?.mul &&
                                Object.entries(draft.applyBuff.buff.mul).map(
                                  ([k, v]: any) => (
                                    <div
                                      key={k}
                                      className="flex gap-2 items-center"
                                    >
                                      <div className="w-20 text-xs">
                                        {statLabel(k)}
                                      </div>
                                      <input
                                        type="number"
                                        step="0.01"
                                        className="border rounded px-2 py-1 w-28"
                                        value={v as any}
                                        onChange={(e) =>
                                          setDraftValue(
                                            mapKey,
                                            `applyBuff.buff.mul.${k}`,
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </div>
                                  )
                                )}
                              <div className="flex gap-2 mt-2">
                                <select
                                  id={`ab_mul_key_${idx}`}
                                  className="border rounded px-2 py-1 text-sm"
                                  defaultValue="ATK"
                                >
                                  <option value="ATK">攻擊</option>
                                  <option value="DEF">防禦</option>
                                  <option value="MATK">魔攻</option>
                                  <option value="MDEF">魔防</option>
                                  <option value="ACC">命中</option>
                                  <option value="EVA">迴避</option>
                                  <option value="SPD">速度</option>
                                </select>
                                <input
                                  id={`ab_mul_val_${idx}`}
                                  defaultValue={1.1}
                                  type="number"
                                  step="0.01"
                                  className="border rounded px-2 py-1 w-20"
                                />
                                <button
                                  className="px-2 py-1 bg-emerald-600 text-white rounded"
                                  onClick={() => {
                                    const k = (
                                      document.getElementById(
                                        `ab_mul_key_${idx}`
                                      ) as HTMLSelectElement
                                    ).value;
                                    const v = Number(
                                      (
                                        document.getElementById(
                                          `ab_mul_val_${idx}`
                                        ) as HTMLInputElement
                                      ).value || 1
                                    );
                                    setDraftValue(
                                      mapKey,
                                      `applyBuff.buff.mul.${k}`,
                                      v
                                    );
                                  }}
                                >
                                  新增
                                </button>
                              </div>

                              <div className="flex gap-2 items-center mt-2">
                                <div className="w-20 text-xs">最終傷害</div>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="border rounded px-2 py-1 w-28"
                                  value={
                                    (draft.applyBuff.buff?.postDMG ?? "") as any
                                  }
                                  onChange={(e) =>
                                    setDraftValue(
                                      mapKey,
                                      "applyBuff.buff.postDMG",
                                      Number(e.target.value)
                                    )
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Raw effects JSON（只顯示 template 的 preview；若要從 draft 套用請按新增） */}
                      <div>
                        <div className="text-xs text-slate-600">效果預覽</div>
                        <textarea
                          className="w-full border rounded p-2 text-sm font-mono mt-2"
                          rows={10}
                          value={
                            effectsText[mapKey] ??
                            JSON.stringify(sk.effects ?? {}, null, 2)
                          }
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showRawJSON && (
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">
            Raw JSON（若下載失敗，請手動複製）
          </div>
          <textarea
            className="w-full h-64 border rounded p-2 font-mono text-sm"
            value={JSON.stringify(templates, null, 2)}
            readOnly
          />
        </div>
      )}
    </div>
  );
}

export default ManageTemplates;
