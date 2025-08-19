import { clamp, rnd, facingDir, newId, diceKey } from "./utils";
import {
  Team,
  Unit,
  UnitTemplate,
  StatKey,
  GameState,
  Skill,
  BuffSpec,
  AttackType,
} from "./types";
import { Templates, CLASS_LIST, SHORT, ClassKey } from "./templates";

export const CRIT_DMG = 1.5;
export const CR_CAP = 0.4;
export const HIT_SLOPE = 0.4;
export const KP = 1.0;
export const KM = 1.0;

// simple map helpers
export function inBounds(gs: GameState, x: number, y: number) {
  return x >= 0 && y >= 0 && x < gs.width && y < gs.height;
}
export function unitAt(gs: GameState, x: number, y: number) {
  return gs.units.find((u) => u.alive && u.x === x && u.y === y);
}
export function manhattan(
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// movement / area
export function getReachable(gs: GameState, u: Unit) {
  const move = Math.max(1, Math.floor(getStat(u, "MOV")));
  const visited = new Set<string>();
  const res: { x: number; y: number }[] = [];
  const q: { x: number; y: number; d: number }[] = [{ x: u.x, y: u.y, d: 0 }];
  visited.add(`${u.x},${u.y}`);
  while (q.length) {
    const cur = q.shift()!;
    if (cur.d > 0) res.push({ x: cur.x, y: cur.y });
    if (cur.d === move) continue;
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const d of dirs) {
      const nx = cur.x + d.dx,
        ny = cur.y + d.dy,
        key = `${nx},${ny}`;
      if (!inBounds(gs, nx, ny)) continue;
      if (visited.has(key)) continue;
      const occ = unitAt(gs, nx, ny);
      if (occ && occ.alive) continue;
      visited.add(key);
      q.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return res;
}

export function getLineTiles(gs: GameState, u: Unit, rangeFront: number) {
  const tiles: { x: number; y: number }[] = [];
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  for (const d of dirs) {
    for (let r = 1; r <= rangeFront; r++) {
      const x = u.x + d.dx * r,
        y = u.y + d.dy * r;
      if (!inBounds(gs, x, y)) break;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

export function getRectTiles(
  gs: GameState,
  u: Unit,
  rectW: number,
  rectD: number
) {
  const tiles: { x: number; y: number }[] = [];
  const dir = facingDir(u.team);
  const half = Math.floor((rectW - 1) / 2);
  for (let d = 1; d <= rectD; d++) {
    const x = u.x + dir * d;
    for (let w = -half; w <= half + (rectW % 2 === 0 ? 1 : 0); w++) {
      const y = u.y + w;
      if (inBounds(gs, x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}

export function getSelfMovTiles(gs: GameState, u: Unit) {
  const R = Math.max(1, Math.floor(getStat(u, "MOV")));
  const tiles: { x: number; y: number }[] = [];
  for (
    let x = Math.max(0, u.x - R);
    x <= Math.min(gs.width - 1, u.x + R);
    x++
  ) {
    for (
      let y = Math.max(0, u.y - R);
      y <= Math.min(gs.height - 1, u.y + R);
      y++
    ) {
      if (manhattan(u, { x, y }) <= R) tiles.push({ x, y });
    }
  }
  return tiles;
}

export function getAreaTiles(gs: GameState, u: Unit, sk: Skill) {
  if (sk.area.kind === "Line") return getLineTiles(gs, u, sk.rangeFront);
  if (sk.area.kind === "Rect")
    return getRectTiles(gs, u, sk.area.rectW, sk.area.rectD);
  return getSelfMovTiles(gs, u);
}

// stats & buffs
export function buildBaseFromTemplate(tpl: UnitTemplate) {
  const base: Record<StatKey, number> = {
    ATK: tpl.ATK,
    DEF: tpl.DEF,
    MATK: tpl.MATK,
    MDEF: tpl.MDEF,
    ACC: tpl.ACC,
    EVA: tpl.EVA,
    CR: tpl.CR,
    SPD: tpl.SPD,
    MOV: tpl.MOV,
    BLK: tpl.BLK,
    mpRegen: 3,
  };
  const p = tpl.passive || {};
  const baseAdd = { ...(p.baseAdd || {}) } as Record<string, number>;
  if (p.addCR) baseAdd.CR = (baseAdd.CR || 0) + p.addCR;
  const baseMul = { ...(p.baseMul || {}) } as Record<string, number>;
  if (p.defMul) baseMul.DEF = (baseMul.DEF || 1) * p.defMul;

  (Object.keys(base) as StatKey[]).forEach((k) => {
    if ((baseAdd as any)[k] != null) base[k] += (baseAdd as any)[k];
    if ((baseMul as any)[k] != null) base[k] *= (baseMul as any)[k];
  });

  base.CR = clamp(base.CR, 0, CR_CAP);
  base.BLK = clamp(base.BLK, 0, 0.4);

  return base;
}

export function createUnit(
  id: string,
  team: Team,
  tpl: UnitTemplate,
  x: number,
  y: number
) {
  const base = buildBaseFromTemplate(tpl);
  const postDR = tpl.passive.postDR || {};
  const finalDRBase = {
    physical: (tpl.finalDR.physical ?? 1) * (postDR.physical ?? 1),
    magical: (tpl.finalDR.magical ?? 1) * (postDR.magical ?? 1),
  };
  return {
    id,
    team,
    x,
    y,
    base,
    maxHP: tpl.maxHP,
    maxMP: tpl.maxMP,
    hp: tpl.maxHP,
    mp: tpl.maxMP,
    cls: tpl.cls,
    skills: tpl.skills,
    finalDRBase,
    buffs: [],
    alive: true,
    actedThisTurn: false,
    movedThisTurn: false,
  } as Unit;
}

export function getStat(u: Unit, key: StatKey) {
  let v = u.base[key];
  for (const b of u.buffs) if (b.add && b.add[key] != null) v += b.add[key]!;
  let mul = 1;
  for (const b of u.buffs) if (b.mul && b.mul[key] != null) mul *= b.mul[key]!;
  v *= mul;
  if (key === "CR") v = clamp(v, 0, CR_CAP);
  if (key === "BLK") v = clamp(v, 0, 0.4);
  return v;
}

export function getPostDR(u: Unit, type: AttackType) {
  let v = type === "Physical" ? u.finalDRBase.physical : u.finalDRBase.magical;
  for (const b of u.buffs)
    if (b.postDR)
      v *= type === "Physical" ? b.postDR.physical ?? 1 : b.postDR.magical ?? 1;
  return v;
}

export function getPostDMG(u: Unit) {
  let v = 1;
  for (const b of u.buffs) if (b.postDMG != null) v *= b.postDMG;
  return v;
}

export function addBuff(u: Unit, spec: BuffSpec) {
  if (!spec.turns || spec.turns <= 0) return;
  u.buffs.push({ ...spec, id: newId() });
}

export function tickBuffsAll(gs: GameState) {
  for (const u of gs.units) {
    if (!u.alive) continue;
    for (const b of u.buffs) b.turns -= 1;
    u.buffs = u.buffs.filter((b) => b.turns > 0);
  }
}

// combat
export function effectiveCR(attacker: Unit) {
  return clamp(getStat(attacker, "CR"), 0, CR_CAP);
}

export function computeHitRate(attACC: number, defEVA: number) {
  let hit = clamp(95 + HIT_SLOPE * (attACC - defEVA), 40, 100);
  return hit;
}

export function rollHit(attacker: Unit, defender: Unit) {
  let hit = clamp(
    95 + HIT_SLOPE * (getStat(attacker, "ACC") - getStat(defender, "EVA")),
    40,
    100
  );
  const ok = Math.random() * 100 < hit;
  return { ok, hitPct: hit };
}

export function defenseMult(
  type: AttackType,
  atkStat: number,
  defStat: number
) {
  return (
    0.4 +
    0.6 * (atkStat / (atkStat + (type === "Physical" ? KP : KM) * defStat))
  );
}

export function resolveAttack(
  gs: GameState,
  attacker: Unit,
  defender: Unit,
  skill: Skill
) {
  const type = skill.type;
  const atk =
    type === "Physical"
      ? getStat(attacker, "ATK")
      : getStat(attacker, "MATK") / 4;
  const def =
    type === "Physical"
      ? getStat(defender, "DEF")
      : getStat(defender, "MDEF") / 4;

  const { ok: hitOk, hitPct } = rollHit(attacker, defender);
  if (!hitOk)
    return {
      damage: 0,
      text: `Miss (${hitPct.toFixed(0)}%)`,
      blocked: false,
      crit: false,
    };

  const blkCap = getStat(defender, "BLK");
  const blocked = type === "Physical" && Math.random() < blkCap;

  const base = atk * (1 + skill.multiplier);
  const mult = defenseMult(type, atk, def);
  let dmg = base * mult;

  let crit = false;
  if (!blocked) {
    const cr = effectiveCR(attacker);
    if (Math.random() < cr) {
      crit = true;
      dmg *= CRIT_DMG;
    }
  }

  dmg *= rnd(0.95, 1.05);
  if (blocked) dmg *= 0.5;

  dmg *= getPostDMG(attacker);
  dmg *= getPostDR(defender, type);

  const out = Math.max(1, Math.floor(dmg));
  return {
    damage: out,
    text: `${blocked ? "BLOCK " : ""}${crit ? "CRIT " : ""}${out}`.trim(),
    blocked,
    crit,
  };
}

export function applyDamage(gs: GameState, target: Unit, dmg: number) {
  target.hp = Math.max(0, target.hp - dmg);
  if (target.hp === 0) {
    target.alive = false;
  }
}

// turn/order
export function recomputeTurnOrder(
  gs: GameState,
  forced?: Record<string, number>
) {
  if (!(gs as any).rSPD) (gs as any).rSPD = {};
  const alive = gs.units.filter((u) => u.alive);
  if (forced) {
    for (const u of alive) gs.rSPD[u.id] = forced[u.id] ?? getStat(u, "SPD");
  } else {
    for (const u of alive)
      gs.rSPD[u.id] = getStat(u, "SPD") + (Math.floor(Math.random() * 5) - 2);
  }
  const dice: Record<string, string> = {};
  for (const u of alive) dice[u.id] = diceKey();
  gs.turnOrder = alive
    .sort((a, b) => {
      const ra = gs.rSPD[a.id];
      const rb = gs.rSPD[b.id];
      if (rb !== ra) return rb - ra;
      const sa = a.base.SPD,
        sb = b.base.SPD;
      if (sb !== sa) return sb - sa;
      if (dice[b.id] !== dice[a.id]) return dice[b.id] > dice[a.id] ? 1 : -1;
      return a.id.localeCompare(b.id);
    })
    .map((u) => u.id);
  gs.turnIndex = 0;
  for (const u of gs.units) {
    u.actedThisTurn = false;
    u.movedThisTurn = false;
  }
}

export function currentUnit(gs: GameState) {
  const id = gs.turnOrder[gs.turnIndex];
  return gs.units.find((u) => u.id === id && u.alive);
}

export function endOfRound(gs: GameState) {
  for (const u of gs.units) {
    if (!u.alive) continue;
    const regen = Math.round(getStat(u, "mpRegen"));
    u.mp = clamp(u.mp + regen, 0, u.maxMP);
    u.movedThisTurn = false;
    u.actedThisTurn = false;
  }
  tickBuffsAll(gs);
  recomputeTurnOrder(gs);
}

export function skipToAlive(gs: GameState) {
  let guard = 0;
  while (!currentUnit(gs) && guard++ < 100) {
    gs.turnIndex++;
    if (gs.turnIndex >= gs.turnOrder.length) endOfRound(gs);
  }
}

export function endTurn(gs: GameState) {
  gs.phase = "idle";
  gs.selectedSkillId = undefined;
  gs.selectedUnitId = undefined;
  gs.turnIndex++;
  if (gs.turnIndex >= gs.turnOrder.length) endOfRound(gs);
}

export function isTeamAlive(gs: GameState, team: Team) {
  return gs.units.some((u) => u.alive && u.team === team);
}

// AI & target collection
export function collectTargets(
  gs: GameState,
  caster: Unit,
  skill: Skill,
  clicked: { x: number; y: number }
) {
  const wantEnemy = skill.targetTeam === "enemy" || skill.targetTeam === "both";
  const wantAlly = skill.targetTeam === "ally" || skill.targetTeam === "both";

  function include(u: Unit) {
    if (!u.alive) return false;
    if (
      u.id === caster.id &&
      skill.targetGroup === "single" &&
      skill.effects?.applyBuff?.to !== "self"
    ) {
      // do nothing special
    }
    const isEnemy = u.team !== caster.team;
    const isAlly = u.team === caster.team;
    return (wantEnemy && isEnemy) || (wantAlly && isAlly);
  }

  if (skill.area.kind === "SelfMov") {
    const tiles = getSelfMovTiles(gs, caster);
    const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
    const list = gs.units.filter((u) => set.has(`${u.x},${u.y}`) && include(u));
    if (
      skill.targetGroup === "single" &&
      skill.effects?.applyBuff?.to === "self"
    )
      return [caster];
    return list;
  }

  if (skill.area.kind === "Rect") {
    const tiles = getRectTiles(gs, caster, skill.area.rectW, skill.area.rectD);
    if (!tiles.find((t) => t.x === clicked.x && t.y === clicked.y)) return [];
    const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
    return gs.units.filter((u) => set.has(`${u.x},${u.y}`) && include(u));
  }

  // Line
  const aligned = clicked.x === caster.x || clicked.y === caster.y;
  if (!aligned) return [];
  const dx = Math.sign(clicked.x - caster.x);
  const dy = Math.sign(clicked.y - caster.y);
  if (dx !== 0 && dy !== 0) return [];
  const tiles: { x: number; y: number }[] = [];
  for (let r = 1; r <= skill.rangeFront; r++) {
    const x = caster.x + dx * r,
      y = caster.y + dy * r;
    if (!inBounds(gs, x, y)) break;
    tiles.push({ x, y });
  }
  const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const inLine = gs.units.filter((u) => set.has(`${u.x},${u.y}`) && include(u));
  if (skill.targetGroup === "single") {
    const u = unitAt(gs, clicked.x, clicked.y);
    return u && include(u) ? [u] : [];
  }
  return inLine;
}

export function doCast(
  gs: GameState,
  caster: Unit,
  sk: Skill,
  targets: Unit[]
) {
  if (caster.mp < sk.mpCost) return;
  for (const t of targets) {
    if (sk.multiplier > 0 || sk.isBasic) {
      if (t.team !== caster.team) {
        const r = resolveAttack(gs, caster, t, sk);
        applyDamage(gs, t, r.damage);
      }
    }
    if (sk.effects?.healHP && t.team === caster.team) {
      t.hp = clamp(t.hp + sk.effects.healHP, 0, t.maxHP);
    }
    if (sk.effects?.restoreMP && t.team === caster.team) {
      t.mp = clamp(t.mp + sk.effects.restoreMP, 0, t.maxMP);
    }
    if (sk.effects?.applyBuff) {
      if (sk.effects.applyBuff.to === "self")
        addBuff(caster, sk.effects.applyBuff.buff);
      else addBuff(t, sk.effects.applyBuff.buff);
    }
  }
  caster.mp = clamp(caster.mp - sk.mpCost, 0, caster.maxMP);
}

export function aiTakeTurn(gs: GameState) {
  const u = currentUnit(gs);
  if (!u) {
    skipToAlive(gs);
    return;
  }
  if (!u.alive) {
    endTurn(gs);
    return;
  }
  const basic = u.skills.find((s) => s.isBasic)!;
  const actives = u.skills.filter((s) => !s.isBasic && u.mp >= s.mpCost);
  const skillsToTry: Skill[] = [basic, ...actives];

  const candidates = [{ x: u.x, y: u.y }, ...getReachable(gs, u)];
  const areaScore = (list: Unit[], sk: Skill) => {
    let score = 0;
    for (const t of list) {
      if (t.team !== u.team) {
        const r = resolveAttack(gs, u, t, sk);
        score += r.damage;
      }
    }
    if (sk.effects?.healHP || sk.effects?.restoreMP) {
      for (const t of list) {
        if (t.team === u.team)
          score += (sk.effects.healHP || 0) + (sk.effects.restoreMP || 0) * 10;
      }
    }
    return score;
  };

  let best: null | {
    moveTo: { x: number; y: number };
    skill: Skill;
    targets: Unit[];
    est: number;
  } = null;

  for (const pos of candidates) {
    const old = { x: u.x, y: u.y };
    u.x = pos.x;
    u.y = pos.y;
    for (const sk of skillsToTry) {
      const tiles = getAreaTiles(gs, u, sk);
      for (const tile of tiles.length ? tiles : [{ x: u.x, y: u.y }]) {
        const targets = collectTargets(gs, u, sk, tile);
        if (!targets.length) continue;
        const score = areaScore(targets, sk);
        if (!best || score > best.est)
          best = {
            moveTo: { x: pos.x, y: pos.y },
            skill: sk,
            targets,
            est: score,
          };
      }
    }
    u.x = old.x;
    u.y = old.y;
  }

  if (best) {
    if (best.moveTo.x !== u.x || best.moveTo.y !== u.y) {
      u.x = best.moveTo.x;
      u.y = best.moveTo.y;
      u.movedThisTurn = true;
    }
    doCast(gs, u, best.skill, best.targets);
    endTurn(gs);
    return;
  }

  const moveTiles = getReachable(gs, u);
  if (moveTiles.length) {
    const enemies = gs.units.filter((x) => x.alive && x.team !== u.team);
    const bestTile = moveTiles.sort((a, b) => {
      const da = Math.min(...enemies.map((e) => manhattan(a, e)));
      const db = Math.min(...enemies.map((e) => manhattan(b, e)));
      if (da !== db) return da - db;
      const dir = facingDir(u.team);
      return -(dir * (a.x - b.x));
    })[0];
    if (bestTile) {
      u.x = bestTile.x;
      u.y = bestTile.y;
      u.movedThisTurn = true;
    }
  }
  endTurn(gs);
}

// init helpers
const START_ROWS = [1, 3, 5, 7];
export function createTeamUnits(
  team: Team,
  classList: ClassKey[],
  width: number
) {
  const x = team === "A" ? 1 : width - 2;
  return classList
    .slice(0, 4)
    .map((cls, i) =>
      createUnit(
        `${team}_${SHORT[cls]}${i + 1}`,
        team,
        Templates[cls],
        x,
        START_ROWS[i]
      )
    );
}

export function initGameWithRosters(
  mode: "PvP" | "PvE",
  p1: ClassKey[],
  p2: ClassKey[]
) {
  const width = 12,
    height = 9;
  const units = [
    ...createTeamUnits("A", p1, width),
    ...createTeamUnits("B", p2, width),
  ];
  const s: GameState = {
    width,
    height,
    units,
    rSPD: {},
    turnOrder: [],
    turnIndex: 0,
    phase: "idle",
    selectedUnitId: undefined,
    selectedSkillId: undefined,
    mode,
  };
  recomputeTurnOrder(s);
  return s;
}

// a small self-test loader (returns string[])
export function runSelfTests(): string[] {
  const results: string[] = [];
  const pass = (name: string, ok: boolean, extra: string = "") =>
    results.push(
      `${ok ? "PASS" : "FAIL"} - ${name}${extra ? ": " + extra : ""}`
    );

  const hitLow = computeHitRate(50, 200);
  const hitHigh = computeHitRate(200, 50);
  pass("Hit 下限 >=40%", hitLow >= 40 - 1e-9, `got ${hitLow}`);
  pass("Hit 上限 <=100%", hitHigh <= 100 + 1e-9, `got ${hitHigh}`);

  const archer = createUnit("A", "A", Templates.Archer, 0, 0);
  pass(
    "CR cap 40%",
    Math.abs(getStat(archer, "CR") - 0.3) < 1e-9 || getStat(archer, "CR") <= 0.4
  );

  const multMin = defenseMult("Physical", 100, 999999);
  pass(
    "防禦乘數最小不低於 0.4",
    multMin >= 0.4 && multMin < 0.401,
    `got ${multMin.toFixed(3)}`
  );

  const gs: GameState = {
    width: 5,
    height: 5,
    units: [],
    rSPD: {},
    turnOrder: [],
    turnIndex: 0,
    phase: "idle",
    mode: "PvP",
  } as any;
  const rogue = createUnit("R", "A", Templates.Rogue, 2, 2);
  const swd = createUnit("S", "A", Templates.Swordsman, 2, 2);
  const r1 = getReachable(gs, swd);
  const r2 = getReachable(gs, rogue);
  pass(
    "劍士 MOV=2 範圍小於等於2",
    r1.every((t) => manhattan({ x: 2, y: 2 }, t) <= 2)
  );
  pass(
    "盜賊 MOV=4 範圍包含距離4",
    r2.some((t) => manhattan({ x: 2, y: 2 }, t) === 4)
  );

  const dummyGS: GameState = {
    width: 5,
    height: 5,
    units: [],
    rSPD: {},
    turnOrder: [],
    turnIndex: 0,
    phase: "idle",
    mode: "PvP",
  } as any;
  const dummy = createUnit("X", "A", Templates.Swordsman, 2, 2);
  const tiles = getLineTiles(dummyGS, dummy, 2);
  const expected = [
    { x: 3, y: 2 },
    { x: 4, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 2 },
    { x: 2, y: 3 },
    { x: 2, y: 4 },
    { x: 2, y: 1 },
    { x: 2, y: 0 },
  ];
  const okTiles = expected.every((t) =>
    tiles.find((p) => p.x === t.x && p.y === t.y)
  );
  pass("直線四向（含上下）", okTiles, `got ${tiles.length} tiles`);

  const a = createUnit("A1", "A", Templates.Rogue, 0, 0);
  const b = createUnit("B1", "A", Templates.Archer, 0, 0);
  const gs3: GameState = {
    width: 3,
    height: 3,
    units: [a, b],
    rSPD: {},
    turnOrder: [],
    turnIndex: 0,
    phase: "idle",
    mode: "PvP",
  };
  recomputeTurnOrder(gs3, { A1: 15, B1: 15 });
  pass(
    "同 rSPD 看 SPD：盜賊(16) 先於 弓手(14)",
    gs3.turnOrder[0] === "A1",
    `order=${gs3.turnOrder.join(",")}`
  );

  const gs4: GameState = {
    width: 3,
    height: 3,
    units: [a, b],
    rSPD: {},
    turnOrder: [],
    turnIndex: 0,
    phase: "idle",
    mode: "PvP",
  };
  recomputeTurnOrder(gs4, { A1: 14, B1: 16 });
  pass(
    "rSPD 大者先：弓手(16) 先於 盜賊(14)",
    gs4.turnOrder[0] === "B1",
    `order=${gs4.turnOrder.join(",")}`
  );

  const adm = createUnit("Adm", "A", Templates.ADMIN, 1, 1);
  const beforeSPD = getStat(adm, "SPD"),
    beforeMOV = getStat(adm, "MOV");
  addBuff(adm, { name: "測速", turns: 1, add: { SPD: 2, MOV: 1 } });
  pass("Admin Buff SPD+2", getStat(adm, "SPD") === beforeSPD + 2);
  pass("Admin Buff MOV+1", getStat(adm, "MOV") === beforeMOV + 1);

  return results;
}
